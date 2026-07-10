import { describe, expect, it } from 'vitest';
import { addDays, formatISO, startOfWeek } from 'date-fns';
import type { ParsedList, Task } from '@/types';
import { generateWeeklyReport } from './report';

function thisWeekDay(offsetDays: number): string {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return formatISO(addDays(monday, offsetDays));
}

function buildTask(title: string, overrides: Partial<Task> = {}): Task {
  return {
    id: `id-${title}`,
    title,
    group: '默认分组',
    meta: {
      priority: 'med',
      created: thisWeekDay(0),
      status: overrides.completed_at ? 'done' : 'pending',
      ...overrides.meta,
    },
    subtasks: overrides.subtasks ?? [],
    completed_at: overrides.completed_at,
    ...overrides,
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

  it('本周无完成事项时返回空字符串', () => {
    const list = buildList([buildTask('未完成任务')]);
    expect(generateWeeklyReport('测试清单', list)).toBe('');
  });
});
