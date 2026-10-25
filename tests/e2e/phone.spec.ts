import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

const TODAY = '2026-10-25';
const face = (page: Page) => page.locator('.sheet[data-role="current"] [data-face]:not([inert])');

type Seed = { text: string; done?: boolean }[];

/** Today with the given tasks, before the app loads. */
async function open(page: Page, tasks: Seed) {
  const data = {
    version: 1,
    routines: [],
    days: {
      [TODAY]: {
        date: TODAY,
        tasks: tasks.map((t, i) => ({
          id: `t${i}`,
          text: t.text,
          createdAt: `${TODAY}T08:00:00.000Z`,
          order: i,
          ...(t.done && { doneAt: `${TODAY}T09:00:00.000Z` }),
        })),
      },
    },
  };
  await page.clock.install({ time: new Date(`${TODAY}T12:00:00-04:00`) });
  await page.addInitScript((json) => {
    if (!localStorage.getItem('flipside:v1')) localStorage.setItem('flipside:v1', json);
  }, JSON.stringify(data));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sunday, October 25');
}

/** No sideways scrolling anywhere: the document, and every scroller in the page. */
const noSidewaysOverflow = (page: Page) =>
  page.evaluate(() => {
    const wide = [document.documentElement, document.body, ...document.querySelectorAll('.scroll')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.tagName}.${el.className} ${el.scrollWidth}>${el.clientWidth}`);
    return wide;
  });

test('every text field is at least 16px, so iOS does not zoom in when it is focused', async ({
  page,
}) => {
  await open(page, [{ text: 'Something to edit' }]);
  await page.getByRole('button', { name: 'Something to edit', exact: true }).first().click();
  await expect(page.getByRole('textbox', { name: 'Edit task' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByRole('button', { name: 'Erase all data' }).click();
  await page.getByRole('button', { name: 'Erase everything' }).click();
  await expect(page.getByRole('textbox', { name: /erase/i })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Edit task' }).count(); // settle

  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll('textarea, input')]
      .filter((el) => !['checkbox', 'radio', 'file'].includes((el as HTMLInputElement).type))
      .map((el) => parseFloat(getComputedStyle(el).fontSize)),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
});

test('a 2,000-character task wraps, never scrolls sideways, and survives a reload', async ({
  page,
}) => {
  const long =
    Array.from({ length: 200 }, (_, i) => `word${i}`)
      .join(' ')
      .slice(0, 1990) + ' end';
  const unbroken = 'x'.repeat(300);
  await open(page, [{ text: long }, { text: unbroken }, { text: 'Short one' }]);
  expect(await noSidewaysOverflow(page)).toEqual([]);
  await page.reload();
  await expect(face(page).getByText('end', { exact: false }).first()).toBeVisible();
  expect(await noSidewaysOverflow(page)).toEqual([]);
  // The controls of a long task row stay reachable and the page below it is scrollable.
  await expect(page.getByRole('textbox', { name: 'New task' })).toBeAttached();
  const scroller = page.locator('.sheet[data-role="current"] [data-face="todo"] .scroll');
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});

test('200 tasks on one page scroll, flip and take new tasks', async ({ page }) => {
  const tasks: Seed = Array.from({ length: 200 }, (_, i) => ({
    text: `Task number ${i + 1}`,
    done: i % 4 === 0,
  }));
  await open(page, tasks);
  const scroller = page.locator('.sheet[data-role="current"] [data-face="todo"] .scroll');
  await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const field = page.getByRole('textbox', { name: 'New task' });
  await expect(field).toBeInViewport();
  await field.fill('Number 201');
  await field.press('Control+Enter');
  await expect(page.getByRole('button', { name: 'Number 201', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Show done list/ }).click();
  await expect(page.getByText('Done list, 50 tasks')).toBeAttached();
});

test('emoji display, and right-to-left text starts on the right', async ({ page }) => {
  await open(page, [
    { text: 'Plan the trip ✈️🌍' },
    { text: 'مرحبا بالعالم' },
    { text: 'שלום עולם' },
  ]);
  await expect(
    page.getByRole('button', { name: 'Plan the trip ✈️🌍', exact: true }).first(),
  ).toBeVisible();
  const directions = await page.evaluate(() =>
    [
      ...document.querySelectorAll('.sheet[data-role="current"] [data-face="todo"] button.text'),
    ].map((el) => getComputedStyle(el).direction + '/' + getComputedStyle(el).textAlign),
  );
  expect(directions[0]).toBe('ltr/start');
  expect(directions[1]).toBe('rtl/start');
  expect(directions[2]).toBe('rtl/start');
});

test.describe('landscape on a small phone', () => {
  test.use({ viewport: { width: 667, height: 375 } });

  test('the page still fits, scrolls inside, and keeps its controls', async ({ page }) => {
    await open(
      page,
      Array.from({ length: 12 }, (_, i) => ({ text: `Task ${i + 1}` })),
    );
    expect(await noSidewaysOverflow(page)).toEqual([]);
    // The document itself never scrolls: only the face does.
    expect(
      await page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight + 1),
    ).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(page.getByRole('button', { name: /Show done list/ })).toBeInViewport();
    const scroller = page.locator('.sheet[data-role="current"] [data-face="todo"] .scroll');
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  });
});
