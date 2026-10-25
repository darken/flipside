import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadApp } from './reload';
import { SHEET_FADE_MS, SHEET_MS, slideUp } from './sheet';

afterEach(() => vi.unstubAllGlobals());

const reduce = (on: boolean) => vi.stubGlobal('matchMedia', () => ({ matches: on }));
const node = (animates: boolean) =>
  ({ ...(animates && { animate: () => {} }) }) as unknown as Element;

describe('slideUp', () => {
  it('slides up from below over about 350 ms', () => {
    reduce(false);
    const t = slideUp(node(true));
    expect(t.duration).toBe(SHEET_MS);
    expect(t.css(0, 1)).toBe('transform: translateY(100%)');
    expect(t.css(1, 0)).toBe('transform: translateY(0%)');
  });

  it('crossfades for 150 ms with reduced motion', () => {
    reduce(true);
    const t = slideUp(node(true));
    expect(t.duration).toBe(SHEET_FADE_MS);
    expect(t.css(0.5, 0.5)).toBe('opacity: 0.5');
  });

  it('does not animate where there is no Web Animations API', () => {
    reduce(false);
    expect(slideUp(node(false)).duration).toBe(0);
  });
});

describe('reloadApp', () => {
  it('reloads the page', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    reloadApp();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
