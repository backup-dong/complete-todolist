import { useState } from 'react';
import {
  CalendarClock,
  Check,
  Link as LinkIcon,
  ListChecks,
  Repeat,
  Trash2,
} from 'lucide-react';
import type { Link, Subtask, Task } from '@/types';
import { formatDate, isDueToday, isOverdue } from '@/utils/date';

function useDueColor(due?: string, status?: Task['meta']['status']): string {
  if (!due) return '';
  if (status === 'done') return 'text-[var(--color-text-muted)]';
  if (isOverdue(due)) return 'text-[var(--color-danger)]';
  if (isDueToday(due)) return 'text-[var(--color-warning)]';
  return 'text-[var(--color-text-muted)]';
}

function PriorityBadge({ priority }: { priority: Task['meta']['priority'] }) {
  const variants: Record<Task['meta']['priority'], { label: string; className: string }> = {
    high: {
      label: '高',
      className: 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]',
    },
    med: {
      label: '中',
      className: 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
    },
    low: {
      label: '低',
      className: 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]',
    },
  };
  const { label, className } = variants[priority];
  return <span className={['badge', className].join(' ')}>{label}</span>;
}

function StatusIconContent({ status }: { status: Task['meta']['status'] }) {
  if (status === 'done') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-success)] text-white">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--color-warning)]">
        <span className="h-2 w-2 rounded-full bg-[var(--color-warning)]" />
      </span>
    );
  }
  return (
    <span className="h-5 w-5 rounded-full border-2 border-[var(--color-text-muted)] hover:border-[var(--color-primary)]" />
  );
}

function StatusIcon({
  status,
  onClick,
}: {
  status: Task['meta']['status'];
  onClick?: () => void;
}) {
  const baseClass =
    'flex h-5 w-5 items-center justify-center rounded-full transition-colors duration-100';
  const content = <StatusIconContent status={status} />;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        data-testid="status-icon"
        className={`${baseClass} cursor-pointer hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] rounded-full`}
        aria-label="完成任务"
      >
        {content}
      </button>
    );
  }

  return <span className={baseClass}>{content}</span>;
}

function TaskLinks({
  links,
  className,
  compact,
}: {
  links?: Link[];
  className?: string;
  compact?: boolean;
}) {
  if (!links?.length) return null;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={
        className ??
        (compact
          ? 'flex flex-wrap items-center gap-1.5'
          : 'mt-2 flex flex-wrap items-center gap-2')
      }
    >
      {links.map((link, i) => (
        <a
          key={i}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={[
            'inline-flex min-w-0 max-w-[160px] items-center gap-1 rounded-md bg-[var(--color-primary-subtle)] font-medium text-[var(--color-primary)] hover:underline',
            compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
          ].join(' ')}
          title={link.url}
        >
          <LinkIcon className={compact ? 'h-2.5 w-2.5 shrink-0' : 'h-3 w-3 shrink-0'} />
          <span className="truncate">{link.title || '链接'}</span>
        </a>
      ))}
    </div>
  );
}

function SubtaskItem({
  subtask,
  path,
  onToggle,
  depth,
}: {
  subtask: Subtask;
  path: number[];
  onToggle: (path: number[]) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  const checkboxClass =
    'mt-0.5 h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)] focus:ring-[var(--color-border-focus)]';

  return (
    <div style={{ marginLeft: depth * 16 }} className="mt-1">
      <label
        onClick={(e) => e.stopPropagation()}
        className="flex cursor-pointer items-start gap-2 text-sm text-[var(--color-text-secondary)]"
      >
        <input
          type="checkbox"
          checked={subtask.completed}
          onChange={() => onToggle(path)}
          className={checkboxClass}
        />
        <span className={subtask.completed ? 'line-through opacity-60' : ''}>{subtask.text}</span>
      </label>

      <TaskLinks links={subtask.links} compact className="mt-1 flex flex-wrap items-center gap-1.5 pl-6" />

      {subtask.children.length > 0 && (
        <>
          {expanded ? (
            subtask.children.map((child, i) => (
              <SubtaskItem
                key={i}
                subtask={child}
                path={[...path, i]}
                onToggle={onToggle}
                depth={depth + 1}
              />
            ))
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              className="mt-1 text-xs text-[var(--color-primary)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] rounded"
            >
              展开 {subtask.children.length} 个子任务
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function TaskCard({
  task,
  selected,
  selectable,
  onToggleSelect,
  onToggle,
  onStartEdit,
  onDelete,
  onComplete,
}: {
  task: Task;
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: () => void;
  onToggle: (path: number[]) => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onComplete?: () => void;
}) {
  const dueColor = useDueColor(task.meta.due, task.meta.status);

  const progress =
    task.subtasks.length > 0
      ? `${task.subtasks.filter((s) => s.completed).length}/${task.subtasks.length}`
      : '';

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, label, [role="button"]')) return;
    onStartEdit();
  };

  return (
    <div
      onClick={handleCardClick}
      className={[
        'group relative cursor-pointer rounded-lg border p-3 shadow-sm transition-all duration-150 ease-out hover:shadow-md md:p-4',
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-subtle)]'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-surface)] hover:border-[var(--color-border)]',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {selectable ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect?.();
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-5 w-5 rounded border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)] focus:ring-[var(--color-border-focus)]"
              aria-label="选择任务"
              data-testid="select-task"
            />
          ) : (
            <StatusIcon status={task.meta.status} onClick={task.subtasks.length === 0 ? onComplete : undefined} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            className="text-left text-base font-medium text-[var(--color-text)] hover:text-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] rounded"
          >
            {task.title}
          </button>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <PriorityBadge priority={task.meta.priority} />
            {task.meta.due && (
              <span className={`inline-flex items-center gap-1 ${dueColor}`}>
                <CalendarClock className="h-3.5 w-3.5" />
                {formatDate(task.meta.due)}
              </span>
            )}
            {task.meta.repeat && (
              <span className="inline-flex items-center gap-1 text-[var(--color-text-muted)]">
                <Repeat className="h-3.5 w-3.5" />
                {task.meta.repeat}
              </span>
            )}
            {progress && (
              <span className="inline-flex items-center gap-1 text-[var(--color-text-muted)]">
                <ListChecks className="h-3.5 w-3.5" />
                {progress}
              </span>
            )}
          </div>

          <TaskLinks links={task.links} />

          {task.subtasks.length > 0 && (
            <div className="mt-3 border-t border-[var(--color-border-subtle)] pt-3">
              {task.subtasks.slice(0, 3).map((s, i) => (
                <SubtaskItem key={i} subtask={s} path={[i]} onToggle={onToggle} depth={0} />
              ))}
              {task.subtasks.length > 3 && (
                <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                  +{task.subtasks.length - 3} 个子任务...
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDelete}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid="delete-task"
          aria-label="删除任务"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] opacity-0 transition-opacity duration-100 hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger)] focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
