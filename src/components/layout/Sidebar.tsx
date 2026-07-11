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
import { getPendingWriteDetails } from '@/utils/storage';
import type { ListMeta, ParsedList } from '@/types';

function SyncIndicator({ pendingCount }: { pendingCount: number }) {
  const { status, lastSyncAt } = useSyncStore();
  const statusMap: Record<typeof status, { label: string; color: string; icon?: React.ReactNode }> = {
    synced: { label: '已同步', color: 'bg-[var(--color-success)]' },
    syncing: { label: '同步中', color: 'bg-[var(--color-warning)]', icon: <RefreshCw className="h-3 w-3 animate-spin" /> },
    unsaved: { label: '待同步', color: 'bg-[var(--color-warning)]' },
    offline: { label: '离线', color: 'bg-[var(--color-danger)]' },
    unconfigured: { label: '未配置', color: 'bg-[var(--color-text-muted)]' },
  };
  const { label, color, icon } = statusMap[status];

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
      <span className={`h-2 w-2 rounded-full ${color} ${status === 'syncing' ? 'animate-pulse' : ''}`} />
      <span>{label}</span>
      {pendingCount > 0 && (
        <span className="rounded-full bg-[var(--color-warning)] px-1.5 py-0.5 text-[10px] font-medium text-white">
          {pendingCount}
        </span>
      )}
      {icon && <span className="text-[var(--color-text-muted)]">{icon}</span>}
      {lastSyncAt && status === 'synced' && (
        <span className="ml-auto">{new Date(lastSyncAt).toLocaleTimeString()}</span>
      )}
    </div>
  );
}

function PendingQueue({ expanded }: { expanded: boolean }) {
  const { status, pushPending } = useSyncStore();
  const [retrying, setRetrying] = useState(false);

  if (!expanded) return null;

  const details = getPendingWriteDetails();
  if (details.length === 0) return null;

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

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
          disabled={retrying || status === 'offline'}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-subtle)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} />
          全部重试
        </button>
      </div>
      <div className="space-y-1">
        {details.map((item) => (
          <div
            key={item.fileName}
            className="flex items-center justify-between rounded px-2 py-1.5 text-xs"
          >
            <span className="truncate text-[var(--color-text-secondary)]">{item.fileName}</span>
            <span className="shrink-0 text-[var(--color-text-muted)]">{formatTime(item.timestamp)}</span>
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
  onClick,
  onDelete,
}: {
  name: string;
  done: number;
  total: number;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
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
      <div className="flex shrink-0 items-center gap-2">
        <span className={`text-xs tabular-nums ${active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}>
          {done}/{total}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="删除分组"
          className={[
            'rounded-md p-1.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus:opacity-100',
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
  onClick,
  onDelete,
}: {
  list: ListMeta;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
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
          ? 'bg-[var(--color-primary)] text-white'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Folder className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-white/80' : 'text-[var(--color-text-muted)]'}`} />
        <span className="truncate">{list.name}</span>
      </div>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="删除清单"
          className={[
            'rounded-md p-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus:opacity-100',
            active
              ? 'text-white/70 hover:bg-white/10 hover:text-white'
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
                  ? 'bg-[var(--color-primary)] text-white'
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
                      ? 'bg-white/20 text-white'
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
  onSelectGroup,
  onDeleteGroup,
  onShowNewGroup,
  onNewGroupNameChange,
  onCreateGroup,
  onCancelNewGroup,
}: {
  listData: ParsedList;
  activeGroup: string | null;
  showInputForList: string | null;
  newGroupName: string;
  onSelectGroup: (name: string | null) => void;
  onDeleteGroup: (name: string) => Promise<void>;
  onShowNewGroup: () => void;
  onNewGroupNameChange: (value: string) => void;
  onCreateGroup: () => void;
  onCancelNewGroup: () => void;
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
            onClick={() => onSelectGroup(activeGroup === g.name ? null : g.name)}
            onDelete={() => void onDeleteGroup(g.name)}
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
  onSelectList,
  onDeleteList,
  onSelectGroup,
  onDeleteGroup,
  onShowNewGroup,
  onNewGroupNameChange,
  onCreateGroup,
  onCancelNewGroup,
}: {
  lists: ListMeta[];
  activeListName: string | null;
  fileCache: Record<string, ParsedList>;
  activeGroup: string | null;
  showNewGroupForList: string | null;
  newGroupName: string;
  onSelectList: (name: string) => void;
  onDeleteList: (name: string) => Promise<void>;
  onSelectGroup: (name: string | null) => void;
  onDeleteGroup: (name: string) => Promise<void>;
  onShowNewGroup: (listName: string) => void;
  onNewGroupNameChange: (value: string) => void;
  onCreateGroup: (listName: string) => void;
  onCancelNewGroup: () => void;
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
          return (
            <div key={list.name} className="space-y-0.5">
              <ListRow
                list={list}
                active={isActive}
                onClick={() => {
                  onSelectList(list.name);
                  onSelectGroup(null);
                }}
                onDelete={() => void onDeleteList(list.name)}
              />
              {isActive && listData && (
                <ListGroups
                  listData={listData}
                  activeGroup={activeGroup}
                  showInputForList={showNewGroupForList}
                  newGroupName={newGroupName}
                  onSelectGroup={onSelectGroup}
                  onDeleteGroup={onDeleteGroup}
                  onShowNewGroup={() => onShowNewGroup(list.name)}
                  onNewGroupNameChange={onNewGroupNameChange}
                  onCreateGroup={() => onCreateGroup(list.name)}
                  onCancelNewGroup={onCancelNewGroup}
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
  const { lists, activeListName, activeGroup, selectList, selectGroup, createGroup, createList, deleteList, deleteGroup, fileCache } =
    useListsStore();
  const { todoView, setTodoView, getTodoViewCounts } = useTasksStore();
  const { pushPending, config, pendingWrites } = useSyncStore();
  const navigate = useNavigate();
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroupForList, setShowNewGroupForList] = useState<string | null>(null);
  const [queueExpanded, setQueueExpanded] = useState(false);

  const todoViews = [
    { key: 'today', icon: Calendar, label: '今天' },
    { key: 'week', icon: CalendarDays, label: '本周' },
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

  return (
    <aside
      className={[
        'flex h-full w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-raised)]',
        onClose ? 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-primary)] text-white">
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
          onSelectList={handleSelectList}
          onDeleteList={handleDeleteList}
          onSelectGroup={(name) => {
            selectGroup(name);
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
