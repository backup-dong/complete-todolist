import { describe, expect, it } from 'vitest';
import { parseJsonToList, serializeListToJson } from './index';
import type { ParsedList, Task } from '@/types';

function buildSampleJson(): string {
  return JSON.stringify({
    version: 1,
    meta: { name: '工作', created: '2026-06-01', archived: false },
    groups: [
      {
        name: '项目Alpha',
        tasks: [
          {
            id: 'abc123',
            title: '竞品调研报告',
            group: '项目Alpha',
            meta: {
              status: 'active',
              priority: 'high',
              created: '2026-06-28',
              due: '2026-07-10',
            },
            subtasks: [
              {
                text: '收集飞书任务功能列表',
                level: 1,
                completed: true,
                completed_at: '2026-07-02T14:30:00+08:00',
                children: [],
              },
              {
                text: '收集 Notion 功能列表',
                level: 1,
                completed: false,
                children: [],
              },
            ],
            note: '需要调研飞书任务、Notion、Todoist 三家的功能对比',
            links: [{ title: '飞书任务官方', url: 'https://example.com' }],
            completed_at: null,
            duration: null,
          },
        ],
      },
    ],
  }, null, 2);
}

describe('json parser round-trip', () => {
  it('parses and serializes a full list', () => {
    const parsed = parseJsonToList(buildSampleJson(), 'sha1');
    expect(parsed.meta.name).toBe('工作');
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].tasks[0].title).toBe('竞品调研报告');
    expect(parsed.groups[0].tasks[0].subtasks[0].completed_at).toBe('2026-07-02T14:30:00+08:00');

    const serialized = serializeListToJson(parsed);
    const reparsed = parseJsonToList(serialized, 'sha2');
    expect(reparsed.meta.name).toBe('工作');
    expect(reparsed.groups[0].tasks[0].title).toBe('竞品调研报告');
    expect(reparsed.groups[0].tasks[0].subtasks[0].completed_at).toBe('2026-07-02T14:30:00+08:00');
  });

  it('provides defaults for missing fields', () => {
    const minimal = JSON.stringify({
      version: 1,
      meta: { name: 'M', created: '2026-07-01' },
      groups: [],
    });
    const parsed = parseJsonToList(minimal);
    expect(parsed.meta.archived).toBe(false);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].name).toBe('默认分组');
    expect(parsed.groups[0].tasks).toHaveLength(0);
  });

  it('rejects unsupported version', () => {
    const bad = JSON.stringify({ version: 99, meta: { name: 'M', created: '2026-07-01' }, groups: [] });
    expect(() => parseJsonToList(bad)).toThrow('Unsupported JSON list version');
  });

  it('rejects invalid JSON', () => {
    expect(() => parseJsonToList('not json')).toThrow('Invalid JSON list content');
  });

  it('preserves nested subtasks with notes and links', () => {
    const list: ParsedList = {
      meta: { name: '嵌套测试', created: '2026-07-01', archived: false },
      groups: [{
        name: 'G',
        tasks: [{
          id: 't1',
          title: '任务',
          group: 'G',
          meta: { priority: 'med', created: '2026-07-01' },
          subtasks: [{
            text: '父子任务',
            level: 1,
            completed: false,
            note: '备注里可以有 ### 标题',
            links: [{ title: '链接', url: 'https://example.com' }],
            children: [{
              text: '子任务',
              level: 2,
              completed: true,
              completed_at: '2026-07-02T10:00:00+08:00',
              children: [],
            }],
          }],
        }],
      }],
      rawContent: '',
    };

    const serialized = serializeListToJson(list);
    const reparsed = parseJsonToList(serialized);
    const task = reparsed.groups[0].tasks[0];
    expect(task.subtasks[0].note).toBe('备注里可以有 ### 标题');
    expect(task.subtasks[0].children[0].text).toBe('子任务');
    expect(task.subtasks[0].children[0].completed_at).toBe('2026-07-02T10:00:00+08:00');
  });

  it('normalizes status and completed_at on serialization', () => {
    const list: ParsedList = {
      meta: { name: '完成测试', created: '2026-07-01', archived: false },
      groups: [{
        name: 'G',
        tasks: [{
          id: 't1',
          title: '任务',
          group: 'G',
          meta: { priority: 'med', created: '2026-07-01' },
          subtasks: [{
            text: '子任务',
            level: 1,
            completed: true,
            completed_at: '2026-07-02T10:00:00+08:00',
            children: [],
          }],
        } as Task],
      }],
      rawContent: '',
    };

    const serialized = serializeListToJson(list);
    const reparsed = parseJsonToList(serialized);
    const task = reparsed.groups[0].tasks[0];
    expect(task.meta.status).toBe('done');
    expect(task.completed_at).toBeTruthy();
    expect(task.duration).toBeTruthy();
  });

  it('generates id for tasks missing id field', () => {
    const raw = JSON.stringify({
      version: 1,
      meta: { name: 'M', created: '2026-07-01' },
      groups: [{
        name: 'G',
        tasks: [{
          title: '无 ID 任务',
          meta: { priority: 'med', created: '2026-07-01' },
          subtasks: [],
        }],
      }],
    });
    const parsed = parseJsonToList(raw);
    expect(parsed.groups[0].tasks[0].id).toBeTruthy();
  });
});
