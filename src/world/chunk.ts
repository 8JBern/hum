/**
 * Deterministic chunk generator.
 *
 * A chunk is CHUNK_SIZE x CHUNK_SIZE cells. Every cell is walkable floor;
 * walls are thin and sit on cell edges (like office partitions), which keeps
 * the data small and makes connectivity easy to reason about.
 *
 * Coordinates: x grows east, z grows south. Chunk (cx, cz) covers world cells
 * [cx*S, cx*S + S) x [cz*S, cz*S + S). North is -z.
 *
 * Layout, in order:
 *   1. Perimeter: every border edge is a wall except its doorways. Doorways come
 *      from a stream keyed only by the border itself (not by either chunk), so
 *      both neighbours compute identical doorways without seeing each other.
 *   2. Interior: binary space partition into rooms and corridors. Each split
 *      wall gets at least one doorway, or is left out entirely (open plan).
 *      By induction every BSP subtree is internally connected, so the whole
 *      interior is one connected region and every border doorway reaches every
 *      other one. Tests re-prove this with BFS instead of trusting the argument.
 */
import { Rng, hashString } from '../core/rng.ts';

export const CHUNK_SIZE = 16;
/** World metres per cell. Brief 5.4.1 suggestion. */
export const CELL_METRES = 2;
/** Ceiling height in metres. Brief 5.4.1 suggestion; unused by the generator itself. */
export const CEILING_METRES = 2.7;

const SALT_INTERIOR = hashString('hum/chunk/interior');
const SALT_BORDER = hashString('hum/chunk/border');

export type Side = 'north' | 'east' | 'south' | 'west';
export const SIDES: readonly Side[] = ['north', 'east', 'south', 'west'];

export type RoomKind = 'room' | 'corridor';

export interface Room {
  id: number;
  kind: RoomKind;
  /** Chunk-local cell rectangle. */
  x: number;
  z: number;
  w: number;
  h: number;
}

/** Tunable per level (biome). Values here are first guesses, see GUESSES.md. */
export interface LayoutParams {
  /** Smallest room side, in cells. */
  minRoom: number;
  /** Rooms with a side above this are always split further. */
  maxRoom: number;
  /** Chance to keep splitting a rect that is splittable but not over maxRoom. */
  splitChance: number;
  /** Chance a split wall is omitted entirely, giving open-plan space. */
  openPlanChance: number;
  /** Chance a split carves a corridor strip instead of a free split. */
  corridorChance: number;
  corridorWidth: number;
  /** Chance of a second doorway in a split wall of length >= 6. */
  extraDoorChance: number;
  /** Doorways per chunk border, inclusive range. */
  borderDoorsMin: number;
  borderDoorsMax: number;
}

export const LEVEL_PARAMS: Readonly<Record<number, LayoutParams>> = {
  // Level A "After Hours": cramped offices, partitions, narrow corridors.
  0: {
    minRoom: 2,
    maxRoom: 7,
    splitChance: 0.55,
    openPlanChance: 0.15,
    corridorChance: 0.25,
    corridorWidth: 2,
    extraDoorChance: 0.4,
    borderDoorsMin: 1,
    borderDoorsMax: 3,
  },
  // Level B "Chlorine": larger pool halls, more open plan.
  1: {
    minRoom: 3,
    maxRoom: 10,
    splitChance: 0.4,
    openPlanChance: 0.3,
    corridorChance: 0.15,
    corridorWidth: 2,
    extraDoorChance: 0.5,
    borderDoorsMin: 1,
    borderDoorsMax: 3,
  },
};

export function paramsForLevel(level: number): LayoutParams {
  const p = LEVEL_PARAMS[level];
  if (!p) throw new RangeError(`No layout params for level ${level}`);
  return p;
}

export interface Chunk {
  readonly seed: number;
  readonly level: number;
  readonly cx: number;
  readonly cz: number;
  readonly size: number;
  /**
   * Vertical edges, (size + 1) * size. `vWalls[vIndex(x, z)]` is 1 when there
   * is a wall on the west edge of cell (x, z). x = size is the east border.
   */
  readonly vWalls: Uint8Array;
  /**
   * Horizontal edges, size * (size + 1). `hWalls[hIndex(x, z)]` is 1 when there
   * is a wall on the north edge of cell (x, z). z = size is the south border.
   */
  readonly hWalls: Uint8Array;
  /** Room id per cell, size * size, row-major (z * size + x). */
  readonly roomOf: Int16Array;
  readonly rooms: readonly Room[];
  /** Doorway offsets along each border, ascending, in 1..size-2. */
  readonly borderDoors: Readonly<Record<Side, readonly number[]>>;
}

export const vIndex = (size: number, x: number, z: number): number => z * (size + 1) + x;
export const hIndex = (size: number, x: number, z: number): number => z * size + x;

/**
 * Doorways on one border. A border is named canonically so both chunks that
 * share it ask the same question:
 *   axis 'v': the vertical line at chunk-column boundary bx (west edge of chunk bx), row bz.
 *   axis 'h': the horizontal line at chunk-row boundary bz (north edge of chunk bz), column bx.
 */
export function borderDoorways(
  seed: number,
  level: number,
  axis: 'v' | 'h',
  bx: number,
  bz: number,
  size: number = CHUNK_SIZE,
): number[] {
  const p = paramsForLevel(level);
  const rng = Rng.from(seed, level, axis === 'v' ? 0 : 1, bx, bz, SALT_BORDER);
  const count = rng.int(p.borderDoorsMin, p.borderDoorsMax);
  // Offsets 1..size-2 keep doorways off chunk corners.
  return rng.sample(1, size - 2, count);
}

export function generateChunk(seed: number, level: number, cx: number, cz: number, size: number = CHUNK_SIZE): Chunk {
  if (!Number.isInteger(seed) || !Number.isInteger(level) || !Number.isInteger(cx) || !Number.isInteger(cz)) {
    throw new RangeError('generateChunk expects integer seed, level, cx, cz');
  }
  if (!Number.isInteger(size) || size < 8) throw new RangeError('Chunk size must be an integer >= 8');
  const p = paramsForLevel(level);

  const vWalls = new Uint8Array((size + 1) * size);
  const hWalls = new Uint8Array(size * (size + 1));
  const roomOf = new Int16Array(size * size).fill(-1);
  const rooms: Room[] = [];

  // 1. Perimeter with canonical border doorways.
  const borderDoors: Record<Side, number[]> = {
    west: borderDoorways(seed, level, 'v', cx, cz, size),
    east: borderDoorways(seed, level, 'v', cx + 1, cz, size),
    north: borderDoorways(seed, level, 'h', cx, cz, size),
    south: borderDoorways(seed, level, 'h', cx, cz + 1, size),
  };
  for (let i = 0; i < size; i++) {
    vWalls[vIndex(size, 0, i)] = 1;
    vWalls[vIndex(size, size, i)] = 1;
    hWalls[hIndex(size, i, 0)] = 1;
    hWalls[hIndex(size, i, size)] = 1;
  }
  for (const z of borderDoors.west) vWalls[vIndex(size, 0, z)] = 0;
  for (const z of borderDoors.east) vWalls[vIndex(size, size, z)] = 0;
  for (const x of borderDoors.north) hWalls[hIndex(size, x, 0)] = 0;
  for (const x of borderDoors.south) hWalls[hIndex(size, x, size)] = 0;

  // 2. Interior BSP. Iterative with an explicit stack so the draw order is
  // fixed and recursion depth is not a concern.
  const rng = Rng.from(seed, level, cx, cz, SALT_INTERIOR);
  interface Rect {
    x: number;
    z: number;
    w: number;
    h: number;
    forcedKind?: RoomKind;
  }
  const stack: Rect[] = [{ x: 0, z: 0, w: size, h: size }];

  const addRoom = (r: Rect, kind: RoomKind): void => {
    const id = rooms.length;
    rooms.push({ id, kind, x: r.x, z: r.z, w: r.w, h: r.h });
    for (let z = r.z; z < r.z + r.h; z++) {
      for (let x = r.x; x < r.x + r.w; x++) roomOf[z * size + x] = id;
    }
  };

  while (stack.length > 0) {
    const r = stack.pop() as Rect;
    if (r.forcedKind) {
      addRoom(r, r.forcedKind);
      continue;
    }
    const canV = r.w >= p.minRoom * 2;
    const canH = r.h >= p.minRoom * 2;
    const mustSplit = r.w > p.maxRoom || r.h > p.maxRoom;
    if (!(canV || canH) || (!mustSplit && !rng.chance(p.splitChance))) {
      addRoom(r, classify(r));
      continue;
    }

    // Split across the longer side; break near-squares randomly.
    let vertical: boolean;
    if (canV && !canH) vertical = true;
    else if (canH && !canV) vertical = false;
    else if (r.w > r.h * 1.25) vertical = true;
    else if (r.h > r.w * 1.25) vertical = false;
    else vertical = rng.chance(0.5);

    const span = vertical ? r.w : r.h;
    const len = vertical ? r.h : r.w;
    let pos: number;
    let corridorSide: 'low' | 'high' | null = null;
    if (span >= p.corridorWidth + p.minRoom && rng.chance(p.corridorChance)) {
      corridorSide = rng.chance(0.5) ? 'low' : 'high';
      pos = corridorSide === 'low' ? p.corridorWidth : span - p.corridorWidth;
    } else {
      pos = rng.int(p.minRoom, span - p.minRoom);
    }

    // Wall along the split line, with doorways, unless open plan.
    if (!rng.chance(p.openPlanChance)) {
      const doorCount = len >= 6 && rng.chance(p.extraDoorChance) ? 2 : 1;
      const doors = new Set(rng.sample(0, len - 1, doorCount));
      for (let i = 0; i < len; i++) {
        if (doors.has(i)) continue;
        if (vertical) vWalls[vIndex(size, r.x + pos, r.z + i)] = 1;
        else hWalls[hIndex(size, r.x + i, r.z + pos)] = 1;
      }
    }

    const low: Rect = vertical ? { x: r.x, z: r.z, w: pos, h: r.h } : { x: r.x, z: r.z, w: r.w, h: pos };
    const high: Rect = vertical
      ? { x: r.x + pos, z: r.z, w: r.w - pos, h: r.h }
      : { x: r.x, z: r.z + pos, w: r.w, h: r.h - pos };
    if (corridorSide === 'low') low.forcedKind = 'corridor';
    if (corridorSide === 'high') high.forcedKind = 'corridor';
    // Push high first so low is processed first: fixed, documented order.
    stack.push(high, low);
  }

  return { seed, level, cx, cz, size, vWalls, hWalls, roomOf, rooms, borderDoors };
}

function classify(r: { w: number; h: number }): RoomKind {
  return Math.min(r.w, r.h) <= 2 && Math.max(r.w, r.h) >= 5 ? 'corridor' : 'room';
}

/** Is movement possible from cell (x, z) one step in `side`? Chunk-local; border edges count. */
export function canStep(chunk: Chunk, x: number, z: number, side: Side): boolean {
  const s = chunk.size;
  switch (side) {
    case 'west':
      return chunk.vWalls[vIndex(s, x, z)] === 0;
    case 'east':
      return chunk.vWalls[vIndex(s, x + 1, z)] === 0;
    case 'north':
      return chunk.hWalls[hIndex(s, x, z)] === 0;
    case 'south':
      return chunk.hWalls[hIndex(s, x, z + 1)] === 0;
  }
}

/**
 * Stable 32-bit FNV-1a hash of everything that defines the layout. Two chunks
 * with the same hash are, for gameplay purposes, the same chunk.
 */
export function layoutHash(chunk: Chunk): string {
  let h = 0x811c9dc5;
  const feed = (byte: number): void => {
    h ^= byte & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  const feedInt = (v: number): void => {
    feed(v);
    feed(v >>> 8);
    feed(v >>> 16);
    feed(v >>> 24);
  };
  feedInt(chunk.size);
  for (const b of chunk.vWalls) feed(b);
  for (const b of chunk.hWalls) feed(b);
  for (const r of chunk.roomOf) feedInt(r);
  for (const room of chunk.rooms) {
    feed(room.kind === 'corridor' ? 1 : 0);
    feedInt(room.x);
    feedInt(room.z);
    feedInt(room.w);
    feedInt(room.h);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
