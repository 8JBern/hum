/**
 * Furnishes a generated chunk: partitions, props, decals, clocks, pickups and anomalies.
 * Pure and deterministic: a function of (seed, level, cx, cz) only.
 */
import { Rng, hashString } from '../core/rng.ts';
import { CHUNK_SIZE, type Room, generateChunk, hIndex, vIndex } from './chunk.ts';
import { reachableCells } from './navigation.ts';
import {
  CELL,
  CHUNK_M,
  WALL_T,
  type AnomalyInstance,
  type Collider,
  type Decal,
  type Prop,
  type PropKind,
  type WallSpot,
  type WorldChunk,
} from './types.ts';
import { applyAnomalies } from '../anomalies/registry.ts';

const S = CHUNK_SIZE;
const SALT_FURNISH = hashString('hum/chunk/furnish');

export const LEVEL_CEIL: Record<number, number> = { 0: 2.7, 1: 3.2, 2: 2.6 };
export const EVIDENCE_THRESHOLD: Record<number, number> = { 0: 8, 1: 10, 2: 12 };

/** Prop footprint (width along local x, depth along facing, height) in metres. */
export const PROP_SIZE: Record<PropKind, [number, number, number]> = {
  desk: [1.4, 0.7, 0.75],
  chair: [0.5, 0.5, 0.92],
  cabinet: [0.5, 0.6, 1.3],
  cabinetOpen: [0.5, 0.6, 1.3],
  cooler: [0.36, 0.36, 1.3],
  plant: [0.42, 0.42, 1.15],
  monitor: [0.42, 0.38, 0.4],
  crt: [0.5, 0.48, 0.45],
  phone: [0.22, 0.2, 0.1],
  box: [0.5, 0.4, 0.36],
  pillar: [0.5, 0.5, 1],
  bench: [1.6, 0.42, 0.46],
  locker: [0.9, 0.5, 1.9],
  lifechair: [0.8, 0.8, 1.9],
  stairs: [1.0, 2.0, 1],
  door: [0.9, 0.06, 2.05],
  umbrella: [1.0, 1.0, 0.9],
  shoe: [0.12, 0.2, 0.08],
  ladder: [0.6, 0.3, 1.8],
  divingboard: [0.5, 2.2, 0.12],
  cone: [0.3, 0.3, 0.6],
  table: [1.0, 1.0, 0.74],
  towel: [0.5, 0.05, 0.9],
  lanerope: [0.12, 4, 0.12],
  wallpanel: [1.2, 0.08, 0.6],
  void: [0.6, 0.6, 0.02],
};

const COLLIDES: Partial<Record<PropKind, number>> = {
  desk: 1,
  cabinet: 1,
  cabinetOpen: 1,
  cooler: 1,
  box: 1,
  pillar: 1,
  bench: 1,
  locker: 1,
  lifechair: 1,
  table: 1,
  plant: 1,
  stairs: 1,
};

export interface FurnishCtx {
  wc: WorldChunk;
  rng: Rng;
  /** Cells that must stay clear (next to openings). */
  reserved: Uint8Array;
  /** Cells already used by furniture. */
  used: Uint8Array;
}

function cellOf(wc: WorldChunk, x: number, z: number): [number, number] {
  return [Math.floor((x - wc.ox) / CELL), Math.floor((z - wc.oz) / CELL)];
}

export function wallAt(wc: WorldChunk, lx: number, lz: number, side: 'west' | 'east' | 'north' | 'south'): number {
  switch (side) {
    case 'west':
      return wc.vWalls[vIndex(S, lx, lz)]!;
    case 'east':
      return wc.vWalls[vIndex(S, lx + 1, lz)]!;
    case 'north':
      return wc.hWalls[hIndex(S, lx, lz)]!;
    case 'south':
      return wc.hWalls[hIndex(S, lx, lz + 1)]!;
  }
}

/** Solid wall faces (value 1) bounding a room, as mount spots facing into the room. */
export function wallSpots(wc: WorldChunk, room: Room): WallSpot[] {
  const out: WallSpot[] = [];
  const f = WALL_T / 2 + 0.005;
  for (let z = room.z; z < room.z + room.h; z++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const bx = wc.ox + x * CELL;
      const bz = wc.oz + z * CELL;
      if (x === room.x && wallAt(wc, x, z, 'west') === 1) out.push({ x: bx + f, z: bz + 1, rot: Math.PI / 2, nx: 1, nz: 0, cellX: x, cellZ: z });
      if (x === room.x + room.w - 1 && wallAt(wc, x, z, 'east') === 1)
        out.push({ x: bx + CELL - f, z: bz + 1, rot: -Math.PI / 2, nx: -1, nz: 0, cellX: x, cellZ: z });
      if (z === room.z && wallAt(wc, x, z, 'north') === 1) out.push({ x: bx + 1, z: bz + f, rot: 0, nx: 0, nz: 1, cellX: x, cellZ: z });
      if (z === room.z + room.h - 1 && wallAt(wc, x, z, 'south') === 1)
        out.push({ x: bx + 1, z: bz + CELL - f, rot: Math.PI, nx: 0, nz: -1, cellX: x, cellZ: z });
    }
  }
  return out;
}

/** Open edges on a room's boundary that look like doorways (wall on both sides along the line). */
export function roomDoorways(wc: WorldChunk, room: Room): { key: string; x: number; z: number; rot: number }[] {
  const out: { key: string; x: number; z: number; rot: number }[] = [];
  const isDoorV = (lx: number, lz: number): boolean =>
    wc.vWalls[vIndex(S, lx, lz)] === 0 && (lz === 0 || wc.vWalls[vIndex(S, lx, lz - 1)] === 1) && (lz === S - 1 || wc.vWalls[vIndex(S, lx, lz + 1)] === 1);
  const isDoorH = (lx: number, lz: number): boolean =>
    wc.hWalls[hIndex(S, lx, lz)] === 0 && (lx === 0 || wc.hWalls[hIndex(S, lx - 1, lz)] === 1) && (lx === S - 1 || wc.hWalls[hIndex(S, lx + 1, lz)] === 1);
  for (let z = room.z; z < room.z + room.h; z++) {
    for (const lx of [room.x, room.x + room.w]) {
      if (lx > 0 && lx < S && isDoorV(lx, z)) out.push({ key: `v:${lx}:${z}`, x: wc.ox + lx * CELL, z: wc.oz + z * CELL + 1, rot: Math.PI / 2 });
    }
  }
  for (let x = room.x; x < room.x + room.w; x++) {
    for (const lz of [room.z, room.z + room.h]) {
      if (lz > 0 && lz < S && isDoorH(x, lz)) out.push({ key: `h:${x}:${lz}`, x: wc.ox + x * CELL + 1, z: wc.oz + lz * CELL, rot: 0 });
    }
  }
  return out;
}

export function addCollider(wc: WorldChunk, p: Prop): Collider | null {
  if (!COLLIDES[p.kind] || p.y > 1.4) return null;
  const [w, d] = PROP_SIZE[p.kind];
  const sw = w * p.s;
  const sd = d * p.s;
  const q = Math.round(p.rot / (Math.PI / 2)) & 1;
  const hx = (q ? sd : sw) / 2;
  const hz = (q ? sw : sd) / 2;
  const c: Collider = { x0: p.x - hx, z0: p.z - hz, x1: p.x + hx, z1: p.z + hz };
  wc.colliders.push(c);
  return c;
}

function markUsed(ctx: FurnishCtx, x: number, z: number): void {
  const [lx, lz] = cellOf(ctx.wc, x, z);
  if (lx >= 0 && lz >= 0 && lx < S && lz < S) ctx.used[lz * S + lx] = 1;
}

export function cellFree(ctx: FurnishCtx, lx: number, lz: number): boolean {
  return lx >= 0 && lz >= 0 && lx < S && lz < S && !ctx.reserved[lz * S + lx] && !ctx.used[lz * S + lx];
}

export function pushProp(ctx: FurnishCtx, p: Prop): Prop {
  ctx.wc.props.push(p);
  addCollider(ctx.wc, p);
  markUsed(ctx, p.x, p.z);
  return p;
}

export function pushDecal(wc: WorldChunk, d: Decal): void {
  wc.decals.push(d);
}

/** Build the furnished world chunk. */
export function buildWorldChunk(seed: number, level: number, cx: number, cz: number, variant = 0): WorldChunk {
  const base = generateChunk(seed, level, cx, cz);
  const wc: WorldChunk = {
    ...base,
    vWalls: new Uint8Array(base.vWalls),
    hWalls: new Uint8Array(base.hWalls),
    ox: cx * CHUNK_M,
    oz: cz * CHUNK_M,
    ceil: LEVEL_CEIL[level] ?? 2.7,
    props: [],
    decals: [],
    clocks: [],
    pickups: [],
    colliders: [],
    anomalies: [],
    tints: [],
    patches: [],
    silent: [],
    tallDoors: [],
  };
  const rng = Rng.from(seed, level, cx, cz, SALT_FURNISH, variant);
  const ctx: FurnishCtx = { wc, rng, reserved: new Uint8Array(S * S), used: new Uint8Array(S * S) };
  reserveOpenings(ctx);
  if (level === 0) addPartitions(ctx);

  // Spawn room on the origin chunk: the largest room.
  let spawnRoom: Room | null = null;
  if (cx === 0 && cz === 0) {
    spawnRoom = [...wc.rooms].sort((a, b) => b.w * b.h - a.w * a.h || a.id - b.id)[0]!;
    setupSpawn(ctx, spawnRoom);
  }

  for (const room of wc.rooms) {
    if (level === 1) furnishPool(ctx, room);
    else furnishOffice(ctx, room);
  }

  // Clocks: up to two per chunk, on wall faces.
  const clockRooms = rng.shuffle(wc.rooms.filter((r) => r.kind === 'room' && r !== spawnRoom)).slice(0, rng.int(1, 2));
  for (const room of clockRooms) {
    const spots = wallSpots(wc, room);
    if (!spots.length) continue;
    const s = rng.pick(spots);
    wc.clocks.push({ x: s.x + s.nx * 0.02, y: 2.05, z: s.z + s.nz * 0.02, rot: s.rot, mode: 0 });
  }

  // Batteries are scarce: about one per two chunks, plus one in the spawn room.
  if (rng.chance(level === 1 ? 0.45 : 0.5)) {
    const desks = wc.props.filter((p) => p.kind === 'desk' || p.kind === 'bench' || p.kind === 'table');
    if (desks.length) {
      const d = rng.pick(desks);
      wc.pickups.push({ id: `b:${cx}:${cz}:0`, kind: 'battery', x: d.x, y: PROP_SIZE[d.kind][2] * d.s + 0.06, z: d.z });
    } else {
      const room = rng.pick(wc.rooms);
      wc.pickups.push({ id: `b:${cx}:${cz}:0`, kind: 'battery', x: wc.ox + (room.x + room.w / 2) * CELL, y: 0.06, z: wc.oz + (room.z + room.h / 2) * CELL });
    }
  }

  applyAnomalies(ctx, seed, level, cx, cz, spawnRoom, variant);
  return wc;
}

function reserveOpenings(ctx: FurnishCtx): void {
  const { wc } = ctx;
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const room = wc.roomOf[z * S + x];
      const nb: [number, number, 'west' | 'east' | 'north' | 'south'][] = [
        [x - 1, z, 'west'],
        [x + 1, z, 'east'],
        [x, z - 1, 'north'],
        [x, z + 1, 'south'],
      ];
      for (const [nx, nz, side] of nb) {
        if (wallAt(wc, x, z, side) !== 0) continue;
        const outside = nx < 0 || nz < 0 || nx >= S || nz >= S || wc.roomOf[nz * S + nx] !== room;
        if (outside) ctx.reserved[z * S + x] = 1;
      }
    }
  }
}

/** Low cubicle partitions in big open rooms, kept only if the chunk stays fully connected. */
function addPartitions(ctx: FurnishCtx): void {
  const { wc, rng } = ctx;
  for (const room of wc.rooms) {
    if (room.w < 5 || room.h < 5 || !rng.chance(0.6)) continue;
    const vertical = room.w >= room.h;
    const lines = vertical ? room.w : room.h;
    for (let li = 2; li < lines - 1; li += 2) {
      const len = vertical ? room.h : room.w;
      for (let k = 1; k < len - 1; k++) {
        if (rng.chance(0.35)) continue;
        const x = vertical ? room.x + li : room.x + k;
        const z = vertical ? room.z + k : room.z + li;
        const arr = vertical ? wc.vWalls : wc.hWalls;
        const idx = vertical ? vIndex(S, x, z) : hIndex(S, x, z);
        if (arr[idx] !== 0) continue;
        arr[idx] = 3;
        const seen = reachableCells(wc, 0, 0);
        let all = true;
        for (let i = 0; i < seen.length; i++) if (!seen[i]) all = false;
        if (!all) arr[idx] = 0;
      }
    }
  }
}

function setupSpawn(ctx: FurnishCtx, room: Room): void {
  const { wc } = ctx;
  const long = room.w >= room.h;
  // Stand at one end of the long axis and face the other.
  const cxm = wc.ox + (room.x + room.w / 2) * CELL;
  const czm = wc.oz + (room.z + room.h / 2) * CELL;
  const half = ((long ? room.w : room.h) * CELL) / 2;
  const sx = long ? wc.ox + room.x * CELL + 1.2 : cxm;
  const sz = long ? czm : wc.oz + room.z * CELL + 1.2;
  // Facing +x is yaw pi/2 in prop convention; camera yaw uses the same convention.
  const yaw = long ? Math.PI / 2 : 0;
  wc.spawn = { x: sx, z: sz, yaw };
  // Far end: desk with the battery and the note.
  const fx = long ? wc.ox + (room.x + room.w) * CELL - 0.75 : cxm;
  const fz = long ? czm : wc.oz + (room.z + room.h) * CELL - 0.75;
  const pool = wc.level === 1;
  const desk = pushProp(ctx, { kind: pool ? 'bench' : 'desk', x: fx, y: 0, z: fz, rot: long ? -Math.PI / 2 : Math.PI, s: 1 });
  wc.pickups.push({ id: `b:0:0:spawn`, kind: 'battery', x: desk.x + (long ? 0 : 0.35), y: pool ? 0.52 : 0.81, z: desk.z + (long ? 0.35 : 0) });
  if (!pool) pushProp(ctx, { kind: 'monitor', x: desk.x, y: 0.75, z: desk.z, rot: desk.rot, s: 1 });
  // Sticky note on the far wall, above the desk.
  const nx = long ? -1 : 0;
  const nz = long ? 0 : -1;
  const wx = long ? wc.ox + (room.x + room.w) * CELL - WALL_T / 2 - 0.01 : cxm;
  const wz = long ? czm : wc.oz + (room.z + room.h) * CELL - WALL_T / 2 - 0.01;
  pushDecal(wc, { tile: 2, x: wx, y: 1.35, z: wz + (long ? -0.25 : 0), nx, ny: 0, nz, w: 0.32, h: 0.32, rot: 0.06, emit: 0 });
  if (!pool) pushProp(ctx, { kind: 'plant', x: desk.x + (long ? 0 : 0.95), y: 0, z: desk.z + (long ? 0.95 : 0), rot: 0, s: 1 });
  void half;
}

function furnishOffice(ctx: FurnishCtx, room: Room): void {
  const { wc, rng } = ctx;
  if (room.kind === 'corridor') {
    if (rng.chance(0.25)) {
      const spots = wallSpots(wc, room).filter((s) => cellFree(ctx, s.cellX, s.cellZ));
      if (spots.length) {
        const s = rng.pick(spots);
        pushProp(ctx, { kind: rng.chance(0.5) ? 'box' : 'chair', x: s.x + s.nx * 0.35, y: 0, z: s.z + s.nz * 0.35, rot: s.rot + rng.range(-0.6, 0.6), s: 1 });
      }
    }
    if (rng.chance(0.3)) addStain(ctx, room);
    return;
  }
  const area = room.w * room.h;
  const spots = rng.shuffle(wallSpots(wc, room).filter((s) => cellFree(ctx, s.cellX, s.cellZ)));
  const kind = area >= 20 ? 'open' : rng.pick(['office', 'office', 'storage', 'break'] as const);
  const n = Math.min(spots.length, kind === 'open' ? 6 : Math.max(1, Math.floor(area / 3)));
  for (let i = 0; i < n; i++) {
    const s = spots[i]!;
    if (!cellFree(ctx, s.cellX, s.cellZ)) continue;
    const r = rng.next();
    if (kind === 'storage') {
      if (r < 0.5) {
        pushProp(ctx, { kind: 'box', x: s.x + s.nx * 0.3, y: 0, z: s.z + s.nz * 0.3, rot: s.rot + rng.range(-0.2, 0.2), s: rng.range(0.9, 1.2) });
        if (rng.chance(0.5)) ctx.wc.props.push({ kind: 'box', x: s.x + s.nx * 0.3, y: 0.36, z: s.z + s.nz * 0.3, rot: s.rot + rng.range(-0.4, 0.4), s: 0.9 });
      } else pushProp(ctx, { kind: 'cabinet', x: s.x + s.nx * 0.31, y: 0, z: s.z + s.nz * 0.31, rot: s.rot, s: 1 });
    } else if (kind === 'break' && i === 0) {
      pushProp(ctx, { kind: 'cooler', x: s.x + s.nx * 0.25, y: 0, z: s.z + s.nz * 0.25, rot: s.rot, s: 1 });
    } else if (r < 0.62) {
      const desk = pushProp(ctx, { kind: 'desk', x: s.x + s.nx * 0.36, y: 0, z: s.z + s.nz * 0.36, rot: s.rot, s: 1 });
      ctx.wc.props.push({ kind: 'chair', x: s.x + s.nx * 1.0, y: 0, z: s.z + s.nz * 1.0, rot: s.rot + Math.PI + rng.range(-0.7, 0.7), s: 1 });
      if (rng.chance(0.55)) ctx.wc.props.push({ kind: 'monitor', x: desk.x + s.nx * -0.05, y: 0.75, z: desk.z + s.nz * -0.05, rot: s.rot, s: 1 });
      else if (rng.chance(0.3)) ctx.wc.props.push({ kind: 'phone', x: desk.x + s.nz * 0.45, y: 0.75, z: desk.z - s.nx * 0.45, rot: s.rot, s: 1 });
    } else if (r < 0.8) {
      pushProp(ctx, { kind: 'cabinet', x: s.x + s.nx * 0.31, y: 0, z: s.z + s.nz * 0.31, rot: s.rot, s: 1 });
    } else {
      pushProp(ctx, { kind: 'plant', x: s.x + s.nx * 0.35, y: 0, z: s.z + s.nz * 0.35, rot: rng.range(0, 6), s: rng.range(0.85, 1.1) });
    }
  }
  // Pillars in open rooms, at interior grid vertices with no partition touching them.
  if (kind === 'open' && rng.chance(0.5)) {
    for (let z = room.z + 2; z < room.z + room.h - 1; z += 3) {
      for (let x = room.x + 2; x < room.x + room.w - 1; x += 3) {
        const touches = wc.vWalls[vIndex(S, x, z)] || wc.vWalls[vIndex(S, x, z - 1)] || wc.hWalls[hIndex(S, x, z)] || wc.hWalls[hIndex(S, x - 1, z)];
        if (touches) continue;
        const p: Prop = { kind: 'pillar', x: wc.ox + x * CELL, y: 0, z: wc.oz + z * CELL, rot: 0, s: 1 };
        wc.props.push(p);
        addCollider(wc, p);
      }
    }
  }
  if (rng.chance(0.45)) addStain(ctx, room);
}

function furnishPool(ctx: FurnishCtx, room: Room): void {
  const { wc, rng } = ctx;
  const spots = rng.shuffle(wallSpots(wc, room).filter((s) => cellFree(ctx, s.cellX, s.cellZ)));
  if (room.kind === 'corridor') {
    if (spots.length && rng.chance(0.3)) {
      const s = spots[0]!;
      pushProp(ctx, { kind: 'bench', x: s.x + s.nx * 0.26, y: 0, z: s.z + s.nz * 0.26, rot: s.rot, s: 1 });
    }
    return;
  }
  const n = Math.min(spots.length, Math.max(1, Math.floor((room.w * room.h) / 5)));
  for (let i = 0; i < n; i++) {
    const s = spots[i]!;
    if (!cellFree(ctx, s.cellX, s.cellZ)) continue;
    const r = rng.next();
    if (r < 0.4) pushProp(ctx, { kind: 'bench', x: s.x + s.nx * 0.26, y: 0, z: s.z + s.nz * 0.26, rot: s.rot, s: 1 });
    else if (r < 0.65) pushProp(ctx, { kind: 'locker', x: s.x + s.nx * 0.28, y: 0, z: s.z + s.nz * 0.28, rot: s.rot, s: 1 });
    else if (r < 0.75) pushProp(ctx, { kind: 'lifechair', x: s.x + s.nx * 0.5, y: 0, z: s.z + s.nz * 0.5, rot: s.rot, s: 1 });
    else if (r < 0.85) ctx.wc.props.push({ kind: 'cone', x: s.x + s.nx * 0.6, y: 0, z: s.z + s.nz * 0.6, rot: rng.range(0, 6), s: 1 });
  }
  // Pillars in big halls.
  if (room.w >= 4 && room.h >= 4) {
    for (let z = room.z + 2; z < room.z + room.h - 1; z += 2) {
      for (let x = room.x + 2; x < room.x + room.w - 1; x += 2) {
        if (!rng.chance(0.5)) continue;
        const p: Prop = { kind: 'pillar', x: wc.ox + x * CELL, y: 0, z: wc.oz + z * CELL, rot: 0, s: 1 };
        wc.props.push(p);
        addCollider(wc, p);
      }
    }
  }
  // Lane markings on the floor.
  if (room.w >= 3 && room.h >= 3 && rng.chance(0.6)) {
    const vertical = room.w < room.h;
    const len = (vertical ? room.h : room.w) * CELL - 1.5;
    const lanes = vertical ? room.w : room.h;
    for (let k = 1; k < lanes; k++) {
      const x = vertical ? wc.ox + (room.x + k) * CELL : wc.ox + (room.x + room.w / 2) * CELL;
      const z = vertical ? wc.oz + (room.z + room.h / 2) * CELL : wc.oz + (room.z + k) * CELL;
      pushDecal(wc, { tile: 17, x, y: 0.012, z, nx: 0, ny: 1, nz: 0, w: 0.3, h: len, rot: vertical ? 0 : Math.PI / 2, emit: 0 });
    }
  }
}

function addStain(ctx: FurnishCtx, room: Room): void {
  const { wc, rng } = ctx;
  const x = wc.ox + (room.x + rng.range(0.3, room.w - 0.3)) * CELL;
  const z = wc.oz + (room.z + rng.range(0.3, room.h - 0.3)) * CELL;
  const s = rng.range(0.8, 2.2);
  pushDecal(wc, { tile: rng.chance(0.5) ? 0 : 18, x, y: 0.008 + rng.range(0, 0.003), z, nx: 0, ny: 1, nz: 0, w: s, h: s * rng.range(0.6, 1), rot: rng.range(0, 6.28), emit: 0 });
  if (rng.chance(0.4)) {
    pushDecal(wc, {
      tile: 23,
      x: wc.ox + (room.x + rng.range(0.3, room.w - 0.3)) * CELL,
      y: wc.ceil - 0.006,
      z: wc.oz + (room.z + rng.range(0.3, room.h - 0.3)) * CELL,
      nx: 0,
      ny: -1,
      nz: 0,
      w: 1.2,
      h: 1.2,
      rot: rng.range(0, 6),
      emit: 0,
    });
  }
}

/** Chunk furnishing snapshot used by the registry revert test. */
export function snapshotContent(wc: WorldChunk): string {
  return JSON.stringify({
    v: Array.from(wc.vWalls),
    h: Array.from(wc.hWalls),
    props: wc.props,
    decals: wc.decals,
    clocks: wc.clocks,
    pickups: wc.pickups,
    colliders: wc.colliders,
    anomalies: wc.anomalies,
    tints: wc.tints,
    patches: wc.patches,
    silent: wc.silent,
    tall: wc.tallDoors,
  });
}

export type { AnomalyInstance };
