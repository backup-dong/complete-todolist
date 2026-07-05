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
  const progressPct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  const effectiveNewTaskGroup = activeGroup ?? groups[0] ?? '默认分组';

  const filtered = getFilteredTasks();
  const displayTasks = activeGroup ? filtered.filter((t) => t.group === activeGroup) : filtered;

  const selectedTask = displayTasks.find((t) => t.id === selectedTaskId) ?? null;

  const handleCreateTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    const targetGroup = effectiveNewTaskGroup;
    createTask(title, targetGroup);
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
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">{activeListName}</h1>
              {totalCount > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-20 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] shadow-[var(--shadow-inset)]">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        progressPct === 100 ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary)]'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums font-medium text-[var(--color-text-secondary)]">
                    {doneCount}/{totalCount}
                  </span>
                </div>
              )}
              {activeGroup && (
                <span className="rounded-full bg-[var(--color-primary-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                  {activeGroup}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (activeList) {
                    copyWeeklyReport(activeListName, activeList);
                  }
                }}
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
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateGroup();
                      if (e.key === 'Escape') {
                        setNewGroupName('');
                        setShowNewGroup(false);
                      }
                    }}
                    onBlur={() => handleCreateGroup()}
                    placeholder="分组名称"
                    className="input w-36 py-1.5 text-xs"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewGroup(true)}
                  className="btn-secondary flex items-center gap-1.5 py-1.5 text-xs"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  新建分组
                </button>
              )}
              <ViewToggle mode={sortMode} onChange={setSortMode} />
            </div>
          </div>
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
            onComplete={(id) => {
              const task = displayTasks.find((t) => t.id === id);
              if (!task) return;
              if (task.meta.status === 'done') {
                useTasksStore.getState().updateTask(id, { meta: { status: 'pending' } });
              } else {
                useTasksStore.getState().completeTaskWithoutSubtasks(id);
              }
            }}
          />
        </div>

        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex gap-2">
            <div className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]">
              {effectiveNewTaskGroup}
            </div>
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTask();
              }}
              placeholder="新建任务..."
              className="input flex-1"
            />
            <button
              type="button"
              onClick={handleCreateTask}
              className="btn-primary px-3"
              aria-label="新建任务"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showEditor && selectedTask && (
        <div className="w-[360px] shrink-0">
          <TaskEditor
            key={selectedTask.id}
            task={selectedTask}
            groups={groups}
            onSave={handleSaveTask}
            onClose={() => {
              setShowEditor(false);
              selectTask(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
