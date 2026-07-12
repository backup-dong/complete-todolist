import { useState } from 'react';
import { Search, ChevronDown, GripVertical, CalendarArrowDown, ArrowUpDown, Check, X, Filter } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { FilterState, SortMode, TaskStatus } from '@/types';

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

function StatusFilterDropdown({
  value,
  onChange,
}: {
  value: TaskStatus[];
  onChange: (value: TaskStatus[]) => void;
}) {
  const options: { value: TaskStatus; label: string }[] = [
    { value: 'pending', label: '待处理' },
    { value: 'active', label: '进行中' },
    { value: 'done', label: '已完成' },
  ];

  const toggle = (v: TaskStatus) => {
    onChange(value.includes(v) ? value.filter((s) => s !== v) : [...value, v]);
  };

  const label = value.length === 0 ? '全部状态' : value.map((v) => options.find((o) => o.value === v)?.label).join(' + ');

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="relative inline-flex min-w-[120px] items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 pr-8 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
          aria-label="状态过滤"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[140px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-md"
          sideOffset={4}
        >
          {options.map((opt) => (
            <DropdownMenu.CheckboxItem
              key={opt.value}
              checked={value.includes(opt.value)}
              onCheckedChange={() => toggle(opt.value)}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-[var(--color-text)] outline-none hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] focus:outline-none"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)]">
                <DropdownMenu.ItemIndicator>
                  <Check className="h-3.5 w-3.5" />
                </DropdownMenu.ItemIndicator>
              </span>
              {opt.label}
            </DropdownMenu.CheckboxItem>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--color-border)]" />
          <DropdownMenu.Item
            disabled={value.length === 0}
            onSelect={() => onChange([])}
            className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm text-[var(--color-text)] outline-none hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            清除选择
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function FilterDropdown({
  filter,
  onChange,
  onClear,
  clearActive,
}: {
  filter: FilterState;
  onChange: (f: FilterState) => void;
  onClear?: () => void;
  clearActive?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusFilterDropdown
        value={filter.status}
        onChange={(status) => onChange({ ...filter, status })}
      />

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

      {onClear && clearActive && (
        <button
          type="button"
          onClick={onClear}
          className="btn-secondary flex shrink-0 items-center gap-1.5 py-1.5 text-xs"
        >
          <X className="h-3.5 w-3.5" />
          清除筛选
        </button>
      )}
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
                ? 'bg-[var(--color-primary)] text-[var(--color-text-inverse)]'
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

export function MobileFilterPanel({
  filter,
  onChange,
  onClear,
  clearActive,
}: {
  filter: FilterState;
  onChange: (f: FilterState) => void;
  onClear?: () => void;
  clearActive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const activeCount =
    filter.status.length +
    (filter.priority !== 'all' ? 1 : 0) +
    (filter.timeRange !== 'all' ? 1 : 0);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={[
          'btn-secondary flex items-center gap-1.5 py-1.5 text-xs',
          open ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : '',
        ].join(' ').trim()}
      >
        <Filter className="h-3.5 w-3.5" />
        筛选
        {activeCount > 0 && (
          <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[10px] font-medium text-[var(--color-text-inverse)]">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <FilterDropdown
            filter={filter}
            onChange={onChange}
            onClear={onClear}
            clearActive={clearActive}
          />
        </div>
      )}
    </div>
  );
}
