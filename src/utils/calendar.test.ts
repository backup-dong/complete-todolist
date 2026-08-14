import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import { getMonthGrid, getCalendarOccurrence, groupTasksByDay, isOverdueDay } from '@/utils/calendar';
import type { Task } from '@/types';

const TODAY = '2026-08-14';

function makeTask(id: string, due: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `任务 ${id}`,
    group: '默认分组',
    meta: { priority: 'med', created: '2026-08-01', due },
    subtasks: [],
    ...overrides,
  };
}

describe('getMonthGrid', () => {
  it('returns 42 cells starting from Monday', () => {
    const grid = getMonthGrid(2026, 8);
    expect(grid).toHaveLength(42);
    // 2026-08-01 is Saturday, Mon-first grid starts on 2026-07-27
    expect(format(grid[0], 'yyyy-MM-dd')).toBe('2026-07-27');
    expect(format(grid[grid.length - 1], 'yyyy-MM-dd')).toBe('2026-09-06');
  });

  it('every row starts on Monday', () => {
    const grid = getMonthGrid(2026, 8);
    for (let row = 0; row < 6; row++) {
      expect(format(grid[row * 7], 'i')).toBe('1'); // date-fns: 1 = Monday
    }
  });
});

describe('getCalendarOccurrence', () => {
  it('returns due date for non-repeat task', () => {
    expect(getCalendarOccurrence('2026-08-08', '', undefined, [], TODAY)).toBe('2026-08-08');
  });

  it('returns nothing for task without due', () => {
    expect(getCalendarOccurrence('', '', undefined, [], TODAY)).toBeUndefined();
  });

  it('keeps future occurrence of repeat task as-is', () => {
    expect(getCalendarOccurrence('2026-08-20', 'weekly', undefined, [], TODAY)).toBe('2026-08-20');
  });

  it('advances overdue repeat task to the next pending occurrence only', () => {
    // weekly, due 08-10 (past) -> next pending is 08-17, not every Wednesday running
    expect(getCalendarOccurrence('2026-08-10', 'weekly', undefined, [], TODAY)).toBe('2026-08-17');
  });

  it('advances daily repeat to the next day', () => {
    expect(getCalendarOccurrence('2026-08-13', 'daily', undefined, [], TODAY)).toBe('2026-08-14');
  });

  it('respects holidays for weekdays rule', () => {
    // 08-14 is Friday, holiday -> next weekday Monday 08-17
    expect(getCalendarOccurrence('2026-08-13', 'weekdays', undefined, ['2026-08-14'], TODAY)).toBe('2026-08-17');
  });

  it('returns last valid occurrence when repeat_until expired', () => {
    const occ = getCalendarOccurrence('2026-08-01', 'weekly', '2026-08-08', [], TODAY);
    expect(occ).toBe('2026-08-08');
  });
});

describe('groupTasksByDay', () => {
  it('groups tasks by due date and sorts by priority', () => {
    const tasks = [
      makeTask('a', '2026-08-08'),
      makeTask('b', '2026-08-08', { meta: { priority: 'high', created: '2026-08-01', due: '2026-08-08' } }),
      makeTask('c', '2026-08-09'),
      makeTask('d', '2026-08-08', { meta: { priority: 'low', created: '2026-08-01', due: '2026-08-08' } }),
    ];
    const byDay = groupTasksByDay(tasks, 2026, 8, [], TODAY);
    expect(byDay.get('2026-08-08')!.map((t) => t.id)).toEqual(['b', 'a', 'd']);
    expect(byDay.get('2026-08-09')!.map((t) => t.id)).toEqual(['c']);
  });

  it('places repeat task on its next pending occurrence only', () => {
    // weekly repeat due 08-10 -> next pending 08-17, appears once
    const tasks = [makeTask('r', '2026-08-10', { meta: { priority: 'med', created: '2026-08-01', due: '2026-08-10', repeat: 'weekly' } })];
    const byDay = groupTasksByDay(tasks, 2026, 8, [], TODAY);
    expect(byDay.size).toBe(1);
    expect(byDay.get('2026-08-17')!.map((t) => t.id)).toEqual(['r']);
  });

  it('hides repeat task when its next occurrence falls outside the month', () => {
    // next pending 08-31, outside July
    const tasks = [makeTask('r', '2026-07-27', { meta: { priority: 'med', created: '2026-07-01', due: '2026-07-27', repeat: 'weekly', repeat_until: '2026-08-30' } })];
    const byDay = groupTasksByDay(tasks, 2026, 7, [], '2026-08-14');
    expect(byDay.size).toBe(0);
  });

  it('ignores tasks without due date', () => {
    const tasks = [makeTask('n', '', { meta: { priority: 'med', created: '2026-08-01' } })];
    expect(groupTasksByDay(tasks, 2026, 8, [], TODAY).size).toBe(0);
  });
});

describe('isOverdueDay', () => {
  it('marks days before today as overdue unless done', () => {
    expect(isOverdueDay('2000-01-01', false, TODAY)).toBe(true);
    expect(isOverdueDay('2000-01-01', true, TODAY)).toBe(false);
  });

  it('does not mark today as overdue', () => {
    expect(isOverdueDay(TODAY, false, TODAY)).toBe(false);
  });
});