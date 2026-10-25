import { describe, expect, it } from 'vitest';
import { Busy } from './busy.svelte';

describe('Busy', () => {
  it('is active while anything holds it', () => {
    const busy = new Busy();
    expect(busy.active).toBe(false);
    const a = busy.hold();
    const b = busy.hold();
    expect(busy.active).toBe(true);
    a();
    expect(busy.active).toBe(true);
    b();
    expect(busy.active).toBe(false);
  });

  it('ignores a second release', () => {
    const busy = new Busy();
    const a = busy.hold();
    busy.hold();
    a();
    a();
    expect(busy.count).toBe(1);
  });

  it('can be reset', () => {
    const busy = new Busy();
    busy.hold();
    busy.reset();
    expect(busy.active).toBe(false);
  });
});
