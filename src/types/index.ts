// ========== 数据模型 ==========

export type TaskStatus = 'pending' | 'active' | 'done';

export interface TaskMeta {
  status?: TaskStatus;
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

export type SortMode = 'drag' | 'due' | 'priority';

export interface FilterState {
  status: TaskStatus[]; // 空数组表示全部
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
