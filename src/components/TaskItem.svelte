<script lang="ts">
  import { formatTime } from '$lib/model/dates';
  import type { DateKey, Task } from '$lib/model/types';
  import { app } from '$lib/store/app.svelte';
  import { autosize } from '$lib/ui/autosize';
  import { guarded } from '$lib/ui/guarded';
  import { setLeaving } from '$lib/ui/motion';

  type Props = {
    task: Task;
    key: DateKey;
    editable: boolean;
    /** Drag state, set by TodoSide while a task is being reordered. */
    dragging?: boolean;
    offsetY?: number;
    animateShift?: boolean;
    grabbed?: boolean;
    onMenu?: (task: Task, opener: HTMLElement) => void;
    onDragStart?: (task: Task, clientY: number) => void;
    onHandleKey?: (task: Task, event: KeyboardEvent) => void;
  };

  let {
    task,
    key,
    editable,
    dragging = false,
    offsetY = 0,
    animateShift = false,
    grabbed = false,
    onMenu,
    onDragStart,
    onHandleKey,
  }: Props = $props();

  const LONG_PRESS_MS = 300;
  const MOVE_TOLERANCE_PX = 8;

  const done = $derived(task.doneAt !== undefined);
  const routine = $derived(app.isRoutine(task));
  const canCopy = $derived(!editable && !done && task.routineId === undefined);

  let editing = $state(false);
  let draft = $state('');
  let finished = false;

  function toggle(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    setLeaving(done ? 'removed' : 'done');
    guarded(() => app.toggleDone(key, task.id));
    // If the change was refused the box must show what is really stored.
    input.checked = app.day(key)?.tasks.find((t) => t.id === task.id)?.doneAt !== undefined;
  }

  function startEdit() {
    if (!editable || done) return;
    draft = task.text;
    finished = false;
    editing = true;
  }

  function commit() {
    if (finished) return;
    finished = true;
    editing = false;
    if (draft.trim() === '' || draft === task.text) return;
    guarded(() => app.edit(key, task.id, draft));
  }

  function cancel() {
    finished = true;
    editing = false;
  }

  function onEditKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commit();
    }
  }

  function focusEnd(node: HTMLTextAreaElement) {
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }

  /** Long press on the text starts a drag; moving first means the user is scrolling. */
  function onTextPointerDown(event: PointerEvent) {
    if (!onDragStart || event.button !== 0) return;
    const [startX, startY] = [event.clientX, event.clientY];
    let lastY = startY;
    const timer = setTimeout(() => {
      stop();
      onDragStart(task, lastY);
    }, LONG_PRESS_MS);
    const move = (e: PointerEvent) => {
      lastY = e.clientY;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_TOLERANCE_PX) stop();
    };
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  function onHandlePointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    onDragStart?.(task, event.clientY);
  }
</script>

<div
  class="row item"
  class:done
  class:dragging
  class:shifting={animateShift}
  data-task-id={task.id}
  style:transform={offsetY ? `translateY(${offsetY}px)` : undefined}
>
  <label class="check">
    <input
      type="checkbox"
      checked={done}
      disabled={!editable}
      aria-label={task.text}
      onchange={toggle}
    />
    <span class="box" aria-hidden="true"></span>
  </label>

  <div class="body">
    {#if editing}
      <textarea
        class="text edit"
        rows="1"
        aria-label="Edit task"
        bind:value={draft}
        use:autosize={draft}
        use:focusEnd
        onblur={commit}
        onkeydown={onEditKeydown}></textarea>
      {#if routine}
        <p class="hint">Also updates the routine for future days</p>
      {/if}
    {:else if editable && !done}
      <button
        type="button"
        class="text"
        onclick={startEdit}
        onpointerdown={onTextPointerDown}
        oncontextmenu={(e) => dragging && e.preventDefault()}>{task.text}</button
      >
    {:else}
      <p class="text">{task.text}</p>
    {/if}
    {#if canCopy}
      <button
        type="button"
        class="copy"
        onclick={() => guarded(() => app.copyToToday(key, task.id))}>Copy to today</button
      >
    {/if}
  </div>

  <div class="controls">
    {#if done && task.doneAt}
      <time class="time" datetime={task.doneAt}>{formatTime(task.doneAt)}</time>
    {:else}
      {#if routine}
        <span class="badge" role="img" aria-label="Routine">↻</span>
      {/if}
      {#if editable}
        <button
          type="button"
          class="icon handle"
          data-handle={task.id}
          aria-pressed={grabbed}
          aria-label={`Reorder: ${task.text}. Press Enter to pick up, then use the arrow keys.`}
          onpointerdown={onHandlePointerDown}
          onkeydown={(e) => onHandleKey?.(task, e)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"
            ><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle
              cx="9"
              cy="12"
              r="1.6"
            /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle
              cx="15"
              cy="18"
              r="1.6"
            /></svg
          >
        </button>
        <button
          type="button"
          class="icon more"
          aria-label={`Actions for: ${task.text}`}
          aria-haspopup="dialog"
          onclick={(e) => onMenu?.(task, e.currentTarget)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"
            ><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle
              cx="19"
              cy="12"
              r="1.8"
            /></svg
          >
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .item {
    position: relative;
  }
  .item.shifting {
    transition: transform 150ms ease;
  }
  .item.dragging {
    z-index: 2;
    background: var(--paper-cream);
    box-shadow: var(--shadow-lift);
    transition: none;
  }

  .check {
    position: relative;
    display: block;
    height: var(--line-height); /* the 44px target below must not make the row taller */
  }
  .check input {
    position: absolute;
    top: -6px; /* 44px target centred on the first ruled line */
    left: 6px;
    width: var(--tap-target);
    height: var(--tap-target);
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .check input:disabled {
    cursor: default;
  }
  .box {
    position: absolute;
    top: 5px;
    left: 17px;
    width: 22px;
    height: 22px;
    border: 2px solid var(--ink-soft);
    border-radius: 6px;
    pointer-events: none;
  }
  .box::after {
    content: '';
    position: absolute;
    left: 6px;
    top: 1px;
    width: 6px;
    height: 12px;
    border: solid var(--paper-cream);
    border-width: 0 2.5px 2.5px 0;
    transform: rotate(45deg) scale(0);
    transition: transform 120ms ease;
  }
  input:checked + .box,
  :global(.striking) .box {
    background: var(--accent);
    border-color: var(--accent);
  }
  input:checked + .box::after,
  :global(.striking) .box::after {
    transform: rotate(45deg) scale(1);
  }
  input:focus-visible + .box {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  .body {
    min-width: 0;
    padding: 0 var(--space-2);
  }
  .text {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    line-height: var(--line-height);
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  button.text {
    cursor: text;
    touch-action: pan-y;
  }
  button.text:focus-visible,
  .edit:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .edit {
    resize: none;
    overflow: hidden;
    field-sizing: content;
    min-height: var(--line-height);
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }
  .hint {
    font-size: 12px;
    line-height: var(--line-height);
    color: var(--ink-soft);
  }
  .copy {
    height: var(--line-height);
    margin: 0;
    padding: 0 var(--space-2);
    border: 1px solid var(--ink-soft);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--accent);
    font-size: 13px;
    cursor: pointer;
    position: relative;
  }
  .copy::before {
    content: '';
    position: absolute;
    inset: -6px -4px;
  }

  .done .text,
  :global(.striking) .text {
    color: var(--ink-soft);
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
  }

  .controls {
    display: flex;
    align-items: flex-start;
    padding-right: var(--space-1);
  }
  .badge {
    width: 16px;
    margin-right: var(--space-1);
    color: var(--accent);
    font-size: 15px;
    line-height: var(--line-height);
    text-align: center;
  }
  .time {
    padding: 0 var(--space-3) 0 0;
    color: var(--ink-soft);
    font-size: 13px;
    line-height: var(--line-height);
    font-variant-numeric: tabular-nums;
  }
  .icon {
    display: grid;
    place-items: center;
    width: var(--tap-target);
    height: var(--tap-target);
    margin: -6px 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }
  .icon svg {
    width: 22px;
    height: 22px;
    fill: var(--ink-soft);
  }
  .icon:focus-visible,
  .handle[aria-pressed='true'] {
    outline: 2px solid var(--accent);
    outline-offset: -3px;
  }
  .handle {
    cursor: grab;
    touch-action: none;
    width: 36px;
  }
</style>
