import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * BASE_PATH controls where the static build expects to live.
 *  - Unset (default): './' → relative asset URLs; the build works from any
 *    sub-path (GitHub project pages, a custom domain root, or a local preview).
 *  - GitHub Actions sets it from actions/configure-pages (e.g. '/Slippery-Fish/').
 * All runtime asset URLs go through import.meta.env.BASE_URL, so either works.
 */
function resolveBase(raw: string | undefined): string {
  if (raw === undefined) return './';
  const trimmed = raw.trim();
  // configure-pages reports "" for a root site (user site or custom domain).
  if (trimmed === '' || trimmed === '/') return '/';
  if (trimmed === './') return './';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}
const base = resolveBase(process.env.BASE_PATH);

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          return undefined;
        },
      },
    },
  },
  server: { host: true },
  preview: { host: true },
});
