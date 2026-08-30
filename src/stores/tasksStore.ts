import { create } from 'zustand';
import type { FilterState, ParsedList, SortMode, Task, TaskMeta, TodoViewKey } from '@/types';
import { generateTaskId } from '@/utils/id';
import { isDueToday, isDueThisWeek, isStartThisWeek, isOverdue, nowIso, todayIso, durationDays } from '@/utils/date';
import { computeNextDue, computeEffectiveDueDate } from '@/utils/repeat';
import { dateStrInMonth, getCalendarOccurrence } from '@/utils/calendar';
import { topLevelTasks, toggleSubtaskState, resetDescendants, getDescendants, replaceSubtree, deleteSubtaskTree } from '@/utils/subtasks';
import { getPendingWrites, getCachedFileContent } from '@/utils/storage';
import { useListsStore } from './listsStore';
import { useHolidayStore } from './holidayStore';
import { normalizeTask, parseJsonToList } from '@/parser';

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
  toggleSubtask: (taskId: string) => Promise<void>;
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
  resetTasksState: () => void;
}

interface ActiveListCtx {
  activeListName: string;
  list: ParsedList;
  saveListContent: (name: string, list: ParsedList) => Promise<void>;
}

function flattenTasks(listName: string): Task[] {
  const list = useListsStore.getState().fileCache[listName];
  if (!list) return [];
  return topLevelTasks(list.groups.flatMap((g) => g.tasks));
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
      for (const task of topLevelTasks(group.tasks)) {
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

/** 把扁平任务数组按 group 映射回 ParsedList.groups（保持原组顺序）。 */
function rebuildGroups(list: ParsedList, flatTasks: Task[]): ParsedList {
  return {
    ...list,
    groups: list.groups.map((g) => ({
      ...g,
      tasks: flatTasks.filter((t) => t.group === g.name),
    })),
  };
}

/** 获取某清单的全部扁平任务（含子任务）。 */
function flatTasksOfList(list: ParsedList): Task[] {
  return list.groups.flatMap((g) => g.tasks);
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
  // 日历视图由 CalendarView 自行按月份筛选，这里返回全部任务（含已完成）
  if (key === 'calendar') return true;
  if (task.meta.status === 'done') return false;

  switch (key) {
    case 'start-week':
      return isStartThisWeek(task.meta.start);
    case 'all':
      return true;
    case 'high':
      return task.meta.priority === 'high';
    default:
      return false;
  }
}

/** 任务用于检索的文本：标题 + 备注 + 标签。 */
function taskSearchText(task: Task): string {
  return `${task.title} ${task.note ?? ''} ${task.meta.tags?.join(' ') ?? ''}`.toLowerCase();
}

/** 计算某清单中全部顶层任务的子任务检索文本映射（仅搜索时使用）。 */
function listDescendantHaystack(list: ParsedList): Map<string, string> {
  const flat = list.groups.flatMap((g) => g.tasks);
  const map = new Map<string, string>();
  for (const parent of flat) {
    if (parent.parentId !== null) continue;
    const descendants = getDescendants(flat, parent.id);
    if (descendants.length === 0) continue;
    map.set(parent.id, descendants.map(taskSearchText).join(' '));
  }
  return map;
}

function matchesFilter(
  task: Task,
  filter: FilterState,
  query: string,
  descendantHaystack = '',
): boolean {
  if (filter.status.length > 0 && !filter.status.includes(task.meta.status ?? 'pending')) return false;
  if (filter.priority !== 'all' && task.meta.priority !== filter.priority) return false;
  if (filter.timeRange !== 'all') {
    if (filter.timeRange === 'today' && !isDueToday(task.meta.due)) return false;
    if (filter.timeRange === 'week' && !isDueThisWeek(task.meta.due)) return false;
    if (filter.timeRange === 'overdue' && (!isOverdue(task.meta.due) || task.meta.status === 'done')) return false;
  }
  // 标签过滤：filter.tags 非空时，任务任一标签命中即匹配（OR）
  if (filter.tags.length > 0) {
    const taskTags = task.meta.tags ?? [];
    if (!taskTags.some((t) => filter.tags.includes(t))) return false;
  }
  if (query) {
    const q = query.toLowerCase();
    const haystack = `${taskSearchText(task)} ${descendantHaystack}`;
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

function advanceRepeatingTask(tasks: Task[], taskId: string, holidays: string[]): Task[] {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || !task.meta.repeat || !task.meta.due) return tasks;

  // 对于已过期的重复任务，先推进到有效日期再算下一次，避免从旧日期算出错误结果
  const baseDue = computeEffectiveDueDate(task.meta.due, task.meta.repeat, task.meta.repeat_until, holidays);
  const nextDue = computeNextDue(baseDue, task.meta.repeat, task.meta.repeat_until, holidays);
  if (!nextDue) return tasks;

  const advanced: Task = {
    ...task,
    meta: {
      ...task.meta,
      status: 'pending',
      due: nextDue,
    },
    completed_at: undefined,
    duration: undefined,
  };
  return resetDescendants(
    tasks.map((t) => (t.id === taskId ? advanced : t)),
    taskId,
  );
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  sortMode: 'drag',
  filter: { status: [], priority: 'all', timeRange: 'all', tags: [] },
  searchQuery: '',
  todoView: null,

  loadTasks: async (listName) => {
    // 先使用本地缓存渲染，避免切换清单时阻塞 UI
    if (useListsStore.getState().fileCache[listName]) {
      set({ tasks: flattenTasks(listName) });
    }

    // 检查是否有待写入的本地修改，有则从本地缓存加载（不拉远程）
    const pendingWrites = getPendingWrites();
    if (pendingWrites[`${listName}.json`]) {
      // 从 localStorage 缓存恢复数据，避免首屏 loading 卡死
      const cached = getCachedFileContent(listName);
      const store = useListsStore.getState();
      if (cached && !store.fileCache[listName]) {
        try {
          const cachedContent = cached.content;
          const list = parseJsonToList(cachedContent, cached.sha);
          useListsStore.setState((s) => ({
            fileCache: { ...s.fileCache, [listName]: list },
            initialLoading: s.initialLoading && s.activeListName === listName ? false : s.initialLoading,
          }));
          set({ tasks: flattenTasks(listName) });
        } catch {
          // 缓存无法解析时忽略
        }
      }
      // 即使没有缓存，也要关闭首屏遮罩，不卡住用户
      if (store.initialLoading && store.activeListName === listName) {
        useListsStore.setState({ initialLoading: false });
      }
      return;
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
      id: generateTaskId(),
      title,
      group: targetGroup,
      parentId: null,
      meta: {
        priority: 'med',
        created,
        order: groupTasks.length > 0 ? minOrder - 1 : 1,
      },
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

    // 编辑器保存时携带子任务树，展平替换进扁平结构（替换旧后代、写排父链与 order）
    let flatAll = flatTasksOfList(list);
    if (merged.subtasks) {
      flatAll = replaceSubtree(flatAll, id, merged.subtasks);
      delete (merged as Partial<Task>).subtasks;
    }
    const updatedTask = normalizeTask(merged as Task, {
      explicitStatus,
      descendants: getDescendants(flatAll, id),
    });
    flatAll = flatAll.map((t) => (t.id === id ? updatedTask : t));

    // 如果修改了任务所属分组，目标分组不存在时回退到原分组，避免任务丢失。
    // 分组间的物理移动由重建 groups 时按新 group 字段自动完成。
    if (updatedTask.group !== found.task.group) {
      if (!list.groups.some((g) => g.name === updatedTask.group)) {
        updatedTask.group = found.task.group;
      } else {
        // 移入目标组末尾：重置 order 并把任务挪到 flat 数组末尾，避免与目标组已有任务的 order/位置冲突
        const targetTasks = flatAll.filter((t) => t.id !== id && t.group === updatedTask.group);
        const maxOrder = targetTasks.length > 0 ? Math.max(...targetTasks.map((t) => t.meta.order ?? 0)) : 0;
        updatedTask.meta = { ...updatedTask.meta, order: maxOrder + 1 };
        flatAll = [...flatAll.filter((t) => t.id !== id), updatedTask];
      }
    }

    const nextList = rebuildGroups(list, flatAll);
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

    // 删除任务时连带删除全部后代，避免孤儿悬挂
    const flatAll = deleteSubtaskTree(flatTasksOfList(list), id);
    const nextList = rebuildGroups(list, flatAll);

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

    // 按清单分组，分别删除（连带删除每个任务的全部后代）
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

      let flatAll = flatTasksOfList(list);
      for (const t of list.groups.flatMap((g) => g.tasks)) {
        if (idSet.has(t.id)) {
          flatAll = deleteSubtaskTree(flatAll, t.id);
        }
      }
      await saveListContent(listName, rebuildGroups(list, flatAll));
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

  toggleSubtask: async (taskId) => {
    const found = findTaskAcrossLists(taskId);
    if (!found) return;
    const ctx = requireTaskContext(found.task, found.listName);
    if (!ctx) return;
    const { listName, list, saveListContent } = ctx;

    const holidayStore = useHolidayStore.getState();
    if (holidayStore.status !== 'ready') {
      await holidayStore.loadHolidays();
    }
    const holidays = holidayStore.holidays;

    let flatAll = toggleSubtaskState(flatTasksOfList(list), taskId, nowIso());

    // 被勾选完成的任务若带重复规则，推进到下一次（后代同步重置）
    const toggled = flatAll.find((t) => t.id === taskId);
    if (toggled?.meta.status === 'done' && toggled.meta.repeat) {
      flatAll = advanceRepeatingTask(flatAll, taskId, holidays);
    }

    const nextList = rebuildGroups(list, flatAll);
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

    const holidayStore = useHolidayStore.getState();
    if (holidayStore.status !== 'ready') {
      await holidayStore.loadHolidays();
    }
    const holidays = holidayStore.holidays;

    const flatAll = flatTasksOfList(list);
    const target = flatAll.find((t) => t.id === taskId);
    if (!target || getDescendants(flatAll, taskId).length > 0) return;

    const completedAt = nowIso();
    let updated = normalizeTask(
      {
        ...target,
        meta: { ...target.meta, status: 'done' },
        completed_at: completedAt,
        duration: target.meta.start
          ? durationDays(target.meta.start, completedAt)
          : durationDays(target.meta.created, completedAt),
      },
      { explicitStatus: 'done' },
    );
    if (updated.meta.repeat) {
      // 无后代任务完成即重复：推进到下一次（后代不存在，无需重置）
      const advanced = advanceRepeatingTask(
        flatAll.map((t) => (t.id === taskId ? updated : t)),
        taskId,
        holidays,
      );
      updated = advanced.find((t) => t.id === taskId) ?? updated;
    }

    // 父链状态推断：子任务完成后祖先可能随之完成/变为进行中
    let nextFlat = flatAll.map((t) => (t.id === taskId ? updated : t));
    let cur: Task | undefined = updated;
    while (cur?.parentId) {
      const parent = nextFlat.find((t) => t.id === cur!.parentId);
      if (!parent) break;
      nextFlat = nextFlat.map((t) =>
        t.id === parent.id ? normalizeTask(parent, { descendants: getDescendants(nextFlat, parent.id) }) : t,
      );
      cur = parent;
    }

    const nextList = rebuildGroups(list, nextFlat);
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
      filter: { status: [], priority: 'all', timeRange: 'all', tags: [] },
      searchQuery: '',
    }),
  setTodoView: (key) => {
    if (key) {
      useListsStore.setState({ activeListName: null, activeGroup: null });
      useListsStore.getState().fetchAllListsContent();
      set({ todoView: key, selectedTaskId: null, filter: { status: [], priority: 'all', timeRange: 'all', tags: [] }, searchQuery: '' });
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
    let descendantHaystacks: Map<string, string> | undefined;
    if (searchQuery) {
      // 搜索时父任务的子任务命中也算匹配；按清单构建一次映射避免重复计算
      descendantHaystacks = new Map();
      const seen = new Set<string>();
      for (const task of tasks) {
        const listName = task.sourceList ?? useListsStore.getState().activeListName;
        if (!listName || seen.has(listName)) continue;
        seen.add(listName);
        const list = useListsStore.getState().fileCache[listName];
        if (!list) continue;
        for (const [id, text] of listDescendantHaystack(list)) descendantHaystacks.set(id, text);
      }
    }
    const filtered = tasks.filter((t) =>
      matchesFilter(t, filter, searchQuery, descendantHaystacks?.get(t.id) ?? ''),
    );
    return sortTasks(filtered, sortMode);
  },

  getSelectedTask: () => {
    const { selectedTaskId, tasks } = get();
    return tasks.find((t) => t.id === selectedTaskId) ?? null;
  },

  getTodoViewCounts: () => {
    const aggregated = flattenAllTasks(useListsStore.getState().fileCache);
    const keys: TodoViewKey[] = ['start-week', 'all', 'high', 'calendar'];
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const holidays = useHolidayStore.getState().holidays;
    const todayStr = todayIso();
    return keys.reduce(
      (acc, key) => {
        if (key === 'calendar') {
          // 当月日历角标：展示日期落在当月内的任务数（去重，重复任务只计一次）
          const counted = new Set<string>();
          for (const t of aggregated) {
            if (!t.meta.due) continue;
            const date = getCalendarOccurrence(t.meta.due, t.meta.repeat ?? '', t.meta.repeat_until, holidays, todayStr);
            if (date && dateStrInMonth(date, year, month)) {
              counted.add(t.id);
            }
          }
          acc[key] = counted.size;
        } else {
          acc[key] = aggregated.filter((t) => matchesTodoView(t, key)).length;
        }
        return acc;
      },
      {} as Record<TodoViewKey, number>,
    );
  },

  resetTasksState: () => {
    set({
      tasks: [],
      selectedTaskId: null,
      searchQuery: '',
      todoView: null,
      filter: { status: [], priority: 'all', timeRange: 'all', tags: [] },
    });
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

  // 清单视图下，当前清单内容被外部更新（轮询拉取、其他标签页同步）时刷新任务列表
  if (active && !useTasksStore.getState().todoView && state.fileCache !== prevState?.fileCache) {
    const entry = state.fileCache[active];
    const prevEntry = prevState?.fileCache?.[active];
    if (entry && entry.rawContent !== prevEntry?.rawContent) {
      useTasksStore.getState().refreshTasks(active);
    }
  }
});
