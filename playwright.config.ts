import { defineConfig } from '@playwright/test';

export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: ['**/deployed.spec.ts'],
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/hum/',
    viewport: { width: 960, height: 540 },
    launchOptions: { args: GL_ARGS },
    trace: 'off',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/hum/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
