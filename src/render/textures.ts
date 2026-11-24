/** Procedural canvas textures. Everything is drawn in code; no image files. */
import * as THREE from 'three';
import { Rng } from '../core/rng.ts';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, rng: Rng, mono = true): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amount;
    const m = mono ? n : (rng.next() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i]! + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + m));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + n * 0.8));
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, color: string, rmin: number, rmax: number, rng: Rng): void {
  for (let i = 0; i < n; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const r = rng.range(rmin, rmax);
    for (const [ox, oy] of [
      [0, 0],
      [w, 0],
      [-w, 0],
      [0, h],
      [0, -h],
    ] as const) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}

/** Damask-like wallpaper. One tile covers 0.75 m. */
export function wallpaperTexture(): THREE.CanvasTexture {
  const W = 512;
  const [c, ctx] = canvas(W, W);
  const rng = Rng.from(11);
  ctx.fillStyle = '#c2ad66';
  ctx.fillRect(0, 0, W, W);
  // Soft vertical stripes.
  for (let x = 0; x < W; x += 64) {
    ctx.fillStyle = 'rgba(120,100,40,0.10)';
    ctx.fillRect(x, 0, 6, W);
    ctx.fillStyle = 'rgba(255,240,180,0.06)';
    ctx.fillRect(x + 30, 0, 3, W);
  }
  // Damask motif: mirrored curls on a diamond lattice.
  const motif = (cx: number, cy: number, s: number): void => {
    ctx.save();
    ctx.translate(cx, cy);
    for (const m of [1, -1]) {
      ctx.save();
      ctx.scale(m, 1);
      ctx.beginPath();
      ctx.moveTo(0, -60 * s);
      ctx.bezierCurveTo(26 * s, -48 * s, 34 * s, -18 * s, 14 * s, -6 * s);
      ctx.bezierCurveTo(40 * s, -2 * s, 46 * s, 30 * s, 20 * s, 40 * s);
      ctx.bezierCurveTo(10 * s, 46 * s, 4 * s, 56 * s, 0, 66 * s);
      ctx.lineTo(0, -60 * s);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(30 * s, -30 * s, 7 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(36 * s, 18 * s, 5 * s, 11 * s, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, 6 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(210,190,120,0.35)';
    ctx.fill();
    ctx.restore();
  };
  ctx.fillStyle = 'rgba(140,118,52,0.38)';
  for (const [x, y] of [
    [128, 128],
    [384, 384],
    [384, -128],
    [-128, 384],
    [128, 640],
    [640, 128],
    [384, 128 + 512],
  ] as const)
    motif(x, y, 1.3);
  ctx.fillStyle = 'rgba(140,118,52,0.22)';
  for (const [x, y] of [
    [384, 128],
    [128, 384],
    [-128, 128],
    [640, 384],
    [128, -128],
    [384, 640],
  ] as const)
    motif(x, y, 0.7);
  blotches(ctx, W, W, 6, 'rgba(110,90,30,0.10)', 40, 120, rng);
  noise(ctx, W, W, 18, rng);
  return tex(c);
}

/** Damp, stained carpet. One tile covers 2 m. */
export function carpetTexture(): THREE.CanvasTexture {
  const W = 512;
  const [c, ctx] = canvas(W, W);
  const rng = Rng.from(12);
  ctx.fillStyle = '#8c7a3e';
  ctx.fillRect(0, 0, W, W);
  blotches(ctx, W, W, 22, 'rgba(70,58,22,0.13)', 20, 70, rng);
  blotches(ctx, W, W, 10, 'rgba(160,140,80,0.12)', 20, 80, rng);
  // Loop pile: tiny speckles.
  for (let i = 0; i < 26000; i++) {
    const v = rng.next();
    ctx.fillStyle = v < 0.5 ? 'rgba(60,50,20,0.35)' : 'rgba(190,170,100,0.25)';
    ctx.fillRect(rng.next() * W, rng.next() * W, 1.5, 1.5);
  }
  noise(ctx, W, W, 26, rng);
  return tex(c);
}

/** Acoustic ceiling tiles on a T-bar grid. One texture tile covers 1.2 m (2 x 2 tiles). */
export function ceilingTexture(): THREE.CanvasTexture {
  const W = 512;
  const [c, ctx] = canvas(W, W);
  const rng = Rng.from(13);
  ctx.fillStyle = '#d4ccb0';
  ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(90,80,60,${rng.range(0.15, 0.45)})`;
    const s = rng.range(1, 2.6);
    ctx.fillRect(rng.next() * W, rng.next() * W, s, s);
  }
  // Water marks: brown rings.
  for (let i = 0; i < 3; i++) {
    const x = rng.next() * W;
    const y = rng.next() * W;
    const r = rng.range(25, 70);
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
    g.addColorStop(0, 'rgba(160,130,70,0.10)');
    g.addColorStop(0.85, 'rgba(130,100,50,0.35)');
    g.addColorStop(1, 'rgba(130,100,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // T-bar grid.
  ctx.fillStyle = '#9d9786';
  for (let k = 0; k <= 2; k++) {
    ctx.fillRect(k * 256 - 5, 0, 10, W);
    ctx.fillRect(0, k * 256 - 5, W, 10);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let k = 0; k <= 2; k++) {
    ctx.fillRect(k * 256 - 5, 0, 2, W);
    ctx.fillRect(0, k * 256 - 5, W, 2);
  }
  noise(ctx, W, W, 10, rng);
  return tex(c);
}

/** Pool tiles with warm grout. One texture tile covers 1 m (8 x 8 tiles). */
export function poolTileTexture(): THREE.CanvasTexture {
  const W = 512;
  const [c, ctx] = canvas(W, W);
  const rng = Rng.from(14);
  ctx.fillStyle = '#b8a888';
  ctx.fillRect(0, 0, W, W);
  const n = 8;
  const t = W / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = rng.range(-8, 8);
      const g = ctx.createLinearGradient(i * t, j * t, i * t + t, j * t + t);
      g.addColorStop(0, `rgb(${232 + v},${242 + v},${240 + v})`);
      g.addColorStop(1, `rgb(${214 + v},${228 + v},${228 + v})`);
      ctx.fillStyle = g;
      ctx.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
    }
  }
  blotches(ctx, W, W, 5, 'rgba(150,140,90,0.10)', 30, 90, rng);
  noise(ctx, W, W, 8, rng);
  return tex(c);
}

/** Painted plaster for the intro office. */
export function paintTexture(): THREE.CanvasTexture {
  const W = 256;
  const [c, ctx] = canvas(W, W);
  const rng = Rng.from(15);
  ctx.fillStyle = '#d9dbd6';
  ctx.fillRect(0, 0, W, W);
  blotches(ctx, W, W, 8, 'rgba(150,150,140,0.06)', 20, 70, rng);
  noise(ctx, W, W, 10, rng);
  return tex(c);
}

/** Grey-blue office carpet tiles for the intro. */
export function officeCarpetTexture(): THREE.CanvasTexture {
  const W = 256;
  const [c, ctx] = canvas(W, W);
  const rng = Rng.from(16);
  ctx.fillStyle = '#545b66';
  ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rng.next() < 0.5 ? 'rgba(30,34,40,0.4)' : 'rgba(120,128,140,0.3)';
    ctx.fillRect(rng.next() * W, rng.next() * W, 1.4, 1.4);
  }
  ctx.strokeStyle = 'rgba(30,34,40,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, W - 2);
  noise(ctx, W, W, 12, rng);
  return tex(c);
}

/** Generic grain used on props, modulated by vertex colour. */
export function grainTexture(): THREE.CanvasTexture {
  const W = 256;
  const [c, ctx] = canvas(W, W);
  const rng = Rng.from(17);
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(0, 0, W, W);
  blotches(ctx, W, W, 10, 'rgba(80,80,80,0.12)', 10, 50, rng);
  noise(ctx, W, W, 30, rng);
  return tex(c);
}

/** Decal atlas, 8 x 4 tiles of 128 px. */
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;

export function decalAtlas(): THREE.CanvasTexture {
  const T = 128;
  const [c, ctx] = canvas(T * ATLAS_COLS, T * ATLAS_ROWS);
  const rng = Rng.from(18);
  const at = (i: number, f: (x: CanvasRenderingContext2D) => void): void => {
    ctx.save();
    ctx.translate((i % ATLAS_COLS) * T, Math.floor(i / ATLAS_COLS) * T);
    ctx.beginPath();
    ctx.rect(0, 0, T, T);
    ctx.clip();
    f(ctx);
    ctx.restore();
  };
  const blob = (x: CanvasRenderingContext2D, col: string, n: number, spread: number): void => {
    for (let k = 0; k < n; k++) {
      const px = 64 + rng.range(-spread, spread);
      const py = 64 + rng.range(-spread, spread);
      const r = rng.range(10, 34);
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, T, T);
    }
  };
  const note = (x: CanvasRenderingContext2D, lines: string[], hand: boolean, colour = '#e8d870'): void => {
    x.fillStyle = colour;
    x.fillRect(8, 8, 112, 112);
    x.fillStyle = 'rgba(0,0,0,0.08)';
    x.fillRect(8, 8, 112, 16);
    x.fillStyle = hand ? '#1d2a6a' : '#222';
    x.font = hand ? 'italic 15px "Comic Sans MS", "Segoe Print", cursive' : '15px "Segoe Print", "Bradley Hand", cursive';
    lines.forEach((l, i) => x.fillText(l, 16, 46 + i * 20));
  };
  // 0 stain blob
  at(0, (x) => blob(x, 'rgba(60,45,15,0.45)', 7, 30));
  // 1 footprint
  at(1, (x) => {
    x.fillStyle = 'rgba(40,40,30,0.55)';
    x.beginPath();
    x.ellipse(64, 46, 22, 34, 0, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.ellipse(64, 100, 16, 20, 0, 0, Math.PI * 2);
    x.fill();
  });
  // 2 onboarding sticky note
  at(2, (x) => note(x, ['if something', 'is wrong,', 'film it.'], false));
  // 3 your handwriting
  at(3, (x) => note(x, ['you were', 'here before.', 'you filmed', 'this already.'], false));
  // 4 the 90-minute note
  at(4, (x) => note(x, ['it is late.', 'the office', 'will still be', 'here tomorrow.'], false, '#e9e2c2'));
  // 5 person-shaped stain
  at(5, (x) => {
    x.fillStyle = 'rgba(50,38,14,0.42)';
    x.filter = 'blur(3px)';
    x.beginPath();
    x.arc(64, 16, 11, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.ellipse(64, 52, 20, 26, 0, 0, Math.PI * 2);
    x.fill();
    x.fillRect(46, 70, 14, 52);
    x.fillRect(68, 70, 14, 52);
    x.save();
    x.translate(40, 42);
    x.rotate(0.4);
    x.fillRect(-6, 0, 11, 40);
    x.restore();
    x.save();
    x.translate(88, 42);
    x.rotate(-0.4);
    x.fillRect(-5, 0, 11, 40);
    x.restore();
    x.filter = 'none';
  });
  // 6 exit sign pointing into the wall (arrow points down-left into the corner)
  at(6, (x) => {
    x.fillStyle = '#0d4a22';
    x.fillRect(0, 32, 128, 64);
    x.fillStyle = '#d8ffe0';
    x.font = 'bold 30px Arial, sans-serif';
    x.fillText('EXIT', 30, 74);
    x.beginPath();
    x.moveTo(14, 64);
    x.lineTo(26, 52);
    x.lineTo(26, 76);
    x.fill();
    x.fillRect(110, 52, 6, 24);
  });
  // 7 CRT message
  at(7, (x) => {
    x.fillStyle = '#0a140c';
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#9dffb0';
    x.font = 'bold 16px monospace';
    x.fillText('WHY ARE', 22, 52);
    x.fillText('YOU FILMING', 10, 74);
    x.fillText('ME', 52, 96);
  });
  // 8 window with daylight
  at(8, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#cfe6ff');
    g.addColorStop(0.7, '#f4f8ff');
    g.addColorStop(1, '#b8c8a0');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#e6e2d6';
    x.fillRect(0, 0, 128, 8);
    x.fillRect(0, 120, 128, 8);
    x.fillRect(0, 0, 8, 128);
    x.fillRect(120, 0, 8, 128);
    x.fillRect(60, 0, 8, 128);
  });
  // 9 framed photo of a corridor
  at(9, (x) => {
    x.fillStyle = '#3a2c18';
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#c4b06a';
    x.fillRect(12, 12, 104, 104);
    x.fillStyle = '#8a7a3e';
    x.beginPath();
    x.moveTo(12, 116);
    x.lineTo(54, 70);
    x.lineTo(74, 70);
    x.lineTo(116, 116);
    x.fill();
    x.fillStyle = '#e8e2c0';
    x.beginPath();
    x.moveTo(12, 12);
    x.lineTo(54, 56);
    x.lineTo(74, 56);
    x.lineTo(116, 12);
    x.fill();
    x.fillStyle = '#5a4c22';
    x.fillRect(54, 56, 20, 14);
  });
  // 10 thermostat 37.0
  at(10, (x) => {
    x.fillStyle = '#d8d4c8';
    x.fillRect(4, 20, 120, 88);
    x.fillStyle = '#1c2a1c';
    x.fillRect(18, 36, 92, 44);
    x.fillStyle = '#b8f0a0';
    x.font = 'bold 34px monospace';
    x.fillText('37.0', 22, 70);
  });
  // 11 diamond tiles
  at(11, (x) => {
    x.fillStyle = '#b8a888';
    x.fillRect(0, 0, 128, 128);
    x.save();
    x.translate(64, 64);
    x.rotate(Math.PI / 4);
    for (let j = -6; j < 6; j++)
      for (let i = -6; i < 6; i++) {
        x.fillStyle = `rgb(${226 + ((i + j) & 1) * 6},238,238)`;
        x.fillRect(i * 16 + 1.5, j * 16 + 1.5, 13, 13);
      }
    x.restore();
  });
  // 12 glowing drain
  at(12, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 60);
    g.addColorStop(0, 'rgba(255,170,80,1)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(40,30,20,0.9)';
    for (let i = 0; i < 6; i++) x.fillRect(26, 30 + i * 12, 76, 5);
  });
  // 13 chair-shaped shadow
  at(13, (x) => {
    x.fillStyle = 'rgba(10,8,4,0.55)';
    x.filter = 'blur(4px)';
    x.fillRect(30, 30, 68, 60);
    x.fillRect(30, 90, 10, 30);
    x.fillRect(88, 90, 10, 30);
    x.fillRect(30, 8, 68, 14);
    x.filter = 'none';
  });
  // 14 mirrored suite sign
  at(14, (x) => {
    x.fillStyle = '#2b2b2b';
    x.fillRect(0, 40, 128, 48);
    x.save();
    x.scale(-1, 1);
    x.fillStyle = '#e0e0d0';
    x.font = 'bold 24px Arial, sans-serif';
    x.fillText('SUITE 4B', -120, 74);
    x.restore();
  });
  // 15 row of switches
  at(15, (x) => {
    x.fillStyle = '#e4e0d4';
    x.fillRect(0, 44, 128, 40);
    for (let i = 0; i < 12; i++) {
      x.fillStyle = '#c8c2b0';
      x.fillRect(3 + i * 10.5, 52, 8, 24);
      x.fillStyle = '#f6f2e8';
      x.fillRect(5 + i * 10.5, i % 3 ? 56 : 62, 4, 9);
    }
  });
  // 16 power point
  at(16, (x) => {
    x.fillStyle = '#ece8dc';
    x.fillRect(8, 8, 112, 112);
    x.fillStyle = '#2a2a2a';
    x.fillRect(38, 40, 8, 22);
    x.fillRect(82, 40, 8, 22);
    x.fillRect(60, 76, 8, 16);
  });
  // 17 lane marking
  at(17, (x) => {
    x.fillStyle = '#2a3a4a';
    x.fillRect(40, 0, 48, 128);
  });
  // 18 water puddle
  at(18, (x) => blob(x, 'rgba(30,30,20,0.30)', 9, 26));
  // 19 battery icon (unused in world)
  at(19, (x) => {
    x.fillStyle = '#333';
    x.fillRect(20, 40, 80, 48);
  });
  // 20 framed photo of a pool hall
  at(20, (x) => {
    x.fillStyle = '#2a2a2a';
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#cfe8ea';
    x.fillRect(12, 12, 104, 104);
    x.fillStyle = '#6fb8c4';
    x.fillRect(12, 80, 104, 36);
    x.fillStyle = '#e8f4f4';
    x.fillRect(50, 40, 28, 40);
  });
  // 22 dark hole in the ceiling
  at(22, (x) => {
    x.fillStyle = '#050402';
    x.fillRect(4, 4, 120, 120);
    const g = x.createLinearGradient(0, 0, 128, 128);
    g.addColorStop(0, 'rgba(40,35,20,0.6)');
    g.addColorStop(0.3, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(4, 4, 120, 120);
  });
  // 23 ceiling water mark
  at(23, (x) => {
    x.strokeStyle = 'rgba(120,90,40,0.45)';
    x.lineWidth = 6;
    x.filter = 'blur(2px)';
    x.beginPath();
    x.ellipse(64, 64, 48, 40, 0.3, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = 'rgba(150,120,60,0.18)';
    x.fill();
    x.filter = 'none';
  });
  // 24 exit door sign (real exit)
  at(24, (x) => {
    x.fillStyle = '#0b5a26';
    x.fillRect(0, 30, 128, 68);
    x.fillStyle = '#e8ffe8';
    x.font = 'bold 40px Arial, sans-serif';
    x.fillText('EXIT', 18, 80);
  });
  // 25 tape label
  at(25, (x) => note(x, ['TAPE', 'do not', 'record over'], true, '#f0f0e8'));
  return tex(c, false);
}
