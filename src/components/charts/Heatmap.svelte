<script lang="ts">
  import { onMount } from 'svelte';
  import { addDays, formatShort, formatWithWeekday, weekdayName } from '$lib/model/dates';
  import type { DateKey } from '$lib/model/types';
  import { heatmap, skippedBefore } from '$lib/stats/compute';
  import type { AppData } from '$lib/model/types';

  type Props = {
    data: AppData;
    today: DateKey;
    weekStart: number;
    /** Weeks drawn; the sheet scrolls sideways through them. */
    weeks?: number;
    /** Opens the page for a day. */
    onopen: (key: DateKey) => void;
  };
  let { data, today, weekStart, weeks = 53, onopen }: Props = $props();

  const map = $derived(heatmap(data, today, weeks, weekStart));
  const rows = $derived(Array.from({ length: 7 }, (_, row) => map.weeks.map((week) => week[row]!)));
  const firstDay = $derived(map.weeks[0]![0]!.date);

  const monthName = (month: number) =>
    new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(2023, month, 1));

  let selectedDate = $state<DateKey | null>(null);
  // The one cell in the tab order; arrow keys move it.
  let focusDate = $state<DateKey | null>(null);
  const tabDate = $derived(focusDate ?? selectedDate ?? today);
  const selected = $derived(
    selectedDate ? (map.weeks.flat().find((c) => c.date === selectedDate) ?? null) : null,
  );

  const tip = $derived.by(() => {
    if (!selected) return '';
    const date = formatShort(selected.date);
    if (!selected.hasPage) return `${date} · no page`;
    const skipped = skippedBefore(data, selected.date);
    return (
      `${date} · ${selected.done} done` +
      (skipped > 0 ? ` · ${skipped} day${skipped === 1 ? '' : 's'} skipped before` : '')
    );
  });

  let scroller: HTMLDivElement | undefined = $state();
  let grid: HTMLDivElement | undefined = $state();

  /** Opens scrolled to the current week. */
  onMount(() => {
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });

  function move(from: DateKey, delta: number) {
    const target = addDays(from, delta);
    if (target < firstDay || target > today) return;
    focusDate = target;
    selectedDate = target;
    queueMicrotask(() => grid?.querySelector<HTMLElement>(`[data-date="${target}"]`)?.focus());
  }

  function onkeydown(event: KeyboardEvent, date: DateKey, hasPage: boolean) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const delta: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
    };
    if (event.key in delta) {
      event.preventDefault();
      move(date, delta[event.key]!);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (hasPage) onopen(date);
    }
  }

  const label = (c: { date: DateKey; done: number; hasPage: boolean }) =>
    c.hasPage
      ? `${formatWithWeekday(c.date)}: ${c.done} done`
      : `${formatWithWeekday(c.date)}: no page`;
</script>

<div class="heatmap">
  <div class="body">
    <div class="days" aria-hidden="true">
      <span class="corner"></span>
      {#each { length: 7 } as _, r (r)}
        <span class="day">{r % 2 === 0 ? weekdayName((weekStart + r) % 7) : ''}</span>
      {/each}
    </div>

    <div class="scroller" bind:this={scroller}>
      <div class="months" style:--cols={weeks} aria-hidden="true">
        {#each map.months as m (m.col)}
          <span style:grid-column={m.col + 1}>{monthName(m.month)}</span>
        {/each}
      </div>

      <div
        class="grid"
        role="grid"
        aria-label="Tasks done per day, last {weeks} weeks. Arrow keys move between days, Enter opens a page."
        style:--cols={weeks}
        bind:this={grid}
      >
        {#each rows as row, r (r)}
          <div class="week-row" role="row">
            {#each row as cell (cell.date)}
              {#if cell.future}
                <span class="cell future" role="gridcell" aria-hidden="true"></span>
              {:else}
                <span role="gridcell">
                  <button
                    type="button"
                    class="cell"
                    class:today={cell.date === today}
                    class:picked={cell.date === selectedDate}
                    data-level={cell.level}
                    data-date={cell.date}
                    data-page={cell.hasPage}
                    tabindex={cell.date === tabDate ? 0 : -1}
                    aria-label={label(cell)}
                    onclick={() => {
                      selectedDate = cell.date;
                      focusDate = cell.date;
                    }}
                    onkeydown={(e) => onkeydown(e, cell.date, cell.hasPage)}
                  ></button>
                </span>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <div class="foot">
    <p class="tip" aria-live="polite">
      {#if selected}
        <span>{tip}</span>
        {#if selected.hasPage}
          <button type="button" onclick={() => onopen(selected.date)}>Open page</button>
        {/if}
      {:else}
        <span class="hint">Tap a day for the details</span>
      {/if}
    </p>
    <div class="legend" aria-hidden="true">
      Less
      {#each [0, 1, 2, 3, 4] as level (level)}
        <span class="cell" data-level={level}></span>
      {/each}
      More
    </div>
  </div>
</div>

<style>
  .heatmap {
    --cell: 10px;
    --gap: 2px;
  }
  .body {
    display: flex;
    gap: var(--space-1);
  }

  .days {
    display: grid;
    flex: none;
    grid-template-rows: 14px repeat(7, var(--cell));
    row-gap: var(--gap);
    width: 26px;
    font-size: 9px;
    line-height: var(--cell);
    color: var(--ink-soft);
  }
  .day {
    overflow: visible;
    white-space: nowrap;
  }

  .scroller {
    min-width: 0;
    flex: 1;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    touch-action: pan-x pan-y;
    padding-bottom: 2px;
    scrollbar-width: none;
  }
  .scroller::-webkit-scrollbar {
    display: none;
  }

  .months {
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--cell));
    column-gap: var(--gap);
    width: max-content;
    height: 14px;
    font-size: 9px;
    line-height: 12px;
    color: var(--ink-soft);
  }
  .months span {
    white-space: nowrap;
    overflow: visible;
  }

  .grid {
    display: grid;
    row-gap: var(--gap);
    width: max-content;
  }
  .week-row {
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--cell));
    column-gap: var(--gap);
  }
  [role='gridcell'] {
    display: block;
  }

  .cell {
    display: block;
    width: var(--cell);
    height: var(--cell);
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: var(--viz-empty);
    cursor: pointer;
    position: relative;
  }
  /* A bigger invisible target, since the cell itself is small */
  button.cell::after {
    content: '';
    position: absolute;
    inset: -2px;
  }
  .cell[data-level='1'] {
    background: var(--viz-1);
  }
  .cell[data-level='2'] {
    background: var(--viz-2);
  }
  .cell[data-level='3'] {
    background: var(--viz-3);
  }
  .cell[data-level='4'] {
    background: var(--viz-4);
  }
  .cell[data-page='false'] {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--viz-grid);
  }
  .cell.future {
    visibility: hidden;
  }
  .cell.today {
    outline: 2px solid var(--viz-today);
    outline-offset: 1px;
  }
  .cell.picked {
    outline: 2px solid var(--ink);
    outline-offset: 1px;
  }
  .cell.today.picked {
    outline-color: var(--viz-today);
  }
  .cell:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: var(--ink-soft);
  }
  .legend .cell {
    cursor: default;
  }
  .tip {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--tap-target);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
  }
  .hint {
    color: var(--ink-soft);
  }
  .tip button {
    min-height: 32px;
    margin: 0;
    padding: 0 var(--space-3);
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: transparent;
    color: var(--accent);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }
</style>
