import { Search, ChevronDown, GripVertical, CalendarArrowDown, ArrowUpDown } from 'lucide-react';
import type { FilterState, SortMode } from '@/types';

export function SearchBar({
  value,
  onChange,
  placeholder = '搜索任务...',
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input w-full py-2 pl-9 pr-3"
      />
    </div>
  );
}

function StyledSelect({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="select appearance-none pr-8 py-1.5 text-xs"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
    </div>
  );
}

export function FilterDropdown({ filter, onChange }: { filter: FilterState; onChange: (f: FilterState) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <StyledSelect
        value={filter.status}
        onChange={(v) => onChange({ ...filter, status: v as FilterState['status'] })}
        ariaLabel="状态过滤"
      >
        <option value="all">全部状态</option>
        <option value="pending">待处理</option>
        <option value="active">进行中</option>
        <option value="done">已完成</option>
      </StyledSelect>

      <StyledSelect
        value={filter.priority}
        onChange={(v) => onChange({ ...filter, priority: v as FilterState['priority'] })}
        ariaLabel="优先级过滤"
      >
        <option value="all">全部优先级</option>
        <option value="high">高</option>
        <option value="med">中</option>
        <option value="low">低</option>
      </StyledSelect>

      <StyledSelect
        value={filter.timeRange}
        onChange={(v) => onChange({ ...filter, timeRange: v as FilterState['timeRange'] })}
        ariaLabel="时间范围过滤"
      >
        <option value="all">全部时间</option>
        <option value="today">今天到期</option>
        <option value="week">本周到期</option>
        <option value="overdue">已逾期</option>
      </StyledSelect>
    </div>
  );
}

export function ViewToggle({ mode, onChange }: { mode: SortMode; onChange: (mode: SortMode) => void }) {
  const modes: { key: SortMode; label: string; icon: React.ReactNode }[] = [
    { key: 'drag', label: '拖拽', icon: <GripVertical className="h-3.5 w-3.5" /> },
    { key: 'due', label: '截止', icon: <CalendarArrowDown className="h-3.5 w-3.5" /> },
    { key: 'priority', label: '优先级', icon: <ArrowUpDown className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
      {modes.map((m) => {
        const active = mode === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            title={m.label}
            aria-pressed={active}
            className={[
              'inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors duration-100',
              active
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]',
            ].join(' ')}
          >
            {m.icon}
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
