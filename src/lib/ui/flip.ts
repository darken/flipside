export type Side = 'todo' | 'done';

export const FLIP_MS = 600;
export const FLIP_EASING = [0.2, 0.7, 0.2, 1] as const;
export const CROSSFADE_MS = 150;
/** Movement before a gesture is locked as horizontal or vertical. */
export const LOCK_PX = 10;
/** A swipe faster than this finishes the flip even if it is short. */
export const FLING_PX_PER_MS = 0.5;
/** Swipes starting this close to a screen edge are left to the browser's back gesture. */
export const EDGE_PX = 20;
/** Pause after the last task is checked off before the page turns over. */
export const AUTO_FLIP_DELAY_MS = 400;
/** Phase 7 turns this into a setting ("Auto-flip when done"). */
export const AUTO_FLIP_ENABLED = true;

export const MAX_TILT_DEG = 4;
export const MIN_SCALE = 0.96;
export const MAX_SHADE = 0.4;

/** Card angle at rest: the front (to do) is 0°, the back (done) is 180°. */
export function restAngle(side: Side): number {
  return side === 'todo' ? 0 : 180;
}

export function lockDirection(
  dx: number,
  dy: number,
  threshold: number = LOCK_PX,
): 'horizontal' | 'vertical' | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
}

/** How far the card has turned for a horizontal drag of `dx` across `width` pixels. */
export function angleFor(dx: number, width: number): number {
  if (width <= 0) return 0;
  return Math.max(-180, Math.min(180, (dx / width) * 180));
}

/** 0 at rest, 1 when the card is edge-on (90°). Drives scale, tilt, shade and shadow. */
export function depth(angle: number): number {
  const d = Math.abs(Math.sin((angle * Math.PI) / 180));
  return d < 1e-9 ? 0 : d;
}

export function transformFor(angle: number): string {
  const d = depth(angle);
  const tilt = (MAX_TILT_DEG * d).toFixed(3);
  const scale = (1 - (1 - MIN_SCALE) * d).toFixed(4);
  return `rotateY(${angle.toFixed(3)}deg) rotateX(${tilt}deg) scale(${scale})`;
}

/**
 * Finishes the flip when the card is past the halfway point, or when the swipe was a fast flick
 * in the same direction as the drag. Otherwise it springs back.
 */
export function shouldFinish(angle: number, velocityPxPerMs: number): boolean {
  if (Math.abs(angle) > 90) return true;
  return (
    Math.abs(velocityPxPerMs) > FLING_PX_PER_MS &&
    Math.sign(velocityPxPerMs) === Math.sign(angle) &&
    angle !== 0
  );
}

export function startsInEdgeZone(x: number, viewportWidth: number): boolean {
  return x < EDGE_PX || x > viewportWidth - EDGE_PX;
}

/**
 * The resting angle for `side` that is closest to `current`. When two are equally close the one
 * in direction `prefer` wins (-1 turns the page right to left, like the button does).
 */
export function nearestRest(current: number, side: Side, prefer: -1 | 1 = -1): number {
  const base = restAngle(side);
  const k = Math.round((current - base) / 360);
  const candidates = [base + 360 * (k - 1), base + 360 * k, base + 360 * (k + 1)];
  let best = candidates[0]!;
  for (const c of candidates) {
    const closer = Math.abs(c - current) < Math.abs(best - current) - 1e-9;
    const tie = Math.abs(Math.abs(c - current) - Math.abs(best - current)) <= 1e-9;
    if (closer || (tie && Math.sign(c - current) === prefer)) best = c;
  }
  return best;
}

/** Folds any angle back into [0, 360). */
export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** A partial flip takes proportionally less time, but never feels abrupt. */
export function durationFor(from: number, to: number): number {
  const share = Math.min(1, Math.abs(to - from) / 180);
  return Math.round(Math.max(220, FLIP_MS * share));
}

/** A CSS cubic-bezier(x1, y1, x2, y2) easing as a function of time. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const sample = (a: number, b: number, t: number) =>
    3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 40; i++) {
      t = (lo + hi) / 2;
      if (sample(x1, x2, t) < x) lo = t;
      else hi = t;
    }
    return sample(y1, y2, t);
  };
}

export const flipEase = cubicBezier(...FLIP_EASING);

/** Angles along the eased path from `from` to `to`, as keyframe offsets for the Web Animations API. */
export function sampleFlip(
  from: number,
  to: number,
  steps = 24,
): { offset: number; angle: number }[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const offset = i / steps;
    return { offset, angle: from + (to - from) * flipEase(offset) };
  });
}

export type AutoFlipContext = {
  /** What emptied the list: only checking tasks off turns the page. */
  cause: 'check' | 'delete' | 'copy' | 'other';
  /** Today's page (past pages are read-only). */
  editable: boolean;
  side: Side;
  /** A drag, edit or menu is open. */
  busy: boolean;
  /** The page has already turned by itself once. */
  alreadyFlipped: boolean;
  enabled?: boolean;
};

/** True when finishing the last open task should turn the page over to the done list. */
export function shouldAutoFlip(before: number, after: number, context: AutoFlipContext): boolean {
  return (
    (context.enabled ?? AUTO_FLIP_ENABLED) &&
    context.cause === 'check' &&
    before === 1 &&
    after === 0 &&
    context.editable &&
    context.side === 'todo' &&
    !context.busy &&
    !context.alreadyFlipped
  );
}
