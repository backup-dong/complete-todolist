// ========== 数据模型 ==========

export interface TaskMeta {
  status?: 'pending' | 'active' | 'done';
  priority: 'high' | 'med' | 'low';
  created: string; // ISO 8601
  start?: string;
  due?: string;
  repeat?: 'daily' | 'weekly' | 'monthly' | 'weekdays' | string;
  repeat_until?: string;
  repeat_count?: number;
  order?: number;
  tags?: string[];
}

export interface Link {
  title: string;
  url: string;
}

export interface Subtask {
  text: string;
  level: number; // 1 | 2 | 3
  completed: boolean;
  completed_at?: string; // ISO 8601
  start?: string; // ISO 日期，v1.1 新增
  due?: string; // ISO 日期，v1.1 新增
  note?: string;
  links?: Link[];
  children: Subtask[];
}

export interface Task {
  id: string; // 基于标题+创建时间的 hash
  title: string;
  meta: TaskMeta;
  subtasks: Subtask[];
  note?: string; // Markdown 文本
  links?: Link[];
  completed_at?: string; // 🏁 时间
  duration?: string; // ⏱ 耗时文字
  group: string; // 所属分组名
}

export interface ListMeta {
  name: string;
  created: string;
  archived: boolean;
}

export interface ParsedList {
  meta: ListMeta;
  groups: Group[];
  rawContent: string;
  sha?: string;
}

export interface Group {
  name: string;
  tasks: Task[];
}

// ========== 组件 Props ==========

export interface SidebarProps {
  lists: ListMeta[];
  groups: string[];
  activeList: string;
  activeGroup: string | null;
  onSelectList: (name: string) => void;
  onSelectGroup: (name: string | null) => void;
  onNewList: () => void;
}

export interface SmartListItemProps {
  icon: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

export interface ListRowProps {
  name: string;
  progress: { done: number; total: number };
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}

export interface TaskCardProps {
  task: Task;
  onToggle: (subtaskPath: number[]) => void;
  onStartEdit: () => void;
  onDelete: () => void;
}

export interface SubtaskItemProps {
  subtask: Subtask;
  path: number[];
  onToggle: (path: number[]) => void;
  depth: number;
}

export interface DetailPanelProps {
  task: Task | null;
  onSave: (updated: Task) => void;
  onClose: () => void;
  groups: string[];
}

export type SortMode = 'drag' | 'due' | 'priority';

export interface TaskListProps {
  tasks: Task[];
  sortMode: SortMode;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggle: (taskId: string, path: number[]) => void;
  onSelect: (taskId: string) => void;
}

export interface SearchBarProps {
  value: string;
  onChange: (q: string) => void;
  placeholder?: string;
}

export interface FilterState {
  status: 'all' | 'pending' | 'active' | 'done';
  priority: 'all' | 'high' | 'med' | 'low';
  timeRange: 'all' | 'today' | 'week' | 'overdue';
}

export interface FilterDropdownProps {
  filter: FilterState;
  onChange: (filter: FilterState) => void;
}

// ========== Store 状态 ==========

export interface SyncStatusState {
  status: 'synced' | 'syncing' | 'unsaved' | 'offline' | 'unconfigured';
  lastSyncAt: string | null;
  pendingWrites: number;
}

export interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  basePath: string;
}
