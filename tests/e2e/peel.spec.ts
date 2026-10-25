import { expect, test, type Page } from '@playwright/test';
import { keyOffset, seedDays, touchDrag } from './helpers.ts';

test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

const TODAY = '2026-10-25T12:00:00-04:00';

const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const sheet = (page: Page, role: 'current' | 'older' | 'newer') =>
  page.locator(`.sheet[data-role="${role}"]`);
const scroller = (page: Page) =>
  page.locator('.sheet[data-role="current"] [data-face="todo"] .scroll');
const flipButton = (page: Page) => page.getByRole('button', { name: /^Show (done|to-do) list$/ });

/** Waits until nothing is animating. */
const settled = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);

async function open(page: Page, offsets?: number[]) {
  await page.clock.install({ time: new Date(TODAY) });
  await seedDays(page, offsets);
  await page.goto('/');
  await expect(heading(page)).toHaveText('Sunday, October 25');
}

/** Older page by key, waiting for the heading (pages turn one at a time). */
async function goOlder(page: Page, headingEnd: string) {
  await page.keyboard.press('Alt+ArrowDown');
  await expect(heading(page)).toHaveText(new RegExp(`${headingEnd}$`));
  await settled(page);
}

const scrollToEnd = (page: Page) =>
  scroller(page).evaluate((el) => (el.scrollTop = el.scrollHeight));

test.describe('peeling with a finger', () => {
  test('a pull past the end of a list peels to the older page, and a pull down comes back', async ({
    page,
  }) => {
    await open(page);
    await scrollToEnd(page);
    await page.waitForTimeout(100);
    await touchDrag(page, [200, 560], [200, 160], { ms: 300 });
    await expect(heading(page)).toHaveText('Saturday, October 24');
    await settled(page);

    // The page is short, so it is at both ends: pulling down comes back to the newer page.
    await touchDrag(page, [200, 200], [200, 560], { ms: 300 });
    await expect(heading(page)).toHaveText('Sunday, October 25');
  });

  test('scrolling to the end of a list is not enough: a peel needs a new touch', async ({
    page,
  }) => {
    await open(page);
    const atEnd = () =>
      scroller(page).evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
    // Drag the list up until it arrives at its end. The drag that gets it there must not peel.
    for (let i = 0; i < 6 && !(await atEnd()); i++) {
      await touchDrag(page, [200, 600], [200, 100], { ms: 200 });
    }
    test.skip(!(await atEnd()), 'synthetic touch does not scroll the list in WebKit');
    await expect(heading(page)).toHaveText('Sunday, October 25');
    await page.waitForTimeout(300);
    await touchDrag(page, [200, 560], [200, 160], { ms: 300 }); // a new touch
    await expect(heading(page)).toHaveText('Saturday, October 24');
  });

  test('a drag that starts mid-list only scrolls, however far it goes', async ({ page }) => {
    await open(page);
    await touchDrag(page, [200, 650], [200, 60], { ms: 300 });
    await expect(heading(page)).toHaveText('Sunday, October 25');
  });

  test('a short, slow pull springs back', async ({ page }) => {
    await open(page);
    await scrollToEnd(page);
    await touchDrag(page, [200, 500], [200, 400], { ms: 800, steps: 16 });
    await settled(page);
    await expect(heading(page)).toHaveText('Sunday, October 25');
    await expect(sheet(page, 'current')).toHaveAttribute('data-key', '2026-10-25');
    const transform = await sheet(page, 'current').evaluate(
      (el) => (el as HTMLElement).style.transform,
    );
    expect(['', 'none']).toContain(transform);
  });

  test('the dead zone: a pull of under 24 px does nothing at all', async ({ page }) => {
    await open(page);
    await scrollToEnd(page);
    await touchDrag(page, [200, 500], [200, 480], { ms: 100 });
    await expect(heading(page)).toHaveText('Sunday, October 25');
  });

  test('a fast flick peels even when short', async ({ page }) => {
    await open(page);
    await scrollToEnd(page);
    await touchDrag(page, [200, 520], [200, 400], { ms: 30, steps: 3 });
    await expect(heading(page)).toHaveText('Saturday, October 24');
  });

  test('a horizontal swipe flips and never peels', async ({ page }) => {
    await open(page);
    await scrollToEnd(page);
    await touchDrag(page, [260, 400], [40, 400], { ms: 250 });
    await settled(page);
    await expect(heading(page)).toHaveText('Sunday, October 25');
    await expect(flipButton(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('the ends of the stack stretch and show a note, without turning a page', async ({
    page,
  }) => {
    await open(page, [0]);
    await touchDrag(page, [200, 200], [200, 500], { ms: 300 });
    await settled(page);
    await expect(heading(page)).toHaveText('Sunday, October 25');
    await touchDrag(page, [200, 500], [200, 200], { ms: 300 });
    await settled(page);
    await expect(heading(page)).toHaveText('Sunday, October 25');
    await expect(sheet(page, 'current')).toHaveCount(1);
  });
});

test.describe('buttons, keys and wheel', () => {
  test('Older and Newer buttons and Alt+Arrow keys turn pages', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Older ›' }).click();
    await expect(heading(page)).toHaveText('Saturday, October 24');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(heading(page)).toHaveText('Friday, October 23');
    await page.keyboard.press('Alt+ArrowUp');
    await expect(heading(page)).toHaveText('Saturday, October 24');
    await page.getByRole('button', { name: '‹ Newer' }).click();
    await expect(heading(page)).toHaveText('Sunday, October 25');
    await expect(page.getByRole('button', { name: '‹ Newer' })).toBeDisabled();
  });

  test('one wheel event at the end of a list turns one page', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'Playwright cannot send mouse wheel events to mobile WebKit',
    );
    await open(page);
    await scrollToEnd(page);
    await page.waitForTimeout(400);
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 400);
    await expect(heading(page)).toHaveText('Saturday, October 24');
    await settled(page);
    await page.mouse.wheel(0, 400); // inside the cool-down: must not turn another page
    await page.waitForTimeout(200);
    await expect(heading(page)).toHaveText('Saturday, October 24');
  });

  test('only three pages exist, and only the top one is reachable', async ({ page }) => {
    await open(page);
    await expect(page.locator('.sheet')).toHaveCount(2); // today has no newer page
    await page.getByRole('button', { name: 'Older ›' }).click();
    await expect(page.locator('.sheet')).toHaveCount(3);
    await expect(sheet(page, 'older')).toHaveAttribute('inert', '');
    await expect(sheet(page, 'older')).toHaveAttribute('aria-hidden', 'true');
    await expect(sheet(page, 'newer')).toHaveAttribute('inert', '');
    await expect(sheet(page, 'current')).not.toHaveAttribute('inert');
    await expect(page.getByRole('region', { name: 'Notepad' })).toBeVisible();
  });

  test('past pages are read-only, show how long ago they are, and offer Copy to today', async ({
    page,
  }) => {
    await open(page);
    await page.getByRole('button', { name: 'Older ›' }).click();
    await expect(heading(page)).toHaveText('Saturday, October 24');
    await settled(page);
    await expect(sheet(page, 'current').getByText('· Yesterday').first()).toBeVisible();
    await expect(page.getByRole('img', { name: 'Read-only' })).toBeVisible();
    await expect(sheet(page, 'current').getByLabel('New task')).toHaveCount(0);
    await expect(page.locator('.sheet[data-role="current"] [data-handle]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Copy to today' }).first().click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(heading(page)).toHaveText('Sunday, October 25');
    await expect(scroller(page)).toContainText('Task 2 of 2026-10-24');
  });

  test('missed days are skipped, with a note on the page below the gap', async ({ page }) => {
    await open(page);
    await goOlder(page, 'October 24');
    await goOlder(page, 'October 23');
    await expect(sheet(page, 'current').getByText(/skipped/)).toHaveCount(0);
    await goOlder(page, 'October 20'); // Oct 21 and 22 have no page
    await expect(sheet(page, 'current').getByText('2 days skipped').first()).toBeVisible();
  });
});

test.describe('getting back to today', () => {
  test('Today animates back from five days away', async ({ page }) => {
    await open(page);
    for (const day of ['24', '23', '20', '19', '18']) await goOlder(page, `October ${day}`);
    await expect(heading(page)).toHaveText(/October 18$/);
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(heading(page)).toHaveText('Sunday, October 25');
    await settled(page);
    await expect(page.getByRole('button', { name: 'Today', exact: true })).toHaveCount(0);
  });

  test('Back from a past page lands on today; Back on today leaves the app', async ({ page }) => {
    await page.goto('about:blank');
    await open(page);
    const lengthBefore = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: 'Older ›' }).click();
    await expect(heading(page)).toHaveText('Saturday, October 24');
    await settled(page);
    await goOlder(page, 'October 23');
    await goOlder(page, 'October 20');
    await expect(heading(page)).toHaveText('Tuesday, October 20');
    // However many pages we peeled, there is exactly one history entry.
    expect(await page.evaluate(() => history.length)).toBe(lengthBefore + 1);

    await page.goBack();
    await expect(heading(page)).toHaveText('Sunday, October 25');
    expect(page.url()).not.toBe('about:blank');

    await page.goBack(); // on today: leaves the app
    await expect(page).toHaveURL('about:blank');
  });

  test('the Today button removes the history entry, so Back then leaves the app', async ({
    page,
  }) => {
    await page.goto('about:blank');
    await open(page);
    await page.getByRole('button', { name: 'Older ›' }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(heading(page)).toHaveText('Sunday, October 25');
    await page.waitForTimeout(200);
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });

  test('a reload always opens on today', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Older ›' }).click();
    await page.reload();
    await expect(heading(page)).toHaveText('Sunday, October 25');
    expect(await page.evaluate(() => history.state)).toBeNull();
  });
});

test.describe('page memory and the new day', () => {
  test('each page remembers which side it was on', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Older ›' }).click();
    await expect(heading(page)).toHaveText('Saturday, October 24');
    await settled(page);
    await flipButton(page).click();
    await settled(page);
    await expect(flipButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '‹ Newer' }).click();
    await expect(heading(page)).toHaveText('Sunday, October 25');
    await settled(page);
    await expect(flipButton(page)).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Older ›' }).click();
    await expect(heading(page)).toHaveText('Saturday, October 24');
    await settled(page);
    await expect(flipButton(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('a new day lays down on top while on today', async ({ page }) => {
    await open(page);
    await page.clock.setSystemTime(new Date('2026-10-26T00:00:30-04:00'));
    await page.clock.runFor(61_000);
    await expect(page.getByText("It's a new day")).toBeVisible();
    await expect(heading(page)).toHaveText('Monday, October 26');
    await page.getByRole('button', { name: 'Older ›' }).click();
    await expect(heading(page)).toHaveText('Sunday, October 25');
    await expect(sheet(page, 'current').getByLabel('New task')).toHaveCount(0); // yesterday is read-only now
  });

  test('on a past page, a new day does not move you', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Older ›' }).click();
    await page.clock.setSystemTime(new Date('2026-10-26T00:00:30-04:00'));
    await page.clock.runFor(61_000);
    await expect(heading(page)).toHaveText('Saturday, October 24');
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(heading(page)).toHaveText('Monday, October 26');
  });
});

test('with reduced motion the pages crossfade instead of peeling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.getByRole('button', { name: 'Older ›' }).click();
  await expect(heading(page)).toHaveText('Saturday, October 24');
  await settled(page);
  const transforms = await page
    .locator('.sheet[data-role="current"], .sheet[data-role="older"]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.transform));
  expect(transforms).toEqual(['none', 'scale(0.96)']);
  await expect(sheet(page, 'current')).toHaveAttribute('data-key', keyOffset(1));
});
