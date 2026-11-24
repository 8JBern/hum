import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  LEVEL_PARAMS,
  SIDES,
  type Chunk,
  type Side,
  generateChunk,
  hIndex,
  layoutHash,
  vIndex,
} from '../../src/world/chunk.ts';
import { buildRoomGraph, doorwayCell, reachableCells } from '../../src/world/navigation.ts';

const LEVELS = Object.keys(LEVEL_PARAMS).map(Number);
const SEEDS = Array.from({ length: 200 }, (_, i) => (i * 2654435761) >>> 0 || 1);
/** 5 x 5 = 25 chunks per seed, centred on the origin so negatives are covered. */
const PATCH = [-2, -1, 0, 1, 2];

describe('generator determinism (brief 9.1 #2)', () => {
  it('same seed, level and chunk give an identical layout hash', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS.slice(0, 20)) {
        for (const [cx, cz] of [[0, 0], [3, -7], [-1000, 999]] as const) {
          expect(layoutHash(generateChunk(seed, level, cx, cz))).toBe(layoutHash(generateChunk(seed, level, cx, cz)));
        }
      }
    }
  });

  it('does not depend on generation order', () => {
    const forward = PATCH.flatMap((cz) => PATCH.map((cx) => layoutHash(generateChunk(99, 0, cx, cz))));
    const backward = [...PATCH].reverse().flatMap((cz) => [...PATCH].reverse().map((cx) => layoutHash(generateChunk(99, 0, cx, cz))));
    expect(backward.reverse()).toEqual(forward);
  });

  it('pins known hashes so accidental generator changes fail loudly', () => {
    expect({
      a00: layoutHash(generateChunk(1234, 0, 0, 0)),
      a1m1: layoutHash(generateChunk(1234, 0, 1, -1)),
      b00: layoutHash(generateChunk(1234, 1, 0, 0)),
    }).toMatchInlineSnapshot(`
      {
        "a00": "a0625bdb",
        "a1m1": "85516597",
        "b00": "23d9a2fe",
      }
    `);
  });

  it('varies with seed, level and position', () => {
    const hashes = new Set<string>();
    for (const seed of SEEDS.slice(0, 10)) for (const level of LEVELS) for (const cx of PATCH) hashes.add(layoutHash(generateChunk(seed, level, cx, 0)));
    // Collisions are possible in principle; demand near-total uniqueness.
    expect(hashes.size).toBeGreaterThan(SEEDS.slice(0, 10).length * LEVELS.length * PATCH.length * 0.98);
  });

  it('rejects non-integer inputs and unknown levels', () => {
    expect(() => generateChunk(1.5, 0, 0, 0)).toThrow(RangeError);
    expect(() => generateChunk(1, 0, 0.5, 0)).toThrow(RangeError);
    expect(() => generateChunk(1, 99, 0, 0)).toThrow(RangeError);
  });
});

function sideEdgeOpen(c: Chunk, side: Side, i: number): boolean {
  const s = c.size;
  switch (side) {
    case 'west': return c.vWalls[vIndex(s, 0, i)] === 0;
    case 'east': return c.vWalls[vIndex(s, s, i)] === 0;
    case 'north': return c.hWalls[hIndex(s, i, 0)] === 0;
    case 'south': return c.hWalls[hIndex(s, i, s)] === 0;
  }
}

/** Build a single world-wide grid from a patch of chunks and BFS across chunk borders. */
function patchReachability(seed: number, level: number): { reached: number; total: number } {
  const n = PATCH.length;
  const S = CHUNK_SIZE;
  const W = n * S;
  const chunks = new Map<string, Chunk>();
  for (const cz of PATCH) for (const cx of PATCH) chunks.set(`${cx},${cz}`, generateChunk(seed, level, cx, cz));
  const at = (gx: number, gz: number): { c: Chunk; x: number; z: number } => {
    const i = Math.floor(gx / S);
    const j = Math.floor(gz / S);
    return { c: chunks.get(`${PATCH[i]},${PATCH[j]}`) as Chunk, x: gx - i * S, z: gz - j * S };
  };
  const open = (gx: number, gz: number, dx: number, dz: number): boolean => {
    const { c, x, z } = at(gx, gz);
    if (dx === 1) return c.vWalls[vIndex(S, x + 1, z)] === 0;
    if (dx === -1) return c.vWalls[vIndex(S, x, z)] === 0;
    if (dz === 1) return c.hWalls[hIndex(S, x, z + 1)] === 0;
    return c.hWalls[hIndex(S, x, z)] === 0;
  };
  const seen = new Uint8Array(W * W);
  const queue = [0];
  seen[0] = 1;
  for (let h = 0; h < queue.length; h++) {
    const idx = queue[h] as number;
    const gx = idx % W;
    const gz = (idx - gx) / W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = gx + dx;
      const nz = gz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
      // An edge is passable only if both cells' chunks agree it is open, so
      // mismatched border doorways (one-way doors) fail this test.
      if (!open(gx, gz, dx, dz) || !open(nx, nz, -dx, -dz)) continue;
      const k = nz * W + nx;
      if (seen[k]) continue;
      seen[k] = 1;
      queue.push(k);
    }
  }
  return { reached: queue.length, total: W * W };
}

describe('connectivity (brief 9.1 #3): 200 seeds x 25 chunks', () => {
  for (const level of LEVELS) {
    it(`level ${level}: every chunk is fully connected and opens onto all four neighbours`, () => {
      let checked = 0;
      for (const seed of SEEDS) {
        for (const cz of PATCH) {
          for (const cx of PATCH) {
            const c = generateChunk(seed, level, cx, cz);
            const s = c.size;
            // At least one doorway per side, and the wall data agrees with the doorway list.
            for (const side of SIDES) {
              expect(c.borderDoors[side].length).toBeGreaterThan(0);
              for (let i = 0; i < s; i++) expect(sideEdgeOpen(c, side, i)).toBe(c.borderDoors[side].includes(i));
            }
            // BFS from the first west doorway reaches every cell, hence every doorway on every side.
            const [sx, sz] = doorwayCell(s, 'west', c.borderDoors.west[0] as number);
            const seen = reachableCells(c, sx, sz);
            const unreached = seen.reduce((n, v) => n + (v ? 0 : 1), 0);
            if (unreached !== 0) throw new Error(`seed ${seed} level ${level} chunk (${cx},${cz}): ${unreached} unreachable cells`);
            for (const side of SIDES) {
              for (const o of c.borderDoors[side]) {
                const [x, z] = doorwayCell(s, side, o);
                expect(seen[z * s + x]).toBe(1);
              }
            }
            checked++;
          }
        }
      }
      expect(checked).toBe(SEEDS.length * PATCH.length * PATCH.length);
    });

    it(`level ${level}: neighbouring chunks agree on shared border doorways`, () => {
      for (const seed of SEEDS) {
        for (const cz of PATCH) {
          for (const cx of PATCH) {
            const c = generateChunk(seed, level, cx, cz);
            expect(c.borderDoors.east).toEqual(generateChunk(seed, level, cx + 1, cz).borderDoors.west);
            expect(c.borderDoors.south).toEqual(generateChunk(seed, level, cx, cz + 1).borderDoors.north);
          }
        }
      }
    });

    it(`level ${level}: a stitched 5x5 patch is one connected region`, () => {
      for (const seed of SEEDS) {
        const { reached, total } = patchReachability(seed, level);
        if (reached !== total) throw new Error(`seed ${seed} level ${level}: reached ${reached}/${total}`);
      }
    });
  }
});

describe('room graph', () => {
  it('is connected, and every border doorway maps to a room', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS.slice(0, 50)) {
        const c = generateChunk(seed, level, 0, 0);
        const g = buildRoomGraph(c);
        const adj = Array.from({ length: g.rooms }, () => [] as number[]);
        for (const e of g.edges) {
          adj[e.a]?.push(e.b);
          adj[e.b]?.push(e.a);
        }
        const seen = new Set([0]);
        const q = [0];
        for (let h = 0; h < q.length; h++) for (const n of adj[q[h] as number] ?? []) if (!seen.has(n)) (seen.add(n), q.push(n));
        expect(seen.size).toBe(g.rooms);
        for (const side of SIDES) for (const r of g.exits[side]) expect(r >= 0 && r < g.rooms).toBe(true);
      }
    }
  });

  it('assigns every cell to exactly one room whose rect contains it', () => {
    const c = generateChunk(1234, 0, 0, 0);
    for (let z = 0; z < c.size; z++) {
      for (let x = 0; x < c.size; x++) {
        const room = c.rooms[c.roomOf[z * c.size + x] as number];
        expect(room).toBeDefined();
        if (!room) continue;
        expect(x >= room.x && x < room.x + room.w && z >= room.z && z < room.z + room.h).toBe(true);
      }
    }
    expect(c.rooms.reduce((a, r) => a + r.w * r.h, 0)).toBe(c.size * c.size);
  });
});
