import type { Chunk, Room } from './chunk.ts';

export const CELL = 2;
export const CHUNK_M = 32;
export const WALL_T = 0.12;
export const PARTITION_H = 1.35;
export const DOOR_H = 2.1;
/** Fluorescent panels sit on a fixed world grid: (4i + 1, 4j + 1). */
export const PANEL_SPACING = 4;
export const PANEL_OFFSET = 1;

export type PropKind =
  | 'desk'
  | 'chair'
  | 'cabinet'
  | 'cabinetOpen'
  | 'cooler'
  | 'plant'
  | 'monitor'
  | 'crt'
  | 'phone'
  | 'box'
  | 'pillar'
  | 'bench'
  | 'locker'
  | 'lifechair'
  | 'stairs'
  | 'door'
  | 'umbrella'
  | 'shoe'
  | 'ladder'
  | 'divingboard'
  | 'cone'
  | 'table'
  | 'towel'
  | 'lanerope'
  | 'wallpanel'
  | 'void';

export type DynKind = 'face' | 'breathe' | 'ring';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  /** Yaw: the prop's front faces (sin yaw, cos yaw) in the xz plane. */
  rot: number;
  /** Uniform scale multiplier. */
  s: number;
  /** Optional roll (radians) about the facing axis, used for upside-down props. */
  roll?: number;
  dyn?: DynKind;
  /** Anomaly uid that owns this prop, if any. */
  anomaly?: string;
  /** Colour variant index. */
  v?: number;
}

export interface Decal {
  tile: number;
  x: number;
  y: number;
  z: number;
  /** Surface normal. */
  nx: number;
  ny: number;
  nz: number;
  w: number;
  h: number;
  /** In-plane rotation in radians. */
  rot: number;
  /** 0 = lit by the room, above 0 = self-lit multiplier. */
  emit: number;
}

/** Clock modes: 0 real local time, 1 runs backwards, 2 wrong by some hours. */
export interface Clock {
  x: number;
  y: number;
  z: number;
  rot: number;
  mode: 0 | 1 | 2;
  anomaly?: string;
}

export interface Pickup {
  id: string;
  kind: 'battery' | 'tape';
  x: number;
  y: number;
  z: number;
}

export interface Collider {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface AnomalyInstance {
  uid: string;
  type: string;
  tier: 1 | 2 | 3;
  name: string;
  /** Detection volume centre (world metres) and radius. */
  x: number;
  y: number;
  z: number;
  r: number;
  roomId: number;
}

export interface PanelTint {
  i: number;
  j: number;
  r: number;
  g: number;
  b: number;
}

export interface WallPatch {
  /** Patch quad on a wall face, drawn with the wall material and a texture shift. */
  x: number;
  z: number;
  rot: number;
  w: number;
  h: number;
  shiftU: number;
  shiftV: number;
}

export interface SilentRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface WorldChunk extends Chunk {
  /** Copies of the layout walls with partitions added (value 3). Anything non-zero blocks. */
  vWalls: Uint8Array;
  hWalls: Uint8Array;
  ox: number;
  oz: number;
  ceil: number;
  props: Prop[];
  decals: Decal[];
  clocks: Clock[];
  pickups: Pickup[];
  colliders: Collider[];
  anomalies: AnomalyInstance[];
  tints: PanelTint[];
  patches: WallPatch[];
  silent: SilentRect[];
  /** Edge keys ("v:x:z" or "h:x:z", chunk-local) of doorways whose lintel is raised. */
  tallDoors: string[];
  spawn?: { x: number; z: number; yaw: number };
}

export interface WallSpot {
  /** Point on the wall face (world metres). */
  x: number;
  z: number;
  /** Yaw facing into the room. */
  rot: number;
  /** Unit normal into the room. */
  nx: number;
  nz: number;
  cellX: number;
  cellZ: number;
}

export type { Chunk, Room };
