import { create } from 'zustand';
import type { FilterState, ParsedList, SortMode, Task, TaskMeta, TodoViewKey } from '@/types';
import { generateTaskId } from '@/utils/id';
import { isDueToday, isDueThisWeek, isOverdue, nowIso, todayIso, durationDays } from '@/utils/date';
import { computeNextDue } from '@/utils/repeat';
import { cloneSubtasks, resetSubtasks, toggleSubtaskAtPath } from '@/utils/subtasks';
import { useListsStore } from './listsStore';
import { normalizeTask } from '@/parser';

interface TasksState {
  tasks: Task[];
  selectedTaskId: string | null;
  sortMode: SortMode;
  filter: FilterState;
  searchQuery: string;
  todoView: TodoViewKey | null;

  loadTasks: (listName: string) => Promise<void>;
  createTask: (title: string, group?: string) => Promise<string | undefined>;
  updateTask: (id: string, patch: Omit<Partial<Task>, 'meta'> & { meta?: Partial<TaskMeta> }) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  deleteTasks: (ids: string[]) => Promise<void>;
  toggleSubtask: (taskId: string, path: number[]) => Promise<void>;
  completeTaskWithoutSubtasks: (taskId: string) => Promise<void>;
  reorderTasks: (fromIdx: number, toIdx: number) => Promise<void>;
  reorderTasksInGroup: (groupName: string, fromIdx: number, toIdx: number) => Promise<void>;
  refreshTasks: (listName: string) => void;
  refreshTodoView: () => void;
  selectTask: (id: string | null) => void;
  setSortMode: (mode: SortMode) => void;
  setFilter: (f: Partial<FilterState>) => void;
  setSearchQuery: (q: string) => void;
  clearFilters: () => void;
  setTodoView: (key: TodoViewKey | null) => void;
  getFilteredTasks: () => Task[];
  getSelectedTask: () => Task | null;
  getTodoViewCounts: () => Record<TodoViewKey, number>;
}

interface ActiveListCtx {
  activeListName: string;
  list: ParsedList;
  saveListContent: (name: string, list: ParsedList) => Promise<void>;
}

function flattenTasks(listName: string): Task[] {
  const list = useListsStore.getState().fileCache[listName];
  if (!list) return [];
  return list.groups.flatMap((g) => g.tasks);
}

function requireActiveList(): ActiveListCtx | null {
  const { activeListName, fileCache, saveListContent } = useListsStore.getState();
  if (!activeListName) return null;
  const list = fileCache[activeListName];
  if (!list) return null;
  return { activeListName, list, saveListContent };
}

function flattenAllTasks(fileCache: Record<string, ParsedList>): Task[] {
  const tasks: Task[] = [];
  for (const [listName, list] of Object.entries(fileCache)) {
    for (const group of list.groups) {
      for (const task of group.tasks) {
        tasks.push({ ...task, sourceList: listName });
      }
    }
  }
  return tasks;
}

function findTaskAcrossLists(taskId: string): { task: Task; listName: string; groupIndex: number; taskIndex: number } | null {
  const { fileCache } = useListsStore.getState();
  for (const [listName, list] of Object.entries(fileCache)) {
    for (let gi = 0; gi < list.groups.length; gi++) {
      const g = list.groups[gi];
      for (let ti = 0; ti < g.tasks.length; ti++) {
        if (g.tasks[ti].id === taskId) {
          return { task: g.tasks[ti], listName, groupIndex: gi, taskIndex: ti };
        }
      }
    }
  }
  return null;
}

interface TaskContext {
  listName: string;
  list: ParsedList;
  saveListContent: (name: string, list: ParsedList) => Promise<void>;
}

function requireTaskContext(task?: Task, preferredListName?: string): TaskContext | null {
  const { activeListName, fileCache, saveListContent } = useListsStore.getState();
  const listName = preferredListName ?? task?.sourceList ?? activeListName;
  if (!listName) return null;
  const list = fileCache[listName];
  if (!list) return null;
  return { listName, list, saveListContent };
}

function matchesTodoView(task: Task, key: TodoViewKey): boolean {
  if (task.meta.status === 'done') return false;
  switch (key) {
    case 'today':
      return isDueToday(task.meta.due);
    case 'week':
      return isDueThisWeek(task.meta.due);
    case 'all':
      return true;
    case 'high':
      return task.meta.priority === 'high';
    default:
      return false;
  }
}

function matchesFilter(task: Task, filter: FilterState, query: string): boolean {
  if (filter.status.length > 0 && !filter.status.includes(task.meta.status ?? 'pending')) return false;
  if (filter.priority !== 'all' && task.meta.priority !== filter.priority) return false;
  if (filter.timeRange !== 'all') {
    if (filter.timeRange === 'today' && !isDueToday(task.meta.due)) return false;
    if (filter.timeRange === 'week' && !isDueThisWeek(task.meta.due)) return false;
    if (filter.timeRange === 'overdue' && (!isOverdue(task.meta.due) || task.meta.status === 'done')) return false;
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

function buildTaskPatch(patch: Partial<Task>, explicitStatus?: TaskMeta['status']): Task {
  return normalizeTask(patch as Task, explicitStatus);
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  sortMode: 'drag',
  filter: { status: [], priority: 'all', timeRange: 'all' },
  searchQuery: '',
  todoView: null,

  loadTasks: async (listName) => {
    // 先使用本地缓存渲染，避免切换清单时阻塞 UI
    if (useListsStore.getState().fileCache[listName]) {
      set({ tasks: flattenTasks(listName) });
    }

    // 后台拉取最新内容并再次刷新
    await useListsStore.getState().fetchListContent(listName);
    set({ tasks: flattenTasks(listName) });
  },

  createTask: async (title, group) => {
    const ctx = requireActiveList();
    if (!ctx) return undefined;
    const { activeListName, list, saveListContent } = ctx;

    const created = todayIso();
    const targetGroup = group ?? list.groups[0]?.name ?? '默认分组';
    const existingGroup = list.groups.find((g) => g.name === targetGroup);
    const groupTasks = existingGroup?.tasks ?? [];
    const minOrder = groupTasks.length > 0 ? Math.min(...groupTasks.map((t) => t.meta.order ?? 0)) : 1;

    const newTask: Task = {
      id: generateTaskId(title, created),
      title,
      group: targetGroup,
      meta: {
        priority: 'med',
        created,
        order: groupTasks.length > 0 ? minOrder - 1 : 1,
      },
      subtasks: [],
    };

    const groupIndex = list.groups.findIndex((g) => g.name === targetGroup);
    const nextList = { ...list };
    if (groupIndex >= 0) {
      nextList.groups = nextList.groups.map((g, i) => (i === groupIndex ? { ...g, tasks: [newTask, ...g.tasks] } : g));
    } else {
      nextList.groups = [...nextList.groups, { name: targetGroup, tasks: [newTask] }];
    }

    await saveListContent(activeListName, nextList);
    set({ tasks: flattenTasks(activeListName) });
    return newTask.id;
  },

  updateTask: async (id, patch) => {
    const found = findTaskAcrossLists(id);
    if (!found) return;
    const ctx = requireTaskContext(found.task, found.listName);
    if (!ctx) return;
    const { listName, list, saveListContent } = ctx;

    const explicitStatus = patch.meta?.status;
    const merged = { ...found.task, ...patch };
    if (patch.meta) {
      merged.meta = { ...found.task.meta, ...patch.meta };
    }
    // sourceList 是运行时聚合字段，不写入清单数据
    delete (merged as Partial<Task>).sourceList;
    const updatedTask = buildTaskPatch(merged as Task, explicitStatus);

    // 如果修改了任务所属分组，需要在 groups 数组间物理移动，
    // 否则侧边栏分组计数和刷新后的分组归属都会出错。
    const oldGroupName = found.task.group;
    const newGroupName = updatedTask.group;
    let nextGroups: typeof list.groups;

    if (newGroupName === oldGroupName) {
      nextGroups = list.groups.map((g) => ({
        ...g,
        tasks: g.name === oldGroupName ? g.tasks.map((t) => (t.id === id ? updatedTask : t)) : g.tasks,
      }));
    } else {
      const targetExists = list.groups.some((g) => g.name === newGroupName);
      if (!targetExists) {
        // 目标分组不存在时回退到原分组，避免任务丢失
        updatedTask.group = oldGroupName;
        nextGroups = list.groups.map((g) => ({
          ...g,
          tasks: g.name === oldGroupName ? g.tasks.map((t) => (t.id === id ? updatedTask : t)) : g.tasks,
        }));
      } else {
        nextGroups = list.groups.map((g) => {
          if (g.name === oldGroupName) {
            return { ...g, tasks: g.tasks.filter((t) => t.id !== id) };
          }
          if (g.name === newGroupName) {
            return { ...g, tasks: [...g.tasks, updatedTask] };
          }
          return g;
        });
      }
    }

    const nextList = { ...list, groups: nextGroups };
    await saveListContent(listName, nextList);

    if (get().todoView) {
      set((state) => ({ tasks: sortTasks(flattenAllTasks(useListsStore.getState().fileCache).filter((t) => matchesTodoView(t, state.todoView!)), state.sortMode) }));
    } else {
      set({ tasks: flattenTasks(listName) });
    }
  },

  deleteTask: async (id) => {
    const found = findTaskAcrossLists(id);
    if (!found) return;
    const ctx = requireTaskContext(found.task, found.listName);
    if (!ctx) return;
    const { listName, list, saveListContent } = ctx;

    const nextList = { ...list };
    nextList.groups = nextList.groups.map((g) => ({
      ...g,
      tasks: g.tasks.filter((t) => t.id !== id),
    }));

    await saveListContent(listName, nextList);

    if (get().todoView) {
      set((state) => ({
        tasks: sortTasks(
          flattenAllTasks(useListsStore.getState().fileCache).filter((t) => matchesTodoView(t, state.todoView!)),
          state.sortMode,
        ),
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
      }));
    } else {
      set({ tasks: flattenTasks(listName), selectedTaskId: null });
    }
  },

  deleteTasks: async (ids) => {
    const { fileCache, saveListContent, activeListName } = useListsStore.getState();
    const idSet = new Set(ids);

    // 按清单分组，分别删除
    const tasksByList = new Map<string, Task[]>();
    for (const [listName, list] of Object.entries(fileCache)) {
      const matched = list.groups.flatMap((g) => g.tasks.filter((t) => idSet.has(t.id)));
      if (matched.length > 0) tasksByList.set(listName, matched);
    }

    // 如果批量删除发生在清单视图且任务都来自当前清单，保持原有行为
    const targetListName = get().todoView ? null : activeListName;

    for (const [listName, list] of Object.entries(fileCache)) {
      const hasMatch = list.groups.some((g) => g.tasks.some((t) => idSet.has(t.id)));
      if (!hasMatch) continue;

      const nextList = { ...list };
      nextList.groups = nextList.groups.map((g) => ({
        ...g,
        tasks: g.tasks.filter((t) => !idSet.has(t.id)),
      }));
      await saveListContent(listName, nextList);
    }

    if (get().todoView) {
      set((state) => ({
        tasks: sortTasks(
          flattenAllTasks(useListsStore.getState().fileCache).filter((t) => matchesTodoView(t, state.todoView!)),
          state.sortMode,
        ),
        selectedTaskId: null,
      }));
    } else if (targetListName) {
      set({ tasks: flattenTasks(targetListName), selectedTaskId: null });
    }
  },

  toggleSubtask: async (taskId, path) => {
    const found = findTaskAcrossLists(taskId);
    if (!found) return;
    const ctx = requireTaskContext(found.task, found.listName);
    if (!ctx) return;
    const { listName, list, saveListContent } = ctx;

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

    await saveListContent(listName, nextList);

    if (get().todoView) {
      set((state) => ({
        tasks: sortTasks(
          flattenAllTasks(useListsStore.getState().fileCache).filter((t) => matchesTodoView(t, state.todoView!)),
          state.sortMode,
        ),
      }));
    } else {
      set({ tasks: flattenTasks(listName) });
    }
  },

  completeTaskWithoutSubtasks: async (taskId) => {
    const found = findTaskAcrossLists(taskId);
    if (!found) return;
    const ctx = requireTaskContext(found.task, found.listName);
    if (!ctx) return;
    const { listName, list, saveListContent } = ctx;

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

    await saveListContent(listName, nextList);

    if (get().todoView) {
      set((state) => ({
        tasks: sortTasks(
          flattenAllTasks(useListsStore.getState().fileCache).filter((t) => matchesTodoView(t, state.todoView!)),
          state.sortMode,
        ),
        selectedTaskId: state.selectedTaskId === taskId ? null : state.selectedTaskId,
      }));
    } else {
      set({ tasks: flattenTasks(listName) });
    }
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

  refreshTodoView: () => {
    const { todoView, sortMode } = get();
    if (!todoView) return;
    const aggregated = flattenAllTasks(useListsStore.getState().fileCache);
    const filtered = aggregated.filter((t) => matchesTodoView(t, todoView));
    set({ tasks: sortTasks(filtered, sortMode) });
  },

  selectTask: (id) => set({ selectedTaskId: id }),
  setSortMode: (mode) => set({ sortMode: mode }),
  setFilter: (f) => set((state) => ({ filter: { ...state.filter, ...f } })),
  setSearchQuery: (q) => set({ searchQuery: q }),
  clearFilters: () =>
    set({
      filter: { status: [], priority: 'all', timeRange: 'all' },
      searchQuery: '',
    }),
  setTodoView: (key) => {
    if (key) {
      useListsStore.setState({ activeListName: null, activeGroup: null });
      useListsStore.getState().fetchAllListsContent();
      set({ todoView: key, selectedTaskId: null, filter: { status: [], priority: 'all', timeRange: 'all' }, searchQuery: '' });
      const aggregated = flattenAllTasks(useListsStore.getState().fileCache);
      const filtered = aggregated.filter((t) => matchesTodoView(t, key));
      set({ tasks: sortTasks(filtered, get().sortMode) });
    } else {
      set({ todoView: null, selectedTaskId: null });
      const { activeListName } = useListsStore.getState();
      if (activeListName) {
        set({ tasks: flattenTasks(activeListName) });
      } else {
        set({ tasks: [] });
      }
    }
  },

  getFilteredTasks: () => {
    const { tasks, filter, searchQuery, sortMode } = get();
    const filtered = tasks.filter((t) => matchesFilter(t, filter, searchQuery));
    return sortTasks(filtered, sortMode);
  },

  getSelectedTask: () => {
    const { selectedTaskId, tasks } = get();
    return tasks.find((t) => t.id === selectedTaskId) ?? null;
  },

  getTodoViewCounts: () => {
    const aggregated = flattenAllTasks(useListsStore.getState().fileCache);
    const keys: TodoViewKey[] = ['today', 'week', 'all', 'high'];
    return keys.reduce(
      (acc, key) => {
        acc[key] = aggregated.filter((t) => matchesTodoView(t, key)).length;
        return acc;
      },
      {} as Record<TodoViewKey, number>,
    );
  },
}));

// 监听清单切换，自动加载任务
let lastActiveList: string | null = null;
useListsStore.subscribe((state, prevState) => {
  const active = state.activeListName;
  if (active && active !== lastActiveList) {
    lastActiveList = active;
    useTasksStore.getState().loadTasks(active);
  } else if (!active && prevState?.activeListName) {
    // activeListName 被清除（例如进入待办视图）时，重置记忆，
    // 这样切回清单时仍能触发加载。
    lastActiveList = null;
  }

  // 待办视图下，fileCache 变化时自动刷新聚合结果
  if (state.fileCache !== prevState?.fileCache && useTasksStore.getState().todoView) {
    useTasksStore.getState().refreshTodoView();
  }
});
