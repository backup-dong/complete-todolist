import { create } from 'zustand';
import {
  buildHolidayLabels,
  cacheHolidays,
  fetchChinaHolidays,
  loadCachedHolidays,
  type HolidayEntry,
} from '@/utils/holidays';
import { todayIso } from '@/utils/date';

interface HolidayStore {
  entries: HolidayEntry[];
  /** type === 'holiday' 的日期，供重复任务跳过节假日 */
  holidays: string[];
  /** type === 'workday' 的日期（调休上班日），供重复任务把调休周末当工作日 */
  workdays: string[];
  /** 日历标注：日期 -> 「假(节日名)」/「班」 */
  labels: Record<string, string>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  loadHolidays: () => Promise<void>;
}

function derive(entries: HolidayEntry[], labels: Record<string, string>) {
  return {
    entries,
    labels,
    holidays: entries.filter((e) => e.type === 'holiday').map((e) => e.date),
    workdays: entries.filter((e) => e.type === 'workday').map((e) => e.date),
  };
}

const cached = loadCachedHolidays();
const cachedReady = cached ? derive(cached.entries, buildHolidayLabels(cached.entries)) : null;

export const useHolidayStore = create<HolidayStore>((set, get) => ({
  entries: cachedReady?.entries ?? [],
  holidays: cachedReady?.holidays ?? [],
  workdays: cachedReady?.workdays ?? [],
  labels: cachedReady?.labels ?? {},
  status: cachedReady ? 'ready' : 'idle',

  loadHolidays: async () => {
    const { status } = get();
    if (status === 'loading') return;
    set({ status: 'loading' });
    try {
      const entries = await fetchChinaHolidays(new Date().getFullYear());
      const labels = buildHolidayLabels(entries);
      cacheHolidays({ fetchedAt: todayIso(), entries });
      set({ ...derive(entries, labels), status: 'ready' });
    } catch (err) {
      console.error('loadHolidays failed', err);
      set({ status: 'error' });
    }
  },
}));

// 仅在当天第一次打开应用时更新：当日缓存已存在则直接用缓存，否则后台拉取
const fetchedToday = cached?.fetchedAt === todayIso();
if (!fetchedToday) {
  void useHolidayStore.getState().loadHolidays();
}