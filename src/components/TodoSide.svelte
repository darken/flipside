<script lang="ts">
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { todoTasks } from '$lib/model/tasks';
  import type { DateKey, Task } from '$lib/model/types';
  import { app } from '$lib/store/app.svelte';
  import { guarded } from '$lib/ui/guarded';
  import { motion, setLeaving, taskFade } from '$lib/ui/motion';
  import { toasts } from '$lib/ui/toast.svelte';
  import TaskInput from './TaskInput.svelte';
  import TaskItem from './TaskItem.svelte';
  import TaskMenu from './TaskMenu.svelte';

  let { key, editable }: { key: DateKey; editable: boolean } = $props();

  type Drag = { id: string; from: number; to: number; dy: number; height: number };

  const day = $derived(app.day(key) ?? { date: key, tasks: [] });
  const todo = $derived(todoTasks(day));

  let list: HTMLUListElement | undefined = $state();
  let menu = $state<{ task: Task; opener: HTMLElement } | null>(null);
  let drag = $state<Drag | null>(null);
  let grabbedId = $state<string | null>(null);
  let announcement = $state('');

  const menuIndex = $derived(menu ? todo.findIndex((t) => t.id === menu!.task.id) : -1);

  // ---- Menu actions -------------------------------------------------------------------------

  function closeMenu() {
    const opener = menu?.opener;
    menu = null;
    if (opener?.isConnected) opener.focus();
  }

  function toggleRoutine(task: Task) {
    guarded(() => app.setRoutine(key, task.id, !app.isRoutine(task)));
  }

  function remove(task: Task) {
    const copy = $state.snapshot(task) as Task;
    guarded(() => {
      setLeaving('removed');
      app.remove(key, task.id);
      toasts.show('Task deleted', {
        action: { label: 'Undo', run: () => guarded(() => app.restore(key, copy)) },
      });
    });
  }

  /** Moves a task one place up or down. Returns the new position, or null at the ends. */
  function nudge(task: Task, direction: -1 | 1): number | null {
    const from = todo.findIndex((t) => t.id === task.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= todo.length) return null;
    guarded(() => app.move(key, task.id, to));
    return to;
  }

  function announce(message: string) {
    announcement = message;
  }

  function moveFromMenu(task: Task, direction: -1 | 1) {
    const to = nudge(task, direction);
    if (to !== null) announce(`Moved to position ${to + 1} of ${todo.length}`);
  }

  // ---- Keyboard reordering ------------------------------------------------------------------

  async function onHandleKey(task: Task, event: KeyboardEvent) {
    const position = () => todo.findIndex((t) => t.id === task.id) + 1;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (grabbedId === task.id) {
        grabbedId = null;
        announce(`Dropped at position ${position()} of ${todo.length}`);
      } else {
        grabbedId = task.id;
        announce(
          `Picked up, position ${position()} of ${todo.length}. Use the arrow keys to move.`,
        );
      }
    } else if (event.key === 'Escape' && grabbedId === task.id) {
      grabbedId = null;
    } else if (grabbedId === task.id && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const to = nudge(task, event.key === 'ArrowUp' ? -1 : 1);
      if (to === null) return;
      announce(`Moved to position ${to + 1} of ${todo.length}`);
      await tick();
      list?.querySelector<HTMLElement>(`[data-handle="${task.id}"]`)?.focus();
    }
  }

  // ---- Pointer dragging ---------------------------------------------------------------------

  const EDGE_PX = 64;
  const MAX_SCROLL_PX = 14;
  let rects: { top: number; height: number }[] = [];
  let startPageY = 0;
  let lastClientY = 0;
  let frame = 0;

  const preventTouchScroll = (e: TouchEvent) => e.preventDefault();

  function startDrag(task: Task, clientY: number) {
    if (!list || drag) return;
    const items = [...list.querySelectorAll<HTMLElement>('.slot:not(.leaving) > [data-task-id]')];
    const from = items.findIndex((el) => el.dataset.taskId === task.id);
    if (from < 0) return;
    rects = items.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    });
    startPageY = clientY + window.scrollY;
    lastClientY = clientY;
    drag = { id: task.id, from, to: from, dy: 0, height: rects[from]!.height };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('touchmove', preventTouchScroll, { passive: false });
    frame = requestAnimationFrame(autoscroll);
  }

  function updateDrag() {
    if (!drag) return;
    const mine = rects[drag.from]!;
    const last = rects[rects.length - 1]!;
    const min = rects[0]!.top - mine.top;
    const max = last.top + last.height - mine.height - mine.top;
    const dy = Math.max(min, Math.min(max, lastClientY + window.scrollY - startPageY));
    const center = mine.top + mine.height / 2 + dy;
    // Dragged all the way down, the centres line up exactly: that still counts as passing.
    let to = 0;
    rects.forEach((r, i) => {
      const mid = r.top + r.height / 2;
      if (i !== drag!.from && (dy > 0 ? mid <= center : mid < center)) to++;
    });
    drag = { ...drag, dy, to };
  }

  function onPointerMove(event: PointerEvent) {
    lastClientY = event.clientY;
    updateDrag();
  }

  function autoscroll() {
    if (!drag) return;
    let speed = 0;
    if (lastClientY < EDGE_PX) speed = -((EDGE_PX - lastClientY) / EDGE_PX) * MAX_SCROLL_PX;
    else if (lastClientY > innerHeight - EDGE_PX) {
      speed = ((lastClientY - (innerHeight - EDGE_PX)) / EDGE_PX) * MAX_SCROLL_PX;
    }
    if (speed) {
      window.scrollBy(0, speed);
      updateDrag();
    }
    frame = requestAnimationFrame(autoscroll);
  }

  /** The click that follows a drag must not open the editor or the menu. */
  function swallowNextClick() {
    const block = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('click', block, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', block, { capture: true }), 400);
  }

  function endDrag(commit: boolean) {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('touchmove', preventTouchScroll);
    cancelAnimationFrame(frame);
    const finished = drag;
    drag = null;
    swallowNextClick();
    if (commit && finished && finished.to !== finished.from) {
      guarded(() => app.move(key, finished.id, finished.to));
      navigator.vibrate?.(10);
      announce(`Moved to position ${finished.to + 1} of ${todo.length}`);
    }
  }

  const onPointerUp = () => endDrag(true);
  const onPointerCancel = () => endDrag(false);

  function offsetFor(index: number): number {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.height;
    if (drag.from > drag.to && index < drag.from && index >= drag.to) return drag.height;
    return 0;
  }
</script>

<section class="side" aria-label="To do">
  {#if todo.length === 0}
    <p class="note">
      {day.tasks.length === 0 ? 'A fresh page. What’s first?' : 'Everything’s done. Anything else?'}
    </p>
  {/if}

  <ul class="list" bind:this={list}>
    {#each todo as task, i (task.id)}
      <li class="slot" animate:flip={{ duration: motion(200) }} transition:taskFade>
        <TaskItem
          {task}
          {key}
          {editable}
          dragging={drag?.id === task.id}
          offsetY={offsetFor(i)}
          animateShift={drag !== null}
          grabbed={grabbedId === task.id}
          onMenu={(t, opener) => (menu = { task: t, opener })}
          onDragStart={startDrag}
          {onHandleKey}
        />
      </li>
    {/each}
  </ul>

  {#if editable}
    <TaskInput {key} />
  {/if}

  <p class="sr-only" aria-live="polite">{announcement}</p>
</section>

{#if menu}
  <TaskMenu
    task={menu.task}
    routine={app.isRoutine(menu.task)}
    canMoveUp={menuIndex > 0}
    canMoveDown={menuIndex >= 0 && menuIndex < todo.length - 1}
    onRoutine={toggleRoutine}
    onMove={moveFromMenu}
    onDelete={remove}
    onClose={closeMenu}
  />
{/if}

<style>
  .side {
    padding-bottom: calc(var(--line-height) * 3);
  }
  .list {
    margin: 0;
    padding: 0;
  }
  .slot {
    list-style: none;
  }
  .note {
    padding: 0 var(--space-4) 0 calc(var(--margin-x) + var(--space-2));
    color: var(--ink-soft);
    font-family: var(--font-hand);
    font-size: 1.4rem;
    line-height: var(--line-height);
  }
</style>
