import type { Group, ParsedList, Subtask, Task, TaskMeta } from '@/types';
import { durationDays, nowIso, todayIso } from '@/utils/date';
import { inferStatus } from './scanner';

const META_ORDER: (keyof TaskMeta)[] = [
  'status',
  'priority',
  'created',
  'start',
  'due',
  'repeat',
  'repeat_until',
  'repeat_count',
  'order',
  'tags',
];

export function serializeMetadataLine(meta: TaskMeta): string {
  const parts: string[] = [];
  for (const key of META_ORDER) {
    const value = meta[key];
    if (value === undefined) continue;
    if (key === 'tags') {
      parts.push(`tags: ${(value as string[]).join(',')}`);
    } else {
      parts.push(`${key}: ${value}`);
    }
  }
  return parts.join(' | ');
}

function serializeSubtasks(subtasks: Subtask[], indent = 0): string[] {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);
  for (const s of subtasks) {
    const marker = s.completed ? '- [x]' : '- [ ]';
    const time = s.completed && s.completed_at ? ` (${s.completed_at})` : '';
    lines.push(`${prefix}${marker} ${s.text}${time}`);
    if (s.start) {
      lines.push(`${prefix}  start: ${s.start}`);
    }
    if (s.due) {
      lines.push(`${prefix}  due: ${s.due}`);
    }
    if (s.note) {
      lines.push(`${prefix}  note: ${s.note}`);
    }
    if (s.links?.length) {
      for (const link of s.links) {
        lines.push(`${prefix}  link: [${link.title}](${link.url})`);
      }
    }
    lines.push(...serializeSubtasks(s.children, indent + 1));
  }
  return lines;
}

export function normalizeTask(task: Task, explicitStatus?: TaskMeta['status']): Task {
  // 根据子任务状态推断并更新主任务状态；若调用方显式指定了状态则优先使用
  const inferred = inferStatus(task.subtasks, task.completed_at);
  const nextStatus = explicitStatus ?? inferred;
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

export function serializeTask(task: Task): string {
  const normalized = normalizeTask(task);
  const lines: string[] = [];
  lines.push(`### ${normalized.title}`);
  lines.push(serializeMetadataLine(normalized.meta));
  lines.push('');
  lines.push(...serializeSubtasks(normalized.subtasks));
  lines.push('');

  if (normalized.note) {
    lines.push('**备注**');
    lines.push(normalized.note);
    lines.push('');
  }

  if (normalized.links?.length) {
    lines.push('**链接**');
    for (const link of normalized.links) {
      lines.push(`- [${link.title}](${link.url})`);
    }
    lines.push('');
  }

  if (normalized.completed_at) {
    lines.push(`🏁 ${normalized.completed_at} | ⏱ ${normalized.duration ?? ''}`);
    lines.push('');
  }

  lines.push('---');
  return lines.join('\n');
}

export function serializeGroup(group: Group): string {
  const lines: string[] = [];
  lines.push(`## ${group.name}`);
  lines.push('');
  for (const task of group.tasks) {
    lines.push(serializeTask(task));
    lines.push('');
  }
  return lines.join('\n');
}

export function serializeList(list: ParsedList): string {
  const lines: string[] = [];
  lines.push(`# ${list.meta.name}`);
  lines.push('');
  lines.push(`<!-- todo:list-meta
  created: ${list.meta.created}
  archived: ${list.meta.archived}
-->`);
  lines.push('');

  for (const group of list.groups) {
    lines.push(serializeGroup(group));
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function normalizeList(list: ParsedList): ParsedList {
  const normalized: ParsedList = {
    ...list,
    groups: list.groups.map((g) => ({
      ...g,
      tasks: g.tasks.map((t) => normalizeTask(t)),
    })),
  };
  const content = serializeList(normalized);
  return { ...normalized, rawContent: content };
}

export function createEmptyList(name: string): ParsedList {
  return {
    meta: { name, created: todayIso(), archived: false },
    groups: [{ name: '默认分组', tasks: [] }],
    rawContent: '',
  };
}
