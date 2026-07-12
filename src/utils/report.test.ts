import { describe, expect, it } from 'vitest';
import { addDays, formatISO, startOfWeek } from 'date-fns';
import type { ParsedList, Task, TaskMeta } from '@/types';
import { generateWeeklyReport } from './report';

function thisWeekDay(offsetDays: number): string {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return formatISO(addDays(monday, offsetDays), { representation: 'date' });
}

function nextWeekDay(offsetDays: number): string {
  const nextMonday = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7);
  return formatISO(addDays(nextMonday, offsetDays), { representation: 'date' });
}

function daysAgo(days: number): string {
  return formatISO(addDays(new Date(), -days), { representation: 'date' });
}

function buildTask(
  title: string,
  overrides: Partial<Omit<Task, 'meta'>> & { meta?: Partial<TaskMeta> } = {},
): Task {
  const { meta, ...rest } = overrides;
  return {
    id: `id-${title}`,
    title,
    group: '默认分组',
    meta: {
      priority: 'med',
      created: thisWeekDay(0),
      status: overrides.completed_at ? 'done' : 'pending',
      ...meta,
    },
    subtasks: overrides.subtasks ?? [],
    completed_at: overrides.completed_at,
    ...rest,
  };
}

function buildList(tasks: Task[]): ParsedList {
  return {
    meta: {
      name: '测试清单',
      created: thisWeekDay(0),
      archived: false,
    },
    groups: [{ name: '默认分组', tasks }],
    rawContent: '',
  };
}

describe('generateWeeklyReport', () => {
  it('按有效完成时间升序排列同一分组内的任务', () => {
    const list = buildList([
      buildTask('周三完成', { completed_at: thisWeekDay(2) }),
      buildTask('周一完成', { completed_at: thisWeekDay(0) }),
      buildTask('周二完成', { completed_at: thisWeekDay(1) }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    const monday = report.indexOf('周一完成');
    const tuesday = report.indexOf('周二完成');
    const wednesday = report.indexOf('周三完成');

    expect(monday).toBeLessThan(tuesday);
    expect(tuesday).toBeLessThan(wednesday);
  });

  it('任务自身未完成但子任务本周完成时，按子任务完成时间排序', () => {
    const list = buildList([
      buildTask('无子任务完成', { completed_at: thisWeekDay(3) }),
      buildTask('因子任务被纳入', {
        subtasks: [
          {
            text: '周二子任务',
            level: 1,
            completed: true,
            completed_at: thisWeekDay(1),
            children: [],
          },
        ],
      }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    expect(report.indexOf('因子任务被纳入')).toBeLessThan(report.indexOf('无子任务完成'));
  });

  it('嵌套子任务的完成时间会被纳入有效完成时间', () => {
    const list = buildList([
      buildTask('父任务', {
        subtasks: [
          {
            text: '二级子任务',
            level: 1,
            completed: false,
            children: [
              {
                text: '三级子任务',
                level: 2,
                completed: true,
                completed_at: thisWeekDay(4),
                children: [],
              },
            ],
          },
        ],
      }),
      buildTask('自身完成', { completed_at: thisWeekDay(2) }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    expect(report.indexOf('自身完成')).toBeLessThan(report.indexOf('父任务'));
  });

  it('任务与子任务都完成时，取最晚时间作为排序依据', () => {
    const list = buildList([
      buildTask('自身晚完成', { completed_at: thisWeekDay(3) }),
      buildTask('子任务晚完成', {
        completed_at: thisWeekDay(0),
        subtasks: [
          {
            text: '周四子任务',
            level: 1,
            completed: true,
            completed_at: thisWeekDay(4),
            children: [],
          },
        ],
      }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    expect(report.indexOf('自身晚完成')).toBeLessThan(report.indexOf('子任务晚完成'));
  });

  it('相同完成时间时保持原顺序', () => {
    const sameTime = thisWeekDay(2);
    const list = buildList([
      buildTask('任务 A', { completed_at: sameTime }),
      buildTask('任务 B', { completed_at: sameTime }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    expect(report.indexOf('任务 A')).toBeLessThan(report.indexOf('任务 B'));
  });

  it('父任务本周完成时，列出所有已完成的子任务（不仅限于本周完成的）', () => {
    const list = buildList([
      buildTask('父任务本周完成', {
        completed_at: thisWeekDay(2),
        subtasks: [
          {
            text: '本周子任务',
            level: 1,
            completed: true,
            completed_at: thisWeekDay(1),
            children: [],
          },
          {
            text: '上周子任务',
            level: 1,
            completed: true,
            completed_at: '2026-06-30T10:00:00+08:00',
            children: [],
          },
          {
            text: '未完成子任务',
            level: 1,
            completed: false,
            children: [],
          },
        ],
      }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    expect(report).toContain('1. 父任务本周完成');
    expect(report).toContain('    1. 本周子任务');
    expect(report).toContain('    2. 上周子任务');
    expect(report).not.toContain('未完成子任务');
  });

  it('同一任务下的子任务按原数组顺序用数字编号输出', () => {
    const list = buildList([
      buildTask('带多个子任务', {
        completed_at: thisWeekDay(2),
        subtasks: [
          {
            text: '第一个子任务',
            level: 1,
            completed: true,
            completed_at: thisWeekDay(1),
            children: [],
          },
          {
            text: '第二个子任务',
            level: 1,
            completed: true,
            completed_at: thisWeekDay(2),
            children: [],
          },
          {
            text: '第三个子任务',
            level: 1,
            completed: true,
            completed_at: thisWeekDay(0),
            children: [],
          },
        ],
      }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    const idx1 = report.indexOf('    1. 第一个子任务');
    const idx2 = report.indexOf('    2. 第二个子任务');
    const idx3 = report.indexOf('    3. 第三个子任务');

    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(-1);
    expect(idx3).toBeGreaterThan(-1);
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
  });

  it('本周无完成事项时返回空字符串', () => {
    const list = buildList([buildTask('未完成任务')]);
    expect(generateWeeklyReport('测试清单', list)).toBe('');
  });

  it('下周计划包含逾期任务与下周到期任务', () => {
    const list = buildList([
      buildTask('逾期任务', { meta: { due: daysAgo(3) } }),
      buildTask('下周任务', { meta: { due: nextWeekDay(2) } }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    expect(report).toContain('下周计划');
    expect(report).toContain('1. 逾期任务');
    expect(report).toContain('2. 下周任务');
  });

  it('逾期任务显示逾期天数与备注提醒', () => {
    const list = buildList([
      buildTask('逾期任务', {
        meta: { due: daysAgo(5) },
        note: '需要尽快处理',
      }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    expect(report).toContain('逾期任务（逾期 5 天）');
    expect(report).toContain('备注：需要尽快处理');
  });

  it('无完成事项但有下周计划时仍生成周报', () => {
    const list = buildList([
      buildTask('下周任务', { meta: { due: nextWeekDay(1) } }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    expect(report).not.toBe('');
    expect(report).toContain('测试清单 工作周报');
    expect(report).toContain('下周计划');
  });

  it('下周计划按逾期优先、到期日升序排列', () => {
    const list = buildList([
      buildTask('下周三到期', { meta: { due: nextWeekDay(2) } }),
      buildTask('逾期两天', { meta: { due: daysAgo(2) } }),
      buildTask('下周二到期', { meta: { due: nextWeekDay(1) } }),
      buildTask('逾期五天', { meta: { due: daysAgo(5) } }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    const idxOverdue5 = report.indexOf('逾期五天');
    const idxOverdue2 = report.indexOf('逾期两天');
    const idxNextTue = report.indexOf('下周二到期');
    const idxNextWed = report.indexOf('下周三到期');

    expect(idxOverdue5).toBeLessThan(idxOverdue2);
    expect(idxOverdue2).toBeLessThan(idxNextTue);
    expect(idxNextTue).toBeLessThan(idxNextWed);
  });

  it('已完成的任务不进入下周计划', () => {
    const list = buildList([
      buildTask('已完成逾期任务', {
        completed_at: thisWeekDay(1),
        meta: { due: daysAgo(3) },
      }),
    ]);

    const report = generateWeeklyReport('测试清单', list);
    expect(report).toContain('1. 已完成逾期任务');
    expect(report).not.toContain('下周计划');
  });
});
