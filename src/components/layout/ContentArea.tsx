import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Inbox, ListChecks, Menu, Plus, X } from 'lucide-react';
import { useListsStore } from '@/stores/listsStore';
import { useTasksStore } from '@/stores/tasksStore';
import { confirm } from '@/stores/confirmStore';
import type { Task, TodoViewKey } from '@/types';
import { copyWeeklyReport } from '@/utils/report';
import { SearchBar, FilterDropdown, ViewToggle, MobileFilterPanel } from '../tasks/Toolbar';
import { TaskList } from '../tasks/TaskList';
import { TaskEditorDialog } from '../tasks/TaskEditorDialog';
import { ConflictBanner } from './ConflictBanner';
import { TodoView } from '@/components/todo-view/TodoView';

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-20 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] shadow-[var(--shadow-inset)]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            pct === 100 ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary)]'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums font-medium text-[var(--color-text-secondary)]">
        {done}/{total}
      </span>
    </div>
  );
}

function MobileHeader({
  title,
  done,
  total,
  showProgress = true,
  onOpenMenu,
}: {
  title: string;
  done: number;
  total: number;
  showProgress?: boolean;
  onOpenMenu: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3 pt-[env(safe-area-inset-top)] md:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        className="btn-ghost p-1.5"
        aria-label="打开导航"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-2">
        <h1 className="truncate text-base font-semibold text-[var(--color-text)]">{title}</h1>
        {showProgress && total > 0 && <ProgressBar done={done} total={total} />}
      </div>
      <div className="w-9" />
    </div>
  );
}

function ListHeader({
  title,
  done,
  total,
  activeGroup,
  onCopyWeeklyReport,
  sortMode,
  onSortModeChange,
  batchMode,
  onToggleBatchMode,
}: {
  title: string;
  done: number;
  total: number;
  activeGroup: string | null;
  onCopyWeeklyReport: () => void;
  sortMode: 'drag' | 'due' | 'priority';
  onSortModeChange: (mode: 'drag' | 'due' | 'priority') => void;
  batchMode: boolean;
  onToggleBatchMode: () => void;
}) {
  return (
    <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="hidden items-center gap-3 md:flex">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">{title}</h1>
        {total > 0 && <ProgressBar done={done} total={total} />}
        {activeGroup && (
          <span className="rounded-full bg-[var(--color-primary-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-primary)]">
            {activeGroup}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pb-1 md:pb-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCopyWeeklyReport}
            className="btn-secondary flex shrink-0 items-center gap-1.5 py-1.5 text-xs"
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">导出周报</span>
            <span className="sm:hidden">周报</span>
          </button>
          <button
            type="button"
            onClick={onToggleBatchMode}
            title={batchMode ? '退出批量选择' : '批量选择'}
            className={[
              'btn-secondary flex shrink-0 items-center gap-1.5 py-1.5 text-xs',
              batchMode ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : '',
            ].join(' ')}
            aria-pressed={batchMode}
          >
            <ListChecks className="h-3.5 w-3.5" />
            {batchMode ? '退出' : '批量'}
          </button>
        </div>
        <ViewToggle mode={sortMode} onChange={onSortModeChange} />
      </div>
    </div>
  );
}

function NewTaskBar({
  groupLabel,
  title,
  onTitleChange,
  onCreate,
}: {
  groupLabel: string;
  title: string;
  onTitleChange: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCreate();
          }
        }}
        placeholder={`在 ${groupLabel} 中新建任务...`}
        className="input flex-1"
      />
      <button
        type="button"
        onClick={onCreate}
        className="btn-primary px-3"
        aria-label="新建任务"
      >
        <Plus className="h-4 w-4 md:mr-1" />
        <span className="hidden md:inline">新建</span>
      </button>
    </div>
  );
}

function BatchActionBar({
  count,
  onDelete,
  onCancel,
}: {
  count: number;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:z-auto md:border-t-0 md:bg-transparent md:p-0 md:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--color-text-secondary)]">
          已选 <strong className="text-[var(--color-text)]">{count}</strong> 项
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={count === 0}
            className="btn-danger flex items-center gap-1.5 py-1.5 text-xs"
          >
            <ListChecks className="h-3.5 w-3.5" />
            删除 {count} 项
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary flex items-center gap-1.5 py-1.5 text-xs"
          >
            <X className="h-3.5 w-3.5" />
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContentArea({ onOpenMenu }: { onOpenMenu?: () => void } = {}) {
  const { activeListName, activeGroup, fileCache } = useListsStore();
  const {
    sortMode,
    filter,
    searchQuery,
    selectedTaskId,
    todoView,
    setSortMode,
    setFilter,
    setSearchQuery,
    clearFilters,
    toggleSubtask,
    deleteTask,
    deleteTasks,
    reorderTasks,
    reorderTasksInGroup,
    selectTask,
    updateTask,
    createTask,
    getFilteredTasks,
  } = useTasksStore();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const taskListScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlightedTaskId) return;
    const timer = window.setTimeout(() => setHighlightedTaskId(null), 1500);
    return () => window.clearTimeout(timer);
  }, [highlightedTaskId]);

  const todoViewTitles: Record<TodoViewKey, string> = {
    today: '今天',
    week: '本周',
    all: '全部',
    high: '高优先级',
  };

  const activeList = activeListName ? fileCache[activeListName] : null;
  const groups = useMemo(() => {
    if (todoView && selectedTaskId) {
      const selectedTask = getFilteredTasks().find((t) => t.id === selectedTaskId);
      if (selectedTask?.sourceList) {
        return fileCache[selectedTask.sourceList]?.groups.map((g) => g.name) ?? [];
      }
    }
    return activeList?.groups.map((g) => g.name) ?? [];
  }, [activeList, fileCache, getFilteredTasks, selectedTaskId, todoView]);
  const allTasks = useMemo(() => {
    if (todoView) return getFilteredTasks();
    return activeList?.groups.flatMap((g) => g.tasks) ?? [];
  }, [activeList, getFilteredTasks, todoView]);
  const doneCount = todoView ? 0 : allTasks.filter((t) => t.meta.status === 'done').length;
  const totalCount = allTasks.length;

  const effectiveNewTaskGroup = activeGroup ?? groups[0] ?? '默认分组';

  const filtered = getFilteredTasks();
  const displayTasks = todoView
    ? filtered
    : activeGroup
      ? filtered.filter((t) => t.group === activeGroup)
      : filtered;

  const selectedTask = displayTasks.find((t) => t.id === selectedTaskId) ?? null;

  const handleCreateTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    const id = await createTask(title, effectiveNewTaskGroup);
    setNewTaskTitle('');
    if (!id) return;

    window.setTimeout(() => {
      const el = document.querySelector(`[data-task-id="${id}"]`);
      const container = taskListScrollRef.current;
      if (!el || !container) {
        setHighlightedTaskId(id);
        return;
      }

      // 先滚动到任务位置，等任务进入视野后再高亮
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            observer.disconnect();
            setHighlightedTaskId(id);
          }
        },
        { root: container, threshold: 0.5 },
      );
      observer.observe(el);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // 兜底：滚动极短或 observer 未触发时仍要高亮
      window.setTimeout(() => {
        observer.disconnect();
        setHighlightedTaskId(id);
      }, 500);
    }, 0);
  };

  const handleSaveTask = (updated: Task) => {
    updateTask(updated.id, updated);
  };

  const handleCompleteTask = async (id: string) => {
    const task = displayTasks.find((t) => t.id === id);
    if (!task) return;
    if (task.meta.status === 'done') {
      await updateTask(id, { meta: { status: 'pending' } });
    } else {
      await useTasksStore.getState().completeTaskWithoutSubtasks(id);
    }
  };

  const toggleSelectedId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleBatchMode = () => {
    setBatchMode((v) => !v);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (await confirm(`确定删除选中的 ${selectedIds.size} 个任务？`)) {
      await deleteTasks(Array.from(selectedIds));
      setBatchMode(false);
      setSelectedIds(new Set());
    }
  };

  if (!activeListName && !todoView) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center text-[var(--color-text-muted)]">
        <Inbox className="mb-4 h-12 w-12" strokeWidth={1.5} />
        <p className="text-base font-medium text-[var(--color-text-secondary)]">还没有选择清单</p>
        <p className="text-sm">在左侧选择一个清单，或新建一个清单</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col">
        <MobileHeader
          title={todoView ? todoViewTitles[todoView] : activeListName ?? ''}
          done={doneCount}
          total={totalCount}
          showProgress={!todoView}
          onOpenMenu={onOpenMenu ?? (() => {})}
        />

        <ConflictBanner />

        {todoView ? (
          <>
            <div className="hidden md:block border-b border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">
                {todoViewTitles[todoView]}
              </h1>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TodoView
                tasks={displayTasks}
                onToggle={toggleSubtask}
                onSelect={selectTask}
                onDelete={async (id) => {
                  if (await confirm('确定删除该任务？')) deleteTask(id);
                }}
                onComplete={(id) => void useTasksStore.getState().completeTaskWithoutSubtasks(id)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <ListHeader
                title={activeListName ?? ''}
                done={doneCount}
                total={totalCount}
                activeGroup={activeGroup}
                onCopyWeeklyReport={() => {
                  if (activeList) {
                    copyWeeklyReport(activeListName!, activeList);
                  }
                }}
                sortMode={sortMode}
                onSortModeChange={setSortMode}
                batchMode={batchMode}
                onToggleBatchMode={handleToggleBatchMode}
              />
              <div className="flex flex-col gap-3">
                <SearchBar value={searchQuery} onChange={setSearchQuery} />
                <div className="hidden md:block">
                  <FilterDropdown
                    filter={filter}
                    onChange={setFilter}
                    onClear={clearFilters}
                    clearActive={
                      filter.status.length > 0 ||
                      filter.priority !== 'all' ||
                      filter.timeRange !== 'all' ||
                      !!searchQuery
                    }
                  />
                </div>
                <div className="md:hidden">
                  <MobileFilterPanel
                    filter={filter}
                    onChange={setFilter}
                    onClear={clearFilters}
                    clearActive={
                      filter.status.length > 0 ||
                      filter.priority !== 'all' ||
                      filter.timeRange !== 'all' ||
                      !!searchQuery
                    }
                  />
                </div>
              </div>
            </div>

            <div
              ref={taskListScrollRef}
              className={`flex-1 overflow-y-auto ${batchMode ? 'pb-20 md:pb-0' : ''}`}
            >
              <TaskList
                tasks={displayTasks}
                sortMode={sortMode}
                groupBy={sortMode === 'drag' && !activeGroup}
                selectable={batchMode}
                selectedIds={selectedIds}
                highlightedTaskId={highlightedTaskId ?? undefined}
                onReorder={reorderTasks}
                onReorderInGroup={reorderTasksInGroup}
                onToggle={toggleSubtask}
                onSelect={(id) => {
                  if (batchMode) {
                    toggleSelectedId(id);
                  } else {
                    selectTask(id);
                  }
                }}
                onDelete={async (id) => {
                  if (await confirm('确定删除该任务？')) deleteTask(id);
                }}
                onComplete={handleCompleteTask}
                onToggleSelect={toggleSelectedId}
              />
            </div>

            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {batchMode ? (
                <BatchActionBar
                  count={selectedIds.size}
                  onDelete={handleBatchDelete}
                  onCancel={() => {
                    setBatchMode(false);
                    setSelectedIds(new Set());
                  }}
                />
              ) : (
                <NewTaskBar
                  groupLabel={effectiveNewTaskGroup}
                  title={newTaskTitle}
                  onTitleChange={setNewTaskTitle}
                  onCreate={handleCreateTask}
                />
              )}
            </div>
          </>
        )}
      </div>

      <TaskEditorDialog
        task={selectedTask}
        groups={groups}
        onSave={handleSaveTask}
        onClose={() => {
          selectTask(null);
        }}
      />
    </div>
  );
}
