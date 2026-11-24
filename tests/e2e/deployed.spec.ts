import { expect, test } from '@playwright/test';

type Hooks = Record<string, (...a: unknown[]) => unknown>;

test('deployed: boots without errors, same-origin only, a run starts', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('?test=1');
  await page.waitForFunction(() => !!(window as unknown as { __HUM__?: Hooks }).__HUM__);
  await expect(page).toHaveTitle('FIFTY HERTZ');
  const variance = await page.evaluate(() => {
    const h = (window as unknown as { __HUM__: Hooks }).__HUM__;
    h.step!(10);
    const src = document.querySelector('canvas') as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 90;
    const ctx = c.getContext('2d')!;
    h.render!();
    ctx.drawImage(src, 0, 0, 160, 90);
    const d = ctx.getImageData(0, 0, 160, 90).data;
    let s = 0;
    let q = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      s += l;
      q += l * l;
    }
    const n = d.length / 4;
    return q / n - (s / n) ** 2;
  });
  expect(variance).toBeGreaterThan(20);
  await page.evaluate(() => {
    const h = (window as unknown as { __HUM__: Hooks }).__HUM__;
    h.startRun!({ seed: 1234 });
    h.step!(120);
  });
  const st = (await page.evaluate(() => (window as unknown as { __HUM__: Hooks }).__HUM__.getState!())) as { mode: string; level: number };
  expect(st.mode).toBe('play');
  expect(st.level).toBe(0);
  const origin = new URL(page.url()).origin;
  expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  expect(errors).toEqual([]);
});
