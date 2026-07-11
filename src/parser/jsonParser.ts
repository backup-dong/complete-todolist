import type { Group, Link, ListMeta, ParsedList, Subtask, Task, TaskMeta } from '@/types';
import { todayIso } from '@/utils/date';
import { generateTaskId } from '@/utils/id';

export const JSON_FORMAT_VERSION = 1;

export function inferJsonVersion(content: string): number {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('{')) return 0;
  try {
    const parsed = JSON.parse(trimmed) as { version?: number };
    return typeof parsed.version === 'number' ? parsed.version : 0;
  } catch {
    return 0;
  }
}

function defaultListMeta(partial: Partial<ListMeta> = {}): ListMeta {
  return {
    name: partial.name ?? '未命名清单',
    created: partial.created ?? todayIso(),
    archived: partial.archived ?? false,
  };
}

function defaultTaskMeta(partial: Partial<TaskMeta> = {}): TaskMeta {
  return {
    priority: partial.priority ?? 'med',
    created: partial.created ?? todayIso(),
    status: partial.status,
    start: partial.start,
    due: partial.due,
    repeat: partial.repeat,
    repeat_until: partial.repeat_until,
    repeat_count: partial.repeat_count,
    order: partial.order,
    tags: partial.tags,
  };
}

function normalizeLink(raw: unknown): Link | null {
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string' || typeof r.url !== 'string') return null;
  return { title: r.title, url: r.url };
}

function normalizeSubtask(raw: unknown): Subtask {
  const r = raw as Record<string, unknown>;
  const text = typeof r.text === 'string' ? r.text : '';
  const level = typeof r.level === 'number' ? r.level : 1;
  const completed = Boolean(r.completed);
  const children = Array.isArray(r.children) ? r.children.map(normalizeSubtask) : [];

  const subtask: Subtask = {
    text,
    level,
    completed,
    children,
  };

  if (typeof r.completed_at === 'string') subtask.completed_at = r.completed_at;
  if (typeof r.start === 'string') subtask.start = r.start;
  if (typeof r.due === 'string') subtask.due = r.due;
  if (typeof r.note === 'string') subtask.note = r.note;
  if (Array.isArray(r.links)) {
    subtask.links = r.links.map(normalizeLink).filter(Boolean) as Link[];
  }

  return subtask;
}

function normalizeTask(raw: unknown, groupName: string): Task {
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title : '';
  const rawMeta = (typeof r.meta === 'object' && r.meta !== null ? r.meta : {}) as Partial<TaskMeta>;
  const created = rawMeta.created ?? todayIso();
  const id = typeof r.id === 'string' && r.id ? r.id : generateTaskId(title, created);

  const task: Task = {
    id,
    title,
    meta: defaultTaskMeta(rawMeta),
    subtasks: Array.isArray(r.subtasks) ? r.subtasks.map(normalizeSubtask) : [],
    group: typeof r.group === 'string' ? r.group : groupName,
  };

  if (typeof r.note === 'string') task.note = r.note;
  if (Array.isArray(r.links)) {
    task.links = r.links.map(normalizeLink).filter(Boolean) as Link[];
  }
  if (typeof r.completed_at === 'string') task.completed_at = r.completed_at;
  if (typeof r.duration === 'string') task.duration = r.duration;

  return task;
}

function normalizeGroup(raw: unknown): Group {
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name : '默认分组';
  return {
    name,
    tasks: Array.isArray(r.tasks) ? r.tasks.map((t) => normalizeTask(t, name)) : [],
  };
}

export function parseJsonToList(content: string, sha?: string): ParsedList {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    throw Object.assign(
      new Error(`Invalid JSON list content: ${err instanceof Error ? err.message : String(err)}`),
      { cause: err },
    );
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new Error('JSON list must be an object');
  }

  const obj = raw as Record<string, unknown>;
  const version = typeof obj.version === 'number' ? obj.version : undefined;

  if (version !== JSON_FORMAT_VERSION) {
    throw new Error(`Unsupported JSON list version: ${version}`);
  }

  const meta = defaultListMeta(
    typeof obj.meta === 'object' && obj.meta !== null ? (obj.meta as ListMeta) : {},
  );
  const groups = Array.isArray(obj.groups) ? obj.groups.map(normalizeGroup) : [];

  if (groups.length === 0) {
    groups.push({ name: '默认分组', tasks: [] });
  }

  return {
    meta,
    groups,
    rawContent: content,
    sha,
  };
}
