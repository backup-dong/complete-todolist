import { useMemo, useState } from 'react';
import { format, isSameWeek, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Task } from '@/types';
import { dateIsInMonth, getMonthGrid, groupTasksByDay, isOverdueDay } from '@/utils/calendar';
import { useHolidayStore } from '@/stores/holidayStore';
import { todayIso } from '@/utils/date';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const MAX_CHIPS_PER_DAY = 3;

const PRIORITY_STYLE: Record<Task['meta']['priority'], { bar: string; dot: string }> = {
  high: { bar: 'border-l-red-500', dot: 'bg-red-500' },
  med: { bar: 'border-l-yellow-400', dot: 'bg-yellow-400' },
  low: { bar: 'border-l-blue-500', dot: 'bg-blue-500' },
};

function TaskChip({
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
      title={`${task.title}${task.sourceList ? `（${task.sourceList}）` : ''}`}
      className={[
        'flex w-full min-w-0 items-center gap-1.5 rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors',
        done
          ? 'border-l-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] opacity-60 hover:opacity-90'
          : overdue
            ? 'border-l-[var(--color-danger)] bg-[var(--color-danger-subtle)] font-medium text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
            : `${style.bar} bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]`,
      ].join(' ')}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? 'bg-[var(--color-text-muted)]' : style.dot}`} />
      <span className={`truncate ${done ? 'line-through' : ''}`}>{task.title}</span>
    </button>
  );
}

function DayCell({
  date,
  year,
  month,
  tasks,
  holidays,
  onSelect,
  onShowAll,
}: {
  date: Date;
  year: number;
  month: number;
  tasks: Task[];
  holidays: string[];
  onSelect: (taskId: string) => void;
  onShowAll: (dayIso: string) => void;
}) {
  const inMonth = dateIsInMonth(date, year, month);
  const today = isToday(date);
  const currentWeek = isSameWeek(date, new Date(), { weekStartsOn: 1 });
  const dayIso = format(date, 'yyyy-MM-dd');
  const holiday = holidays.includes(dayIso);
  const overflow = tasks.length - MAX_CHIPS_PER_DAY;

  return (
    <div
      className={[
        'relative flex min-h-[84px] flex-col border-b border-l border-[var(--color-border-subtle)] p-1',
        !inMonth
          ? 'bg-[var(--color-bg)]'
          : currentWeek
            ? 'bg-[var(--color-primary-subtle)]'
            : 'bg-[var(--color-surface)]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => tasks.length > 0 && onShowAll(dayIso)}
          title={tasks.length > 0 ? `查看 ${format(date, 'M月d日')} 的全部待办` : undefined}
          className={[
            'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums transition-colors',
            today
              ? 'bg-[var(--color-primary)] font-semibold text-[var(--color-text-inverse)]'
              : inMonth
                ? 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                : 'text-[var(--color-text-muted)] opacity-50',
            tasks.length > 0 && 'cursor-pointer',
          ].join(' ')}
        >
          {format(date, 'd')}
        </button>
        {holiday && inMonth && (
          <span className="text-[9px] text-[var(--color-danger)]">节</span>
        )}
      </div>

      <div className="mt-0.5 flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
        {tasks.slice(0, MAX_CHIPS_PER_DAY).map((task) => (
          <TaskChip key={task.id} task={task} dayIso={dayIso} onSelect={onSelect} />
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => onShowAll(dayIso)}
            title="查看当天全部待办"
            className="self-start px-1 text-[10px] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary)]"
          >
            +{overflow} 件
          </button>
        )}
      </div>
    </div>
  );
}

function DayTasksDialog({
  dayIso,
  tasks,
  onSelect,
  onClose,
}: {
  dayIso: string | null;
  tasks: Task[];
  onSelect: (taskId: string) => void;
  onClose: () => void;
}) {
  const enabled = dayIso !== null;
  const date = dayIso ? new Date(`${dayIso}T00:00:00`) : new Date();
  const doneCount = tasks.filter((t) => t.meta.status === 'done').length;

  return (
    <Dialog.Root open={enabled} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-backdrop)] backdrop-blur-sm" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Dialog.Content className="pointer-events-auto z-50 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg outline-none">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
              <Dialog.Title className="text-sm font-semibold text-[var(--color-text)]">
                {format(date, 'M月d日 EEEE')} · 待办 {tasks.length} 件
                {doneCount > 0 && <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">（已完成 {doneCount}）</span>}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label="关闭" className="btn-ghost p-1">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {tasks.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-[var(--color-text-muted)]">当天暂无待办</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {tasks.map((task) => {
                    const done = task.meta.status === 'done';
                    const style = PRIORITY_STYLE[task.meta.priority];
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => {
                          onSelect(task.id);
                          onClose();
                        }}
                        className={[
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                          done
                            ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
                            : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]',
                        ].join(' ')}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${done ? 'bg-[var(--color-text-muted)]' : style.dot}`} />
                        <span className={`min-w-0 flex-1 truncate ${done ? 'line-through' : ''}`}>{task.title}</span>
                        {task.sourceList && (
                          <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">{task.sourceList}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CalendarView({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (taskId: string) => void;
}) {
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [listFilter, setListFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [dayPopup, setDayPopup] = useState<string | null>(null);
  const holidays = useHolidayStore((s) => s.holidays);

  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;

  const lists = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.sourceList).filter(Boolean))).sort() as string[],
    [tasks],
  );

  const groups = useMemo(() => {
    if (!listFilter) return [];
    return Array.from(new Set(tasks.filter((t) => t.sourceList === listFilter).map((t) => t.group).filter(Boolean))).sort();
  }, [tasks, listFilter]);

  const filteredTasks = useMemo(() => {
    if (!listFilter && !groupFilter) return tasks;
    return tasks.filter(
      (t) => (!listFilter || t.sourceList === listFilter) && (!groupFilter || t.group === groupFilter),
    );
  }, [tasks, listFilter, groupFilter]);

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const byDay = useMemo(
    () => groupTasksByDay(filteredTasks, year, month, holidays),
    [filteredTasks, year, month, holidays],
  );

  const goPrev = () => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const goNext = () => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  const goToday = () => setCursor(new Date(now.getFullYear(), now.getMonth(), 1));

  const handleListChange = (value: string) => {
    setListFilter(value);
    setGroupFilter('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            aria-label="上个月"
            className="btn-ghost p-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7rem] text-center text-sm font-semibold text-[var(--color-text)]">
            {format(cursor, 'yyyy年M月')}
          </span>
          <button
            type="button"
            onClick={goNext}
            aria-label="下个月"
            className="btn-ghost p-1.5"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={listFilter}
            onChange={(e) => handleListChange(e.target.value)}
            className="select h-8 w-auto py-0 text-xs"
            aria-label="按清单筛选"
          >
            <option value="">全部清单</option>
            {lists.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="select h-8 w-auto py-0 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="按分组筛选"
            disabled={!listFilter}
            title={listFilter ? undefined : '请先选择清单'}
          >
            <option value="">{listFilter ? '全部分组' : '选择清单后筛选'}</option>
            {groups.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" onClick={goToday} className="btn-secondary px-3 py-1 text-xs">
            今天
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-r border-[var(--color-border-subtle)]">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={[
              'border-b border-[var(--color-border-subtle)] py-1.5 text-center text-xs font-medium',
              i >= 5 ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-secondary)]',
            ].join(' ')}
          >
            {label}
          </div>
        ))}
        {grid.map((date, i) => (
          <DayCell
            key={i}
            date={date}
            year={year}
            month={month}
            tasks={byDay.get(format(date, 'yyyy-MM-dd')) ?? []}
            holidays={holidays}
            onSelect={onSelect}
            onShowAll={setDayPopup}
          />
        ))}
      </div>

      <DayTasksDialog
        dayIso={dayPopup}
        tasks={dayPopup ? byDay.get(dayPopup) ?? [] : []}
        onSelect={onSelect}
        onClose={() => setDayPopup(null)}
      />
    </div>
  );
}
