import { format, isSameDay, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function nowIso(): string {
  // 使用中国时区 +08:00，输出格式：2026-07-05T09:11:27+08:00
  const now = new Date();
  const chinaOffsetMs = 8 * 60 * 60 * 1000;
  const chinaTime = new Date(now.getTime() + chinaOffsetMs);
  return `${chinaTime.toISOString().slice(0, 19)}+08:00`;
}

export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function formatDate(iso: string): string {
  try {
    const date = parseISO(iso);
    if (isToday(date)) return '今天';
    if (isTomorrow(date)) return '明天';
    if (isYesterday(date)) return '昨天';
    return format(date, 'MM/dd', { locale: zhCN });
  } catch {
    return iso;
  }
}

export function isDueToday(iso?: string): boolean {
  if (!iso) return false;
  try {
    return isToday(parseISO(iso));
  } catch {
    return false;
  }
}

export function isOverdue(iso?: string): boolean {
  if (!iso) return false;
  try {
    const date = parseISO(iso);
    return date < new Date() && !isSameDay(date, new Date());
  } catch {
    return false;
  }
}

export function isDueThisWeek(iso?: string): boolean {
  if (!iso) return false;
  try {
    const date = parseISO(iso);
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  } catch {
    return false;
  }
}

export function durationDays(from: string, to: string): string {
  try {
    const start = parseISO(from);
    const end = parseISO(to);
    const days = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    return `${days}d`;
  } catch {
    return '';
  }
}
