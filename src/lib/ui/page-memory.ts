import type { Side } from './flip';

/**
 * What a page remembers while it is not on screen: only three pages are rendered at a time, so
 * the stack keeps this for the rest. In memory only; a reload opens every page on its front.
 */
export type PageMemory = {
  side: Side;
  autoFlipped: boolean;
  scroll: Record<Side, number>;
};

export function newPageMemory(): PageMemory {
  return { side: 'todo', autoFlipped: false, scroll: { todo: 0, done: 0 } };
}

/** What the notepad stack gives each page for moving around. */
export type PageNav = {
  hasNewer: boolean;
  hasOlder: boolean;
  onNewer: () => void;
  onOlder: () => void;
  onToday: () => void;
};
