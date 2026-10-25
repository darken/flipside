/**
 * Rounded axis ticks for counts, from 0 up to a round number at or above `max`: three or four
 * ticks with whole-number steps, such as [0, 5, 10, 15] for 11.
 */
export function niceTicks(max: number): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rough = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  // rough <= 10 x magnitude, so one of these always fits.
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!,
  );
  const ticks: number[] = [];
  for (let value = 0; value < max + step; value += step) {
    ticks.push(value);
    if (value >= max) break;
  }
  return ticks;
}
