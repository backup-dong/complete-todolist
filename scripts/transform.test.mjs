import { describe, it, expect } from 'vitest';
import { migrateJsonV1toV2, generateTaskId } from './transform.mjs';

const v1Fixture = {
  version: 1,
  meta: { name: '工作', created: '2026-07-01', archived: false },
  groups: [
    {
      name: '项目Alpha',
      tasks: [
        {
          id: 'a1b2c3d4',
          title: '竞品调研报告',
          group: '项目Alpha',
          meta: { status: 'active', priority: 'high', created: '2026-06-28', order: 1 },
          subtasks: [
            {
              text: '收集飞书任务功能列表',
              level: 1,
              completed: true,
              completed_at: '2026-07-02T14:30:00+08:00',
              note: '需要调研三家',
              children: [
                {
                  text: '功能对比表',
                  level: 2,
                  completed: false,
                  due: '2026-07-05',
                  children: [],
                },
              ],
            },
            {
              text: 'Notion 功能列表',
              level: 1,
              completed: false,
              start: '2026-07-03',
              links: [{ title: 'Notion 官方', url: 'https://www.notion.so' }],
              children: [],
            },
          ],
          note: '竞品调研',
          links: null,
          files: null,
          completed_at: null,
          duration: null,
        },
        {
          id: 'x1y2z3w4',
          title: '输出报告',
          group: '项目Alpha',
          meta: { status: 'pending', priority: 'med', created: '2026-06-28' },
          subtasks: [],
          note: null,
          links: null,
          files: null,
          completed_at: null,
          duration: null,
        },
      ],
    },
  ],
};

function migrate(input) {
  return JSON.parse(migrateJsonV1toV2(JSON.stringify(input)));
}

describe('migrateJsonV1toV2', () => {
  it('输出 version 2 且保留 meta', () => {
    const out = migrate(v1Fixture);
    expect(out.version).toBe(2);
    expect(out.meta).toEqual(v1Fixture.meta);
  });

  it('递归展平子任务为 flat Task，parentId 正确', () => {
    const out = migrate(v1Fixture);
    const tasks = out.groups[0].tasks;
    expect(tasks).toHaveLength(5);
    expect(tasks[0]).not.toHaveProperty('subtasks');
    expect(tasks[0].parentId).toBeNull();
    expect(tasks[1].parentId).toBe('a1b2c3d4');
    expect(tasks[2].parentId).toBe(tasks[1].id);
    expect(tasks[3].parentId).toBe('a1b2c3d4');
    expect(tasks[4].title).toBe('输出报告');
    expect(tasks[4].parentId).toBeNull();
  });

  it('text → title、completed → meta.status', () => {
    const tasks = migrate(v1Fixture).groups[0].tasks;
    expect(tasks[1].title).toBe('收集飞书任务功能列表');
    expect(tasks[1].meta.status).toBe('done');
    expect(tasks[2].meta.status).toBe('pending');
  });

  it('子任务字段平移：note/links/start/due/completed_at', () => {
    const tasks = migrate(v1Fixture).groups[0].tasks;
    expect(tasks[1].note).toBe('需要调研三家');
    expect(tasks[1].completed_at).toBe('2026-07-02T14:30:00+08:00');
    expect(tasks[2].meta.due).toBe('2026-07-05');
    expect(tasks[3].links).toEqual([{ title: 'Notion 官方', url: 'https://www.notion.so' }]);
    expect(tasks[3].meta.start).toBe('2026-07-03');
  });

  it('同父子任务按原顺序写 meta.order = 1..n', () => {
    const tasks = migrate(v1Fixture).groups[0].tasks;
    expect(tasks[1].meta.order).toBe(1);
    expect(tasks[3].meta.order).toBe(2);
  });

  it('顶层任务保留原 meta.order，缺失时按位置补全', () => {
    const out = migrate(v1Fixture);
    const tasks = out.groups[0].tasks;
    expect(tasks[0].meta.order).toBe(1);
    expect(tasks[4].meta.order).toBe(2);
  });

  it('子任务继承父任务 group', () => {
    const tasks = migrate(v1Fixture).groups[0].tasks;
    for (const t of tasks) {
      expect(t.group).toBe('项目Alpha');
    }
  });

  it('子任务 id 确定性生成且不重复', () => {
    const out1 = migrate(v1Fixture);
    const out2 = migrate(v1Fixture);
    const ids1 = out1.groups[0].tasks.map((t) => t.id);
    const ids2 = out2.groups[0].tasks.map((t) => t.id);
    expect(ids1).toEqual(ids2);
    expect(new Set(ids1).size).toBe(ids1.length);
    expect(ids1[1]).toBeTruthy();
  });

  it('原子任务顶层 id 保留', () => {
    const tasks = migrate(v1Fixture).groups[0].tasks;
    expect(tasks[0].id).toBe('a1b2c3d4');
  });

  it('same-title subtasks 下 id 冲突时加后缀', () => {
    const input = {
      version: 1,
      meta: { name: 'L', created: '2026-01-01' },
      groups: [
        {
          name: 'G',
          tasks: [
            {
              id: 'parent',
              title: 'P',
              group: 'G',
              meta: { status: 'pending', priority: 'med', created: '2026-01-01' },
              subtasks: [
                { text: 'X', level: 1, completed: false, children: [] },
                { text: 'X', level: 1, completed: false, children: [] },
              ],
              note: null,
              links: null,
              files: null,
              completed_at: null,
              duration: null,
            },
          ],
        },
      ],
    };
    const tasks = migrate(input).groups[0].tasks;
    expect(tasks[1].id).not.toBe(tasks[2].id);
  });

  it('幂等：v2 输入原样返回', () => {
    const v2Content = JSON.stringify({ version: 2, meta: { name: 'x' }, groups: [] });
    expect(migrateJsonV1toV2(v2Content)).toBe(v2Content);
  });

  it('版本不支持时抛错', () => {
    expect(() => migrateJsonV1toV2(JSON.stringify({ version: 3 }))).toThrow(/Unsupported JSON list version/);
    expect(() => migrateJsonV1toV2('not json')).toThrow(/Invalid JSON/);
  });
});

describe('generateTaskId', () => {
  it('与 src/utils/id.ts 算法一致（确定性）', () => {
    expect(generateTaskId('收集飞书任务功能列表', '2026-06-28')).toBe(
      generateTaskId('收集飞书任务功能列表', '2026-06-28'),
    );
    expect(generateTaskId('a', 'b')).not.toBe(generateTaskId('b', 'a'));
  });
});