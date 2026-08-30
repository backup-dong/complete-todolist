import { getJson, setJson } from './storage';

const CACHE_KEY = 'dong-todo:holidays';

export interface HolidayEntry {
  date: string;
  name: string;
  type: 'holiday' | 'workday';
}

export interface HolidayCache {
  fetchedAt: string;
  entries: HolidayEntry[];
}

interface ApiResponse {
  code: number;
  msg: string;
  data: HolidayEntry[];
}

export function loadCachedHolidays(): HolidayCache | null {
  const raw = getJson<unknown>(CACHE_KEY, null);
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<HolidayCache>;
  if (
    typeof candidate.fetchedAt !== 'string' ||
    !Array.isArray(candidate.entries) ||
    !candidate.entries.every(
      (e) => e && typeof e.date === 'string' && typeof e.name === 'string' && (e.type === 'holiday' || e.type === 'workday'),
    )
  ) {
    return null;
  }
  return { fetchedAt: candidate.fetchedAt, entries: candidate.entries as HolidayEntry[] };
}

export function cacheHolidays(cache: HolidayCache): void {
  setJson(CACHE_KEY, cache);
}

export async function fetchChinaHolidays(year: number): Promise<HolidayEntry[]> {
  const res = await fetch(`https://api.apisbo.com/holidays/year/${year}`);
  if (!res.ok) {
    throw new Error(`holiday API returned ${res.status} for ${year}`);
  }
  const body = (await res.json()) as ApiResponse;
  if (body.code !== 0 || !Array.isArray(body.data)) {
    throw new Error(`holiday API error: ${body.msg ?? 'invalid response'}`);
  }
  return body.data.filter((h) => h && h.date && (h.type === 'holiday' || h.type === 'workday'));
}

/** 日历标注：节假日日期 -> 「假(节日名)」，调休上班日 -> 「班」 */
export function buildHolidayLabels(entries: HolidayEntry[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const e of entries) {
    if (e.type === 'holiday') {
      labels[e.date] = `假(${e.name})`;
    } else {
      labels[e.date] = '班';
    }
  }
  return labels;
}