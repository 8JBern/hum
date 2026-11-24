import { describe, expect, it } from 'vitest';
import { Rng, hashInts } from '../../src/core/rng.ts';

const take = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.nextU32());

describe('Rng determinism (brief 9.1 #1)', () => {
  it('same inputs give the same stream', () => {
    expect(take(Rng.from(1234, 0, 5, -3), 1000)).toEqual(take(Rng.from(1234, 0, 5, -3), 1000));
  });

  it('pins the first outputs for seed 1234 so algorithm changes are noticed', () => {
    expect(take(Rng.from(1234), 4)).toMatchInlineSnapshot(`
      [
        988787109,
        4289272860,
        3354717332,
        1053000143,
      ]
    `);
  });

  it('different inputs give different streams', () => {
    const base = take(Rng.from(1234, 0, 0, 0), 8);
    for (const other of [Rng.from(1235, 0, 0, 0), Rng.from(1234, 1, 0, 0), Rng.from(1234, 0, 1, 0), Rng.from(1234, 0, 0, 1)]) {
      expect(take(other, 8)).not.toEqual(base);
    }
  });

  it('hashInts is order sensitive and handles negatives', () => {
    expect(hashInts(1, 2)).not.toBe(hashInts(2, 1));
    expect(hashInts(-1, 0)).not.toBe(hashInts(1, 0));
    expect(() => hashInts(1.5)).toThrow(RangeError);
  });

  it('next() stays in [0, 1) and int() in range with rough uniformity', () => {
    const rng = Rng.from(42);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const k = rng.int(0, 9);
      buckets[k] = (buckets[k] ?? 0) + 1;
    }
    for (const b of buckets) expect(Math.abs(b - 10_000)).toBeLessThan(500);
  });

  it('sample() returns distinct sorted values in range', () => {
    const rng = Rng.from(7);
    for (let i = 0; i < 500; i++) {
      const s = rng.sample(1, 14, rng.int(1, 5));
      expect(new Set(s).size).toBe(s.length);
      expect([...s].sort((a, b) => a - b)).toEqual(s);
      for (const v of s) expect(v >= 1 && v <= 14).toBe(true);
    }
  });
});
