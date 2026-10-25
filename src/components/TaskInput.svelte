<script lang="ts">
  import { tick } from 'svelte';
  import type { DateKey } from '$lib/model/types';
  import { app } from '$lib/store/app.svelte';
  import { autosize } from '$lib/ui/autosize';
  import { guarded } from '$lib/ui/guarded';
  import { reducedMotion } from '$lib/ui/motion';

  let { key }: { key: DateKey } = $props();

  let text = $state('');
  let asRoutine = $state(false);
  let field: HTMLTextAreaElement | undefined = $state();

  function submit() {
    const task = guarded(() => app.add(key, text));
    if (!task) return;
    if (asRoutine) guarded(() => app.setRoutine(key, task.id, true));
    text = '';
    asRoutine = false;
    field?.focus();
    void tick().then(reveal);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      text = '';
    }
  }

  function reveal() {
    field?.scrollIntoView?.({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  // On iOS the keyboard resizes the visual viewport after focus; keep the field in view.
  function onFocus() {
    const viewport = window.visualViewport;
    setTimeout(reveal, 250);
    viewport?.addEventListener('resize', reveal);
    field?.addEventListener('blur', () => viewport?.removeEventListener('resize', reveal), {
      once: true,
    });
  }

  /** Keeps the keyboard open when tapping the buttons. */
  const keepFocus = (event: Event) => event.preventDefault();
</script>

<div class="row input">
  <div></div>
  <div class="body">
    <textarea
      bind:this={field}
      bind:value={text}
      use:autosize={text}
      rows="1"
      placeholder="Write a task…"
      aria-label="New task"
      enterkeyhint="enter"
      onkeydown={onKeydown}
      onfocus={onFocus}></textarea>
  </div>
  <div class="controls">
    <button
      type="button"
      class="icon routine"
      aria-pressed={asRoutine}
      aria-label="Add as routine"
      title="Add as routine"
      onpointerdown={keepFocus}
      onclick={() => (asRoutine = !asRoutine)}>↻</button
    >
    <button
      type="button"
      class="icon add"
      aria-label="Add task"
      title="Add task (Cmd/Ctrl+Enter)"
      onpointerdown={keepFocus}
      onclick={submit}>✓</button
    >
  </div>
</div>

<style>
  textarea {
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
    resize: none;
    overflow: hidden;
    field-sizing: content;
    min-height: var(--line-height);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  textarea::placeholder {
    color: var(--ink-soft);
    font-family: var(--font-hand);
    font-size: 1.25rem;
    opacity: 0.8;
  }
  textarea:focus {
    outline: none;
  }
  .body {
    min-width: 0;
    padding: 0 var(--space-2);
  }
  .controls {
    display: flex;
    align-items: flex-start;
    padding-right: var(--space-1);
  }
  .icon {
    width: var(--tap-target);
    height: var(--tap-target);
    margin: -6px 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--ink-soft);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }
  .icon:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -3px;
  }
  .routine[aria-pressed='true'] {
    color: var(--paper-cream);
    background: var(--accent);
  }
  .add {
    color: var(--accent);
    font-weight: 700;
  }
</style>
