import { useMemo, useState } from 'react';
import { Copy, FolderPlus, Inbox, Plus } from 'lucide-react';
import { useListsStore } from '@/stores/listsStore';
import { useTasksStore } from '@/stores/tasksStore';
import { confirm } from '@/stores/confirmStore';
import type { Task } from '@/types';
import { copyWeeklyReport } from '@/utils/report';
import { SearchBar, FilterDropdown, ViewToggle } from '../tasks/Toolbar';
import { TaskList } from '../tasks/TaskList';
import { TaskEditor } from '../tasks/TaskEditor';
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

function TaskEditorPanel({
  task,
  groups,
  onSave,
  onClose,
}: {
  task: Task;
  groups: string[];
  onSave: (updated: Task) => void;
  onClose: () => void;
}) {
  return (
    <div className="w-[360px] shrink-0">
      <TaskEditor
        key={task.id}
        task={task}
        groups={groups}
        onSave={onSave}
        onClose={onClose}
      />
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
  const [showEditor, setShowEditor] = useState(false);

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
    setShowEditor(true);
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
            onReorder={reorderTasks}
            onReorderInGroup={reorderTasksInGroup}
            onToggle={toggleSubtask}
            onSelect={(id) => {
              selectTask(id);
              setShowEditor(true);
            }}
            onDelete={async (id) => {
              if (await confirm('确定删除该任务？')) deleteTask(id);
            }}
            onComplete={handleCompleteTask}
          />
        </div>

        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <NewTaskBar
            groupLabel={effectiveNewTaskGroup}
            title={newTaskTitle}
            onTitleChange={setNewTaskTitle}
            onCreate={handleCreateTask}
          />
        </div>
      </div>

      {showEditor && selectedTask && (
        <TaskEditorPanel
          task={selectedTask}
          groups={groups}
          onSave={handleSaveTask}
          onClose={() => {
            setShowEditor(false);
            selectTask(null);
          }}
        />
      )}
    </div>
  );
}
