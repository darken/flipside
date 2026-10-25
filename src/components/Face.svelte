<script lang="ts">
  import type { Snippet } from 'svelte';
  import { formatHeading } from '$lib/model/dates';
  import type { DateKey } from '$lib/model/types';

  type Props = { key: DateKey; caption: string; children: Snippet };
  let { key, caption, children }: Props = $props();
</script>

<div class="paper page">
  <header class="bar ruled">
    <div class="titles">
      <h1 class="date" tabindex="-1">{formatHeading(key)}</h1>
      <p class="caption">{caption}</p>
    </div>
    <nav class="actions" aria-label="Views">
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
  </header>

  <!-- The face scrolls, not the card, so the 3D layer stays exactly one screen tall. -->
  <div class="scroll ruled">
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

  .bar {
    display: flex;
    flex: none;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    height: calc(var(--line-height) * 2);
    padding: 0 var(--space-3) 0 calc(var(--margin-x) + var(--space-2));
  }

  .date {
    font-family: var(--font-hand);
    font-weight: 700;
    font-size: 1.75rem;
    line-height: var(--line-height);
    color: var(--ink);
  }
  .date:focus-visible {
    outline-offset: 0;
  }

  .caption {
    font-family: var(--font-hand);
    font-size: 1.3rem;
    line-height: var(--line-height);
    color: var(--ink-soft);
  }

  .actions {
    display: flex;
    gap: var(--space-1);
    margin-top: calc((var(--line-height) * 2 - var(--tap-target)) / 2);
  }

  .icon-btn {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }
  .icon-btn:focus-visible {
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
</style>
