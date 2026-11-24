/** Scripted test agent: follows the navigation grid, photographs anomalies, finds the exit. Test builds only. */
import type { Game } from '../game.ts';
import type { AnomalyInstance } from '../world/types.ts';

export class Bot {
  target: AnomalyInstance | null = null;
  path: [number, number][] = [];
  failed = new Set<string>();
  aimFrames = 0;
  lastX = 0;
  lastZ = 0;
  stuckFrames = 0;
  log: string[] = [];

  tick(g: Game): void {
    const run = g.run;
    const world = g.world;
    if (!run || !world || g.mode !== 'play') return;
    const p = g.player;
    const input = g.input;
    input.virtual = { forward: 0, strafe: 0, sprint: false, crouch: false, raise: false };

    // Stuck detection.
    if (Math.hypot(p.x - this.lastX, p.z - this.lastZ) < 0.002 && this.aimFrames === 0) this.stuckFrames++;
    else this.stuckFrames = 0;
    this.lastX = p.x;
    this.lastZ = p.z;
    if (this.stuckFrames > 90 && this.path.length) {
      const [x, z] = this.path.shift()!;
      p.x = x;
      p.z = z;
      this.stuckFrames = 0;
    }

    if (run.exit) {
      const d = Math.hypot(run.exit.x - p.x, run.exit.z - p.z);
      if (d < 1.6) {
        g.interact();
        this.path = [];
        this.target = null;
        return;
      }
      if (!this.path.length) this.path = world.path(p.x, p.z, run.exit.x, run.exit.z, 8000) ?? [];
      this.follow(g, [run.exit.x, run.exit.z]);
      return;
    }

    if (!this.target || run.photographed.has(this.target.uid)) {
      this.target = null;
      this.path = [];
      let best: AnomalyInstance | null = null;
      let bd = 1e9;
      for (const a of world.anomalies()) {
        if (run.photographed.has(a.uid) || this.failed.has(a.uid)) continue;
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      if (!best) return;
      this.target = best;
      this.path = world.path(p.x, p.z, best.x, best.z, 8000) ?? [];
      if (!this.path.length && bd > 4) {
        this.failed.add(best.uid);
        this.target = null;
        return;
      }
    }
    const a = this.target;
    const d = Math.hypot(a.x - p.x, a.z - p.z);
    const clear = world.segmentClear(p.x, p.eye, p.z, a.x, a.y, a.z);
    if ((d < 3.2 && clear && d > 1.0) || this.aimFrames > 0) {
      // Aim, raise, wait for focus, shoot.
      p.yaw = Math.atan2(a.x - p.x, a.z - p.z);
      p.pitch = Math.atan2(a.y - p.eye, Math.max(0.3, d));
      input.virtual = { forward: 0, strafe: 0, raise: true };
      this.aimFrames++;
      if (this.aimFrames > 30) {
        run.photoCooldown = 0;
        const r = g.snapPhoto();
        this.log.push(`${a.type}:${r.ok ? 'ok' : r.reason}`);
        if (!r.ok) this.failed.add(a.uid);
        this.aimFrames = 0;
        this.target = null;
        this.path = [];
      }
      return;
    }
    if (d <= 1.0) {
      // Too close: back off a little.
      input.virtual = { forward: -1, strafe: 0 };
      return;
    }
    this.follow(g, [a.x, a.z]);
  }

  private follow(g: Game, goal: [number, number]): void {
    const p = g.player;
    let wp = this.path[0] ?? goal;
    while (this.path.length && Math.hypot(wp[0] - p.x, wp[1] - p.z) < 0.35) {
      this.path.shift();
      wp = this.path[0] ?? goal;
    }
    p.yaw = Math.atan2(wp[0] - p.x, wp[1] - p.z);
    p.pitch = 0;
    g.input.virtual = { forward: 1, strafe: 0, sprint: false, raise: false };
  }
}
