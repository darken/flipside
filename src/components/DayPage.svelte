<script lang="ts">
  import { doneTasks } from '$lib/model/tasks';
  import { formatHeading } from '$lib/model/dates';
  import type { DateKey } from '$lib/model/types';
  import { app } from '$lib/store/app.svelte';
  import DoneSide from './DoneSide.svelte';
  import TodoSide from './TodoSide.svelte';

  export type Side = 'todo' | 'done';

  type Props = { key: DateKey; side: Side; onSideChange: (side: Side) => void };
  let { key, side, onSideChange }: Props = $props();

  const editable = $derived(app.isEditable(key));
  const doneCount = $derived(doneTasks(app.day(key) ?? { date: key, tasks: [] }).length);
</script>

<article class="paper page" aria-label={key === app.today ? "Today's page" : formatHeading(key)}>
  <header class="bar">
    <h1 class="date">{formatHeading(key)}</h1>
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

  <div class="toggle" role="group" aria-label="Page side">
    <button type="button" aria-pressed={side === 'todo'} onclick={() => onSideChange('todo')}
      >To do</button
    >
    <span aria-hidden="true">·</span>
    <button type="button" aria-pressed={side === 'done'} onclick={() => onSideChange('done')}
      >Done ({doneCount})</button
    >
  </div>

  {#if side === 'todo'}
    <TodoSide {key} {editable} />
  {:else}
    <DoneSide {key} {editable} />
  {/if}
</article>

<style>
  .page {
    width: 100%;
    max-width: var(--page-max-width);
    min-height: 100dvh;
    padding-top: 28px; /* binding strip */
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0 var(--space-3) 0 calc(var(--margin-x) + var(--space-2));
    min-height: calc(var(--line-height) * 2);
  }

  .date {
    font-family: var(--font-hand);
    font-weight: 700;
    font-size: 1.75rem;
    line-height: var(--line-height);
    color: var(--ink);
  }

  .actions {
    display: flex;
    gap: var(--space-1);
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

  .toggle {
    display: flex;
    align-items: flex-start;
    height: var(--line-height);
    padding-left: calc(var(--margin-x) + var(--space-2) - var(--space-3));
    color: var(--ink-soft);
    line-height: var(--line-height);
  }
  .toggle button {
    min-height: var(--tap-target);
    margin: -6px 0;
    padding: 0 var(--space-3);
    border: 0;
    background: none;
    color: var(--ink-soft);
    font: inherit;
    font-size: 15px;
    cursor: pointer;
  }
  .toggle button[aria-pressed='true'] {
    color: var(--ink);
    font-weight: 600;
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 6px;
  }
  .toggle button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  @media (min-width: 520px) {
    .page {
      min-height: calc(100dvh - var(--space-6));
      margin-top: var(--space-6);
      border-radius: var(--radius-sm);
    }
  }
</style>
