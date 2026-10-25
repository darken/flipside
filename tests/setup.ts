import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { settings } from '$lib/settings/settings.svelte';
import { nudge } from '$lib/ui/nudge.svelte';
import { sheetModules } from '$lib/ui/sheet-modules.svelte';
import { sheets } from '$lib/ui/sheets.svelte';
import { MemoryStorage } from './memory-storage';

// The sheets are lazy chunks in the app; tests want them there from the first click.
beforeAll(() => sheetModules.loadAll());

// jsdom has no Web Animations API; Svelte's transitions look for it when elements leave.
Element.prototype.getAnimations ??= () => [];

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  // Reduced motion: transitions and animations run with zero duration, so tests need no timers.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  let n = 0;
  // Deterministic, UUID-shaped ids so tests can assert on them.
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(
    () =>
      `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`,
  );
});

afterEach(() => {
  cleanup();
  // Module-level UI state must not leak from one test into the next.
  sheets.open = null;
  sheets.section = null;
  nudge.dismiss();
  settings.reset();
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
