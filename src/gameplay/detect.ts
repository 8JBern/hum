/** Photo detection, pure maths so it can be unit-tested. */
import type { AnomalyInstance } from '../world/types.ts';

export interface CamPose {
  x: number;
  y: number;
  z: number;
  /** Yaw: facing (sin yaw, cos yaw) in xz, the same convention as props. */
  yaw: number;
  pitch: number;
  /** Vertical field of view, degrees. */
  fov: number;
  aspect: number;
}

export const PHOTO_RANGE = 13;

export function forward(p: CamPose): [number, number, number] {
  const c = Math.cos(p.pitch);
  return [Math.sin(p.yaw) * c, Math.sin(p.pitch), Math.cos(p.yaw) * c];
}

/** Project a world point into normalised device coordinates. Returns null when behind the camera. */
export function project(p: CamPose, x: number, y: number, z: number): { nx: number; ny: number; depth: number } | null {
  const f = forward(p);
  // Right = forward x up, with up = (0,1,0): (fz*1 - 0, ..) => (-fz, 0, fx) normalised gives left; use (fz?).
  const rl = Math.hypot(f[0], f[2]) || 1;
  const r: [number, number, number] = [-f[2] / rl, 0, f[0] / rl];
  // In this convention yaw 0 faces +z; right-hand side is -x. r computed above points to -x at yaw 0.
  const u: [number, number, number] = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const dx = x - p.x;
  const dy = y - p.y;
  const dz = z - p.z;
  const depth = dx * f[0] + dy * f[1] + dz * f[2];
  if (depth <= 0.05) return null;
  const sx = dx * r[0] + dy * r[1] + dz * r[2];
  const sy = dx * u[0] + dy * u[1] + dz * u[2];
  const t = Math.tan(((p.fov * Math.PI) / 180) / 2);
  return { nx: sx / (depth * t * p.aspect), ny: sy / (depth * t), depth };
}

export interface DetectResult {
  ok: boolean;
  reason: 'ok' | 'frustum' | 'range' | 'occluded' | 'focus';
  depth: number;
}

/**
 * A photo counts if the detection volume centre is inside the frame (with margin for its radius),
 * within range, unoccluded, and the lens is in focus.
 */
export function detect(
  p: CamPose,
  a: AnomalyInstance,
  inFocus: boolean,
  clear: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => boolean,
): DetectResult {
  const pr = project(p, a.x, a.y, a.z);
  if (!pr) return { ok: false, reason: 'frustum', depth: 0 };
  const slack = Math.min(0.3, a.r / Math.max(0.5, pr.depth));
  if (Math.abs(pr.nx) > 0.92 + slack || Math.abs(pr.ny) > 0.92 + slack) return { ok: false, reason: 'frustum', depth: pr.depth };
  if (pr.depth > PHOTO_RANGE) return { ok: false, reason: 'range', depth: pr.depth };
  if (!clear(p.x, p.y, p.z, a.x, a.y, a.z)) return { ok: false, reason: 'occluded', depth: pr.depth };
  if (!inFocus) return { ok: false, reason: 'focus', depth: pr.depth };
  return { ok: true, reason: 'ok', depth: pr.depth };
}
