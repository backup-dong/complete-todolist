import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useListsStore } from '@/stores/listsStore';
import { useTasksStore } from '@/stores/tasksStore';
import type { ParsedList, Task } from '@/types';

function makeTask(id: string, title: string, group: string, order: number): Task {
  return {
    id,
    title,
    group,
    meta: { priority: 'med', created: '2026-07-01', order },
    subtasks: [],
  };
}

function makeList(): ParsedList {
  return {
    meta: { name: '工作', created: '2026-07-01', archived: false },
    groups: [
      {
        name: '项目Alpha',
        tasks: [
          makeTask('t1', '任务1', '项目Alpha', 1),
          makeTask('t2', '任务2', '项目Alpha', 2),
          makeTask('t3', '任务3', '项目Alpha', 3),
        ],
      },
      {
        name: '项目Beta',
        tasks: [makeTask('t4', '任务4', '项目Beta', 1)],
      },
    ],
    rawContent: '',
  };
}

describe('tasksStore reorder', () => {
  beforeEach(() => {
    useListsStore.setState({
      lists: [],
      activeListName: '工作',
      activeGroup: null,
      fileCache: {},
    });
    useTasksStore.setState({
      tasks: [],
      selectedTaskId: null,
      sortMode: 'drag',
      filter: { status: [], priority: 'all', timeRange: 'all' },
      searchQuery: '',
      todoView: null,
    });
  });

  it('reorderTasksInGroup keeps array order and meta.order in sync', async () => {
    const list = makeList();
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({ tasks: list.groups.flatMap((g) => g.tasks) });

    await useTasksStore.getState().reorderTasksInGroup('项目Alpha', 0, 2);

    const updated = useListsStore.getState().fileCache['工作'];
    const groupTasks = updated!.groups[0].tasks;
    expect(groupTasks.map((t) => t.id)).toEqual(['t2', 't3', 't1']);
    expect(groupTasks.map((t) => t.meta.order)).toEqual([1, 2, 3]);
    expect(updated!.groups[1].tasks.map((t) => t.id)).toEqual(['t4']);
  });

  it('reorderTasks keeps array order and meta.order in sync within active group', async () => {
    const list = makeList();
    useListsStore.setState({ activeGroup: '项目Alpha', fileCache: { 工作: list } });
    useTasksStore.setState({ tasks: list.groups.flatMap((g) => g.tasks) });

    // 在「项目Alpha」分组视图下，把第 1 个任务拖到最后
    await useTasksStore.getState().reorderTasks(0, 2);

    const updated = useListsStore.getState().fileCache['工作'];
    const groupTasks = updated!.groups[0].tasks;
    expect(groupTasks.map((t) => t.id)).toEqual(['t2', 't3', 't1']);
    expect(groupTasks.map((t) => t.meta.order)).toEqual([1, 2, 3]);
    expect(updated!.groups[1].tasks.map((t) => t.id)).toEqual(['t4']);
  });

  it('updateTask moves task to another group and updates both groups', async () => {
    const list = makeList();
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({ tasks: list.groups.flatMap((g) => g.tasks) });

    await useTasksStore.getState().updateTask('t1', { group: '项目Beta' });

    const updated = useListsStore.getState().fileCache['工作'];
    expect(updated!.groups[0].tasks.map((t) => t.id)).toEqual(['t2', 't3']);
    expect(updated!.groups[1].tasks.map((t) => t.id)).toEqual(['t4', 't1']);
    expect(updated!.groups[1].tasks.find((t) => t.id === 't1')?.group).toBe('项目Beta');
  });

  it('deleteTasks removes multiple tasks across groups', async () => {
    const list = makeList();
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({ tasks: list.groups.flatMap((g) => g.tasks), selectedTaskId: 't1' });

    await useTasksStore.getState().deleteTasks(['t1', 't4']);

    const updated = useListsStore.getState().fileCache['工作'];
    expect(updated!.groups[0].tasks.map((t) => t.id)).toEqual(['t2', 't3']);
    expect(updated!.groups[1].tasks.map((t) => t.id)).toEqual([]);
    expect(useTasksStore.getState().selectedTaskId).toBeNull();
  });

  it('getFilteredTasks supports multi-select status filter', () => {
    const list = makeList();
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({
      tasks: list.groups.flatMap((g) => g.tasks),
      filter: { status: ['pending', 'active'], priority: 'all', timeRange: 'all' },
    });

    const filtered = useTasksStore.getState().getFilteredTasks();
    expect(filtered).toHaveLength(4);

    useTasksStore.setState({
      filter: { status: ['done'], priority: 'all', timeRange: 'all' },
    });
    expect(useTasksStore.getState().getFilteredTasks()).toHaveLength(0);
  });

  it('overdue timeRange filter excludes completed tasks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00'));

    const list = makeList();
    list.groups[0].tasks = [
      {
        ...makeTask('t1', '逾期未完成', '项目Alpha', 1),
        meta: { ...makeTask('t1', '逾期未完成', '项目Alpha', 1).meta, due: '2026-07-01' },
      },
      {
        ...makeTask('t2', '逾期已完成', '项目Alpha', 2),
        meta: { ...makeTask('t2', '逾期已完成', '项目Alpha', 2).meta, due: '2026-07-01', status: 'done' },
      },
      {
        ...makeTask('t3', '今天截止', '项目Alpha', 3),
        meta: { ...makeTask('t3', '今天截止', '项目Alpha', 3).meta, due: '2026-07-10' },
      },
    ];

    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({
      tasks: list.groups.flatMap((g) => g.tasks),
      filter: { status: [], priority: 'all', timeRange: 'overdue' },
    });

    try {
      const filtered = useTasksStore.getState().getFilteredTasks();
      expect(filtered.map((t) => t.id)).toEqual(['t1']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('tasksStore todo views', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00'));

    useListsStore.setState({
      lists: [],
      activeListName: '工作',
      activeGroup: null,
      fileCache: {},
    });
    useTasksStore.setState({
      tasks: [],
      selectedTaskId: null,
      sortMode: 'drag',
      filter: { status: [], priority: 'all', timeRange: 'all' },
      searchQuery: '',
      todoView: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeWorkList(): ParsedList {
    return {
      meta: { name: '工作', created: '2026-07-01', archived: false },
      groups: [
        {
          name: '项目Alpha',
          tasks: [
            { ...makeTask('w1', '今天工作', '项目Alpha', 1), meta: { ...makeTask('w1', '今天工作', '项目Alpha', 1).meta, due: '2026-07-10', priority: 'high' } },
            { ...makeTask('w2', '本周工作', '项目Alpha', 2), meta: { ...makeTask('w2', '本周工作', '项目Alpha', 2).meta, due: '2026-07-12' } },
            { ...makeTask('w3', '已完成工作', '项目Alpha', 3), meta: { ...makeTask('w3', '已完成工作', '项目Alpha', 3).meta, status: 'done' } },
          ],
        },
      ],
      rawContent: '',
    };
  }

  function makeLifeList(): ParsedList {
    return {
      meta: { name: '生活', created: '2026-07-01', archived: false },
      groups: [
        {
          name: '购物',
          tasks: [
            { ...makeTask('l1', '今天购物', '购物', 1), meta: { ...makeTask('l1', '今天购物', '购物', 1).meta, due: '2026-07-10' } },
            { ...makeTask('l2', '高优先级生活', '购物', 2), meta: { ...makeTask('l2', '高优先级生活', '购物', 2).meta, priority: 'high' } },
          ],
        },
      ],
      rawContent: '',
    };
  }

  it('setTodoView(today) aggregates tasks due today across lists', () => {
    useListsStore.setState({ fileCache: { 工作: makeWorkList(), 生活: makeLifeList() } });

    useTasksStore.getState().setTodoView('today');

    const tasks = useTasksStore.getState().tasks;
    expect(tasks.map((t) => t.id).sort()).toEqual(['l1', 'w1']);
    expect(tasks.every((t) => t.sourceList)).toBe(true);
  });

  it('setTodoView(week) aggregates tasks due this week', () => {
    useListsStore.setState({ fileCache: { 工作: makeWorkList(), 生活: makeLifeList() } });

    useTasksStore.getState().setTodoView('week');

    const tasks = useTasksStore.getState().tasks;
    expect(tasks.map((t) => t.id).sort()).toEqual(['l1', 'w1', 'w2']);
  });

  it('setTodoView(high) aggregates high priority incomplete tasks', () => {
    useListsStore.setState({ fileCache: { 工作: makeWorkList(), 生活: makeLifeList() } });

    useTasksStore.getState().setTodoView('high');

    const tasks = useTasksStore.getState().tasks;
    expect(tasks.map((t) => t.id).sort()).toEqual(['l2', 'w1']);
  });

  it('setTodoView(all) aggregates all incomplete tasks', () => {
    useListsStore.setState({ fileCache: { 工作: makeWorkList(), 生活: makeLifeList() } });

    useTasksStore.getState().setTodoView('all');

    const tasks = useTasksStore.getState().tasks;
    expect(tasks.map((t) => t.id).sort()).toEqual(['l1', 'l2', 'w1', 'w2']);
  });

  it('getTodoViewCounts returns correct counts', () => {
    useListsStore.setState({ fileCache: { 工作: makeWorkList(), 生活: makeLifeList() } });

    const counts = useTasksStore.getState().getTodoViewCounts();
    expect(counts).toEqual({ today: 2, week: 3, all: 4, high: 2 });
  });

  it('completing task in todo view routes to source list and refreshes view', async () => {
    useListsStore.setState({ fileCache: { 工作: makeWorkList(), 生活: makeLifeList() } });
    useTasksStore.getState().setTodoView('today');

    await useTasksStore.getState().completeTaskWithoutSubtasks('w1');

    const workList = useListsStore.getState().fileCache['工作'];
    const completedTask = workList!.groups[0].tasks.find((t) => t.id === 'w1');
    expect(completedTask?.meta.status).toBe('done');

    const remaining = useTasksStore.getState().tasks;
    expect(remaining.map((t) => t.id)).toEqual(['l1']);
  });

  it('updateTask in todo view routes to source list', async () => {
    useListsStore.setState({ fileCache: { 工作: makeWorkList(), 生活: makeLifeList() } });
    useTasksStore.getState().setTodoView('all');

    await useTasksStore.getState().updateTask('l2', { title: '修改后的生活任务' });

    const lifeList = useListsStore.getState().fileCache['生活'];
    expect(lifeList!.groups[0].tasks.find((t) => t.id === 'l2')?.title).toBe('修改后的生活任务');
    expect(useTasksStore.getState().tasks.find((t) => t.id === 'l2')?.title).toBe('修改后的生活任务');
  });
});
