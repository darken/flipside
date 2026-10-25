import { busy } from './busy.svelte';
import { gestures, lockDirection, velocityY, type Sample } from './gesture';
import {
  edgesOf,
  peelDirection,
  peelProgress,
  pullPastDeadZone,
  resist,
  shouldCommitPeel,
  wheelStep,
  type Edges,
  type PeelDirection,
  type WheelState,
} from './peel';

export type PeelHooks = {
  /** Everything is listened to here. */
  target: HTMLElement;
  /** The scrolling list of the face that is showing. */
  getScroller: () => HTMLElement | null;
  pageHeight: () => number;
  /** False while something else (an animation, a task drag, a menu) holds the page. */
  canStart: () => boolean;
  has: (direction: PeelDirection) => boolean;
  /** A peel has taken over from scrolling. */
  begin: (direction: PeelDirection) => void;
  /** The finger moved. `progress` is 0..1 when there is a page to reveal; `stretch` is the
   *  rubber-band distance in px at the ends of the stack. */
  move: (direction: PeelDirection, progress: number, stretch: number) => void;
  end: (direction: PeelDirection, commit: boolean, progress: number) => void;
  /** Wheel or trackpad at the end of a list: turn one page. */
  turn: (direction: PeelDirection) => void;
};

type Active = {
  source: 'touch' | 'pointer';
  id: number;
  x0: number;
  y0: number;
  edges: Edges;
  lock: 'peel' | 'rejected' | null;
  direction: PeelDirection | null;
  samples: Sample[];
  progress: number;
  release: (() => void) | null;
};

const TEXT_FIELDS = 'textarea, input:not([type="checkbox"])';
// A swipe may start on a text field (the new-task line is right at the end of the list), unless
// that field is being typed in. Handles belong to the task drag.
const TOUCH_BLOCKS = '[data-handle]';
const POINTER_BLOCKS = `${TOUCH_BLOCKS}, ${TEXT_FIELDS}, button, a, select, label`;

/**
 * Turns a vertical pull at the end of a list into a peel.
 *
 * A peel only starts when the list was already at its end when the finger touched down (the
 * momentum guard), after a short dead zone. Touch uses touch events, because the stage's
 * `touch-action: pan-y` makes the browser cancel pointer events once it takes over scrolling;
 * `touchmove` is non-passive so the pull can stop the browser's own overscroll.
 * Mouse and pen use Pointer Events. Returns a function that removes everything.
 */
export function attachPeelGestures(hooks: PeelHooks): () => void {
  const { target } = hooks;
  let g: Active | null = null;
  let wheel: WheelState = { acc: 0, lastScrollAt: 0, lockedUntil: 0 };

  const edgesNow = (): Edges | null => {
    const el = hooks.getScroller();
    return el ? edgesOf(el.scrollTop, el.clientHeight, el.scrollHeight) : null;
  };

  function start(
    source: Active['source'],
    id: number,
    x: number,
    y: number,
    el: Element,
    blocks: string,
  ) {
    if (g || !hooks.canStart() || gestures.owner !== null) return;
    if (el.closest(blocks)) return;
    const field = el.closest(TEXT_FIELDS);
    if (field && field === document.activeElement) return; // typing, not swiping
    const edges = edgesNow();
    if (!edges || (!edges.atTop && !edges.atBottom)) return; // mid-list: it is a scroll
    g = {
      source,
      id,
      x0: x,
      y0: y,
      edges,
      lock: null,
      direction: null,
      samples: [{ y, t: performance.now() }],
      progress: 0,
      release: null,
    };
  }

  /** Returns true once the peel owns the gesture (the caller then stops the browser scrolling). */
  function track(x: number, y: number): boolean {
    const a = g;
    if (!a || a.lock === 'rejected') return false;
    const dy = y - a.y0;
    if (a.lock === null) {
      const lock = lockDirection(x - a.x0, dy);
      if (lock === null) return false;
      const direction = lock === 'vertical' ? peelDirection(dy, a.edges) : null;
      if (!direction || !hooks.canStart() || !gestures.claim('peel')) {
        a.lock = 'rejected';
        return false;
      }
      a.lock = 'peel';
      a.direction = direction;
      const releaseBusy = busy.hold();
      a.release = () => {
        releaseBusy();
        gestures.release('peel');
      };
      hooks.begin(direction);
    }
    const direction = a.direction!;
    const pull = direction === 'older' ? -dy : dy;
    a.samples.push({ y, t: performance.now() });
    while (a.samples.length > 2 && a.samples[a.samples.length - 1]!.t - a.samples[0]!.t > 100) {
      a.samples.shift();
    }
    if (hooks.has(direction)) {
      a.progress = peelProgress(pull, hooks.pageHeight());
      hooks.move(direction, a.progress, 0);
    } else {
      hooks.move(direction, 0, resist(pullPastDeadZone(pull)));
    }
    return true;
  }

  function finish(cancelled: boolean) {
    const a = g;
    g = null;
    if (!a || a.lock !== 'peel' || !a.direction) return false;
    const speed = a.direction === 'older' ? -velocityY(a.samples) : velocityY(a.samples);
    const commit = !cancelled && hooks.has(a.direction) && shouldCommitPeel(a.progress, speed);
    a.release?.();
    hooks.end(a.direction, commit, a.progress);
    return true;
  }

  // ---- Touch -----------------------------------------------------------------------------

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (e.touches.length !== 1 || !t) return;
    start('touch', t.identifier, t.clientX, t.clientY, e.target as Element, TOUCH_BLOCKS);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!g || g.source !== 'touch') return;
    // TouchList is not reliably iterable (older WebKit), so walk it by index.
    let t: Touch | undefined;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i]!.identifier === g.id) t = e.touches[i];
    }
    if (!t) return;
    if (track(t.clientX, t.clientY) && e.cancelable) e.preventDefault();
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (g?.source === 'touch') finish(e.type === 'touchcancel');
  };

  // ---- Mouse and pen ------------------------------------------------------------------------

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0 || !e.isPrimary) return;
    start('pointer', e.pointerId, e.clientX, e.clientY, e.target as Element, POINTER_BLOCKS);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (g?.source !== 'pointer' || e.pointerId !== g.id) return;
    track(e.clientX, e.clientY);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (g?.source !== 'pointer' || e.pointerId !== g.id) return;
    const peeled = finish(e.type === 'pointercancel');
    if (peeled) {
      // The click that follows a drag must not press a button.
      const block = (c: Event) => c.stopPropagation();
      window.addEventListener('click', block, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', block, { capture: true }), 300);
    }
  };

  // ---- Wheel and trackpad -------------------------------------------------------------------

  const onScroll = () => (wheel = { ...wheel, lastScrollAt: performance.now() });
  const onWheel = (e: WheelEvent) => {
    if (!hooks.canStart() || gestures.owner !== null || e.ctrlKey) return;
    const edges = edgesNow();
    if (!edges) return;
    const direction: PeelDirection = e.deltaY > 0 ? 'older' : 'newer';
    const atEdge = direction === 'older' ? edges.atBottom : edges.atTop;
    const deltaY = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const result = wheelStep(wheel, { deltaY, atEdge, now: performance.now() });
    wheel = result.state;
    if (result.turn && hooks.has(direction)) hooks.turn(direction);
  };

  target.addEventListener('touchstart', onTouchStart, { passive: true });
  target.addEventListener('touchmove', onTouchMove, { passive: false });
  target.addEventListener('touchend', onTouchEnd);
  target.addEventListener('touchcancel', onTouchEnd);
  target.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  target.addEventListener('wheel', onWheel, { passive: true });
  target.addEventListener('scroll', onScroll, { capture: true, passive: true });

  return () => {
    finish(true);
    target.removeEventListener('touchstart', onTouchStart);
    target.removeEventListener('touchmove', onTouchMove);
    target.removeEventListener('touchend', onTouchEnd);
    target.removeEventListener('touchcancel', onTouchEnd);
    target.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    target.removeEventListener('wheel', onWheel);
    target.removeEventListener('scroll', onScroll, { capture: true });
  };
}
