<script lang="ts">
  import { doneTasks } from '$lib/model/tasks';
  import type { DateKey } from '$lib/model/types';
  import { app } from '$lib/store/app.svelte';
  import { taskFade } from '$lib/ui/motion';
  import TaskItem from './TaskItem.svelte';

  let {
    key,
    editable,
    stamp = false,
  }: { key: DateKey; editable: boolean; stamp?: boolean } = $props();

  const done = $derived(doneTasks(app.day(key) ?? { date: key, tasks: [] }));
  const summary = $derived(`${done.length} done${key === app.today ? ' today' : ''}`);
</script>

<section class="side" aria-label="Done">
  {#if stamp}
    <p class="stamp"><span>All done ✓</span></p>
  {/if}
  {#if done.length === 0}
    <p class="note">Nothing done yet</p>
  {:else}
    <p class="summary">{summary}</p>
    <ul class="list">
      {#each done as task (task.id)}
        <li class="slot" transition:taskFade>
          <TaskItem {task} {key} {editable} />
        </li>
      {/each}
    </ul>
  {/if}
</section>

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
  .note,
  .summary {
    padding: 0 var(--space-4) 0 calc(var(--margin-x) + var(--space-2));
    color: var(--ink-soft);
    line-height: var(--line-height);
  }
  .note {
    font-family: var(--font-hand);
    font-size: 1.4rem;
  }
  .stamp {
    display: flex;
    align-items: center;
    height: calc(var(--line-height) * 2);
    padding-left: calc(var(--margin-x) + var(--space-3));
    animation: stamp-in 500ms ease-out 450ms both;
  }
  .stamp span {
    display: inline-block;
    padding: 0 var(--space-3);
    border: 3px solid var(--margin-line);
    border-radius: var(--radius-md);
    color: var(--margin-line);
    font-family: var(--font-hand);
    font-size: 1.9rem;
    font-weight: 700;
    line-height: 1.3;
    transform: rotate(-4deg);
  }
  @keyframes stamp-in {
    from {
      opacity: 0;
      transform: scale(1.25);
    }
  }
  .summary {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
