<script lang="ts">
  import { onMount } from 'svelte';
  import type { Task } from '$lib/model/types';

  type Props = {
    task: Task;
    routine: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onRoutine: (task: Task) => void;
    onMove: (task: Task, direction: -1 | 1) => void;
    onDelete: (task: Task) => void;
    onClose: () => void;
  };

  let { task, routine, canMoveUp, canMoveDown, onRoutine, onMove, onDelete, onClose }: Props =
    $props();

  let sheet: HTMLDivElement | undefined = $state();

  const enabled = () => [
    ...(sheet?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
  ];

  onMount(() => enabled()[0]?.focus());

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      const items = enabled();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  /** Closes the menu, then runs the action for the task the menu was opened on. */
  const choose = (action: (task: Task) => void) => () => {
    const chosen = task;
    onClose();
    action(chosen);
  };
</script>

<div class="backdrop" role="presentation" onclick={onClose}></div>
<div
  class="sheet"
  role="dialog"
  aria-modal="true"
  aria-label="Task actions"
  tabindex="-1"
  bind:this={sheet}
  onkeydown={onKeydown}
>
  <p class="preview">{task.text}</p>
  <button type="button" onclick={choose(onRoutine)}
    >{routine ? 'Stop routine' : 'Make routine'}</button
  >
  <button type="button" disabled={!canMoveUp} onclick={choose((t) => onMove(t, -1))}>Move up</button
  >
  <button type="button" disabled={!canMoveDown} onclick={choose((t) => onMove(t, 1))}
    >Move down</button
  >
  <button type="button" class="danger" onclick={choose(onDelete)}>Delete</button>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    background: rgb(0 0 0 / 0.35);
  }
  .sheet {
    position: fixed;
    z-index: 11;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: var(--page-max-width);
    margin: 0 auto;
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--paper-cream);
    color: var(--ink);
    box-shadow: var(--shadow-lift);
    animation: rise 160ms ease-out;
  }
  .preview {
    margin-bottom: var(--space-2);
    max-height: calc(var(--line-height) * 2);
    overflow: hidden;
    color: var(--ink-soft);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  button {
    display: block;
    width: 100%;
    min-height: var(--tap-target);
    padding: 0 var(--space-2);
    border: 0;
    border-top: 1px solid var(--ruled-line);
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  button:disabled {
    color: var(--ink-soft);
    opacity: 0.5;
    cursor: default;
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .danger {
    color: var(--margin-line);
    font-weight: 600;
  }
  @keyframes rise {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
</style>
