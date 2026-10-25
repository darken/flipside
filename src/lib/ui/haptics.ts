import { reducedMotion } from './motion';

/** One strength for every tap: checking off, picking up a task, a flip or a peel finishing. */
export const HAPTIC_MS = 10;

/** A short vibration where the browser has one (Android Chrome); a no-op elsewhere. */
export function haptic(): void {
  if (reducedMotion()) return;
  try {
    navigator.vibrate?.(HAPTIC_MS);
  } catch {
    // Blocked or unsupported: nothing to do.
  }
}
