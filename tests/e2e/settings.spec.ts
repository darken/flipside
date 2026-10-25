import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { historyJson, keyOffset, seedHistory } from './helpers.ts';

test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

const TODAY = '2026-10-25T12:00:00-04:00';

const heading = (page: Page) =>
  page.locator('.sheet[data-role="current"] [data-face]:not([inert]) h1');
const face = (page: Page) => page.locator('.sheet[data-role="current"] [data-face]:not([inert])');
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name });

async function open(page: Page, { at = TODAY, history = true } = {}) {
  await page.clock.install({ time: new Date(at) });
  if (history) await seedHistory(page);
  await page.goto('/');
  await expect(face(page).getByRole('button', { name: 'Settings' })).toBeVisible();
}

const openSettings = async (page: Page) => {
  await face(page).getByRole('button', { name: 'Settings' }).tap();
  await expect(dialog(page, 'Settings')).toBeVisible();
};

/** A phone share sheet that is not there, so the backup downloads. */
const noShare = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });

test('downloading a backup gives a valid file and records the time', async ({ page }) => {
  await noShare(page);
  await open(page);
  await openSettings(page);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).tap();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('flipside-backup-2026-10-25.json');
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(backup).toMatchObject({ app: 'flipside', backupVersion: 1 });
  expect(Object.keys(backup.data.days)).toHaveLength(96);
  expect(backup.settings).toEqual({ version: 1, theme: 'system', autoFlip: true });
  expect(backup.data.routines).toHaveLength(1);
  await expect(page.getByText('Last backup: Today')).toBeVisible();
});

test('with a share sheet, the backup is handed to it instead', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { shared: string[] };
    w.shared = [];
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async (data: { files: File[] }) => void w.shared.push(data.files[0]!.name),
      configurable: true,
    });
  });
  await open(page);
  await openSettings(page);
  await page.getByRole('button', { name: 'Download backup' }).tap();
  await expect(page.getByText('Last backup: Today')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { shared: string[] }).shared)).toEqual([
    'flipside-backup-2026-10-25.json',
  ]);
});

test('importing a backup replaces the notepad and the stats', async ({ page }) => {
  await open(page);
  await openSettings(page);

  const day = (offset: number, done: number) => {
    const key = keyOffset(offset);
    return [
      key,
      {
        date: key,
        tasks: Array.from({ length: done }, (_, i) => ({
          id: `imp-${key}-${i}`,
          text: `Imported ${key} #${i + 1}`,
          createdAt: `${key}T08:00:00.000Z`,
          doneAt: `${key}T09:00:00.000Z`,
          order: i,
        })),
      },
    ] as const;
  };
  const backup = {
    app: 'flipside',
    backupVersion: 1,
    exportedAt: '2026-10-20T10:00:00.000Z',
    data: { version: 1, routines: [], days: Object.fromEntries([day(1, 2), day(2, 3), day(3, 4)]) },
    settings: { version: 1, theme: 'dark', autoFlip: true },
  };
  await page.getByLabel('Backup file').setInputFiles({
    name: 'flipside-backup-2026-10-20.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole('heading', { name: 'Import backup' })).toBeVisible();
  await expect(
    page.getByText(/Oct 22 – Oct 24, 2026 · 3 days · 9 tasks done · 0 routines/),
  ).toBeVisible();
  await expect(page.getByText(/This replaces everything/)).toBeVisible();
  await page.getByRole('button', { name: 'Replace everything' }).tap();

  await expect(dialog(page, 'Settings')).toHaveCount(0);
  await expect(page.getByText('Backup imported')).toBeVisible();
  await expect(heading(page)).toHaveText('Sunday, October 25');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // The notepad now shows the imported pages…
  await page.getByRole('button', { name: 'Older ›' }).click();
  await expect(heading(page)).toHaveText('Saturday, October 24');
  await page.getByRole('button', { name: 'Show done list' }).click();
  await expect(face(page).getByText('Imported 2026-10-24 #1')).toBeVisible();

  // …and so do the stats.
  await page.getByRole('button', { name: 'Stats' }).first().tap();
  await expect(page.locator('dt', { hasText: 'Done' }).locator('..')).toContainText('9');
});

test('Undo brings the old notebook back', async ({ page }) => {
  await open(page);
  await openSettings(page);
  const backup = {
    version: 1,
    routines: [],
    days: {},
  };
  await page.getByLabel('Backup file').setInputFiles({
    name: 'empty.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole('button', { name: 'Replace everything' }).tap();
  await expect(page.getByText('Backup imported')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByText('Import undone')).toBeVisible();
  await page.getByRole('button', { name: 'Older ›' }).click();
  await expect(heading(page)).toHaveText('Saturday, October 24');
});

test('a file that is not a backup shows an error and changes nothing', async ({ page }) => {
  await open(page);
  await openSettings(page);
  await page.getByLabel('Backup file').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello": 1}'),
  });
  await expect(page.getByRole('alert')).toHaveText('Not a Flipside backup');
});

test('the dark theme survives a reload, applied before any script runs', async ({ page }) => {
  await open(page);
  await openSettings(page);
  await page.getByText('Dark', { exact: true }).tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(
    await page.evaluate(() =>
      document.querySelector('meta[name="theme-color"]')!.getAttribute('content'),
    ),
  ).toBe('#1c1b22');

  // With every script blocked, only the inline one in index.html can have set the theme.
  await page.route('**/*.js', (route) => route.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(
    await page.evaluate(() =>
      document.querySelector('meta[name="theme-color"]')!.getAttribute('content'),
    ),
  ).toBe('#1c1b22');
  await page.unroute('**/*.js');
  await page.reload();
  await expect(face(page).getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('turning auto-flip off keeps the page on the to-do side', async ({ page }) => {
  await open(page, { history: false });
  await openSettings(page);
  await page.getByRole('switch', { name: /Auto-flip when done/ }).tap();
  await page.getByRole('button', { name: 'Close settings' }).tap();
  await expect(dialog(page, 'Settings')).toHaveCount(0);
  await page.getByLabel('New task').fill('only task');
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('checkbox', { name: 'only task' }).check();
  await page.waitForTimeout(1200);
  await expect(page.getByRole('button', { name: 'Show done list' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('erasing needs two confirmations and leaves an empty today', async ({ page }) => {
  // Seeded after the first load, so erasing and reloading does not seed it again.
  await open(page, { history: false });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('flipside:v1'))).not.toBeNull(); // the first save has happened, so nothing is left to overwrite the seed
  await page.evaluate((json) => localStorage.setItem('flipside:v1', json), historyJson());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Older ›' })).toBeEnabled();
  await openSettings(page);
  await page.getByRole('button', { name: 'Erase all data' }).tap();
  await page.getByRole('button', { name: 'Erase everything' }).tap();
  const confirm = page.getByRole('button', { name: 'Erase everything' });
  await expect(confirm).toBeDisabled();
  await page.getByRole('textbox').fill('erase');
  await expect(confirm).toBeEnabled();
  await confirm.tap();

  await expect(face(page).getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(heading(page)).toHaveText('Sunday, October 25');
  await expect(page.getByRole('button', { name: 'Older ›' })).toBeDisabled();
  // Only the fresh, empty notebook is written back.
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage))).toEqual(['flipside:v1']);
});

test('31 days on, today shows the backup reminder; Back up opens Your data', async ({ page }) => {
  await open(page, { at: '2026-11-25T12:00:00-05:00' });
  const note = page.getByText("It's been a while since your last backup");
  await expect(note).toBeVisible();
  await page.getByRole('button', { name: 'Back up' }).tap();
  await expect(dialog(page, 'Settings')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your data' })).toBeFocused();
  await expect(page.getByText(/No backup for \d+ days/)).toBeVisible();
});

test('the reminder stays quiet after a recent backup', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'flipside:settings:v1',
      JSON.stringify({
        version: 1,
        theme: 'system',
        autoFlip: true,
        lastBackupAt: '2026-11-20T12:00:00.000Z',
      }),
    );
  });
  await open(page, { at: '2026-11-25T12:00:00-05:00' });
  await page.waitForTimeout(500);
  await expect(page.getByText("It's been a while since your last backup")).toHaveCount(0);
});
