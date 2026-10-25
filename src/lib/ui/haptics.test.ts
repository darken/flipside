import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTIC_MS, haptic } from './haptics';

describe('haptic', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'vibrate');
    vi.restoreAllMocks();
  });

  it('does nothing where vibration is missing', () => {
    expect(() => haptic()).not.toThrow();
  });

  it('vibrates briefly', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    haptic();
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_MS);
    vi.unstubAllGlobals();
  });

  it('stays still for reduced motion', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    haptic();
    expect(vibrate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('survives a vibrate that throws', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    Object.defineProperty(navigator, 'vibrate', {
      value: () => {
        throw new Error('blocked');
      },
      configurable: true,
    });
    expect(() => haptic()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
