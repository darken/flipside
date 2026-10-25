import { expect, test, type Page } from '@playwright/test';
import { keyOffset, seedHistory } from './helpers.ts';

test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

const TODAY = '2026-10-25T12:00:00-04:00';

const heading = (page: Page) =>
  page.locator('.sheet[data-role="current"] [data-face]:not([inert]) h1');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Stats' });
const statsButton = (page: Page) =>
  page
    .locator('.sheet[data-role="current"] [data-face]:not([inert])')
    .getByRole('button', { name: 'Stats' });
const cell = (page: Page, offset: number) =>
  page.locator(`button.cell[data-date="${keyOffset(offset)}"]`);

/** Waits until nothing is animating. */
const settled = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);

async function open(page: Page) {
  await page.clock.install({ time: new Date(TODAY) });
  await seedHistory(page);
  await page.goto('/');
  await expect(heading(page)).toHaveText('Sunday, October 25');
}

test('opens from today, shows the figures, and Back closes it', async ({ page }) => {
  await open(page);
  await statsButton(page).tap();
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stats', level: 1 })).toBeFocused();
  for (const name of ['Done', 'Current streak', 'Longest streak', 'Average per day']) {
    await expect(page.locator('dt', { hasText: name })).toBeVisible();
  }
  await expect(page.getByRole('img', { name: /^Last 30 days: \d+ tasks done/ })).toBeVisible();
  await expect(page.locator('.heatmap')).toBeVisible();
  await expect(dialog(page).locator('.routines .routine').first()).toContainText('Stretch');
  await expect(page.getByRole('img', { name: /Average tasks done per weekday/ })).toBeVisible();

  await page.goBack();
  await expect(dialog(page)).toHaveCount(0);
  await expect(heading(page)).toHaveText('Sunday, October 25');
});

test('opened from a past page, Back returns to that page', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Older ›' }).click();
  await expect(heading(page)).toHaveText('Saturday, October 24');
  await settled(page);
  await statsButton(page).tap();
  await expect(dialog(page)).toBeVisible();
  await page.goBack();
  await expect(dialog(page)).toHaveCount(0);
  await expect(heading(page)).toHaveText('Saturday, October 24');
  await page.goBack(); // and one more Back goes on to today
  await expect(heading(page)).toHaveText('Sunday, October 25');
});

test('the × closes the sheet and takes its history entry with it', async ({ page }) => {
  await open(page);
  await statsButton(page).tap();
  await page.getByRole('button', { name: 'Close stats' }).tap();
  await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => history.state)).toBeNull();
});

test('the range switch changes the bars', async ({ page }) => {
  await open(page);
  await statsButton(page).tap();
  await expect(page.locator('.chart .hit')).toHaveCount(30);
  await page.getByText('90 days', { exact: true }).tap();
  await expect(page.locator('.chart .hit')).toHaveCount(90);
  await page.getByText('7 days', { exact: true }).tap();
  await expect(page.locator('.chart .hit')).toHaveCount(7);
});

test('a heatmap day opens its page, and Back goes from there to today', async ({ page }) => {
  await open(page);
  await statsButton(page).tap();
  const target = cell(page, 10); // Oct 15
  await target.scrollIntoViewIfNeeded();
  await target.tap();
  await expect(page.getByText(/^Oct 15 · \d+ done/)).toBeVisible();
  await page.getByRole('button', { name: 'Open page' }).first().tap();
  await expect(dialog(page)).toHaveCount(0);
  await expect(heading(page)).toHaveText('Thursday, October 15', { timeout: 10_000 });
  await settled(page);
  await page.goBack();
  await expect(heading(page)).toHaveText('Sunday, October 25', { timeout: 10_000 });
});

test('the heatmap opens on the current week and scrolls sideways without moving the page', async ({
  page,
}) => {
  await open(page);
  await statsButton(page).tap();
  const scroller = page.locator('.heatmap .scroller');
  await scroller.scrollIntoViewIfNeeded();
  const state = () =>
    page.evaluate(() => {
      const s = document.querySelector('.heatmap .scroller') as HTMLElement;
      const sheet = document.querySelector('.sheet-host .scroll') as HTMLElement;
      return {
        left: s.scrollLeft,
        max: s.scrollWidth - s.clientWidth,
        sheetTop: sheet.scrollTop,
        docX: document.documentElement.scrollLeft,
        docY: document.documentElement.scrollTop,
        docWide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
  const before = await state();
  expect(before.max).toBeGreaterThan(100); // a year does not fit on a phone
  expect(before.left).toBeGreaterThanOrEqual(before.max - 2); // opens at the current week

  await scroller.evaluate((el) => (el.scrollLeft = 0));
  const after = await state();
  expect(after.left).toBe(0);
  expect(after.sheetTop).toBe(before.sheetTop);
  expect([after.docX, after.docY]).toEqual([0, 0]);
  expect(after.docWide).toBe(false);
});

test('keyboard: arrow keys move through the heatmap and Enter opens a page', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'mobile WebKit has no hardware keyboard to drive');
  await open(page);
  await statsButton(page).tap();
  await cell(page, 0).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(cell(page, 7)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(heading(page)).toHaveText('Sunday, October 18', { timeout: 10_000 });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`looks right in ${scheme} mode`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    await statsButton(page).tap();
    await expect(dialog(page)).toBeVisible();
    await settled(page);
    const colours = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      return {
        paper: css.getPropertyValue('--paper-cream').trim(),
        viz4: css.getPropertyValue('--viz-4').trim(),
        sheet: getComputedStyle(document.querySelector('.sheet-host .sheet')!).backgroundColor,
      };
    });
    expect(colours.viz4).toBe(scheme === 'light' ? '#2f3e5c' : '#c9d6f2');
    expect(colours.paper).toBe(scheme === 'light' ? '#f6efdc' : '#26242c');
    // Nothing sticks out sideways at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const scroll = page.locator('.sheet-host .scroll');
    await page.screenshot({ path: testInfo.outputPath(`stats-${scheme}-top.png`) });
    await testInfo.attach(`stats-${scheme}-top`, {
      path: testInfo.outputPath(`stats-${scheme}-top.png`),
      contentType: 'image/png',
    });
    await scroll.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.screenshot({ path: testInfo.outputPath(`stats-${scheme}-bottom.png`) });
    await testInfo.attach(`stats-${scheme}-bottom`, {
      path: testInfo.outputPath(`stats-${scheme}-bottom.png`),
      contentType: 'image/png',
    });
  });
}
