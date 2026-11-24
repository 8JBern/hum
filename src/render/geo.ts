import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/** Accumulates triangles with position, normal, uv, colour and emissive attributes. */
export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  emit: number[] = [];
  idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: THREE.Color, e: number): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    this.emit.push(e);
    return this.count - 1;
  }

  /** Quad from 4 corners in counter-clockwise order (seen from the normal side). */
  quad(
    p: [number, number, number][],
    n: [number, number, number],
    c: THREE.Color | THREE.Color[],
    e = 0,
    uvs: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  ): void {
    const base = this.count;
    for (let i = 0; i < 4; i++) {
      const cc = Array.isArray(c) ? c[i]! : c;
      this.vert(p[i]![0], p[i]![1], p[i]![2], n[0], n[1], n[2], uvs[i]![0], uvs[i]![1], cc, e);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Axis-aligned box from min to max. `faces` bit mask: 1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: THREE.Color, e = 0, faces = 63, uvShift: [number, number] = [0, 0]): void {
    const u = uvShift;
    const uv: [number, number][] = [u, u, u, u];
    if (faces & 1)
      this.quad(
        [
          [x1, y0, z1],
          [x1, y0, z0],
          [x1, y1, z0],
          [x1, y1, z1],
        ],
        [1, 0, 0],
        c,
        e,
        uv,
      );
    if (faces & 2)
      this.quad(
        [
          [x0, y0, z0],
          [x0, y0, z1],
          [x0, y1, z1],
          [x0, y1, z0],
        ],
        [-1, 0, 0],
        c,
        e,
        uv,
      );
    if (faces & 4)
      this.quad(
        [
          [x0, y1, z1],
          [x1, y1, z1],
          [x1, y1, z0],
          [x0, y1, z0],
        ],
        [0, 1, 0],
        c,
        e,
        uv,
      );
    if (faces & 8)
      this.quad(
        [
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y0, z1],
          [x0, y0, z1],
        ],
        [0, -1, 0],
        c,
        e,
        uv,
      );
    if (faces & 16)
      this.quad(
        [
          [x0, y0, z1],
          [x1, y0, z1],
          [x1, y1, z1],
          [x0, y1, z1],
        ],
        [0, 0, 1],
        c,
        e,
        uv,
      );
    if (faces & 32)
      this.quad(
        [
          [x1, y0, z0],
          [x0, y0, z0],
          [x0, y1, z0],
          [x1, y1, z0],
        ],
        [0, 0, -1],
        c,
        e,
        uv,
      );
  }

  /** Append a three.js geometry transformed by m, with a flat colour. */
  geom(g: THREE.BufferGeometry, m: THREE.Matrix4, c: THREE.Color, e = 0): void {
    const gi = g.index ? g : g;
    const p = gi.getAttribute('position');
    const n = gi.getAttribute('normal');
    const base = this.count;
    _nm.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m);
      _n.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
      this.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, 0, 0, c, e);
    }
    if (gi.index) for (let i = 0; i < gi.index.count; i++) this.idx.push(base + gi.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  /** Append another builder's content transformed by m. */
  append(b: GeoBuilder, m: THREE.Matrix4): void {
    const base = this.count;
    _nm.getNormalMatrix(m);
    for (let i = 0; i < b.count; i++) {
      _v.set(b.pos[i * 3]!, b.pos[i * 3 + 1]!, b.pos[i * 3 + 2]!).applyMatrix4(m);
      _n.set(b.nor[i * 3]!, b.nor[i * 3 + 1]!, b.nor[i * 3 + 2]!).applyMatrix3(_nm).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      this.uv.push(b.uv[i * 2]!, b.uv[i * 2 + 1]!);
      this.col.push(b.col[i * 3]!, b.col[i * 3 + 1]!, b.col[i * 3 + 2]!);
      this.emit.push(b.emit[i]!);
    }
    for (const k of b.idx) this.idx.push(base + k);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.emit, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** sRGB hex to a linear colour, for vertex colours. */
export function lin(hex: number, k = 1): THREE.Color {
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace).multiplyScalar(k);
}
