import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

function buildSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: '/hum/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  plugins: [
    {
      name: 'build-sha',
      transformIndexHtml: (html: string) => html.replace('</head>', `    <meta name="build" content="${buildSha()}" />\n  </head>`),
    },
  ],
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
} as never);
