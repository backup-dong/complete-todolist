import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, CornerDownRight, X } from 'lucide-react';
import type { Task } from '@/types';
import {
  dateIsInMonth,
  getMonthGrid,
  groupTasksByDay,
  isOverdueDay,
} from '@/utils/calendar';
import { useHolidayStore } from '@/stores/holidayStore';
import { todayIso } from '@/utils/date';

const PRIORITY_STYLE: Record<Task['meta']['priority'], { dot: string }> = {
  high: { dot: 'bg-red-500' },
  med: { dot: 'bg-yellow-400' },
  low: { dot: 'bg-blue-500' },
};

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function DayTaskRow({
  task,
  dayIso,
  onSelect,
}: {
  task: Task;
  dayIso: string;
  onSelect: (taskId: string) => void;
}) {
  const done = task.meta.status === 'done';
  const overdue = isOverdueDay(dayIso, done, todayIso());
  const style = PRIORITY_STYLE[task.meta.priority];

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(task.id);
      }}
      title={`${task.title}${task.parentId ? '\uff08子任务\uff09' : ''}${task.sourceList ? `\uff08${task.sourceList}\uff09` : ''}`}
      className={[
        'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
        done
          ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
          : overdue
            ? 'font-medium text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-danger)]'
            : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]',
      ].join(' ')}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${done ? 'bg-[var(--color-text-muted)]' : style.dot}`} />
      <span className={`min-w-0 flex-1 truncate ${done ? 'line-through' : ''}`}>{task.title}</span>
      {task.parentId && (
        <CornerDownRight
          className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
          aria-label="子任务"
        />
      )}
      {task.sourceList && (
        <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">{task.sourceList}</span>
      )}
    </button>
  );
}

function DayBlock({
  date,
  year,
  month,
  tasks,
  holidayLabels,
  onSelect,
}: {
  date: Date;
  year: number;
  month: number;
  tasks: Task[];
  holidayLabels: Record<string, string>;
  onSelect: (taskId: string) => void;
}) {
  const inMonth = dateIsInMonth(date, year, month);
  const today = isToday(date);
  const dayIso = format(date, 'yyyy-MM-dd');
  const holidayLabel = holidayLabels[dayIso];
  const isWorkday = holidayLabel === '班';

  return (
    <div
      data-day-iso={dayIso}
      className={[
        'border-b border-[var(--color-border-subtle)] px-3 py-2',
        !inMonth ? 'opacity-40' : '',
      ].join(' ')}
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className={[
            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
            today
              ? 'bg-[var(--color-primary)] font-semibold text-[var(--color-text-inverse)]'
              : 'text-[var(--color-text-secondary)]',
          ].join(' ')}
        >
          {format(date, 'd')}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          {format(date, 'M月d日')} {WEEKDAY_NAMES[date.getDay()]}
        </span>
        {holidayLabel && inMonth && (
          <span className={isWorkday ? 'text-[10px] text-[var(--color-warning)]' : 'text-[10px] text-[var(--color-danger)]'}>
            {holidayLabel}
          </span>
        )}
        {tasks.length > 0 && (
          <span className="ml-auto text-xs tabular-nums text-[var(--color-text-muted)]">{tasks.length} 项</span>
        )}
      </div>
      {tasks.length === 0 ? (
        inMonth ? (
          <p className="px-2 py-1 text-xs text-[var(--color-text-muted)]">当天无待办</p>
        ) : (
          <div className="px-2 py-1" />
        )
      ) : (
        <div className="flex flex-col gap-0.5">
          {tasks.map((task) => (
            <DayTaskRow key={task.id} task={task} dayIso={dayIso} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CalendarDrawer({
  onClose,
  tasks,
  onSelect,
}: {
  onClose: () => void;
  tasks: Task[];
  onSelect: (taskId: string) => void;
}) {
  const now = new Date();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const holidayLabels = useHolidayStore((s) => s.labels);
  const holidays = useHolidayStore((s) => s.holidays);
  const workdays = useHolidayStore((s) => s.workdays);

  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;

  // 打开时就定位到"今天"所在位置
  // 抽屉父容器宽度有 200ms 过渡，需等其完成后再滚动，否则布局尚未就绪
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const container = scrollRef.current;
      if (!container) return;
      const todayIso = format(now, 'yyyy-MM-dd');
      const el = container.querySelector<HTMLDivElement>(`[data-day-iso="${todayIso}"]`);
      if (!el) return;
      const targetTop = el.offsetTop - container.offsetTop;
      container.scrollTo({ top: Math.max(0, targetTop - 16), behavior: 'auto' });
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const byDay = useMemo(
    () => groupTasksByDay(tasks, year, month, holidays, todayIso(), workdays),
    [tasks, year, month, holidays, workdays],
  );

  const goPrev = () => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const goNext = () => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  const goToday = () => setCursor(new Date(now.getFullYear(), now.getMonth(), 1));

  return (
    <aside className="h-full w-96 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-raised)] flex">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={goPrev} aria-label="上个月" className="btn-ghost p-1.5">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7rem] text-center text-sm font-semibold text-[var(--color-text)]">
            {format(cursor, 'yyyy年M月')}
          </span>
          <button type="button" onClick={goNext} aria-label="下个月" className="btn-ghost p-1.5">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={goToday} className="btn-secondary px-2.5 py-1 text-xs">
            今天
          </button>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭日历" className="btn-ghost p-1.5">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {grid.map((date, i) => (
          <DayBlock
            key={i}
            date={date}
            year={year}
            month={month}
            tasks={byDay.get(format(date, 'yyyy-MM-dd')) ?? []}
            holidayLabels={holidayLabels}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  );
}
