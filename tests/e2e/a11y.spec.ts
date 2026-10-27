import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { historyJson, seedHistory } from './helpers.ts';

test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

const TODAY = '2026-10-25T12:00:00-04:00';
const face = (page: Page) => page.locator('.sheet[data-role="current"] [data-face]:not([inert])');
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name });

/** Fails on any serious or critical problem axe finds on the screen as it is now. */
async function scan(page: Page, what: string) {
  // Let animations settle: axe reads colours, which move while a page fades.
  await page.waitForTimeout(700);
  const { violations } = await new AxeBuilder({ page })
    .disableRules(['scrollable-region-focusable']) // scrollers are reachable by touch and keys on their lists
    .analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = serious.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  );
  expect(serious, `${what}\n${summary.join('\n')}`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.clock.install({ time: new Date(TODAY) });
      await seedHistory(page);
      await page.goto('/');
      await expect(face(page).getByRole('button', { name: 'Settings' })).toBeVisible();
    });

    test('today, the done side and a past page', async ({ page }) => {
      await scan(page, 'today');
      await page.getByRole('button', { name: 'Show done list' }).click();
      await expect(face(page).getByRole('heading', { level: 1 })).toBeFocused();
      await scan(page, 'done side');
      await page.getByRole('button', { name: 'Show to-do list' }).click();
      await page.getByRole('button', { name: 'Older ›' }).click();
      await expect(face(page).getByText('Yesterday')).toBeVisible();
      await scan(page, 'a past page');
    });

    test('yesterday (check-off only), front and back, and an older read-only page', async ({
      page,
    }) => {
      await page.getByRole('button', { name: 'Older ›' }).click();
      await expect(face(page).getByText('Yesterday')).toBeVisible();
      await expect(face(page).getByRole('checkbox').first()).toBeEnabled();
      await scan(page, 'yesterday, to do');
      await page.getByRole('button', { name: 'Show done list' }).click();
      await expect(face(page).getByRole('heading', { level: 1 })).toBeFocused();
      await scan(page, 'yesterday, done side');
      await page.getByRole('button', { name: 'Show to-do list' }).click();
      await page.getByRole('button', { name: 'Older ›' }).click();
      await expect(face(page).getByRole('img', { name: 'Read-only' })).toBeVisible();
      await scan(page, 'an older page');
    });

    test('Stats and Settings', async ({ page }) => {
      await face(page).getByRole('button', { name: 'Stats' }).click();
      await expect(dialog(page, 'Stats')).toBeVisible();
      await scan(page, 'stats');
      await page.getByRole('button', { name: 'Close stats' }).click();
      await expect(dialog(page, 'Stats')).toBeHidden();

      await face(page).getByRole('button', { name: 'Settings' }).click();
      await expect(dialog(page, 'Settings')).toBeVisible();
      await scan(page, 'settings');
    });

    test('the import preview and the erase confirmation', async ({ page }) => {
      await face(page).getByRole('button', { name: 'Settings' }).click();
      await expect(dialog(page, 'Settings')).toBeVisible();
      await page.getByLabel('Backup file').setInputFiles({
        name: 'flipside-backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            app: 'flipside',
            backupVersion: 1,
            exportedAt: '2026-10-01T10:00:00.000Z',
            data: JSON.parse(historyJson(20)),
          }),
        ),
      });
      await expect(page.getByRole('button', { name: 'Replace everything' })).toBeVisible();
      await scan(page, 'import preview');
      await page.getByRole('button', { name: 'Cancel' }).click();

      await page.getByRole('button', { name: 'Erase all data' }).click();
      await expect(page.getByRole('heading', { name: 'Erase everything?' })).toBeVisible();
      await scan(page, 'erase, step 1');
      await page.getByRole('button', { name: 'Erase everything' }).click();
      await expect(page.getByRole('heading', { name: 'Are you sure?' })).toBeVisible();
      await scan(page, 'erase, step 2');
    });
  });
}
