import { getJson, setJson } from './storage';

const CACHE_KEY = 'dong-todo:holidays';
const CONFIG_KEY = 'dong-todo:holiday-config';

export interface HolidayConfig {
  country: string;
}

export interface NagerHoliday {
  date: string;
  name: string;
}

export function loadHolidayConfig(): HolidayConfig {
  return getJson<HolidayConfig>(CONFIG_KEY, { country: 'CN' });
}

export function saveHolidayConfig(config: HolidayConfig): void {
  setJson(CONFIG_KEY, config);
}

export function loadCachedHolidays(): string[] {
  return getJson<string[]>(CACHE_KEY, []);
}

export function cacheHolidays(dates: string[]): void {
  setJson(CACHE_KEY, dates);
}

export async function fetchPublicHolidays(country: string): Promise<string[]> {
  const code = country.toUpperCase();
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1];
  const all: string[] = [];

  for (const year of years) {
    const res = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/${code}`);
    if (!res.ok) {
      throw new Error(`holiday API returned ${res.status} for ${year}/${code}`);
    }
    const data = (await res.json()) as NagerHoliday[];
    for (const h of data) {
      if (h.date) all.push(h.date);
    }
  }

  return [...new Set(all)].sort();
}
