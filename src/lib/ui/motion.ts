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
    duration: motion(options.direction === 'out' ? 320 : 200),
    css: (t: number) => `opacity: ${t}`,
  };
}
