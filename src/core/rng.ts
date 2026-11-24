/**
 * Seeded randomness for Hum. Gameplay code must never call Math.random();
 * every random decision comes from an Rng built here.
 *
 * Generator: sfc32 (Small Fast Counting, 128-bit state). Seeding goes through
 * a murmur3-style integer mixer so that nearby inputs, e.g. chunk (0,0) and
 * (0,1), produce unrelated streams.
 */

/** murmur3 32-bit finaliser. Full avalanche on a 32-bit input. */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Order-sensitive hash of any number of 32-bit integers. Inputs are truncated
 * with `| 0`, so negative chunk coordinates are fine; non-integers are not
 * meaningful and are rejected.
 */
export function hashInts(...values: readonly number[]): number {
  let h = 0x9e3779b9 ^ values.length;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new RangeError(`hashInts expects integers, got ${v}`);
    h = Math.imul(h ^ fmix32(v | 0), 0x01000193);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  return fmix32(h);
}

/** Hash a string (UTF-16 code units) to 32 bits. Used for salts and daily seeds. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return fmix32(h);
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  /** Prefer `Rng.from(...)`. Direct construction takes the four raw state words. */
  constructor(a: number, b: number, c: number, d: number) {
    this.a = a >>> 0;
    this.b = b >>> 0;
    this.c = c >>> 0;
    this.d = d >>> 0;
    // Discard the first outputs: sfc32 needs a few rounds to diffuse a weak seed.
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  /** Build a stream from any list of integers, e.g. (seed, level, cx, cz, SALT). */
  static from(...values: readonly number[]): Rng {
    const h = hashInts(...values);
    return new Rng(fmix32(h ^ 0x243f6a88), fmix32(h ^ 0x85a308d3), fmix32(h ^ 0x13198a2e), fmix32(h ^ 0x03707344));
  }

  /** Uniform unsigned 32-bit integer. */
  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Rng.int: bad range [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Weighted index pick. Returns -1 when every weight is zero. */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return -1;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i] as number);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** In-place Fisher-Yates shuffle; returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** `count` distinct integers from [min, max], sorted ascending. */
  sample(min: number, max: number, count: number): number[] {
    const pool: number[] = [];
    for (let v = min; v <= max; v++) pool.push(v);
    if (count > pool.length) throw new RangeError('Rng.sample: count exceeds range');
    return this.shuffle(pool).slice(0, count).sort((x, y) => x - y);
  }
}

/** Integer mix used by the panel hash; mirrored exactly in GLSL (render/shaders.ts). */
export function panelHash(i: number, j: number, seed: number, level: number): number {
  let h = (Math.imul((i + 32768) >>> 0, 73856093) ^ Math.imul((j + 32768) >>> 0, 19349663) ^ Math.imul(seed >>> 0, 83492791) ^ Math.imul(level >>> 0, 2654435761 | 0)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Seeds are kept below 2^24 so they travel exactly through float shader uniforms. */
export function normaliseSeed(n: number): number {
  return Math.abs(Math.floor(n)) % 16777216;
}
