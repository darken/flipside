import { expect, test } from '@playwright/test';
import { seedHistory } from './helpers.ts';

test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

test('the Content Security Policy is sent, and nothing the app does breaks it', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /content security policy|refused to/i.test(m.text())) {
      problems.push(m.text());
    }
  });
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`),
    ),
  );

  await page.clock.install({ time: new Date('2026-10-25T12:00:00-04:00') });
  await seedHistory(page);
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");

  // The theme script (inline) must have run: a saved dark theme is applied before the app starts.
  const field = page.getByRole('textbox', { name: 'New task' });
  await field.fill('Check the policy');
  await field.press('Control+Enter');
  await page.getByRole('button', { name: 'Show done list' }).click();
  await page.getByRole('button', { name: 'Show to-do list' }).click();
  await page.getByRole('button', { name: 'Stats' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Stats' })).toBeVisible();
  await page.getByRole('button', { name: 'Close stats' }).click();
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.getByRole('radio', { name: 'Dark' }).check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(problems).toEqual([]);
});
