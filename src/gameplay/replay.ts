/** Compact 30 Hz state ring buffer for the CCTV replay. */
export interface Frame {
  t: number;
  px: number;
  py: number;
  pz: number;
  yaw: number;
  pitch: number;
  ox: number;
  oz: number;
  oa: number;
  raised: number;
  flash: number;
}

export const REPLAY_HZ = 30;
export const REPLAY_BUFFER_S = 12;
export const REPLAY_PLAY_S = 10;

export class ReplayBuffer {
  private frames: Frame[] = [];
  private acc = 0;
  readonly cap = REPLAY_HZ * REPLAY_BUFFER_S;

  clear(): void {
    this.frames = [];
    this.acc = 0;
  }

  tick(dt: number, f: Frame): void {
    this.acc += dt;
    if (this.acc < 1 / REPLAY_HZ && this.frames.length) return;
    this.acc = 0;
    this.frames.push(f);
    if (this.frames.length > this.cap) this.frames.shift();
  }

  /** The last `seconds` of frames. */
  tail(seconds = REPLAY_PLAY_S): Frame[] {
    return this.frames.slice(-Math.round(seconds * REPLAY_HZ));
  }

  get length(): number {
    return this.frames.length;
  }

  static encode(frames: Frame[]): string {
    const r = (n: number): number => Math.round(n * 100) / 100;
    return JSON.stringify(frames.map((f) => [r(f.t), r(f.px), r(f.py), r(f.pz), r(f.yaw), r(f.pitch), r(f.ox), r(f.oz), f.oa, f.raised, f.flash]));
  }

  static decode(s: string): Frame[] {
    try {
      const a = JSON.parse(s) as number[][];
      return a.map((v) => ({ t: v[0]!, px: v[1]!, py: v[2]!, pz: v[3]!, yaw: v[4]!, pitch: v[5]!, ox: v[6]!, oz: v[7]!, oa: v[8]!, raised: v[9]!, flash: v[10]! }));
    } catch {
      return [];
    }
  }
}
