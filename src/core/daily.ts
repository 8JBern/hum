/** Daily Shift: one seed per UTC date, the same for every player. */
import { hashString, normaliseSeed } from './rng.ts';

export const GAME_TITLE = 'FIFTY HERTZ';
const EPOCH = Date.UTC(2026, 0, 1);

export function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dailySeed(d: Date): number {
  return normaliseSeed(hashString(`hum-daily-${utcDateString(d)}`));
}

/** Shift number: days since 1 January 2026 UTC, starting at 1. */
export function dailyNumber(d: Date): number {
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((day - EPOCH) / 86400000) + 1;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Plain text, no emoji. One box per photo taken (up to 10): [#] counted, [ ] false photo.
 * Example: FIFTY HERTZ Daily #0142 | Depth 2 | Evidence 17 | 11:42 | [#][#][ ][#][#]
 */
export function shareString(d: Date, depth: number, evidence: number, seconds: number, photos: boolean[]): string {
  const boxes = photos.slice(0, 10).map((ok) => (ok ? '[#]' : '[ ]')).join('');
  return `${GAME_TITLE} Daily #${String(dailyNumber(d)).padStart(4, '0')} | Depth ${depth} | Evidence ${evidence} | ${formatClock(seconds)} | ${boxes || '[ ]'}`;
}

export const SHARE_PATTERN = /^FIFTY HERTZ Daily #\d{4} \| Depth \d+ \| Evidence \d+ \| \d{2,}:\d{2} \| (\[[# ]\])+$/;
