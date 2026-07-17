import {
  addDays,
  compareAsc,
  endOfWeek,
  format,
  isWithinInterval,
  max,
  parseISO,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import type { ParsedList, Subtask, Task } from '@/types';
import { isOverdue } from '@/utils/date';
import { toast } from '@/utils/toast';

const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function getCurrentWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: startOfWeek(now, { weekStartsOn: 1 }),
    end: endOfWeek(now, { weekStartsOn: 1 }),
  };
}

function getNextWeekRange(): { start: Date; end: Date } {
  const { end } = getCurrentWeekRange();
  const start = addDays(end, 1);
  return {
    start,
    end: endOfWeek(start, { weekStartsOn: 1 }),
  };
}

function isDueNextWeek(due?: string): boolean {
  if (!due) return false;
  try {
    const date = parseISO(due);
    const { start, end } = getNextWeekRange();
    return isWithinInterval(date, { start, end });
  } catch {
    return false;
  }
}

function getOverdueDays(due?: string): number {
  if (!due) return 0;
  try {
    const dueDay = startOfDay(parseISO(due));
    const today = startOfDay(new Date());
    const diff = Math.floor((today.getTime() - dueDay.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  } catch {
    return 0;
  }
}

function isActiveInNextWeek(start?: string, due?: string): boolean {
  if (!start && !due) return false;
  const { start: nextMon, end: nextSun } = getNextWeekRange();

  try {
    // 用已有的日期确定任务的时间范围，缺失的一侧用另一侧补全
    const startDate = start ? parseISO(start) : parseISO(due!);
    const dueDate = due ? parseISO(due) : parseISO(start!);
    // 范围 [start, due] 与下周区间有交集
    return startDate <= nextSun && dueDate >= nextMon;
  } catch {
    return false;
  }
}

function shouldIncludeInPlan(task: Task): boolean {
  return (
    task.meta.status !== 'done' &&
    (isOverdue(task.meta.due) || isDueNextWeek(task.meta.due) || isActiveInNextWeek(task.meta.start, task.meta.due))
  );
}

function buildPlanTaskTitle(task: Task): string {
  const due = task.meta.due;
  if (isOverdue(due)) {
    return `${task.title}（逾期 ${getOverdueDays(due)} 天）`;
  }
  return task.title;
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

function collectCompletedSubtasks(
  subtasks: Subtask[],
  indent = '  ',
  includeAllCompleted = false,
): string[] {
  const lines: string[] = [];
  let index = 1;
  for (const s of subtasks) {
    const completedThisWeek = isCompletedThisWeek(s.completed_at);
    if (completedThisWeek || (includeAllCompleted && s.completed)) {
      lines.push(`${indent}${index}. ${s.text}`);
      index++;
    }
    lines.push(
      ...collectCompletedSubtasks(
        s.children,
        `${indent}  `,
        includeAllCompleted || completedThisWeek,
      ),
    );
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

  const groupsWithPlan = list.groups
    .map((group) => ({
      name: group.name,
      tasks: group.tasks.filter(shouldIncludeInPlan).sort((a, b) => {
        const aOverdue = isOverdue(a.meta.due);
        const bOverdue = isOverdue(b.meta.due);
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        const dueA = a.meta.due ? parseISO(a.meta.due).getTime() : Infinity;
        const dueB = b.meta.due ? parseISO(b.meta.due).getTime() : Infinity;
        return dueA - dueB;
      }),
    }))
    .filter((group) => group.tasks.length > 0);

  if (groupsWithTasks.length === 0 && groupsWithPlan.length === 0) return '';

  const lines: string[] = [];
  const headerTitle = groupsWithTasks.length > 0 ? '本周完成事项' : '工作周报';
  lines.push(
    `${listName} ${headerTitle}（${format(start, 'MM/dd', { locale: zhCN })} - ${format(end, 'MM/dd', { locale: zhCN })}）`,
  );
  lines.push('');

  for (let i = 0; i < groupsWithTasks.length; i++) {
    const group = groupsWithTasks[i];
    lines.push(`${toChineseNumeral(i + 1)}、${group.name}`);
    for (let j = 0; j < group.tasks.length; j++) {
      const task = group.tasks[j];
      lines.push(`${j + 1}. ${task.title}`);
      lines.push(
        ...collectCompletedSubtasks(
          task.subtasks,
          '    ',
          isCompletedThisWeek(task.completed_at),
        ),
      );
    }
    lines.push('');
  }

  if (groupsWithPlan.length > 0) {
    lines.push('下周计划');
    lines.push('');
    for (let i = 0; i < groupsWithPlan.length; i++) {
      const group = groupsWithPlan[i];
      lines.push(`${toChineseNumeral(i + 1)}、${group.name}`);
      for (let j = 0; j < group.tasks.length; j++) {
        const task = group.tasks[j];
        lines.push(`${j + 1}. ${buildPlanTaskTitle(task)}`);
        if (task.note) {
          const noteText = task.note.replace(/\n/g, ' ').trim();
          if (noteText) {
            lines.push(`  备注：${noteText}`);
          }
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export async function copyWeeklyReport(listName: string, list: ParsedList): Promise<boolean> {
  const report = generateWeeklyReport(listName, list);
  if (!report) {
    toast.info('本周暂无可导出内容');
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
