import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CalendarDays,
  ChevronRight,
  Flag,
  Folder,
  Layers,
  ListTodo,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useListsStore } from '@/stores/listsStore';
import { useTasksStore } from '@/stores/tasksStore';
import { useSyncStore } from '@/stores/syncStore';
import { confirm } from '@/stores/confirmStore';
import { toast } from '@/utils/toast';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { getPendingWrites } from '@/utils/storage';
import type { ListMeta, ParsedList } from '@/types';

function SyncIndicator({ pendingCount }: { pendingCount: number }) {
  const { status, lastSyncAt } = useSyncStore();
  const statusMap: Record<typeof status, { label: string; color: string }> = {
    synced: { label: '已同步', color: 'bg-[var(--color-success)]' },
    unsaved: { label: '未同步', color: 'bg-[var(--color-warning)]' },
    unconfigured: { label: '未配置', color: 'bg-[var(--color-text-muted)]' },
  };
  const { label, color } = statusMap[status];

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span>{label}</span>
      {pendingCount > 0 && (
        <span className="rounded-full bg-[var(--color-warning)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-inverse)]">
          {pendingCount}
        </span>
      )}
      {lastSyncAt && status === 'synced' && (
        <span className="ml-auto">{new Date(lastSyncAt).toLocaleTimeString()}</span>
      )}
    </div>
  );
}

function PendingQueue({ expanded }: { expanded: boolean }) {
  const { pushPending } = useSyncStore();
  const [retrying, setRetrying] = useState(false);

  if (!expanded) return null;

  const pending = getPendingWrites();
  const keys = Object.keys(pending);
  if (keys.length === 0) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await pushPending();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">待同步文件</span>
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} />
          全部重试
        </button>
      </div>
      <div className="space-y-1">
        {keys.map((fileName) => (
          <div
            key={fileName}
            className="flex items-center justify-between rounded px-2 py-1.5 text-xs"
          >
            <span className="truncate text-[var(--color-text-secondary)]">{fileName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupRow({
  name,
  done,
  total,
  active,
  editing,
  editValue,
  onClick,
  onDelete,
  onStartEdit,
  onEditValueChange,
  onSaveEdit,
  onCancelEdit,
}: {
  name: string;
  done: number;
  total: number;
  active: boolean;
  editing: boolean;
  editValue: string;
  onClick: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onEditValueChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-1 rounded-md px-3 py-1.5">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
        <input
          autoFocus
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit();
            if (e.key === 'Escape') onCancelEdit();
          }}
          onBlur={onSaveEdit}
          placeholder="分组名称"
          className="input flex-1 py-0.5 text-sm"
        />
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={[
        'group flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition-colors duration-100',
        active
          ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
        <span className="truncate">{name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className={`text-xs tabular-nums ${active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}>
          {done}/{total}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStartEdit();
          }}
          aria-label="重命名分组"
          className={[
            'rounded-md p-1.5 md:opacity-0 transition-opacity duration-100 md:group-hover:opacity-100 focus:opacity-100',
            active
              ? 'text-[var(--color-primary)]/70 hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]',
          ].join(' ')}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="删除分组"
          className={[
            'rounded-md p-1.5 md:opacity-0 transition-opacity duration-100 md:group-hover:opacity-100 focus:opacity-100',
            active
              ? 'text-[var(--color-primary)]/70 hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-danger)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-danger)]',
          ].join(' ')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ListRow({
  list,
  active,
  editing,
  editValue,
  collapsed,
  onClick,
  onDelete,
  onStartEdit,
  onEditValueChange,
  onSaveEdit,
  onCancelEdit,
  onToggleCollapse,
}: {
  list: ListMeta;
  active: boolean;
  editing: boolean;
  editValue: string;
  collapsed?: boolean;
  onClick: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onEditValueChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleCollapse: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-md px-3 py-2">
        <Folder className={`h-[18px] w-[18px] shrink-0 text-[var(--color-text-muted)]`} />
        <input
          autoFocus
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit();
            if (e.key === 'Escape') onCancelEdit();
          }}
          onBlur={onSaveEdit}
          placeholder="清单名称"
          className="input flex-1 py-0.5 text-sm"
        />
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={[
        'group flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors duration-100',
        active
          ? 'bg-[var(--color-primary)] text-[var(--color-text-inverse)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className="flex shrink-0 items-center justify-center rounded p-0.5 text-current opacity-60 hover:opacity-100"
          aria-label={collapsed ? '展开清单' : '折叠清单'}
        >
          <ChevronRight
            className={[
              'h-4 w-4 transition-transform duration-150',
              collapsed ? '' : 'rotate-90',
            ].join(' ')}
          />
        </button>
        <Folder className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-[var(--color-text-inverse)]/80' : 'text-[var(--color-text-muted)]'}`} />
        <span className="truncate">{list.name}</span>
      </div>
      <div className="flex shrink-0 items-center md:opacity-0 transition-opacity duration-100 md:group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStartEdit();
          }}
          aria-label="重命名清单"
          className={[
            'rounded-md p-1',
            active
              ? 'text-[var(--color-text-inverse)]/70 hover:bg-[var(--color-text-inverse)]/10'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]',
          ].join(' ')}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="删除清单"
          className={[
            'rounded-md p-1',
            active
              ? 'text-[var(--color-text-inverse)]/70 hover:bg-[var(--color-text-inverse)]/10 hover:text-[var(--color-text-inverse)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-danger)]',
          ].join(' ')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function TodoViewsSection({
  items,
  activeKey,
  counts,
  onSelect,
}: {
  items: readonly { key: string; icon: typeof Calendar; label: string }[];
  activeKey: string | null;
  counts: Record<string, number>;
  onSelect: (key: string) => void;
}) {
  return (
    <>
      <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        待办视图
      </div>
      <div className="mb-4 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeKey === item.key;
          const count = counts[item.key] ?? 0;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={[
                'group flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors duration-100',
                isActive
                  ? 'bg-[var(--color-primary)] text-[var(--color-text-inverse)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]',
              ].join(' ')}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-[18px] w-[18px]" />
                <span>{item.label}</span>
              </div>
              {count > 0 && (
                <span
                  className={[
                    'rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                    isActive
                      ? 'bg-[var(--color-text-inverse)]/20 text-[var(--color-text-inverse)]'
                      : 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]',
                  ].join(' ')}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function NewGroupInput({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-1 px-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => onSubmit()}
        placeholder="分组名称"
        className="input flex-1 py-1 text-xs"
      />
    </div>
  );
}

function NewListInput({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 flex gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => onSubmit()}
        placeholder="清单名称"
        className="input flex-1"
      />
    </div>
  );
}

function ListGroups({
  listData,
  activeGroup,
  showInputForList,
  newGroupName,
  editingGroupName,
  editingGroupNewName,
  onSelectGroup,
  onDeleteGroup,
  onShowNewGroup,
  onNewGroupNameChange,
  onCreateGroup,
  onCancelNewGroup,
  onStartEditGroup,
  onEditGroupNameChange,
  onSaveEditGroup,
  onCancelEditGroup,
}: {
  listData: ParsedList;
  activeGroup: string | null;
  showInputForList: string | null;
  newGroupName: string;
  editingGroupName: string | null;
  editingGroupNewName: string;
  onSelectGroup: (name: string | null, listName?: string) => void;
  onDeleteGroup: (name: string) => Promise<void>;
  onShowNewGroup: () => void;
  onNewGroupNameChange: (value: string) => void;
  onCreateGroup: () => void;
  onCancelNewGroup: () => void;
  onStartEditGroup: (name: string) => void;
  onEditGroupNameChange: (value: string) => void;
  onSaveEditGroup: () => void;
  onCancelEditGroup: () => void;
}) {
  return (
    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-[var(--color-border)] pl-2">
      {listData.groups.map((g) => {
        const done = g.tasks.filter((t) => t.meta.status === 'done').length;
        return (
          <GroupRow
            key={g.name}
            name={g.name}
            done={done}
            total={g.tasks.length}
            active={activeGroup === g.name}
            editing={editingGroupName === g.name}
            editValue={editingGroupName === g.name ? editingGroupNewName : g.name}
            onClick={() => onSelectGroup(activeGroup === g.name ? null : g.name, listData.meta.name)}
            onDelete={() => void onDeleteGroup(g.name)}
            onStartEdit={() => onStartEditGroup(g.name)}
            onEditValueChange={onEditGroupNameChange}
            onSaveEdit={onSaveEditGroup}
            onCancelEdit={onCancelEditGroup}
          />
        );
      })}
      {showInputForList ? (
        <NewGroupInput
          value={newGroupName}
          onChange={onNewGroupNameChange}
          onSubmit={onCreateGroup}
          onCancel={onCancelNewGroup}
        />
      ) : (
        <button
          type="button"
          onClick={onShowNewGroup}
          className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors duration-100"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>新建分组</span>
        </button>
      )}
    </div>
  );
}

function ListsSection({
  lists,
  activeListName,
  fileCache,
  activeGroup,
  showNewGroupForList,
  newGroupName,
  editingListName,
  editingListNewName,
  editingGroupName,
  editingGroupNewName,
  expandedListNames,
  onSelectList,
  onDeleteList,
  onSelectGroup,
  onDeleteGroup,
  onShowNewGroup,
  onNewGroupNameChange,
  onCreateGroup,
  onCancelNewGroup,
  onStartEditList,
  onEditListNameChange,
  onSaveEditList,
  onCancelEditList,
  onStartEditGroup,
  onEditGroupNameChange,
  onSaveEditGroup,
  onCancelEditGroup,
  onToggleListCollapse,
}: {
  lists: ListMeta[];
  activeListName: string | null;
  fileCache: Record<string, ParsedList>;
  activeGroup: string | null;
  showNewGroupForList: string | null;
  newGroupName: string;
  editingListName: string | null;
  editingListNewName: string;
  editingGroupName: string | null;
  editingGroupNewName: string;
  expandedListNames: Set<string>;
  onSelectList: (name: string) => void;
  onDeleteList: (name: string) => Promise<void>;
  onSelectGroup: (name: string | null, listName?: string) => void;
  onDeleteGroup: (name: string) => Promise<void>;
  onShowNewGroup: (listName: string) => void;
  onNewGroupNameChange: (value: string) => void;
  onCreateGroup: (listName: string) => void;
  onCancelNewGroup: () => void;
  onStartEditList: (name: string) => void;
  onEditListNameChange: (value: string) => void;
  onSaveEditList: () => void;
  onCancelEditList: () => void;
  onStartEditGroup: (name: string) => void;
  onEditGroupNameChange: (value: string) => void;
  onSaveEditGroup: () => void;
  onCancelEditGroup: () => void;
  onToggleListCollapse: (name: string) => void;
}) {
  return (
    <>
      <div className="mb-2 mt-6 px-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        我的清单
      </div>
      <div className="space-y-1">
        {lists.map((list) => {
          const isActive = activeListName === list.name;
          const listData = fileCache[list.name];
          const isExpanded = expandedListNames.has(list.name);
          return (
            <div key={list.name} className="space-y-0.5">
              <ListRow
                list={list}
                active={isActive}
                editing={editingListName === list.name}
                editValue={editingListName === list.name ? editingListNewName : list.name}
                collapsed={!isExpanded}
                onClick={() => {
                  onSelectList(list.name);
                  onSelectGroup(null);
                  if (!isExpanded) onToggleListCollapse(list.name);
                }}
                onDelete={() => void onDeleteList(list.name)}
                onStartEdit={() => onStartEditList(list.name)}
                onEditValueChange={onEditListNameChange}
                onSaveEdit={onSaveEditList}
                onCancelEdit={onCancelEditList}
                onToggleCollapse={() => onToggleListCollapse(list.name)}
              />
              {isExpanded && listData && (
                <ListGroups
                  listData={listData}
                  activeGroup={activeGroup}
                  showInputForList={showNewGroupForList}
                  newGroupName={newGroupName}
                  editingGroupName={editingGroupName}
                  editingGroupNewName={editingGroupNewName}
                  onSelectGroup={onSelectGroup}
                  onDeleteGroup={onDeleteGroup}
                  onShowNewGroup={() => onShowNewGroup(list.name)}
                  onNewGroupNameChange={onNewGroupNameChange}
                  onCreateGroup={() => onCreateGroup(list.name)}
                  onCancelNewGroup={onCancelNewGroup}
                  onStartEditGroup={onStartEditGroup}
                  onEditGroupNameChange={onEditGroupNameChange}
                  onSaveEditGroup={onSaveEditGroup}
                  onCancelEditGroup={onCancelEditGroup}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function Sidebar({ onClose }: { onClose?: () => void } = {}) {
  const { lists, activeListName, activeGroup, selectList, selectGroup, createGroup, renameGroup, createList, renameList, deleteList, deleteGroup, fileCache } =
    useListsStore();
  const { todoView, setTodoView, getTodoViewCounts } = useTasksStore();
  const { pushPending, config, pendingWrites } = useSyncStore();
  const navigate = useNavigate();
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroupForList, setShowNewGroupForList] = useState<string | null>(null);
  const [queueExpanded, setQueueExpanded] = useState(false);

  // 清单展开/收缩
  const [expandedListNames, setExpandedListNames] = useState<Set<string>>(new Set());

  // 清单重命名
  const [editingListName, setEditingListName] = useState<string | null>(null);
  const [editingListNewName, setEditingListNewName] = useState('');

  // 分组重命名
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null);
  const [editingGroupNewName, setEditingGroupNewName] = useState('');

  const todoViews = [
    { key: 'today', icon: Calendar, label: '今天' },
    { key: 'week', icon: CalendarDays, label: '本周截止' },
    { key: 'start-week', icon: CalendarDays, label: '本周开始' },
    { key: 'all', icon: Layers, label: '全部' },
    { key: 'high', icon: Flag, label: '高优先级' },
  ] as const;

  const todoViewCounts = getTodoViewCounts();

  const handleTodoViewClick = (key: string) => {
    setTodoView(key as typeof todoViews[number]['key']);
    onClose?.();
  };

  const handleSelectList = (name: string) => {
    setTodoView(null);
    selectList(name);
    onClose?.();
  };

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name) {
      setNewListName('');
      setShowNewList(false);
      return;
    }
    if (!config) {
      toast.info('请先配置 GitHub Token 和仓库信息');
      navigate('/settings');
      return;
    }
    try {
      await createList(name);
      setExpandedListNames((prev) => new Set([...prev, name]));
      setNewListName('');
      setShowNewList(false);
    } catch (err) {
      toast.error('创建清单失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCreateGroup = async (listName: string) => {
    const name = newGroupName.trim();
    if (!name) {
      setNewGroupName('');
      setShowNewGroupForList(null);
      return;
    }
    try {
      if (activeListName !== listName) {
        selectList(listName);
      }
      setExpandedListNames((prev) => new Set([...prev, listName]));
      await createGroup(name);
      setNewGroupName('');
      setShowNewGroupForList(null);
    } catch (err) {
      toast.error('创建分组失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDeleteList = async (name: string) => {
    if (await confirm(`确定删除清单「${name}」？`)) {
      await deleteList(name);
    }
  };

  const handleDeleteGroup = async (name: string) => {
    if (await confirm(`确定删除分组「${name}」及其所有任务？`)) {
      await deleteGroup(name);
      if (activeListName) {
        useTasksStore.getState().refreshTasks(activeListName);
      }
    }
  };

  // 清单展开/收缩，互斥——展开一个自动收起上一个
  const handleToggleListCollapse = (name: string) => {
    setExpandedListNames((prev) => {
      if (prev.has(name)) {
        // 点击已展开的清单 => 收起
        const next = new Set(prev);
        next.delete(name);
        return next;
      }
      // 展开新的 => 替换为仅此一个
      return new Set([name]);
    });
  };

  // 清单重命名
  const handleStartEditList = (name: string) => {
    setEditingListName(name);
    setEditingListNewName(name);
  };

  const handleSaveEditList = async () => {
    if (!editingListName) return;
    const newName = editingListNewName.trim();
    if (!newName) {
      setEditingListName(null);
      return;
    }
    try {
      await renameList(editingListName, newName);
      // 同步更新展开状态
      setExpandedListNames((prev) => {
        const next = new Set(prev);
        next.delete(editingListName);
        next.add(newName);
        return next;
      });
      setEditingListName(null);
    } catch (err) {
      toast.error('重命名失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCancelEditList = () => {
    setEditingListName(null);
  };

  const handleEditListNameChange = (value: string) => {
    setEditingListNewName(value);
  };

  // 分组重命名
  const handleStartEditGroup = (name: string) => {
    setEditingGroupName(name);
    setEditingGroupNewName(name);
  };

  const handleSaveEditGroup = async () => {
    if (!editingGroupName) return;
    const newName = editingGroupNewName.trim();
    if (!newName) {
      setEditingGroupName(null);
      return;
    }
    try {
      await renameGroup(editingGroupName, newName);
      setEditingGroupName(null);
    } catch (err) {
      toast.error('重命名失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCancelEditGroup = () => {
    setEditingGroupName(null);
  };

  const handleEditGroupNameChange = (value: string) => {
    setEditingGroupNewName(value);
  };

  return (
    <aside
      className={[
        'flex h-full w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-raised)]',
        onClose ? 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-primary)] text-[var(--color-text-inverse)]">
            <ListTodo className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Dong Todo</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5 md:hidden"
            aria-label="关闭导航"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <TodoViewsSection
          items={todoViews}
          activeKey={todoView}
          counts={todoViewCounts}
          onSelect={handleTodoViewClick}
        />

        <ListsSection
          lists={lists}
          activeListName={activeListName}
          fileCache={fileCache}
          activeGroup={activeGroup}
          showNewGroupForList={showNewGroupForList}
          newGroupName={newGroupName}
          editingListName={editingListName}
          editingListNewName={editingListNewName}
          editingGroupName={editingGroupName}
          editingGroupNewName={editingGroupNewName}
          expandedListNames={expandedListNames}
          onSelectList={handleSelectList}
          onDeleteList={handleDeleteList}
          onSelectGroup={(name, listName) => {
            if (name && listName) {
              setTodoView(null);
              if (activeListName !== listName) {
                selectList(listName);
              }
              selectGroup(name);
            } else {
              selectGroup(null);
            }
            onClose?.();
          }}
          onDeleteGroup={handleDeleteGroup}
          onShowNewGroup={setShowNewGroupForList}
          onNewGroupNameChange={setNewGroupName}
          onCreateGroup={handleCreateGroup}
          onCancelNewGroup={() => {
            setNewGroupName('');
            setShowNewGroupForList(null);
          }}
          onStartEditList={handleStartEditList}
          onEditListNameChange={handleEditListNameChange}
          onSaveEditList={handleSaveEditList}
          onCancelEditList={handleCancelEditList}
          onStartEditGroup={handleStartEditGroup}
          onEditGroupNameChange={handleEditGroupNameChange}
          onSaveEditGroup={handleSaveEditGroup}
          onCancelEditGroup={handleCancelEditGroup}
          onToggleListCollapse={handleToggleListCollapse}
        />

        {showNewList ? (
          <NewListInput
            value={newListName}
            onChange={setNewListName}
            onSubmit={handleCreateList}
            onCancel={() => setShowNewList(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowNewList(true)}
            className="mt-3 flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors duration-100"
          >
            <Plus className="h-[18px] w-[18px]" />
            <span>新建清单</span>
          </button>
        )}
      </div>

      <div className="border-t border-[var(--color-border)] p-3">
        <button
          type="button"
          onClick={() => setQueueExpanded((v) => !v)}
          className="w-full"
          aria-expanded={queueExpanded}
        >
          <SyncIndicator pendingCount={pendingWrites} />
        </button>
        <PendingQueue expanded={queueExpanded} />
        <div className="mb-3 mt-3 flex items-center justify-between">
          <ThemeToggle className="w-full" />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="btn-secondary flex-1 py-1.5 text-xs"
          >
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            设置
          </button>
          <button
            type="button"
            onClick={() => pushPending()}
            className="btn-secondary flex-1 py-1.5 text-xs"

          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            立即同步
          </button>
        </div>
      </div>
    </aside>
  );
}
