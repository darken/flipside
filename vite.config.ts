import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Fixed zone with daylight saving, so date tests are the same on every machine.
if (process.env.VITEST) process.env.TZ = 'America/New_York';

const alias = {
  $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
  $components: fileURLToPath(new URL('./src/components', import.meta.url)),
};

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** The headers vercel.json sends on every page, so `pnpm preview` (e2e, Lighthouse) runs under the real CSP. */
const siteHeaders = Object.fromEntries(
  (
    JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    }
  ).headers
    .filter((rule) => rule.source === '/(.*)')
    .flatMap((rule) => rule.headers.map((h) => [h.key, h.value] as const)),
);

const SCREENSHOT_LABELS: Record<string, string> = {
  today: 'Today’s page: a ruled notepad with your to-do list',
  done: 'Flip the page to see what you finished',
  peel: 'Peel the page up to read yesterday',
  stats: 'Streaks, daily bars and a year of days',
};

/** Preloads the heading font, whose hashed file name is only known after the build. */
function preloadHeadingFont(): Plugin {
  return {
    name: 'flipside:preload-heading-font',
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const file = Object.keys(context.bundle ?? {}).find((name) =>
          /caveat-latin-700-normal.*\.woff2$/.test(name),
        );
        if (!file) return [];
        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
              href: `/${file}`,
            },
            injectTo: 'head',
          },
        ];
      },
    },
  };
}

export default defineConfig({
  resolve: { alias },
  define: {
    // FLIPSIDE_VERSION lets the update test build a second, different version.
    __APP_VERSION__: JSON.stringify(process.env.FLIPSIDE_VERSION ?? pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  preview: { headers: siteHeaders },
  plugins: [
    svelte(),
    svelteTesting(),
    preloadHeadingFont(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon-180x180.png', 'favicon.ico', 'icon.svg'],
      manifest: {
        name: 'Flipside',
        short_name: 'Flipside',
        description: 'A daily todo notepad: flip the page to see what you finished.',
        display: 'standalone',
        orientation: 'portrait',
        id: '/',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'lifestyle'],
        theme_color: '#f6efdc',
        background_color: '#f6efdc',
        // Shown by the install prompt on Android and desktop Chrome. Made by `pnpm screenshots`.
        screenshots: [
          ...['today', 'done', 'peel', 'stats'].map((name) => ({
            src: `screenshots/narrow-${name}.jpg`,
            sizes: '780x1688',
            type: 'image/jpeg',
            form_factor: 'narrow' as const,
            label: SCREENSHOT_LABELS[name]!,
          })),
          {
            src: 'screenshots/narrow-today-dark.jpg',
            sizes: '780x1688',
            type: 'image/jpeg',
            form_factor: 'narrow' as const,
            label: 'Dark mode',
          },
          {
            src: 'screenshots/wide-today.jpg',
            sizes: '1280x800',
            type: 'image/jpeg',
            form_factor: 'wide' as const,
            label: 'Today on a bigger screen',
          },
        ],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // Install-prompt pictures are only fetched by the browser at install time.
        globIgnores: ['screenshots/**'],
        navigateFallback: 'index.html',
        // The first visit is covered at once (so "Reload" in Settings works without a reload first).
        // Later versions still wait in the background until the person asks for them.
        clientsClaim: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts', 'src/lib/model/types.ts'],
      thresholds: { statements: 90, lines: 90, functions: 90, branches: 85 },
    },
  },
});
