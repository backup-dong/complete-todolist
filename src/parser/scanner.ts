import type { Group, Link, ListMeta, ParsedList, Subtask, Task, TaskMeta } from '@/types';
import { generateTaskId } from '@/utils/id';
import { durationDays, nowIso, todayIso } from '@/utils/date';

interface TaskBlock {
  heading: string;
  metadata: string;
  bodyLines: string[];
}

interface RawGroup {
  name: string;
  blocks: TaskBlock[];
}

function isMetaLine(line: string): boolean {
  // 任务元数据行必须顶格，不能有前导缩进；子任务属性行有缩进，不能被误判为元数据
  return /^[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*.+$/.test(line);
}

function parseListMeta(line: string): Partial<ListMeta> {
  const result: Partial<ListMeta> = {};
  const content = line.replace(/^\s*<!--\s*todo:list-meta\s*/, '').replace(/\s*--\s*>\s*$/, '');
  const parts = content.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    switch (key) {
      case 'created':
        result.created = value;
        break;
      case 'archived':
        result.archived = value === 'true';
        break;
    }
  }
  return result;
}

export function scanBlocks(lines: string[]): { title: string; meta: ListMeta; groups: RawGroup[] } {
  let title = '';
  let listMeta: Partial<ListMeta> = {};
  const groups: RawGroup[] = [];
  let currentGroup: RawGroup | null = null;
  let currentBlock: TaskBlock | null = null;

  function flushCurrentBlock(): void {
    if (currentBlock) {
      currentGroup?.blocks.push(currentBlock);
      currentBlock = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('# ') && !line.startsWith('## ')) {
      flushCurrentBlock();
      title = line.slice(2).trim();
      continue;
    }

    if (line.trim().startsWith('<!-- todo:list-meta')) {
      const commentLines: string[] = [line];
      while (i < lines.length - 1 && !lines[i].trim().endsWith('-->')) {
        i++;
        commentLines.push(lines[i]);
      }
      listMeta = parseListMeta(commentLines.join('\n'));
      continue;
    }

    if (line.startsWith('## ')) {
      flushCurrentBlock();
      currentGroup = { name: line.slice(3).trim(), blocks: [] };
      groups.push(currentGroup);
      continue;
    }

    if (line.startsWith('### ')) {
      flushCurrentBlock();
      currentBlock = { heading: line.slice(4).trim(), metadata: '', bodyLines: [] };
      continue;
    }

    if (!currentBlock) continue;

    if (!currentBlock.metadata && line.trim()) {
      if (isMetaLine(line)) {
        currentBlock.metadata = line.trim();
        continue;
      }
    }

    currentBlock.bodyLines.push(line);
  }

  flushCurrentBlock();

  if (!currentGroup) {
    groups.push({ name: '默认分组', blocks: [] });
  }

  const meta: ListMeta = {
    name: title,
    created: listMeta.created ?? todayIso(),
    archived: listMeta.archived ?? false,
  };

  return { title, meta, groups };
}

const META_KEYS: (keyof TaskMeta)[] = [
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

const META_PARSERS: Partial<{
  [K in keyof TaskMeta]: (value: string) => TaskMeta[K] | undefined;
}> = {
  status: (value) => (['pending', 'active', 'done'].includes(value) ? (value as TaskMeta['status']) : undefined),
  priority: (value) => (['high', 'med', 'low'].includes(value) ? (value as TaskMeta['priority']) : undefined),
  created: (value) => value,
  start: (value) => value,
  due: (value) => value,
  repeat: (value) => value,
  repeat_until: (value) => value,
  repeat_count: (value) => {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? undefined : n;
  },
  order: (value) => {
    const n = parseFloat(value);
    return Number.isNaN(n) ? undefined : n;
  },
  tags: (value) => value.split(',').map((t) => t.trim()).filter(Boolean),
};

function parseMetadataLine(line: string): Partial<TaskMeta> {
  const meta: Partial<TaskMeta> = {};
  const parts = line.split('|').map((p) => p.trim());
  for (const part of parts) {
    if (!part) continue;
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim() as keyof TaskMeta;
    const value = part.slice(idx + 1).trim();
    if (!META_KEYS.includes(key)) continue;

    const parser = META_PARSERS[key];
    if (parser) {
      const parsed = parser(value);
      if (parsed !== undefined) {
        (meta as Record<string, unknown>)[key] = parsed;
      }
    }
  }
  return meta;
}

const SUBTASK_RE = /^(\s*)-\s*\[([ xX])\]\s+(.*)$/;
const COMPLETED_TIME_RE = /^(.*)\s+\((\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))\)$/;
const FINISH_RE = /^🏁\s+(.+?)\s*\|\s*⏱\s*(.+)$/;
const LINK_RE = /^-?\s*\[([^\]]+)\]\(([^)]+)\)\s*$/;
const SUBTASK_ATTR_RE = /^\s*(note|link|start|due):\s*(.*)$/;

interface ParsedSubtaskLine {
  indent: number;
  level: number;
  completed: boolean;
  text: string;
  completedAt?: string;
}

function parseSubtaskLine(line: string): ParsedSubtaskLine | null {
  const match = SUBTASK_RE.exec(line);
  if (!match) return null;

  const indent = match[1].length;
  const level = Math.floor(indent / 2) + 1;
  const completed = match[2].toLowerCase() === 'x';
  let text = match[3].trim();
  let completedAt: string | undefined;

  if (completed) {
    const completedMatch = COMPLETED_TIME_RE.exec(text);
    if (completedMatch) {
      text = completedMatch[1].trim();
      completedAt = completedMatch[2];
    }
  }

  return { indent, level, completed, text, completedAt };
}

function attachSubtaskToParent(subtasks: Subtask[], subtask: Subtask, stack: Subtask[]): void {
  if (stack.length === 0) {
    subtasks.push(subtask);
    return;
  }

  const last = stack[stack.length - 1];
  if (subtask.level <= last.level) {
    while (stack.length > 0 && stack[stack.length - 1].level >= subtask.level) {
      stack.pop();
    }
  }

  if (stack.length === 0) {
    subtasks.push(subtask);
    return;
  }

  const parent = stack[stack.length - 1];
  let currentParent = parent;
  while (currentParent.level < subtask.level - 1) {
    const placeholder: Subtask = {
      text: '',
      level: currentParent.level + 1,
      completed: false,
      children: [],
    };
    currentParent.children.push(placeholder);
    currentParent = placeholder;
  }
  currentParent.children.push(subtask);
}

function applySubtaskAttribute(last: Subtask, attrName: string, attrValue: string): void {
  switch (attrName) {
    case 'note':
      last.note = last.note ? `${last.note}\n${attrValue}` : attrValue;
      break;
    case 'link': {
      const linkMatch = LINK_RE.exec(attrValue);
      if (linkMatch) {
        last.links = last.links ?? [];
        last.links.push({ title: linkMatch[1], url: linkMatch[2] });
      }
      break;
    }
    case 'start':
      last.start = attrValue || undefined;
      break;
    case 'due':
      last.due = attrValue || undefined;
      break;
  }
}

function parseSubtasks(bodyLines: string[]): { subtasks: Subtask[]; remainingLines: string[] } {
  const subtasks: Subtask[] = [];
  const remaining: string[] = [];
  const stack: Subtask[] = [];

  let i = 0;
  while (i < bodyLines.length) {
    const line = bodyLines[i];
    const parsed = parseSubtaskLine(line);

    if (!parsed) {
      const attrMatch = SUBTASK_ATTR_RE.exec(line) ?? undefined;
      if (attrMatch && stack.length > 0) {
        const indent = line.length - line.trimStart().length;
        const last = stack[stack.length - 1];
        const expectedIndent = (last.level - 1) * 2 + 2;
        if (indent >= expectedIndent) {
          const attrName = attrMatch[1];
          applySubtaskAttribute(last, attrName, attrMatch[2].trim());
          i++;
          // note 属性支持多行缩进续写，避免子任务备注中的无序列表第二行丢失
          if (attrName === 'note') {
            while (i < bodyLines.length) {
              const nextLine = bodyLines[i];
              const nextIndent = nextLine.length - nextLine.trimStart().length;
              if (nextIndent < expectedIndent) break;
              if (parseSubtaskLine(nextLine)) break;
              if (SUBTASK_ATTR_RE.exec(nextLine)) break;
              last.note = last.note ? `${last.note}\n${nextLine.trim()}` : nextLine.trim();
              i++;
            }
          }
          continue;
        }
      }
      remaining.push(line);
      i++;
      continue;
    }

    const subtask: Subtask = {
      text: parsed.text,
      level: parsed.level,
      completed: parsed.completed,
      completed_at: parsed.completedAt,
      children: [],
    };

    attachSubtaskToParent(subtasks, subtask, stack);
    stack.push(subtask);
    i++;
  }

  return { subtasks, remainingLines: remaining };
}

function flushNoteBuffer(buffer: string[], mode: 'none' | 'note' | 'links'): string | undefined {
  if (mode === 'note' && buffer.length > 0) {
    const note = buffer.join('\n').trim();
    buffer.length = 0;
    return note;
  }
  return undefined;
}

function parseMainNoteAndLinks(remainingLines: string[]): {
  note?: string;
  links?: Link[];
  finish?: { completed_at: string; duration: string };
  trailingLines: string[];
} {
  let note: string | undefined;
  let links: Link[] | undefined;
  let finish: { completed_at: string; duration: string } | undefined;
  const trailing: string[] = [];

  let mode: 'none' | 'note' | 'links' = 'none';
  const buffer: string[] = [];

  for (const line of remainingLines) {
    const trimmed = line.trim();

    if (trimmed === '**备注**') {
      note = flushNoteBuffer(buffer, mode) ?? note;
      mode = 'note';
      continue;
    }

    if (trimmed === '**链接**') {
      note = flushNoteBuffer(buffer, mode) ?? note;
      mode = 'links';
      continue;
    }

    const finishMatch = FINISH_RE.exec(trimmed);
    if (finishMatch) {
      note = flushNoteBuffer(buffer, mode) ?? note;
      finish = { completed_at: finishMatch[1].trim(), duration: finishMatch[2].trim() };
      mode = 'none';
      continue;
    }

    if (mode === 'note') {
      buffer.push(line);
    } else if (mode === 'links') {
      const linkMatch = LINK_RE.exec(line.trim());
      if (linkMatch) {
        links = links ?? [];
        links.push({ title: linkMatch[1], url: linkMatch[2] });
      }
    } else {
      trailing.push(line);
    }
  }

  note = flushNoteBuffer(buffer, mode) ?? note;

  return { note, links, finish, trailingLines: trailing };
}

function allSubtasksDone(subtasks: Subtask[]): boolean {
  if (subtasks.length === 0) return true;
  return subtasks.every((s) => s.completed && allSubtasksDone(s.children));
}

function anySubtaskDone(subtasks: Subtask[]): boolean {
  return subtasks.some((s) => s.completed || anySubtaskDone(s.children));
}

export function inferStatus(subtasks: Subtask[], completedAt?: string): TaskMeta['status'] {
  if (subtasks.length === 0) {
    return completedAt ? 'done' : 'pending';
  }
  if (allSubtasksDone(subtasks)) return 'done';
  if (anySubtaskDone(subtasks)) return 'active';
  return 'pending';
}

function parseTaskBlock(block: TaskBlock, groupName: string): Task {
  const meta = parseMetadataLine(block.metadata);
  const created = meta.created ?? todayIso();
  const title = block.heading;
  const id = generateTaskId(title, created);

  const { subtasks, remainingLines } = parseSubtasks(block.bodyLines);
  const { note, links, finish } = parseMainNoteAndLinks(remainingLines);

  let completedAt = finish?.completed_at;
  let duration = finish?.duration;

  if (meta.status === 'done' && !completedAt) {
    completedAt = nowIso();
    duration = meta.start ? durationDays(meta.start, completedAt) : durationDays(created, completedAt);
  }

  const inferredStatus = inferStatus(subtasks, completedAt);
  const status = meta.status ?? inferredStatus;

  if (status === 'done' && !completedAt && subtasks.length > 0 && allSubtasksDone(subtasks)) {
    completedAt = nowIso();
    duration = meta.start ? durationDays(meta.start, completedAt) : durationDays(created, completedAt);
  }

  return {
    id,
    title,
    group: groupName,
    meta: {
      priority: meta.priority ?? 'med',
      created,
      status,
      start: meta.start,
      due: meta.due,
      repeat: meta.repeat,
      repeat_until: meta.repeat_until,
      repeat_count: meta.repeat_count,
      order: meta.order,
      tags: meta.tags,
    },
    subtasks,
    note,
    links,
    completed_at: completedAt,
    duration,
  };
}

export function parseMarkdownToList(content: string, sha?: string): ParsedList {
  const lines = content.split('\n');
  const { title, meta, groups: rawGroups } = scanBlocks(lines);
  meta.name = title || meta.name;

  const groups: Group[] = rawGroups.map((g) => ({
    name: g.name,
    tasks: g.blocks.map((b) => parseTaskBlock(b, g.name)),
  }));

  return {
    meta,
    groups,
    rawContent: content,
    sha,
  };
}
