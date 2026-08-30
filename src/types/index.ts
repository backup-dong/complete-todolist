// ========== 数据模型 ==========

export type TaskStatus = 'pending' | 'active' | 'done';

export interface TaskMeta {
  status?: TaskStatus;
  priority: 'high' | 'med' | 'low';
  created: string; // ISO 8601
  start?: string;
  due?: string;
  repeat?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | string;
  repeat_until?: string;
  repeat_count?: number;
  order?: number;
  tags?: string[];
}

export interface Link {
  title: string;
  url: string;
}

export interface FileRef {
  name: string;
  path: string;
  sha: string;
  size: number;
  mime: string;
  uploadedAt: string;
}

export interface Reminder {
  at: string; // ISO 8601
}

export interface Task {
  id: string; // 基于标题+创建时间的 hash
  title: string;
  parentId: string | null;
  group: string; // 所属分组名
  meta: TaskMeta;
  note?: string; // Markdown 文本
  reflection?: string; // 感想，与 note 平级
  reminders?: Reminder[];
  links?: Link[];
  files?: FileRef[];
  completed_at?: string; // 🏁 时间
  duration?: string; // ⏱ 耗时文字
  sourceList?: string; // 仅在待办视图聚合时使用，标识任务来自哪个清单
  subtasks?: Task[]; // 仅内存派生（buildSubtaskTree），持久化时丢弃
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

export interface JsonListFile {
  version: number;
  meta: ListMeta;
  groups: Group[];
}

// ========== 组件 Props ==========

export type SortMode = 'drag' | 'due' | 'priority';

export type TodoViewKey = 'overdue' | 'all' | 'high' | 'calendar';

export interface FilterState {
  status: TaskStatus[]; // 空数组表示全部
  priority: 'all' | 'high' | 'med' | 'low';
  timeRange: 'all' | 'today' | 'week' | 'overdue';
  tags: string[]; // 空数组表示全部
}

export interface FilterDropdownProps {
  filter: FilterState;
  onChange: (filter: FilterState) => void;
}

// ========== Store 状态 ==========

export type SyncStatus = 'synced' | 'unsaved' | 'unconfigured';

export interface SyncStatusState {
  status: SyncStatus;
  lastSyncAt: string | null;
  pendingWrites: number;
}

export interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  basePath: string;
}
