import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

const heading = (page: Page) =>
  page.locator('.sheet[data-role="current"] [data-face]:not([inert]) h1');
const face = (page: Page) => page.locator('.sheet[data-role="current"] [data-face]:not([inert])');
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('flipside:v1') ?? '');

async function add(page: Page, text: string) {
  await page.getByLabel('New task').fill(text);
  await page.getByRole('button', { name: 'Add task' }).click();
}

test('yesterday’s tasks can be checked off and back, and older pages are read-only', async ({
  page,
}) => {
  // Day 1: write two tasks.
  await page.clock.install({ time: new Date('2026-10-25T12:00:00-04:00') });
  await page.goto('/');
  await expect(heading(page)).toHaveText('Sunday, October 25');
  await add(page, 'Call Sam');
  await add(page, 'Water plants');
  await expect.poll(() => stored(page)).toContain('Water plants');

  // Day 2: peel to yesterday and check one off.
  await page.clock.setSystemTime(new Date('2026-10-26T09:00:00-04:00'));
  await page.reload();
  await expect(heading(page)).toHaveText('Monday, October 26');
  await page.getByRole('button', { name: 'Older ›' }).click();
  await expect(heading(page)).toHaveText('Sunday, October 25');
  await expect(face(page).getByText('Yesterday')).toBeVisible();
  await expect(face(page).getByLabel('New task')).toHaveCount(0);
  await expect(face(page).getByRole('button', { name: /^Actions for/ })).toHaveCount(0);

  await page.clock.setSystemTime(new Date('2026-10-26T09:10:00-04:00'));
  await face(page).getByRole('checkbox', { name: 'Call Sam' }).check();
  await expect.poll(() => stored(page)).toContain('"doneAt":"2026-10-26T13:10');

  // It is on the done side, with the next day's date in its label.
  await page.getByRole('button', { name: 'Show done list' }).click();
  await expect(face(page).locator('time')).toHaveText(/Oct 26, 9:10 AM/);

  // Stats count it for yesterday.
  await face(page).getByRole('button', { name: 'Stats' }).click();
  const stats = page.getByRole('dialog', { name: 'Stats' });
  await expect(stats).toBeVisible();
  await expect(stats.locator('.tile', { hasText: /^Done/ })).toContainText('1');
  await page.getByRole('button', { name: 'Close stats' }).click();
  await expect(stats).toBeHidden();

  // Unchecking puts it back.
  await face(page).getByRole('checkbox', { name: 'Call Sam' }).click();
  await expect.poll(() => stored(page)).not.toContain('"doneAt"');

  // Day 3: that page is two days old, so it is read-only now.
  await page.clock.setSystemTime(new Date('2026-10-27T08:00:00-04:00'));
  await page.reload();
  await expect(heading(page)).toHaveText('Tuesday, October 27');
  await page.getByRole('button', { name: 'Older ›' }).click();
  await expect(heading(page)).toHaveText('Monday, October 26');
  await page.getByRole('button', { name: 'Older ›' }).click();
  await expect(heading(page)).toHaveText('Sunday, October 25');
  await expect(face(page).getByRole('img', { name: 'Read-only' })).toBeVisible();
  await expect(face(page).getByRole('checkbox', { name: 'Call Sam' })).toBeDisabled();
});
