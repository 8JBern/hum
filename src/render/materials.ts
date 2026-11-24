import * as THREE from 'three';
import { CLOCK_FRAG, OCC_FRAG, OCC_VERT, PANEL_FRAG, WATER_FRAG, WATER_VERT, WORLD_FRAG, WORLD_VERT } from './shaders.ts';
import {
  carpetTexture,
  ceilingTexture,
  decalAtlas,
  grainTexture,
  officeCarpetTexture,
  paintTexture,
  poolTileTexture,
  wallpaperTexture,
} from './textures.ts';

/** Uniforms shared by every world material, updated once per frame. */
export const shared = {
  uSeed: { value: 0 },
  uLevel: { value: 0 },
  uTime: { value: 0 },
  uCeil: { value: 2.7 },
  uFlickerPulse: { value: 0 },
  uPanelColor: { value: new THREE.Color(1.0, 0.93, 0.72) },
  uAmbient: { value: new THREE.Color(0.11, 0.1, 0.065) },
  uFogColor: { value: new THREE.Color(0.075, 0.066, 0.035) },
  uFogDensity: { value: 0.045 },
  uOcc: { value: new THREE.Vector4(0, 0, 9999, 0) },
  uTintPos: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
  uTintCol: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
  uCamPos: { value: new THREE.Vector3() },
  uCamDir: { value: new THREE.Vector3(0, 0, 1) },
  uNight: { value: 0 },
  uCaustic: { value: 0 },
  uLightScale: { value: 1 },
  uClock: { value: 0 },
};

export interface Biome {
  name: string;
  panel: THREE.Color;
  ambient: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;
  caustic: number;
  wallScale: number;
  floorScale: number;
  ceilScale: number;
  damp: number;
}

export const BIOMES: Record<number, Biome> = {
  0: {
    name: 'After Hours',
    panel: new THREE.Color(1.0, 0.92, 0.68),
    ambient: new THREE.Color(0.1, 0.09, 0.055),
    fog: new THREE.Color(0.07, 0.062, 0.032),
    fogDensity: 0.05,
    caustic: 0,
    wallScale: 0.75,
    floorScale: 2,
    ceilScale: 1.2,
    damp: 1,
  },
  1: {
    name: 'Chlorine',
    panel: new THREE.Color(0.7, 0.82, 0.86),
    ambient: new THREE.Color(0.05, 0.07, 0.075),
    fog: new THREE.Color(0.05, 0.075, 0.08),
    fogDensity: 0.042,
    caustic: 1,
    wallScale: 1,
    floorScale: 1,
    ceilScale: 1,
    damp: 0.4,
  },
  9: {
    name: 'Office',
    panel: new THREE.Color(0.9, 0.95, 1.0),
    ambient: new THREE.Color(0.06, 0.065, 0.075),
    fog: new THREE.Color(0.03, 0.035, 0.045),
    fogDensity: 0.03,
    caustic: 0,
    wallScale: 1,
    floorScale: 0.6,
    ceilScale: 1.2,
    damp: 0,
  },
};

function worldMat(map: THREE.Texture, scale: number, defines: Record<string, string> = {}, extra: Partial<THREE.ShaderMaterialParameters> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: WORLD_VERT,
    fragmentShader: WORLD_FRAG,
    uniforms: { ...shared, map: { value: map }, uMapScale: { value: scale }, uDamp: { value: 1 } },
    defines,
    ...extra,
  });
}

export interface MaterialSet {
  wall: THREE.ShaderMaterial;
  floor: THREE.ShaderMaterial;
  ceiling: THREE.ShaderMaterial;
  props: THREE.ShaderMaterial;
  panel: THREE.ShaderMaterial;
  decal: THREE.ShaderMaterial;
  clock: THREE.ShaderMaterial;
  water: THREE.ShaderMaterial;
  occupant: THREE.ShaderMaterial;
}

let textures: Record<string, THREE.Texture> | null = null;
function tx(): Record<string, THREE.Texture> {
  if (!textures) {
    textures = {
      wallpaper: wallpaperTexture(),
      carpet: carpetTexture(),
      ceiling: ceilingTexture(),
      tile: poolTileTexture(),
      paint: paintTexture(),
      officeCarpet: officeCarpetTexture(),
      grain: grainTexture(),
      atlas: decalAtlas(),
    };
  }
  return textures;
}

const cache = new Map<number, MaterialSet>();

/** Materials are created once per biome and reused across chunks (never disposed per chunk). */
export function materialsFor(level: number): MaterialSet {
  const hit = cache.get(level);
  if (hit) return hit;
  const t = tx();
  const b = BIOMES[level] ?? BIOMES[0]!;
  const wallMap = level === 1 ? t.tile! : level === 9 ? t.paint! : t.wallpaper!;
  const floorMap = level === 1 ? t.tile! : level === 9 ? t.officeCarpet! : t.carpet!;
  const ceilMap = level === 1 ? t.tile! : t.ceiling!;
  const set: MaterialSet = {
    wall: worldMat(wallMap, b.wallScale, { WALL: '1' }),
    floor: worldMat(floorMap, b.floorScale),
    ceiling: worldMat(ceilMap, b.ceilScale),
    props: worldMat(t.grain!, 1.3),
    panel: new THREE.ShaderMaterial({ vertexShader: WORLD_VERT, fragmentShader: PANEL_FRAG, uniforms: { ...shared } }),
    decal: worldMat(t.atlas!, 1, { ATTR_UV: '1', DECAL: '1' }, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    clock: new THREE.ShaderMaterial({ vertexShader: WORLD_VERT, fragmentShader: CLOCK_FRAG, uniforms: { ...shared } }),
    water: new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: { ...shared }, transparent: true, depthWrite: false }),
    occupant: new THREE.ShaderMaterial({
      vertexShader: OCC_VERT,
      fragmentShader: OCC_FRAG,
      uniforms: {
        uTime: shared.uTime,
        uGlitch: { value: 0 },
        map: { value: t.wallpaper },
        uNightOcc: { value: 0 },
        uFogColor: shared.uFogColor,
        uCamPos: shared.uCamPos,
        uFogDensity: shared.uFogDensity,
      },
    }),
  };
  set.wall.uniforms.uDamp!.value = b.damp;
  cache.set(level, set);
  return set;
}

/** Apply a biome's lighting values to the shared uniforms. */
export function applyBiome(level: number, ceil: number, seed: number): void {
  const b = BIOMES[level] ?? BIOMES[0]!;
  shared.uPanelColor.value.copy(b.panel);
  shared.uAmbient.value.copy(b.ambient);
  shared.uFogColor.value.copy(b.fog);
  shared.uFogDensity.value = b.fogDensity;
  shared.uCaustic.value = b.caustic;
  shared.uCeil.value = ceil;
  shared.uLevel.value = level;
  shared.uSeed.value = seed;
}
