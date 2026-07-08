import { describe, it, expect } from 'vitest';
import { parseMarkdownToList } from '@/parser/scanner';
import { serializeList, normalizeTask } from '@/parser/serializer';
import type { Task } from '@/types';

const sampleMarkdown = `# 工作

<!-- todo:list-meta
  created: 2026-06-01
  archived: false
-->

## 项目Alpha

### 竞品调研报告
status: active | priority: high | due: 2026-07-10 | created: 2026-06-28

- [x] 收集飞书任务功能列表 (2026-07-02T14:30:00+08:00)
- [ ] 收集 Notion 功能列表
- [ ] 撰写对比报告

**备注**
需要调研飞书任务、Notion、Todoist 三家的功能对比

**链接**
- [飞书任务官方](https://example.com)

---

### 周报模板优化
priority: med | created: 2026-06-30 | due: 2026-07-15 | repeat: weekly | repeat_until: 2026-12-31

- [ ] 设计新的进度展示格式

---

## 项目Beta

### 架构文档评审
priority: high | created: 2026-06-25 | due: 2026-07-03

- [x] 阅读初稿 (2026-07-01T11:00:00+08:00)
- [x] 反馈意见 (2026-07-02T16:00:00+08:00)

🏁 2026-07-03T17:30:00+08:00 | ⏱ 8d

---
`;

describe('parser round-trip', () => {
  it('parses a full list and preserves structure through serialization', () => {
    const parsed = parseMarkdownToList(sampleMarkdown, 'abc123');

    expect(parsed.meta.name).toBe('工作');
    expect(parsed.meta.created).toBe('2026-06-01');
    expect(parsed.meta.archived).toBe(false);
    expect(parsed.sha).toBe('abc123');
    expect(parsed.groups).toHaveLength(2);

    const group1 = parsed.groups[0];
    expect(group1.name).toBe('项目Alpha');
    expect(group1.tasks).toHaveLength(2);

    const task1 = group1.tasks[0];
    expect(task1.title).toBe('竞品调研报告');
    expect(task1.meta.status).toBe('active');
    expect(task1.meta.priority).toBe('high');
    expect(task1.meta.due).toBe('2026-07-10');
    expect(task1.subtasks).toHaveLength(3);
    expect(task1.subtasks[0].completed).toBe(true);
    expect(task1.subtasks[0].completed_at).toBe('2026-07-02T14:30:00+08:00');
    expect(task1.note).toContain('Todoist');
    expect(task1.links).toHaveLength(1);
    expect(task1.links?.[0].url).toBe('https://example.com');

    const serialized = serializeList(parsed);
    const reparsed = parseMarkdownToList(serialized, 'abc123');

    expect(reparsed.meta.name).toBe(parsed.meta.name);
    expect(reparsed.groups).toHaveLength(parsed.groups.length);
    expect(reparsed.groups[0].tasks).toHaveLength(parsed.groups[0].tasks.length);

    // Normalize ids are deterministic based on title + created date
    expect(reparsed.groups[0].tasks[0].id).toBe(task1.id);
  });

  it('serializes and reparses a completed task correctly', () => {
    const parsed = parseMarkdownToList(sampleMarkdown, 'sha');
    const doneTask = parsed.groups[1].tasks[0];

    expect(doneTask.meta.status).toBe('done');
    expect(doneTask.completed_at).toBe('2026-07-03T17:30:00+08:00');
    expect(doneTask.duration).toBe('8d');

    const serialized = serializeList(parsed);
    expect(serialized).toContain('🏁 2026-07-03T17:30:00+08:00 | ⏱ 8d');

    const reparsed = parseMarkdownToList(serialized, 'sha');
    const reparsedDoneTask = reparsed.groups[1].tasks[0];
    expect(reparsedDoneTask.meta.status).toBe('done');
    expect(reparsedDoneTask.completed_at).toBe('2026-07-03T17:30:00+08:00');
    expect(reparsedDoneTask.duration).toBe('8d');
  });

  it('infers status from subtasks', () => {
    const task: Task = {
      id: 't1',
      title: 'Test',
      group: 'G',
      meta: { priority: 'med', created: '2026-07-01' },
      subtasks: [
        { text: 'a', level: 1, completed: true, completed_at: '2026-07-02T10:00:00+08:00', children: [] },
        { text: 'b', level: 1, completed: false, children: [] },
      ],
    };

    const normalized = normalizeTask(task);
    expect(normalized.meta.status).toBe('active');
  });

  it('marks task done when all subtasks are done', () => {
    const task: Task = {
      id: 't1',
      title: 'Test',
      group: 'G',
      meta: { priority: 'med', created: '2026-07-01' },
      subtasks: [
        { text: 'a', level: 1, completed: true, completed_at: '2026-07-02T10:00:00+08:00', children: [] },
      ],
    };

    const normalized = normalizeTask(task);
    expect(normalized.meta.status).toBe('done');
    expect(normalized.completed_at).toBeDefined();
  });

  it('respects explicit status override and clears completed_at when leaving done', () => {
    const task: Task = {
      id: 't1',
      title: 'Test',
      group: 'G',
      meta: { priority: 'med', created: '2026-07-01', status: 'done' },
      subtasks: [],
      completed_at: '2026-07-02T10:00:00+08:00',
      duration: '1d',
    };

    const normalized = normalizeTask(task, 'active');
    expect(normalized.meta.status).toBe('active');
    expect(normalized.completed_at).toBeUndefined();
    expect(normalized.duration).toBeUndefined();
  });

  it('handles nested subtasks with notes and links', () => {
    const markdown = `# 测试

## 默认分组

### 任务
priority: med | created: 2026-07-01

- [ ] 一级
  - [x] 二级 (2026-07-02T10:00:00+08:00)
    note: 子备注
    link: [百度](https://baidu.com)
- [ ] 同级

---
`;

    const parsed = parseMarkdownToList(markdown, 'sha');
    const task = parsed.groups[0].tasks[0];
    expect(task.subtasks).toHaveLength(2);
    expect(task.subtasks[0].children).toHaveLength(1);
    expect(task.subtasks[0].children[0].note).toBe('子备注');
    expect(task.subtasks[0].children[0].links?.[0].url).toBe('https://baidu.com');

    const serialized = serializeList(parsed);
    const reparsed = parseMarkdownToList(serialized, 'sha');
    expect(reparsed.groups[0].tasks[0].subtasks[0].children[0].note).toBe('子备注');
    expect(reparsed.groups[0].tasks[0].subtasks[0].children[0].links?.[0].url).toBe('https://baidu.com');
  });

  it('parses and round-trips subtask start and due dates', () => {
    const markdown = `# 测试

## 默认分组

### 任务
priority: med | created: 2026-07-01

- [ ] 子任务 A
  start: 2026-07-05
  due: 2026-07-10
- [x] 子任务 B (2026-07-06T10:00:00+08:00)
  due: 2026-07-06

---
`;

    const parsed = parseMarkdownToList(markdown, 'sha');
    const task = parsed.groups[0].tasks[0];
    expect(task.subtasks).toHaveLength(2);
    expect(task.subtasks[0].start).toBe('2026-07-05');
    expect(task.subtasks[0].due).toBe('2026-07-10');
    expect(task.subtasks[1].completed_at).toBe('2026-07-06T10:00:00+08:00');
    expect(task.subtasks[1].due).toBe('2026-07-06');

    const serialized = serializeList(parsed);
    expect(serialized).toContain('start: 2026-07-05');
    expect(serialized).toContain('due: 2026-07-10');

    const reparsed = parseMarkdownToList(serialized, 'sha');
    expect(reparsed.groups[0].tasks[0].subtasks[0].start).toBe('2026-07-05');
    expect(reparsed.groups[0].tasks[0].subtasks[0].due).toBe('2026-07-10');
    expect(reparsed.groups[0].tasks[0].subtasks[1].due).toBe('2026-07-06');
  });

  it('parses subtask completion timestamps with milliseconds and Z timezone', () => {
    const markdown = `# 测试

## 默认分组

### 任务
priority: med | created: 2026-07-01

- [x] 已完成子任务 (2026-07-05T09:11:27.934Z)
- [ ] 未完成子任务

---
`;

    const parsed = parseMarkdownToList(markdown, 'sha');
    const task = parsed.groups[0].tasks[0];
    expect(task.subtasks[0].completed).toBe(true);
    expect(task.subtasks[0].text).toBe('已完成子任务');
    expect(task.subtasks[0].completed_at).toBe('2026-07-05T09:11:27.934Z');
    expect(task.subtasks[1].completed).toBe(false);
    expect(task.subtasks[1].text).toBe('未完成子任务');
  });

  it('creates a default group when no groups exist', () => {
    const markdown = `# 空清单

<!-- todo:list-meta
  created: 2026-07-01
  archived: false
-->
`;

    const parsed = parseMarkdownToList(markdown, 'sha');
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].name).toBe('默认分组');
    expect(parsed.groups[0].tasks).toHaveLength(0);
  });
});

  it('round-trips subtask notes containing multi-line unordered lists', () => {
    const markdown = `# 测试

## 默认分组

### 任务
priority: med | created: 2026-07-01

- [ ] 子任务 A
  note: 第一行
  - 第二行无序列表
  - 第三行无序列表
- [ ] 子任务 B

---
`;

    const parsed = parseMarkdownToList(markdown, 'sha');
    const task = parsed.groups[0].tasks[0];
    expect(task.subtasks[0].note).toBe('第一行\n- 第二行无序列表\n- 第三行无序列表');

    const serialized = serializeList(parsed);
    const reparsed = parseMarkdownToList(serialized, 'sha');
    expect(reparsed.groups[0].tasks[0].subtasks[0].note).toBe('第一行\n- 第二行无序列表\n- 第三行无序列表');
  });

  it('does not treat indented subtask attributes as task metadata when task has no metadata line', () => {
    const markdown = `# 测试

## 默认分组

### 无元数据任务

- [ ] 子任务 A
  start: 2026-07-05
  due: 2026-07-10
- [ ] 子任务 B

---
`;

    const parsed = parseMarkdownToList(markdown, 'sha');
    const task = parsed.groups[0].tasks[0];

    expect(task.title).toBe('无元数据任务');
    expect(task.meta.start).toBeUndefined();
    expect(task.meta.due).toBeUndefined();
    expect(task.subtasks).toHaveLength(2);
    expect(task.subtasks[0].start).toBe('2026-07-05');
    expect(task.subtasks[0].due).toBe('2026-07-10');
  });

describe('scanBlocks', () => {
  it('ignores visual separators between tasks', () => {
    const markdown = `# M
## G
### A
priority: med | created: 2026-07-01

- [ ] a

---

### B
priority: med | created: 2026-07-02

- [ ] b
`;
    const parsed = parseMarkdownToList(markdown, 'sha');
    expect(parsed.groups[0].tasks).toHaveLength(2);
    expect(parsed.groups[0].tasks[0].title).toBe('A');
    expect(parsed.groups[0].tasks[1].title).toBe('B');
  });
});
