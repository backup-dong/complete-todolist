import { addDays, addMonths, format, getDay, parseISO, setDate, startOfDay } from 'date-fns';

export function computeNextDue(due: string, repeat: string, repeatUntil?: string): string | null {
  const base = parseISO(due);
  let next: Date | null;

  switch (repeat) {
    case 'daily':
      next = addDays(base, 1);
      break;
    case 'weekly':
      // 下周一（距离最近）
      next = addDays(base, 7 - getDay(base) + 1);
      break;
    case 'monthly':
      next = addMonths(base, 1);
      break;
    case 'weekdays':
      next = nextWeekday(base);
      break;
    default: {
      // mon,wed,fri 或 1,15
      const parts = repeat.split(',').map(s => s.trim().toLowerCase());
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
    const until = parseISO(repeatUntil);
    if (next > until) return null;
  }

  return format(startOfDay(next), 'yyyy-MM-dd');
}

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

function nextWeekday(base: Date): Date {
  const day = getDay(base);
  // 周五(5) -> 下周一(+3), 周六(6) -> 下周一(+2), 其他 -> 明天(+1)
  if (day === 5) return addDays(base, 3);
  if (day === 6) return addDays(base, 2);
  return addDays(base, 1);
}

function nextWeekDays(base: Date, days: WeekDay[]): Date {
  const targets = days.map(d => WEEKDAY_MAP[d]).filter(n => n !== undefined).sort((a, b) => a - b);
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
  const validDays = days.filter(d => d >= 1 && d <= 31).sort((a, b) => a - b);
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
