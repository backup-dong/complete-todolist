import { useCallback, useEffect, useMemo, useRef, useReducer, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  Link as LinkIcon,
  Pencil,
  Plus,
  Trash2,
  Upload,
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
import type { FileRef, GithubConfig, Link, Subtask, Task } from '@/types';
import { createContext, useContext } from 'react';
import { getDay, parseISO } from 'date-fns';
import { DateInput } from '@/components/common/DateInput';
import { NoteEditor } from '@/components/common/NoteEditor';
import { nowIso, todayIso, formatDateTime } from '@/utils/date';
import {
  getFirstDueDate,
  isMonthlyDaysRule,
  isWeekdayRule,
  parseWeekdayRule,
  WEEKDAY_OPTIONS,
  type WeekDay,
} from '@/utils/repeat';
import { deleteSubtaskAtPath, emptySubtask, reorderSubtasksAtPath, updateSubtaskAtPath } from '@/utils/subtasks';
import { FileListDisplay } from './FileAttachments';
import { useFileDownload } from '@/utils/useFileDownload';
import { uploadFileToRepo } from '@/utils/fileUpload';
import { deleteFile } from '@/github/client';
import { useSyncStore } from '@/stores/syncStore';
import { useListsStore } from '@/stores/listsStore';

const TaskEditorCtx = createContext<{
  config: GithubConfig | null;
  activeListName: string | null;
  taskId: string;
} | null>(null);

function useTaskEditorCtx() {
  const ctx = useContext(TaskEditorCtx);
  if (!ctx) throw new Error('TaskEditorCtx not found');
  return ctx;
}

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

function weekdayFromDate(iso: string): WeekDay {
  const map: Record<number, WeekDay> = {
    0: 'sun',
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
    6: 'sat',
  };
  return map[getDay(parseISO(iso))] ?? 'mon';
}

interface DraftTask {
  title: string;
  group: string;
  priority: Task['meta']['priority'];
  status: NonNullable<Task['meta']['status']>;
  completed_at?: string;
  start: string;
  due: string;
  repeat: string;
  repeat_until: string;
  note: string;
  linksText: string;
  subtasks: Subtask[];
  files: FileRef[];
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
    completed_at: task.completed_at,
    start: task.meta.start ?? '',
    due: task.meta.due ?? '',
    repeat: task.meta.repeat ?? '',
    repeat_until: task.meta.repeat_until ?? '',
    note: task.note ?? '',
    linksText: linksToText(task.links),
    subtasks: task.subtasks,
    files: task.files ?? [],
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

function LinksEditor({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [preview, setPreview] = useState(true);
  const [draftText, setDraftText] = useState(value);
  const links = textToLinks(value);

  const handleToggle = () => {
    if (preview) {
      setDraftText(value);
    } else {
      onChange(draftText);
    }
    setPreview((v) => !v);
  };

  return (
    <div className={`rounded-lg border border-[var(--color-border-subtle)] ${className}`}>
      <div className="flex items-center justify-end border-b border-[var(--color-border-subtle)] px-3 py-1.5">
        <button
          type="button"
          onClick={handleToggle}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
        >
          {preview ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {preview ? '编辑' : '预览'}
        </button>
      </div>
      {preview ? (
        <div className="p-3">
          {links && links.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {links.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-[200px] items-center gap-1 rounded-md bg-[var(--color-primary-subtle)] px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
                  title={link.url}
                >
                  <LinkIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{link.title || '链接'}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">暂无链接</p>
          )}
        </div>
      ) : (
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={() => onChange(draftText)}
          rows={3}
          className="input border-0 focus:ring-0"
          placeholder="每行一条「标题 URL」或 Markdown 格式 [标题](URL)"
          autoFocus
        />
      )}
    </div>
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
  const [preview, setPreview] = useState(true);
  const [draftText, setDraftText] = useState(linksToText(subtask.links));

  const handleToggle = () => {
    if (preview) {
      setDraftText(linksToText(subtask.links));
    } else {
      onChange(path, { ...subtask, links: textToLinks(draftText) });
    }
    setPreview((v) => !v);
  };

  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-3 py-1.5">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">链接</span>
        <button
          type="button"
          onClick={handleToggle}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
        >
          {preview ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {preview ? '编辑' : '预览'}
        </button>
      </div>
      {preview ? (
        <div className="p-3">
          {subtask.links && subtask.links.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {subtask.links.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-[200px] items-center gap-1 rounded-md bg-[var(--color-primary-subtle)] px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
                  title={link.url}
                >
                  <LinkIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{link.title || '链接'}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">暂无链接</p>
          )}
        </div>
      ) : (
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={() => onChange(path, { ...subtask, links: textToLinks(draftText) })}
          placeholder="每行一条「标题 URL」"
          rows={3}
          className="input min-h-[80px] resize-y border-0 focus:ring-0"
          autoFocus
        />
      )}
    </div>
  );
}

function SubtaskFilesEditor({
  subtask,
  path,
  onChange,
}: {
  subtask: Subtask;
  path: number[];
  onChange: (path: number[], updated: Subtask) => void;
}) {
  const { config, activeListName, taskId } = useTaskEditorCtx();
  const downloadFile = useFileDownload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || !config || !activeListName) return;
    setUploading(true);
    try {
      const existingPaths = new Set((subtask.files ?? []).map((f) => f.path));
      for (const file of Array.from(fileList)) {
        try {
          const ref = await uploadFileToRepo(config, file, activeListName, taskId);
          if (!existingPaths.has(ref.path)) {
            existingPaths.add(ref.path);
            onChange(path, { ...subtask, files: [...(subtask.files ?? []), ref] });
          }
        } catch (err) {
          console.error(`Upload failed for ${file.name}:`, err);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (file: FileRef) => {
    onChange(path, {
      ...subtask,
      files: (subtask.files ?? []).filter((f) => f.path !== file.path),
    });
    if (config) {
      try {
        await deleteFile(config, file.path, file.sha);
      } catch (err) {
        console.error(`Failed to delete file from GitHub: ${file.path}`, err);
      }
    }
  };

  return (
    <div>
      <FileListDisplay
        files={subtask.files ?? []}
        onDownload={downloadFile}
        onDelete={handleDelete}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => {
          handleUpload(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <button
        type="button"
        disabled={uploading || !config || !activeListName}
        onClick={() => fileInputRef.current?.click()}
        className="mt-1 flex items-center gap-1.5 rounded-md border border-dashed border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-40"
      >
        <Upload className="h-3 w-3" />
        {uploading ? '上传中...' : '上传文件'}
      </button>
    </div>
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
    // 当勾选/取消勾选子任务时，同步设置/清除 completed_at
    if ('completed' in patch) {
      patch.completed_at = patch.completed ? nowIso() : undefined;
    }
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
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] transition-colors duration-100"
        />
        <span
          className="hidden w-24 shrink-0 items-center justify-end gap-1 text-xs text-[var(--color-text-muted)] sm:flex"
          title={subtask.completed && subtask.completed_at ? `完成于 ${formatDateTime(subtask.completed_at)}` : undefined}
        >
          {subtask.completed && subtask.completed_at && (
            <>
              <Check className="h-3.5 w-3.5" />
              {formatDateTime(subtask.completed_at)}
            </>
          )}
        </span>
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

      {subtask.completed && subtask.completed_at && (
        <div
          className="mt-1.5 flex items-center justify-end gap-1 text-xs text-[var(--color-text-muted)] sm:hidden"
          title={`完成于 ${formatDateTime(subtask.completed_at)}`}
        >
          <Check className="h-3.5 w-3.5" />
          {formatDateTime(subtask.completed_at)}
        </div>
      )}

      {expanded && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">开始时间</span>
              <DateInput
                value={subtask.start ?? ''}
                onChange={(value) => handleChange({ start: value || undefined })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">截止时间</span>
              <DateInput
                value={subtask.due ?? ''}
                onChange={(value) => handleChange({ due: value || undefined })}
              />
            </label>
          </div>
          <NoteEditor
            value={subtask.note ?? ''}
            onChange={(v) => handleChange({ note: v || undefined })}
            placeholder="备注（Markdown）"
            rows={3}
            title="备注"
          />
          <SubtaskLinksEditor subtask={subtask} path={path} onChange={onChange} />
          <SubtaskFilesEditor subtask={subtask} path={path} onChange={onChange} />
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
      <div className="flex flex-wrap items-center gap-2">
              <GripVertical className="h-4 w-4 text-[var(--color-text-muted)]" />
              <span className="text-sm text-[var(--color-text)]">{activeSubtask.text}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4 shadow-sm ${className}`}>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
      </h3>
      {children}
    </div>
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
    <Section title="基本信息">
      <div className="space-y-3">
        <input
          value={draft.title}
          onChange={(e) => dispatch({ type: 'set', field: 'title', value: e.target.value })}
          placeholder="任务标题"
          className="w-full border-0 bg-transparent p-0 text-xl font-semibold text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-0"
        />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">分组</span>
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
      </div>
    </Section>
  );
}

function TaskStatusFields({
  draft,
  dispatch,
}: {
  draft: DraftTask;
  dispatch: (action: DraftAction) => void;
}) {
  return (
    <Section title="状态">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">优先级</span>
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
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">状态</span>
          <select
            value={draft.status}
            onChange={(e) => {
              const status = e.target.value as NonNullable<Task['meta']['status']>;
              dispatch({ type: 'set', field: 'status', value: status });
              if (status === 'done' && !draft.completed_at) {
                dispatch({ type: 'set', field: 'completed_at', value: nowIso() });
              }
            }}
            className="select"
          >
            <option value="pending">待处理</option>
            <option value="active">进行中</option>
            <option value="done">已完成</option>
          </select>
          {draft.status === 'done' && draft.completed_at && (
            <span className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
              <Check className="h-3.5 w-3.5" />
              完成于 {formatDateTime(draft.completed_at)}
            </span>
          )}
        </label>
      </div>
    </Section>
  );
}

function TaskDateFields({ draft, dispatch }: { draft: DraftTask; dispatch: (action: DraftAction) => void }) {
  const [monthlyInputText, setMonthlyInputText] = useState('');

  const repeatMode = useMemo(() => {
    if (!draft.repeat) return '';
    if (['daily', 'monthly', 'weekdays'].includes(draft.repeat)) return draft.repeat;
    if (isWeekdayRule(draft.repeat)) return 'weekly';
    if (isMonthlyDaysRule(draft.repeat)) return 'monthly';
    return '';
  }, [draft.repeat]);

  const selectedWeekdays = useMemo(() => {
    if (repeatMode !== 'weekly') return [];
    const parsed = parseWeekdayRule(draft.repeat);
    return parsed.length > 0 ? parsed : [weekdayFromDate(draft.due || todayIso())];
  }, [draft.repeat, repeatMode, draft.due]);

  const monthlyCustomDays = useMemo(() => {
    return repeatMode === 'monthly' && isMonthlyDaysRule(draft.repeat) ? draft.repeat : '';
  }, [draft.repeat, repeatMode]);

  const handleRepeatModeChange = (mode: string) => {
    setMonthlyInputText('');
    if (mode === '') {
      dispatch({ type: 'set', field: 'repeat', value: '' });
    } else if (mode === 'daily') {
      dispatch({ type: 'set', field: 'repeat', value: 'daily' });
      dispatch({ type: 'set', field: 'due', value: todayIso() });
    } else if (mode === 'weekdays') {
      dispatch({ type: 'set', field: 'repeat', value: 'weekdays' });
      dispatch({ type: 'set', field: 'due', value: getFirstDueDate('weekdays') });
    } else if (mode === 'monthly') {
      dispatch({ type: 'set', field: 'repeat', value: 'monthly' });
      dispatch({ type: 'set', field: 'due', value: todayIso() });
    } else if (mode === 'weekly') {
      const defaultDay = weekdayFromDate(draft.due || todayIso());
      dispatch({ type: 'set', field: 'repeat', value: defaultDay });
      dispatch({ type: 'set', field: 'due', value: getFirstDueDate(defaultDay) });
    }
  };

  const toggleWeekday = (key: WeekDay) => {
    const next = selectedWeekdays.includes(key)
      ? selectedWeekdays.filter((k) => k !== key)
      : [...selectedWeekdays, key].sort(
          (a, b) =>
            WEEKDAY_OPTIONS.findIndex((o) => o.key === a) -
            WEEKDAY_OPTIONS.findIndex((o) => o.key === b),
        );
    if (next.length === 0) return;
    const repeatValue = next.join(',');
    dispatch({ type: 'set', field: 'repeat', value: repeatValue });
    dispatch({ type: 'set', field: 'due', value: getFirstDueDate(repeatValue) });
  };

  const handleMonthlyDaysChange = (value: string) => {
    // 保留原始输入（含逗号），仅去除非数字和逗号
    const cleaned = value.replace(/[^0-9,]/g, '');
    setMonthlyInputText(cleaned);

    // 解析有效数字用于更新 repeat
    const parts = cleaned.split(',').filter((p) => /^[0-9]+$/.test(p));
    if (parts.length > 0) {
      const repeatValue = parts.join(',');
      dispatch({ type: 'set', field: 'repeat', value: repeatValue });
      dispatch({ type: 'set', field: 'due', value: getFirstDueDate(repeatValue) });
    } else {
      dispatch({ type: 'set', field: 'repeat', value: 'monthly' });
    }
  };

  return (
    <Section title="日期与重复">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">开始时间</span>
            <DateInput
              value={draft.start}
              onChange={(value) => dispatch({ type: 'set', field: 'start', value })}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">截止时间</span>
            <DateInput
              value={draft.due}
              onChange={(value) => dispatch({ type: 'set', field: 'due', value })}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">重复规则</span>
            <select
              value={repeatMode}
              onChange={(e) => handleRepeatModeChange(e.target.value)}
              className="select"
            >
              <option value="">无</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
              <option value="weekdays">工作日</option>
            </select>

            {repeatMode === 'weekly' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleWeekday(key)}
                    className={`min-w-[2rem] rounded-md border px-2.5 py-1 text-sm transition-colors ${
                      selectedWeekdays.includes(key)
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-text-inverse)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {repeatMode === 'monthly' && (
              <input
                type="text"
                value={monthlyInputText || monthlyCustomDays}
                onChange={(e) => handleMonthlyDaysChange(e.target.value)}
                placeholder="例如 1,15，留空表示每月同一天"
                className="input mt-2"
              />
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">重复截止</span>
            <DateInput
              value={draft.repeat_until}
              onChange={(value) => dispatch({ type: 'set', field: 'repeat_until', value })}
            />
          </label>
        </div>
      </div>
    </Section>
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
  const [uploading, setUploading] = useState(false);
  const downloadFile = useFileDownload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const config = useSyncStore((s) => s.config);
  const activeListName = useListsStore((s) => s.activeListName);

  const makeTask = useCallback((): Task => {
    const completed = draft.status === 'done';
    return {
      ...task,
      title: draft.title.trim() || task.title,
      group: draft.group,
      completed_at: completed ? (draft.completed_at ?? nowIso()) : undefined,
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
      files: draft.files.length > 0 ? draft.files : undefined,
      subtasks: draft.subtasks,
    };
  }, [draft, task]);

  const saveTask = useCallback(() => {
    onSave(makeTask());
  }, [makeTask, onSave]);

  const handleUploadFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || !config || !activeListName) return;
      setUploading(true);
      try {
        const newFiles: FileRef[] = [];
        for (const file of Array.from(fileList)) {
          try {
            const ref = await uploadFileToRepo(config, file, activeListName, task.id);
            newFiles.push(ref);
          } catch (err) {
            console.error(`Upload failed for ${file.name}:`, err);
          }
        }
        if (newFiles.length > 0) {
          const existingPaths = new Set(draft.files.map((f) => f.path));
          const merged = [...draft.files, ...newFiles.filter((f) => !existingPaths.has(f.path))];
          dispatch({ type: 'set', field: 'files', value: merged });
        }
      } finally {
        setUploading(false);
      }
    },
    [config, activeListName, task.id, draft.files],
  );

  const handleDeleteFile = useCallback(
    async (file: FileRef) => {
      dispatch({
        type: 'set',
        field: 'files',
        value: draft.files.filter((f) => f.path !== file.path),
      });
      if (config) {
        try {
          await deleteFile(config, file.path, file.sha);
        } catch (err) {
          console.error(`Failed to delete file from GitHub: ${file.path}`, err);
        }
      }
    },
    [draft.files, config],
  );

  const prevSubtasksRef = useRef<Subtask[]>(draft.subtasks);

  useEffect(() => {
    if (detectSubtaskToggle(prevSubtasksRef.current, draft.subtasks)) {
      saveTask();
    }
    prevSubtasksRef.current = draft.subtasks;
  }, [draft.subtasks, saveTask]);

  return (
    <TaskEditorCtx.Provider value={{ config, activeListName, taskId: task.id }}>
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
        <div className="mx-auto max-w-5xl space-y-4">
          <TaskMetaFields draft={draft} groups={groups} dispatch={dispatch} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TaskStatusFields draft={draft} dispatch={dispatch} />
            <TaskDateFields draft={draft} dispatch={dispatch} />
          </div>

          <Section title="子任务">
            <TaskSubtasksEditor
              subtasks={draft.subtasks}
              onChange={(subtasks) => dispatch({ type: 'set', field: 'subtasks', value: subtasks })}
            />
          </Section>

          <Section title="备注">
            <NoteEditor
              value={draft.note}
              onChange={(v) => dispatch({ type: 'set', field: 'note', value: v })}
              placeholder="备注（Markdown）"
              rows={4}
              className="border-0 bg-transparent"
            />
          </Section>

          <Section title="链接">
            <LinksEditor
              value={draft.linksText}
              onChange={(v) => dispatch({ type: 'set', field: 'linksText', value: v })}
              className="border-0 bg-transparent"
            />
          </Section>

          <Section title="附件">
            <FileListDisplay
              files={draft.files}
              onDownload={downloadFile}
              onDelete={handleDeleteFile}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => {
                handleUploadFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading || !config || !activeListName}
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] py-2.5 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-40"
            >
              <Upload className="h-4 w-4" />
              {uploading ? '上传中...' : '上传文件'}
            </button>
          </Section>
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
    </TaskEditorCtx.Provider>
  );
}
