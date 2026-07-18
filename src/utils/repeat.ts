import { addDays, addMonths, format, getDay, isWeekend, parseISO, setDate, startOfDay } from 'date-fns';
import { todayIso } from '@/utils/date';

type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const WEEKDAY_MAP: Record<WeekDay, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 0,
};

export const WEEKDAY_OPTIONS: { key: WeekDay; label: string }[] = [
  { key: 'mon', label: '一' },
  { key: 'tue', label: '二' },
  { key: 'wed', label: '三' },
  { key: 'thu', label: '四' },
  { key: 'fri', label: '五' },
  { key: 'sat', label: '六' },
  { key: 'sun', label: '日' },
];

export type { WeekDay };

export function computeNextDue(
  due: string,
  repeat: string,
  repeatUntil?: string,
  holidays?: string[],
): string | null {
  const base = startOfDay(parseISO(due));
  const holidaySet = new Set(holidays ?? []);
  let next: Date | null;

  switch (repeat) {
    case 'daily':
      next = addDays(base, 1);
      break;
    case 'weekly':
      // 旧数据或简单“每周”：按当前截止日的星期几推进一周
      next = addDays(base, 7);
      break;
    case 'monthly':
      next = addMonths(base, 1);
      break;
    case 'weekdays':
      next = nextWeekday(base, holidaySet);
      break;
    default: {
      const parts = repeat.split(',').map((s) => s.trim().toLowerCase());
      if (parts.length === 0) return null;
      if (/^[0-9]+$/.test(parts[0])) {
        next = nextMonthlyDays(base, parts.map(Number));
      } else {
        next = nextWeekDays(base, parts as WeekDay[]);
      }
    }
  }

  if (!next) return null;

  if (repeatUntil) {
    const until = startOfDay(parseISO(repeatUntil));
    if (next > until) return null;
  }

  return format(startOfDay(next), 'yyyy-MM-dd');
}

export function formatRepeat(repeat: string): string {
  if (!repeat) return '';

  switch (repeat) {
    case 'daily':
      return '每天';
    case 'weekly':
      return '每周';
    case 'monthly':
      return '每月';
    case 'weekdays':
      return '工作日';
  }

  const parts = repeat.split(',').map((s) => s.trim().toLowerCase());

  if (parts.every((p) => WEEKDAY_MAP[p as WeekDay] !== undefined)) {
    const labels = parts
      .map((p) => WEEKDAY_OPTIONS.find((o) => o.key === p)?.label ?? p)
      .join('、');
    return `每周${labels}`;
  }

  if (parts.every((p) => /^[0-9]+$/.test(p))) {
    const labels = parts.map((p) => `${Number(p)}日`).join('、');
    return `每月${labels}`;
  }

  return repeat;
}

function nextWeekday(base: Date, holidays: Set<string>): Date {
  let d = addDays(base, 1);
  while (isWeekend(d) || holidays.has(format(d, 'yyyy-MM-dd'))) {
    d = addDays(d, 1);
  }
  return d;
}

function nextWeekDays(base: Date, days: WeekDay[]): Date {
  const targets = days
    .map((d) => WEEKDAY_MAP[d])
    .filter((n) => n !== undefined)
    .sort((a, b) => a - b);
  if (targets.length === 0) return addDays(base, 1);

  const baseDay = getDay(base);
  for (const t of targets) {
    if (t > baseDay) {
      return addDays(base, t - baseDay);
    }
  }
  // 下周最近一个
  return addDays(base, 7 - baseDay + targets[0]);
}

function nextMonthlyDays(base: Date, days: number[]): Date {
  const validDays = days.filter((d) => d >= 1 && d <= 31).sort((a, b) => a - b);
  if (validDays.length === 0) return addDays(base, 1);

  const currentDay = base.getDate();
  for (const d of validDays) {
    if (d > currentDay) {
      return setDate(base, d);
    }
  }
  // 下月最近一个
  return setDate(addMonths(base, 1), validDays[0]);
}

export function parseWeekdayRule(repeat: string): WeekDay[] {
  const parts = repeat.split(',').map((s) => s.trim().toLowerCase());
  return parts.filter((p): p is WeekDay => WEEKDAY_MAP[p as WeekDay] !== undefined);
}

export function isWeekdayRule(repeat: string): boolean {
  if (!repeat) return false;
  const parts = repeat.split(',').map((s) => s.trim().toLowerCase());
  return parts.length > 0 && parts.every((p) => WEEKDAY_MAP[p as WeekDay] !== undefined);
}

export function isMonthlyDaysRule(repeat: string): boolean {
  if (!repeat) return false;
  const parts = repeat.split(',').map((s) => s.trim().toLowerCase());
  return parts.length > 0 && parts.every((p) => /^[0-9]+$/.test(p));
}

/**
 * 给定重复规则，返回首次发生的截止日期（用于设置新任务时自动填入）。
 * - daily / weekly / monthly → 今天
 * - weekdays → 如果今天是工作日返回今天，否则推到下周一
 * - 自定义星期/日期 → 以昨天为基准计算最近一次
 */
export function getFirstDueDate(repeat: string): string {
  const today = todayIso();

  switch (repeat) {
    case 'daily':
    case 'weekly':
    case 'monthly':
      return today;
    case 'weekdays':
      if (!isWeekend(parseISO(today))) return today;
      return computeNextDue(today, 'weekdays') ?? today;
    default: {
      // "sat,sun" / "mon,wed,fri" / "1,15" 等自定义规则
      const yesterday = format(addDays(parseISO(today), -1), 'yyyy-MM-dd');
      return computeNextDue(yesterday, repeat) ?? today;
    }
  }
}

/**
 * 计算重复任务的有效截止日期。
 * 如果任务的截止日期已过期，循环推进 repeat 规则直到达到今天或未来，
 * 返回"应该显示为"的有效截止日期。
 * 如果截止日期已是今天或将来，直接返回原值。
 */
export function computeEffectiveDueDate(
  due: string,
  repeat: string,
  repeatUntil?: string,
  holidays?: string[],
): string {
  // 没有重复规则的任务，直接返回原值
  if (!repeat) return due;

  const today = todayIso();
  let current = due;

  // 已经今天或将来，无需推进
  if (current >= today) return current;

  const MAX_ITERATIONS = 365;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = computeNextDue(current, repeat, repeatUntil, holidays);
    if (!next || next === current) break;
    if (next >= today) return next;
    current = next;
  }

  return current;
}
