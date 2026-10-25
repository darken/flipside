import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveBuild } from './static-server.ts';

// Service workers, installability and going offline are checked in Chromium (Android's engine);
// WebKit's automation does not offer the same controls.
test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium only');
test.use({ locale: 'en-US', timezoneId: 'America/New_York', serviceWorkers: 'allow' });

const dist = resolve('dist');
const distV2 = resolve('dist-v2');

const registered = (page: Page) =>
  page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);

test.describe('install', () => {
  test('the manifest has what an install prompt needs, with screenshots', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(new URL(href!, page.url()).href)).json();

    expect(manifest).toMatchObject({
      name: 'Flipside',
      short_name: 'Flipside',
      display: 'standalone',
      start_url: '/',
      id: '/',
      scope: '/',
    });
    expect(manifest.shortcuts).toBeUndefined(); // deliberately none: see CLAUDE.md
    const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => [
      i.sizes,
      i.purpose,
    ]);
    expect(sizes).toContainEqual(['192x192', undefined]);
    expect(sizes).toContainEqual(['512x512', undefined]);
    expect(sizes).toContainEqual(['512x512', 'maskable']);

    const shots = manifest.screenshots as {
      src: string;
      sizes: string;
      form_factor: string;
      label: string;
    }[];
    expect(shots.filter((s) => s.form_factor === 'narrow').length).toBeGreaterThanOrEqual(4);
    expect(shots.filter((s) => s.form_factor === 'wide').length).toBeGreaterThanOrEqual(1);
    for (const shot of shots) {
      expect(shot.label).not.toBe('');
      const response = await request.get(new URL(shot.src, new URL(href!, page.url())).href);
      expect(response.ok(), shot.src).toBe(true);
    }
    for (const icon of manifest.icons) {
      const response = await request.get(new URL(icon.src, new URL(href!, page.url())).href);
      expect(response.ok(), icon.src).toBe(true);
    }
  });

  test('registers a service worker', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => registered(page)).toBe('activated');
  });
});

test.describe('offline', () => {
  test('after one visit the app reloads offline and keeps working', async ({ page, context }) => {
    await page.goto('/');
    await expect.poll(() => registered(page)).toBe('activated');
    // The first load must have been fully cached: wait for the sheets' background fetch too.
    await page.waitForTimeout(2500);
    await page.reload(); // now controlled by the worker
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    // Add tasks
    const field = page.getByRole('textbox', { name: 'New task' });
    await field.fill('Offline one');
    await field.press('Control+Enter');
    await field.fill('Offline two');
    await field.press('Control+Enter');
    await expect(page.getByRole('button', { name: 'Offline one' }).first()).toBeVisible();

    // Check one off and flip
    await page.getByRole('checkbox', { name: 'Offline one' }).check();
    await page.getByRole('button', { name: 'Show done list' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByText('Offline one').last()).toBeVisible();
    await page.getByRole('button', { name: 'Show to-do list' }).click();

    // Stats (a separate chunk, from the cache)
    await page.getByRole('button', { name: 'Stats' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Stats' })).toBeVisible();
    await page.getByRole('button', { name: 'Close stats' }).click();

    // A backup download
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    });
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download backup' }).click();
    expect((await downloaded).suggestedFilename()).toMatch(
      /^flipside-backup-\d{4}-\d{2}-\d{2}\.json$/,
    );

    // The data survived the offline reload cycle
    await page.reload();
    await expect(page.getByRole('button', { name: 'Offline two' }).first()).toBeVisible();
  });
});

test.describe('updates', () => {
  test.skip(!existsSync(dist), 'needs the production build');

  test('a new deploy shows "Update available · Reload" in Settings, and Reload brings it in', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', distV2, '--emptyOutDir'], {
      env: { ...process.env, FLIPSIDE_VERSION: '9.9.9' },
      stdio: 'ignore',
    });
    const server = serveBuild(dist);
    const base = await server.start();
    try {
      await page.goto(base);
      await expect.poll(() => registered(page)).toBe('activated');
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await page.waitForTimeout(1500);
      const open = async () => {
        await page.getByRole('button', { name: 'Settings' }).first().click();
        await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
      };
      await open();
      await expect(page.getByText(/^Flipside (?!9\.9\.9)\S+ · built/)).toBeVisible();
      await expect(page.getByRole('button', { name: /Update available/ })).toHaveCount(0);

      // "Deploy" the second build; the browser checks the worker again.
      server.deploy(distV2);
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        await registration.update();
      });
      const update = page.getByRole('button', { name: /Update available · Reload/ });
      await expect(update).toBeVisible({ timeout: 20_000 });

      await update.click();
      // The page reloads on the new version, which closes the sheet.
      await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden({ timeout: 20_000 });
      await open();
      await expect(page.getByText(/^Flipside 9\.9\.9 · built/)).toBeVisible();
      await expect(page.getByRole('button', { name: /Update available/ })).toHaveCount(0);
    } finally {
      await server.stop();
    }
  });
});
