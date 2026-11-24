import { defineConfig } from 'vite';

export default defineConfig({
  base: '/hum/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
} as never);
