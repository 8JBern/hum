/**
 * Pure world model: chunk cache, wall queries, line of sight, collision and navigation.
 * No rendering here, so it can be unit-tested in Node.
 */
import { CHUNK_SIZE, hIndex, vIndex } from './chunk.ts';
import { buildWorldChunk } from './content.ts';
import { CELL, CHUNK_M, DOOR_H, PARTITION_H, WALL_T, type WorldChunk } from './types.ts';

const S = CHUNK_SIZE;

export class World {
  readonly chunks = new Map<string, WorldChunk>();
  /** Furnishing variant per chunk: bumped when the office rearranges itself while you look away. */
  readonly variants = new Map<string, number>();
  constructor(
    readonly seed: number,
    readonly level: number,
  ) {}

  key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  /** Generates on demand. Generation is deterministic, so this is a cache. */
  chunk(cx: number, cz: number): WorldChunk {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = buildWorldChunk(this.seed, this.level, cx, cz, this.variants.get(k) ?? 0);
      this.chunks.set(k, c);
    }
    return c;
  }

  peek(cx: number, cz: number): WorldChunk | undefined {
    return this.chunks.get(this.key(cx, cz));
  }

  evict(cx: number, cz: number): void {
    this.chunks.delete(this.key(cx, cz));
  }

  get ceil(): number {
    return this.chunk(0, 0).ceil;
  }

  /**
   * Wall value on the vertical line at global cell column gx (west edge of cell gx), row gz.
   * The west border of a chunk is owned by that chunk; both neighbours agree on it.
   */
  vWall(gx: number, gz: number): number {
    const cx = Math.floor(gx / S);
    const cz = Math.floor(gz / S);
    const c = this.chunk(cx, cz);
    return c.vWalls[vIndex(S, gx - cx * S, gz - cz * S)]!;
  }

  /** Wall value on the horizontal line at global row gz (north edge of cell gz), column gx. */
  hWall(gx: number, gz: number): number {
    const cx = Math.floor(gx / S);
    const cz = Math.floor(gz / S);
    const c = this.chunk(cx, cz);
    return c.hWalls[hIndex(S, gx - cx * S, gz - cz * S)]!;
  }

  /** Can you walk from cell (gx, gz) to its neighbour (dx, dz)? */
  open(gx: number, gz: number, dx: number, dz: number): boolean {
    if (dx === 1) return this.vWall(gx + 1, gz) === 0;
    if (dx === -1) return this.vWall(gx, gz) === 0;
    if (dz === 1) return this.hWall(gx, gz + 1) === 0;
    return this.hWall(gx, gz) === 0;
  }

  /** Is the doorway with a raised lintel? Key format matches WorldChunk.tallDoors. */
  private lintelAt(axis: 'v' | 'h', gx: number, gz: number): number {
    const cx = Math.floor(gx / S);
    const cz = Math.floor(gz / S);
    const c = this.peek(cx, cz);
    if (!c) return DOOR_H;
    return c.tallDoors.includes(`${axis}:${gx - cx * S}:${gz - cz * S}`) ? DOOR_H * 1.2 : DOOR_H;
  }

  /**
   * Line of sight between two 3D points. Walls block; partitions block below their height;
   * doorway lintels block above door height when the doorway is a 1-cell gap in a wall line.
   */
  segmentClear(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const steps = Math.ceil(Math.hypot(dx, dz) / (CELL * 0.25)) + 1;
    let pgx = Math.floor(ax / CELL);
    let pgz = Math.floor(az / CELL);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      const y = ay + (by - ay) * t;
      const gx = Math.floor(x / CELL);
      const gz = Math.floor(z / CELL);
      if (gx !== pgx) {
        const line = Math.max(gx, pgx);
        const v = this.vWall(line, pgz);
        if (blocks(v, y) || (v === 0 && this.isDoorV(line, pgz) && y > this.lintelAt('v', line, pgz))) return false;
      }
      if (gz !== pgz) {
        const line = Math.max(gz, pgz);
        const v = this.hWall(gx, line);
        if (blocks(v, y) || (v === 0 && this.isDoorH(gx, line) && y > this.lintelAt('h', gx, line))) return false;
      }
      pgx = gx;
      pgz = gz;
    }
    return true;
  }

  isDoorV(gx: number, gz: number): boolean {
    return this.vWall(gx, gz) === 0 && this.vWall(gx, gz - 1) === 1 && this.vWall(gx, gz + 1) === 1;
  }
  isDoorH(gx: number, gz: number): boolean {
    return this.hWall(gx, gz) === 0 && this.hWall(gx - 1, gz) === 1 && this.hWall(gx + 1, gz) === 1;
  }

  /** Resolve a circle against walls and prop colliders. Returns the corrected position. */
  collide(x: number, z: number, r: number): [number, number] {
    const gx = Math.floor(x / CELL);
    const gz = Math.floor(z / CELL);
    const h = WALL_T / 2;
    for (let pass = 0; pass < 2; pass++) {
      for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = gx + ox;
          const cz = gz + oz;
          // West edge of cell (cx, cz): vertical segment at X = cx*CELL, Z in [cz*CELL, cz*CELL+CELL].
          if (this.vWall(cx, cz) !== 0) [x, z] = pushOutBox(x, z, r, cx * CELL - h, cz * CELL - h, cx * CELL + h, cz * CELL + CELL + h);
          if (this.hWall(cx, cz) !== 0) [x, z] = pushOutBox(x, z, r, cx * CELL - h, cz * CELL - h, cx * CELL + CELL + h, cz * CELL + h);
        }
      }
      const ccx = Math.floor(x / CHUNK_M);
      const ccz = Math.floor(z / CHUNK_M);
      for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
          const c = this.peek(ccx + ox, ccz + oz);
          if (!c) continue;
          for (const b of c.colliders) {
            if (x + r < b.x0 || x - r > b.x1 || z + r < b.z0 || z - r > b.z1) continue;
            [x, z] = pushOutBox(x, z, r, b.x0, b.z0, b.x1, b.z1);
          }
        }
      }
    }
    return [x, z];
  }

  /**
   * Breadth-first path on the cell grid from (sx, sz) to (tx, tz), world metres.
   * Returns cell centres (world metres) excluding the start, or null if unreachable within the limit.
   */
  path(sx: number, sz: number, tx: number, tz: number, limit = 1600): [number, number][] | null {
    const s0 = [Math.floor(sx / CELL), Math.floor(sz / CELL)] as const;
    const t0 = [Math.floor(tx / CELL), Math.floor(tz / CELL)] as const;
    if (s0[0] === t0[0] && s0[1] === t0[1]) return [];
    const k = (x: number, z: number): string => `${x},${z}`;
    const prev = new Map<string, string | null>();
    prev.set(k(s0[0], s0[1]), null);
    const q: [number, number][] = [[s0[0], s0[1]]];
    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    let found = false;
    for (let head = 0; head < q.length && head < limit; head++) {
      const [x, z] = q[head]!;
      if (x === t0[0] && z === t0[1]) {
        found = true;
        break;
      }
      for (const [dx, dz] of dirs) {
        const nk = k(x + dx, z + dz);
        if (prev.has(nk)) continue;
        if (!this.open(x, z, dx, dz)) continue;
        prev.set(nk, k(x, z));
        q.push([x + dx, z + dz]);
      }
    }
    if (!found) return null;
    const out: [number, number][] = [];
    let cur: string | null = k(t0[0], t0[1]);
    while (cur && cur !== k(s0[0], s0[1])) {
      const [x, z] = cur.split(',').map(Number) as [number, number];
      out.push([x * CELL + CELL / 2, z * CELL + CELL / 2]);
      cur = prev.get(cur) ?? null;
    }
    return out.reverse();
  }

  /** All anomalies in loaded chunks. */
  *anomalies(): Generator<import('./types.ts').AnomalyInstance> {
    for (const c of this.chunks.values()) yield* c.anomalies;
  }

  /** Is the point inside a room where the hum is silent? */
  silentAt(x: number, z: number): boolean {
    const c = this.peek(Math.floor(x / CHUNK_M), Math.floor(z / CHUNK_M));
    if (!c) return false;
    return c.silent.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
  }
}

function blocks(v: number, y: number): boolean {
  if (v === 0) return false;
  if (v === 3) return y < PARTITION_H;
  return true;
}

function pushOutBox(x: number, z: number, r: number, x0: number, z0: number, x1: number, z1: number): [number, number] {
  const cx = Math.max(x0, Math.min(x, x1));
  const cz = Math.max(z0, Math.min(z, z1));
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return [x, z];
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * r, cz + (dz / d) * r];
  }
  // Centre inside the box: push out along the smallest axis.
  const l = x - x0 + r;
  const ri = x1 - x + r;
  const t = z - z0 + r;
  const b = z1 - z + r;
  const m = Math.min(l, ri, t, b);
  if (m === l) return [x0 - r, z];
  if (m === ri) return [x1 + r, z];
  if (m === t) return [x, z0 - r];
  return [x, z1 + r];
}
