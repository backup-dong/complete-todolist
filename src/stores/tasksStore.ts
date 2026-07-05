import { create } from 'zustand';
import type { FilterState, SortMode, Subtask, Task, TaskMeta } from '@/types';
import { generateTaskId } from '@/utils/id';
import { isDueToday, isDueThisWeek, isOverdue, nowIso, todayIso, durationDays } from '@/utils/date';
import { computeNextDue } from '@/utils/repeat';
import { useListsStore } from './listsStore';
import { normalizeTask } from '@/parser/serializer';

interface TasksState {
  tasks: Task[];
  selectedTaskId: string | null;
  sortMode: SortMode;
  filter: FilterState;
  searchQuery: string;

  loadTasks: (listName: string) => Promise<void>;
  createTask: (title: string, group?: string) => Promise<void>;
  updateTask: (id: string, patch: Omit<Partial<Task>, 'meta'> & { meta?: Partial<TaskMeta> }) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleSubtask: (taskId: string, path: number[]) => Promise<void>;
  completeTaskWithoutSubtasks: (taskId: string) => Promise<void>;
  reorderTasks: (fromIdx: number, toIdx: number) => Promise<void>;
  reorderTasksInGroup: (groupName: string, fromIdx: number, toIdx: number) => Promise<void>;
  refreshTasks: (listName: string) => void;
  selectTask: (id: string | null) => void;
  setSortMode: (mode: SortMode) => void;
  setFilter: (f: Partial<FilterState>) => void;
  setSearchQuery: (q: string) => void;
  getFilteredTasks: () => Task[];
  getSelectedTask: () => Task | null;
}

function flattenTasks(listName: string): Task[] {
  const list = useListsStore.getState().fileCache[listName];
  if (!list) return [];
  return list.groups.flatMap((g) => g.tasks);
}

function findTaskInList(listName: string, taskId: string): { task: Task; groupIndex: number; taskIndex: number } | null {
  const list = useListsStore.getState().fileCache[listName];
  if (!list) return null;
  for (let gi = 0; gi < list.groups.length; gi++) {
    const g = list.groups[gi];
    for (let ti = 0; ti < g.tasks.length; ti++) {
      if (g.tasks[ti].id === taskId) {
        return { task: g.tasks[ti], groupIndex: gi, taskIndex: ti };
      }
    }
  }
  return null;
}

function cloneSubtasks(subtasks: Subtask[]): Subtask[] {
  return subtasks.map((s) => ({
    ...s,
    children: cloneSubtasks(s.children),
  }));
}

function toggleSubtaskAtPath(subtasks: Subtask[], path: number[]): Subtask[] {
  if (path.length === 0) return subtasks;
  const [index, ...rest] = path;
  return subtasks.map((s, i) => {
    if (i !== index) return s;
    if (rest.length === 0) {
      const completed = !s.completed;
      return {
        ...s,
        completed,
        completed_at: completed ? nowIso() : undefined,
      };
    }
    return { ...s, children: toggleSubtaskAtPath(s.children, rest) };
  });
}

function matchesFilter(task: Task, filter: FilterState, query: string): boolean {
  if (filter.status !== 'all' && task.meta.status !== filter.status) return false;
  if (filter.priority !== 'all' && task.meta.priority !== filter.priority) return false;
  if (filter.timeRange !== 'all') {
    if (filter.timeRange === 'today' && !isDueToday(task.meta.due)) return false;
    if (filter.timeRange === 'week' && !isDueThisWeek(task.meta.due)) return false;
    if (filter.timeRange === 'overdue' && !isOverdue(task.meta.due)) return false;
  }
  if (query) {
    const q = query.toLowerCase();
    const haystack = `${task.title} ${task.note ?? ''} ${task.meta.tags?.join(' ') ?? ''}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const sorted = [...tasks];
  if (mode === 'due') {
    sorted.sort((a, b) => {
      if (!a.meta.due && !b.meta.due) return 0;
      if (!a.meta.due) return 1;
      if (!b.meta.due) return -1;
      return a.meta.due.localeCompare(b.meta.due);
    });
  } else if (mode === 'priority') {
    const rank = { high: 3, med: 2, low: 1 };
    sorted.sort((a, b) => rank[b.meta.priority] - rank[a.meta.priority]);
  } else {
    sorted.sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0));
  }
  return sorted;
}

function advanceRepeatingTask(task: Task): Task {
  if (!task.meta.repeat || !task.meta.due) return task;
  const nextDue = computeNextDue(task.meta.due, task.meta.repeat, task.meta.repeat_until);
  if (!nextDue) return task;

  function resetSubtasks(subtasks: Subtask[]): Subtask[] {
    return subtasks.map((s) => ({
      ...s,
      completed: false,
      completed_at: undefined,
      children: resetSubtasks(s.children),
    }));
  }

  return {
    ...task,
    meta: {
      ...task.meta,
      status: 'pending',
      due: nextDue,
    },
    subtasks: resetSubtasks(task.subtasks),
    completed_at: undefined,
    duration: undefined,
  };
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  sortMode: 'drag',
  filter: { status: 'all', priority: 'all', timeRange: 'all' },
  searchQuery: '',

  loadTasks: async (listName) => {
    // 先使用本地缓存渲染，避免切换清单时阻塞 UI
    const cached = useListsStore.getState().fileCache[listName];
    if (cached) {
      set({ tasks: flattenTasks(listName) });
    }

    // 后台拉取最新内容并再次刷新
    await useListsStore.getState().fetchListContent(listName);
    set({ tasks: flattenTasks(listName) });
  },

  createTask: async (title, group) => {
    const { activeListName, fileCache } = useListsStore.getState();
    if (!activeListName) return;

    const list = fileCache[activeListName];
    if (!list) return;

    const created = todayIso();
    const maxOrder = Math.max(0, ...list.groups.flatMap((g) => g.tasks.map((t) => t.meta.order ?? 0)));
    const targetGroup = group ?? list.groups[0]?.name ?? '默认分组';

    const newTask: Task = {
      id: generateTaskId(title, created),
      title,
      group: targetGroup,
      meta: {
        priority: 'med',
        created,
        order: maxOrder + 1,
      },
      subtasks: [],
    };

    const groupIndex = list.groups.findIndex((g) => g.name === targetGroup);
    const nextList = { ...list };
    if (groupIndex >= 0) {
      nextList.groups = nextList.groups.map((g, i) => (i === groupIndex ? { ...g, tasks: [...g.tasks, newTask] } : g));
    } else {
      nextList.groups = [...nextList.groups, { name: targetGroup, tasks: [newTask] }];
    }

    await useListsStore.getState().saveListContent(activeListName, nextList);
    set({ tasks: flattenTasks(activeListName), selectedTaskId: newTask.id });
  },

  updateTask: async (id, patch: Omit<Partial<Task>, 'meta'> & { meta?: Partial<TaskMeta> }) => {
    const { activeListName, fileCache, saveListContent } = useListsStore.getState();
    if (!activeListName) return;

    const list = fileCache[activeListName];
    if (!list) return;

    const found = findTaskInList(activeListName, id);
    if (!found) return;

    const explicitStatus = patch.meta?.status;
    const nextList = { ...list };
    nextList.groups = nextList.groups.map((g) => ({
      ...g,
      tasks: g.tasks.map((t) => {
        if (t.id !== id) return t;
        // 合并 meta，避免部分 patch（如 { meta: { status: 'pending' } }）丢失其他字段
        const merged = { ...t, ...patch };
        if (patch.meta) {
          merged.meta = { ...t.meta, ...patch.meta };
        }
        return normalizeTask(merged as Task, explicitStatus);
      }),
    }));

    await saveListContent(activeListName, nextList);
    set({ tasks: flattenTasks(activeListName) });
  },

  deleteTask: async (id) => {
    const { activeListName, fileCache, saveListContent } = useListsStore.getState();
    if (!activeListName) return;

    const list = fileCache[activeListName];
    if (!list) return;

    const nextList = { ...list };
    nextList.groups = nextList.groups.map((g) => ({
      ...g,
      tasks: g.tasks.filter((t) => t.id !== id),
    }));

    await saveListContent(activeListName, nextList);
    set({ tasks: flattenTasks(activeListName), selectedTaskId: null });
  },

  toggleSubtask: async (taskId, path) => {
    const { activeListName, fileCache, saveListContent } = useListsStore.getState();
    if (!activeListName) return;

    const list = fileCache[activeListName];
    if (!list) return;

    const nextList = { ...list };
    nextList.groups = nextList.groups.map((g) => ({
      ...g,
      tasks: g.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const nextSubtasks = toggleSubtaskAtPath(cloneSubtasks(t.subtasks), path);
        let normalized = normalizeTask({ ...t, subtasks: nextSubtasks });
        if (normalized.meta.status === 'done' && normalized.meta.repeat) {
          normalized = advanceRepeatingTask(normalized);
        }
        return normalized;
      }),
    }));

    await saveListContent(activeListName, nextList);
    set({ tasks: flattenTasks(activeListName) });
  },

  completeTaskWithoutSubtasks: async (taskId) => {
    const { activeListName, fileCache, saveListContent } = useListsStore.getState();
    if (!activeListName) return;

    const list = fileCache[activeListName];
    if (!list) return;

    const nextList = { ...list };
    nextList.groups = nextList.groups.map((g) => ({
      ...g,
      tasks: g.tasks.map((t) => {
        if (t.id !== taskId || t.subtasks.length > 0) return t;
        const completedAt = nowIso();
        let normalized = normalizeTask({
          ...t,
          meta: { ...t.meta, status: 'done' },
          completed_at: completedAt,
          duration: t.meta.start
            ? durationDays(t.meta.start, completedAt)
            : durationDays(t.meta.created, completedAt),
        });
        if (normalized.meta.repeat) {
          normalized = advanceRepeatingTask(normalized);
        }
        return normalized;
      }),
    }));

    await saveListContent(activeListName, nextList);
    set({ tasks: flattenTasks(activeListName) });
  },

  reorderTasks: async (fromIdx, toIdx) => {
    const { activeListName, activeGroup, fileCache, saveListContent } = useListsStore.getState();
    if (!activeListName) return;

    let filtered = get().getFilteredTasks();
    if (activeGroup) {
      filtered = filtered.filter((t) => t.group === activeGroup);
    }
    if (fromIdx < 0 || fromIdx >= filtered.length || toIdx < 0 || toIdx >= filtered.length) return;

    const movedTask = filtered[fromIdx];
    const reordered = [...filtered];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, movedTask);

    const list = fileCache[activeListName];
    if (!list) return;

    const taskById = new Map(list.groups.flatMap((g) => g.tasks).map((t) => [t.id, t]));
    const reorderedIds = new Set(reordered.map((t) => t.id));

    const nextList = { ...list };
    nextList.groups = nextList.groups.map((g) => {
      const reorderedForGroup = reordered.filter((t) => t.group === g.name);
      const remaining = g.tasks.filter((t) => !reorderedIds.has(t.id));
      return {
        ...g,
        tasks: [
          ...reorderedForGroup.map((t, i) => {
            const original = taskById.get(t.id)!;
            return { ...original, meta: { ...original.meta, order: i + 1 } };
          }),
          ...remaining,
        ],
      };
    });

    await saveListContent(activeListName, nextList);
    set({ tasks: flattenTasks(activeListName), sortMode: 'drag' });
  },

  reorderTasksInGroup: async (groupName, fromIdx, toIdx) => {
    const { activeListName, fileCache, saveListContent } = useListsStore.getState();
    if (!activeListName) return;

    const list = fileCache[activeListName];
    if (!list) return;

    const group = list.groups.find((g) => g.name === groupName);
    if (!group) return;
    if (fromIdx < 0 || fromIdx >= group.tasks.length || toIdx < 0 || toIdx >= group.tasks.length) return;

    const reordered = [...group.tasks];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const nextList = { ...list };
    nextList.groups = nextList.groups.map((g) =>
      g.name === groupName
        ? { ...g, tasks: reordered.map((t, i) => ({ ...t, meta: { ...t.meta, order: i + 1 } })) }
        : g,
    );

    await saveListContent(activeListName, nextList);
    set({ tasks: flattenTasks(activeListName), sortMode: 'drag' });
  },

  refreshTasks: (listName) => {
    set({ tasks: flattenTasks(listName) });
  },

  selectTask: (id) => set({ selectedTaskId: id }),
  setSortMode: (mode) => set({ sortMode: mode }),
  setFilter: (f) => set((state) => ({ filter: { ...state.filter, ...f } })),
  setSearchQuery: (q) => set({ searchQuery: q }),

  getFilteredTasks: () => {
    const { tasks, filter, searchQuery, sortMode } = get();
    const filtered = tasks.filter((t) => matchesFilter(t, filter, searchQuery));
    return sortTasks(filtered, sortMode);
  },

  getSelectedTask: () => {
    const { selectedTaskId, tasks } = get();
    return tasks.find((t) => t.id === selectedTaskId) ?? null;
  },
}));

// 监听清单切换
let lastActiveList: string | null = null;
setInterval(() => {
  const active = useListsStore.getState().activeListName;
  if (active && active !== lastActiveList) {
    lastActiveList = active;
    useTasksStore.getState().loadTasks(active);
  }
}, 200);
