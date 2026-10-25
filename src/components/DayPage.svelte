<script lang="ts">
  import { onDestroy } from 'svelte';
  import { doneTasks, todoTasks } from '$lib/model/tasks';
  import type { DateKey } from '$lib/model/types';
  import { settings } from '$lib/settings/settings.svelte';
  import { app } from '$lib/store/app.svelte';
  import { busy } from '$lib/ui/busy.svelte';
  import { AUTO_FLIP_DELAY_MS, shouldAutoFlip, type Side } from '$lib/ui/flip';
  import type { PageMemory, PageNav } from '$lib/ui/page-memory';
  import DoneSide from './DoneSide.svelte';
  import Face from './Face.svelte';
  import FlipCard from './FlipCard.svelte';
  import TodoSide from './TodoSide.svelte';

  type Props = {
    key: DateKey;
    /** What this page remembers while the stack keeps it off screen. */
    memory: PageMemory;
    /** The page on top: only it answers to keys and moves focus. */
    active?: boolean;
    nav: PageNav;
    /** Days without a page between this page and the next newer one. */
    skipped?: number;
  };
  let { key, memory, active = true, nav, skipped = 0 }: Props = $props();

  // Each page remembers its own side, in memory only: it opens on the to-do side.
  // svelte-ignore state_referenced_locally
  let side = $state<Side>(memory.side);
  // svelte-ignore state_referenced_locally
  let autoFlipped = $state(memory.autoFlipped);
  $effect(() => {
    memory.side = side;
    memory.autoFlipped = autoFlipped;
  });
  let announcement = $state('');
  let root: HTMLDivElement | undefined = $state();
  let autoFlipTimer: ReturnType<typeof setTimeout> | undefined;

  const editable = $derived(app.isEditable(key));
  const day = $derived(app.day(key) ?? { date: key, tasks: [] });
  const todoCount = $derived(todoTasks(day).length);
  const doneCount = $derived(doneTasks(day).length);

  const taskWord = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`;

  function onFlipped(shown: Side) {
    announcement = `${shown === 'done' ? 'Done list' : 'To do list'}, ${taskWord(shown === 'done' ? doneCount : todoCount)}`;
    if (active) {
      root?.querySelector<HTMLElement>(`[data-face="${shown}"] h1`)?.focus({ preventScroll: true });
    }
  }

  /** TodoSide reports a task being checked off; the last one turns the page after a pause. */
  function onCheckedOff(before: number, after: number) {
    const context = () => ({
      cause: 'check' as const,
      editable,
      side,
      busy: busy.active,
      alreadyFlipped: autoFlipped,
      enabled: settings.autoFlip,
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
    if (!active) return;
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
      <Face
        {key}
        caption="To do"
        readOnly={!editable}
        {nav}
        {skipped}
        scrollTop={memory.scroll.todo}
        onScroll={(top) => (memory.scroll.todo = top)}
      >
        <TodoSide {key} {editable} {onCheckedOff} />
      </Face>
    {/snippet}
    {#snippet back()}
      <Face
        {key}
        caption="Done"
        readOnly={!editable}
        {nav}
        {skipped}
        scrollTop={memory.scroll.done}
        onScroll={(top) => (memory.scroll.done = top)}
      >
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
    height: 100%;
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
    animation: bump 320ms var(--ease-out);
  }
  @keyframes bump {
    40% {
      transform: scale(1.5);
    }
  }
</style>
