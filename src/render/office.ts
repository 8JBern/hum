/** The ordinary office at night: title screen backdrop and noclip intro. */
import * as THREE from 'three';
import { GeoBuilder, lin } from './geo.ts';
import { materialsFor } from './materials.ts';
import { propMatrix, propModel } from './props.ts';

export const OFFICE_CEIL = 2.7;

export interface OfficeScene {
  group: THREE.Group;
  leanWall: THREE.Mesh;
  dispose(): void;
}

/** Room spans x 0..12, z 0..8. The east wall at x = 12 is the one you lean on. */
export function buildOffice(anomaly: boolean): OfficeScene {
  const mats = materialsFor(9);
  const walls = new GeoBuilder();
  const lean = new GeoBuilder();
  const floor = new GeoBuilder();
  const ceil = new GeoBuilder();
  const props = new GeoBuilder();
  const decals = new GeoBuilder();
  const W = new THREE.Color(1, 1, 1);
  const C = OFFICE_CEIL;
  walls.box(-0.1, 0, -0.1, 12.1, C, 0, W, 0, 16);
  walls.box(-0.1, 0, 8, 12.1, C, 8.1, W, 0, 32);
  walls.box(-0.1, 0, 0, 0, C, 8, W, 0, 1);
  lean.box(12, 0, 0, 12.1, C, 8, W, 0, 2);
  floor.quad(
    [
      [0, 0, 8],
      [12, 0, 8],
      [12, 0, 0],
      [0, 0, 0],
    ],
    [0, 1, 0],
    W,
  );
  ceil.quad(
    [
      [0, C, 0],
      [12, C, 0],
      [12, C, 8],
      [0, C, 8],
    ],
    [0, -1, 0],
    W,
  );
  // Panels on the shared grid (4i + 1).
  for (const px of [1, 5, 9]) {
    for (const pz of [1, 5]) {
      props.box(px - 0.6, C - 0.012, pz - 0.3, px + 0.6, C - 0.011, pz + 0.3, new THREE.Color(0.9, 0.95, 1), 3.6, 8);
      props.box(px - 0.64, C - 0.035, pz - 0.34, px + 0.64, C, pz + 0.34, lin(0xa8a8a4), 0, 1 | 2 | 16 | 32);
    }
  }
  // Two rows of desks with monitors glowing.
  const screen = lin(0x6a8ccc);
  for (const z of [2.2, 5.8]) {
    for (const x of [2.5, 5, 7.5]) {
      const rot = z < 4 ? 0 : Math.PI;
      props.append(propModel('desk', C), propMatrix(x, 0, z, rot, 1));
      props.append(propModel('chair', C), propMatrix(x + 0.1, 0, z + (z < 4 ? 0.75 : -0.75), rot + Math.PI + 0.3, 1));
      props.box(x - 0.22, 0.75, z - 0.1, x + 0.22, 1.05, z + 0.02, lin(0x202224));
      const fz = z < 4 ? z + 0.021 : z - 0.101;
      props.box(x - 0.2, 0.78, fz, x + 0.2, 1.02, fz + 0.002, screen, 1.6);
    }
  }
  // Living plants.
  const leaf = lin(0x3c6a34);
  for (const [x, z] of [
    [0.6, 0.6],
    [0.6, 7.4],
    [10.8, 7.3],
  ] as const) {
    props.append(propModel('plant', C), propMatrix(x, 0, z, 0, 1.1));
    for (let i = 0; i < 6; i++) props.box(x - 0.25 + i * 0.08, 0.6, z - 0.2, x - 0.2 + i * 0.08, 1.2 - (i % 2) * 0.2, z + 0.2, leaf);
  }
  // Filing cabinets and a water cooler by the lean wall.
  props.append(propModel('cabinet', C), propMatrix(11.6, 0, 0.6, -Math.PI / 2, 1));
  props.append(propModel('cooler', C), propMatrix(11.7, 0, 7.2, -Math.PI / 2, 1));
  // Night windows on the north wall: dark glass with distant lights.
  const glass = lin(0x0c1424);
  for (const x of [1.5, 4.5, 7.5, 10.5]) {
    props.box(x - 1.1, 0.9, 0.0, x + 1.1, 2.2, 0.02, glass, 0.4);
    for (let k = 0; k < 7; k++) props.box(x - 1 + k * 0.31, 1.1 + ((k * 37) % 7) * 0.12, 0.021, x - 0.97 + k * 0.31, 1.13 + ((k * 37) % 7) * 0.12, 0.022, lin(0xffd890), 3);
  }
  if (anomaly) props.append(propModel('chair', C), propMatrix(6, C, 4, 0.8, 1, Math.PI));
  void decals;
  const group = new THREE.Group();
  const owned: THREE.BufferGeometry[] = [];
  const add = (b: GeoBuilder, m: THREE.Material): THREE.Mesh => {
    const g = b.build();
    owned.push(g);
    const mesh = new THREE.Mesh(g, m);
    group.add(mesh);
    return mesh;
  };
  add(walls, mats.wall);
  const leanWall = add(lean, mats.wall);
  add(floor, mats.floor);
  add(ceil, mats.ceiling);
  add(props, mats.props);
  return {
    group,
    leanWall,
    dispose() {
      for (const g of owned) g.dispose();
      group.clear();
    },
  };
}
