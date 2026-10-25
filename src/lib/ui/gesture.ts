/** Movement before a gesture is locked as horizontal or vertical. */
export const LOCK_PX = 10;

/**
 * Which way a gesture is going, once it has moved far enough to tell. A perfect diagonal counts
 * as vertical, so scrolling wins.
 */
export function lockDirection(
  dx: number,
  dy: number,
  threshold: number = LOCK_PX,
): 'horizontal' | 'vertical' | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
}

export type GestureOwner = 'flip' | 'peel';

/**
 * Only one gesture at a time may move the page: a swipe either flips it (horizontal) or peels it
 * (vertical), never both. Whoever locks first holds it until they let go.
 */
export class GestureArbiter {
  owner: GestureOwner | null = null;

  /** True if `who` now holds (or already held) the gesture. */
  claim(who: GestureOwner): boolean {
    if (this.owner !== null && this.owner !== who) return false;
    this.owner = who;
    return true;
  }

  release(who: GestureOwner): void {
    if (this.owner === who) this.owner = null;
  }
}

export const gestures = new GestureArbiter();

export type Sample = { y: number; t: number };

/** Speed along y in px/ms over the recent samples (negative is upwards). */
export function velocityY(samples: Sample[]): number {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last || last.t === first.t) return 0;
  return (last.y - first.y) / (last.t - first.t);
}
