import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests run against the PRODUCTION build served from a
 * sub-path (like GitHub Pages). Build first:
 *   BASE_PATH=/Slippery-Fish/ npm run build && npm run test:e2e
 */
const sub = process.env.E2E_BASE_PATH ?? '/Slippery-Fish/';
const port = Number(process.env.E2E_PORT ?? 4174);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}${sub}`,
    trace: 'retain-on-failure',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=user-gesture-required'],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'node scripts/serve-subpath.mjs',
    url: `http://localhost:${port}${sub}`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(port), SUBPATH: sub },
    timeout: 30_000,
  },
});
