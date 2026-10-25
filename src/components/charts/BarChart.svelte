<script lang="ts">
  import { formatShort, formatWithWeekday } from '$lib/model/dates';
  import type { DateKey } from '$lib/model/types';
  import type { DayCount } from '$lib/stats/compute';
  import { niceTicks } from '$lib/stats/scale';

  type Props = {
    days: DayCount[];
    today: DateKey;
    /** Screen-reader summary, such as "Last 30 days: 142 tasks done, best day Oct 14 with 11". */
    label: string;
    /** Opens the page for a day (only offered for days that have one). */
    onopen: (key: DateKey) => void;
  };
  let { days, today, label, onopen }: Props = $props();

  const W = 343;
  const H = 190;
  const LEFT = 26;
  const RIGHT = 4;
  const TOP = 10;
  const BOTTOM = 22;
  const plotW = W - LEFT - RIGHT;
  const plotH = H - TOP - BOTTOM;

  const ticks = $derived(niceTicks(Math.max(0, ...days.map((d) => d.done))));
  const yMax = $derived(ticks.at(-1)!);
  const y = (value: number) => TOP + plotH - (value / yMax) * plotH;

  const slot = $derived(plotW / Math.max(1, days.length));
  const barW = $derived(Math.max(2, Math.min(24, slot * 0.7)));
  const cx = (i: number) => LEFT + slot * (i + 0.5);

  /** Label every Nth day counting back from today: all of 7 days, every 7th of 30, every 14th of 90. */
  const step = $derived(days.length <= 10 ? 1 : days.length <= 45 ? 7 : 14);
  const labelled = $derived(
    days.flatMap((d, i) => ((days.length - 1 - i) % step === 0 ? [{ d, i }] : [])),
  );

  let selectedDate = $state<DateKey | null>(null);
  const selectedIndex = $derived(days.findIndex((d) => d.date === selectedDate));
  const selected = $derived(selectedIndex >= 0 ? days[selectedIndex]! : null);

  const tip = $derived.by(() => {
    if (!selected) return '';
    const date = formatWithWeekday(selected.date);
    return selected.hasPage
      ? `${date} · ${selected.done} of ${selected.total} done`
      : `${date} · no page`;
  });

  function tap(day: DayCount) {
    if (selected?.date === day.date) {
      if (day.hasPage) onopen(day.date);
    } else {
      selectedDate = day.date;
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const last = days.length - 1;
    const from = selectedIndex >= 0 ? selectedIndex : last + 1;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = Math.max(0, from - 1);
    else if (event.key === 'ArrowRight') next = Math.min(last, from + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Enter' && selected?.hasPage) {
      event.preventDefault();
      onopen(selected.date);
      return;
    } else if (event.key === 'Escape' && selected) {
      selectedDate = null;
      event.stopPropagation();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    selectedDate = days[next]!.date;
  }

  /** Anchor labels at the edges so they are not clipped. */
  const anchorFor = (x: number) => (x < LEFT + 14 ? 'start' : x > W - 18 ? 'end' : 'middle');
</script>

<div class="chart">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="frame"
    role="group"
    tabindex="0"
    aria-label="Bars by day. Arrow keys choose a day, Enter opens its page."
    {onkeydown}
  >
    <svg viewBox="0 0 {W} {H}" role="img" aria-label={label}>
      {#each ticks as tick (tick)}
        <line class="grid" x1={LEFT} x2={W - RIGHT} y1={y(tick)} y2={y(tick)} />
        <text class="axis" x={LEFT - 5} y={y(tick)} text-anchor="end" dominant-baseline="middle"
          >{tick}</text
        >
      {/each}

      {#each days as day, i (day.date)}
        {@const x = cx(i)}
        {@const isToday = day.date === today}
        {#if !day.hasPage}
          <line
            class="stub"
            x1={x}
            x2={x}
            y1={y(0) - 1}
            y2={y(0) - 9}
            class:picked={day.date === selectedDate}
          />
        {:else}
          {#if isToday && day.total > day.done}
            <rect
              class="potential"
              x={x - barW / 2}
              y={y(Math.min(day.total, yMax))}
              width={barW}
              height={y(0) - y(Math.min(day.total, yMax))}
              rx="1.5"
            />
          {/if}
          {#if day.done > 0}
            <rect
              class="bar"
              class:today={isToday}
              class:picked={day.date === selectedDate}
              x={x - barW / 2}
              y={y(day.done)}
              width={barW}
              height={y(0) - y(day.done)}
              rx="1.5"
              style:animation-delay="{Math.min(i * 8, 300)}ms"
            />
          {:else}
            <rect
              class="zero"
              class:picked={day.date === selectedDate}
              x={x - barW / 2}
              y={y(0) - 1.5}
              width={barW}
              height="1.5"
            />
          {/if}
        {/if}
        <!-- A full-height hit area, so thin bars are easy to tap -->
        <rect
          class="hit"
          x={x - slot / 2}
          y={TOP}
          width={slot}
          height={plotH}
          role="presentation"
          onclick={() => tap(day)}
        />
      {/each}

      {#each labelled as { d, i } (d.date)}
        <text class="axis" x={cx(i)} y={H - 6} text-anchor={anchorFor(cx(i))}
          >{formatShort(d.date)}</text
        >
      {/each}
    </svg>
  </div>

  <p class="tip" aria-live="polite">
    {#if selected}
      <span>{tip}</span>
      {#if selected.hasPage}
        <button type="button" onclick={() => onopen(selected.date)}>Open page</button>
      {/if}
    {:else}
      <span class="hint">Tap a bar for the details</span>
    {/if}
  </p>

  <div class="sr-only">
    <table>
      <caption>{label}</caption>
      <thead><tr><th>Date</th><th>Done</th><th>Tasks</th></tr></thead>
      <tbody>
        {#each days as day (day.date)}
          <tr>
            <th scope="row">{formatWithWeekday(day.date)}</th>
            <td>{day.hasPage ? day.done : 'no page'}</td>
            <td>{day.hasPage ? day.total : ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .chart {
    position: relative;
  }
  .frame {
    border-radius: var(--radius-sm);
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
    font-family: var(--font-body);
  }
  .grid {
    stroke: var(--viz-grid);
    stroke-width: 1;
  }
  .axis {
    fill: var(--ink-soft);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    fill: var(--viz-3);
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }
  .bar.today {
    fill: var(--viz-today);
  }
  .bar.picked,
  .zero.picked {
    fill: var(--viz-4);
    stroke: var(--ink);
    stroke-width: 1;
  }
  .zero {
    fill: var(--ink-soft);
  }
  .potential {
    fill: none;
    stroke: var(--viz-today);
    stroke-width: 1;
    stroke-dasharray: 2 2;
    opacity: 0.7;
  }
  .stub {
    stroke: var(--ink-soft);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-dasharray: 0.1 3;
    opacity: 0.8;
  }
  .stub.picked {
    stroke: var(--ink);
  }
  .hit {
    fill: transparent;
    cursor: pointer;
  }

  @media (prefers-reduced-motion: no-preference) {
    .bar {
      animation: grow 450ms cubic-bezier(0.2, 0.7, 0.2, 1) backwards;
    }
  }
  @keyframes grow {
    from {
      transform: scaleY(0);
    }
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
