import { describe, expect, it } from 'vitest';
import { parseAppData } from './validate';

const TS = '2026-10-25T10:00:00.000Z';
const goodTask = { id: 't1', text: 'a', createdAt: TS, order: 0 };
const good = () => ({
  version: 1,
  days: { '2026-10-25': { date: '2026-10-25', tasks: [{ ...goodTask }] } },
  routines: [{ id: 'r1', text: 'Stretch', active: true, createdAt: TS }],
});

function ok(raw: unknown) {
  const result = parseAppData(raw);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe('parseAppData', () => {
  it('accepts valid data unchanged', () => {
    const result = ok(good());
    expect(result.dropped).toBe(0);
    expect(result.data).toEqual(good());
  });

  it('keeps optional fields', () => {
    const raw = good();
    Object.assign(raw.days['2026-10-25']!.tasks[0]!, { doneAt: TS, routineId: 'r1' });
    const task = ok(raw).data.days['2026-10-25']!.tasks[0]!;
    expect(task).toMatchObject({ doneAt: TS, routineId: 'r1' });
  });

  it('ignores unknown fields', () => {
    const raw = { ...good(), extra: 1 };
    Object.assign(raw.days['2026-10-25']!.tasks[0]!, { colour: 'red' });
    const result = ok(raw);
    expect(result.data).toEqual(good());
  });

  it.each([null, 'text', 5, [], undefined])('rejects %j as a whole', (raw) => {
    expect(parseAppData(raw)).toEqual({ ok: false, error: 'Not a Flipside data file' });
  });

  it('rejects an unsupported version', () => {
    expect(parseAppData({ ...good(), version: 2 })).toMatchObject({ ok: false });
    expect(parseAppData({ days: {}, routines: [] })).toMatchObject({
      ok: false,
      error: 'Unsupported data version: undefined',
    });
  });

  it('rejects missing days or routines', () => {
    expect(parseAppData({ ...good(), days: [] })).toMatchObject({
      ok: false,
      error: 'Missing days',
    });
    expect(parseAppData({ ...good(), routines: {} })).toMatchObject({
      ok: false,
      error: 'Missing routines',
    });
  });

  it('drops days with bad keys, mismatched dates or bad tasks arrays', () => {
    const raw = good();
    Object.assign(raw.days, {
      '2026-02-30': { date: '2026-02-30', tasks: [] },
      '2026-10-24': { date: '2026-10-23', tasks: [] },
      '2026-10-23': { date: '2026-10-23', tasks: 'no' },
      '2026-10-22': 'no',
    });
    const result = ok(raw);
    expect(Object.keys(result.data.days)).toEqual(['2026-10-25']);
    expect(result.dropped).toBe(4);
  });

  it('drops unrecognisable tasks and counts them', () => {
    const raw = good();
    raw.days['2026-10-25']!.tasks.push(
      null as never,
      { ...goodTask, id: '' } as never,
      { ...goodTask, id: 't2', text: ' \n' } as never,
      { ...goodTask, id: 't3', text: 5 } as never,
      { ...goodTask, id: 't4', createdAt: 'yesterday' } as never,
      { ...goodTask, id: 't5', createdAt: '2026-13-45T00:00:00Z' } as never,
      { ...goodTask, id: 't6', order: NaN } as never,
      { ...goodTask, id: 't7', order: '1' } as never,
      { ...goodTask, id: 't8', doneAt: 'later' } as never,
      { ...goodTask, id: 't9', routineId: 3 } as never,
      { ...goodTask }, // duplicate id
    );
    const result = ok(raw);
    expect(result.data.days['2026-10-25']!.tasks.map((t) => t.id)).toEqual(['t1']);
    expect(result.dropped).toBe(11);
  });

  it('drops unrecognisable and duplicate routines', () => {
    const raw = good();
    raw.routines.push(
      { id: 'r1', text: 'dup', active: true, createdAt: TS },
      { id: 'r2', text: 'x', active: 'yes', createdAt: TS } as never,
      { id: 'r3', text: '', active: true, createdAt: TS },
      { id: 'r4', text: 'x', active: true, createdAt: 'no' },
      7 as never,
    );
    const result = ok(raw);
    expect(result.data.routines.map((r) => r.id)).toEqual(['r1']);
    expect(result.dropped).toBe(5);
  });
});
