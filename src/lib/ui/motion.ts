/**
 * Every duration and easing the interface uses. `tokens.css` has the same values as custom
 * properties (`--dur-*`, `--ease-*`); motion.test.ts keeps the two in step.
 */
export const MOTION = {
  /** Small state changes: a pressed button, a menu rising, a toast popping in. */
  fast: 150,
  /** Colour fades and tiny slides. */
  base: 200,
  /** A sheet sliding over the notepad. */
  sheet: 350,
  /** A page peeling away. */
  peel: 450,
  /** A page flipping over. */
  flip: 600,
} as const;

/** The curve for page-sized movement (flip, peel, bars growing). */
export const EASE_PAGE = [0.2, 0.7, 0.2, 1] as const;

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A duration in ms, or 0 when the user asked for reduced motion. */
export function motion(ms: number): number {
  return reducedMotion() ? 0 : ms;
}

export type LeaveKind = 'done' | 'removed';
let leaveKind: LeaveKind = 'removed';

/** Say why the next task is about to leave the list: checked off (strike-through) or removed. */
export function setLeaving(kind: LeaveKind): void {
  leaveKind = kind;
}

/** Fade for tasks entering and leaving the todo list; checked-off tasks get a strike-through. */
export function taskFade(
  node: HTMLElement,
  _params: unknown,
  options: { direction: 'in' | 'out' | 'both' },
) {
  if (options.direction === 'out' && leaveKind === 'done') node.classList.add('striking');
  if (options.direction === 'out') node.classList.add('leaving');
  return {
    duration: motion(options.direction === 'out' ? 320 : MOTION.base),
    css: (t: number) => `opacity: ${t}`,
  };
}
