import { daysBetween } from '$lib/model/dates';
import type { DateKey } from '$lib/model/types';
import { cubicBezier } from './flip';

/** The page only starts to follow the finger after this much pulling past the end of the list. */
export const DEAD_ZONE_PX = 24;
/** The peel completes once this share of the page has been pulled away… */
export const COMMIT_PROGRESS = 0.35;
/** …or when the pull is faster than this (px/ms). */
export const FLING_PX_PER_MS = 0.5;
export const PEEL_MS = 450;
/** How far the leaving page tilts back from the binding at full peel. */
export const PEEL_TILT_DEG = 12;
export const UNDER_SCALE = 0.96;
export const UNDER_DIM = 0.25;
export const CROSSFADE_MS = 150;
/** Today button: pages shown while hurrying back, and the time each one takes. */
export const MAX_VISIBLE_STEPS = 5;
export const STEP_MS = 100;
/** Mouse wheel / trackpad: extra scrolling at the end of a list that turns one page. */
export const WHEEL_THRESHOLD_PX = 120;
/** The list must have stopped scrolling this long before wheel input counts. */
export const WHEEL_PAUSE_MS = 200;
export const WHEEL_COOLDOWN_MS = 600;
/** Rubber-band resistance at the ends of the stack. */
export const RESIST_MAX_PX = 56;

export type PeelDirection = 'older' | 'newer';

/** Pulling up turns to the older page (like scrolling down a list); pulling down to the newer. */
export const peelEase = cubicBezier(0.2, 0.7, 0.2, 1);

/** How far past the dead zone a pull has gone. */
export function pullPastDeadZone(pull: number): number {
  return Math.max(0, pull - DEAD_ZONE_PX);
}

/** 0 to 1: the share of the page that has been peeled away. */
export function peelProgress(pull: number, pageHeight: number): number {
  if (pageHeight <= 0) return 0;
  return Math.min(1, pullPastDeadZone(pull) / pageHeight);
}

/** Finish the peel when it is far enough along, or the pull was a fast flick. */
export function shouldCommitPeel(progress: number, velocityPxPerMs: number): boolean {
  if (progress > COMMIT_PROGRESS) return true;
  return progress > 0 && velocityPxPerMs > FLING_PX_PER_MS;
}

/** Which scroll edges the visible list was at when the finger touched down. */
export type Edges = { atTop: boolean; atBottom: boolean };

/**
 * Which peel a vertical drag can start, or null. This is the momentum guard: it only looks at the
 * edges at the moment of touch-down, so a list that merely arrives at its end during the same
 * touch (or by momentum) never turns into a peel; that needs a new touch.
 */
export function peelDirection(dy: number, edgesAtTouchStart: Edges): PeelDirection | null {
  if (dy < 0 && edgesAtTouchStart.atBottom) return 'older';
  if (dy > 0 && edgesAtTouchStart.atTop) return 'newer';
  return null;
}

/** Reads the scroll edges of a list (a list that fits on one screen is at both). */
export function edgesOf(scrollTop: number, clientHeight: number, scrollHeight: number): Edges {
  return {
    atTop: scrollTop <= 1,
    atBottom: scrollTop + clientHeight >= scrollHeight - 1,
  };
}

/** Diminishing movement for a pull at the end of the stack: it stretches, then stops. */
export function resist(distance: number, max: number = RESIST_MAX_PX): number {
  if (distance <= 0) return 0;
  return max * (1 - Math.exp(-distance / (max * 2.5)));
}

/** Saved days in `dayKeys` (newest first): the pages just newer and older than `key`. */
export function neighbours(
  dayKeys: readonly DateKey[],
  key: DateKey,
): { older: DateKey | null; newer: DateKey | null } {
  const i = dayKeys.indexOf(key);
  if (i < 0) return { older: null, newer: null };
  return { newer: dayKeys[i - 1] ?? null, older: dayKeys[i + 1] ?? null };
}

/** How many calendar days have no page between two saved pages. */
export function skippedBetween(newerKey: DateKey, olderKey: DateKey): number {
  return Math.max(0, daysBetween(olderKey, newerKey) - 1);
}

/** The note shown above a page that has a gap before the page newer than it. */
export function skippedLabel(count: number): string {
  return count === 1 ? '1 day skipped' : `${count} days skipped`;
}

export type TopPose = { transform: string; shadow: number };
export type UnderPose = { transform: string; dim: number };

/** The page being peeled away: `p` is 0 on screen and 1 when it has gone up and off. */
export function topPose(p: number): TopPose {
  const c = Math.min(1, Math.max(0, p));
  return {
    transform:
      c === 0
        ? 'none'
        : `perspective(1600px) translateY(${(-c * 100).toFixed(3)}%) rotateX(${(PEEL_TILT_DEG * c).toFixed(3)}deg)`,
    shadow: Math.min(1, c * 3),
  };
}

/** The page being revealed: `e` is 0 while it is covered and 1 once it is fully uncovered. */
export function underPose(e: number): UnderPose {
  const c = Math.min(1, Math.max(0, e));
  const scale = UNDER_SCALE + (1 - UNDER_SCALE) * c;
  return {
    transform: c >= 1 ? 'none' : `scale(${scale.toFixed(4)})`,
    dim: UNDER_DIM * (1 - c),
  };
}

/** Progress values along the eased path, for building keyframes. */
export function samplePeel(from: number, to: number, steps = 20): { offset: number; p: number }[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const offset = i / steps;
    return { offset, p: from + (to - from) * peelEase(offset) };
  });
}

/** Partial peels take proportionally less time, but never feel abrupt. */
export function peelDuration(from: number, to: number, full: number = PEEL_MS): number {
  return Math.round(Math.max(160, full * Math.min(1, Math.abs(to - from))));
}

export type WheelState = { acc: number; lastScrollAt: number; lockedUntil: number };

/**
 * Trackpad and wheel input at the end of a list. Returns the new state and whether this event
 * turns a page. Wheel input only counts after the list has been still for a short pause, and
 * one page turns per burst.
 */
export function wheelStep(
  state: WheelState,
  event: { deltaY: number; atEdge: boolean; now: number },
): { state: WheelState; turn: boolean } {
  const { deltaY, atEdge, now } = event;
  if (!atEdge || now < state.lockedUntil) return { state: { ...state, acc: 0 }, turn: false };
  if (now - state.lastScrollAt < WHEEL_PAUSE_MS) {
    return { state: { ...state, acc: 0 }, turn: false };
  }
  const acc = state.acc + deltaY;
  if (Math.abs(acc) >= WHEEL_THRESHOLD_PX) {
    return { state: { ...state, acc: 0, lockedUntil: now + WHEEL_COOLDOWN_MS }, turn: true };
  }
  return { state: { ...state, acc }, turn: false };
}
