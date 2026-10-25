import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

const flipButton = (page: Page) => page.getByRole('button', { name: /^Show (done|to-do) list$/ });
const onBack = async (page: Page) =>
  (await flipButton(page).getAttribute('aria-pressed')) === 'true';

/** Waits until the flip animation has finished. */
const settled = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);

async function add(page: Page, text: string) {
  await page.getByLabel('New task').fill(text);
  await page.getByRole('button', { name: 'Add task' }).click();
}

/** A touch swipe, sent as pointer events (Playwright cannot synthesise real touch drags in WebKit). */
async function swipe(
  page: Page,
  from: [number, number],
  to: [number, number],
  { ms = 250, steps = 10 }: { ms?: number; steps?: number } = {},
) {
  await page.evaluate(
    async ({ from, to, ms, steps }) => {
      const target = document.elementFromPoint(from[0], from[1])!;
      const fire = (type: string, x: number, y: number) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      fire('pointerdown', from[0], from[1]);
      for (let i = 1; i <= steps; i++) {
        await new Promise((r) => setTimeout(r, ms / steps));
        fire(
          'pointermove',
          from[0] + ((to[0] - from[0]) * i) / steps,
          from[1] + ((to[1] - from[1]) * i) / steps,
        );
      }
      fire('pointerup', to[0], to[1]);
    },
    { from, to, ms, steps },
  );
}

/** 30 open and 30 done tasks for today, so both faces have something to scroll. */
async function seedLongLists(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('flipside:v1')) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const key = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const task = (i: number, done: boolean) => ({
      id: `${done ? 'd' : 't'}${i}`,
      text: `${done ? 'Finished' : 'Open'} task ${i}`,
      createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      order: i,
      ...(done && { doneAt: new Date(2026, 0, 1, 1, 0, i).toISOString() }),
    });
    const tasks = [
      ...Array.from({ length: 30 }, (_, i) => task(i, false)),
      ...Array.from({ length: 30 }, (_, i) => task(i, true)),
    ];
    localStorage.setItem(
      'flipside:v1',
      JSON.stringify({ version: 1, routines: [], days: { [key]: { date: key, tasks } } }),
    );
  });
}

const scroller = (page: Page, face: 'todo' | 'done') =>
  page.locator(`[data-face="${face}"] .scroll`);

test('the button turns the page and the hidden face is inert', async ({ page }) => {
  await page.goto('/');
  await add(page, 'one');
  await add(page, 'two');
  await flipButton(page).click();
  await settled(page);
  expect(await onBack(page)).toBe(true);
  await expect(page.locator('[data-face="todo"]')).toHaveAttribute('inert', '');
  await expect(page.locator('[data-face="done"]')).not.toHaveAttribute('inert');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByText('Done list, 0 tasks')).toBeAttached();

  await flipButton(page).click();
  await settled(page);
  expect(await onBack(page)).toBe(false);
});

test('a horizontal swipe turns the page, in either direction', async ({ page }) => {
  await page.goto('/');
  await add(page, 'one');
  await add(page, 'two');

  await swipe(page, [300, 400], [60, 400]);
  await settled(page);
  expect(await onBack(page)).toBe(true);

  await swipe(page, [100, 400], [360, 400]);
  await settled(page);
  expect(await onBack(page)).toBe(false);
});

test('a quick flick turns the page even when it is short', async ({ page }) => {
  await page.goto('/');
  await add(page, 'one');
  await add(page, 'two');
  await swipe(page, [300, 400], [240, 400], { ms: 60, steps: 6 });
  await settled(page);
  expect(await onBack(page)).toBe(true);
});

test('a short, slow swipe springs back', async ({ page }) => {
  await page.goto('/');
  await add(page, 'one');
  await swipe(page, [300, 400], [260, 400], { ms: 600, steps: 12 });
  await settled(page);
  expect(await onBack(page)).toBe(false);
  const transform = await page
    .locator('.card')
    .evaluate((el) => (el as HTMLElement).style.transform);
  expect(transform).toMatch(/rotateY\(0(\.0+)?deg\)/);
});

test('vertical swipes and swipes from the screen edge do not turn the page', async ({ page }) => {
  await page.goto('/');
  await add(page, 'one');
  await swipe(page, [200, 500], [210, 200]);
  await swipe(page, [5, 400], [300, 400]);
  await settled(page);
  expect(await onBack(page)).toBe(false);
});

test('each face keeps its own scroll position', async ({ page }) => {
  await seedLongLists(page);
  await page.goto('/');
  await scroller(page, 'todo').evaluate((el) => (el.scrollTop = 300));
  await expect.poll(() => scroller(page, 'todo').evaluate((el) => el.scrollTop)).toBe(300);

  await flipButton(page).click();
  await settled(page);
  await scroller(page, 'done').evaluate((el) => (el.scrollTop = 120));

  await flipButton(page).click();
  await settled(page);
  expect(await scroller(page, 'todo').evaluate((el) => el.scrollTop)).toBe(300);
  await flipButton(page).click();
  await settled(page);
  expect(await scroller(page, 'done').evaluate((el) => el.scrollTop)).toBe(120);
});

test('the page height is one screen, so the header and flip button stay in view', async ({
  page,
}) => {
  await seedLongLists(page);
  await page.goto('/');
  const viewport = page.viewportSize()!;
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(scrollHeight).toBeLessThanOrEqual(viewport.height + 2); // WebKit rounds dvh up by a pixel
  await expect(flipButton(page)).toBeInViewport();
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
});

test('checking a task off bumps the done count', async ({ page }) => {
  await seedLongLists(page);
  await page.goto('/');
  await expect(flipButton(page)).toContainText('Done (30)');
  await page.getByRole('checkbox', { name: 'Open task 0' }).check();
  await expect(flipButton(page)).toContainText('Done (31)');
});

test('checking off the last open task turns the page and stamps it', async ({ page }) => {
  await page.goto('/');
  await add(page, 'The only one');
  await page.getByRole('checkbox', { name: 'The only one' }).check();
  await expect.poll(() => onBack(page), { timeout: 3000 }).toBe(true);
  await expect(page.getByText('All done ✓')).toBeVisible();
});

test('with reduced motion the page crossfades instead of turning', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await add(page, 'one');
  await flipButton(page).click();
  await expect.poll(() => onBack(page)).toBe(true);
  await expect(page.locator('[data-face="done"]')).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-face="todo"]')).toHaveCSS('opacity', '0');
  expect(await page.locator('.card').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
});
