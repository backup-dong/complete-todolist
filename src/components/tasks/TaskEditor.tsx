import { useCallback, useEffect, useMemo, useRef, useReducer, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { DraggableAttributes, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Link, Subtask, Task } from '@/types';
import { NoteEditor } from '@/components/common/NoteEditor';
import { deleteSubtaskAtPath, emptySubtask, reorderSubtasksAtPath, updateSubtaskAtPath } from '@/utils/subtasks';

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

interface DraftTask {
  title: string;
  group: string;
  priority: Task['meta']['priority'];
  status: NonNullable<Task['meta']['status']>;
  start: string;
  due: string;
  repeat: string;
  repeat_until: string;
  note: string;
  linksText: string;
  subtasks: Subtask[];
}

type DraftAction =
  | { type: 'set'; field: keyof DraftTask; value: DraftTask[keyof DraftTask] }
  | { type: 'reset'; task: Task };

function buildDraft(task: Task): DraftTask {
  return {
    title: task.title,
    group: task.group,
    priority: task.meta.priority,
    status: task.meta.status ?? 'pending',
    start: task.meta.start ?? '',
    due: task.meta.due ?? '',
    repeat: task.meta.repeat ?? '',
    repeat_until: task.meta.repeat_until ?? '',
    note: task.note ?? '',
    linksText: linksToText(task.links),
    subtasks: task.subtasks,
  };
}

function draftReducer(state: DraftTask, action: DraftAction): DraftTask {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'reset':
      return buildDraft(action.task);
  }
}

function LinksTextArea({
  value,
  onChange,
  placeholder,
  rows,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="input"
      placeholder={placeholder}
    />
  );
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

  return (
    <textarea
      key={linksToText(subtask.links)}
      value={linksText}
      onChange={(e) => setLinksText(e.target.value)}
      onBlur={() => onChange(path, { ...subtask, links: textToLinks(linksText) })}
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
  expandedPath,
  onExpand,
  dragHandleAttributes,
  dragHandleListeners,
}: {
  subtask: Subtask;
  path: number[];
  onChange: (path: number[], updated: Subtask) => void;
  onDelete: (path: number[]) => void;
  depth: number;
  expandedPath: number[] | null;
  onExpand: (path: number[] | null) => void;
  dragHandleAttributes?: DraggableAttributes;
  dragHandleListeners?: ReturnType<typeof useSortable>['listeners'];
}) {
  const expanded = pathsEqual(expandedPath, path);

  const handleChange = (patch: Partial<Subtask>) => {
    onChange(path, { ...subtask, ...patch });
  };

  return (
    <div
      style={{ marginLeft: depth * 16 }}
      className="mt-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 shadow-sm"
    >
      <div className="flex items-center gap-2">
        {dragHandleAttributes && (
          <button
            type="button"
            className="shrink-0 cursor-grab rounded-md p-1 text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus:opacity-100 active:cursor-grabbing group-hover:opacity-100"
            aria-label="拖拽排序"
            {...dragHandleAttributes}
            {...dragHandleListeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
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
                children: [...subtask.children, emptySubtask(subtask.level + 1)],
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
          onClick={() => onExpand(expanded ? null : path)}
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
          onClick={() => {
            if (expanded || pathStartsWith(expandedPath, path)) {
              onExpand(null);
            }
            onDelete(path);
          }}
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
        <SubtaskList
          subtasks={subtask.children}
          parentPath={path}
          onChange={onChange}
          onDelete={onDelete}
          depth={depth + 1}
          expandedPath={expandedPath}
          onExpand={onExpand}
        />
      </div>
    </div>
  );
}

function SortableSubtaskEditor({
  subtask,
  path,
  onChange,
  onDelete,
  depth,
  expandedPath,
  onExpand,
}: {
  subtask: Subtask;
  path: number[];
  onChange: (path: number[], updated: Subtask) => void;
  onDelete: (path: number[]) => void;
  depth: number;
  expandedPath: number[] | null;
  onExpand: (path: number[] | null) => void;
}) {
  const id = path.join('.');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? transition : undefined,
    opacity: isDragging ? 0.4 : 1,
    scale: isDragging ? '0.98' : '1',
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="group">
      <SubtaskEditor
        subtask={subtask}
        path={path}
        onChange={onChange}
        onDelete={onDelete}
        depth={depth}
        expandedPath={expandedPath}
        onExpand={onExpand}
        dragHandleAttributes={attributes}
        dragHandleListeners={listeners}
      />
    </div>
  );
}

function SubtaskList({
  subtasks,
  parentPath,
  onChange,
  onDelete,
  depth,
  expandedPath,
  onExpand,
}: {
  subtasks: Subtask[];
  parentPath: number[];
  onChange: (path: number[], updated: Subtask) => void;
  onDelete: (path: number[]) => void;
  depth: number;
  expandedPath: number[] | null;
  onExpand: (path: number[] | null) => void;
}) {
  const ids = useMemo(() => subtasks.map((_, i) => [...parentPath, i].join('.')), [subtasks, parentPath]);

  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div>
        {subtasks.map((s, i) => (
          <SortableSubtaskEditor
            key={[...parentPath, i].join('.')}
            subtask={s}
            path={[...parentPath, i]}
            onChange={onChange}
            onDelete={onDelete}
            depth={depth}
            expandedPath={expandedPath}
            onExpand={onExpand}
          />
        ))}
      </div>
    </SortableContext>
  );
}

function idToPath(id: string): number[] {
  return id.split('.').map(Number);
}

function areSiblings(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getChildrenAtPath(subtasks: Subtask[], path: number[]): Subtask[] {
  let current = subtasks;
  for (const idx of path) {
    current = current[idx]?.children ?? [];
  }
  return current;
}

function pathsEqual(a: number[] | null, b: number[] | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function pathStartsWith(path: number[] | null, prefix: number[]): boolean {
  if (!path || path.length < prefix.length) return false;
  return prefix.every((v, i) => path[i] === v);
}

function TaskSubtasksEditor({
  subtasks,
  onChange,
}: {
  subtasks: Subtask[];
  onChange: (subtasks: Subtask[]) => void;
}) {
  const [expandedPath, setExpandedPath] = useState<number[] | null>(null);

  const handleChange = (path: number[], updated: Subtask) => {
    onChange(updateSubtaskAtPath(subtasks, path, () => updated));
  };

  const handleDelete = (path: number[]) => {
    if (pathsEqual(expandedPath, path) || pathStartsWith(expandedPath, path)) {
      setExpandedPath(null);
    }
    onChange(deleteSubtaskAtPath(subtasks, path));
  };

  const handleAddRoot = () => {
    onChange([...subtasks, emptySubtask()]);
  };

  const handleReorder = (parentPath: number[], fromIndex: number, toIndex: number) => {
    setExpandedPath(null);
    onChange(reorderSubtasksAtPath(subtasks, parentPath, fromIndex, toIndex));
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const fromPath = idToPath(active.id as string);
    const toPath = idToPath(over.id as string);
    if (!areSiblings(fromPath, toPath)) return;

    const parentPath = fromPath.slice(0, -1);
    const ids = getChildrenAtPath(subtasks, parentPath).map((_, i) => [...parentPath, i].join('.'));
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from < 0 || to < 0) return;

    handleReorder(parentPath, from, to);
  };

  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setExpandedPath(null);
    setActiveId(event.active.id as string);
  };

  const activeSubtask = useMemo(() => {
    if (!activeId) return null;
    const path = idToPath(activeId);
    let current: Subtask | null = null;
    let list = subtasks;
    for (let i = 0; i < path.length; i++) {
      current = list[path[i]] ?? null;
      if (!current) return null;
      list = current.children;
    }
    return current;
  }, [activeId, subtasks]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-2">
        <SubtaskList
          subtasks={subtasks}
          parentPath={[]}
          onChange={handleChange}
          onDelete={handleDelete}
          depth={0}
          expandedPath={expandedPath}
          onExpand={setExpandedPath}
        />
        <button
          type="button"
          onClick={handleAddRoot}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] py-2.5 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)] transition-colors duration-100"
        >
          <Plus className="h-4 w-4" />
          添加子任务
        </button>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeSubtask ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg opacity-90 rotate-1">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-[var(--color-text-muted)]" />
              <span className="text-sm text-[var(--color-text)]">{activeSubtask.text}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function TaskMetaFields({
  draft,
  groups,
  dispatch,
}: {
  draft: DraftTask;
  groups: string[];
  dispatch: (action: DraftAction) => void;
}) {
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">标题</span>
        <input
          value={draft.title}
          onChange={(e) => dispatch({ type: 'set', field: 'title', value: e.target.value })}
          className="input"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">分组</span>
        <select
          value={draft.group}
          onChange={(e) => dispatch({ type: 'set', field: 'group', value: e.target.value })}
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
            value={draft.priority}
            onChange={(e) => dispatch({ type: 'set', field: 'priority', value: e.target.value as Task['meta']['priority'] })}
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
            value={draft.status}
            onChange={(e) => dispatch({ type: 'set', field: 'status', value: e.target.value as NonNullable<Task['meta']['status']> })}
            className="select"
          >
            <option value="pending">待处理</option>
            <option value="active">进行中</option>
            <option value="done">已完成</option>
          </select>
        </label>
      </div>
    </>
  );
}

function TaskDateFields({ draft, dispatch }: { draft: DraftTask; dispatch: (action: DraftAction) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">开始时间</span>
          <input
            type="date"
            value={draft.start}
            onChange={(e) => dispatch({ type: 'set', field: 'start', value: e.target.value })}
            className="input"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">截止时间</span>
          <input
            type="date"
            value={draft.due}
            onChange={(e) => dispatch({ type: 'set', field: 'due', value: e.target.value })}
            className="input"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">重复规则</span>
          <select
            value={draft.repeat}
            onChange={(e) => dispatch({ type: 'set', field: 'repeat', value: e.target.value })}
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
            value={draft.repeat_until}
            onChange={(e) => dispatch({ type: 'set', field: 'repeat_until', value: e.target.value })}
            className="input"
          />
        </label>
      </div>
    </>
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
  const [draft, dispatch] = useReducer(draftReducer, task, buildDraft);

  const makeTask = useCallback((): Task => {
    return {
      ...task,
      title: draft.title.trim() || task.title,
      group: draft.group,
      meta: {
        ...task.meta,
        priority: draft.priority,
        status: draft.status,
        start: draft.start || undefined,
        due: draft.due || undefined,
        repeat: draft.repeat || undefined,
        repeat_until: draft.repeat_until || undefined,
      },
      note: draft.note || undefined,
      links: textToLinks(draft.linksText),
      subtasks: draft.subtasks,
    };
  }, [draft, task]);

  const saveTask = useCallback(() => {
    onSave(makeTask());
  }, [makeTask, onSave]);

  const prevSubtasksRef = useRef<Subtask[]>(draft.subtasks);

  useEffect(() => {
    if (detectSubtaskToggle(prevSubtasksRef.current, draft.subtasks)) {
      saveTask();
    }
    prevSubtasksRef.current = draft.subtasks;
  }, [draft.subtasks, saveTask]);

  return (
    <div
      className="flex h-full flex-col bg-[var(--color-surface-raised)]"
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
          <TaskMetaFields draft={draft} groups={groups} dispatch={dispatch} />
          <TaskDateFields draft={draft} dispatch={dispatch} />

          <div className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">子任务</span>
            <TaskSubtasksEditor
              subtasks={draft.subtasks}
              onChange={(subtasks) => dispatch({ type: 'set', field: 'subtasks', value: subtasks })}
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">备注（Markdown）</span>
            <NoteEditor
              value={draft.note}
              onChange={(v) => dispatch({ type: 'set', field: 'note', value: v })}
              placeholder="备注（Markdown）"
              rows={4}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">链接（每行「标题 URL」）</span>
            <LinksTextArea
              value={draft.linksText}
              onChange={(v) => dispatch({ type: 'set', field: 'linksText', value: v })}
              placeholder="飞书任务 https://example.com"
              rows={3}
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
