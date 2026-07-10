import { compareAsc, endOfWeek, format, isWithinInterval, max, parseISO, startOfWeek } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import type { ParsedList, Subtask, Task } from '@/types';
import { toast } from '@/utils/toast';

const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function getCurrentWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: startOfWeek(now, { weekStartsOn: 1 }),
    end: endOfWeek(now, { weekStartsOn: 1 }),
  };
}

export function isCompletedThisWeek(completedAt?: string): boolean {
  if (!completedAt) return false;
  try {
    const date = parseISO(completedAt);
    const { start, end } = getCurrentWeekRange();
    return isWithinInterval(date, { start, end });
  } catch {
    return false;
  }
}

function hasSubtaskCompletedThisWeek(subtasks: Subtask[]): boolean {
  return subtasks.some(
    (s) => isCompletedThisWeek(s.completed_at) || hasSubtaskCompletedThisWeek(s.children),
  );
}

function getLatestSubtaskCompletionTime(subtasks: Subtask[]): Date | null {
  const dates: Date[] = [];
  for (const s of subtasks) {
    const completedAt = s.completed_at;
    if (completedAt && isCompletedThisWeek(completedAt)) {
      dates.push(parseISO(completedAt));
    }
    const childLatest = getLatestSubtaskCompletionTime(s.children);
    if (childLatest) {
      dates.push(childLatest);
    }
  }
  return dates.length > 0 ? max(dates) : null;
}

function getEffectiveCompletionTime(task: Task): Date | null {
  const dates: Date[] = [];
  const completedAt = task.completed_at;
  if (completedAt && isCompletedThisWeek(completedAt)) {
    dates.push(parseISO(completedAt));
  }
  const subtaskLatest = getLatestSubtaskCompletionTime(task.subtasks);
  if (subtaskLatest) {
    dates.push(subtaskLatest);
  }
  return dates.length > 0 ? max(dates) : null;
}

function collectCompletedSubtasks(subtasks: Subtask[], indent = '  '): string[] {
  const lines: string[] = [];
  for (const s of subtasks) {
    if (isCompletedThisWeek(s.completed_at)) {
      lines.push(`${indent}- ${s.text}`);
    }
    lines.push(...collectCompletedSubtasks(s.children, `${indent}  `));
  }
  return lines;
}

function shouldIncludeTask(task: Task): boolean {
  return (
    isCompletedThisWeek(task.completed_at) || hasSubtaskCompletedThisWeek(task.subtasks)
  );
}

export function toChineseNumeral(n: number): string {
  if (n < 1 || n > 99) return String(n);
  if (n < 10) return DIGITS[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (tens === 1) return ones === 0 ? '十' : `十${DIGITS[ones]}`;
  return ones === 0 ? `${DIGITS[tens]}十` : `${DIGITS[tens]}十${DIGITS[ones]}`;
}

export function generateWeeklyReport(listName: string, list: ParsedList): string {
  const { start, end } = getCurrentWeekRange();

  const groupsWithTasks = list.groups
    .map((group) => ({
      name: group.name,
      tasks: group.tasks
        .filter(shouldIncludeTask)
        .sort((a, b) => {
          const timeA = getEffectiveCompletionTime(a);
          const timeB = getEffectiveCompletionTime(b);
          if (!timeA || !timeB) return 0;
          return compareAsc(timeA, timeB);
        }),
    }))
    .filter((group) => group.tasks.length > 0);

  if (groupsWithTasks.length === 0) return '';

  const lines: string[] = [];
  lines.push(
    `${listName} 本周完成事项（${format(start, 'MM/dd', { locale: zhCN })} - ${format(end, 'MM/dd', { locale: zhCN })}）`,
  );
  lines.push('');

  for (let i = 0; i < groupsWithTasks.length; i++) {
    const group = groupsWithTasks[i];
    lines.push(`${toChineseNumeral(i + 1)}、${group.name}`);
    for (let j = 0; j < group.tasks.length; j++) {
      const task = group.tasks[j];
      lines.push(`${j + 1}. ${task.title}`);
      lines.push(...collectCompletedSubtasks(task.subtasks));
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export async function copyWeeklyReport(listName: string, list: ParsedList): Promise<boolean> {
  const report = generateWeeklyReport(listName, list);
  if (!report) {
    toast.info('本周暂无已完成事项');
    return false;
  }

  try {
    await navigator.clipboard.writeText(report);
    toast.success('已复制到剪贴板');
    return true;
  } catch {
    toast.error('复制失败，请检查浏览器权限');
    return false;
  }
}
