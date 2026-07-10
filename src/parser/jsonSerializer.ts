import type { ParsedList, Subtask, Task } from '@/types';
import { normalizeTask } from './serializer';

export const JSON_FORMAT_VERSION = 1;

function serializeSubtask(subtask: Subtask): unknown {
  return {
    text: subtask.text,
    level: subtask.level,
    completed: subtask.completed,
    completed_at: subtask.completed_at ?? null,
    start: subtask.start ?? null,
    due: subtask.due ?? null,
    note: subtask.note ?? null,
    links: subtask.links ?? null,
    children: subtask.children.map(serializeSubtask),
  };
}

function serializeTask(task: Task): unknown {
  const normalized = normalizeTask(task);
  return {
    id: normalized.id,
    title: normalized.title,
    group: normalized.group,
    meta: normalized.meta,
    subtasks: normalized.subtasks.map(serializeSubtask),
    note: normalized.note ?? null,
    links: normalized.links ?? null,
    completed_at: normalized.completed_at ?? null,
    duration: normalized.duration ?? null,
  };
}

export function serializeListToJson(list: ParsedList): string {
  const payload = {
    version: JSON_FORMAT_VERSION,
    meta: list.meta,
    groups: list.groups.map((group) => ({
      name: group.name,
      tasks: group.tasks.map(serializeTask),
    })),
  };

  return JSON.stringify(payload, null, 2);
}
