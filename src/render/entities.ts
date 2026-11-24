/** The Occupant, the CCTV stand-in for the player, and the exit door. */
import * as THREE from 'three';
import { GeoBuilder, lin } from './geo.ts';
import type { MaterialSet } from './materials.ts';
import { ATLAS_COLS, ATLAS_ROWS } from './textures.ts';

export const OCC_LAYER = 1;

function capsule(r: number, len: number, seg = 8): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(r, len, 4, seg).toNonIndexed();
}
function m4(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

/** A tall, stooped, faceless silhouette. Original design: elongated, narrow, arms hanging past the knees. */
export function buildOccupant(mats: MaterialSet): THREE.Group {
  const b = new GeoBuilder();
  const c = new THREE.Color(1, 1, 1);
  // Legs.
  b.geom(capsule(0.07, 1.0), m4(-0.11, 0.55, 0, 0.05, 0, 0.03), c);
  b.geom(capsule(0.07, 1.0), m4(0.11, 0.55, -0.02, -0.04, 0, -0.03), c);
  // Pelvis and long torso, leaning forward.
  b.geom(capsule(0.16, 0.2), m4(0, 1.15, 0, 0, 0, 0, 1.2, 1, 0.8), c);
  b.geom(capsule(0.17, 0.62), m4(0, 1.6, 0.12, 0.35, 0, 0, 1.15, 1, 0.75), c);
  // Shoulders.
  b.geom(capsule(0.1, 0.42), m4(0, 1.95, 0.27, 0.3, 0, Math.PI / 2), c);
  // Neck bending down, smooth head with no features.
  b.geom(capsule(0.05, 0.16), m4(0, 2.07, 0.38, 0.9, 0, 0), c);
  b.geom(new THREE.SphereGeometry(0.13, 12, 10).toNonIndexed(), m4(0, 2.08, 0.52, 0.5, 0, 0, 0.85, 1.35, 0.9), c);
  // Arms hanging to below the knees.
  for (const s of [-1, 1]) {
    b.geom(capsule(0.045, 0.62), m4(s * 0.29, 1.62, 0.32, -0.25, 0, s * 0.08), c);
    b.geom(capsule(0.04, 0.6), m4(s * 0.33, 1.02, 0.44, 0.15, 0, s * 0.05), c);
    b.geom(capsule(0.03, 0.22), m4(s * 0.34, 0.6, 0.42, 0.1, 0, 0), c);
  }
  const g = b.build();
  const mesh = new THREE.Mesh(g, mats.occupant);
  mesh.layers.set(OCC_LAYER);
  mesh.frustumCulled = false;
  const grp = new THREE.Group();
  grp.add(mesh);
  return grp;
}

/** A dark figure holding a camcorder, seen on the CCTV replay. */
export function buildStandIn(mats: MaterialSet): THREE.Group {
  const b = new GeoBuilder();
  const coat = lin(0x2c3038);
  const skin = lin(0x8a7060);
  const trousers = lin(0x24262a);
  b.geom(capsule(0.08, 0.7), m4(-0.1, 0.42, 0), trousers);
  b.geom(capsule(0.08, 0.7), m4(0.1, 0.42, 0), trousers);
  b.geom(capsule(0.19, 0.42), m4(0, 1.18, 0, 0, 0, 0, 1.1, 1, 0.7), coat);
  b.geom(new THREE.SphereGeometry(0.11, 12, 10).toNonIndexed(), m4(0, 1.6, 0.02), skin);
  b.geom(capsule(0.05, 0.4), m4(-0.24, 1.2, 0.12, -0.9, 0, 0.2), coat);
  b.geom(capsule(0.05, 0.4), m4(0.24, 1.2, 0.12, -0.9, 0, -0.2), coat);
  b.box(-0.07, 1.33, 0.3, 0.07, 1.43, 0.5, lin(0x151515));
  b.box(-0.02, 1.36, 0.5, 0.02, 1.4, 0.51, lin(0xff2a10), 3);
  const mesh = new THREE.Mesh(b.build(), mats.props);
  const grp = new THREE.Group();
  grp.add(mesh);
  return grp;
}

/** Plain grey steel door with a lit EXIT box sign above it. Front faces +z. */
export function buildExitDoor(mats: MaterialSet): THREE.Group {
  const b = new GeoBuilder();
  const steel = lin(0x6c7074);
  b.box(-0.5, 0, 0, 0.5, 2.1, 0.06, steel);
  b.box(-0.56, 0, -0.01, -0.5, 2.16, 0.08, lin(0x3c3e40));
  b.box(0.5, 0, -0.01, 0.56, 2.16, 0.08, lin(0x3c3e40));
  b.box(-0.56, 2.1, -0.01, 0.56, 2.16, 0.08, lin(0x3c3e40));
  b.box(-0.42, 0.98, 0.06, 0.25, 1.04, 0.12, lin(0xb0b4b8));
  b.box(-0.3, 2.28, 0, 0.3, 2.5, 0.14, lin(0x1a1a1a));
  // Light spill on the floor in front of the door.
  const d = new GeoBuilder();
  const tile = 24;
  const u0 = (tile % ATLAS_COLS) / ATLAS_COLS;
  const u1 = (tile % ATLAS_COLS + 1) / ATLAS_COLS;
  const v1 = 1 - Math.floor(tile / ATLAS_COLS) / ATLAS_ROWS;
  const v0 = 1 - (Math.floor(tile / ATLAS_COLS) + 1) / ATLAS_ROWS;
  d.quad(
    [
      [-0.3, 2.28, 0.145],
      [0.3, 2.28, 0.145],
      [0.3, 2.5, 0.145],
      [-0.3, 2.5, 0.145],
    ],
    [0, 0, 1],
    new THREE.Color(1, 1, 1),
    2.6,
    [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ],
  );
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(b.build(), mats.props));
  const sign = new THREE.Mesh(d.build(), mats.decal);
  sign.renderOrder = 2;
  grp.add(sign);
  return grp;
}

/** A dynamic sticky note (the 90-minute note), as a small decal-mesh. */
export function buildNote(mats: MaterialSet, tile: number): THREE.Mesh {
  const d = new GeoBuilder();
  const u0 = (tile % ATLAS_COLS) / ATLAS_COLS;
  const u1 = (tile % ATLAS_COLS + 1) / ATLAS_COLS;
  const v1 = 1 - Math.floor(tile / ATLAS_COLS) / ATLAS_ROWS;
  const v0 = 1 - (Math.floor(tile / ATLAS_COLS) + 1) / ATLAS_ROWS;
  d.quad(
    [
      [-0.17, -0.17, 0],
      [0.17, -0.17, 0],
      [0.17, 0.17, 0],
      [-0.17, 0.17, 0],
    ],
    [0, 0, 1],
    new THREE.Color(1, 1, 1),
    0,
    [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ],
  );
  const m = new THREE.Mesh(d.build(), mats.decal);
  m.renderOrder = 2;
  return m;
}
