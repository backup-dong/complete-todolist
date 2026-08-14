import { addDays, endOfMonth, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import type { Task } from '@/types';
import { computeNextDue } from '@/utils/repeat';

const MONTH_GRID_CELLS = 42;
const MAX_ITERATIONS = 366;

/** 周一起始的 6 行 x 7 列月网格，共 42 个 Date（含相邻月份日期） */
export function getMonthGrid(year: number, month: number): Date[] {
  const first = startOfMonth(new Date(year, month - 1, 1));
  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  return Array.from({ length: MONTH_GRID_CELLS }, (_, i) => addDays(gridStart, i));
}

/** 该日期是否属于指定月份 */
export function dateIsInMonth(date: Date, year: number, month: number): boolean {
  return isSameMonth(date, new Date(year, month - 1, 1));
}

/** 日期字符串是否落在指定月份内 */
export function dateStrInMonth(iso: string, year: number, month: number): boolean {
  const start = format(startOfMonth(new Date(year, month - 1, 1)), 'yyyy-MM-dd');
  const end = format(endOfMonth(new Date(year, month - 1, 1)), 'yyyy-MM-dd');
  return iso >= start && iso <= end;
}

/**
 * 单个任务在日历上应展示的日期：
 * - 无重复规则任务：返回 due（可能已逾期，用于红色高亮）
 * - 重复任务：只返回"最近一次待开展"的日期（>= today 的最近一次，
 *   若 repeat_until 已过期则返回最后一次有效发生日），不再展开每月所有发生日
 */
export function getCalendarOccurrence(
  due: string,
  repeat: string,
  repeatUntil: string | undefined,
  holidays: string[],
  todayISO: string,
): string | undefined {
  if (!due) return undefined;
  if (!repeat) return due;

  let current = due;
  if (current >= todayISO) return current;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = computeNextDue(current, repeat, repeatUntil, holidays);
    if (!next || next === current) break;
    if (next >= todayISO) return next;
    current = next;
  }
  return current;
}

const PRIORITY_RANK: Record<Task['meta']['priority'], number> = { high: 3, med: 2, low: 1 };

/**
 * 将任务按日历展示日期分组到月份内的每一天。
 * 每天内部按优先级、order 排序。
 */
export function groupTasksByDay(
  tasks: Task[],
  year: number,
  month: number,
  holidays: string[],
  todayISO = format(new Date(), 'yyyy-MM-dd'),
): Map<string, Task[]> {
  const byDay = new Map<string, Task[]>();
  for (const task of tasks) {
    const due = task.meta.due;
    if (!due) continue;
    const date = getCalendarOccurrence(due, task.meta.repeat ?? '', task.meta.repeat_until, holidays, todayISO);
    if (!date || !dateStrInMonth(date, year, month)) continue;
    const bucket = byDay.get(date);
    if (bucket) {
      bucket.push(task);
    } else {
      byDay.set(date, [task]);
    }
  }
  for (const bucket of byDay.values()) {
    bucket.sort(
      (a, b) =>
        (PRIORITY_RANK[b.meta.priority] - PRIORITY_RANK[a.meta.priority]) ||
        (a.meta.order ?? 0) - (b.meta.order ?? 0),
    );
  }
  return byDay;
}

/** 某天是否早于今天（严格早于，今天不算）且任务未完成（用于日历逾期高亮） */
export function isOverdueDay(dayIso: string, done: boolean, todayISO: string): boolean {
  if (done) return false;
  return dayIso < todayISO;
}