<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { doneTasks, todoTasks } from '$lib/model/tasks';
  import type { DateKey } from '$lib/model/types';
  import { app } from '$lib/store/app.svelte';
  import { busy } from '$lib/ui/busy.svelte';
  import { AUTO_FLIP_DELAY_MS, shouldAutoFlip, type Side } from '$lib/ui/flip';
  import DoneSide from './DoneSide.svelte';
  import Face from './Face.svelte';
  import FlipCard from './FlipCard.svelte';
  import TodoSide from './TodoSide.svelte';

  let { key }: { key: DateKey } = $props();

  // Each page remembers its own side, in memory only: it opens on the to-do side.
  let side = $state<Side>('todo');
  let autoFlipped = $state(false);
  let announcement = $state('');
  let root: HTMLDivElement | undefined = $state();
  let autoFlipTimer: ReturnType<typeof setTimeout> | undefined;

  const editable = $derived(app.isEditable(key));
  const day = $derived(app.day(key) ?? { date: key, tasks: [] });
  const todoCount = $derived(todoTasks(day).length);
  const doneCount = $derived(doneTasks(day).length);

  // After midnight the new day starts on the front.
  let lastKey = untrack(() => key);
  $effect(() => {
    if (key === lastKey) return;
    lastKey = key;
    side = 'todo';
    autoFlipped = false;
  });

  const taskWord = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`;

  function onFlipped(shown: Side) {
    announcement = `${shown === 'done' ? 'Done list' : 'To do list'}, ${taskWord(shown === 'done' ? doneCount : todoCount)}`;
    root?.querySelector<HTMLElement>(`[data-face="${shown}"] h1`)?.focus({ preventScroll: true });
  }

  /** TodoSide reports a task being checked off; the last one turns the page after a pause. */
  function onCheckedOff(before: number, after: number) {
    const context = () => ({
      cause: 'check' as const,
      editable,
      side,
      busy: busy.active,
      alreadyFlipped: autoFlipped,
    });
    if (!shouldAutoFlip(before, after, context())) return;
    clearTimeout(autoFlipTimer);
    autoFlipTimer = setTimeout(() => {
      // Look again: the task may have been unchecked, or something opened, in the meantime.
      if (!shouldAutoFlip(1, todoCount, context())) return;
      autoFlipped = true;
      side = 'done';
    }, AUTO_FLIP_DELAY_MS);
  }

  onDestroy(() => clearTimeout(autoFlipTimer));

  function toggleSide() {
    side = side === 'todo' ? 'done' : 'todo';
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key.toLowerCase() !== 'f' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    if (busy.active) return;
    event.preventDefault();
    toggleSide();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="root" bind:this={root}>
  <FlipCard {side} onSideChange={(next) => (side = next)} {onFlipped} disabled={busy.active}>
    {#snippet front()}
      <Face {key} caption="To do">
        <TodoSide {key} {editable} {onCheckedOff} />
      </Face>
    {/snippet}
    {#snippet back()}
      <Face {key} caption="Done">
        <DoneSide {key} {editable} stamp={autoFlipped && todoCount === 0} />
      </Face>
    {/snippet}
  </FlipCard>

  <button
    type="button"
    class="flip-button"
    aria-label={side === 'todo' ? 'Show done list' : 'Show to-do list'}
    aria-pressed={side === 'done'}
    aria-keyshortcuts="F"
    onclick={toggleSide}
  >
    {#if side === 'todo'}
      <span>Done (</span>{#key doneCount}<span class="count">{doneCount}</span>{/key}<span>)</span>
    {:else}
      <span>To do (</span>{#key todoCount}<span class="count">{todoCount}</span>{/key}<span>)</span>
    {/if}
    <span aria-hidden="true" class="turn">↻</span>
  </button>

  <p class="sr-only" aria-live="polite">{announcement}</p>
</div>

<style>
  .root {
    position: relative;
    width: 100%;
    max-width: var(--page-max-width);
    height: var(--page-height);
  }

  /* A turned-up corner at the bottom right of the page */
  .flip-button {
    position: absolute;
    z-index: 3;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--tap-target);
    padding: 0 var(--space-4) 0 var(--space-5);
    border: 0;
    border-radius: var(--radius-lg) 0 var(--radius-sm) 0;
    background: linear-gradient(
      135deg,
      var(--paper-edge) 0%,
      color-mix(in srgb, var(--paper-edge) 70%, var(--paper-cream)) 55%,
      var(--paper-cream) 100%
    );
    color: var(--ink);
    box-shadow:
      -2px -2px 6px rgb(40 30 10 / 0.18),
      inset 1px 1px 0 rgb(255 255 255 / 0.4);
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  .flip-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -4px;
  }
  .turn {
    margin-left: var(--space-1);
    font-size: 18px;
  }
  .count {
    display: inline-block;
    animation: bump 320ms ease-out;
  }
  @keyframes bump {
    40% {
      transform: scale(1.5);
    }
  }

  @media (min-width: 520px) {
    .root {
      height: calc(var(--page-height) - 2 * var(--space-5));
      margin-block: var(--space-5);
    }
  }
</style>
