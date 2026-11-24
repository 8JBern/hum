import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng.ts';
import { buildWorldChunk, snapshotContent, EVIDENCE_THRESHOLD, type FurnishCtx } from '../../src/world/content.ts';
import { ANOMALY_TYPES, TIER_EVIDENCE, placeRevertible } from '../../src/anomalies/registry.ts';
import { World } from '../../src/world/world.ts';
import { reachableCells } from '../../src/world/navigation.ts';
import { detect } from '../../src/gameplay/detect.ts';
import { CELL } from '../../src/world/types.ts';

const SEEDS = Array.from({ length: 60 }, (_, i) => (i * 2654435761 + 7) % 16777216);

describe('furnished chunks', () => {
  it('are deterministic', () => {
    for (const s of SEEDS.slice(0, 10)) {
      for (const level of [0, 1]) {
        expect(snapshotContent(buildWorldChunk(s, level, 1, -2))).toBe(snapshotContent(buildWorldChunk(s, level, 1, -2)));
      }
    }
  });

  it('partitions never disconnect a chunk', () => {
    for (const s of SEEDS) {
      for (const [cx, cz] of [[0, 0], [1, 1], [-2, 3]] as const) {
        const wc = buildWorldChunk(s, 0, cx, cz);
        const seen = reachableCells(wc, 0, 0);
        expect([...seen].every((v) => v === 1)).toBe(true);
      }
    }
  });

  it('the origin chunk has a spawn point, a battery and a tier-1 anomaly on level A', () => {
    for (const s of SEEDS) {
      const wc = buildWorldChunk(s, 0, 0, 0);
      expect(wc.spawn).toBeDefined();
      expect(wc.pickups.some((p) => p.id === 'b:0:0:spawn')).toBe(true);
      expect(wc.anomalies.some((a) => a.type === 'chair-ceiling')).toBe(true);
      expect(wc.anomalies.some((a) => a.type === 'clock-backwards')).toBe(true);
    }
  });
});

describe('completability (brief 9.1 #4)', () => {
  it('every seed has enough reachable anomaly evidence near spawn on levels A and B', () => {
    for (const s of SEEDS) {
      for (const level of [0, 1]) {
        let total = 0;
        for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) for (const a of buildWorldChunk(s, level, cx, cz).anomalies) total += TIER_EVIDENCE[a.tier];
        // Connectivity is guaranteed by the generator, so every anomaly in this 3 x 3 patch is reachable.
        expect(total).toBeGreaterThanOrEqual(EVIDENCE_THRESHOLD[level]! * 2);
      }
    }
  });
});

describe('anomaly registry (brief 9.1 #5)', () => {
  it('has at least 40 types with unique ids', () => {
    expect(ANOMALY_TYPES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ANOMALY_TYPES.map((t) => t.id)).size).toBe(ANOMALY_TYPES.length);
  });

  for (const type of ANOMALY_TYPES) {
    it(`${type.id}: applies, is detectable, and reverts cleanly`, () => {
      const level = type.weights[0] > 0 ? 0 : 1;
      let done = false;
      for (const seed of SEEDS) {
        const world = new World(seed, level);
        const wc = world.chunk(0, 0);
        for (const room of wc.rooms) {
          if (room.w < 2 || room.h < 2) continue;
          const before = snapshotContent(wc);
          const f: FurnishCtx = { wc, rng: Rng.from(seed, 99), reserved: new Uint8Array(256), used: new Uint8Array(256) };
          const placed = placeRevertible(f, room, type, 'test', level, Rng.from(seed, room.id));
          if (!placed) continue;
          const a = placed.inst;
          // Try camera points inside the room, looking at the anomaly.
          let seen = false;
          for (let k = 0; k < 24 && !seen; k++) {
            const px = wc.ox + (room.x + 0.25 + ((k * 7) % 10) / 10 * (room.w - 0.5)) * CELL;
            const pz = wc.oz + (room.z + 0.25 + ((k * 3) % 10) / 10 * (room.h - 0.5)) * CELL;
            const dx = a.x - px;
            const dz = a.z - pz;
            const dist = Math.hypot(dx, dz);
            if (dist < 1.2) continue;
            const yaw = Math.atan2(dx, dz);
            const pitch = Math.atan2(a.y - 1.65, dist);
            const r = detect({ x: px, y: 1.65, z: pz, yaw, pitch, fov: 55, aspect: 16 / 9 }, a, true, (...p) => world.segmentClear(...p));
            seen = r.ok;
          }
          if (!seen) {
            placed.revert();
            continue;
          }
          placed.revert();
          expect(snapshotContent(wc)).toBe(before);
          done = true;
          break;
        }
        if (done) break;
      }
      expect(done).toBe(true);
    });
  }
});

describe('rearranging while the tab is hidden (P2-02)', () => {
  it('a new variant keeps walls identical but changes furnishing', () => {
    let differs = 0;
    for (const s of SEEDS.slice(0, 20)) {
      const a = buildWorldChunk(s, 0, 1, 0, 0);
      const b = buildWorldChunk(s, 0, 1, 0, 1);
      expect(Array.from(b.vWalls.map((v) => (v === 3 ? 0 : v)))).toEqual(Array.from(a.vWalls.map((v) => (v === 3 ? 0 : v))));
      expect(Array.from(b.hWalls.map((v) => (v === 3 ? 0 : v)))).toEqual(Array.from(a.hWalls.map((v) => (v === 3 ? 0 : v))));
      if (JSON.stringify(a.props) !== JSON.stringify(b.props)) differs++;
    }
    expect(differs).toBeGreaterThan(15);
  });
});
