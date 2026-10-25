import { describe, expect, it } from 'vitest';
import { dataWith, day, task } from '../../../tests/fixtures';
import type { Routine } from '$lib/model/types';
import { ensureDay, makeRoutine, renameRoutine, stopRoutine } from './routines';

const NOW = new Date('2026-10-25T15:00:00.000Z');
const routine = (id: string, text: string, active = true): Routine => ({
  id,
  text,
  active,
  createdAt: '2026-10-01T00:00:00.000Z',
});

describe('ensureDay', () => {
  it('creates a new day with one undone task per active routine', () => {
    const data = dataWith([], [routine('r1', 'Stretch'), routine('r2', 'Read\n20 pages')]);
    const day = ensureDay(data, '2026-10-25', NOW).days['2026-10-25']!;
    expect(day.tasks.map((t) => [t.text, t.routineId, t.order])).toEqual([
      ['Stretch', 'r1', 0],
      ['Read\n20 pages', 'r2', 1],
    ]);
    expect(day.tasks.every((t) => !t.doneAt)).toBe(true);
    expect(new Set(day.tasks.map((t) => t.id)).size).toBe(2);
  });

  it('skips inactive routines', () => {
    const data = dataWith([], [routine('r1', 'Old habit', false), routine('r2', 'Stretch')]);
    const day = ensureDay(data, '2026-10-25', NOW).days['2026-10-25']!;
    expect(day.tasks.map((t) => t.routineId)).toEqual(['r2']);
  });

  it('creates an empty day when there are no routines', () => {
    expect(ensureDay(dataWith([]), '2026-10-25', NOW).days['2026-10-25']).toEqual({
      date: '2026-10-25',
      tasks: [],
    });
  });

  it('leaves an existing day alone, so a deleted routine task does not come back', () => {
    const data = dataWith([day('2026-10-25', [])], [routine('r1', 'Stretch')]);
    expect(ensureDay(data, '2026-10-25', NOW)).toBe(data);
  });

  it('never adds the same routine twice, however often it is called', () => {
    let data = dataWith([], [routine('r1', 'Stretch')]);
    data = ensureDay(ensureDay(data, '2026-10-25', NOW), '2026-10-25', NOW);
    expect(data.days['2026-10-25']!.tasks).toHaveLength(1);
  });

  it('does not backfill missed days or touch past days', () => {
    const past = day('2026-10-20', [task({ id: 'p', text: 'Stretch', routineId: 'r1' })]);
    const data = dataWith([past], [routine('r1', 'Stretch')]);
    const next = ensureDay(data, '2026-10-25', NOW);
    expect(Object.keys(next.days).sort()).toEqual(['2026-10-20', '2026-10-25']);
    expect(next.days['2026-10-20']).toBe(past);
  });
});

describe('makeRoutine', () => {
  it('creates an active routine from the task and links it', () => {
    const data = dataWith([day('2026-10-25', [task({ id: 'a', text: 'Water plants' })])]);
    const next = makeRoutine(data, '2026-10-25', 'a', NOW);
    expect(next.routines).toHaveLength(1);
    const [r] = next.routines;
    expect(r).toMatchObject({ text: 'Water plants', active: true });
    expect(next.days['2026-10-25']!.tasks[0]!.routineId).toBe(r!.id);
    expect(data.routines).toHaveLength(0);
  });

  it('reactivates the existing routine instead of creating a second one', () => {
    const data = dataWith(
      [day('2026-10-25', [task({ id: 'a', routineId: 'r1' })])],
      [routine('r1', 'x', false)],
    );
    const next = makeRoutine(data, '2026-10-25', 'a', NOW);
    expect(next.routines).toHaveLength(1);
    expect(next.routines[0]!.active).toBe(true);
  });
});

describe('stopRoutine', () => {
  it('deactivates the routine; past instances keep their routineId', () => {
    const past = day('2026-10-20', [task({ id: 'p', routineId: 'r1' })]);
    const next = stopRoutine(dataWith([past], [routine('r1', 'x')]), 'r1');
    expect(next.routines[0]!.active).toBe(false);
    expect(next.days['2026-10-20']).toBe(past);
    expect(next.days['2026-10-20']!.tasks[0]!.routineId).toBe('r1');
  });

  it('does not create tasks on the next new day', () => {
    const next = stopRoutine(dataWith([], [routine('r1', 'x')]), 'r1');
    expect(ensureDay(next, '2026-10-26', NOW).days['2026-10-26']!.tasks).toEqual([]);
  });

  it('throws for an unknown routine', () => {
    expect(() => stopRoutine(dataWith([]), 'nope')).toThrow(/not found/);
  });
});

describe('renameRoutine', () => {
  it('shows up on the next day only', () => {
    const past = day('2026-10-24', [task({ id: 'p', text: 'Old name', routineId: 'r1' })]);
    const data = renameRoutine(dataWith([past], [routine('r1', 'Old name')]), 'r1', 'New name');
    expect(data.days['2026-10-24']!.tasks[0]!.text).toBe('Old name');
    const tomorrow = ensureDay(data, '2026-10-25', NOW).days['2026-10-25']!;
    expect(tomorrow.tasks[0]!.text).toBe('New name');
  });
});
