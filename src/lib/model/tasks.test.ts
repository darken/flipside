import { describe, expect, it } from 'vitest';
import { dataWith, day, task } from '../../../tests/fixtures';
import {
  EmptyTextError,
  TaskNotFoundError,
  addTask,
  copyToToday,
  deleteTask,
  doneTasks,
  editTask,
  getDay,
  moveTask,
  normalizeText,
  putDay,
  restoreTask,
  setDone,
  todoTasks,
} from './tasks';

const NOW = new Date('2026-10-25T15:00:00.000Z');
const ids = (tasks: { id: string }[]) => tasks.map((t) => t.id);

describe('normalizeText', () => {
  it('keeps inner newlines and indentation', () => {
    expect(normalizeText('line one\n\n  line two')).toBe('line one\n\n  line two');
  });

  it('trims blank lines at the start and end', () => {
    expect(normalizeText('\n  \n\nhello\nworld\n\n \n')).toBe('hello\nworld');
  });

  it('normalises CRLF', () => {
    expect(normalizeText('a\r\nb')).toBe('a\nb');
  });

  it('returns null for blank text', () => {
    expect(normalizeText('')).toBeNull();
    expect(normalizeText(' \n\t\n ')).toBeNull();
  });
});

describe('addTask', () => {
  it('adds an undone task at the end of the todo list', () => {
    const start = day('2026-10-25', [task({ id: 'a', order: 4 })]);
    const { day: next, task: added } = addTask(start, '  buy milk\n', NOW);
    expect(added).toMatchObject({
      text: '  buy milk',
      order: 5,
      createdAt: '2026-10-25T15:00:00.000Z',
    });
    expect(added.doneAt).toBeUndefined();
    expect(added.routineId).toBeUndefined();
    expect(ids(next.tasks)).toEqual(['a', added.id]);
    expect(start.tasks).toHaveLength(1);
  });

  it('starts at order 0 and can carry a routineId', () => {
    const { task: added } = addTask(day('2026-10-25'), 'x', NOW, 'r1');
    expect(added.order).toBe(0);
    expect(added.routineId).toBe('r1');
  });

  it('ignores done tasks when numbering', () => {
    const start = day('2026-10-25', [task({ order: 9, doneAt: NOW.toISOString() })]);
    expect(addTask(start, 'x', NOW).task.order).toBe(0);
  });

  it('rejects empty text', () => {
    expect(() => addTask(day('2026-10-25'), ' \n ', NOW)).toThrow(EmptyTextError);
  });
});

describe('editTask', () => {
  it('replaces the text', () => {
    const t = task({ id: 'a' });
    expect(editTask(day('d', [t]), 'a', 'new\ntext\n').tasks[0]!.text).toBe('new\ntext');
  });

  it('rejects empty text and unknown ids', () => {
    const d = day('d', [task({ id: 'a' })]);
    expect(() => editTask(d, 'a', '  ')).toThrow(EmptyTextError);
    expect(() => editTask(d, 'zzz', 'x')).toThrow(TaskNotFoundError);
  });
});

describe('deleteTask', () => {
  it('removes the task', () => {
    const d = day('d', [task({ id: 'a' }), task({ id: 'b' })]);
    expect(ids(deleteTask(d, 'a').tasks)).toEqual(['b']);
  });

  it('throws for an unknown id', () => {
    expect(() => deleteTask(day('d'), 'a')).toThrow(TaskNotFoundError);
  });
});

describe('setDone', () => {
  it('sets doneAt when checking', () => {
    const d = day('d', [task({ id: 'a' })]);
    expect(setDone(d, 'a', true, NOW).tasks[0]!.doneAt).toBe('2026-10-25T15:00:00.000Z');
  });

  it('keeps the original doneAt when already done', () => {
    const d = day('d', [task({ id: 'a', doneAt: '2026-10-25T08:00:00.000Z' })]);
    expect(setDone(d, 'a', true, NOW)).toEqual(d);
  });

  it('clears doneAt and moves to the end of todo when unchecking', () => {
    const d = day('d', [
      task({ id: 'a', order: 0, doneAt: '2026-10-25T08:00:00.000Z' }),
      task({ id: 'b', order: 7 }),
    ]);
    const next = setDone(d, 'a', false, NOW);
    expect('doneAt' in next.tasks[0]!).toBe(false);
    expect(ids(todoTasks(next))).toEqual(['b', 'a']);
  });

  it('does nothing when unchecking an undone task', () => {
    const d = day('d', [task({ id: 'a' })]);
    expect(setDone(d, 'a', false, NOW)).toEqual(d);
  });
});

describe('selectors', () => {
  it('sorts todo by order, breaking ties by creation time', () => {
    const d = day('d', [
      task({ id: 'c', order: 2 }),
      task({ id: 'b', order: 1, createdAt: '2026-10-02T00:00:00.000Z' }),
      task({ id: 'a', order: 1, createdAt: '2026-10-01T00:00:00.000Z' }),
      task({ id: 'x', doneAt: NOW.toISOString() }),
    ]);
    expect(ids(todoTasks(d))).toEqual(['a', 'b', 'c']);
  });

  it('sorts done newest first', () => {
    const d = day('d', [
      task({ id: 'old', doneAt: '2026-10-25T08:00:00.000Z' }),
      task({ id: 'new', doneAt: '2026-10-25T09:00:00.000Z' }),
      task({ id: 'todo' }),
    ]);
    expect(ids(doneTasks(d))).toEqual(['new', 'old']);
  });

  it('breaks done ties by order', () => {
    const at = '2026-10-25T08:00:00.000Z';
    const d = day('d', [
      task({ id: 'b', order: 2, doneAt: at }),
      task({ id: 'a', order: 1, doneAt: at }),
    ]);
    expect(ids(doneTasks(d))).toEqual(['a', 'b']);
  });

  it('does not reorder the stored array', () => {
    const d = day('d', [task({ id: 'b', order: 2 }), task({ id: 'a', order: 1 })]);
    todoTasks(d);
    expect(ids(d.tasks)).toEqual(['b', 'a']);
  });
});

describe('moveTask', () => {
  const todo = () =>
    day('d', [
      task({ id: 'a', order: 10 }),
      task({ id: 'b', order: 20 }),
      task({ id: 'c', order: 30 }),
      task({ id: 'done', order: 5, doneAt: NOW.toISOString() }),
    ]);

  it('moves down and renumbers the todo list from 0', () => {
    const next = moveTask(todo(), 'a', 2);
    expect(ids(todoTasks(next))).toEqual(['b', 'c', 'a']);
    expect(todoTasks(next).map((t) => t.order)).toEqual([0, 1, 2]);
  });

  it('moves up', () => {
    expect(ids(todoTasks(moveTask(todo(), 'c', 0)))).toEqual(['c', 'a', 'b']);
  });

  it('clamps the index', () => {
    expect(ids(todoTasks(moveTask(todo(), 'a', 99)))).toEqual(['b', 'c', 'a']);
    expect(ids(todoTasks(moveTask(todo(), 'c', -5)))).toEqual(['c', 'a', 'b']);
  });

  it('leaves the done list alone when moving a todo', () => {
    const next = moveTask(todo(), 'a', 1);
    expect(next.tasks.find((t) => t.id === 'done')!.order).toBe(5);
  });

  it('renumbers within the done list for done tasks', () => {
    const at = (m: number) => `2026-10-25T08:0${m}:00.000Z`;
    const d = day('d', [
      task({ id: 'x', order: 10, doneAt: at(1) }),
      task({ id: 'y', order: 20, doneAt: at(2) }),
      task({ id: 'todo', order: 50 }),
    ]);
    const next = moveTask(d, 'x', 0);
    expect(next.tasks.find((t) => t.id === 'todo')!.order).toBe(50);
    expect(next.tasks.find((t) => t.id === 'x')!.order).toBe(0);
    expect(next.tasks.find((t) => t.id === 'y')!.order).toBe(1);
  });

  it('throws for an unknown id', () => {
    expect(() => moveTask(todo(), 'nope', 0)).toThrow(TaskNotFoundError);
  });
});

describe('copyToToday', () => {
  it('adds a one-off copy to today and leaves the past day unchanged', () => {
    const past = day('2026-10-24', [
      task({ id: 'a', text: 'call mum\nabout visit', routineId: 'r1', doneAt: NOW.toISOString() }),
    ]);
    const data = dataWith([past, day('2026-10-25', [task({ id: 'x', order: 3 })])]);
    const result = copyToToday(data, '2026-10-24', 'a', '2026-10-25', NOW);
    expect(result.data.days['2026-10-24']).toBe(past);
    const today = result.data.days['2026-10-25']!;
    expect(today.tasks).toHaveLength(2);
    expect(result.task).toMatchObject({ text: 'call mum\nabout visit', order: 4 });
    expect(result.task.id).not.toBe('a');
    expect(result.task.routineId).toBeUndefined();
    expect(result.task.doneAt).toBeUndefined();
  });

  it('creates today if it does not exist yet', () => {
    const data = dataWith([day('2026-10-24', [task({ id: 'a' })])]);
    const result = copyToToday(data, '2026-10-24', 'a', '2026-10-25', NOW);
    expect(result.data.days['2026-10-25']!.tasks).toHaveLength(1);
  });

  it('throws when the source is missing', () => {
    expect(() => copyToToday(dataWith([]), '2026-10-24', 'a', '2026-10-25', NOW)).toThrow(
      TaskNotFoundError,
    );
  });
});

describe('getDay and putDay', () => {
  it('returns an empty day for a missing key and stores days immutably', () => {
    const data = dataWith([]);
    expect(getDay(data, '2026-10-25')).toEqual({ date: '2026-10-25', tasks: [] });
    const next = putDay(data, day('2026-10-25'));
    expect(Object.keys(data.days)).toEqual([]);
    expect(Object.keys(next.days)).toEqual(['2026-10-25']);
  });
});

describe('restoreTask', () => {
  it('puts a deleted task back in its old position', () => {
    const a = task({ id: 'a', order: 0 });
    const b = task({ id: 'b', order: 1 });
    const c = task({ id: 'c', order: 2 });
    const d = day('d', [a, b, c]);
    const restored = restoreTask(deleteTask(d, 'b'), b);
    expect(ids(todoTasks(restored))).toEqual(['a', 'b', 'c']);
  });

  it('refuses to duplicate an id', () => {
    const a = task({ id: 'a' });
    expect(() => restoreTask(day('d', [a]), a)).toThrow(/already exists/);
  });
});
