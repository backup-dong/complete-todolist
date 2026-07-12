import { addDays, addMonths, format, getDay, isWeekend, parseISO, setDate, startOfDay } from 'date-fns';

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
