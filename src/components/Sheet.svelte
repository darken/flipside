<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { reducedMotion } from '$lib/ui/motion';

  type Props = {
    title: string;
    /** `graph` is graph paper (Stats); `lined` is a lined index card (Settings). */
    variant?: 'graph' | 'lined';
    onclose: () => void;
    /** The scrolling body, for callers that scroll to a section. */
    scroller?: HTMLElement | undefined;
    children: Snippet;
  };
  let { title, variant = 'graph', onclose, scroller = $bindable(), children }: Props = $props();

  const id = $props.id();

  let sheet: HTMLElement | undefined = $state();
  let heading: HTMLElement | undefined = $state();

  onMount(() => heading?.focus({ preventScroll: true }));

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onclose();
    }
  }

  // ---- Swipe down to close ------------------------------------------------------------------

  const CLOSE_DISTANCE = 120;
  const CLOSE_FLING = 0.5; // px/ms

  onMount(() => {
    const el = sheet;
    if (!el) return;
    let start: { x: number; y: number; t: number; atTop: boolean } | null = null;
    let owning = false;
    let dy = 0;

    const reset = () => {
      el.style.transition = 'transform 200ms ease-out';
      el.style.transform = '';
      setTimeout(() => (el.style.transition = ''), 220);
    };

    const touchstart = (e: TouchEvent) => {
      const t = e.touches[0];
      start =
        e.touches.length === 1 && t
          ? { x: t.clientX, y: t.clientY, t: Date.now(), atTop: (scroller?.scrollTop ?? 0) <= 0 }
          : null;
      owning = false;
      dy = 0;
    };
    const touchmove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t) return;
      const mx = t.clientX - start.x;
      dy = t.clientY - start.y;
      if (!owning) {
        if (Math.abs(mx) < 10 && Math.abs(dy) < 10) return;
        // Only a clearly downward pull from the top of the sheet; anything else is left alone.
        if (!start.atTop || dy <= 0 || Math.abs(dy) < Math.abs(mx) * 1.5) {
          start = null;
          return;
        }
        owning = true;
      }
      if (reducedMotion()) return;
      e.preventDefault();
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const touchend = () => {
      if (!start) return;
      const fast = owning && dy / Math.max(1, Date.now() - start.t) > CLOSE_FLING;
      const commit = owning && (dy > CLOSE_DISTANCE || fast);
      start = null;
      if (commit) onclose();
      else if (owning) reset();
      owning = false;
    };

    el.addEventListener('touchstart', touchstart, { passive: true });
    el.addEventListener('touchmove', touchmove, { passive: false });
    el.addEventListener('touchend', touchend);
    el.addEventListener('touchcancel', touchend);
    return () => {
      el.removeEventListener('touchstart', touchstart);
      el.removeEventListener('touchmove', touchmove);
      el.removeEventListener('touchend', touchend);
      el.removeEventListener('touchcancel', touchend);
    };
  });
</script>

<svelte:window {onkeydown} />

<div
  class="sheet {variant}"
  bind:this={sheet}
  role="dialog"
  aria-modal="true"
  aria-labelledby="{id}-title"
>
  <header class="top">
    <h1 id="{id}-title" tabindex="-1" bind:this={heading}>{title}</h1>
    <button type="button" class="close" aria-label="Close {title.toLowerCase()}" onclick={onclose}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </header>

  <div class="scroll" bind:this={scroller}>
    {@render children()}
  </div>
</div>

<style>
  .sheet {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    background-color: var(--paper-cream);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lift);
    color: var(--ink);
  }
  /* Graph paper: a fine square grid */
  .graph {
    background-image:
      linear-gradient(to right, var(--viz-grid) 1px, transparent 1px),
      linear-gradient(to bottom, var(--viz-grid) 1px, transparent 1px);
    background-size: 16px 16px;
  }
  /* Index card: ruled lines and a red top rule */
  .lined {
    background-image:
      linear-gradient(to bottom, var(--margin-line) 0 2px, transparent 2px),
      repeating-linear-gradient(
        to bottom,
        transparent 0,
        transparent calc(var(--line-height) - 1px),
        var(--ruled-line) calc(var(--line-height) - 1px),
        var(--ruled-line) var(--line-height)
      );
    background-position:
      0 calc(var(--tap-target) + var(--space-3)),
      0 0;
    background-repeat: no-repeat, repeat;
  }

  .top {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-3) var(--space-1) var(--space-4);
  }
  h1 {
    font-family: var(--font-hand);
    font-size: 2rem;
    line-height: 1.2;
  }
  h1:focus-visible {
    outline-offset: 2px;
  }
  .close {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .close svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .close:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
    padding: var(--space-1) var(--space-3) var(--space-6);
  }
</style>
