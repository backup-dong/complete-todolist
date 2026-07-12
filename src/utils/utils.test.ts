import { describe, it, expect, vi } from 'vitest';
import { isDueToday, isOverdue, isDueThisWeek, formatDate, durationDays, todayIso } from '@/utils/date';
import {
  getCurrentWeekRange,
  isCompletedThisWeek,
  toChineseNumeral,
  generateWeeklyReport,
} from '@/utils/report';
import { computeNextDue } from '@/utils/repeat';
import { generateTaskId } from '@/utils/id';
import type { ParsedList } from '@/types';

describe('date utils', () => {
  it('detects today', () => {
    const today = todayIso();
    expect(isDueToday(today)).toBe(true);
    expect(isDueToday('1999-01-01')).toBe(false);
  });

  it('detects overdue dates', () => {
    expect(isOverdue('1999-01-01')).toBe(true);
    const today = todayIso();
    expect(isOverdue(today)).toBe(false);
  });

  it('detects dates due this week (Mon-Sun)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00'));
    try {
      expect(isDueThisWeek('2026-07-06')).toBe(true); // 本周一
      expect(isDueThisWeek('2026-07-08')).toBe(true); // 今天（周三）
      expect(isDueThisWeek('2026-07-12')).toBe(true); // 本周日
      expect(isDueThisWeek('2026-07-05')).toBe(false); // 上周日
      expect(isDueThisWeek('2026-07-13')).toBe(false); // 下周一
    } finally {
      vi.useRealTimers();
    }
  });

  it('formats relative dates', () => {
    const today = todayIso();
    expect(formatDate(today)).toBe('今天');
  });

  it('calculates duration in days', () => {
    expect(durationDays('2026-07-01', '2026-07-03')).toBe('2d');
    expect(durationDays('2026-07-03', '2026-07-01')).toBe('0d');
  });
});

describe('repeat utils', () => {
  it('advances daily', () => {
    expect(computeNextDue('2026-07-01', 'daily')).toBe('2026-07-02');
  });

  it('advances weekly to next Monday', () => {
    // 2026-07-01 is Wednesday
    expect(computeNextDue('2026-07-01', 'weekly')).toBe('2026-07-06');
  });

  it('advances monthly', () => {
    expect(computeNextDue('2026-07-01', 'monthly')).toBe('2026-08-01');
  });

  it('advances weekdays skipping weekend', () => {
    // 2026-07-03 is Friday
    expect(computeNextDue('2026-07-03', 'weekdays')).toBe('2026-07-06');
  });

  it('handles custom weekday list', () => {
    // 2026-07-01 is Wednesday
    expect(computeNextDue('2026-07-01', 'mon,wed,fri')).toBe('2026-07-03');
  });

  it('handles custom monthly days', () => {
    expect(computeNextDue('2026-07-01', '1,15')).toBe('2026-07-15');
    expect(computeNextDue('2026-07-20', '1,15')).toBe('2026-08-01');
  });

  it('respects repeat_until', () => {
    expect(computeNextDue('2026-07-01', 'daily', '2026-07-01')).toBeNull();
  });
});

describe('id utils', () => {
  it('generates deterministic ids', () => {
    expect(generateTaskId('title', '2026-07-01')).toBe(generateTaskId('title', '2026-07-01'));
    expect(generateTaskId('title1', '2026-07-01')).not.toBe(generateTaskId('title2', '2026-07-01'));
  });
});

describe('report utils', () => {
  it('returns Monday to Sunday for current week range', () => {
    const { start, end } = getCurrentWeekRange();
    expect(start.getDay()).toBe(1);
    expect(end.getDay()).toBe(0);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('detects completion within current week', () => {
    expect(isCompletedThisWeek(new Date().toISOString())).toBe(true);
    expect(isCompletedThisWeek(undefined)).toBe(false);
    const lastYear = new Date(new Date().getFullYear() - 1, 0, 1).toISOString();
    expect(isCompletedThisWeek(lastYear)).toBe(false);
  });

  it('converts numbers to Chinese numerals', () => {
    expect(toChineseNumeral(1)).toBe('一');
    expect(toChineseNumeral(9)).toBe('九');
    expect(toChineseNumeral(10)).toBe('十');
    expect(toChineseNumeral(15)).toBe('十五');
    expect(toChineseNumeral(20)).toBe('二十');
    expect(toChineseNumeral(23)).toBe('二十三');
    expect(toChineseNumeral(99)).toBe('九十九');
    expect(toChineseNumeral(100)).toBe('100');
  });

  it('generates empty report when no tasks completed this week', () => {
    const list: ParsedList = {
      meta: { name: 'Test', created: '2026-07-01', archived: false },
      groups: [
        {
          name: 'Group1',
          tasks: [
            {
              id: '1',
              title: 'Task1',
              group: 'Group1',
              meta: { priority: 'med', created: '2026-07-01' },
              subtasks: [],
            },
          ],
        },
      ],
      rawContent: '',
    };
    expect(generateWeeklyReport('Test', list)).toBe('');
  });

  it('generates plain text report grouped by original order', () => {
    const now = new Date();
    const list: ParsedList = {
      meta: { name: 'Work', created: '2026-07-01', archived: false },
      groups: [
        {
          name: 'Frontend',
          tasks: [
            { id: '1', title: 'Fix bug', group: 'Frontend', meta: { priority: 'med', created: '2026-07-01' }, subtasks: [], completed_at: now.toISOString() },
            { id: '2', title: 'Add feature', group: 'Frontend', meta: { priority: 'med', created: '2026-07-01' }, subtasks: [], completed_at: now.toISOString() },
          ],
        },
        {
          name: 'Backend',
          tasks: [
            { id: '3', title: 'API design', group: 'Backend', meta: { priority: 'med', created: '2026-07-01' }, subtasks: [], completed_at: now.toISOString() },
          ],
        },
      ],
      rawContent: '',
    };
    const report = generateWeeklyReport('Work', list);
    expect(report).toContain('Work 本周完成事项');
    expect(report).toContain('一、Frontend');
    expect(report).toContain('1. Fix bug');
    expect(report).toContain('2. Add feature');
    expect(report).toContain('二、Backend');
    expect(report).toContain('1. API design');
    expect(report).not.toContain('#');
    expect(report).not.toContain('##');
  });

  it('includes completed subtasks under each task', () => {
    const now = new Date();
    const list: ParsedList = {
      meta: { name: 'Work', created: '2026-07-01', archived: false },
      groups: [
        {
          name: 'Frontend',
          tasks: [
            {
              id: '1',
              title: 'Fix bug',
              group: 'Frontend',
              meta: { priority: 'med', created: '2026-07-01' },
              completed_at: now.toISOString(),
              subtasks: [
                { text: 'Locate root cause', level: 1, completed: true, completed_at: now.toISOString(), children: [] },
                { text: 'Verify fix', level: 1, completed: true, completed_at: now.toISOString(), children: [] },
              ],
            },
          ],
        },
      ],
      rawContent: '',
    };
    const report = generateWeeklyReport('Work', list);
    expect(report).toContain('1. Fix bug');
    expect(report).toContain('    1. Locate root cause');
    expect(report).toContain('    2. Verify fix');
  });

  it('includes tasks whose subtasks were completed this week even if parent has no completed_at', () => {
    const now = new Date();
    const list: ParsedList = {
      meta: { name: 'Work', created: '2026-07-01', archived: false },
      groups: [
        {
          name: 'Backend',
          tasks: [
            {
              id: '1',
              title: 'API design',
              group: 'Backend',
              meta: { priority: 'med', created: '2026-07-01' },
              subtasks: [
                { text: 'Draft schema', level: 1, completed: true, completed_at: now.toISOString(), children: [] },
                { text: 'Pending review', level: 1, completed: false, children: [] },
              ],
            },
          ],
        },
      ],
      rawContent: '',
    };
    const report = generateWeeklyReport('Work', list);
    expect(report).toContain('1. API design');
    expect(report).toContain('    1. Draft schema');
    expect(report).not.toContain('Pending review');
  });
});
