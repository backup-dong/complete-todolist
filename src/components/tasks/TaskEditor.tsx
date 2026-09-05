import { useCallback, useEffect, useMemo, useRef, useReducer, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Eye,
  GripVertical,
  Link as LinkIcon,
  Maximize2,
  Minimize2,
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
import type { FileRef, GithubConfig, Link, Task, TaskMeta } from '@/types';
import { createContext, useContext } from 'react';
import { getDay, parseISO } from 'date-fns';
import { DateInput } from '@/components/common/DateInput';
import { NoteEditor } from '@/components/common/NoteEditor';
import { nowIso, todayIso, formatDateTime } from '@/utils/date';
import { generateTaskId } from '@/utils/id';
import {
  getFirstDueDate,
  isMonthlyDaysRule,
  isWeekdayRule,
  parseWeekdayRule,
  WEEKDAY_OPTIONS,
  type WeekDay,
} from '@/utils/repeat';
import { FileListDisplay } from './FileAttachments';
import { TagPill } from './TagPill';
import { useClipboardPaste } from '@/utils/useClipboardPaste';
import { toast } from '@/utils/toast';
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

/** 收集子树中全部后代任务的状态（含嵌套），用于推断主任务状态。 */
function collectSubtaskStatuses(subtasks: Task[]): TaskMeta['status'][] {
  return subtasks.flatMap((t) => [
    t.meta.status ?? 'pending',
    ...collectSubtaskStatuses(t.subtasks ?? []),
  ]);
}

/** 按与 store `inferStatus` 相同的规则推断主任务状态：全部完成→done、部分完成→active、均未完成→pending。 */
function inferParentStatus(subtasks: Task[]): TaskMeta['status'] | null {
  const statuses = collectSubtaskStatuses(subtasks);
  if (statuses.length === 0) return null;
  if (statuses.every((s) => s === 'done')) return 'done';
  if (statuses.some((s) => s === 'done')) return 'active';
  return 'pending';
}

function detectSubtaskToggle(prev: Task[], curr: Task[]): boolean {
  if (prev.length !== curr.length) return false;
  return prev.some((p, i) => {
    const c = curr[i];
    if ((p.meta.status ?? 'pending') !== (c.meta.status ?? 'pending')) return true;
    if ((p.subtasks?.length ?? 0) > 0 || (c.subtasks?.length ?? 0) > 0) {
      return detectSubtaskToggle(p.subtasks ?? [], c.subtasks ?? []);
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
  pinned: boolean;
  subtasks: Task[];
  files: FileRef[];
  tags: string[];
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
    pinned: task.meta.pinned ?? false,
    subtasks: task.subtasks ?? [],
    files: task.files ?? [],
    tags: task.meta.tags ?? [],
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
  onChange,
}: {
  subtask: Task;
  onChange: (updated: Task) => void;
}) {
  const [preview, setPreview] = useState(true);
  const [draftText, setDraftText] = useState(linksToText(subtask.links));

  const handleToggle = () => {
    if (preview) {
      setDraftText(linksToText(subtask.links));
    } else {
      onChange({ ...subtask, links: textToLinks(draftText) });
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
          onBlur={() => onChange({ ...subtask, links: textToLinks(draftText) })}
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
  onChange,
}: {
  subtask: Task;
  onChange: (updated: Task) => void;
}) {
  const { config, activeListName, taskId } = useTaskEditorCtx();
  const downloadFile = useFileDownload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (fileList: File[] | FileList | null) => {
    if (!fileList || !config || !activeListName) return;
    setUploading(true);
    try {
      const existingPaths = new Set((subtask.files ?? []).map((f) => f.path));
      for (const file of Array.from(fileList)) {
        try {
          const ref = await uploadFileToRepo(config, file, activeListName, taskId);
          if (!existingPaths.has(ref.path)) {
            existingPaths.add(ref.path);
            onChange({ ...subtask, files: [...(subtask.files ?? []), ref] });
          }
        } catch (err) {
          console.error(`Upload failed for ${file.name}:`, err);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  // 子任务附件的剪贴板上传：点击「粘贴」后开启一次性粘贴模式，再按 Ctrl+V。
  const { arm: armPaste } = useClipboardPaste(handleUpload, !!config && !!activeListName);

  const handlePasteClipboard = () => {
    if (!config || !activeListName) return;
    armPaste();
    toast.info('已开启粘贴模式，请按 Ctrl+V 粘贴剪贴板中的文件/图片');
  };

  const handleDelete = async (file: FileRef) => {
    onChange({
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
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={uploading || !config || !activeListName}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-40"
        >
          <Upload className="h-3 w-3" />
          {uploading ? '上传中...' : '上传文件'}
        </button>
        <button
          type="button"
          disabled={uploading || !config || !activeListName}
          onClick={handlePasteClipboard}
          title="粘贴剪贴板中的文件/图片（也可先复制文件后按 Ctrl+V）"
          className="flex items-center gap-1.5 rounded-md border border-dashed border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-40"
        >
          <ClipboardPaste className="h-3 w-3" />
          粘贴
        </button>
      </div>
    </div>
  );
}

function SubtaskEditor({
  subtask,
  onChange,
  onDelete,
  onAddChild,
  depth,
  expandedId,
  onExpand,
  dragHandleAttributes,
  dragHandleListeners,
}: {
  subtask: Task;
  onChange: (updated: Task) => void;
  onDelete: (taskId: string) => void;
  onAddChild: (parentId: string) => void;
  depth: number;
  expandedId: string | null;
  onExpand: (taskId: string | null) => void;
  dragHandleAttributes?: DraggableAttributes;
  dragHandleListeners?: ReturnType<typeof useSortable>['listeners'];
}) {
  const expanded = expandedId === subtask.id;
  const completed = subtask.meta.status === 'done';

  const handleChange = (patch: Omit<Partial<Task>, 'meta'> & { meta?: Partial<TaskMeta> }) => {
    const nextMeta = patch.meta ? { ...subtask.meta, ...patch.meta } : subtask.meta;
    const status = patch.meta?.status;
    let completedAt = subtask.completed_at;
    if (status) {
      // 勾选/取消勾选子任务时，同步设置/清除 completed_at
      completedAt = status === 'done' ? nowIso() : undefined;
    }
    onChange({ ...subtask, ...patch, meta: nextMeta, completed_at: completedAt });
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
          checked={completed}
          onChange={(e) => handleChange({ meta: { status: e.target.checked ? 'done' : 'pending' } })}
          data-testid="subtask-checkbox"
          className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)] focus:ring-[var(--color-border-focus)]"
        />
        <input
          type="text"
          value={subtask.title}
          onChange={(e) => handleChange({ title: e.target.value })}
          placeholder="子任务标题"
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] transition-colors duration-100"
        />
        <span
          className="hidden w-24 shrink-0 items-center justify-end gap-1 text-xs text-[var(--color-text-muted)] sm:flex"
          title={completed && subtask.completed_at ? `完成于 ${formatDateTime(subtask.completed_at)}` : undefined}
        >
          {completed && subtask.completed_at && (
            <>
              <Check className="h-3.5 w-3.5" />
              {formatDateTime(subtask.completed_at)}
            </>
          )}
        </span>
        {depth < 2 && (
          <button
            type="button"
            onClick={() => onAddChild(subtask.id)}
            title="添加子任务"
            className="btn-ghost p-1.5"
            aria-label="添加子任务"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onExpand(expanded ? null : subtask.id)}
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
            if (expanded || isDescendantExpanded(expandedId, subtask)) {
              onExpand(null);
            }
            onDelete(subtask.id);
          }}
          title="删除"
          className="btn-ghost p-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)]"
          aria-label="删除子任务"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {completed && subtask.completed_at && (
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
                value={subtask.meta.start ?? ''}
                onChange={(value) => handleChange({ meta: { start: value || undefined } })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">截止时间</span>
              <DateInput
                value={subtask.meta.due ?? ''}
                onChange={(value) => handleChange({ meta: { due: value || undefined } })}
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
          <SubtaskLinksEditor subtask={subtask} onChange={handleChange} />
          <SubtaskFilesEditor subtask={subtask} onChange={handleChange} />
        </div>
      )}

      <div className="mt-2">
        <SubtaskList
          subtasks={subtask.subtasks ?? []}
          onChange={onChange}
          onDelete={onDelete}
          onAddChild={onAddChild}
          depth={depth + 1}
          expandedId={expandedId}
          onExpand={onExpand}
        />
      </div>
    </div>
  );
}

function SortableSubtaskEditor({
  subtask,
  onChange,
  onDelete,
  onAddChild,
  depth,
  expandedId,
  onExpand,
}: {
  subtask: Task;
  onChange: (updated: Task) => void;
  onDelete: (taskId: string) => void;
  onAddChild: (parentId: string) => void;
  depth: number;
  expandedId: string | null;
  onExpand: (taskId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: subtask.id });

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
        onChange={onChange}
        onDelete={onDelete}
        onAddChild={onAddChild}
        depth={depth}
        expandedId={expandedId}
        onExpand={onExpand}
        dragHandleAttributes={attributes}
        dragHandleListeners={listeners}
      />
    </div>
  );
}

function SubtaskList({
  subtasks,
  onChange,
  onDelete,
  onAddChild,
  depth,
  expandedId,
  onExpand,
}: {
  subtasks: Task[];
  onChange: (updated: Task) => void;
  onDelete: (taskId: string) => void;
  onAddChild: (parentId: string) => void;
  depth: number;
  expandedId: string | null;
  onExpand: (taskId: string | null) => void;
}) {
  const ids = useMemo(() => subtasks.map((s) => s.id), [subtasks]);

  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div>
        {subtasks.map((s) => (
          <SortableSubtaskEditor
            key={s.id}
            subtask={s}
            onChange={onChange}
            onDelete={onDelete}
            onAddChild={onAddChild}
            depth={depth}
            expandedId={expandedId}
            onExpand={onExpand}
          />
        ))}
      </div>
    </SortableContext>
  );
}

function findInTree(tree: Task[], id: string): Task | null {
  for (const t of tree) {
    if (t.id === id) return t;
    const found = findInTree(t.subtasks ?? [], id);
    if (found) return found;
  }
  return null;
}

function updateInTree(tree: Task[], id: string, updater: (t: Task) => Task): Task[] {
  return tree.map((t) => {
    if (t.id === id) return updater(t);
    if (t.subtasks && t.subtasks.length > 0) {
      return { ...t, subtasks: updateInTree(t.subtasks, id, updater) };
    }
    return t;
  });
}

function deleteInTree(tree: Task[], id: string): Task[] {
  return tree
    .filter((t) => t.id !== id)
    .map((t) =>
      t.subtasks && t.subtasks.length > 0 ? { ...t, subtasks: deleteInTree(t.subtasks, id) } : t,
    );
}

function moveTaskInTree(tree: Task[], activeId: string, overId: string): Task[] {
  const walk = (nodes: Task[]): { list: Task[]; matched: boolean } => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === activeId || node.id === overId) {
        const hasBoth = nodes.some((n) => n.id === activeId) && nodes.some((n) => n.id === overId);
        if (!hasBoth) return { list: nodes, matched: false };
        const clean = [...nodes];
        const from = clean.findIndex((n) => n.id === activeId);
        const to = clean.findIndex((n) => n.id === overId);
        const [moved] = clean.splice(from, 1);
        clean.splice(to, 0, moved);
        return { list: clean, matched: true };
      }
      if (node.subtasks && node.subtasks.length > 0) {
        const inner = walk(node.subtasks);
        if (inner.matched) {
          return { list: nodes.map((n, idx) => (idx === i ? { ...n, subtasks: inner.list } : n)), matched: true };
        }
      }
    }
    return { list: nodes, matched: false };
  };
  return walk(tree).list;
}

function isDescendantExpanded(expandedId: string | null, subtree: Task): boolean {
  if (!expandedId) return false;
  return findInTree(subtree.subtasks ?? [], expandedId) !== null;
}

function createEmptySubtask(parentId: string | null): Task {
  const created = todayIso();
  return {
    id: generateTaskId(),
    title: '',
    group: '',
    parentId,
    meta: {
      priority: 'med' as const,
      status: 'pending' as const,
      created,
      order: 1,
    },
    completed_at: undefined,
    duration: undefined,
  };
}

function TaskSubtasksEditor({
  subtasks,
  onChange,
}: {
  subtasks: Task[];
  onChange: (subtasks: Task[]) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleChange = (updated: Task) => {
    onChange(updateInTree(subtasks, updated.id, () => updated));
  };

  const handleDelete = (id: string) => {
    const target = findInTree(subtasks, id);
    if (expandedId === id || (target && isDescendantExpanded(expandedId, target))) {
      setExpandedId(null);
    }
    onChange(deleteInTree(subtasks, id));
  };

  const handleAddChild = (parentId: string) => {
    onChange(
      updateInTree(subtasks, parentId, (t) => ({
        ...t,
        subtasks: [...(t.subtasks ?? []), createEmptySubtask(parentId)],
      })),
    );
  };

  const handleAddRoot = () => {
    onChange([...subtasks, createEmptySubtask(null)]);
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
    setExpandedId(null);
    if (!over || active.id === over.id) return;
    onChange(moveTaskInTree(subtasks, active.id as string, over.id as string));
  };

  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setExpandedId(null);
    setActiveId(event.active.id as string);
  };

  const activeSubtask = useMemo(
    () => (activeId ? findInTree(subtasks, activeId) : null),
    [activeId, subtasks],
  );

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
          onChange={handleChange}
          onDelete={handleDelete}
          onAddChild={handleAddChild}
          depth={0}
          expandedId={expandedId}
          onExpand={setExpandedId}
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
              <span className="text-sm text-[var(--color-text)]">{activeSubtask.title}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Section({
  title,
  children,
  className = '',
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function TaskMetaFields({
  draft,
  groups,
  dispatch,
  taskId,
}: {
  draft: DraftTask;
  groups: string[];
  dispatch: (action: DraftAction) => void;
  taskId: string;
}) {
  const handleCopyId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(taskId);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = taskId;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    toast.success('任务ID已复制');
  }, [taskId]);

  return (
    <Section
      title="基本信息"
      action={
        <button
          type="button"
          onClick={handleCopyId}
          title="点击复制任务ID"
          aria-label="复制任务ID"
          className="inline-flex max-w-[220px] items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
        >
          <Copy className="h-3 w-3 shrink-0" />
          <span className="truncate">{taskId}</span>
        </button>
      }
    >
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

/** ISO 时间（2026-07-02T14:30:00+08:00）→ datetime-local 输入值（2026-07-02T14:30）。 */
function isoToLocalInput(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(iso ?? '');
  return m ? m[1] : '';
}

/** datetime-local 输入值 → 与 app 一致的 ISO 时间（固定 +08:00）。 */
function localInputToIso(value: string): string {
  return `${value}:00+08:00`;
}

function TaskStatusFields({
  draft,
  dispatch,
  isSubtask = false,
}: {
  draft: DraftTask;
  dispatch: (action: DraftAction) => void;
  isSubtask?: boolean;
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
          {draft.status === 'done' && (
            <div className="mt-2">
              <span className="mb-1 inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <Check className="h-3.5 w-3.5" />
                完成时间
              </span>
              <input
                type="datetime-local"
                value={isoToLocalInput(draft.completed_at ?? '')}
                onChange={(e) => {
                  if (!e.target.value) return;
                  dispatch({ type: 'set', field: 'completed_at', value: localInputToIso(e.target.value) });
                }}
                className="input w-full"
                aria-label="完成时间"
              />
            </div>
          )}
        </label>

        {!isSubtask && (
          <label className="block md:col-span-2">
            <span className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
              <input
                type="checkbox"
                data-testid="pin-toggle"
                checked={draft.pinned}
                onChange={(e) => dispatch({ type: 'set', field: 'pinned', value: e.target.checked })}
                className="h-4 w-4"
              />
              置顶该任务（排在任务列表最前）
            </span>
          </label>
        )}
      </div>
    </Section>
  );
}

function TaskDateFields({ draft, dispatch }: { draft: DraftTask; dispatch: (action: DraftAction) => void }) {
  const [monthlyInputText, setMonthlyInputText] = useState('');

  const repeatMode = useMemo(() => {
    if (!draft.repeat) return '';
    if (['daily', 'monthly', 'yearly', 'weekdays'].includes(draft.repeat)) return draft.repeat;
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
    } else if (mode === 'yearly') {
      dispatch({ type: 'set', field: 'repeat', value: 'yearly' });
      dispatch({ type: 'set', field: 'due', value: todayIso() });
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
              <option value="yearly">每年</option>
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

function TaskTagsEditor({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState('');

  // 回车或逗号提交：按逗号拆分、trim、跳过空、精确去重
  const commitInput = (raw: string) => {
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...tags];
    for (const p of parts) {
      if (!next.includes(p)) next.push(p);
    }
    onChange(next);
    setInput('');
  };

  const remainingSuggestions = suggestions.filter((s) => !tags.includes(s)).slice(0, 8);

  return (
    <div className="space-y-3">
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => (
            <TagPill
              key={tag}
              label={tag}
              onRemove={() => onChange(tags.filter((t) => t !== tag))}
            />
          ))}
        </div>
      )}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commitInput(input);
          }
        }}
        placeholder="输入标签后回车，或用逗号分隔多个标签"
        className="input w-full"
        aria-label="添加标签"
      />
      {remainingSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">已有标签：</span>
          {remainingSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...tags, s])}
              className="badge cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskEditor({
  task,
  groups,
  onSave,
  onClose,
  isFullscreen = false,
  onToggleFullscreen,
}: {
  task: Task;
  groups: string[];
  onSave: (updated: Task) => void;
  onClose: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}) {
  const [draft, dispatch] = useReducer(draftReducer, task, buildDraft);
  const [uploading, setUploading] = useState(false);
  const downloadFile = useFileDownload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const config = useSyncStore((s) => s.config);
  const activeListName = useListsStore((s) => s.activeListName);

  // 已有标签建议：从任务所属清单的全部任务（含子任务）收集，去重排序
  const suggestions = useMemo(() => {
    const listName = task.sourceList ?? activeListName;
    const list = listName ? useListsStore.getState().fileCache[listName] : null;
    if (!list) return [];
    const set = new Set<string>();
    for (const t of list.groups.flatMap((g) => g.tasks)) {
      for (const tag of t.meta.tags ?? []) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [task.sourceList, activeListName]);

  const makeTask = useCallback((): Task => {
    const completed = draft.status === 'done';
    // 未手动修改状态时不下发显式状态，让 store 按子任务树推断；
    // 仅当用户显式切换（draft.status ≠ 初始推断值）时才下发，覆盖推断。
    const statusExplicit =
      task.meta.status !== undefined && draft.status !== task.meta.status ? draft.status : undefined;
    return {
      ...task,
      title: draft.title.trim() || task.title,
      group: draft.group,
      completed_at: completed ? (draft.completed_at ?? nowIso()) : undefined,
      meta: {
        ...task.meta,
        priority: draft.priority,
        status: statusExplicit,
        start: draft.start || undefined,
        due: draft.due || undefined,
        repeat: draft.repeat || undefined,
        repeat_until: draft.repeat_until || undefined,
        tags: draft.tags.length > 0 ? draft.tags : undefined,
        pinned: draft.pinned ? true : undefined,
      },
      note: draft.note || undefined,
      links: textToLinks(draft.linksText),
      files: draft.files.length > 0 ? draft.files : undefined,
      // 子任务树随任务保存；扁平化写回由 store 侧 replaceSubtree 完成，
      // 子任务统一继承任务当前分组，避免新子任务遗留空 group
      subtasks: draft.subtasks.length > 0
        ? draft.subtasks.map((t) => ({ ...t, group: draft.group }))
        : undefined,
    };
  }, [draft, task]);

  const saveTask = useCallback(() => {
    onSave(makeTask());
  }, [makeTask, onSave]);

  const handleUploadFiles = useCallback(
    async (fileList: File[] | FileList | null) => {
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

  // 剪贴板上传改为按钮控制：默认不监听粘贴，点击「粘贴」后开启一次性粘贴模式，
  // 再按 Ctrl+V 才会上传（系统复制的文件无法用 navigator.clipboard.read() 直接读取）。
  const { arm: armPaste } = useClipboardPaste(handleUploadFiles, !!config && !!activeListName);

  const handlePasteClipboard = useCallback(() => {
    if (!config || !activeListName) return;
    armPaste();
    toast.info('已开启粘贴模式，请按 Ctrl+V 粘贴剪贴板中的文件/图片');
  }, [config, activeListName, armPaste]);

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

  const prevSubtasksRef = useRef<Task[]>(draft.subtasks);

  useEffect(() => {
    if (detectSubtaskToggle(prevSubtasksRef.current, draft.subtasks)) {
      // 子任务勾选变化时，主任务状态跟随子树推断（全部完成→已完成、部分完成→进行中），
      // 保证「子任务全部完成，主任务自动完成」在详情弹窗内即时体现
      const inferred = inferParentStatus(draft.subtasks);
      if (inferred) {
        dispatch({ type: 'set', field: 'status', value: inferred });
        if (inferred === 'done' && !draft.completed_at) {
          dispatch({ type: 'set', field: 'completed_at', value: nowIso() });
        }
      }
      saveTask();
    }
    prevSubtasksRef.current = draft.subtasks;
  }, [draft.subtasks, draft.completed_at, saveTask]);

  return (
    <TaskEditorCtx.Provider value={{ config, activeListName, taskId: task.id }}>
    <div
      className="flex h-full flex-col bg-[var(--color-surface-raised)]"
      data-testid="task-editor"
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
        <h2 className="text-base font-semibold text-[var(--color-text)]">任务详情</h2>
        <div className="flex items-center gap-1">
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="btn-ghost p-1.5"
              aria-label={isFullscreen ? '退出全屏' : '全屏'}
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto space-y-4">
          <TaskMetaFields draft={draft} groups={groups} dispatch={dispatch} taskId={task.id} />
          <Section title="标签">
            <TaskTagsEditor
              tags={draft.tags}
              suggestions={suggestions}
              onChange={(tags) => dispatch({ type: 'set', field: 'tags', value: tags })}
            />
          </Section>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TaskStatusFields draft={draft} dispatch={dispatch} isSubtask={task.parentId !== null} />
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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={uploading || !config || !activeListName}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] py-2.5 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-40"
              >
                <Upload className="h-4 w-4" />
                {uploading ? '上传中...' : '上传文件'}
              </button>
              <button
                type="button"
                disabled={uploading || !config || !activeListName}
                onClick={handlePasteClipboard}
                title="点击开启粘贴模式，再按 Ctrl+V 粘贴文件/图片"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-40"
              >
                <ClipboardPaste className="h-4 w-4" />
                粘贴
              </button>
            </div>
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
