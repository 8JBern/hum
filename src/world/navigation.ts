/**
 * Navigation helpers over generated chunks: cell-level BFS (used by tests and,
 * later, test bots) and a per-chunk room graph (for the Occupant).
 */
import { type Chunk, type Side, SIDES, canStep } from './chunk.ts';

const DELTA: Readonly<Record<Side, readonly [number, number]>> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

/**
 * BFS over the cells of one chunk from (sx, sz). Returns a Uint8Array mask of
 * reached cells (row-major). Border doorways are not followed out of the chunk.
 */
export function reachableCells(chunk: Chunk, sx: number, sz: number): Uint8Array {
  const s = chunk.size;
  const seen = new Uint8Array(s * s);
  const queue: number[] = [sz * s + sx];
  seen[sz * s + sx] = 1;
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head] as number;
    const x = idx % s;
    const z = (idx - x) / s;
    for (const side of SIDES) {
      if (!canStep(chunk, x, z, side)) continue;
      const [dx, dz] = DELTA[side];
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= s || nz >= s) continue; // a border doorway
      const n = nz * s + nx;
      if (seen[n]) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}

/** Chunk-local cell just inside a border doorway. */
export function doorwayCell(size: number, side: Side, offset: number): [number, number] {
  switch (side) {
    case 'north':
      return [offset, 0];
    case 'south':
      return [offset, size - 1];
    case 'west':
      return [0, offset];
    case 'east':
      return [size - 1, offset];
  }
}

export interface RoomEdge {
  a: number;
  b: number;
  /** Number of open cell edges between the two rooms (1 for a doorway). */
  width: number;
}

export interface RoomGraph {
  rooms: number;
  edges: RoomEdge[];
  /** Rooms that touch each border doorway, in the same order as chunk.borderDoors[side]. */
  exits: Record<Side, number[]>;
}

/** Room adjacency inside one chunk, from open edges between cells of different rooms. */
export function buildRoomGraph(chunk: Chunk): RoomGraph {
  const s = chunk.size;
  const widths = new Map<string, number>();
  const link = (a: number, b: number): void => {
    if (a === b) return;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    widths.set(key, (widths.get(key) ?? 0) + 1);
  };
  for (let z = 0; z < s; z++) {
    for (let x = 0; x < s; x++) {
      const here = chunk.roomOf[z * s + x] as number;
      if (x + 1 < s && canStep(chunk, x, z, 'east')) link(here, chunk.roomOf[z * s + x + 1] as number);
      if (z + 1 < s && canStep(chunk, x, z, 'south')) link(here, chunk.roomOf[(z + 1) * s + x] as number);
    }
  }
  const edges: RoomEdge[] = [...widths.entries()]
    .map(([key, width]) => {
      const [a, b] = key.split(',').map(Number) as [number, number];
      return { a, b, width };
    })
    .sort((p, q) => p.a - q.a || p.b - q.b);
  const exits = {} as Record<Side, number[]>;
  for (const side of SIDES) {
    exits[side] = chunk.borderDoors[side].map((o) => {
      const [x, z] = doorwayCell(s, side, o);
      return chunk.roomOf[z * s + x] as number;
    });
  }
  return { rooms: chunk.rooms.length, edges, exits };
}
