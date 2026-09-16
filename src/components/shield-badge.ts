import {
  ACESFilmicToneMapping,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
} from 'three';

export interface ShieldBadgeOptions {
  front: string;
  back: string;
  /** Texture sample resolution. */
  size?: number;
  /** Radial resolution of the face mesh; derived from the rendered size when omitted. */
  rings?: number;
  /** Angular resolution; derived from the rendered size when omitted. */
  segments?: number;
  /** Half-thickness at the rim. */
  thickness?: number;
  /** How much the face bulges. */
  dome?: number;
  /** How high the gold is raised over the enamel. */
  relief?: number;
  /** How deep the back is hollowed; the shell follows the front dome. */
  concave?: number;
  /** How far the back handle stands off the hollow. */
  handleLift?: number;
  /** 0 is a flat slab, 1 a strap that arches between its rivets. */
  handleArch?: number;
  /** How round the edge band is. */
  rimBulge?: number;
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

type Sample = (u: number, v: number) => number;

interface Analysis {
  metalRough: HTMLCanvasElement;
  sample: Sample;
  colorSource: HTMLImageElement | HTMLCanvasElement;
}

// Maps mesh radius 1 to just inside the gold ring of the art.
const UVR = 0.492;

// r155 dropped the legacy light units; punctual lights need π to keep the r128 look.
const LEGACY_LIGHT_SCALE = Math.PI;

// Mesh detail from the drawn radius in device pixels: 170/440 is the full-size
// reference, and a 176px header badge needs about half of that.
function detailFor(container: HTMLElement, pixelRatio: number) {
  const radiusPx =
    (Math.min(container.clientWidth, container.clientHeight) * pixelRatio * 0.82) / 2;
  const rings = Math.max(60, Math.min(170, Math.round(radiusPx * 0.65)));
  const segments = Math.max(160, Math.min(440, Math.round(rings * 2.6)));
  return { rings, segments };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error(`Could not load ${src.slice(0, 60)}`)));
    img.src = src;
  });
}

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
    size: 512,
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

  // Studio softboxes, so the metal has something to reflect.
  function buildEnvironment() {
    const env = new Scene();
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#9a9a9a');
    grad.addColorStop(0.45, '#3a3a3a');
    grad.addColorStop(0.55, '#262626');
    grad.addColorStop(1.0, '#070707');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 256);
    const skyTex = new CanvasTexture(c);
    const disposables: { dispose(): void }[] = [skyTex];
    const sky = new Mesh(
      new SphereGeometry(40, 32, 16),
      new MeshBasicMaterial({ map: skyTex, side: BackSide }),
    );
    env.add(sky);
    disposables.push(sky.geometry, sky.material);
    const panel = (w: number, h: number, pos: [number, number, number], strength: number) => {
      const m = new MeshBasicMaterial({ side: DoubleSide });
      m.color.setScalar(strength);
      const p = new Mesh(new PlaneGeometry(w, h), m);
      p.position.set(...pos);
      p.lookAt(0, 0, 0);
      env.add(p);
      disposables.push(p.geometry, m);
    };
    panel(14, 8, [-9, 12, 10], 3.2); // big key softbox, top-left-front
    panel(3, 22, [16, 2, 4], 2.4); // tall strip, right
    panel(10, 4, [4, -6, 14], 0.9); // low fill, front
    panel(12, 12, [0, 6, -18], 1.6); // back light, for the reverse side
    panel(3, 16, [-16, 0, -6], 1.8); // strip, back-left
    const pmrem = new PMREMGenerator(renderer);
    const tex = pmrem.fromScene(env, 0.02).texture;
    pmrem.dispose();
    for (const d of disposables) d.dispose();
    return tex;
  }
  const envTexture = buildEnvironment();
  scene.environment = envTexture;

  const key = new DirectionalLight(0xfff3dd, 1.1 * LEGACY_LIGHT_SCALE);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new DirectionalLight(0xffffff, 0.6 * LEGACY_LIGHT_SCALE);
  rim.position.set(4, -1, -4);
  scene.add(rim);

  const group = new Group();
  scene.add(group);

  // Height and metal/rough maps read out of the flat art.
  function analyse(img: HTMLImageElement, isBack: boolean): Analysis {
    const N = o.size;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, N, N);
    const px = g.getImageData(0, 0, N, N).data;

    // "Goldness": bright, warm pixels are raised metal; dark ones are enamel.
    const gold = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const r = px[i * 4],
        gg = px[i * 4 + 1],
        b = px[i * 4 + 2],
        a = px[i * 4 + 3] / 255;
      const L = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
      let t = Math.min(1, Math.max(0, (L - 0.26) / 0.24));
      t = t * t * (3 - 2 * t);
      gold[i] = t * a;
    }

    // Box blur, for soft bevels on the relief.
    const blur = (src: Float32Array, rad: number) => {
      const tmp = new Float32Array(N * N),
        out = new Float32Array(N * N);
      const w = 2 * rad + 1;
      for (let y = 0; y < N; y++) {
        let s = 0;
        for (let x = -rad; x <= rad; x++) s += src[y * N + Math.min(N - 1, Math.max(0, x))];
        for (let x = 0; x < N; x++) {
          tmp[y * N + x] = s / w;
          s += src[y * N + Math.min(N - 1, x + rad + 1)] - src[y * N + Math.max(0, x - rad)];
        }
      }
      for (let x = 0; x < N; x++) {
        let s = 0;
        for (let y = -rad; y <= rad; y++) s += tmp[Math.min(N - 1, Math.max(0, y)) * N + x];
        for (let y = 0; y < N; y++) {
          out[y * N + x] = s / w;
          s += tmp[Math.min(N - 1, y + rad + 1) * N + x] - tmp[Math.max(0, y - rad) * N + x];
        }
      }
      return out;
    };
    const height = blur(blur(gold, 2), 2);

    // Back only: anything gold well inside the outer ring is the handle.
    let handleH: Float32Array | null = null;
    let vMin = 1,
      vMax = 0;
    let colorSource: HTMLImageElement | HTMLCanvasElement = img;
    if (isBack) {
      const mask = new Float32Array(N * N);
      const c0 = (N - 1) / 2,
        rLim = N * 0.5 * 0.8;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = y * N + x;
          if (Math.hypot(x - c0, y - c0) < rLim) {
            mask[i] = gold[i];
            height[i] = 0; // the handle gets its own, taller relief below
            if (gold[i] > 0.5) {
              const v = 1 - y / (N - 1);
              vMin = Math.min(vMin, v);
              vMax = Math.max(vMax, v);
            }
          }
        }
      }
      // Solid strap silhouette: fill the small cut-outs so the handle is one piece,
      // then keep the engraving as a shallow inset on top of it.
      const soft4 = blur(mask, 4);
      const solid = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) solid[i] = soft4[i] > 0.22 ? 1 : 0;
      const shape = blur(blur(solid, 1), 1);
      handleH = new Float32Array(N * N);
      const wall = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) {
        handleH[i] = shape[i] * (0.86 + 0.14 * mask[i]);
        // Pixels the strap covers that are not gold in the art: its side walls.
        wall[i] = solid[i] * (shape[i] < 0.97 ? 1 : 0);
        gold[i] = Math.max(gold[i], wall[i]); // walls are metal too
      }

      // Baked contact shadow on the enamel around the handle.
      const shadow = blur(blur(solid, 7), 7);
      const cc = document.createElement('canvas');
      cc.width = cc.height = N;
      const cg = cc.getContext('2d', { willReadFrequently: true })!;
      cg.drawImage(img, 0, 0, N, N);
      const cd = cg.getImageData(0, 0, N, N);
      for (let i = 0; i < N * N; i++) {
        if (wall[i] > 0) {
          // darker bronze for the strap's sides
          cd.data[i * 4] = 128;
          cd.data[i * 4 + 1] = 102;
          cd.data[i * 4 + 2] = 52;
          cd.data[i * 4 + 3] = 255;
          continue;
        }
        const k = 1 - 0.75 * Math.min(1, shadow[i] * 1.6) * (1 - shape[i]);
        cd.data[i * 4] *= k;
        cd.data[i * 4 + 1] *= k;
        cd.data[i * 4 + 2] *= k;
      }
      cg.putImageData(cd, 0, 0);
      colorSource = cc;
    }

    // Packed metal/rough map: G is roughness, B is metalness (three.js convention).
    const mc = document.createElement('canvas');
    mc.width = mc.height = N;
    const mg = mc.getContext('2d')!;
    const md = mg.createImageData(N, N);
    const soft = blur(gold, 1);
    for (let i = 0; i < N * N; i++) {
      const t = soft[i];
      // Cheap stamped metal: a bit rough, with faint brushed noise.
      const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const rough = 0.34 * t + 0.16 * (1 - t) + noise * 0.04;
      const metal = 1.0 * t + 0.02 * (1 - t);
      md.data[i * 4] = 255;
      md.data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, rough)) * 255);
      md.data[i * 4 + 2] = Math.round(metal * 255);
      md.data[i * 4 + 3] = 255;
    }
    mg.putImageData(md, 0, 0);

    const bilerp = (arr: Float32Array, u: number, v: number) => {
      const fx = u * (N - 1),
        fy = (1 - v) * (N - 1);
      const x0 = Math.max(0, Math.min(N - 2, Math.floor(fx)));
      const y0 = Math.max(0, Math.min(N - 2, Math.floor(fy)));
      const dx = fx - x0,
        dy = fy - y0;
      const h = (x: number, y: number) => arr[y * N + x];
      return (
        (h(x0, y0) * (1 - dx) + h(x0 + 1, y0) * dx) * (1 - dy) +
        (h(x0, y0 + 1) * (1 - dx) + h(x0 + 1, y0 + 1) * dx) * dy
      );
    };
    const vMid = (vMin + vMax) / 2,
      vHalf = Math.max(1e-3, (vMax - vMin) / 2);
    // Outward displacement of the surface at (u, v).
    const sample: Sample = (u, v) => {
      let d = o.relief * bilerp(height, u, v);
      if (handleH) {
        const t = Math.min(1, Math.abs(v - vMid) / vHalf);
        const arch = 1 - o.handleArch + o.handleArch * (1 - t * t);
        d += o.handleLift * arch * bilerp(handleH, u, v);
      }
      return d;
    };
    return { metalRough: mc, sample, colorSource };
  }

  // side is +1 for the front face, -1 for the back, whose UVs are mirrored so the art reads correctly.
  function buildFace(sample: Sample, side: 1 | -1) {
    const R = o.rings,
      S = o.segments;
    const count = 1 + R * S;
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const edgeZ = new Float32Array(S);
    const profile = (r: number) => Math.pow(1 - r * r, 0.85);
    // Front domes out; back is a hollow that follows the dome, so the badge is a shell.
    const zAt =
      side > 0
        ? (r: number, u: number, v: number) => o.thickness + o.dome * profile(r) + sample(u, v)
        : (r: number, u: number, v: number) => -o.thickness + o.concave * profile(r) - sample(u, v);

    pos[2] = zAt(0, 0.5, 0.5);
    uv[0] = 0.5;
    uv[1] = 0.5;
    for (let i = 1; i <= R; i++) {
      const r = i / R;
      for (let j = 0; j < S; j++) {
        const a = (j / S) * Math.PI * 2;
        const x = Math.cos(a) * r,
          y = Math.sin(a) * r;
        const u = 0.5 + side * x * UVR,
          v = 0.5 + y * UVR;
        const k = 1 + (i - 1) * S + j;
        const z = zAt(r, u, v);
        pos[k * 3] = x;
        pos[k * 3 + 1] = y;
        pos[k * 3 + 2] = z;
        uv[k * 2] = u;
        uv[k * 2 + 1] = v;
        if (i === R) edgeZ[j] = z;
      }
    }
    const idx: number[] = [];
    const tri = (a: number, b: number, c: number) =>
      side > 0 ? idx.push(a, b, c) : idx.push(a, c, b);
    for (let j = 0; j < S; j++) tri(0, 1 + j, 1 + ((j + 1) % S));
    for (let i = 2; i <= R; i++) {
      for (let j = 0; j < S; j++) {
        const jn = (j + 1) % S;
        const a = 1 + (i - 2) * S + j,
          b = 1 + (i - 2) * S + jn;
        const c = 1 + (i - 1) * S + j,
          d = 1 + (i - 1) * S + jn;
        tri(a, c, d);
        tri(a, d, b);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return { geo, edgeZ };
  }

  function buildRim(frontZ: Float32Array, backZ: Float32Array) {
    const S = o.segments,
      K = 14;
    const pos = new Float32Array((K + 1) * S * 3);
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      const r = 1 + o.rimBulge * Math.sin(Math.PI * t);
      for (let j = 0; j < S; j++) {
        const a = (j / S) * Math.PI * 2;
        const p = (k * S + j) * 3;
        pos[p] = Math.cos(a) * r;
        pos[p + 1] = Math.sin(a) * r;
        pos[p + 2] = frontZ[j] * (1 - t) + backZ[j] * t;
      }
    }
    const idx: number[] = [];
    for (let k = 0; k < K; k++) {
      for (let j = 0; j < S; j++) {
        const jn = (j + 1) % S;
        const a = k * S + j,
          b = (k + 1) * S + j,
          c = k * S + jn,
          d = (k + 1) * S + jn;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  function faceMaterial(
    source: HTMLImageElement | HTMLCanvasElement,
    metalRough: HTMLCanvasElement,
  ) {
    const map =
      source instanceof HTMLCanvasElement ? new CanvasTexture(source) : new Texture(source);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    map.needsUpdate = true;
    const mr = new CanvasTexture(metalRough);
    mr.anisotropy = map.anisotropy;
    return new MeshPhysicalMaterial({
      map,
      metalnessMap: mr,
      roughnessMap: mr,
      metalness: 1,
      roughness: 1,
      clearcoat: 0.8, // enamel lacquer
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.25,
    });
  }

  const state = {
    angle: 0,
    vel: 0,
    dragging: false,
    lastX: 0,
    downX: 0,
    downT: 0,
    lastInteract: -1e9,
    autoSpin: o.autoSpin,
    // π settles on whichever face is nearer; 2π only on the front.
    settleStep: Math.PI,
    tilt: 0,
    tiltTarget: 0,
    time: 0,
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const el = renderer.domElement;
  const onDown = (e: PointerEvent) => {
    state.dragging = true;
    state.lastX = state.downX = e.clientX;
    state.downT = performance.now();
    state.vel = 0;
    state.settleStep = Math.PI;
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const rect = el.getBoundingClientRect();
    state.tiltTarget = ((e.clientY - rect.top) / rect.height - 0.5) * -0.35;
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    state.lastX = e.clientX;
    const d = (dx / rect.width) * Math.PI * 1.6;
    state.angle += d;
    state.vel = state.vel * 0.6 + (d / (1 / 60)) * 0.4;
    state.lastInteract = performance.now();
  };
  const onUp = (e: PointerEvent) => {
    if (!state.dragging) return;
    state.dragging = false;
    state.lastInteract = performance.now();
    if (Math.abs(e.clientX - state.downX) < 5 && performance.now() - state.downT < 350)
      toggleSpin();
  };
  // The container allows vertical panning, so a cancel is the page scrolling, not a tap.
  const onCancel = () => {
    state.dragging = false;
    state.lastInteract = performance.now();
  };
  const onLeave = () => {
    state.tiltTarget = 0;
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('pointerleave', onLeave);

  function toggleSpin() {
    if (state.autoSpin) {
      state.autoSpin = false;
      state.settleStep = 2 * Math.PI;
      state.vel = (state.vel >= 0 ? 1 : -1) * 11.5;
      state.lastInteract = performance.now();
    } else {
      state.autoSpin = true;
      state.settleStep = Math.PI;
      state.lastInteract = -1e9;
    }
  }

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
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    state.time += dt;
    const idle = now - state.lastInteract > 2200;

    if (!state.dragging) {
      if (state.autoSpin && idle && !reduceMotion.matches) {
        state.vel += (o.autoSpeed - state.vel) * Math.min(1, dt * 1.5);
      } else {
        state.vel *= Math.exp(-2.2 * dt);
        if (Math.abs(state.vel) < 2.2) {
          // settle like a coin coming to rest
          const target = Math.round(state.angle / state.settleStep) * state.settleStep;
          state.vel += (target - state.angle) * 22 * dt;
          state.vel *= Math.exp(-5 * dt);
        }
      }
      state.angle += state.vel * dt;
    }

    state.tilt += (state.tiltTarget - state.tilt) * Math.min(1, dt * 4);
    const sway = reduceMotion.matches ? 0 : Math.sin(state.time * 0.9) * 0.05;
    group.rotation.set(state.tilt + sway, state.angle, 0);
    group.position.y = reduceMotion.matches ? 0 : Math.sin(state.time * 1.3) * 0.03;

    o.onFrame?.({ angle: state.angle, bob: group.position.y });
    renderer.render(scene, camera);
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

  const ready = Promise.all([loadImage(o.front), loadImage(o.back)]).then(([fImg, bImg]) => {
    if (disposed) return;
    const fa = analyse(fImg, false),
      ba = analyse(bImg, true);
    const front = buildFace(fa.sample, 1);
    const back = buildFace(ba.sample, -1);
    const rimGeo = buildRim(front.edgeZ, back.edgeZ);

    group.add(new Mesh(front.geo, faceMaterial(fa.colorSource, fa.metalRough)));
    group.add(new Mesh(back.geo, faceMaterial(ba.colorSource, ba.metalRough)));
    group.add(
      new Mesh(
        rimGeo,
        new MeshPhysicalMaterial({
          // r128 took hex colors as linear; since r152 they are read as sRGB.
          color: new Color().setHex(0xc2a360, LinearSRGBColorSpace),
          metalness: 1,
          roughness: 0.3,
          clearcoat: 0.4,
          clearcoatRoughness: 0.2,
          envMapIntensity: 1.3,
        }),
      ),
    );
    loaded = true;
    start();
  });

  return {
    ready,
    setAutoSpin(value) {
      state.autoSpin = value;
      state.lastInteract = value ? -1e9 : performance.now();
    },
    toggleSpin,
    nudge(delta) {
      state.vel += delta;
      state.lastInteract = performance.now();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      group.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        node.geometry.dispose();
        const m = node.material as MeshPhysicalMaterial;
        m.map?.dispose();
        m.metalnessMap?.dispose();
        m.roughnessMap?.dispose();
        m.dispose();
      });
      envTexture.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}
