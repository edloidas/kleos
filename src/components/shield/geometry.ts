import { BufferAttribute, BufferGeometry } from 'three';

import type { ReliefSample } from './artwork';

/** Maps mesh radius 1 to just inside the gold ring of the art. */
const UVR = 0.492;

/** The dome's falloff from centre to rim. */
const profile = (r: number) => Math.pow(1 - r * r, 0.85);

export interface ShapeOptions {
  /** Radial resolution of the face mesh. */
  rings: number;
  /** Angular resolution. */
  segments: number;
  /** Half-thickness at the rim. */
  thickness: number;
  /** How much the face bulges. */
  dome: number;
  /** How deep the back is hollowed; the shell follows the front dome. */
  concave: number;
  /** How round the edge band is. */
  rimBulge: number;
}

export interface Face {
  geometry: BufferGeometry;
  /** Where the face meets the rim, per segment, so the band can be stitched to it. */
  edgeZ: Float32Array;
}

/**
 * One domed disc. `side` is +1 for the front and -1 for the back, whose UVs are
 * mirrored so the art reads correctly and whose dome is a hollow, making the badge
 * a shell rather than a solid slab.
 */
export function buildFace(sampleRelief: ReliefSample, side: 1 | -1, options: ShapeOptions): Face {
  const R = options.rings,
    S = options.segments;
  const count = 1 + R * S;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const edgeZ = new Float32Array(S);
  const zAt =
    side > 0
      ? (r: number, u: number, v: number) =>
          options.thickness + options.dome * profile(r) + sampleRelief(u, v)
      : (r: number, u: number, v: number) =>
          -options.thickness + options.concave * profile(r) - sampleRelief(u, v);

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

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();

  return { geometry, edgeZ };
}

/** The coin's edge band, bulged out and stitched between the two faces. */
export function buildRim(
  frontZ: Float32Array,
  backZ: Float32Array,
  options: ShapeOptions,
): BufferGeometry {
  const S = options.segments,
    K = 14;
  const pos = new Float32Array((K + 1) * S * 3);

  for (let k = 0; k <= K; k++) {
    const t = k / K;
    const r = 1 + options.rimBulge * Math.sin(Math.PI * t);

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

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();

  return geometry;
}
