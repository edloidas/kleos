/**
 * Everything the badge reads out of the flat PNGs: where the metal is, how high it
 * stands, and what the surface under it should look like. Pure pixel work — nothing
 * here touches a renderer, a scene or the DOM beyond an offscreen 2D canvas.
 */

export interface ArtworkOptions {
  /** Texture sample resolution. */
  size: number;
  /** How high the gold is raised over the enamel. */
  relief: number;
  /** How far the back handle stands off the hollow. */
  handleLift: number;
  /** 0 is a flat slab, 1 a strap that arches between its rivets. */
  handleArch: number;
}

/** Outward displacement of the surface at (u, v). */
export type ReliefSample = (u: number, v: number) => number;

export interface PreparedArtwork {
  /** What the colour map is built from: the art itself, or a doctored copy. */
  colorSource: HTMLImageElement | HTMLCanvasElement;
  /** Packed map: G is roughness, B is metalness, three.js convention. */
  metalnessRoughness: HTMLCanvasElement;
  sampleRelief: ReliefSample;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error(`Could not load ${src.slice(0, 60)}`)));
    img.src = src;
  });
}

/** Box blur, for soft bevels on the relief. */
function blurred(src: Float32Array, size: number, radius: number): Float32Array {
  const tmp = new Float32Array(size * size),
    out = new Float32Array(size * size);
  const w = 2 * radius + 1;

  for (let y = 0; y < size; y++) {
    let s = 0;
    for (let x = -radius; x <= radius; x++) {
      s += src[y * size + Math.min(size - 1, Math.max(0, x))];
    }
    for (let x = 0; x < size; x++) {
      tmp[y * size + x] = s / w;
      s +=
        src[y * size + Math.min(size - 1, x + radius + 1)] -
        src[y * size + Math.max(0, x - radius)];
    }
  }

  for (let x = 0; x < size; x++) {
    let s = 0;
    for (let y = -radius; y <= radius; y++) {
      s += tmp[Math.min(size - 1, Math.max(0, y)) * size + x];
    }
    for (let y = 0; y < size; y++) {
      out[y * size + x] = s / w;
      s +=
        tmp[Math.min(size - 1, y + radius + 1) * size + x] -
        tmp[Math.max(0, y - radius) * size + x];
    }
  }

  return out;
}

function sampler(heights: Float32Array, size: number): (u: number, v: number) => number {
  return (u, v) => {
    const fx = u * (size - 1),
      fy = (1 - v) * (size - 1);
    const x0 = Math.max(0, Math.min(size - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(size - 2, Math.floor(fy)));
    const dx = fx - x0,
      dy = fy - y0;
    const at = (x: number, y: number) => heights[y * size + x];

    return (
      (at(x0, y0) * (1 - dx) + at(x0 + 1, y0) * dx) * (1 - dy) +
      (at(x0, y0 + 1) * (1 - dx) + at(x0 + 1, y0 + 1) * dx) * dy
    );
  };
}

function pixelsOf(img: HTMLImageElement, size: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, size, size);

  return ctx.getImageData(0, 0, size, size).data;
}

/** "Goldness": bright, warm pixels are raised metal; dark ones are enamel. */
function goldness(px: Uint8ClampedArray, size: number): Float32Array {
  const gold = new Float32Array(size * size);

  for (let i = 0; i < size * size; i++) {
    const r = px[i * 4],
      g = px[i * 4 + 1],
      b = px[i * 4 + 2],
      a = px[i * 4 + 3] / 255;
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    let t = Math.min(1, Math.max(0, (luma - 0.26) / 0.24));
    t = t * t * (3 - 2 * t);
    gold[i] = t * a;
  }

  return gold;
}

function metalnessRoughnessMap(gold: Float32Array, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const soft = blurred(gold, size, 1);

  for (let i = 0; i < size * size; i++) {
    const t = soft[i];
    // Cheap stamped metal: a bit rough, with faint brushed noise.
    const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const rough = 0.34 * t + 0.16 * (1 - t) + noise * 0.04;
    const metal = 1.0 * t + 0.02 * (1 - t);

    image.data[i * 4] = 255;
    image.data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, rough)) * 255);
    image.data[i * 4 + 2] = Math.round(metal * 255);
    image.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);

  return canvas;
}

/**
 * The back carries a handle the front does not, so it is prepared separately:
 * anything gold well inside the outer ring is the strap, and it gets its own taller
 * relief, its own side walls and a contact shadow baked into the enamel under it.
 */
function prepareHandle(
  img: HTMLImageElement,
  gold: Float32Array,
  height: Float32Array,
  options: ArtworkOptions,
): { handle: Float32Array; colorSource: HTMLCanvasElement; vMid: number; vHalf: number } {
  const N = options.size;
  const mask = new Float32Array(N * N);
  const centre = (N - 1) / 2,
    inner = N * 0.5 * 0.8;
  let vMin = 1,
    vMax = 0;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (Math.hypot(x - centre, y - centre) >= inner) continue;

      mask[i] = gold[i];
      height[i] = 0; // the handle gets its own, taller relief below

      if (gold[i] > 0.5) {
        const v = 1 - y / (N - 1);
        vMin = Math.min(vMin, v);
        vMax = Math.max(vMax, v);
      }
    }
  }

  // Solid strap silhouette: fill the small cut-outs so the handle is one piece,
  // then keep the engraving as a shallow inset on top of it.
  const soft = blurred(mask, N, 4);
  const solid = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) solid[i] = soft[i] > 0.22 ? 1 : 0;

  const shape = blurred(blurred(solid, N, 1), N, 1);
  const handle = new Float32Array(N * N);
  const wall = new Float32Array(N * N);

  for (let i = 0; i < N * N; i++) {
    handle[i] = shape[i] * (0.86 + 0.14 * mask[i]);
    // Pixels the strap covers that are not gold in the art: its side walls.
    wall[i] = solid[i] * (shape[i] < 0.97 ? 1 : 0);
    gold[i] = Math.max(gold[i], wall[i]); // walls are metal too
  }

  const shadow = blurred(blurred(solid, N, 7), N, 7);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, N, N);
  const colors = ctx.getImageData(0, 0, N, N);

  for (let i = 0; i < N * N; i++) {
    if (wall[i] > 0) {
      // darker bronze for the strap's sides
      colors.data[i * 4] = 128;
      colors.data[i * 4 + 1] = 102;
      colors.data[i * 4 + 2] = 52;
      colors.data[i * 4 + 3] = 255;
      continue;
    }

    const k = 1 - 0.75 * Math.min(1, shadow[i] * 1.6) * (1 - shape[i]);
    colors.data[i * 4] *= k;
    colors.data[i * 4 + 1] *= k;
    colors.data[i * 4 + 2] *= k;
  }

  ctx.putImageData(colors, 0, 0);

  return {
    handle,
    colorSource: canvas,
    vMid: (vMin + vMax) / 2,
    vHalf: Math.max(1e-3, (vMax - vMin) / 2),
  };
}

export function prepareArtwork(
  img: HTMLImageElement,
  isBack: boolean,
  options: ArtworkOptions,
): PreparedArtwork {
  const N = options.size;
  const gold = goldness(pixelsOf(img, N), N);
  const height = blurred(blurred(gold, N, 2), N, 2);
  const back = isBack ? prepareHandle(img, gold, height, options) : null;

  const reliefAt = sampler(height, N);
  const handleAt = back && sampler(back.handle, N);

  return {
    colorSource: back?.colorSource ?? img,
    // Built last: prepareHandle adds the strap's walls to `gold`.
    metalnessRoughness: metalnessRoughnessMap(gold, N),
    sampleRelief(u, v) {
      let d = options.relief * reliefAt(u, v);

      if (back && handleAt) {
        const t = Math.min(1, Math.abs(v - back.vMid) / back.vHalf);
        const arch = 1 - options.handleArch + options.handleArch * (1 - t * t);
        d += options.handleLift * arch * handleAt(u, v);
      }

      return d;
    },
  };
}
