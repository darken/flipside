import type { Theme } from './types';

/** Colours of `<meta name="theme-color">`, matching `--paper-edge` in each theme. */
export const THEME_COLORS = { light: '#f6efdc', dark: '#1c1b22' } as const;
export const FADE_MS = 200;

type ThemeHost = Pick<Document, 'documentElement' | 'querySelectorAll'>;

let fadeTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Sets `data-theme` on <html> (removed for "system") and points the browser's theme colour at the
 * result. `animate` crossfades the colours for a moment, unless motion is reduced.
 */
export function applyTheme(theme: Theme, { animate = false, doc = document as ThemeHost } = {}) {
  const root = doc.documentElement;
  const before = root.getAttribute('data-theme');
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (animate && !reduced && before !== (theme === 'system' ? null : theme)) {
    root.classList.add('theme-fade');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => root.classList.remove('theme-fade'), FADE_MS + 50);
  }

  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    // Remember how each tag was written, so "system" can put it back.
    meta.dataset.media ??= meta.getAttribute('media') ?? '';
    meta.dataset.content ??= meta.content;
    if (theme === 'system') {
      if (meta.dataset.media) meta.setAttribute('media', meta.dataset.media);
      meta.content = meta.dataset.content;
    } else {
      // Every tag gets the chosen colour and none is tied to the system setting.
      meta.removeAttribute('media');
      meta.content = THEME_COLORS[theme];
    }
  }
}
