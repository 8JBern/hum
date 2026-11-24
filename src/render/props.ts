/** Low-poly prop models, built from boxes and primitives in local space (front faces +z, origin at floor). */
import * as THREE from 'three';
import type { PropKind } from '../world/types.ts';
import { GeoBuilder, lin } from './geo.ts';

const cyl = (rt: number, rb: number, h: number, seg = 10): THREE.BufferGeometry => new THREE.CylinderGeometry(rt, rb, h, seg).toNonIndexed();
const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

const C = {
  laminate: lin(0x8f7b58),
  metal: lin(0x67665f),
  dark: lin(0x24231f),
  fabric: lin(0x4a4d55),
  beige: lin(0xa39d88),
  beige2: lin(0x8c8775),
  white: lin(0xd8d6cc),
  water: lin(0x8fb8cc),
  murk: lin(0x1c1408),
  terracotta: lin(0x7a4a2c),
  deadleaf: lin(0x6e6a36),
  deadleaf2: lin(0x5a5228),
  card: lin(0x8f6d3e),
  tape: lin(0xb59c66),
  pillar: lin(0xc6b06a),
  tilewhite: lin(0xdfe8e6),
  wood: lin(0x8e6e48),
  teal: lin(0x6f8f8c),
  red: lin(0xa83a30),
  yellow: lin(0xd8a820),
  chrome: lin(0xb8bcc0),
  blue: lin(0x3c6ea8),
  screen: lin(0x1c3026),
  partition: lin(0x6a6e72),
};

function build(kind: PropKind, ceil: number, v: number): GeoBuilder {
  const b = new GeoBuilder();
  switch (kind) {
    case 'desk':
      b.box(-0.7, 0.71, -0.35, 0.7, 0.75, 0.35, C.laminate);
      b.box(-0.69, 0, -0.33, -0.65, 0.71, 0.33, C.metal);
      b.box(0.65, 0, -0.33, 0.69, 0.71, 0.33, C.metal);
      b.box(-0.65, 0.3, -0.32, 0.65, 0.71, -0.3, C.metal);
      b.box(0.2, 0.36, -0.28, 0.64, 0.7, 0.3, C.beige2);
      b.box(0.3, 0.58, 0.3, 0.54, 0.6, 0.31, C.dark);
      break;
    case 'chair':
      b.box(-0.23, 0.42, -0.22, 0.23, 0.49, 0.22, C.fabric);
      b.box(-0.22, 0.55, -0.26, 0.22, 0.92, -0.2, C.fabric);
      b.box(-0.03, 0.49, -0.24, 0.03, 0.6, -0.2, C.dark);
      b.geom(cyl(0.025, 0.025, 0.36), at(0, 0.24, 0), C.dark);
      b.box(-0.28, 0.03, -0.03, 0.28, 0.07, 0.03, C.dark);
      b.box(-0.03, 0.03, -0.28, 0.03, 0.07, 0.28, C.dark);
      break;
    case 'cabinet':
    case 'cabinetOpen':
      b.box(-0.24, 0, -0.29, 0.24, 1.3, 0.29, C.beige);
      for (let i = 0; i < 4; i++) {
        const y0 = 0.05 + i * 0.31;
        if (kind === 'cabinetOpen') {
          b.box(-0.21, y0 + 0.02, 0.29, 0.21, y0 + 0.27, 0.72, C.beige2);
          b.box(-0.06, y0 + 0.17, 0.72, 0.06, y0 + 0.2, 0.75, C.chrome);
        } else {
          b.box(-0.22, y0, 0.29, 0.22, y0 + 0.29, 0.3, C.beige2);
          b.box(-0.06, y0 + 0.2, 0.3, 0.06, y0 + 0.23, 0.33, C.chrome);
        }
      }
      break;
    case 'cooler':
      b.box(-0.16, 0, -0.16, 0.16, 0.95, 0.16, C.white);
      b.box(-0.1, 0.7, 0.16, 0.1, 0.78, 0.2, C.dark);
      b.geom(cyl(0.14, 0.15, 0.4, 14), at(0, 1.15, 0), v === 1 ? C.murk : C.water);
      b.geom(cyl(0.05, 0.14, 0.08, 14), at(0, 0.98, 0), v === 1 ? C.murk : C.water);
      break;
    case 'plant':
      b.geom(cyl(0.19, 0.14, 0.32, 12), at(0, 0.16, 0), C.terracotta);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const t = 0.4 + (i % 3) * 0.2;
        b.geom(new THREE.BoxGeometry(0.06, 0.6 + (i % 2) * 0.2, 0.01).toNonIndexed(), at(Math.sin(a) * 0.08, 0.6, Math.cos(a) * 0.08, Math.cos(a) * t, a, Math.sin(a) * t), i % 2 ? C.deadleaf : C.deadleaf2);
      }
      break;
    case 'monitor':
      b.box(-0.2, 0, -0.18, 0.2, 0.34, 0.18, C.beige);
      b.box(-0.16, 0.05, 0.18, 0.16, 0.29, 0.185, C.screen, 0.35);
      b.box(-0.12, 0, -0.3, 0.12, 0.25, -0.18, C.beige2);
      break;
    case 'crt':
      b.box(-0.25, 0, -0.23, 0.25, 0.45, 0.23, C.dark);
      b.box(-0.18, 0.06, -0.38, 0.18, 0.38, -0.23, C.dark);
      break;
    case 'phone':
      b.box(-0.1, 0, -0.09, 0.1, 0.06, 0.09, C.beige);
      b.box(-0.1, 0.06, -0.04, 0.1, 0.1, 0.04, C.beige2);
      break;
    case 'box':
      b.box(-0.25, 0, -0.2, 0.25, 0.36, 0.2, C.card);
      b.box(-0.04, 0.36, -0.2, 0.04, 0.362, 0.2, C.tape);
      break;
    case 'pillar':
      b.box(-0.25, 0, -0.25, 0.25, ceil, 0.25, v === 1 ? C.tilewhite : C.pillar);
      b.box(-0.27, 0, -0.27, 0.27, 0.1, 0.27, C.wood);
      break;
    case 'bench':
      b.box(-0.8, 0.42, -0.2, 0.8, 0.46, 0.2, C.wood);
      b.box(-0.7, 0, -0.15, -0.64, 0.42, 0.15, C.chrome);
      b.box(0.64, 0, -0.15, 0.7, 0.42, 0.15, C.chrome);
      break;
    case 'locker':
      b.box(-0.45, 0, -0.25, 0.45, 1.9, 0.25, C.teal);
      for (let i = 0; i < 3; i++) {
        b.box(-0.44 + i * 0.3, 0.05, 0.25, -0.17 + i * 0.3, 1.85, 0.255, lin(0x7fa09c));
        b.box(-0.2 + i * 0.3, 1.0, 0.255, -0.19 + i * 0.3, 1.1, 0.27, C.chrome);
        for (let k = 0; k < 3; k++) b.box(-0.38 + i * 0.3, 1.6 + k * 0.05, 0.256, -0.23 + i * 0.3, 1.62 + k * 0.05, 0.258, C.dark);
      }
      break;
    case 'lifechair':
      for (const [x, z] of [
        [-0.35, -0.35],
        [0.35, -0.35],
        [-0.35, 0.35],
        [0.35, 0.35],
      ] as const)
        b.box(x - 0.03, 0, z - 0.03, x + 0.03, 1.9, z + 0.03, C.white);
      b.box(-0.36, 1.45, -0.36, 0.36, 1.5, 0.36, C.white);
      b.box(-0.36, 1.5, -0.36, 0.36, 1.85, -0.32, C.white);
      for (let k = 0; k < 4; k++) b.box(-0.35, 0.3 + k * 0.3, 0.32, 0.35, 0.33 + k * 0.3, 0.36, C.white);
      break;
    case 'stairs': {
      const n = 9;
      const h = ceil / n;
      for (let i = 0; i < n; i++) b.box(-0.5, 0, -1 + (i * 2) / n, 0.5, h * (i + 1), -1 + ((i + 1) * 2) / n, i % 2 ? lin(0x7a6a3a) : lin(0x6e5e32));
      b.box(-0.55, 0, -1, -0.5, ceil, 1, C.metal);
      break;
    }
    case 'door':
      b.box(-0.45, 0, -0.03, 0.45, 2.05, 0.03, C.wood);
      b.box(-0.5, 0, -0.035, -0.45, 2.1, 0.035, C.beige2);
      b.box(0.45, 0, -0.035, 0.5, 2.1, 0.035, C.beige2);
      b.box(-0.5, 2.05, -0.035, 0.5, 2.1, 0.035, C.beige2);
      b.box(0.3, 0.98, 0.03, 0.38, 1.02, 0.08, C.chrome);
      break;
    case 'umbrella':
      b.geom(new THREE.ConeGeometry(0.55, 0.3, 10, 1, true).toNonIndexed(), at(0, 0.8, 0), C.dark);
      b.geom(new THREE.ConeGeometry(0.55, 0.3, 10, 1, true).toNonIndexed(), at(0, 0.8, 0, Math.PI), C.dark);
      b.geom(cyl(0.012, 0.012, 0.95), at(0, 0.48, 0), C.chrome);
      b.box(-0.02, 0, -0.08, 0.02, 0.04, 0.02, C.dark);
      break;
    case 'shoe':
      b.box(-0.05, 0, -0.1, 0.05, 0.03, 0.1, C.white);
      b.box(-0.045, 0.03, -0.09, 0.045, 0.08, 0.03, C.red);
      b.box(-0.045, 0.03, 0.03, 0.045, 0.05, 0.09, C.red);
      break;
    case 'ladder':
      for (const x of [-0.25, 0.25]) {
        b.geom(cyl(0.025, 0.025, 1.6), at(x, 0.8, 0), C.chrome);
        b.geom(cyl(0.025, 0.025, 0.4, 8), at(x, 1.6, 0.15, Math.PI / 2), C.chrome);
      }
      for (let k = 0; k < 4; k++) b.box(-0.25, 0.25 + k * 0.33, -0.05, 0.25, 0.28 + k * 0.33, 0.05, C.chrome);
      break;
    case 'divingboard':
      b.box(-0.25, 0, -1.1, 0.25, 0.06, 1.1, C.tilewhite);
      b.box(-0.25, -0.02, -1.1, 0.25, 0, 1.1, C.blue);
      b.box(-0.2, -0.9, -0.9, 0.2, 0, -0.5, C.chrome);
      break;
    case 'cone':
      b.geom(new THREE.ConeGeometry(0.15, 0.55, 10).toNonIndexed(), at(0, 0.3, 0), C.yellow);
      b.box(-0.18, 0, -0.18, 0.18, 0.03, 0.18, C.yellow);
      break;
    case 'table':
      b.box(-0.5, 0.7, -0.5, 0.5, 0.74, 0.5, C.laminate);
      for (const [x, z] of [
        [-0.45, -0.45],
        [0.45, -0.45],
        [-0.45, 0.45],
        [0.45, 0.45],
      ] as const)
        b.box(x - 0.02, 0, z - 0.02, x + 0.02, 0.7, z + 0.02, C.metal);
      break;
    case 'towel':
      for (let k = 0; k < 6; k++) b.box(-0.25, k * 0.15, -0.015, 0.25, (k + 1) * 0.15, 0.015, k % 2 ? C.red : C.white);
      b.box(-0.05, -0.04, -0.03, 0.05, 0, 0.03, C.chrome);
      break;
    case 'lanerope': {
      for (let k = 0; k < 34; k++) b.geom(cyl(0.06, 0.06, 0.1, 8), at(0, 0, -2 + k * 0.12, Math.PI / 2), k % 6 < 3 ? C.red : C.white);
      break;
    }
    case 'wallpanel':
      b.box(-0.6, 0, 0, 0.6, 0.6, 0.04, lin(0x9a968a));
      b.box(-0.56, 0.04, 0.04, 0.56, 0.56, 0.045, lin(0xfff0c8), 3.5);
      break;
    case 'void':
      break;
  }
  return b;
}

const cache = new Map<string, GeoBuilder>();

export function propModel(kind: PropKind, ceil: number, v = 0): GeoBuilder {
  const k = `${kind}:${ceil}:${v}`;
  let m = cache.get(k);
  if (!m) {
    m = build(kind, ceil, v);
    cache.set(k, m);
  }
  return m;
}

/** World matrix for a prop: translate, yaw (front to (sin, cos)), roll about local x, uniform scale. */
export function propMatrix(x: number, y: number, z: number, rot: number, s: number, roll = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, rot, 0, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s * sx, s * sy, s * sz));
}

export const PROP_COLOURS = C;
