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
