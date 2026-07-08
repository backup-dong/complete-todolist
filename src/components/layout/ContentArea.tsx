import { useMemo, useState } from 'react';
import { Copy, FolderPlus, Inbox, ListChecks, Plus, X } from 'lucide-react';
import { useListsStore } from '@/stores/listsStore';
import { useTasksStore } from '@/stores/tasksStore';
import { confirm } from '@/stores/confirmStore';
import type { Task } from '@/types';
import { copyWeeklyReport } from '@/utils/report';
import { SearchBar, FilterDropdown, ViewToggle } from '../tasks/Toolbar';
import { TaskList } from '../tasks/TaskList';
import { TaskEditorDialog } from '../tasks/TaskEditorDialog';
import { ConflictBanner } from './ConflictBanner';

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

function ListHeader({
  title,
  done,
  total,
  activeGroup,
  onCopyWeeklyReport,
  onToggleNewGroup,
  showNewGroup,
  newGroupName,
  onNewGroupNameChange,
  onCreateGroup,
  onCancelNewGroup,
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
  onToggleNewGroup: () => void;
  showNewGroup: boolean;
  newGroupName: string;
  onNewGroupNameChange: (value: string) => void;
  onCreateGroup: () => void;
  onCancelNewGroup: () => void;
  sortMode: 'drag' | 'due' | 'priority';
  onSortModeChange: (mode: 'drag' | 'due' | 'priority') => void;
  batchMode: boolean;
  onToggleBatchMode: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">{title}</h1>
        {total > 0 && <ProgressBar done={done} total={total} />}
        {activeGroup && (
          <span className="rounded-full bg-[var(--color-primary-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-primary)]">
            {activeGroup}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCopyWeeklyReport}
          className="btn-secondary flex items-center gap-1.5 py-1.5 text-xs"
        >
          <Copy className="h-3.5 w-3.5" />
          导出周报
        </button>
        {showNewGroup ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newGroupName}
              onChange={(e) => onNewGroupNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateGroup();
                if (e.key === 'Escape') onCancelNewGroup();
              }}
              onBlur={() => onCreateGroup()}
              placeholder="分组名称"
              className="input w-36 py-1.5 text-xs"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleNewGroup}
            className="btn-secondary flex items-center gap-1.5 py-1.5 text-xs"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            新建分组
          </button>
        )}
        <button
          type="button"
          onClick={onToggleBatchMode}
          title={batchMode ? '退出批量选择' : '批量选择'}
          className={[
            'btn-secondary flex items-center gap-1.5 py-1.5 text-xs',
            batchMode ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : '',
          ].join(' ')}
          aria-pressed={batchMode}
        >
          <ListChecks className="h-3.5 w-3.5" />
          {batchMode ? '退出选择' : '批量'}
        </button>
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
      <div className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]">
        {groupLabel}
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCreate();
        }}
        placeholder="新建任务..."
        className="input flex-1"
      />
      <button
        type="button"
        onClick={onCreate}
        className="btn-primary px-3"
        aria-label="新建任务"
      >
        <Plus className="h-4 w-4" />
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
  );
}

export function ContentArea() {
  const { activeListName, activeGroup, fileCache, createGroup } = useListsStore();
  const {
    sortMode,
    filter,
    searchQuery,
    selectedTaskId,
    setSortMode,
    setFilter,
    setSearchQuery,
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
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const activeList = activeListName ? fileCache[activeListName] : null;
  const groups = useMemo(() => activeList?.groups.map((g) => g.name) ?? [], [activeList]);
  const allTasks = useMemo(() => activeList?.groups.flatMap((g) => g.tasks) ?? [], [activeList]);
  const doneCount = allTasks.filter((t) => t.meta.status === 'done').length;
  const totalCount = allTasks.length;

  const effectiveNewTaskGroup = activeGroup ?? groups[0] ?? '默认分组';

  const filtered = getFilteredTasks();
  const displayTasks = activeGroup ? filtered.filter((t) => t.group === activeGroup) : filtered;

  const selectedTask = displayTasks.find((t) => t.id === selectedTaskId) ?? null;

  const handleCreateTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    createTask(title, effectiveNewTaskGroup);
    setNewTaskTitle('');
  };

  const handleSaveTask = (updated: Task) => {
    updateTask(updated.id, updated);
  };

  const handleCreateGroup = () => {
    const name = newGroupName.trim();
    if (!name) {
      setNewGroupName('');
      setShowNewGroup(false);
      return;
    }
    if (!groups.includes(name)) {
      createGroup(name);
    }
    setNewGroupName('');
    setShowNewGroup(false);
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

  if (!activeListName) {
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
        <ConflictBanner />
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <ListHeader
            title={activeListName}
            done={doneCount}
            total={totalCount}
            activeGroup={activeGroup}
            onCopyWeeklyReport={() => {
              if (activeList) {
                copyWeeklyReport(activeListName, activeList);
              }
            }}
            onToggleNewGroup={() => setShowNewGroup((v) => !v)}
            showNewGroup={showNewGroup}
            newGroupName={newGroupName}
            onNewGroupNameChange={setNewGroupName}
            onCreateGroup={handleCreateGroup}
            onCancelNewGroup={() => {
              setNewGroupName('');
              setShowNewGroup(false);
            }}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            batchMode={batchMode}
            onToggleBatchMode={handleToggleBatchMode}
          />
          <div className="flex flex-col gap-3">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
            <FilterDropdown filter={filter} onChange={setFilter} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <TaskList
            tasks={displayTasks}
            sortMode={sortMode}
            groupBy={sortMode === 'drag' && !activeGroup}
            selectable={batchMode}
            selectedIds={selectedIds}
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

        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
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
