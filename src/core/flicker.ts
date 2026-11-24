/**
 * Central flicker scheduler. Every flash or flicker in the game must request permission here.
 * Photosafe rule: no more than 3 large-area flashes in any 1-second window.
 */
export type FlashKind = 'large' | 'small';

export const MAX_LARGE_FLASHES_PER_SECOND = 3;

export class FlickerScheduler {
  /** When true, all flicker is removed (photo flashes become a soft fade). */
  reduceFlicker = false;
  private largeTimes: number[] = [];
  private smallTimes: number[] = [];

  /**
   * Ask to start a flash at time `t` (seconds). Returns true if allowed.
   * A flash counts against the window when it is granted.
   */
  request(kind: FlashKind, t: number): boolean {
    if (this.reduceFlicker) return false;
    const list = kind === 'large' ? this.largeTimes : this.smallTimes;
    const limit = kind === 'large' ? MAX_LARGE_FLASHES_PER_SECOND : 6;
    while (list.length && t - list[0]! >= 1) list.shift();
    // Guard against time going backwards (restarts): clear stale entries.
    if (list.length && list[list.length - 1]! > t) list.length = 0;
    if (list.length >= limit) return false;
    list.push(t);
    return true;
  }

  reset(): void {
    this.largeTimes.length = 0;
    this.smallTimes.length = 0;
  }

  /** Number of granted large flashes in the window (t-1, t]. */
  countLarge(t: number): number {
    return this.largeTimes.filter((x) => t - x < 1 && x <= t).length;
  }
}

export const flicker = new FlickerScheduler();
