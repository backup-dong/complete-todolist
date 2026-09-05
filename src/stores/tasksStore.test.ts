import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useListsStore } from '@/stores/listsStore';
import { useTasksStore } from '@/stores/tasksStore';
import type { ParsedList, Task } from '@/types';

function makeTask(id: string, title: string, group: string, order: number): Task {
  return {
    id,
    title,
    group,
    parentId: null,
    meta: { priority: 'med', created: '2026-07-01', order },
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
      filter: { status: [], priority: 'all', timeRange: 'all', tags: [] },
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

  it('toggleSubtask updates parent status via descendant inference', async () => {
    const list = makeList();
    list.groups[0].tasks = [
      makeTask('p', '父任务', '项目Alpha', 1),
      makeTask('c1', '子任务1', '项目Alpha', 1),
      makeTask('c2', '子任务2', '项目Alpha', 2),
    ];
    list.groups[0].tasks[1].parentId = 'p';
    list.groups[0].tasks[2].parentId = 'p';
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({ tasks: list.groups.flatMap((g) => g.tasks) });

    await useTasksStore.getState().toggleSubtask('c1');

    let cached = useListsStore.getState().fileCache['工作']!;
    let byId = new Map(cached.groups.flatMap((g) => g.tasks).map((t) => [t.id, t]));
    expect(byId.get('c1')?.meta.status).toBe('done');
    expect(byId.get('c1')?.completed_at).toBeTruthy();
    expect(byId.get('p')?.meta.status).toBe('active');

    await useTasksStore.getState().toggleSubtask('c2');

    cached = useListsStore.getState().fileCache['工作']!;
    byId = new Map(cached.groups.flatMap((g) => g.tasks).map((t) => [t.id, t]));
    expect(byId.get('p')?.meta.status).toBe('done');
    expect(byId.get('p')?.completed_at).toBeTruthy();

    await useTasksStore.getState().toggleSubtask('c1');

    cached = useListsStore.getState().fileCache['工作']!;
    byId = new Map(cached.groups.flatMap((g) => g.tasks).map((t) => [t.id, t]));
    expect(byId.get('p')?.meta.status).toBe('active');
  });

  it('updateTask with subtask tree infers parent status (dialog save path)', async () => {
    const list = makeList();
    list.groups[0].tasks = [
      makeTask('p', '父任务', '项目Alpha', 1),
      makeTask('c1', '子任务1', '项目Alpha', 1),
      makeTask('c2', '子任务2', '项目Alpha', 2),
    ];
    list.groups[0].tasks[1].parentId = 'p';
    list.groups[0].tasks[2].parentId = 'p';
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({ tasks: list.groups.flatMap((g) => g.tasks) });

    const [, c1, c2] = list.groups[0].tasks;

    // 编辑器保存：携带子任务树但不下发主任务显式状态，store 按子树推断
    await useTasksStore
      .getState()
      .updateTask('p', { subtasks: [{ ...c1, meta: { ...c1.meta, status: 'done' } }, c2] });

    let byId = new Map(
      useListsStore.getState().fileCache['工作']!.groups.flatMap((g) => g.tasks).map((t) => [t.id, t]),
    );
    expect(byId.get('c1')?.meta.status).toBe('done');
    expect(byId.get('p')?.meta.status).toBe('active');

    // 全部子任务完成 → 主任务随之完成
    await useTasksStore
      .getState()
      .updateTask('p', {
        subtasks: [
          { ...c1, meta: { ...c1.meta, status: 'done' } },
          { ...c2, meta: { ...c2.meta, status: 'done' } },
        ],
      });

    byId = new Map(
      useListsStore.getState().fileCache['工作']!.groups.flatMap((g) => g.tasks).map((t) => [t.id, t]),
    );
    expect(byId.get('p')?.meta.status).toBe('done');
    expect(byId.get('p')?.completed_at).toBeTruthy();

    // 取消一个子任务 → 主任务回到进行中
    await useTasksStore
      .getState()
      .updateTask('p', {
        subtasks: [
          { ...c1, meta: { ...c1.meta, status: 'pending' } },
          { ...c2, meta: { ...c2.meta, status: 'done' } },
        ],
      });

    byId = new Map(
      useListsStore.getState().fileCache['工作']!.groups.flatMap((g) => g.tasks).map((t) => [t.id, t]),
    );
    expect(byId.get('p')?.meta.status).toBe('active');
    expect(byId.get('p')?.completed_at).toBeFalsy();
  });

  it('getFilteredTasks supports multi-select status filter', () => {
    const list = makeList();
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({
      tasks: list.groups.flatMap((g) => g.tasks),
      filter: { status: ['pending', 'active'], priority: 'all', timeRange: 'all', tags: [] },
    });

    const filtered = useTasksStore.getState().getFilteredTasks();
    expect(filtered).toHaveLength(4);

    useTasksStore.setState({
      filter: { status: ['done'], priority: 'all', timeRange: 'all', tags: [] },
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
      filter: { status: [], priority: 'all', timeRange: 'overdue', tags: [] },
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
      filter: { status: [], priority: 'all', timeRange: 'all', tags: [] },
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

  it('setTodoView(overdue) aggregates overdue incomplete tasks', () => {
    const work = makeWorkList();
    work.groups[0].tasks.push({
      ...makeTask('w4', '已逾期工作', '项目Alpha', 4),
      meta: { ...makeTask('w4', '已逾期工作', '项目Alpha', 4).meta, due: '2026-07-01' },
    });
    useListsStore.setState({ fileCache: { 工作: work, 生活: makeLifeList() } });

    useTasksStore.getState().setTodoView('overdue');

    const tasks = useTasksStore.getState().tasks;
    expect(tasks.map((t) => t.id)).toEqual(['w4']);
  });

  it('getTodoViewCounts returns correct counts', () => {
    useListsStore.setState({ fileCache: { 工作: makeWorkList(), 生活: makeLifeList() } });

    const counts = useTasksStore.getState().getTodoViewCounts();
    expect(counts).toEqual({ overdue: 0, all: 4, high: 2, calendar: 3 });
  });

  it('completing task in todo view routes to source list and refreshes view', async () => {
    useListsStore.setState({ fileCache: { 工作: makeWorkList(), 生活: makeLifeList() } });
    useTasksStore.getState().setTodoView('all');

    await useTasksStore.getState().completeTaskWithoutSubtasks('w1');

    const workList = useListsStore.getState().fileCache['工作'];
    const completedTask = workList!.groups[0].tasks.find((t) => t.id === 'w1');
    expect(completedTask?.meta.status).toBe('done');

    const remaining = useTasksStore.getState().tasks;
    expect(remaining.map((t) => t.id).sort()).toEqual(['l1', 'l2', 'w2']);
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

describe('tasksStore tags', () => {
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
      filter: { status: [], priority: 'all', timeRange: 'all', tags: [] },
      searchQuery: '',
      todoView: null,
    });
  });

  function taggedTask(id: string, tags: string[], extra: Partial<Task> = {}): Task {
    return {
      ...makeTask(id, id, '项目Alpha', 1),
      meta: { ...makeTask(id, id, '项目Alpha', 1).meta, tags },
      ...extra,
    };
  }

  it('getFilteredTasks filters by tag with OR semantics', () => {
    const list: ParsedList = {
      meta: { name: '工作', created: '2026-07-01', archived: false },
      groups: [
        {
          name: '项目Alpha',
          tasks: [taggedTask('a', ['x']), taggedTask('b', ['y']), taggedTask('c', ['x', 'y']), taggedTask('d', [])],
        },
      ],
      rawContent: '',
    };
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({ tasks: list.groups.flatMap((g) => g.tasks) });

    useTasksStore.setState({ filter: { status: [], priority: 'all', timeRange: 'all', tags: ['x'] } });
    expect(useTasksStore.getState().getFilteredTasks().map((t) => t.id).sort()).toEqual(['a', 'c']);

    useTasksStore.setState({ filter: { status: [], priority: 'all', timeRange: 'all', tags: ['x', 'y'] } });
    expect(useTasksStore.getState().getFilteredTasks().map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('tag filter composes with status filter', () => {
    const list: ParsedList = {
      meta: { name: '工作', created: '2026-07-01', archived: false },
      groups: [
        {
          name: '项目Alpha',
          tasks: [
            {
              ...makeTask('a', '已完成带标签', '项目Alpha', 1),
              meta: { ...makeTask('a', '已完成带标签', '项目Alpha', 1).meta, tags: ['x'], status: 'done' },
            },
            taggedTask('b', ['x']),
          ],
        },
      ],
      rawContent: '',
    };
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({ tasks: list.groups.flatMap((g) => g.tasks) });
    useTasksStore.setState({
      filter: { status: ['done'], priority: 'all', timeRange: 'all', tags: ['x'] },
    });
    expect(useTasksStore.getState().getFilteredTasks().map((t) => t.id)).toEqual(['a']);
  });

  it('clearFilters resets tags', () => {
    useTasksStore.setState({ filter: { status: [], priority: 'all', timeRange: 'all', tags: ['x'] } });
    useTasksStore.getState().clearFilters();
    expect(useTasksStore.getState().filter.tags).toEqual([]);
  });

  it('setTodoView resets tags filter', () => {
    useListsStore.setState({ fileCache: { 工作: makeList() } });
    useTasksStore.setState({ filter: { status: [], priority: 'all', timeRange: 'all', tags: ['x'] } });
    useTasksStore.getState().setTodoView('all');
    expect(useTasksStore.getState().filter.tags).toEqual([]);
  });

  it('updateTask saves and clears tags', async () => {
    const list = makeList();
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({ tasks: list.groups.flatMap((g) => g.tasks) });

    await useTasksStore.getState().updateTask('t1', { meta: { tags: ['x', 'y'] } });
    let cached = useListsStore.getState().fileCache['工作']!;
    let byId = new Map(cached.groups.flatMap((g) => g.tasks).map((t) => [t.id, t]));
    expect(byId.get('t1')?.meta.tags).toEqual(['x', 'y']);

    await useTasksStore.getState().updateTask('t1', { meta: { tags: undefined } });
    cached = useListsStore.getState().fileCache['工作']!;
    byId = new Map(cached.groups.flatMap((g) => g.tasks).map((t) => [t.id, t]));
    expect(byId.get('t1')?.meta.tags).toBeUndefined();
  });

  it('search matches tags', () => {
    const list: ParsedList = {
      meta: { name: '工作', created: '2026-07-01', archived: false },
      groups: [
        {
          name: '项目Alpha',
          tasks: [taggedTask('a', ['urgent'])],
        },
      ],
      rawContent: '',
    };
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({ tasks: list.groups.flatMap((g) => g.tasks), searchQuery: 'urgent' });
    expect(useTasksStore.getState().getFilteredTasks().map((t) => t.id)).toEqual(['a']);
  });

  it('search matches subtask text', () => {
    const list: ParsedList = {
      meta: { name: '工作', created: '2026-07-01', archived: false },
      groups: [
        {
          name: '项目Alpha',
          tasks: [
            { ...makeTask('a', '父任务', '项目Alpha', 1) },
            {
              id: 'a1',
              title: '关于竞品的关键调研报告',
              group: '项目Alpha',
              parentId: 'a',
              meta: { priority: 'med', created: '2026-07-01', order: 1 },
            },
          ],
        },
      ],
      rawContent: '',
    };
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({
      tasks: list.groups.flatMap((g) => g.tasks).filter((t) => t.parentId === null),
      searchQuery: '关键',
    });
    expect(useTasksStore.getState().getFilteredTasks().map((t) => t.id)).toEqual(['a']);

    useTasksStore.setState({ searchQuery: '不存在的词' });
    expect(useTasksStore.getState().getFilteredTasks()).toEqual([]);
  });
});

describe('tasksStore pinned sort', () => {
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
      filter: { status: [], priority: 'all', timeRange: 'all', tags: [] },
      searchQuery: '',
      todoView: null,
    });
  });

  function seed(tasks: Task[]) {
    const list: ParsedList = {
      meta: { name: '工作', created: '2026-07-01', archived: false },
      groups: [{ name: '默认分组', tasks }],
      rawContent: '',
    };
    useListsStore.setState({ fileCache: { 工作: list } });
    useTasksStore.setState({ tasks: tasks.filter((t) => t.parentId === null) });
  }

  it('pinned tasks sort above all unpinned tasks in drag mode, regardless of order', () => {
    const pinned = { ...makeTask('p1', '置顶', '默认分组', 99), meta: { ...makeTask('p1', '置顶', '默认分组', 99).meta, pinned: true as const } };
    seed([
      makeTask('t1', '任务1', '默认分组', 1),
      makeTask('t2', '任务2', '默认分组', 2),
      pinned,
    ]);
    expect(useTasksStore.getState().getFilteredTasks().map((t) => t.id)).toEqual(['p1', 't1', 't2']);
  });

  it('pinned tasks sort first in due mode; pinned group still orders by due', () => {
    const withDue = (id: string, order: number, due?: string, pinned?: boolean): Task => ({
      ...makeTask(id, id, '默认分组', order),
      meta: { ...makeTask(id, id, '默认分组', order).meta, due, pinned },
    });
    useTasksStore.setState({ sortMode: 'due' });
    seed([
      withDue('t1', 1, '2026-07-01'),
      withDue('p1', 2, '2026-08-01', true), // 置顶但截止更晚
      withDue('p2', 3, '2026-07-15', true), // 置顶且截止更早
      withDue('t2', 4, '2026-06-01'), // 非置顶但截止最早
    ]);
    expect(useTasksStore.getState().getFilteredTasks().map((t) => t.id)).toEqual(['p2', 'p1', 't2', 't1']);
  });

  it('pinned tasks sort first in priority mode; pinned group still orders by priority', () => {
    const withPriority = (id: string, order: number, priority: Task['meta']['priority'], pinned?: boolean): Task => ({
      ...makeTask(id, id, '默认分组', order),
      meta: { ...makeTask(id, id, '默认分组', order).meta, priority, pinned },
    });
    useTasksStore.setState({ sortMode: 'priority' });
    seed([
      withPriority('t1', 1, 'high'),
      withPriority('p1', 2, 'low', true), // 置顶但优先级最低
      withPriority('p2', 3, 'high', true),
    ]);
    expect(useTasksStore.getState().getFilteredTasks().map((t) => t.id)).toEqual(['p2', 'p1', 't1']);
  });

  it('updateTask persists pinned flag via meta merge', async () => {
    seed([makeTask('t1', '任务1', '默认分组', 1)]);
    await useTasksStore.getState().updateTask('t1', { meta: { pinned: true } });
    const updated = useListsStore.getState().fileCache['工作']!.groups[0].tasks[0];
    expect(updated.meta.pinned).toBe(true);

    await useTasksStore.getState().updateTask('t1', { meta: { pinned: undefined } });
    expect(useListsStore.getState().fileCache['工作']!.groups[0].tasks[0].meta.pinned).toBeUndefined();
  });

  it('reorderTasksInGroup is a no-op when dragging across the pinned boundary', async () => {
    const pinned = { ...makeTask('p1', '置顶', '默认分组', 1), meta: { ...makeTask('p1', '置顶', '默认分组', 1).meta, pinned: true as const } };
    seed([pinned, makeTask('t1', '任务1', '默认分组', 2), makeTask('t2', '任务2', '默认分组', 3)]);

    // p1 在下标 0，t2 在下标 2：跨界拖动应为 no-op
    await useTasksStore.getState().reorderTasksInGroup('默认分组', 0, 2);
    const groupTasks = useListsStore.getState().fileCache['工作']!.groups[0].tasks;
    expect(groupTasks.map((t) => t.id)).toEqual(['p1', 't1', 't2']);
    expect(groupTasks.map((t) => t.meta.order)).toEqual([1, 2, 3]);
  });

  it('reorderTasksInGroup reorders within the unpinned segment by display order', async () => {
    const pinned = { ...makeTask('p1', '置顶', '默认分组', 1), meta: { ...makeTask('p1', '置顶', '默认分组', 1).meta, pinned: true as const } };
    seed([pinned, makeTask('t1', '任务1', '默认分组', 2), makeTask('t2', '任务2', '默认分组', 3)]);

    // 展示顺序 [p1, t1, t2]，把 t1 拖到末尾（下标 1 → 2）
    await useTasksStore.getState().reorderTasksInGroup('默认分组', 1, 2);
    const groupTasks = useListsStore.getState().fileCache['工作']!.groups[0].tasks;
    expect(groupTasks.map((t) => t.id)).toEqual(['p1', 't2', 't1']);
    expect(groupTasks.map((t) => t.meta.order)).toEqual([1, 2, 3]);
    expect(groupTasks[0].meta.pinned).toBe(true);
  });
});
