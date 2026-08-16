import type { Group, ParsedList, Task, TaskMeta, TaskStatus } from '@/types';
import { durationDays, nowIso } from '@/utils/date';
import { JSON_FORMAT_VERSION } from './jsonParser';

export { JSON_FORMAT_VERSION };

function inferStatus(descendants: Task[] | undefined, completedAt?: string): TaskStatus {
  if (!descendants || descendants.length === 0) {
    return completedAt ? 'done' : 'pending';
  }
  if (descendants.every((t) => t.meta.status === 'done')) return 'done';
  if (descendants.some((t) => t.meta.status === 'done')) return 'active';
  return 'pending';
}

/**
 * 根据后代任务状态推断并更新主任务状态；若调用方显式指定了状态则优先使用。
 * descendants 为该任务的所有后代（含多级），由调用方按 parentId 关系计算。
 */
export function normalizeTask(
  task: Task,
  opts?: { descendants?: Task[]; explicitStatus?: TaskMeta['status'] },
): Task {
  const inferred = inferStatus(opts?.descendants, task.completed_at);
  const nextStatus = opts?.explicitStatus ?? inferred;
  let completedAt = task.completed_at;
  let duration = task.duration;

  if (nextStatus === 'done' && !completedAt) {
    completedAt = nowIso();
    duration = task.meta.start
      ? durationDays(task.meta.start, completedAt)
      : durationDays(task.meta.created, completedAt);
  }

  if (nextStatus !== 'done') {
    completedAt = undefined;
    duration = undefined;
  }

  return {
    ...task,
    meta: { ...task.meta, status: nextStatus },
    completed_at: completedAt,
    duration,
  };
}

function serializeTask(task: Task): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    parentId: task.parentId,
    group: task.group,
    meta: task.meta,
    note: task.note ?? null,
    reflection: task.reflection ?? null,
    reminders: task.reminders ?? null,
    links: task.links ?? null,
    files: task.files ?? null,
    completed_at: task.completed_at ?? null,
    duration: task.duration ?? null,
  };
}

function serializeGroup(group: Group): Record<string, unknown> {
  return {
    name: group.name,
    tasks: group.tasks.map((task) => serializeTask(task)),
  };
}

export function serializeListToJson(list: ParsedList): string {
  const payload = {
    version: JSON_FORMAT_VERSION,
    meta: list.meta,
    groups: list.groups.map(serializeGroup),
  };
  return JSON.stringify(payload, null, 2);
}