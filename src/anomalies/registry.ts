/**
 * Anomaly registry. Each type places something specifically wrong in a room.
 * `apply` returns the detection volume, or null if the room cannot host it.
 */
import { Rng, hashString } from '../core/rng.ts';
import type { Room } from '../world/chunk.ts';
import { CELL, WALL_T, type AnomalyInstance, type Prop, type WallSpot, type WorldChunk } from '../world/types.ts';
import { type FurnishCtx, PROP_SIZE, addCollider, cellFree, roomDoorways, wallSpots } from '../world/content.ts';

export interface AnomCtx {
  f: FurnishCtx;
  wc: WorldChunk;
  room: Room;
  rng: Rng;
  uid: string;
  level: number;
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface AnomalyType {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  /** Weight per level index (A, B, C). */
  weights: [number, number, number];
  apply(a: AnomCtx): Placement | null;
}

const SALT = hashString('hum/anomalies');

// ---------- helpers ----------
function centre(a: AnomCtx): [number, number] {
  return [a.wc.ox + (a.room.x + a.room.w / 2) * CELL, a.wc.oz + (a.room.z + a.room.h / 2) * CELL];
}
function freeSpots(a: AnomCtx): WallSpot[] {
  return a.rng.shuffle(wallSpots(a.wc, a.room).filter((s) => cellFree(a.f, s.cellX, s.cellZ)));
}
function anySpot(a: AnomCtx): WallSpot | null {
  const free = freeSpots(a);
  if (free.length) return free[0]!;
  const all = wallSpots(a.wc, a.room);
  return all.length ? a.rng.pick(all) : null;
}
function prop(a: AnomCtx, p: Prop, collide = true): Prop {
  p.anomaly = a.uid;
  a.wc.props.push(p);
  if (collide) addCollider(a.wc, p);
  return p;
}
function decal(a: AnomCtx, tile: number, s: WallSpot, y: number, w: number, h: number, emit = 0, rot = 0): void {
  a.wc.decals.push({ tile, x: s.x + s.nx * 0.004, y, z: s.z + s.nz * 0.004, nx: s.nx, ny: 0, nz: s.nz, w, h, rot, emit });
}
function floorDecal(a: AnomCtx, tile: number, x: number, z: number, w: number, h: number, rot: number, emit = 0): void {
  a.wc.decals.push({ tile, x, y: 0.014, z, nx: 0, ny: 1, nz: 0, w, h, rot, emit });
}
/** A point inside the room at least 0.6 m from its walls. */
function floorPoint(a: AnomCtx): [number, number] {
  const { wc, room, rng } = a;
  return [wc.ox + room.x * CELL + 0.6 + rng.next() * (room.w * CELL - 1.2), wc.oz + room.z * CELL + 0.6 + rng.next() * (room.h * CELL - 1.2)];
}
function inFront(s: WallSpot, d: number, y: number, r: number): Placement {
  return { x: s.x + s.nx * d, y, z: s.z + s.nz * d, r };
}
const A = (w: number): [number, number, number] => [w, 0, 0];
const B = (w: number): [number, number, number] => [0, w, 0];
const AB = (wa: number, wb: number): [number, number, number] => [wa, wb, 0];

// ---------- types ----------
export const ANOMALY_TYPES: AnomalyType[] = [
  // Tier 1: obvious
  {
    id: 'chair-ceiling',
    name: 'Chair on the ceiling',
    tier: 1,
    weights: A(1),
    apply(a) {
      const [x, z] = floorPoint(a);
      prop(a, { kind: 'chair', x, y: a.wc.ceil, z, rot: a.rng.range(0, 6.28), s: 1, roll: Math.PI }, false);
      return { x, y: a.wc.ceil - 0.45, z, r: 0.6 };
    },
  },
  {
    id: 'exit-into-wall',
    name: 'Exit sign pointing into a wall',
    tier: 1,
    weights: AB(1, 1),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      decal(a, 6, s, 2.1, 0.5, 0.25, 1.4);
      return inFront(s, 0.25, 2.1, 0.45);
    },
  },
  {
    id: 'phone-ringing',
    name: 'Phone ringing in an empty room',
    tier: 1,
    weights: A(1),
    apply(a) {
      const [x, z] = floorPoint(a);
      prop(a, { kind: 'phone', x, y: 0, z, rot: a.rng.range(0, 6.28), s: 1.2, dyn: 'ring' }, false);
      return { x, y: 0.1, z, r: 0.4 };
    },
  },
  {
    id: 'chair-stack',
    name: 'Chairs stacked to the ceiling',
    tier: 1,
    weights: A(0.8),
    apply(a) {
      const [x, z] = floorPoint(a);
      const n = Math.floor(a.wc.ceil / 0.5);
      for (let i = 0; i < n; i++) prop(a, { kind: 'chair', x: x + a.rng.range(-0.05, 0.05), y: i * 0.5, z: z + a.rng.range(-0.05, 0.05), rot: i * 0.4, s: 0.95 }, i === 0);
      return { x, y: 1.3, z, r: 0.8 };
    },
  },
  {
    id: 'stairs-ceiling',
    name: 'Stairs that end at the ceiling',
    tier: 1,
    weights: AB(0.8, 0.8),
    apply(a) {
      const s = freeSpots(a)[0];
      if (!s) return null;
      const p = prop(a, { kind: 'stairs', x: s.x + s.nx * 1.0, y: 0, z: s.z + s.nz * 1.0, rot: s.rot + Math.PI, s: 1 });
      void p;
      return inFront(s, 1.0, 1.4, 1.0);
    },
  },
  {
    id: 'window-daylight',
    name: 'A window full of daylight',
    tier: 1,
    weights: A(0.9),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      decal(a, 8, s, 1.45, 1.2, 0.95, 2.2);
      return inFront(s, 0.25, 1.45, 0.6);
    },
  },
  {
    id: 'door-high',
    name: 'A door halfway up the wall',
    tier: 1,
    weights: AB(0.9, 0.5),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      prop(a, { kind: 'door', x: s.x + s.nx * 0.03, y: 0.9, z: s.z + s.nz * 0.03, rot: s.rot, s: 0.8 }, false);
      return inFront(s, 0.25, 1.7, 0.7);
    },
  },
  {
    id: 'missing-tile',
    name: 'Missing ceiling tile with darkness above',
    tier: 1,
    weights: A(1),
    apply(a) {
      const [x, z] = floorPoint(a);
      a.wc.decals.push({ tile: 22, x, y: a.wc.ceil - 0.004, z, nx: 0, ny: -1, nz: 0, w: 0.62, h: 0.62, rot: 0, emit: 0.02 });
      return { x, y: a.wc.ceil - 0.1, z, r: 0.45 };
    },
  },
  {
    id: 'pool-ladder-wall',
    name: 'Pool ladder climbing into a wall',
    tier: 1,
    weights: B(1),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      prop(a, { kind: 'ladder', x: s.x + s.nx * 0.12, y: 0, z: s.z + s.nz * 0.12, rot: s.rot, s: 1 }, false);
      return inFront(s, 0.3, 1.0, 0.7);
    },
  },
  {
    id: 'diving-board',
    name: 'Diving board over ankle-deep water',
    tier: 1,
    weights: B(1),
    apply(a) {
      const s = freeSpots(a)[0];
      if (!s) return null;
      prop(a, { kind: 'divingboard', x: s.x + s.nx * 1.1, y: 0.9, z: s.z + s.nz * 1.1, rot: s.rot, s: 1 }, false);
      return inFront(s, 1.1, 0.95, 0.8);
    },
  },
  {
    id: 'crt-message',
    name: 'Television on the floor, talking to you',
    tier: 1,
    weights: AB(0.9, 0.4),
    apply(a) {
      const [x, z] = floorPoint(a);
      const rot = a.rng.range(0, 6.28);
      prop(a, { kind: 'crt', x, y: 0, z, rot, s: 1 });
      const nx = Math.sin(rot);
      const nz = Math.cos(rot);
      a.wc.decals.push({ tile: 7, x: x + nx * 0.236, y: 0.23, z: z + nz * 0.236, nx, ny: 0, nz, w: 0.38, h: 0.3, rot: 0, emit: 1.6 });
      return { x, y: 0.25, z, r: 0.45 };
    },
  },
  {
    id: 'cone-ring',
    name: 'Wet floor cones around nothing',
    tier: 1,
    weights: AB(0.4, 1),
    apply(a) {
      const [x, z] = floorPoint(a);
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2;
        prop(a, { kind: 'cone', x: x + Math.cos(t) * 0.55, y: 0, z: z + Math.sin(t) * 0.55, rot: t, s: 1 }, false);
      }
      return { x, y: 0.3, z, r: 0.8 };
    },
  },
  {
    id: 'chair-wall',
    name: 'Chair standing on the wall',
    tier: 1,
    weights: A(0.7),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      prop(a, { kind: 'chair', x: s.x + s.nx * 0.02, y: 1.3, z: s.z + s.nz * 0.02, rot: s.rot, s: 1, roll: Math.PI / 2 }, false);
      return inFront(s, 0.35, 1.5, 0.6);
    },
  },
  {
    id: 'lane-rope-dry',
    name: 'Lane rope strung across a corridor',
    tier: 1,
    weights: B(0.8),
    apply(a) {
      const [x, z] = centre(a);
      const vertical = a.room.w < a.room.h;
      prop(a, { kind: 'lanerope', x, y: 0.9, z, rot: vertical ? Math.PI / 2 : 0, s: (vertical ? a.room.w : a.room.h) * CELL / 4 }, false);
      return { x, y: 0.9, z, r: 0.8 };
    },
  },
  // Tier 2: noticeable if you look
  {
    id: 'clock-backwards',
    name: 'Clock running backwards',
    tier: 2,
    weights: AB(0.7, 0.7),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      a.wc.clocks.push({ x: s.x + s.nx * 0.02, y: 2.0, z: s.z + s.nz * 0.02, rot: s.rot, mode: 1, anomaly: a.uid });
      return inFront(s, 0.25, 2.0, 0.4);
    },
  },
  {
    id: 'clock-wrong',
    name: 'Clock showing the wrong time',
    tier: 2,
    weights: AB(0.5, 0.5),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      a.wc.clocks.push({ x: s.x + s.nx * 0.02, y: 2.0, z: s.z + s.nz * 0.02, rot: s.rot, mode: 2, anomaly: a.uid });
      return inFront(s, 0.25, 2.0, 0.4);
    },
  },
  {
    id: 'wet-footprints',
    name: 'Wet footprints that walk into a wall',
    tier: 2,
    weights: AB(1, 0.7),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      const yaw = s.rot + Math.PI; // walking toward the wall
      for (let i = 0; i < 6; i++) {
        const d = 0.35 + i * 0.6;
        const side = i % 2 ? 0.12 : -0.12;
        floorDecal(a, 1, s.x + s.nx * d + s.nz * side, s.z + s.nz * d - s.nx * side, 0.22, 0.32, yaw);
      }
      return { x: s.x + s.nx * 1.2, y: 0.05, z: s.z + s.nz * 1.2, r: 1.0 };
    },
  },
  {
    id: 'wrong-light',
    name: 'Light panel with the wrong colour',
    tier: 2,
    weights: AB(1, 1),
    apply(a) {
      const { wc, room } = a;
      // Panels at world (4i+1, 4j+1) inside the room rect.
      const x0 = wc.ox + room.x * CELL;
      const z0 = wc.oz + room.z * CELL;
      const cands: [number, number][] = [];
      for (let i = Math.ceil((x0 - 1) / 4); 4 * i + 1 < x0 + room.w * CELL; i++)
        for (let j = Math.ceil((z0 - 1) / 4); 4 * j + 1 < z0 + room.h * CELL; j++) cands.push([i, j]);
      if (!cands.length) return null;
      const [i, j] = a.rng.pick(cands);
      const warm = a.rng.chance(0.5);
      wc.tints.push({ i, j, r: warm ? 1.0 : 0.35, g: warm ? 0.32 : 0.55, b: warm ? 0.18 : 1.0 });
      return { x: 4 * i + 1, y: wc.ceil - 0.05, z: 4 * j + 1, r: 0.7 };
    },
  },
  {
    id: 'sticky-yours',
    name: 'Sticky note in your handwriting',
    tier: 2,
    weights: AB(1, 0.4),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      decal(a, 3, s, 1.4, 0.3, 0.3, 0, a.rng.range(-0.15, 0.15));
      return inFront(s, 0.2, 1.4, 0.35);
    },
  },
  {
    id: 'breathing-cooler',
    name: 'Water cooler that is breathing',
    tier: 2,
    weights: A(1),
    apply(a) {
      const s = freeSpots(a)[0];
      if (!s) return null;
      prop(a, { kind: 'cooler', x: s.x + s.nx * 0.25, y: 0, z: s.z + s.nz * 0.25, rot: s.rot, s: 1, dyn: 'breathe' });
      return inFront(s, 0.25, 0.9, 0.5);
    },
  },
  {
    id: 'tall-door',
    name: 'Doorway twenty per cent too tall',
    tier: 2,
    weights: AB(0.8, 0.5),
    apply(a) {
      const doors = roomDoorways(a.wc, a.room).filter((d) => !a.wc.tallDoors.includes(d.key));
      if (!doors.length) return null;
      const d = a.rng.pick(doors);
      a.wc.tallDoors.push(d.key);
      return { x: d.x, y: 2.3, z: d.z, r: 0.7 };
    },
  },
  {
    id: 'floating-desk',
    name: 'Desk floating off the floor',
    tier: 2,
    weights: A(1),
    apply(a) {
      const s = freeSpots(a)[0];
      if (!s) return null;
      prop(a, { kind: 'desk', x: s.x + s.nx * 0.36, y: 0.14, z: s.z + s.nz * 0.36, rot: s.rot, s: 1 });
      return inFront(s, 0.36, 0.4, 0.75);
    },
  },
  {
    id: 'chair-facing',
    name: 'Chair that turns to face you',
    tier: 2,
    weights: A(1),
    apply(a) {
      const [x, z] = floorPoint(a);
      prop(a, { kind: 'chair', x, y: 0, z, rot: 0, s: 1, dyn: 'face' }, false);
      return { x, y: 0.5, z, r: 0.5 };
    },
  },
  {
    id: 'person-stain',
    name: 'Damp stain shaped like a person',
    tier: 2,
    weights: AB(1, 0.6),
    apply(a) {
      const [x, z] = floorPoint(a);
      floorDecal(a, 5, x, z, 0.9, 1.9, a.rng.range(0, 6.28));
      return { x, y: 0.05, z, r: 0.9 };
    },
  },
  {
    id: 'cabinet-open',
    name: 'Every drawer pulled open',
    tier: 2,
    weights: A(0.8),
    apply(a) {
      const s = freeSpots(a)[0];
      if (!s) return null;
      prop(a, { kind: 'cabinetOpen', x: s.x + s.nx * 0.31, y: 0, z: s.z + s.nz * 0.31, rot: s.rot, s: 1 });
      return inFront(s, 0.5, 0.7, 0.6);
    },
  },
  {
    id: 'umbrella-open',
    name: 'Open umbrella, dripping indoors',
    tier: 2,
    weights: AB(0.7, 0.8),
    apply(a) {
      const [x, z] = floorPoint(a);
      prop(a, { kind: 'umbrella', x, y: 0, z, rot: a.rng.range(0, 6.28), s: 1 }, false);
      floorDecal(a, 18, x, z, 1.3, 1.3, 0);
      return { x, y: 0.5, z, r: 0.7 };
    },
  },
  {
    id: 'shoe-single',
    name: 'One small dry shoe',
    tier: 2,
    weights: AB(0.4, 1),
    apply(a) {
      const [x, z] = floorPoint(a);
      prop(a, { kind: 'shoe', x, y: a.level === 1 ? 0.33 : 0, z, rot: a.rng.range(0, 6.28), s: 1 }, false);
      if (a.level === 1) prop(a, { kind: 'box', x, y: 0, z, rot: 0, s: 0.7 }, false);
      return { x, y: a.level === 1 ? 0.35 : 0.06, z, r: 0.35 };
    },
  },
  {
    id: 'drain-glow',
    name: 'Floor drain glowing warm',
    tier: 2,
    weights: B(1),
    apply(a) {
      const [x, z] = floorPoint(a);
      floorDecal(a, 12, x, z, 0.5, 0.5, 0, 2.5);
      return { x, y: 0.1, z, r: 0.4 };
    },
  },
  {
    id: 'switch-row',
    name: 'Twelve light switches for one light',
    tier: 2,
    weights: AB(0.8, 0.4),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      decal(a, 15, s, 1.25, 1.3, 0.16);
      return inFront(s, 0.2, 1.25, 0.6);
    },
  },
  {
    id: 'framed-room',
    name: 'Framed photograph of this corridor',
    tier: 2,
    weights: AB(0.8, 0.6),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      decal(a, a.level === 1 ? 20 : 9, s, 1.6, 0.6, 0.45);
      return inFront(s, 0.2, 1.6, 0.45);
    },
  },
  {
    id: 'towel-up',
    name: 'Towel hanging upward',
    tier: 2,
    weights: B(1),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      prop(a, { kind: 'towel', x: s.x + s.nx * 0.04, y: 1.2, z: s.z + s.nz * 0.04, rot: s.rot, s: 1 }, false);
      return inFront(s, 0.2, 1.6, 0.45);
    },
  },
  {
    id: 'panel-on-wall',
    name: 'Light panel mounted on the wall',
    tier: 2,
    weights: AB(0.6, 0.6),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      prop(a, { kind: 'wallpanel', x: s.x + s.nx * 0.04, y: 0.6, z: s.z + s.nz * 0.04, rot: s.rot, s: 1 }, false);
      return inFront(s, 0.2, 0.6, 0.55);
    },
  },
  {
    id: 'shadow-only',
    name: 'Shadow of a chair, without the chair',
    tier: 2,
    weights: AB(0.8, 0.6),
    apply(a) {
      const [x, z] = floorPoint(a);
      floorDecal(a, 13, x, z, 0.9, 0.9, a.rng.range(0, 6.28));
      return { x, y: 0.05, z, r: 0.5 };
    },
  },
  {
    id: 'cooler-dark',
    name: 'Water cooler filled with something dark',
    tier: 2,
    weights: A(0.7),
    apply(a) {
      const s = freeSpots(a)[0];
      if (!s) return null;
      prop(a, { kind: 'cooler', x: s.x + s.nx * 0.25, y: 0, z: s.z + s.nz * 0.25, rot: s.rot, s: 1, v: 1 });
      return inFront(s, 0.25, 1.1, 0.4);
    },
  },
  // Tier 3: subtle
  {
    id: 'wallpaper-seam',
    name: 'Wallpaper seam out by five centimetres',
    tier: 3,
    weights: AB(1, 0.6),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      a.wc.patches.push({ x: s.x + s.nx * 0.003, z: s.z + s.nz * 0.003, rot: s.rot, w: 0.9, h: 2.0, shiftU: 0.05, shiftV: a.level === 1 ? 0.06 : 0.05 });
      return inFront(s, 0.2, 1.2, 0.6);
    },
  },
  {
    id: 'big-furniture',
    name: 'Desk and chair slightly too large',
    tier: 3,
    weights: A(1),
    apply(a) {
      const s = freeSpots(a)[0];
      if (!s) return null;
      prop(a, { kind: 'desk', x: s.x + s.nx * 0.44, y: 0, z: s.z + s.nz * 0.44, rot: s.rot, s: 1.18 });
      prop(a, { kind: 'chair', x: s.x + s.nx * 1.15, y: 0, z: s.z + s.nz * 1.15, rot: s.rot + Math.PI, s: 1.18 }, false);
      return inFront(s, 0.7, 0.6, 0.8);
    },
  },
  {
    id: 'outlet-high',
    name: 'Power point at head height, upside down',
    tier: 3,
    weights: AB(1, 0.6),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      decal(a, 16, s, 1.85, 0.12, 0.12, 0, Math.PI);
      return inFront(s, 0.15, 1.85, 0.25);
    },
  },
  {
    id: 'silent-room',
    name: 'Room where the hum stops',
    tier: 3,
    weights: AB(0.7, 0.7),
    apply(a) {
      const { wc, room } = a;
      wc.silent.push({ x0: wc.ox + room.x * CELL, z0: wc.oz + room.z * CELL, x1: wc.ox + (room.x + room.w) * CELL, z1: wc.oz + (room.z + room.h) * CELL });
      const [x, z] = centre(a);
      return { x, y: 1.3, z, r: Math.min(room.w, room.h) * CELL * 0.45 };
    },
  },
  {
    id: 'thermostat-body',
    name: 'Thermostat reading body temperature',
    tier: 3,
    weights: AB(0.9, 0.6),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      decal(a, 10, s, 1.5, 0.16, 0.12, 0.6);
      return inFront(s, 0.15, 1.5, 0.25);
    },
  },
  {
    id: 'tiles-diamond',
    name: 'Tiles laid at the wrong angle',
    tier: 3,
    weights: B(1),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      decal(a, 11, s, 1.2, 1.0, 1.0);
      return inFront(s, 0.2, 1.2, 0.6);
    },
  },
  {
    id: 'mirrored-sign',
    name: 'Suite sign printed backwards',
    tier: 3,
    weights: AB(0.8, 0.5),
    apply(a) {
      const s = anySpot(a);
      if (!s) return null;
      decal(a, 14, s, 1.7, 0.4, 0.14);
      return inFront(s, 0.15, 1.7, 0.3);
    },
  },
  {
    id: 'plant-twins',
    name: 'Two plants, mirror images',
    tier: 3,
    weights: A(0.7),
    apply(a) {
      const s = freeSpots(a)[0];
      if (!s) return null;
      const tx = s.nz;
      const tz = -s.nx;
      prop(a, { kind: 'plant', x: s.x + s.nx * 0.35 + tx * 0.45, y: 0, z: s.z + s.nz * 0.35 + tz * 0.45, rot: 1.0, s: 1 });
      prop(a, { kind: 'plant', x: s.x + s.nx * 0.35 - tx * 0.45, y: 0, z: s.z + s.nz * 0.35 - tz * 0.45, rot: -1.0, s: 1, roll: 0 });
      return inFront(s, 0.35, 0.7, 0.7);
    },
  },
];

export const ANOMALY_BY_ID = new Map(ANOMALY_TYPES.map((t) => [t.id, t]));
export const TIER_EVIDENCE: Record<1 | 2 | 3, number> = { 1: 1, 2: 2, 3: 3 };

/** Number of anomalies a chunk carries. Rises with depth and distance from spawn. */
export function anomalyBudget(level: number, cx: number, cz: number): number {
  const dist = Math.max(Math.abs(cx), Math.abs(cz));
  return Math.min(7, 3 + level + Math.floor(dist / 2));
}

/** Place a specific anomaly type in a room. Used by generation, tests and forceAnomaly. */
export function placeAnomaly(f: FurnishCtx, room: Room, type: AnomalyType, uid: string, level: number, rng: Rng): AnomalyInstance | null {
  const a: AnomCtx = { f, wc: f.wc, room, rng, uid, level };
  const p = type.apply(a);
  if (!p) return null;
  const inst: AnomalyInstance = { uid, type: type.id, tier: type.tier, name: type.name, x: p.x, y: p.y, z: p.z, r: p.r, roomId: room.id };
  f.wc.anomalies.push(inst);
  return inst;
}

export function applyAnomalies(f: FurnishCtx, seed: number, level: number, cx: number, cz: number, spawnRoom: Room | null): void {
  const rng = Rng.from(seed, level, cx, cz, SALT);
  const wc = f.wc;
  const usedRooms = new Set<number>();
  let n = 0;
  const uid = (): string => `${level}:${cx}:${cz}:${n++}`;
  if (spawnRoom && level === 0) {
    // Onboarding: one obvious tier-1 anomaly in view of the spawn point.
    const sp = wc.spawn!;
    const long = spawnRoom.w >= spawnRoom.h;
    const span = (long ? spawnRoom.w : spawnRoom.h) * CELL;
    const d = Math.min(4.5, span * 0.45);
    const cx = sp.x + Math.sin(sp.yaw) * d;
    const cz = sp.z + Math.cos(sp.yaw) * d;
    const id = uid();
    wc.props.push({ kind: 'chair', x: cx, y: wc.ceil, z: cz, rot: sp.yaw + 2.6, s: 1, roll: Math.PI, anomaly: id });
    wc.anomalies.push({ uid: id, type: 'chair-ceiling', tier: 1, name: 'Chair on the ceiling', x: cx, y: wc.ceil - 0.45, z: cz, r: 0.6, roomId: spawnRoom.id });
    usedRooms.add(spawnRoom.id);
    // Guarantee the level's one wrong clock near spawn.
    const others = wc.rooms.filter((r) => r !== spawnRoom && r.kind === 'room');
    for (const r of rng.shuffle([...others])) {
      if (placeAnomaly(f, r, ANOMALY_BY_ID.get('clock-backwards')!, uid(), level, rng)) {
        usedRooms.add(r.id);
        break;
      }
    }
  } else if (spawnRoom) {
    usedRooms.add(spawnRoom.id);
    for (const r of rng.shuffle(wc.rooms.filter((q) => q !== spawnRoom))) {
      if (placeAnomaly(f, r, ANOMALY_BY_ID.get('clock-wrong')!, uid(), level, rng)) {
        usedRooms.add(r.id);
        break;
      }
    }
  }
  const budget = anomalyBudget(level, cx, cz);
  const types = ANOMALY_TYPES.filter((t) => (t.weights[level] ?? 0) > 0);
  const weights = types.map((t) => t.weights[level] ?? 0);
  let tries = 0;
  while (wc.anomalies.length < budget && tries < 40) {
    tries++;
    const free = wc.rooms.filter((r) => !usedRooms.has(r.id));
    if (!free.length) break;
    const room = rng.pick(free);
    const t = types[rng.weighted(weights)]!;
    if (t.id === 'clock-backwards' || t.id === 'clock-wrong') continue; // one wrong clock per level, placed above
    if (placeAnomaly(f, room, t, uid(), level, rng)) usedRooms.add(room.id);
  }
}

export { PROP_SIZE, WALL_T };

/** Place an anomaly and return a function that reverts every change it made. All anomaly edits are additions, so revert truncates. */
export function placeRevertible(f: FurnishCtx, room: Room, type: AnomalyType, uid: string, level: number, rng: Rng): { inst: AnomalyInstance; revert: () => void } | null {
  const wc = f.wc;
  const lens = {
    props: wc.props.length,
    decals: wc.decals.length,
    clocks: wc.clocks.length,
    colliders: wc.colliders.length,
    anomalies: wc.anomalies.length,
    tints: wc.tints.length,
    patches: wc.patches.length,
    silent: wc.silent.length,
    tall: wc.tallDoors.length,
  };
  const inst = placeAnomaly(f, room, type, uid, level, rng);
  if (!inst) return null;
  return {
    inst,
    revert: () => {
      wc.props.length = lens.props;
      wc.decals.length = lens.decals;
      wc.clocks.length = lens.clocks;
      wc.colliders.length = lens.colliders;
      wc.anomalies.length = lens.anomalies;
      wc.tints.length = lens.tints;
      wc.patches.length = lens.patches;
      wc.silent.length = lens.silent;
      wc.tallDoors.length = lens.tall;
    },
  };
}
