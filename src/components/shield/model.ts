import {
  CanvasTexture,
  Color,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  MeshPhysicalMaterial,
  SRGBColorSpace,
  Texture,
} from 'three';

import { loadImage, prepareArtwork, type ArtworkOptions, type PreparedArtwork } from './artwork';
import { buildFace, buildRim, type ShapeOptions } from './geometry';

export interface ShieldModelOptions extends ArtworkOptions, ShapeOptions {
  front: string;
  back: string;
  maxAnisotropy: number;
}

export interface ShieldModel {
  /** Empty until `ready` settles; safe to add to a scene immediately. */
  readonly group: Group;
  /** Resolves when the meshes are in, or when disposal cancelled the build. */
  readonly ready: Promise<void>;
  dispose(): void;
}

interface Disposable {
  dispose(): void;
}

/** The material and the textures it owns, which a material does not dispose for you. */
interface Surface {
  material: MeshPhysicalMaterial;
  textures: Disposable[];
}

function faceSurface(artwork: PreparedArtwork, maxAnisotropy: number): Surface {
  const map =
    artwork.colorSource instanceof HTMLCanvasElement
      ? new CanvasTexture(artwork.colorSource)
      : new Texture(artwork.colorSource);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = maxAnisotropy;
  map.needsUpdate = true;

  const metalRough = new CanvasTexture(artwork.metalnessRoughness);
  metalRough.anisotropy = maxAnisotropy;

  return {
    material: new MeshPhysicalMaterial({
      map,
      metalnessMap: metalRough,
      roughnessMap: metalRough,
      metalness: 1,
      roughness: 1,
      clearcoat: 0.8, // enamel lacquer
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.25,
    }),
    textures: [map, metalRough],
  };
}

function rimMaterial(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    // r128 took hex colors as linear; since r152 they are read as sRGB.
    color: new Color().setHex(0xc2a360, LinearSRGBColorSpace),
    metalness: 1,
    roughness: 0.3,
    clearcoat: 0.4,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.3,
  });
}

/**
 * The handle comes back before the images have loaded, so a caller that gives up
 * mid-load still has something to call `dispose` on; disposing then cancels the build.
 */
export function createShieldModel(options: ShieldModelOptions): ShieldModel {
  const group = new Group();
  const owned: Disposable[] = [];
  let disposed = false;

  const ready = Promise.all([loadImage(options.front), loadImage(options.back)]).then(
    ([frontImg, backImg]) => {
      if (disposed) return;

      const frontArt = prepareArtwork(frontImg, false, options);
      const backArt = prepareArtwork(backImg, true, options);

      const front = buildFace(frontArt.sampleRelief, 1, options);
      const back = buildFace(backArt.sampleRelief, -1, options);
      const rim = buildRim(front.edgeZ, back.edgeZ, options);

      const frontSurface = faceSurface(frontArt, options.maxAnisotropy);
      const backSurface = faceSurface(backArt, options.maxAnisotropy);
      const band = rimMaterial();

      owned.push(
        front.geometry,
        back.geometry,
        rim,
        frontSurface.material,
        backSurface.material,
        band,
        ...frontSurface.textures,
        ...backSurface.textures,
      );

      group.add(
        new Mesh(front.geometry, frontSurface.material),
        new Mesh(back.geometry, backSurface.material),
        new Mesh(rim, band),
      );
    },
  );

  function disposeOwned(): void {
    group.clear();
    for (const resource of owned) resource.dispose();
    owned.length = 0;
  }

  return {
    group,
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeOwned();
    },
  };
}
