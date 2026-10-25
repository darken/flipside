import type SettingsSheet from '$components/SettingsSheet.svelte';
import type StatsView from '$components/StatsView.svelte';

/**
 * The Stats and Settings sheets are separate chunks: fetched when first opened, and in the
 * background once the app is idle (so they open at once, and are cached for offline use).
 */
class SheetModules {
  stats = $state.raw<typeof StatsView>();
  settings = $state.raw<typeof SettingsSheet>();

  async load(name: 'stats' | 'settings'): Promise<void> {
    if (name === 'stats') this.stats ??= (await import('$components/StatsView.svelte')).default;
    else this.settings ??= (await import('$components/SettingsSheet.svelte')).default;
  }

  loadAll(): Promise<unknown> {
    return Promise.all([this.load('stats'), this.load('settings')]);
  }
}

export const sheetModules = new SheetModules();
