/**
 * Browser smoke tests against the PRODUCTION build served from a sub-path
 * (the way GitHub Pages serves a project site). Most tests emulate
 * prefers-reduced-motion so springs snap and runs stay fast and stable under
 * software rendering; one test keeps full motion on.
 */
import { expect, test, type Page } from '@playwright/test';

interface Problems { errors: string[]; failed: string[] }

function watch(page: Page): Problems {
  const p: Problems = { errors: [], failed: [] };
  page.on('pageerror', (e) => p.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  page.on('requestfailed', (r) => p.failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => { if (r.status() >= 400) p.failed.push(`${r.status()} ${r.url()}`); });
  return p;
}

async function boot(page: Page, hash = ''): Promise<void> {
  await page.goto(`./${hash}`);
  await expect(page.locator('#boot-loader')).toHaveCount(0, { timeout: 45_000 });
}

test.describe('with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('boots from the sub-path with every asset loading and no errors', async ({ page }) => {
    const problems = watch(page);
    await boot(page);
    for (const label of ['Adventure Map', 'Daily Challenge', 'Infinite', 'Ranked', 'Choose Your Waddle', 'Hoods', 'Quests', 'Treasure Chests', 'Purchases', 'Watch Ads (Fishing)', 'Settings', 'Profile']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Open profile' })).toContainText('Waddler');
    expect(problems.failed, 'failed requests').toEqual([]);
    expect(problems.errors, 'console errors').toEqual([]);
  });

  test('plays Adventure level 1 with the full HUD, pauses and leaves', async ({ page }) => {
    const problems = watch(page);
    await boot(page);
    await page.getByRole('button', { name: 'Adventure Map', exact: true }).click();
    await page.getByRole('listitem', { name: /^Level 1,/ }).click();
    await expect(page.locator('.hud')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.hud-timer')).toContainText('BEST');
    await expect(page.locator('.hud-timer')).toContainText('TIME');
    await expect(page.locator('.hud-level')).toBeVisible();
    // Waddle and sprint a little: the timer starts on first input.
    await page.keyboard.down('KeyD');
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyD');
    await expect(page.locator('.hud-timer .hud-num').nth(1)).not.toHaveText('00:00.000');
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await page.getByRole('button', { name: 'LEAVE' }).click();
    await expect(page.getByRole('heading', { name: 'ADVENTURE' })).toBeVisible({ timeout: 20_000 });
    expect(problems.errors).toEqual([]);
  });

  test('every hanging sign opens and closes', async ({ page }) => {
    const problems = watch(page);
    await boot(page);
    const signs: Array<[string, string]> = [
      ['Quests', 'QUESTS'], ['Hoods', 'HOODS'], ['Treasure Chests', 'TREASURE CHESTS'], ['Purchases', 'PURCHASES'], ['Settings', 'SETTINGS'], ['Profile', 'PROFILE'],
    ];
    for (const [button, title] of signs) {
      await page.getByRole('button', { name: button, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: title });
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
    expect(problems.errors).toEqual([]);
  });

  test('deep links restore safe screens and survive a refresh', async ({ page }) => {
    await boot(page, '#/daily');
    await expect(page.getByRole('heading', { name: 'DAILY CHALLENGE' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Daily milestones' }).getByRole('listitem')).toHaveCount(8);
    await page.reload();
    await expect(page.locator('#boot-loader')).toHaveCount(0, { timeout: 45_000 });
    await expect(page.getByRole('heading', { name: 'DAILY CHALLENGE' })).toBeVisible();
  });

  test('Infinite rejects an invalid seed with a friendly message', async ({ page }) => {
    await boot(page, '#/infinite');
    await page.getByRole('textbox', { name: 'Enter seed code' }).fill('nope!');
    await page.getByRole('button', { name: 'GO' }).click();
    await expect(page.getByRole('alert')).toContainText("isn't a valid seed");
  });

  test('Fishing and Ranked are honest about unavailable services', async ({ page }) => {
    await boot(page, '#/fishing');
    await expect(page.getByRole('status').filter({ hasText: 'not connected' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'START' })).toHaveAttribute('aria-disabled', 'true');
    await page.goto('./#/ranked');
    await expect(page.locator('#boot-loader')).toHaveCount(0, { timeout: 45_000 });
    await expect(page.getByText('Online Ranked: unavailable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'FIND MATCH' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('username persists across reloads (local save)', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Open profile' }).click();
    const input = page.getByRole('textbox', { name: 'Username' });
    await input.fill('Pebble');
    await input.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Open profile' })).toContainText('Pebble');
    await page.waitForTimeout(800); // let the save flush
    await page.reload();
    await expect(page.locator('#boot-loader')).toHaveCount(0, { timeout: 45_000 });
    await expect(page.getByRole('button', { name: 'Open profile' })).toContainText('Pebble');
  });

  test('legal pages are served from the sub-path and marked as drafts', async ({ page }) => {
    for (const f of ['privacy-policy.html', 'terms-of-use.html', 'data-deletion.html', 'support.html', 'third-party-notices.html']) {
      const res = await page.goto(`./legal/${f}`);
      expect(res?.status(), f).toBe(200);
      await expect(page.locator('h1')).toBeVisible();
    }
    await page.goto('./legal/privacy-policy.html');
    await expect(page.getByText('DRAFT — NOT FOR RELEASE.')).toBeVisible();
    await expect(page.getByText('[PUBLISHER LEGAL NAME]').first()).toBeVisible();
  });
});

test('full-motion sign drop settles and closes', async ({ page }) => {
  const problems = watch(page);
  await boot(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'SETTINGS' });
  await expect(dialog).toBeVisible();
  // Input is locked while the sign drops; wait for the transition to finish.
  await expect(page.locator('.input-blocker')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Close' })).toBeInViewport({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Close' }).click({ force: true });
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });
  expect(problems.errors).toEqual([]);
});
