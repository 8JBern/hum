/** First-person controller and camcorder state. */
import type { Input } from '../core/input.ts';
import type { Settings } from '../core/save.ts';
import type { World } from '../world/world.ts';

export const EYE = 1.65;
export const EYE_CROUCH = 1.12;
export const RADIUS = 0.28;
/** Full battery lasts about six minutes of recording. */
export const BATTERY_SECONDS = 360;

export interface MoveIntent {
  forward: number;
  strafe: number;
  sprint: boolean;
  crouch: boolean;
  raise: boolean;
  yawDelta: number;
  pitchDelta: number;
}

export class Player {
  x = 0;
  z = 0;
  eye = EYE;
  yaw = 0;
  pitch = 0;
  vx = 0;
  vz = 0;
  stamina = 1;
  sprinting = false;
  crouching = false;
  raised = false;
  raiseT = 0;
  focusT = 0;
  night = false;
  battery = 1;
  capacity = 1;
  bobPhase = 0;
  bob = 0;
  stepped = false;
  speed = 0;
  yawRate = 0;
  noise = 0;
  wading = false;
  quiet = false;
  lowWarned = false;

  intent(inp: Input, s: Settings): MoveIntent {
    const v = inp.virtual;
    const sens = 0.0022 * s.sensitivity;
    const i: MoveIntent = {
      forward: (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0),
      strafe: (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0),
      sprint: inp.down('ShiftLeft', 'ShiftRight'),
      crouch: inp.down('ControlLeft', 'ControlRight', 'KeyC'),
      raise: inp.rmb || inp.down('Space'),
      yawDelta: -inp.mouseDX * sens,
      pitchDelta: -inp.mouseDY * sens * (s.invertY ? -1 : 1),
    };
    if (v) {
      if (v.forward !== undefined) i.forward = v.forward;
      if (v.strafe !== undefined) i.strafe = v.strafe;
      if (v.sprint !== undefined) i.sprint = v.sprint;
      if (v.crouch !== undefined) i.crouch = v.crouch;
      if (v.raise !== undefined) i.raise = v.raise;
      if (v.yawRate !== undefined) i.yawDelta += v.yawRate / 60;
    }
    return i;
  }

  update(dt: number, i: MoveIntent, world: World, s: Settings): void {
    const prevYaw = this.yaw;
    this.yaw += i.yawDelta * (this.raised ? 0.7 : 1);
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + i.pitchDelta * (this.raised ? 0.7 : 1)));
    this.yawRate = Math.abs(this.yaw - prevYaw) / dt;

    // Camcorder.
    const wantRaise = i.raise && this.battery > 0;
    this.raised = wantRaise;
    this.raiseT = Math.max(0, Math.min(1, this.raiseT + (wantRaise ? dt * 6 : -dt * 6)));
    if (this.raised) {
      this.focusT += dt;
      if (this.yawRate > 2.5 || this.sprinting) this.focusT = Math.min(this.focusT, 0.1);
      const drain = (this.night ? 3 : 1) / (BATTERY_SECONDS * this.capacity);
      this.battery = Math.max(0, this.battery - drain * dt);
    } else {
      this.focusT = 0;
      this.night = false;
    }

    this.crouching = i.crouch;
    const len = Math.hypot(i.forward, i.strafe);
    const moving = len > 0.01;
    this.sprinting = i.sprint && moving && i.forward > 0 && this.stamina > 0.05 && !this.crouching && !this.raised;
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - dt / 6);
    else this.stamina = Math.min(1, this.stamina + dt / 4);

    let speed = 2.1;
    if (this.sprinting) speed = 3.9;
    if (this.crouching) speed = 1.15;
    if (this.raised) speed *= 0.62;
    if (this.wading) speed *= 0.78;

    let tx = 0;
    let tz = 0;
    if (moving) {
      const f = i.forward / len;
      const r = i.strafe / len;
      // Facing (sin yaw, cos yaw); screen right is (-cos yaw, sin yaw).
      tx = (Math.sin(this.yaw) * f - Math.cos(this.yaw) * r) * speed;
      tz = (Math.cos(this.yaw) * f + Math.sin(this.yaw) * r) * speed;
    }
    const a = 1 - Math.exp(-dt * 12);
    this.vx += (tx - this.vx) * a;
    this.vz += (tz - this.vz) * a;
    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    const [cx, cz] = world.collide(nx, nz, RADIUS);
    this.x = cx;
    this.z = cz;
    this.speed = Math.hypot(this.vx, this.vz);

    const targetEye = this.crouching ? EYE_CROUCH : EYE;
    this.eye += (targetEye - this.eye) * (1 - Math.exp(-dt * 10));

    // Head bob and footstep timing.
    this.stepped = false;
    const prev = this.bobPhase;
    this.bobPhase += this.speed * dt * (this.sprinting ? 2.4 : 2.8);
    if (Math.floor(prev / Math.PI) !== Math.floor(this.bobPhase / Math.PI) && this.speed > 0.3) this.stepped = true;
    const amp = s.headBob ? (this.raised ? 0.012 : 0.028) : 0;
    this.bob = Math.sin(this.bobPhase * 2) * amp * Math.min(1, this.speed / 2);
    this.noise = this.sprinting ? 1 : this.crouching ? 0.1 : moving ? 0.35 : 0;
    if (this.quiet) this.noise *= 0.6;
    if (this.wading) this.noise = Math.min(1, this.noise * 1.5);
  }

  get inFocus(): boolean {
    return this.raised && this.focusT > 0.35;
  }
}
