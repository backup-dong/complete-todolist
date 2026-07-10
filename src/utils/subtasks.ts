import type { Subtask } from '@/types';
import { nowIso } from '@/utils/date';

export function cloneSubtasks(subtasks: Subtask[]): Subtask[] {
  return subtasks.map((s) => ({
    ...s,
    children: cloneSubtasks(s.children),
  }));
}

export function toggleSubtaskAtPath(subtasks: Subtask[], path: number[]): Subtask[] {
  if (path.length === 0) return subtasks;
  const [index, ...rest] = path;
  return subtasks.map((s, i) => {
    if (i !== index) return s;
    if (rest.length === 0) {
      const completed = !s.completed;
      return {
        ...s,
        completed,
        completed_at: completed ? nowIso() : undefined,
      };
    }
    return { ...s, children: toggleSubtaskAtPath(s.children, rest) };
  });
}

export function updateSubtaskAtPath(
  subtasks: Subtask[],
  path: number[],
  updater: (s: Subtask) => Subtask,
): Subtask[] {
  if (path.length === 0) return subtasks;
  const [index, ...rest] = path;
  return subtasks.map((s, i) => {
    if (i !== index) return s;
    if (rest.length === 0) {
      return updater(s);
    }
    return { ...s, children: updateSubtaskAtPath(s.children, rest, updater) };
  });
}

export function deleteSubtaskAtPath(subtasks: Subtask[], path: number[]): Subtask[] {
  if (path.length === 0) return subtasks;
  const [index, ...rest] = path;
  if (rest.length === 0) {
    return subtasks.filter((_, i) => i !== index);
  }
  return subtasks.map((s, i) => {
    if (i !== index) return s;
    return { ...s, children: deleteSubtaskAtPath(s.children, rest) };
  });
}

export function resetSubtasks(subtasks: Subtask[]): Subtask[] {
  return subtasks.map((s) => ({
    ...s,
    completed: false,
    completed_at: undefined,
    children: resetSubtasks(s.children),
  }));
}

export function emptySubtask(level = 1): Subtask {
  return { text: '', level, completed: false, children: [] };
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * 在指定父级 path 的 children 数组内，将子任务从 fromIndex 移动到 toIndex。
 * parentPath 为空数组时表示根级子任务数组。
 */
export function reorderSubtasksAtPath(
  subtasks: Subtask[],
  parentPath: number[],
  fromIndex: number,
  toIndex: number,
): Subtask[] {
  if (parentPath.length === 0) {
    return arrayMove(subtasks, fromIndex, toIndex);
  }

  const [head, ...rest] = parentPath;
  return subtasks.map((s, i) => {
    if (i !== head) return s;
    return { ...s, children: reorderSubtasksAtPath(s.children, rest, fromIndex, toIndex) };
  });
}
