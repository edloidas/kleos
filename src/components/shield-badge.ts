import {
  ACESFilmicToneMapping,
  BackSide,
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { Texture } from 'three';

import type { ArtworkOptions } from './shield/artwork';
import type { ShapeOptions } from './shield/geometry';
import { createShieldModel } from './shield/model';
import { createShieldMotion } from './shield/motion';

export interface ShieldBadgeOptions extends Partial<ArtworkOptions>, Partial<ShapeOptions> {
  front: string;
  back: string;
  /** Idle spin, rad/s. */
  autoSpeed?: number;
  autoSpin?: boolean;
  onFrame?: (frame: { angle: number; bob: number }) => void;
}

export interface ShieldBadge {
  ready: Promise<void>;
  setAutoSpin(value: boolean): void;
  /** Stops the spin and brings the front round, or resumes a stopped spin. */
  toggleSpin(): void;
  nudge(delta: number): void;
  dispose(): void;
}

// r155 dropped the legacy light units; punctual lights need π to keep the r128 look.
const LEGACY_LIGHT_SCALE = Math.PI;

const TAP_PX = 5;
const TAP_MS = 350;

// Past roughly a segment per drawn pixel the extra vertices cost mobile a visible
// pause and change nothing on screen, which is what the caps are for.
function detailFor(container: HTMLElement, pixelRatio: number) {
  const radiusPx =
    (Math.min(container.clientWidth, container.clientHeight) * pixelRatio * 0.82) / 2;
  const rings = Math.max(48, Math.min(120, Math.round(radiusPx * 0.45)));
  const segments = Math.max(96, Math.min(320, Math.round(rings * 1.6)));

  return { rings, segments };
}

/** Studio softboxes, so the metal has something to reflect. */
function buildEnvironment(renderer: WebGLRenderer): Texture {
  const env = new Scene();
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;

  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0.0, '#9a9a9a');
  gradient.addColorStop(0.45, '#3a3a3a');
  gradient.addColorStop(0.55, '#262626');
  gradient.addColorStop(1.0, '#070707');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 16, 256);

  const skyTexture = new CanvasTexture(canvas);
  const disposables: { dispose(): void }[] = [skyTexture];
  const sky = new Mesh(
    new SphereGeometry(40, 32, 16),
    new MeshBasicMaterial({ map: skyTexture, side: BackSide }),
  );
  env.add(sky);
  disposables.push(sky.geometry, sky.material);

  const panel = (w: number, h: number, pos: [number, number, number], strength: number) => {
    const material = new MeshBasicMaterial({ side: DoubleSide });
    material.color.setScalar(strength);
    const plane = new Mesh(new PlaneGeometry(w, h), material);
    plane.position.set(...pos);
    plane.lookAt(0, 0, 0);
    env.add(plane);
    disposables.push(plane.geometry, material);
  };

  panel(14, 8, [-9, 12, 10], 3.2); // big key softbox, top-left-front
  panel(3, 22, [16, 2, 4], 2.4); // tall strip, right
  panel(10, 4, [4, -6, 14], 0.9); // low fill, front
  panel(12, 12, [0, 6, -18], 1.6); // back light, for the reverse side
  panel(3, 16, [-16, 0, -6], 1.8); // strip, back-left

  const pmrem = new PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  for (const disposable of disposables) disposable.dispose();

  return texture;
}

/** Owns the canvas and the clock; the coin and its physics are `./shield/*`. */
export function createShieldBadge(
  container: HTMLElement,
  options: ShieldBadgeOptions,
): ShieldBadge {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const o = {
    size: 256,
    thickness: 0.07,
    dome: 0.1,
    relief: 0.03,
    concave: 0.085,
    handleLift: 0.12,
    handleArch: 0.6,
    rimBulge: 0.035,
    autoSpeed: 0.85,
    autoSpin: true,
    ...detailFor(container, renderer.getPixelRatio()),
    ...options,
  };

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 4.6);

  const envTexture = buildEnvironment(renderer);
  scene.environment = envTexture;

  const key = new DirectionalLight(0xfff3dd, 1.1 * LEGACY_LIGHT_SCALE);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new DirectionalLight(0xffffff, 0.6 * LEGACY_LIGHT_SCALE);
  rim.position.set(4, -1, -4);
  scene.add(rim);

  const model = createShieldModel({
    ...o,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
  });
  scene.add(model.group);

  const motion = createShieldMotion({ autoSpin: o.autoSpin, autoSpeed: o.autoSpeed });
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const el = renderer.domElement;
  let dragging = false,
    lastX = 0,
    downX = 0,
    downT = 0;

  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = downX = e.clientX;
    downT = performance.now();
    motion.beginDrag();
    el.setPointerCapture(e.pointerId);
    start();
  };
  const onMove = (e: PointerEvent) => {
    const rect = el.getBoundingClientRect();
    motion.setTiltTarget(((e.clientY - rect.top) / rect.height - 0.5) * -0.35);
    if (!dragging) return;

    const dx = e.clientX - lastX;
    lastX = e.clientX;
    motion.dragBy((dx / rect.width) * Math.PI * 1.6, performance.now());
    start();
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    motion.endDrag(performance.now());

    if (Math.abs(e.clientX - downX) < TAP_PX && performance.now() - downT < TAP_MS) {
      motion.toggleSpin(performance.now());
      start();
    }
  };
  // The container allows vertical panning, so a cancel is the page scrolling, not a tap.
  const onCancel = () => {
    dragging = false;
    motion.endDrag(performance.now());
  };
  const onLeave = () => {
    motion.setTiltTarget(0);
    start();
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('pointerleave', onLeave);

  const resize = () => {
    const w = container.clientWidth,
      h = container.clientHeight;
    if (!w || !h) return;

    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let raf = 0,
    last = performance.now(),
    disposed = false,
    loaded = false,
    visible = true;

  function frame(now: number) {
    if (disposed || !visible) {
      raf = 0;
      return;
    }

    const deltaSeconds = Math.min(0.05, (now - last) / 1000);
    last = now;

    const pose = motion.advance({
      nowMs: now,
      deltaSeconds,
      reducedMotion: reduceMotion.matches,
    });
    model.group.rotation.set(pose.pitch, pose.angle, 0);
    model.group.position.y = pose.bob;

    o.onFrame?.({ angle: pose.angle, bob: pose.bob });
    renderer.render(scene, camera);

    // Ends rather than redrawing an identical frame; any interaction calls start().
    if (pose.settled) {
      raf = 0;
      return;
    }

    raf = requestAnimationFrame(frame);
  }

  const start = () => {
    if (raf || disposed || !loaded || !visible) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  // An off-screen badge would otherwise keep a WebGL draw running every frame.
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    start();
  });
  io.observe(container);

  const ready = model.ready.then(() => {
    if (disposed) return;
    loaded = true;
    start();
  });

  return {
    ready,
    setAutoSpin(value) {
      motion.setAutoSpin(value, performance.now());
      start();
    },
    toggleSpin() {
      motion.toggleSpin(performance.now());
      start();
    },
    nudge(delta) {
      motion.nudge(delta, performance.now());
      start();
    },
    dispose() {
      if (disposed) return;
      disposed = true;

      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);

      model.dispose();
      envTexture.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}
