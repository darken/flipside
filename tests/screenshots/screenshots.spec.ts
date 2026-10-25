import { expect, test, type Page } from '@playwright/test';
import { sampleData } from '../e2e/seed-data.ts';

// Fixed day and sample data, so the images only change when the app does.
const NOW = '2026-10-25T10:30:00-04:00';
const OUT = 'public/screenshots';

test.use({ locale: 'en-US', timezoneId: 'America/New_York' });
test.setTimeout(120_000);

let data: string;
test.beforeAll(async () => {
  data = await sampleData(365, '2026-10-25');
});

async function open(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript((json) => {
    if (localStorage.getItem('flipside:v1')) return;
    localStorage.setItem('flipside:v1', json);
    // A recent backup, so the reminder note stays out of the picture.
    const settings = {
      version: 1,
      theme: 'system',
      autoFlip: true,
      lastBackupAt: new Date().toISOString(),
    };
    localStorage.setItem('flipside:settings:v1', JSON.stringify(settings));
  }, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sunday, October 25');
  await page.evaluate(() => document.fonts.ready);
  await page.clock.resume();
  await page.waitForTimeout(500);
}

const shoot = (page: Page, name: string) =>
  page.screenshot({
    path: `${OUT}/${name}.jpg`,
    type: 'jpeg',
    quality: 82,
    animations: 'disabled',
  });

test.describe('phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  test('light: today, done side, a peel, stats', async ({ page }) => {
    await open(page, 'light');
    await shoot(page, 'narrow-today');

    await page.getByRole('button', { name: 'Show done list' }).click();
    await page.waitForTimeout(900);
    await shoot(page, 'narrow-done');
    await page.getByRole('button', { name: 'Show to-do list' }).click();
    await page.waitForTimeout(900);

    // A pull from the bottom of the list, held half way.
    const cdp = await page.context().newCDPSession(page);
    const point = (y: number) => ({ x: 195, y, id: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(700)] });
    for (let i = 1; i <= 12; i++) {
      await page.waitForTimeout(20);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [point(700 - i * 22)],
      });
    }
    await page.waitForTimeout(100);
    await shoot(page, 'narrow-peel');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(900);
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForTimeout(900);

    await page.getByRole('button', { name: 'Stats' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Stats' })).toBeVisible();
    await page.waitForTimeout(1200);
    await shoot(page, 'narrow-stats');
  });

  test('dark: today', async ({ page }) => {
    await open(page, 'dark');
    await shoot(page, 'narrow-today-dark');
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('wide: today', async ({ page }) => {
    await open(page, 'light');
    await shoot(page, 'wide-today');
  });
});
