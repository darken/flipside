<script lang="ts">
  import { getContext } from 'svelte';
  import { nudge } from '$lib/ui/nudge.svelte';
  import { sheets } from '$lib/ui/sheets.svelte';
  import { OPEN_SETTINGS } from '$lib/ui/views';

  const openSettings = getContext<((section?: 'data') => void) | undefined>(OPEN_SETTINGS);
</script>

{#if nudge.active && !sheets.open}
  <aside class="nudge" aria-label="Backup reminder">
    <p>It's been a while since your last backup</p>
    <button
      type="button"
      class="go"
      onclick={() => {
        nudge.dismiss();
        openSettings?.('data');
      }}>Back up</button
    >
    <button type="button" class="x" aria-label="Dismiss reminder" onclick={() => nudge.dismiss()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
    </button>
  </aside>
{/if}

<style>
  /* Two ruled lines tall, so the list below stays on the lines */
  .nudge {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: calc(var(--line-height) * 2);
    padding: 0 0 0 calc(var(--margin-x) + var(--space-2));
    font-family: var(--font-hand);
    font-size: 1.15rem;
    line-height: calc(var(--line-height) - 2px);
    color: var(--margin-line);
  }
  p {
    flex: 1;
    min-width: 0;
  }
  button {
    position: relative;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  .go {
    flex: none;
    height: 26px;
    padding: 0 var(--space-3);
    border: 1px solid currentColor;
    border-radius: 999px;
    color: var(--accent);
    font-family: var(--font-body);
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .x {
    flex: none;
    width: var(--tap-target);
    height: 26px;
    color: var(--ink-soft);
  }
  .x svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  /* Bigger tap targets than the look */
  .go::after {
    content: '';
    position: absolute;
    inset: -9px -4px;
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
