<script lang="ts">
  import type { Snippet } from 'svelte';
  import { formatHeading, formatRelative } from '$lib/model/dates';
  import type { DateKey } from '$lib/model/types';
  import { app } from '$lib/store/app.svelte';
  import type { PageNav } from '$lib/ui/page-memory';
  import { skippedLabel } from '$lib/ui/peel';

  type Props = {
    key: DateKey;
    /** "To do" or "Done" */
    caption: string;
    readOnly: boolean;
    nav: PageNav;
    /** Days without a page between this page and the next newer one. */
    skipped: number;
    scrollTop: number;
    onScroll: (top: number) => void;
    children: Snippet;
  };
  let { key, caption, readOnly, nav, skipped, scrollTop, onScroll, children }: Props = $props();

  const relative = $derived(key === app.today ? '' : formatRelative(key, app.today));

  function restoreScroll(node: HTMLElement) {
    node.scrollTop = scrollTop;
  }
</script>

<div class="paper page" class:past={readOnly}>
  <header class="bar ruled">
    <div class="line">
      <h1 class="date" tabindex="-1">{formatHeading(key)}</h1>
      <nav class="views" aria-label="Views">
        <button type="button" class="icon-btn" aria-label="Stats">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>
        </button>
        <button type="button" class="icon-btn" aria-label="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"
            ><circle cx="12" cy="12" r="3" /><path
              d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"
            /></svg
          >
        </button>
      </nav>
    </div>
    <div class="line">
      <p class="caption">
        {caption}{#if relative}<span class="relative"> · {relative}</span>{/if}
        {#if readOnly}
          <svg class="lock" viewBox="0 0 24 24" role="img" aria-label="Read-only">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        {/if}
      </p>
      <nav class="pages" aria-label="Pages">
        <button type="button" disabled={!nav.hasNewer} onclick={nav.onNewer}>‹ Newer</button>
        <button type="button" disabled={!nav.hasOlder} onclick={nav.onOlder}>Older ›</button>
        {#if readOnly}
          <button type="button" class="today" onclick={nav.onToday}>Today</button>
        {/if}
      </nav>
    </div>
  </header>

  <!-- The face scrolls, not the card, so the 3D layer stays exactly one screen tall. -->
  <div class="scroll ruled" use:restoreScroll onscroll={(e) => onScroll(e.currentTarget.scrollTop)}>
    {#if skipped > 0}
      <p class="skipped">{skippedLabel(skipped)}</p>
    {/if}
    {@render children()}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding-top: var(--binding-height);
  }
  .page.past {
    --ink: var(--ink-past);
  }

  .bar {
    flex: none;
    height: calc(var(--line-height) * 2);
    padding: 0 var(--space-1) 0 calc(var(--margin-x) + var(--space-2));
  }
  .line {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    height: var(--line-height);
  }

  .date {
    min-width: 0;
    font-family: var(--font-hand);
    font-weight: 700;
    font-size: clamp(1.3rem, 6vw, 1.75rem);
    line-height: var(--line-height);
    white-space: nowrap;
    color: var(--ink);
  }
  .date:focus-visible {
    outline-offset: 0;
  }

  .caption {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    overflow: hidden;
    font-family: var(--font-hand);
    font-size: 1.15rem;
    line-height: var(--line-height);
    white-space: nowrap;
    color: var(--ink-soft);
  }
  .lock {
    flex: none;
    width: 15px;
    height: 15px;
    fill: none;
    stroke: var(--ink-soft);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  nav {
    display: flex;
    flex: none;
  }
  .views {
    gap: 0;
  }
  .icon-btn,
  .pages button {
    display: grid;
    place-items: center;
    height: var(--tap-target);
    margin: -6px 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .icon-btn {
    width: 40px;
    border-radius: 50%;
  }
  .pages button {
    position: relative;
    min-width: var(--tap-target);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
  }
  .pages button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .pages .today {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .icon-btn:focus-visible,
  .pages button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .icon-btn svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: var(--ink-soft);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .scroll {
    position: relative; /* contains absolutely positioned bits such as .sr-only, so they are clipped too */
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
  }

  .skipped {
    padding: 0 var(--space-4) 0 calc(var(--margin-x) + var(--space-2));
    font-family: var(--font-hand);
    font-size: 1.15rem;
    line-height: var(--line-height);
    color: var(--margin-line);
    opacity: 0.85;
  }
</style>
