/** Builds merged meshes for one world chunk: about eight draw calls per chunk. */
import * as THREE from 'three';
import { panelHash } from '../core/rng.ts';
import { CHUNK_SIZE, hIndex, vIndex } from '../world/chunk.ts';
import { CELL, DOOR_H, PANEL_OFFSET, PANEL_SPACING, PARTITION_H, WALL_T, type WorldChunk } from '../world/types.ts';
import { GeoBuilder, lin } from './geo.ts';
import type { MaterialSet } from './materials.ts';
import { propMatrix, propModel } from './props.ts';
import { ATLAS_COLS, ATLAS_ROWS } from './textures.ts';

const S = CHUNK_SIZE;
const WHITE = new THREE.Color(1, 1, 1);

export interface ChunkView {
  group: THREE.Group;
  /** Dynamic props (anomaly behaviours), keyed by kind. */
  dynamic: { mesh: THREE.Mesh; kind: 'face' | 'breathe' | 'ring'; x: number; z: number; baseRot: number }[];
  pickups: Map<string, THREE.Mesh>;
  dispose(): void;
}

/** Mirror of the GLSL panelLevel(): 0 dead, 0.55 dim, 1 normal, -1 flickering. */
export function panelState(i: number, j: number, seed: number, level: number): number {
  const r = panelHash(i, j, seed, level) % 100;
  if (r < 7) return 0;
  if (r < 15) return 0.55;
  if (r < 19) return -1;
  return 1;
}

function isDoorV(wc: WorldChunk, x: number, z: number): boolean {
  const at = (zz: number): number => (zz < 0 || zz >= S ? 1 : wc.vWalls[vIndex(S, x, zz)]!);
  return wc.vWalls[vIndex(S, x, z)] === 0 && at(z - 1) === 1 && at(z + 1) === 1;
}
function isDoorH(wc: WorldChunk, x: number, z: number): boolean {
  const at = (xx: number): number => (xx < 0 || xx >= S ? 1 : wc.hWalls[hIndex(S, xx, z)]!);
  return wc.hWalls[hIndex(S, x, z)] === 0 && at(x - 1) === 1 && at(x + 1) === 1;
}

let batteryGeo: THREE.BufferGeometry | null = null;
function batteryGeometry(): THREE.BufferGeometry {
  if (!batteryGeo) {
    const b = new GeoBuilder();
    b.box(-0.07, 0, -0.035, 0.07, 0.11, 0.035, lin(0x1c1c1c));
    b.box(-0.07, 0.11, -0.035, 0.07, 0.125, 0.035, lin(0xd06a18), 1.2);
    b.box(-0.05, 0.04, 0.035, 0.05, 0.07, 0.037, lin(0xe8e0c8), 0.6);
    batteryGeo = b.build();
  }
  return batteryGeo;
}

export function buildChunkView(wc: WorldChunk, mats: MaterialSet, seed: number, level: number): ChunkView {
  const ceil = wc.ceil;
  const h = WALL_T / 2;
  const walls = new GeoBuilder();
  const floor = new GeoBuilder();
  const ceiling = new GeoBuilder();
  const props = new GeoBuilder();
  const panels = new GeoBuilder();
  const decals = new GeoBuilder();
  const clocks = new GeoBuilder();
  const ox = wc.ox;
  const oz = wc.oz;
  const partCol = level === 1 ? lin(0xc8d4d4) : lin(0x6c6f70);
  const trim = level === 1 ? lin(0xd6dcd8) : lin(0x8a7650);
  const wallTint = (k: number): THREE.Color => WHITE.clone().multiplyScalar(0.92 + ((k * 2654435761) >>> 0) / 4294967296 * 0.08);

  // Walls: own the west (x = 0..S-1) and north (z = 0..S-1) lines; the east and south borders belong to neighbours.
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const v = wc.vWalls[vIndex(S, x, z)]!;
      const X = ox + x * CELL;
      const Z = oz + z * CELL;
      if (v === 1) walls.box(X - h, 0, Z - h, X + h, ceil, Z + CELL + h, wallTint(x * 31 + z), 0, 1 | 2 | 16 | 32);
      else if (v === 3) props.box(X - 0.04, 0, Z + 0.02, X + 0.04, PARTITION_H, Z + CELL - 0.02, partCol);
      else if (isDoorV(wc, x, z)) {
        const dh = wc.tallDoors.includes(`v:${x}:${z}`) ? DOOR_H * 1.2 : DOOR_H;
        walls.box(X - h, dh, Z, X + h, ceil, Z + CELL, WHITE, 0, 1 | 2 | 8);
        props.box(X - h - 0.01, dh - 0.06, Z, X + h + 0.01, dh, Z + CELL, trim);
        props.box(X - h - 0.01, 0, Z, X + h + 0.01, dh, Z + 0.06, trim);
        props.box(X - h - 0.01, 0, Z + CELL - 0.06, X + h + 0.01, dh, Z + CELL, trim);
      }
      const hv = wc.hWalls[hIndex(S, x, z)]!;
      if (hv === 1) walls.box(X - h, 0, Z - h, X + CELL + h, ceil, Z + h, wallTint(x * 17 + z * 7 + 3), 0, 1 | 2 | 16 | 32);
      else if (hv === 3) props.box(X + 0.02, 0, Z - 0.04, X + CELL - 0.02, PARTITION_H, Z + 0.04, partCol);
      else if (isDoorH(wc, x, z)) {
        const dh = wc.tallDoors.includes(`h:${x}:${z}`) ? DOOR_H * 1.2 : DOOR_H;
        walls.box(X, dh, Z - h, X + CELL, ceil, Z + h, WHITE, 0, 16 | 32 | 8);
        props.box(X, dh - 0.06, Z - h - 0.01, X + CELL, dh, Z + h + 0.01, trim);
        props.box(X, 0, Z - h - 0.01, X + 0.06, dh, Z + h + 0.01, trim);
        props.box(X + CELL - 0.06, 0, Z - h - 0.01, X + CELL, dh, Z + h + 0.01, trim);
      }
    }
  }
  // Skirting boards make walls meet the floor convincingly.
  const skirt = level === 1 ? lin(0x9fb0ae) : lin(0x5e4e2c);
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const X = ox + x * CELL;
      const Z = oz + z * CELL;
      if (wc.vWalls[vIndex(S, x, z)] === 1) props.box(X - h - 0.015, 0, Z - h, X + h + 0.015, 0.09, Z + CELL + h, skirt, 0, 1 | 2 | 4);
      if (wc.hWalls[hIndex(S, x, z)] === 1) props.box(X - h, 0, Z - h - 0.015, X + CELL + h, 0.09, Z + h + 0.015, skirt, 0, 4 | 16 | 32);
    }
  }
  // Wall patches (misaligned seam): a wallpaper quad with a texture shift.
  for (const p of wc.patches) {
    const tx = Math.cos(p.rot);
    const tz = -Math.sin(p.rot);
    const nx = Math.sin(p.rot);
    const nz = Math.cos(p.rot);
    const hw = p.w / 2;
    walls.quad(
      [
        [p.x - tx * hw, 0.1, p.z - tz * hw],
        [p.x + tx * hw, 0.1, p.z + tz * hw],
        [p.x + tx * hw, 0.1 + p.h, p.z + tz * hw],
        [p.x - tx * hw, 0.1 + p.h, p.z - tz * hw],
      ].map((q) => (nx * tx + nz * tz >= 0 ? q : q)) as [number, number, number][],
      [nx, 0, nz],
      WHITE,
      0,
      [
        [p.shiftU, p.shiftV],
        [p.shiftU, p.shiftV],
        [p.shiftU, p.shiftV],
        [p.shiftU, p.shiftV],
      ],
    );
  }

  // Floor and ceiling per cell, with corner darkening where walls meet.
  const aoAt = (x: number, z: number): number => {
    let n = 0;
    const vv = (xx: number, zz: number): number => (xx < 0 || zz < 0 || xx > S || zz >= S ? 0 : wc.vWalls[vIndex(S, xx, zz)]! ? 1 : 0);
    const hh = (xx: number, zz: number): number => (xx < 0 || zz < 0 || xx >= S || zz > S ? 0 : wc.hWalls[hIndex(S, xx, zz)]! ? 1 : 0);
    n += vv(x, z - 1) + vv(x, z) + hh(x - 1, z) + hh(x, z);
    return 1 - Math.min(n, 3) * 0.16;
  };
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const X = ox + x * CELL;
      const Z = oz + z * CELL;
      const c00 = WHITE.clone().multiplyScalar(aoAt(x, z));
      const c10 = WHITE.clone().multiplyScalar(aoAt(x + 1, z));
      const c11 = WHITE.clone().multiplyScalar(aoAt(x + 1, z + 1));
      const c01 = WHITE.clone().multiplyScalar(aoAt(x, z + 1));
      floor.quad(
        [
          [X, 0, Z + CELL],
          [X + CELL, 0, Z + CELL],
          [X + CELL, 0, Z],
          [X, 0, Z],
        ],
        [0, 1, 0],
        [c01, c11, c10, c00],
      );
      ceiling.quad(
        [
          [X, ceil, Z],
          [X + CELL, ceil, Z],
          [X + CELL, ceil, Z + CELL],
          [X, ceil, Z + CELL],
        ],
        [0, -1, 0],
        [c00, c10, c11, c01],
      );
    }
  }

  // Fluorescent panels on the 4 m world grid.
  const i0 = Math.ceil((ox - PANEL_OFFSET) / PANEL_SPACING);
  const j0 = Math.ceil((oz - PANEL_OFFSET) / PANEL_SPACING);
  const panelBase = level === 1 ? new THREE.Color(0.86, 0.97, 1.0) : new THREE.Color(1.0, 0.92, 0.68);
  for (let i = i0; i * PANEL_SPACING + PANEL_OFFSET < ox + 32; i++) {
    for (let j = j0; j * PANEL_SPACING + PANEL_OFFSET < oz + 32; j++) {
      const px = i * PANEL_SPACING + PANEL_OFFSET;
      const pz = j * PANEL_SPACING + PANEL_OFFSET;
      const st = panelState(i, j, seed, level);
      const tint = wc.tints.find((t) => t.i === i && t.j === j);
      const col = tint ? new THREE.Color(tint.r, tint.g, tint.b) : panelBase;
      const y = ceil - 0.012;
      const flick = st === -1 ? 1 : 0;
      const lv = st === -1 ? 1 : st;
      const e = Math.max(lv, 0.0001);
      // Dead panels: emissive near zero (grey diffuser).
      const cc = lv === 0 ? new THREE.Color(0.06, 0.06, 0.055) : col;
      panels.quad(
        [
          [px - 0.6, y, pz - 0.3],
          [px + 0.6, y, pz - 0.3],
          [px + 0.6, y, pz + 0.3],
          [px - 0.6, y, pz + 0.3],
        ],
        [0, -1, 0],
        cc,
        lv === 0 ? 0.5 : e,
        [
          [flick, 0],
          [flick, 0],
          [flick, 0],
          [flick, 0],
        ],
      );
      props.box(px - 0.64, ceil - 0.035, pz - 0.34, px + 0.64, ceil, pz + 0.34, lin(0xa09a88), 0, 1 | 2 | 16 | 32);
    }
  }

  // Props.
  const dynamic: ChunkView['dynamic'] = [];
  const dynGroup: THREE.Mesh[] = [];
  for (const p of wc.props) {
    const model = propModel(p.kind, ceil, p.v ?? (level === 1 && p.kind === 'pillar' ? 1 : 0));
    const sz = p.kind === 'lanerope' ? p.s : 1;
    const s = p.kind === 'lanerope' ? 1 : p.s;
    if (p.dyn) {
      const mesh = new THREE.Mesh(modelGeometry(p.kind, ceil, p.v ?? 0), mats.props);
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.set(p.roll ?? 0, p.rot, 0, 'YXZ');
      mesh.scale.setScalar(p.s);
      dynamic.push({ mesh, kind: p.dyn, x: p.x, z: p.z, baseRot: p.rot });
      dynGroup.push(mesh);
      continue;
    }
    props.append(model, propMatrix(p.x, p.y, p.z, p.rot, s, p.roll ?? 0, 1, 1, sz));
  }

  // Decals.
  for (const d of wc.decals) {
    const col = d.tile % ATLAS_COLS;
    const row = Math.floor(d.tile / ATLAS_COLS);
    const u0 = col / ATLAS_COLS;
    const u1 = (col + 1) / ATLAS_COLS;
    // CanvasTexture has flipY: row 0 is at the top of the canvas, which is v = 1.
    const v1 = 1 - row / ATLAS_ROWS;
    const v0 = 1 - (row + 1) / ATLAS_ROWS;
    const n = new THREE.Vector3(d.nx, d.ny, d.nz);
    const up = Math.abs(d.ny) > 0.5 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    const t = new THREE.Vector3().crossVectors(up, n).normalize();
    const b = new THREE.Vector3().crossVectors(n, t).normalize();
    const c = Math.cos(d.rot);
    const s2 = Math.sin(d.rot);
    const tt = t.clone().multiplyScalar(c).addScaledVector(b, s2);
    const bb = b.clone().multiplyScalar(c).addScaledVector(t, -s2);
    const hw = d.w / 2;
    const hh = d.h / 2;
    const P = new THREE.Vector3(d.x, d.y, d.z);
    const corner = (sx: number, sy: number): [number, number, number] => {
      const q = P.clone().addScaledVector(tt, sx * hw).addScaledVector(bb, sy * hh);
      return [q.x, q.y, q.z];
    };
    decals.quad([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], [d.nx, d.ny, d.nz], WHITE, d.emit, [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ]);
  }

  // Clocks: one quad per face; mode in aEmit, a per-clock hash in colour.r.
  for (const c of wc.clocks) {
    const nx = Math.sin(c.rot);
    const nz = Math.cos(c.rot);
    const tx = nz;
    const tz = -nx;
    const r = 0.17;
    const hashv = new THREE.Color(((Math.floor(c.x * 7 + c.z * 13) * 2654435761) >>> 0) / 4294967296, 0, 0);
    clocks.quad(
      [
        [c.x - tx * r + nx * 0.035, c.y - r, c.z - tz * r + nz * 0.035],
        [c.x + tx * r + nx * 0.035, c.y - r, c.z + tz * r + nz * 0.035],
        [c.x + tx * r + nx * 0.035, c.y + r, c.z + tz * r + nz * 0.035],
        [c.x - tx * r + nx * 0.035, c.y + r, c.z - tz * r + nz * 0.035],
      ],
      [nx, 0, nz],
      hashv,
      c.mode,
    );
    props.geom(new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.035, 20).toNonIndexed(), propMatrix(c.x + nx * 0.017, c.y, c.z + nz * 0.017, c.rot, 1, Math.PI / 2), lin(0x2a2824));
  }

  const group = new THREE.Group();
  const owned: THREE.BufferGeometry[] = [];
  const add = (b: GeoBuilder, m: THREE.Material, order = 0): void => {
    if (!b.count) return;
    const g = b.build();
    owned.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  };
  add(walls, mats.wall);
  add(floor, mats.floor);
  add(ceiling, mats.ceiling);
  add(props, mats.props);
  add(panels, mats.panel);
  add(clocks, mats.clock);
  add(decals, mats.decal, 2);
  if (level === 1) {
    const wg = new THREE.PlaneGeometry(32, 32, 1, 1);
    wg.rotateX(-Math.PI / 2);
    wg.translate(ox + 16, 0.3, oz + 16);
    owned.push(wg);
    const water = new THREE.Mesh(wg, mats.water);
    water.renderOrder = 3;
    group.add(water);
  }
  for (const m of dynGroup) group.add(m);
  const pickups = new Map<string, THREE.Mesh>();
  for (const p of wc.pickups) {
    const m = new THREE.Mesh(batteryGeometry(), mats.props);
    m.position.set(p.x, p.y, p.z);
    m.rotation.y = (p.x * 3.1 + p.z) % 6.28;
    pickups.set(p.id, m);
    group.add(m);
  }
  return {
    group,
    dynamic,
    pickups,
    dispose() {
      for (const g of owned) g.dispose();
      for (const d of dynamic) d.mesh.geometry.dispose();
      group.clear();
    },
  };
}

function modelGeometry(kind: Parameters<typeof propModel>[0], ceil: number, v: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.append(propModel(kind, ceil, v), new THREE.Matrix4());
  return b.build();
}
