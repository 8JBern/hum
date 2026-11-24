import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test.use({ video: { mode: 'on', size: { width: 960, height: 540 } } });

type Hooks = Record<string, (...a: unknown[]) => unknown>;

test('10 bot tour: seed 1234 navigates, photographs anomalies and reaches Level B', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('?test=1');
  await page.waitForFunction(() => !!(window as unknown as { __HUM__?: Hooks }).__HUM__);
  await page.evaluate(() => (window as unknown as { __HUM__: Hooks }).__HUM__.startRun!({ seed: 1234, noOccupant: true }));
  let r: { mode: string; level: number; evidence: number; exit: boolean; log: string[] } = { mode: '', level: 0, evidence: 0, exit: false, log: [] };
  for (let i = 0; i < 400 && r.level < 1; i++) {
    r = (await page.evaluate(() => (window as unknown as { __HUM__: Hooks }).__HUM__.bot!(90))) as typeof r;
    if (i % 20 === 0) console.log(JSON.stringify(r));
  }
  console.log('final', JSON.stringify(r));
  expect(r.level).toBe(1);
  await page.evaluate(() => (window as unknown as { __HUM__: Hooks }).__HUM__.step!(60));
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
  const v = page.video();
  await page.close();
  if (v) {
    mkdirSync('artifacts/video', { recursive: true });
    await v.saveAs('artifacts/video/bot-tour.webm');
  }
});
