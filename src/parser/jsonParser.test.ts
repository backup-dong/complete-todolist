import { describe, expect, it } from 'vitest';
import { parseJsonToList, serializeListToJson, JSON_FORMAT_VERSION, normalizeTask, inferJsonVersion } from './index';
import type { ParsedList } from '@/types';

function buildSampleJson(): string {
  return JSON.stringify({
    version: 2,
    meta: { name: '工作', created: '2026-06-01', archived: false },
    groups: [
      {
        name: '项目Alpha',
        tasks: [
          {
            id: 'abc123',
            title: '竞品调研报告',
            parentId: null,
            group: '项目Alpha',
            meta: {
              status: 'active',
              priority: 'high',
              created: '2026-06-28',
              due: '2026-07-10',
            },
            note: '需要调研飞书任务、Notion、Todoist 三家的功能对比',
            links: [{ title: '飞书任务官方', url: 'https://example.com' }],
            completed_at: null,
            duration: null,
          },
          {
            id: 'child1',
            title: '收集飞书任务功能列表',
            parentId: 'abc123',
            group: '项目Alpha',
            meta: { status: 'done', priority: 'med', created: '2026-06-28' },
            completed_at: '2026-07-02T14:30:00+08:00',
            duration: '4d',
          },
          {
            id: 'child2',
            title: '收集 Notion 功能列表',
            parentId: 'abc123',
            group: '项目Alpha',
            meta: { status: 'pending', priority: 'med', created: '2026-06-28' },
            completed_at: null,
            duration: null,
          },
        ],
      },
    ],
  }, null, 2);
}

describe('json parser round-trip', () => {
  it('parses and serializes a full v2 list', () => {
    const parsed = parseJsonToList(buildSampleJson(), 'sha1');
    expect(parsed.meta.name).toBe('工作');
    expect(parsed.groups).toHaveLength(1);
    const tasks = parsed.groups[0].tasks;
    expect(tasks).toHaveLength(3);
    expect(tasks[0].title).toBe('竞品调研报告');
    expect(tasks[0].parentId).toBeNull();
    expect(tasks[1].parentId).toBe('abc123');

    const serialized = serializeListToJson(parsed);
    const reparsed = parseJsonToList(serialized, 'sha2');
    const reTasks = reparsed.groups[0].tasks;
    expect(reTasks).toHaveLength(3);
    expect(reTasks[1].title).toBe('收集飞书任务功能列表');
    expect(reTasks[1].completed_at).toBe('2026-07-02T14:30:00+08:00');
  });

  it('provides defaults for missing fields', () => {
    const minimal = JSON.stringify({
      version: 2,
      meta: { name: 'M', created: '2026-07-01' },
      groups: [],
    });
    const parsed = parseJsonToList(minimal);
    expect(parsed.meta.archived).toBe(false);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].name).toBe('默认分组');
    expect(parsed.groups[0].tasks).toHaveLength(0);
  });

  it('rejects v1 content with a migration tool hint', () => {
    const v1 = JSON.stringify({ version: 1, meta: { name: 'M', created: '2026-07-01' }, groups: [] });
    expect(() => parseJsonToList(v1)).toThrow('migrate');
  });

  it('rejects unsupported version', () => {
    const bad = JSON.stringify({ version: 99, meta: { name: 'M', created: '2026-07-01' }, groups: [] });
    expect(() => parseJsonToList(bad)).toThrow('Unsupported JSON list version');
  });

  it('rejects invalid JSON', () => {
    expect(() => parseJsonToList('not json')).toThrow('Invalid JSON list content');
  });

  it('returns the version used by the current app', () => {
    expect(JSON_FORMAT_VERSION).toBe(2);
    expect(inferJsonVersion(buildSampleJson())).toBe(2);
    expect(inferJsonVersion('{"version":1}')).toBe(1);
    expect(inferJsonVersion('garbage')).toBe(0);
  });

  it('normalizes task fields regardless of flat order', () => {
    const parsed = parseJsonToList(buildSampleJson());
    const tasks = parsed.groups[0].tasks;
    expect(tasks[0].meta.status).toBe('active');
    expect(tasks[1].meta.status).toBe('done');
    expect(tasks[1].duration).toBeTruthy();
    expect(tasks[2].meta.status).toBe('pending');
  });

  it('generates id for tasks missing id field', () => {
    const raw = JSON.stringify({
      version: 2,
      meta: { name: 'M', created: '2026-07-01' },
      groups: [{
        name: 'G',
        tasks: [{
          title: '无 ID 任务',
          parentId: null,
          group: 'G',
          meta: { priority: 'med', created: '2026-07-01' },
        }],
      }],
    });
    const parsed = parseJsonToList(raw);
    expect(parsed.groups[0].tasks[0].id).toBeTruthy();
  });
});

describe('normalizeTask status inference', () => {
  it('infers done when all descendants are done', () => {
    const task: ParsedList['groups'][0]['tasks'][0] = {
      id: 't1',
      title: '父任务',
      parentId: null,
      group: 'G',
      meta: { priority: 'med', created: '2026-07-01', status: 'pending' },
    };
    const descendants = [
      { id: 'c1', parentId: 't1', meta: { status: 'done' as const } },
      { id: 'c2', parentId: 't1', meta: { status: 'done' as const } },
    ] as ParsedList['groups'][0]['tasks'][0][];
    const normalized = normalizeTask(task, { descendants });
    expect(normalized.meta.status).toBe('done');
    expect(normalized.completed_at).toBeTruthy();
  });

  it('infers active when some descendants are done', () => {
    const task: ParsedList['groups'][0]['tasks'][0] = {
      id: 't1',
      title: '父任务',
      parentId: null,
      group: 'G',
      meta: { priority: 'med', created: '2026-07-01', status: 'pending' },
    };
    const descendants = [
      { id: 'c1', parentId: 't1', meta: { status: 'done' as const } },
      { id: 'c2', parentId: 't1', meta: { status: 'pending' as const } },
    ] as ParsedList['groups'][0]['tasks'][0][];
    expect(normalizeTask(task, { descendants }).meta.status).toBe('active');
  });

  it('infers pending for leaf tasks without completion', () => {
    const task: ParsedList['groups'][0]['tasks'][0] = {
      id: 't1',
      title: '叶子',
      parentId: null,
      group: 'G',
      meta: { priority: 'med', created: '2026-07-01', status: 'done' },
    };
    const normalized = normalizeTask(task);
    expect(normalized.meta.status).toBe('pending');
    expect(normalized.completed_at).toBeUndefined();
  });

  it('explicit status wins over inference', () => {
    const task: ParsedList['groups'][0]['tasks'][0] = {
      id: 't1',
      title: '父任务',
      parentId: null,
      group: 'G',
      meta: { priority: 'med', created: '2026-07-01', status: 'done' },
    };
    const descendants = [
      { id: 'c1', parentId: 't1', meta: { status: 'pending' as const } },
    ] as ParsedList['groups'][0]['tasks'][0][];
    const normalized = normalizeTask(task, { descendants, explicitStatus: 'done' });
    expect(normalized.meta.status).toBe('done');
  });
});