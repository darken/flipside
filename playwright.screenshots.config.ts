import { defineConfig } from '@playwright/test';

// `pnpm screenshots`: captures the install and README images into public/screenshots.
export default defineConfig({
  testDir: './tests/screenshots',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
