import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { Link, Subtask, Task } from '@/types';
import { NoteEditor } from '@/components/common/NoteEditor';

function detectSubtaskToggle(prev: Subtask[], curr: Subtask[]): boolean {
  if (prev.length !== curr.length) return false;
  return prev.some((p, i) => {
    const c = curr[i];
    if (p.completed !== c.completed) return true;
    if (p.children.length > 0 || c.children.length > 0) {
      return detectSubtaskToggle(p.children, c.children);
    }
    return false;
  });
}

function linksToText(links?: Link[]): string {
  return links?.map((l) => (l.title === l.url ? l.url : `${l.title} ${l.url}`)).join('\n') ?? '';
}

function textToLinks(text: string): Link[] | undefined {
  const links = text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;

      // 支持 Markdown 链接格式：[标题](URL)
      const mdMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(trimmed);
      if (mdMatch) {
        const [, title, url] = mdMatch;
        if (!url.startsWith('http')) return null;
        return { title, url };
      }

      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const url = parts[parts.length - 1];
        const title = parts.slice(0, parts.length - 1).join(' ');
        if (url.startsWith('http')) return { title, url };
      }

      // 也支持只输入一个 URL
      if (parts.length === 1 && parts[0].startsWith('http')) {
        return { title: parts[0], url: parts[0] };
      }

      return null;
    })
    .filter(Boolean) as Link[];
  return links.length > 0 ? links : undefined;
}

function emptySubtask(): Subtask {
  return { text: '', level: 1, completed: false, children: [] };
}

function updateSubtaskAtPath(
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

function deleteSubtaskAtPath(subtasks: Subtask[], path: number[]): Subtask[] {
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

function SubtaskLinksEditor({
  subtask,
  path,
  onChange,
}: {
  subtask: Subtask;
  path: number[];
  onChange: (path: number[], updated: Subtask) => void;
}) {
  const [linksText, setLinksText] = useState(linksToText(subtask.links));

  useEffect(() => {
    setLinksText(linksToText(subtask.links));
  }, [subtask.links]);

  const handleBlur = () => {
    onChange(path, { ...subtask, links: textToLinks(linksText) });
  };

  return (
    <textarea
      value={linksText}
      onChange={(e) => setLinksText(e.target.value)}
      onBlur={handleBlur}
      placeholder="链接（每行「标题 URL」）"
      rows={2}
      className="input"
    />
  );
}

function SubtaskEditor({
  subtask,
  path,
  onChange,
  onDelete,
  depth,
}: {
  subtask: Subtask;
  path: number[];
  onChange: (path: number[], updated: Subtask) => void;
  onDelete: (path: number[]) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (patch: Partial<Subtask>) => {
    onChange(path, { ...subtask, ...patch });
  };

  return (
    <div
      style={{ marginLeft: depth * 16 }}
      className="mt-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={subtask.completed}
          onChange={(e) => handleChange({ completed: e.target.checked })}
          data-testid="subtask-checkbox"
          className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)] focus:ring-[var(--color-border-focus)]"
        />
        <input
          type="text"
          value={subtask.text}
          onChange={(e) => handleChange({ text: e.target.value })}
          placeholder="子任务标题"
          className="input min-w-0 flex-1"
        />
        {depth < 2 && (
          <button
            type="button"
            onClick={() =>
              onChange(path, {
                ...subtask,
                children: [...subtask.children, { ...emptySubtask(), level: subtask.level + 1 }],
              })
            }
            title="添加子任务"
            className="btn-ghost p-1.5"
            aria-label="添加子任务"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title="备注/链接"
          className={[
            'btn-ghost p-1.5',
            expanded ? 'bg-[var(--color-surface-hover)] text-[var(--color-text)]' : '',
          ].join(' ')}
          aria-label={expanded ? '收起备注和链接' : '展开备注和链接'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => onDelete(path)}
          title="删除"
          className="btn-ghost p-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)]"
          aria-label="删除子任务"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">开始时间</span>
              <input
                type="date"
                value={subtask.start ?? ''}
                onChange={(e) => handleChange({ start: e.target.value || undefined })}
                className="input w-full"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">截止时间</span>
              <input
                type="date"
                value={subtask.due ?? ''}
                onChange={(e) => handleChange({ due: e.target.value || undefined })}
                className="input w-full"
              />
            </label>
          </div>
          <NoteEditor
            value={subtask.note ?? ''}
            onChange={(v) => handleChange({ note: v || undefined })}
            placeholder="备注（Markdown）"
            rows={3}
          />
          <SubtaskLinksEditor subtask={subtask} path={path} onChange={onChange} />
        </div>
      )}

      <div className="mt-2">
        {subtask.children.map((child, i) => (
          <SubtaskEditor
            key={`${path.join('-')}-${i}`}
            subtask={child}
            path={[...path, i]}
            onChange={onChange}
            onDelete={onDelete}
            depth={depth + 1}
          />
        ))}
      </div>
    </div>
  );
}

function TaskSubtasksEditor({
  subtasks,
  onChange,
}: {
  subtasks: Subtask[];
  onChange: (subtasks: Subtask[]) => void;
}) {
  const handleChange = (path: number[], updated: Subtask) => {
    onChange(updateSubtaskAtPath(subtasks, path, () => updated));
  };

  const handleDelete = (path: number[]) => {
    onChange(deleteSubtaskAtPath(subtasks, path));
  };

  const handleAddRoot = () => {
    onChange([...subtasks, emptySubtask()]);
  };

  return (
    <div className="space-y-2">
      {subtasks.map((s, i) => (
        <SubtaskEditor
          key={`root-${i}`}
          subtask={s}
          path={[i]}
          onChange={handleChange}
          onDelete={handleDelete}
          depth={0}
        />
      ))}
      <button
        type="button"
        onClick={handleAddRoot}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] py-2.5 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)] transition-colors duration-100"
      >
        <Plus className="h-4 w-4" />
        添加子任务
      </button>
    </div>
  );
}

export function TaskEditor({
  task,
  groups,
  onSave,
  onClose,
}: {
  task: Task;
  groups: string[];
  onSave: (updated: Task) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [group, setGroup] = useState(task.group);
  const [priority, setPriority] = useState(task.meta.priority);
  const [status, setStatus] = useState(task.meta.status ?? 'pending');
  const [start, setStart] = useState(task.meta.start ?? '');
  const [due, setDue] = useState(task.meta.due ?? '');
  const [repeat, setRepeat] = useState(task.meta.repeat ?? '');
  const [repeatUntil, setRepeatUntil] = useState(task.meta.repeat_until ?? '');
  const [note, setNote] = useState(task.note ?? '');
  const [linksText, setLinksText] = useState(linksToText(task.links));
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks);

  const saveTask = useCallback(() => {
    const updated: Task = {
      ...task,
      title: title.trim() || task.title,
      group,
      meta: {
        ...task.meta,
        priority,
        status,
        start: start || undefined,
        due: due || undefined,
        repeat: repeat || undefined,
        repeat_until: repeatUntil || undefined,
      },
      note: note || undefined,
      links: textToLinks(linksText),
      subtasks,
    };
    onSave(updated);
  }, [task, title, group, priority, status, start, due, repeat, repeatUntil, note, linksText, subtasks, onSave]);

  const prevSubtasksRef = useRef<Subtask[]>(subtasks);

  useEffect(() => {
    if (detectSubtaskToggle(prevSubtasksRef.current, subtasks)) {
      saveTask();
    }
    prevSubtasksRef.current = subtasks;
  }, [subtasks, saveTask]);

  return (
    <div
      className="flex h-full flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-raised)]"
      data-testid="task-editor"
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
        <h2 className="text-base font-semibold text-[var(--color-text)]">任务详情</h2>
        <button
          type="button"
          onClick={onClose}
          className="btn-ghost p-1.5"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">标题</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">分组</span>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="select w-full"
            >
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">优先级</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task['meta']['priority'])}
                className="select"
              >
                <option value="high">高</option>
                <option value="med">中</option>
                <option value="low">低</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">状态</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as NonNullable<Task['meta']['status']>)}
                className="select"
              >
                <option value="pending">待处理</option>
                <option value="active">进行中</option>
                <option value="done">已完成</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">开始时间</span>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="input"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">截止时间</span>
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="input"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">重复规则</span>
              <select
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                className="select"
              >
                <option value="">无</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
                <option value="weekdays">工作日</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">重复截止</span>
              <input
                type="date"
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
                className="input"
              />
            </label>
          </div>

          <div className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">子任务</span>
            <TaskSubtasksEditor subtasks={subtasks} onChange={setSubtasks} />
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">备注（Markdown）</span>
            <NoteEditor value={note} onChange={setNote} placeholder="备注（Markdown）" rows={4} />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">链接（每行「标题 URL」）</span>
            <textarea
              value={linksText}
              onChange={(e) => setLinksText(e.target.value)}
              rows={3}
              className="input"
              placeholder="飞书任务 https://example.com"
            />
          </label>
        </div>
      </div>

      <div className="flex gap-3 border-t border-[var(--color-border)] p-4">
        <button
          type="button"
          onClick={() => {
            saveTask();
            onClose();
          }}
          className="btn-primary flex-1"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary"
        >
          取消
        </button>
      </div>
    </div>
  );
}
