/**
 * The Occupant. Invisible to the naked eye, frozen while recorded, advances along the
 * navigation grid when not observed. States: dormant, wandering, stalking, rushing, retreating.
 */
import type { Rng } from '../core/rng.ts';
import type { World } from '../world/world.ts';
import { CELL } from '../world/types.ts';

export type OccState = 'dormant' | 'wandering' | 'stalking' | 'rushing' | 'retreating';

export interface OccContext {
  px: number;
  pz: number;
  observed: boolean;
  calm: boolean;
  reduced: boolean;
  doubt: number;
  runTime: number;
  exitOpen: boolean;
  /** Loudness of the player this step (0 quiet, 1 sprinting). */
  noise: number;
}

export const CATCH_DIST = 0.75;
export const RUSH_DIST = 8;

export class Occupant {
  x = 0;
  z = 0;
  state: OccState = 'dormant';
  active = false;
  timer = 0;
  private path: [number, number][] = [];
  private repath = 0;
  private unobservedNear = 0;
  private observedNear = 0;
  stepAcc = 0;
  /** Set when a step sound should play this frame. */
  stepped = false;
  moving = false;
  frozen = false;
  heading = 0;

  constructor(
    private readonly world: World,
    private readonly rng: Rng,
    public dormantFor: number,
  ) {}

  get dist(): number {
    return this.distTo(this.px, this.pz);
  }
  private px = 0;
  private pz = 0;
  distTo(x: number, z: number): number {
    return this.active ? Math.hypot(this.x - x, this.z - z) : Infinity;
  }

  /** Place the Occupant somewhere out of the way, roughly `minD` to `maxD` metres of path from the player. */
  spawnNear(px: number, pz: number, minD: number, maxD: number, avoid?: (x: number, z: number) => boolean): boolean {
    const gx = Math.floor(px / CELL);
    const gz = Math.floor(pz / CELL);
    for (let tries = 0; tries < 30; tries++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = minD + this.rng.next() * (maxD - minD);
      const tx = Math.floor((px + Math.cos(a) * r) / CELL);
      const tz = Math.floor((pz + Math.sin(a) * r) / CELL);
      const cx = tx * CELL + CELL / 2;
      const cz = tz * CELL + CELL / 2;
      if (avoid && avoid(cx, cz)) continue;
      const p = this.world.path(px, pz, cx, cz, 2500);
      if (!p || p.length * CELL < minD * 0.8) continue;
      this.x = cx;
      this.z = cz;
      this.active = true;
      this.path = [];
      void gx;
      void gz;
      return true;
    }
    return false;
  }

  forceAt(x: number, z: number, state: OccState = 'stalking'): void {
    this.x = x;
    this.z = z;
    this.active = true;
    this.state = state;
    this.timer = 0;
    this.path = [];
  }

  update(dt: number, c: OccContext, avoid: (x: number, z: number) => boolean): 'caught' | null {
    this.px = c.px;
    this.pz = c.pz;
    this.stepped = false;
    this.moving = false;
    this.timer += dt;
    if (!this.active) {
      if (this.timer > this.dormantFor) {
        if (this.spawnNear(c.px, c.pz, 16, 26, avoid)) {
          this.state = 'wandering';
          this.timer = 0;
        } else this.timer = this.dormantFor - 2;
      }
      return null;
    }
    const d = this.dist;
    this.frozen = c.observed;

    // Near miss: held in the lens at close range, it gives ground.
    if (c.observed && d < 3) {
      this.observedNear += dt;
      if (this.observedNear > 1.2 && this.state !== 'retreating') {
        this.state = 'retreating';
        this.timer = 0;
        this.path = [];
      }
    } else this.observedNear = 0;

    if (!c.observed && d < RUSH_DIST) this.unobservedNear += dt;
    else this.unobservedNear = Math.max(0, this.unobservedNear - dt * 2);

    // Too far away (player outran it, or streaming): relocate behind the player, out of sight.
    if (d > 46 && this.state !== 'retreating') {
      if (this.spawnNear(c.px, c.pz, 14, 22, avoid)) this.path = [];
    }

    switch (this.state) {
      case 'wandering':
        if (d < 22 || this.timer > 25 || c.exitOpen) {
          this.state = 'stalking';
          this.timer = 0;
        }
        break;
      case 'stalking':
        if (!c.calm && this.unobservedNear > (c.reduced ? 3.5 : 2.5)) {
          this.state = 'rushing';
          this.timer = 0;
        }
        break;
      case 'rushing':
        if (c.observed) {
          this.state = 'stalking';
          this.unobservedNear = 0;
          this.timer = 0;
        }
        break;
      case 'retreating':
        if (this.timer > 7) {
          this.state = 'stalking';
          this.timer = 0;
          this.path = [];
        }
        break;
      case 'dormant':
        this.state = 'wandering';
        break;
    }

    if (c.observed) return null;

    let speed = 0;
    const pressure = Math.min(0.5, c.runTime / 240) + (c.exitOpen ? 0.25 : 0) + c.noise * 0.15;
    switch (this.state) {
      case 'wandering':
        speed = 0.9;
        break;
      case 'stalking':
        speed = 1.35 + pressure;
        break;
      case 'rushing':
        speed = c.reduced ? 2.9 : 3.5;
        break;
      case 'retreating':
        speed = 1.8;
        break;
    }
    if (c.doubt > 0) speed *= 1.35;

    this.repath -= dt;
    let tx = c.px;
    let tz = c.pz;
    if (this.state === 'retreating') {
      // Move directly away from the player, following open cells.
      const ax = this.x - c.px;
      const az = this.z - c.pz;
      const l = Math.hypot(ax, az) || 1;
      tx = this.x + (ax / l) * 8;
      tz = this.z + (az / l) * 8;
    }
    if (this.repath <= 0 || !this.path.length) {
      this.repath = this.state === 'rushing' ? 0.25 : 0.8;
      this.path = this.world.path(this.x, this.z, tx, tz, 1600) ?? [];
    }
    let step = speed * dt;
    while (step > 0) {
      let wx: number;
      let wz: number;
      if (this.path.length) [wx, wz] = this.path[0]!;
      else if (this.state !== 'retreating' && Math.floor(this.x / CELL) === Math.floor(c.px / CELL) && Math.floor(this.z / CELL) === Math.floor(c.pz / CELL)) {
        wx = c.px;
        wz = c.pz;
      } else break;
      const dx = wx - this.x;
      const dz = wz - this.z;
      const l = Math.hypot(dx, dz);
      if (l < 1e-4) {
        this.path.shift();
        continue;
      }
      const m = Math.min(step, l);
      this.x += (dx / l) * m;
      this.z += (dz / l) * m;
      this.heading = Math.atan2(dx, dz);
      step -= m;
      this.moving = true;
      this.stepAcc += m;
      if (l - m < 1e-4) this.path.shift();
      if (!this.path.length) break;
    }
    if (this.stepAcc > (this.state === 'rushing' ? 0.9 : 0.75)) {
      this.stepAcc = 0;
      this.stepped = true;
    }
    if (this.dist < CATCH_DIST) return 'caught';
    return null;
  }
}
