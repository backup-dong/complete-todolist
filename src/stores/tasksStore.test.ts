import { describe, it, expect, beforeEach } from 'vitest';
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
});
