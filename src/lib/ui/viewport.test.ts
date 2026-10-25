import { describe, expect, it, vi } from 'vitest';
import { visibleHeightAboveKeyboard, watchKeyboard } from './viewport';

describe('visibleHeightAboveKeyboard', () => {
  it('is null without a keyboard (small differences are browser bars)', () => {
    expect(visibleHeightAboveKeyboard(800, 800)).toBeNull();
    expect(visibleHeightAboveKeyboard(800, 720)).toBeNull();
  });

  it('is the visible height when a keyboard is up', () => {
    expect(visibleHeightAboveKeyboard(800, 480.4)).toBe(480);
  });
});

function fakeHost(innerHeight = 800) {
  const listeners = new Map<string, () => void>();
  const props = new Map<string, string>();
  const visualViewport = {
    height: 800,
    addEventListener: (type: string, fn: () => void) => void listeners.set(type, fn),
    removeEventListener: (type: string) => void listeners.delete(type),
  };
  const host = {
    innerHeight,
    visualViewport,
    scrollTo: vi.fn(),
    document: {
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => void props.set(k, v),
          removeProperty: (k: string) => void props.delete(k),
        },
      },
      activeElement: null as Element | null,
    },
  };
  return { host, visualViewport, listeners, props };
}

describe('watchKeyboard', () => {
  it('sizes the page to the visible area while a keyboard is up, and undoes the pan', () => {
    const { host, visualViewport, listeners, props } = fakeHost();
    watchKeyboard(host as never);
    visualViewport.height = 450;
    listeners.get('resize')!();
    expect(props.get('--page-height')).toBe('calc(450px - env(safe-area-inset-top))');
    expect(host.scrollTo).toHaveBeenCalledWith(0, 0);
    visualViewport.height = 800;
    listeners.get('resize')!();
    expect(props.has('--page-height')).toBe(false);
  });

  it('scrolls a focused field into view', () => {
    const { host, visualViewport, listeners } = fakeHost();
    const field = document.createElement('textarea');
    field.scrollIntoView = vi.fn();
    host.document.activeElement = field;
    watchKeyboard(host as never);
    visualViewport.height = 450;
    listeners.get('resize')!();
    expect(field.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('cleans up, and copes with no visual viewport', () => {
    const { host, listeners, props } = fakeHost();
    const stop = watchKeyboard(host as never);
    props.set('--page-height', 'x');
    stop();
    expect(listeners.size).toBe(0);
    expect(props.has('--page-height')).toBe(false);
    expect(() => watchKeyboard({ ...host, visualViewport: null } as never)()).not.toThrow();
  });
});
