import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../../../tests/memory-storage';
import { SETTINGS_KEY, SettingsStore } from './settings.svelte';
import { applyTheme, THEME_COLORS } from './theme';
import { defaultSettings, parseSettings, portable } from './types';

describe('parseSettings', () => {
  it('accepts valid settings, with the device-only stamps', () => {
    const raw = {
      version: 1,
      theme: 'dark',
      autoFlip: false,
      lastBackupAt: '2026-10-01T10:00:00.000Z',
      backupNudgeShownAt: '2026-10-02T10:00:00.000Z',
    };
    expect(parseSettings(raw)).toEqual(raw);
  });

  it('falls back to defaults field by field and ignores unknown fields', () => {
    expect(
      parseSettings({ version: 1, theme: 'purple', autoFlip: 'yes', lastBackupAt: 'soon', x: 1 }),
    ).toEqual(defaultSettings());
    expect(parseSettings({ version: 1, theme: 'light' })).toEqual({
      ...defaultSettings(),
      theme: 'light',
    });
  });

  it('rejects things that are not settings', () => {
    for (const raw of [null, 3, 'x', [], { theme: 'dark' }, { version: 2 }]) {
      expect(parseSettings(raw)).toBeNull();
    }
  });

  it('keeps the device-only stamps out of the portable part', () => {
    const s = { ...defaultSettings(), lastBackupAt: '2026-10-01T10:00:00.000Z' };
    expect(portable(s)).toEqual({ version: 1, theme: 'system', autoFlip: true });
  });
});

describe('SettingsStore', () => {
  let storage: MemoryStorage;
  let store: SettingsStore;
  let stop: () => void;

  beforeEach(() => {
    storage = new MemoryStorage();
    store = new SettingsStore();
    stop = store.init(storage);
  });
  afterEach(() => stop());

  it('loads the defaults when nothing is saved', () => {
    expect(store.value).toEqual(defaultSettings());
    expect(store.theme).toBe('system');
    expect(store.autoFlip).toBe(true);
  });

  it('saves straight away under its own key', () => {
    store.update({ theme: 'dark', autoFlip: false });
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({
      version: 1,
      theme: 'dark',
      autoFlip: false,
    });
    expect(storage.getItem('flipside:v1')).toBeNull();
  });

  it('loads what was saved, and ignores invalid or broken values', () => {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: 'light', autoFlip: 3 }));
    store.load();
    expect(store.value).toEqual({ ...defaultSettings(), theme: 'light' });
    storage.setItem(SETTINGS_KEY, '{nope');
    store.load();
    expect(store.value).toEqual(defaultSettings());
  });

  it('ignores invalid values in an update and keeps the old ones', () => {
    store.update({ theme: 'dark' });
    store.update({ theme: 'neon' as never, autoFlip: 'no' as never, lastBackupAt: 'x' });
    expect(store.value).toEqual({ ...defaultSettings(), theme: 'dark' });
  });

  it('sets and clears the backup stamps', () => {
    store.update({ lastBackupAt: '2026-10-01T10:00:00.000Z' });
    expect(store.lastBackupAt).toBe('2026-10-01T10:00:00.000Z');
    store.update({ lastBackupAt: undefined });
    expect(store.lastBackupAt).toBeUndefined();
    store.update({ backupNudgeShownAt: '2026-10-01T10:00:00.000Z' });
    expect(store.backupNudgeShownAt).toBe('2026-10-01T10:00:00.000Z');
  });

  it('keeps working when storage throws', () => {
    const broken = new MemoryStorage();
    broken.setItem = () => {
      throw new Error('full');
    };
    broken.getItem = () => {
      throw new Error('blocked');
    };
    const other = new SettingsStore();
    const dispose = other.init(broken);
    other.update({ theme: 'dark' });
    expect(other.theme).toBe('dark');
    dispose();
  });

  it('works without any storage', () => {
    const none = new SettingsStore();
    const dispose = none.init(null);
    none.update({ autoFlip: false });
    expect(none.autoFlip).toBe(false);
    dispose();
  });

  it('picks up a change made in another tab', () => {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: 'dark', autoFlip: true }));
    window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY }));
    expect(store.theme).toBe('dark');
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: 'light', autoFlip: true }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'flipside:v1' }));
    expect(store.theme).toBe('dark'); // another key: ignored
  });

  it('resets to the defaults in memory', () => {
    store.update({ theme: 'dark' });
    store.reset();
    expect(store.theme).toBe('system');
  });
});

describe('applyTheme', () => {
  const root = document.documentElement;
  const metas = () => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];

  beforeEach(() => {
    document.head.innerHTML = `
      <meta name="theme-color" content="#f6efdc" media="(prefers-color-scheme: light)">
      <meta name="theme-color" content="#1c1b22" media="(prefers-color-scheme: dark)">`;
    root.removeAttribute('data-theme');
    root.classList.remove('theme-fade');
  });
  afterEach(() => {
    document.head.innerHTML = '';
    root.removeAttribute('data-theme');
    vi.useRealTimers();
  });

  it('sets data-theme for light and dark and points the theme colour at it', () => {
    applyTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(metas().map((m) => [m.content, m.hasAttribute('media')])).toEqual([
      [THEME_COLORS.dark, false],
      [THEME_COLORS.dark, false],
    ]);
    applyTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(metas().every((m) => m.content === THEME_COLORS.light)).toBe(true);
  });

  it('removes data-theme for system and puts the original tags back', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(metas().map((m) => [m.content, m.getAttribute('media')])).toEqual([
      ['#f6efdc', '(prefers-color-scheme: light)'],
      ['#1c1b22', '(prefers-color-scheme: dark)'],
    ]);
  });

  it('crossfades only when asked, only on a real change, and not with reduced motion', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    applyTheme('dark');
    expect(root.classList.contains('theme-fade')).toBe(false);
    applyTheme('light', { animate: true });
    expect(root.classList.contains('theme-fade')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(root.classList.contains('theme-fade')).toBe(false);
    applyTheme('light', { animate: true }); // no change
    expect(root.classList.contains('theme-fade')).toBe(false);

    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    applyTheme('dark', { animate: true });
    expect(root.classList.contains('theme-fade')).toBe(false);
  });
});
