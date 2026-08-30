import type { Task } from '@/types';
import { durationDays } from '@/utils/date';
import { normalizeTask } from '@/parser';

export function topLevelTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.parentId === null);
}

function sortByOrder(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0));
}

/**
 * flat 数组 → 树。纯函数：只复制不改原对象，同父按 meta.order 排序挂载。
 * rootId 为 null 时返回顶层任务树，否则返回以 rootId 为根的后代子树。
 */
export function buildSubtaskTree(tasks: Task[], rootId: string | null = null): Task[] {
  const byParent = new Map<string, Task[]>();
  for (const task of tasks) {
    const parent = task.parentId ?? '';
    const list = byParent.get(parent) ?? [];
    list.push(task);
    byParent.set(parent, list);
  }

  const build = (parentKey: string): Task[] =>
    sortByOrder(byParent.get(parentKey) ?? []).map((task) => ({
      ...task,
      subtasks: build(task.id),
    }));

  return build(rootId ?? '');
}

/**
 * 树 → flat 数组。纯函数：逐层写入 parentId 与 meta.order（按数组顺序），
 * 剥掉内存中的 subtasks 字段，返回可供持久化的扁平任务数组。
 */
export function flattenSubtaskTree(children: Task[], parentId: string | null, orderStart = 1): Task[] {
  const result: Task[] = [];
  const walk = (items: Task[], parent: string | null, start: number) => {
    items.forEach((child, i) => {
      const { subtasks, ...rest } = child;
      result.push({
        ...rest,
        parentId: parent,
        meta: { ...rest.meta, order: start + i },
      } as Task);
      if (subtasks && subtasks.length > 0) {
        walk(subtasks, child.id, 1);
      }
    });
  };
  walk(children, parentId, orderStart);
  return result;
}

/** 全部后代（BFS，含多级）。 */
export function getDescendants(tasks: Task[], taskId: string): Task[] {
  const byParent = new Map<string, Task[]>();
  for (const task of tasks) {
    const parent = task.parentId ?? '';
    const list = byParent.get(parent) ?? [];
    list.push(task);
    byParent.set(parent, list);
  }
  const result: Task[] = [];
  const queue = [...(byParent.get(taskId) ?? [])];
  while (queue.length > 0) {
    const task = queue.shift()!;
    result.push(task);
    queue.push(...(byParent.get(task.id) ?? []));
  }
  return result;
}

/** 祖先链（自近而远，不含自身）。 */
export function getAncestors(tasks: Task[], taskId: string): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const result: Task[] = [];
  let cur = byId.get(taskId);
  while (cur?.parentId) {
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    result.push(parent);
    cur = parent;
  }
  return result;
}

/** 返回 taskId 的最顶层祖先 id；taskId 自身为顶层或不存在时返回 taskId。 */
export function topLevelAncestorId(tasks: Task[], taskId: string): string {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let cur = byId.get(taskId);
  while (cur?.parentId && byId.has(cur.parentId)) {
    cur = byId.get(cur.parentId);
  }
  return cur ? cur.id : taskId;
}

function setTaskDone(task: Task, now: string): Task {
  return normalizeTask(
    {
      ...task,
      meta: { ...task.meta, status: 'done' },
      completed_at: now,
      duration: task.meta.start
        ? durationDays(task.meta.start, now)
        : durationDays(task.meta.created, now),
    },
    { explicitStatus: 'done' },
  );
}

function setTaskPending(task: Task): Task {
  return normalizeTask(task, { explicitStatus: 'pending' });
}

/**
 * 切换某个任务（任意层级）的完成状态：done ↔ 未完成，并沿祖先链重新推断状态。
 * 纯函数返回新 flat 数组；不在本函数内处理重复任务推进（由调用方负责）。
 */
export function toggleSubtaskState(tasks: Task[], taskId: string, now: string): Task[] {
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return tasks;

  const isDone = target.meta.status === 'done';
  // 先更新目标任务，祖先推断基于已更新的数组逐级向上，保证级联状态正确
  let next = tasks.map((t) =>
    t.id === taskId ? (isDone ? setTaskPending(target) : setTaskDone(target, now)) : t,
  );

  for (const ancestor of getAncestors(tasks, taskId)) {
    next = next.map((t) =>
      t.id === ancestor.id
        ? normalizeTask(ancestor, { descendants: getDescendants(next, ancestor.id) })
        : t,
    );
  }

  return next;
}

/** 重置某任务的全部后代为未完成（重复任务推进时使用）。 */
export function resetDescendants(tasks: Task[], taskId: string): Task[] {
  const idSet = new Set(getDescendants(tasks, taskId).map((t) => t.id));
  if (idSet.size === 0) return tasks;
  return tasks.map((t) =>
    idSet.has(t.id) ? { ...t, meta: { ...t.meta, status: 'pending' }, completed_at: undefined, duration: undefined } : t,
  );
}

/** 删除任务及其全部后代（后代在 flat 数组中同样移除，避免孤儿悬挂）。 */
export function deleteSubtaskTree(tasks: Task[], taskId: string): Task[] {
  const idSet = new Set([taskId, ...getDescendants(tasks, taskId).map((t) => t.id)]);
  return tasks.filter((t) => !idSet.has(t.id));
}

/** 用新的子任务树替换某个任务的全部后代（编辑器保存时回写）。 */
export function replaceSubtree(tasks: Task[], rootId: string, newChildren: Task[]): Task[] {
  const idSet = new Set(getDescendants(tasks, rootId).map((t) => t.id));
  const remaining = tasks.filter((t) => !idSet.has(t.id));
  return [...remaining, ...flattenSubtaskTree(newChildren, rootId)];
}