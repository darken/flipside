import { untrack } from 'svelte';

/**
 * Tracks interactions that must not be interrupted by a page flip: dragging a task, editing text,
 * an open task menu. Each one holds the lock until it releases it.
 */
export class Busy {
  count = $state(0);

  get active(): boolean {
    return this.count > 0;
  }

  /** Takes the lock. Call the returned function to give it back (safe to call twice). */
  hold(): () => void {
    // Untracked: components take the lock inside effects, which must not depend on the count.
    untrack(() => this.count++);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      untrack(() => this.count--);
    };
  }

  reset(): void {
    this.count = 0;
  }
}

export const busy = new Busy();
