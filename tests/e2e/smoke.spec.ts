import { expect, test } from '@playwright/test';

test('loads and shows the paper sheet with a date header', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Flipside');
  const sheet = page.locator('.paper');
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
  await expect(page.getByRole('button', { name: 'Stats' })).toBeVisible();
});

test('serves a web app manifest', async ({ page, request }) => {
  await page.goto('/');
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  expect((await res.json()).name).toBe('Flipside');
});
