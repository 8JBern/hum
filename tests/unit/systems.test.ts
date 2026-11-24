import { describe, expect, it } from 'vitest';
import { FlickerScheduler, MAX_LARGE_FLASHES_PER_SECOND } from '../../src/core/flicker.ts';
import { Rng } from '../../src/core/rng.ts';
import { SAVE_KEY, SAVE_VERSION, defaultSave, loadSave, migrate, writeSave, type StorageLike } from '../../src/core/save.ts';
import { SHARE_PATTERN, dailyNumber, dailySeed, shareString } from '../../src/core/daily.ts';

class MemStore implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

describe('flicker scheduler (brief 9.1 #6)', () => {
  it('never grants more than 3 large flashes in any 1-second window, for random request streams', () => {
    for (let trial = 0; trial < 300; trial++) {
      const rng = Rng.from(trial, 77);
      const f = new FlickerScheduler();
      const granted: number[] = [];
      let t = 0;
      for (let i = 0; i < 400; i++) {
        t += rng.next() < 0.2 ? rng.next() * 0.6 : rng.next() * 0.05;
        if (f.request('large', t)) granted.push(t);
      }
      for (let i = 0; i < granted.length; i++) {
        let n = 0;
        for (let j = i; j < granted.length && granted[j]! - granted[i]! < 1; j++) n++;
        expect(n).toBeLessThanOrEqual(MAX_LARGE_FLASHES_PER_SECOND);
      }
    }
  });

  it('reduce flicker removes every flash', () => {
    const f = new FlickerScheduler();
    f.reduceFlicker = true;
    for (let i = 0; i < 50; i++) expect(f.request(i % 2 ? 'large' : 'small', i * 0.3)).toBe(false);
  });

  it('allows flashes again after the window passes', () => {
    const f = new FlickerScheduler();
    expect([0, 0.1, 0.2, 0.3].map((t) => f.request('large', t))).toEqual([true, true, true, false]);
    expect(f.request('large', 1.05)).toBe(true);
  });
});

describe('save system (brief 9.1 #7)', () => {
  it('round trips', () => {
    const s = new MemStore();
    const d = defaultSave();
    d.banked = 42;
    d.settings.fov = 95;
    d.lore = [1, 3];
    expect(writeSave(d, s)).toBe(true);
    expect(loadSave(s)).toEqual(d);
  });

  it('migrates version 1 saves', () => {
    const m = migrate({ version: 1, volume: 0.4, sensitivity: 1.5, evidence: 33, runs: 7 });
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.settings.master).toBe(0.4);
    expect(m.settings.sensitivity).toBe(1.5);
    expect(m.banked).toBe(33);
    expect(m.runs).toBe(7);
  });

  it('fills in fields missing from older version 2 saves', () => {
    const m = migrate({ version: 2, banked: 5, settings: { fov: 90 } });
    expect(m.settings.fov).toBe(90);
    expect(m.settings.scare).toBe('full');
    expect(m.daily.streak).toBe(0);
  });

  it('recovers from corrupt JSON and keeps a copy', () => {
    const s = new MemStore();
    s.setItem(SAVE_KEY, '{not json');
    expect(loadSave(s)).toEqual(defaultSave());
    expect(s.getItem(SAVE_KEY + '.corrupt')).toBe('{not json');
  });

  it('survives storage that throws', () => {
    const bad: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadSave(bad)).toEqual(defaultSave());
    expect(writeSave(defaultSave(), bad)).toBe(false);
  });
});

describe('daily shift (brief 9.1 #8)', () => {
  it('seed is deterministic per UTC date and differs between dates', () => {
    const a = new Date('2026-11-25T03:00:00Z');
    const b = new Date('2026-11-25T23:59:00Z');
    const c = new Date('2026-11-26T00:01:00Z');
    expect(dailySeed(a)).toBe(dailySeed(b));
    expect(dailySeed(a)).not.toBe(dailySeed(c));
    expect(dailySeed(a)).toBeLessThan(16777216);
  });

  it('share string matches the brief format', () => {
    const d = new Date('2026-05-22T10:00:00Z');
    const s = shareString(d, 2, 17, 702, [true, true, false, true, true]);
    expect(s).toBe(`FIFTY HERTZ Daily #${String(dailyNumber(d)).padStart(4, '0')} | Depth 2 | Evidence 17 | 11:42 | [#][#][ ][#][#]`);
    expect(s).toMatch(SHARE_PATTERN);
    expect(s).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(dailyNumber(new Date('2026-01-01T12:00:00Z'))).toBe(1);
  });
});
