import { create } from 'zustand';
import { format } from 'date-fns';
import {
  cacheHolidays,
  fetchPublicHolidays,
  loadCachedHolidays,
  loadHolidayConfig,
  saveHolidayConfig,
} from '@/utils/holidays';

interface HolidayStore {
  country: string;
  holidays: string[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  setCountry: (country: string) => void;
  loadHolidays: () => Promise<void>;
  isHoliday: (date: Date | string) => boolean;
}

const cfg = loadHolidayConfig();
const cached = loadCachedHolidays();

export const useHolidayStore = create<HolidayStore>((set, get) => ({
  country: cfg.country,
  holidays: cached,
  status: cached.length > 0 ? 'ready' : 'idle',

  setCountry: (country) => {
    const code = country.trim().toUpperCase();
    saveHolidayConfig({ country: code });
    set({ country: code, holidays: [], status: 'idle' });
    get().loadHolidays();
  },

  loadHolidays: async () => {
    const { country, status } = get();
    if (!country || status === 'loading') return;
    set({ status: 'loading' });
    try {
      const dates = await fetchPublicHolidays(country);
      cacheHolidays(dates);
      set({ holidays: dates, status: 'ready' });
    } catch (err) {
      console.error('loadHolidays failed', err);
      set({ status: 'error' });
    }
  },

  isHoliday: (date) => {
    const iso = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
    return get().holidays.includes(iso);
  },
}));
