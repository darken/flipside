import { beforeEach, describe, expect, it } from 'vitest';
import { GestureArbiter, lockDirection, velocityY } from './gesture';

describe('lockDirection', () => {
  it('waits until the finger has moved about 10 px', () => {
    expect(lockDirection(0, 0)).toBeNull();
    expect(lockDirection(9, -9)).toBeNull();
  });

  it('locks to the dominant axis', () => {
    expect(lockDirection(12, 3)).toBe('horizontal');
    expect(lockDirection(-12, 3)).toBe('horizontal');
    expect(lockDirection(3, 12)).toBe('vertical');
    expect(lockDirection(-3, -40)).toBe('vertical');
  });

  it('treats a perfect diagonal as vertical, so scrolling wins', () => {
    expect(lockDirection(15, 15)).toBe('vertical');
  });

  it('accepts a custom threshold', () => {
    expect(lockDirection(5, 0, 4)).toBe('horizontal');
  });
});

describe('GestureArbiter', () => {
  let arbiter: GestureArbiter;
  beforeEach(() => (arbiter = new GestureArbiter()));

  it('lets the first gesture claim, and refuses the other until it lets go', () => {
    expect(arbiter.claim('flip')).toBe(true);
    expect(arbiter.claim('peel')).toBe(false);
    expect(arbiter.claim('flip')).toBe(true);
    arbiter.release('flip');
    expect(arbiter.claim('peel')).toBe(true);
    expect(arbiter.claim('flip')).toBe(false);
  });

  it('ignores a release from someone who does not hold it', () => {
    arbiter.claim('peel');
    arbiter.release('flip');
    expect(arbiter.owner).toBe('peel');
    arbiter.release('peel');
    expect(arbiter.owner).toBeNull();
  });
});

describe('velocityY', () => {
  it('is distance over time, negative going up', () => {
    expect(
      velocityY([
        { y: 500, t: 0 },
        { y: 450, t: 50 },
        { y: 400, t: 100 },
      ]),
    ).toBe(-1);
  });

  it('is zero without enough samples or time', () => {
    expect(velocityY([])).toBe(0);
    expect(velocityY([{ y: 1, t: 5 }])).toBe(0);
    expect(
      velocityY([
        { y: 1, t: 5 },
        { y: 9, t: 5 },
      ]),
    ).toBe(0);
  });
});
