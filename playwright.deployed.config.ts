import { defineConfig } from '@playwright/test';
import { GL_ARGS } from './playwright.config.ts';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: ['**/deployed.spec.ts'],
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.HUM_URL ?? 'https://8jbern.github.io/hum/',
    viewport: { width: 960, height: 540 },
    launchOptions: { args: GL_ARGS },
    trace: 'off',
  },
});
