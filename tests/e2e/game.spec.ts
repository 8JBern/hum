import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'artifacts/screenshots';
mkdirSync(SHOTS, { recursive: true });

type Hooks = Record<string, (...a: never[]) => unknown>;
declare global {
  interface Window {
    __HUM__: Hooks;
  }
}

interface Booted {
  errors: string[];
  requests: string[];
}

async function boot(page: Page, opts: { dismiss?: boolean } = {}): Promise<Booted> {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('?test=1');
  await page.waitForFunction(() => !!window.__HUM__);
  if (opts.dismiss !== false) {
    const btn = page.locator('#warning button');
    if (await btn.isVisible()) await btn.click();
  }
  return { errors, requests };
}

const H = <T = unknown>(page: Page, name: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([n, a]) => (window.__HUM__[n as string] as (...x: unknown[]) => unknown)(...(a as unknown[])), [name, args] as const) as Promise<T>;

interface State {
  mode: string;
  player: { x: number; z: number; yaw: number; raised: boolean };
  battery: number;
  evidence: number;
  levelEvidence: number;
  level: number;
  occupant: { x: number; z: number; state: string; active: boolean; frozen: boolean; distance: number | null } | null;
  exit: { x: number; z: number } | null;
  anomalies: { uid: string; type: string; x: number; y: number; z: number; inView: boolean }[];
  flash: number;
}

async function pixelVariance(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.__HUM__.render!();
    const src = document.querySelector('canvas') as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 90;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0, 160, 90);
    const d = ctx.getImageData(0, 0, 160, 90).data;
    let sum = 0;
    let sq = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      sum += l;
      sq += l * l;
    }
    const mean = sum / n;
    return sq / n - mean * mean;
  });
}

test('1 boot: no errors, renders a non-blank canvas', async ({ page }) => {
  const b = await boot(page);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  console.log('WebGL renderer:', renderer);
  await H(page, 'step', 30);
  await page.screenshot({ path: `${SHOTS}/01-title.png` });
  expect(await pixelVariance(page)).toBeGreaterThan(20);
  expect(b.errors).toEqual([]);
});

test('2 network: every request is same-origin', async ({ page }) => {
  const b = await boot(page);
  await H(page, 'startRun', { seed: 1234 });
  await H(page, 'step', 60);
  const origin = new URL(page.url()).origin;
  const foreign = b.requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(foreign).toEqual([]);
});

test('intro screenshot', async ({ page }) => {
  await boot(page);
  await H(page, 'beginIntro');
  await H(page, 'step', 60 * 3);
  await page.screenshot({ path: `${SHOTS}/02-intro.png` });
  await H(page, 'step', 60 * 9);
  expect(await H(page, 'mode')).toBe('intro');
  await H(page, 'step', 60 * 6);
  expect(await H(page, 'mode')).toBe('play');
});

test('3 run: move, raise, photograph a forced anomaly, evidence increases', async ({ page }) => {
  const b = await boot(page);
  await H(page, 'startRun', { seed: 1234, noOccupant: true });
  await H(page, 'step', 2);
  await page.screenshot({ path: `${SHOTS}/03-level-a.png` });
  await H(page, 'setInput', { forward: 1, yawRate: 0.4 });
  for (let i = 0; i < 6; i++) await H(page, 'step', 100);
  await H(page, 'setInput', null);
  const moved = await H<State>(page, 'getState');
  // Back to spawn, force an anomaly in the spawn room and photograph it.
  await H(page, 'startRun', { seed: 1234, noOccupant: true });
  const inst = await H<{ x: number; y: number; z: number; type: string } | null>(page, 'forceAnomaly', 'crt-message');
  expect(inst).not.toBeNull();
  const s0 = await H<State>(page, 'getState');
  // Stand 2.5 m from it, facing it.
  const dx = s0.player.x - inst!.x;
  const dz = s0.player.z - inst!.z;
  const l = Math.hypot(dx, dz) || 1;
  await H(page, 'teleport', inst!.x + (dx / l) * 2.5, inst!.z + (dz / l) * 2.5);
  await H(page, 'aimAt', inst!.x, inst!.y, inst!.z);
  await H(page, 'raiseCamera', true);
  await H(page, 'step', 40);
  await page.screenshot({ path: `${SHOTS}/04-camcorder.png` });
  const before = (await H<State>(page, 'getState')).evidence;
  const r = await H<{ ok: boolean; name: string }>(page, 'snapPhoto');
  await H(page, 'step', 14);
  await page.screenshot({ path: `${SHOTS}/05-anomaly.png` });
  const after = (await H<State>(page, 'getState')).evidence;
  expect(Math.hypot(moved.player.x - s0.player.x, moved.player.z - s0.player.z)).toBeGreaterThan(0.5);
  expect(r.ok).toBe(true);
  expect(after).toBeGreaterThan(before);
  // A false photo of empty floor costs extra battery and gives no evidence.
  const here = await H<State>(page, 'getState');
  await H(page, 'aimAt', here.player.x + 0.3, 0, here.player.z + 0.3);
  await H(page, 'step', 40);
  const bat0 = (await H<State>(page, 'getState')).battery;
  await H(page, 'snapPhoto');
  const s2 = await H<State>(page, 'getState');
  expect(s2.evidence).toBe(after);
  expect(bat0 - s2.battery).toBeGreaterThan(0.02);
  expect(b.errors).toEqual([]);
});

test('4 occupant: approaches when unobserved, frozen when recorded', async ({ page }) => {
  await boot(page);
  await H(page, 'startRun', { seed: 1234 });
  const s = await H<State>(page, 'getState');
  const fx = Math.sin(s.player.yaw);
  const fz = Math.cos(s.player.yaw);
  // Put it 7 m ahead, inside the spawn room.
  await H(page, 'forceOccupant', s.player.x + fx * 7, s.player.z + fz * 7, 'stalking');
  // Unobserved: turn away, camera down.
  await H(page, 'teleport', s.player.x, s.player.z, s.player.yaw + Math.PI);
  const d0 = (await H<State>(page, 'getState')).occupant!.distance!;
  await H(page, 'step', 90);
  const d1 = (await H<State>(page, 'getState')).occupant!.distance!;
  expect(d1).toBeLessThan(d0 - 0.5);
  // Observed: face it through the lens.
  const o = (await H<State>(page, 'getState')).occupant!;
  await H(page, 'aimAt', o.x, 1.3, o.z);
  await H(page, 'raiseCamera', true);
  await H(page, 'step', 20);
  const a = (await H<State>(page, 'getState')).occupant!;
  await H(page, 'step', 120);
  const c = (await H<State>(page, 'getState')).occupant!;
  expect(Math.hypot(a.x - c.x, a.z - c.z)).toBeLessThan(0.01);
  expect(c.frozen).toBe(true);
  await page.screenshot({ path: `${SHOTS}/06-occupant-rec.png` });
});

test('5 death: replay, summary, restart under 2 seconds', async ({ page }) => {
  const b = await boot(page);
  await H(page, 'startRun', { seed: 77 });
  await H(page, 'setInput', { forward: 1, yawRate: 0.3 });
  await H(page, 'step', 200);
  const s = await H<State>(page, 'getState');
  await H(page, 'forceOccupant', s.player.x + 2, s.player.z, 'stalking');
  await H(page, 'step', 60);
  await H(page, 'setInput', null);
  await H(page, 'killPlayer');
  await H(page, 'step', 80);
  expect(await H(page, 'mode')).toBe('replay');
  await H(page, 'step', 150);
  await page.screenshot({ path: `${SHOTS}/07-death-replay.png` });
  await H(page, 'skip');
  expect(await H(page, 'mode')).toBe('summary');
  await page.screenshot({ path: `${SHOTS}/08-summary.png` });
  const t0 = Date.now();
  await H(page, 'pressKey', 'KeyR');
  const elapsed = Date.now() - t0;
  expect(await H(page, 'mode')).toBe('play');
  // Zero simulated frames pass between pressing R and control returning; real time is well under 2 s.
  expect(elapsed).toBeLessThan(2000);
  expect(b.errors).toEqual([]);
});

test('P2-01 your last tape: a lost camcorder plays the previous death in its own world', async ({ page }) => {
  const b = await boot(page);
  await H(page, 'startRun', { seed: 91, noOccupant: true });
  await H(page, 'setInput', { forward: 1, yawRate: 0.4 });
  await H(page, 'step', 240);
  await H(page, 'setInput', null);
  await H(page, 'killPlayer');
  await H(page, 'step', 80);
  await H(page, 'skip');
  expect(await H(page, 'mode')).toBe('summary');
  await H(page, 'startRun', { seed: 4242, noOccupant: true });
  const s = await H<State & { oldTape: { x: number; z: number } | null }>(page, 'getState');
  expect(s.oldTape).not.toBeNull();
  await H(page, 'teleport', s.oldTape!.x + 0.5, s.oldTape!.z);
  await H(page, 'interact');
  const s2 = await H<State & { replayLabel: string }>(page, 'getState');
  expect(s2.mode).toBe('replay');
  expect(s2.replayLabel).toBe('YOUR LAST TAPE');
  await H(page, 'step', 200);
  await page.screenshot({ path: `${SHOTS}/12-last-tape.png` });
  await H(page, 'step', 600);
  expect(await H(page, 'mode')).toBe('play');
  const s3 = await H<State & { oldTape: { taken: boolean } | null }>(page, 'getState');
  expect(s3.oldTape!.taken).toBe(true);
  expect(b.errors).toEqual([]);
});

test('P2-07 touch: first touch shows the controls and the left stick moves the player', async ({ page }) => {
  const b = await boot(page);
  await H(page, 'startRun', { seed: 1234, noOccupant: true });
  const s0 = await H<State>(page, 'getState');
  const fire = (type: string, x: number, y: number): Promise<void> =>
    page.evaluate(
      ([type, x, y]) => {
        const el = document.querySelector('canvas')!;
        const t = new Touch({ identifier: 1, target: el, clientX: x as number, clientY: y as number });
        el.dispatchEvent(new TouchEvent(type as string, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
      },
      [type, x, y] as const,
    );
  await fire('touchstart', 200, 400);
  await fire('touchmove', 200, 340);
  await H(page, 'step', 60);
  await expect(page.locator('#touch [data-t=raise]')).toBeVisible();
  const s1 = await H<State>(page, 'getState');
  expect(Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z)).toBeGreaterThan(0.5);
  await fire('touchend', 200, 340);
  expect(b.errors).toEqual([]);
});

test('6 exit: manifests at the threshold and leads to Level B', async ({ page }) => {
  await boot(page);
  await H(page, 'startRun', { seed: 1234, noOccupant: true });
  await H(page, 'forceEvidence', 8);
  await H(page, 'step', 2);
  const s = await H<State>(page, 'getState');
  expect(s.exit).not.toBeNull();
  await H(page, 'teleport', s.exit!.x, s.exit!.z);
  await H(page, 'interact');
  await H(page, 'step', 100);
  const s2 = await H<State>(page, 'getState');
  expect(s2.level).toBe(1);
  expect(s2.mode).toBe('play');
  await H(page, 'step', 30);
  await page.screenshot({ path: `${SHOTS}/09-level-b.png` });
});

test('7 settings persist across reload, and reduce flicker removes flicker', async ({ page }) => {
  await boot(page);
  await page.locator('#title button[data-a=settings]').click();
  await page.screenshot({ path: `${SHOTS}/10-settings.png` });
  await H(page, 'settings', { fov: 92, reduceFlicker: true, scare: 'calm' });
  await page.reload();
  await page.waitForFunction(() => !!window.__HUM__);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hum.save') ?? '{}').settings);
  expect(saved.fov).toBe(92);
  expect(saved.reduceFlicker).toBe(true);
  expect(saved.scare).toBe('calm');
  await H(page, 'startRun', { seed: 5, noOccupant: true });
  let maxPulse = 0;
  for (let i = 0; i < 20; i++) {
    await H(page, 'step', 30);
    const u = await H<{ flickerPulse: number }>(page, 'uniforms');
    maxPulse = Math.max(maxPulse, u.flickerPulse);
  }
  expect(maxPulse).toBe(0);
  await H(page, 'raiseCamera', true);
  await H(page, 'step', 30);
  await H(page, 'snapPhoto');
  const st = await H<State>(page, 'getState');
  expect(st.flash).toBeLessThanOrEqual(0.12);
});

test('8 budgets: draw calls and triangles at three camera positions', async ({ page }) => {
  await boot(page);
  await H(page, 'startRun', { seed: 1234, noOccupant: true });
  const s = await H<State>(page, 'getState');
  const spots: [number, number, number][] = [
    [s.player.x, s.player.z, s.player.yaw],
    [s.player.x, s.player.z, s.player.yaw + 2],
    [s.player.x + 40, s.player.z + 10, 0.7],
  ];
  for (const [x, z, yaw] of spots) {
    await H(page, 'teleport', x, z, yaw);
    await H(page, 'step', 3);
    const info = await H<{ calls: number; triangles: number }>(page, 'getRendererInfo');
    console.log('renderer info', JSON.stringify(info));
    expect(info.calls).toBeLessThanOrEqual(200);
    expect(info.triangles).toBeLessThanOrEqual(300000);
  }
});

test('9 soak: 10,000 frames with streaming keep geometry and texture counts stable', async ({ page }) => {
  await boot(page);
  await H(page, 'startRun', { seed: 99, noOccupant: true });
  await H(page, 'step', 10);
  const s = await H<State>(page, 'getState');
  let x = s.player.x;
  let z = s.player.z;
  const samples: { geometries: number; textures: number; chunks: number; chunkData: number }[] = [];
  for (let i = 0; i < 20; i++) {
    x += i % 2 ? 37 : 23;
    z += i % 3 === 0 ? -29 : 13;
    await H(page, 'teleport', x, z);
    await H(page, 'step', 500);
    samples.push(await H(page, 'getRendererInfo'));
  }
  console.log('soak', JSON.stringify(samples.map((q) => q.geometries)));
  const warm = samples.slice(2);
  const g = warm.map((q) => q.geometries);
  const t = warm.map((q) => q.textures);
  // No upward trend: counts vary with chunk contents but must not grow.
  const avg = (a: number[]): number => a.reduce((p, q) => p + q, 0) / a.length;
  expect(avg(g.slice(-5))).toBeLessThanOrEqual(avg(g.slice(0, 5)) + 8);
  expect(Math.max(...g)).toBeLessThanOrEqual(120);
  expect(Math.max(...t) - Math.min(...t)).toBe(0);
  expect(Math.max(...warm.map((q) => q.chunkData))).toBeLessThanOrEqual(49);
});

test('archive screenshot', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hum.save') ?? 'null') ?? {};
    localStorage.setItem('hum.save', JSON.stringify({ ...s, version: 2, banked: 64, seenWarning: true, perk: 'battery' }));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__HUM__);
  await page.locator('#title button[data-a=archive]').click();
  await page.locator('#archive [data-lore=lore1]').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/11-archive.png` });
});

test('tape export: Save tape downloads a WebM of the replay', async ({ page }) => {
  await boot(page);
  await H(page, 'startRun', { seed: 77 });
  await H(page, 'setInput', { forward: 1, yawRate: 0.3 });
  await H(page, 'step', 240);
  await H(page, 'setInput', null);
  await H(page, 'killPlayer');
  await H(page, 'step', 80);
  expect(await H(page, 'mode')).toBe('replay');
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.locator('#replay button[data-a=tape]').click();
  for (let i = 0; i < 40; i++) {
    await H(page, 'step', 20);
    await page.waitForTimeout(50);
  }
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/\.webm$/);
  const path = await d.path();
  const { statSync } = await import('node:fs');
  expect(statSync(path!).size).toBeGreaterThan(1000);
});

test('rearrange: furniture around the player changes after the tab was hidden', async ({ page }) => {
  await boot(page);
  await H(page, 'startRun', { seed: 1234, noOccupant: true });
  const before = await H<State>(page, 'getState');
  const ok = await H<boolean>(page, 'rearrange');
  const after = await H<State>(page, 'getState');
  expect(ok).toBe(true);
  expect(after.mode).toBe('play');
  expect(JSON.stringify(after.anomalies.map((a) => a.uid))).not.toBe(JSON.stringify(before.anomalies.map((a) => a.uid)));
});
