import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

const field = (page: Page) => page.getByLabel('New task');
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('flipside:v1') ?? '');

async function add(page: Page, text: string) {
  await field(page).fill(text);
  await page.getByRole('button', { name: 'Add task' }).click();
}

const taskTexts = (page: Page) => page.locator('[data-task-id] .text').allTextContents();

test('a 3-line task survives a reload', async ({ page }) => {
  await page.goto('/');
  await add(page, 'line one\nline two\nline three');
  await expect.poll(() => stored(page)).toContain('line three');

  await page.reload();
  const task = page.locator('[data-task-id] .text');
  await expect(task).toContainText('line three');
  // Each line sits on its own ruled line.
  expect((await task.boundingBox())?.height).toBe(96);
  const rowHeights = await page
    .locator('[data-task-id]')
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(rowHeights.every((h) => h % 32 === 0)).toBe(true);
});

test('completing a task moves it to the done side', async ({ page }) => {
  await page.goto('/');
  await add(page, 'Pay rent');
  await add(page, 'Water plants'); // a second task, so finishing the first does not turn the page
  await page.getByRole('checkbox', { name: 'Pay rent' }).check();
  const flip = page.getByRole('button', { name: 'Show done list' });
  await expect(flip).toContainText('Done (1)');

  await flip.click();
  await expect(page.getByText('1 done today')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Pay rent' })).toBeChecked();

  await page.getByRole('checkbox', { name: 'Pay rent' }).click();
  await expect(page.getByText('Nothing done yet')).toBeVisible();
});

test('dragging the handle reorders tasks', async ({ page }) => {
  await page.goto('/');
  for (const text of ['first', 'second', 'third']) await add(page, text);
  await expect.poll(() => taskTexts(page)).toEqual(['first', 'second', 'third']);

  const box = (await page.locator('[data-handle]').first().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 30, { steps: 5 });
  await page.mouse.move(x, y + 75, { steps: 5 });
  await page.mouse.up();

  await expect.poll(() => taskTexts(page)).toEqual(['second', 'third', 'first']);
  await expect.poll(() => stored(page)).toContain('first');
});

test('a routine comes back on the next day and the old page is read-only', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-25T12:00:00-04:00') });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sunday, October 25');

  await add(page, 'Stretch');
  await page.getByRole('button', { name: 'Actions for: Stretch' }).click();
  await page.getByRole('button', { name: 'Make routine' }).click();
  await expect(page.getByRole('img', { name: 'Routine' })).toBeVisible();
  await expect.poll(() => stored(page)).toContain('"active":true');

  // Midnight passes while the page is open; the change is refused with a notice.
  await page.clock.setSystemTime(new Date('2026-10-26T00:00:10-04:00'));
  await add(page, 'too late');
  await expect(page.getByText("It's a new day. Yesterday's page is now read-only")).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Monday, October 26');
  await expect(page.getByRole('checkbox', { name: 'Stretch' })).toHaveCount(1);
  await expect(page.getByText('too late')).toHaveCount(0);
});
