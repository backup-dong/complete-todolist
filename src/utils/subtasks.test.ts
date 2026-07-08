import { describe, it, expect } from 'vitest';
import { reorderSubtasksAtPath } from '@/utils/subtasks';
import type { Subtask } from '@/types';

function st(text: string, children: Subtask[] = []): Subtask {
  return { text, level: 1, completed: false, children };
}

describe('reorderSubtasksAtPath', () => {
  it('reorders root-level subtasks', () => {
    const subtasks = [st('a'), st('b'), st('c')];
    const result = reorderSubtasksAtPath(subtasks, [], 0, 2);
    expect(result.map((s) => s.text)).toEqual(['b', 'c', 'a']);
  });

  it('reorders nested children', () => {
    const subtasks = [st('a', [st('a1'), st('a2'), st('a3')]), st('b')];
    const result = reorderSubtasksAtPath(subtasks, [0], 2, 0);
    expect(result[0].children.map((s) => s.text)).toEqual(['a3', 'a1', 'a2']);
  });

  it('returns same reference when from === to', () => {
    const subtasks = [st('a'), st('b')];
    const result = reorderSubtasksAtPath(subtasks, [], 0, 0);
    expect(result).toBe(subtasks);
  });
});
