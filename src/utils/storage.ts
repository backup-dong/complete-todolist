import type { GithubConfig } from '@/types';
import { parseMarkdownToList } from '@/parser/scanner';
import { serializeListToJson } from '@/parser/jsonSerializer';

const CONFIG_KEY = 'dong-todo:github-config';
const FORMAT_VERSION_KEY = 'dong-todo:format-version';
const CURRENT_FORMAT_VERSION = 1;

export function getJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

function updateJson<T>(key: string, updater: (value: T) => T, fallback: T): void {
  const current = getJson<T>(key, fallback);
  setJson(key, updater(current));
}

export function loadConfig(): GithubConfig | null {
  const parsed = getJson<Partial<GithubConfig>>(CONFIG_KEY, {});
  if (parsed.token && parsed.owner && parsed.repo) {
    return {
      ...parsed,
      basePath: parsed.basePath ?? 'todo',
    } as GithubConfig;
  }
  return null;
}

export function saveConfig(config: GithubConfig): void {
  setJson(CONFIG_KEY, config);
}

export function clearConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
}

export function getStorageFormatVersion(): number {
  return getJson<number>(FORMAT_VERSION_KEY, 0);
}

export function setStorageFormatVersion(version: number): void {
  setJson(FORMAT_VERSION_KEY, version);
}

export function migrateLocalStorageCache(): void {
  if (getStorageFormatVersion() >= CURRENT_FORMAT_VERSION) return;

  // 清空旧的文件缓存（格式可能混合 .md/.json）
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('dong-todo:file:')) {
      localStorage.removeItem(key);
    }
  }

  // 清空 SHA 缓存
  localStorage.removeItem('dong-todo:sha-map');

  // 迁移 pending writes
  migratePendingWrites();

  setStorageFormatVersion(CURRENT_FORMAT_VERSION);
}

function migratePendingWrites(): void {
  const raw = localStorage.getItem('dong-todo:pending-writes');
  if (!raw) return;

  let parsed: Record<string, string | { content: string; timestamp?: string }>;
  try {
    parsed = JSON.parse(raw) as Record<string, string | { content: string; timestamp?: string }>;
  } catch {
    localStorage.removeItem('dong-todo:pending-writes');
    return;
  }

  const migrated: Record<string, { content: string; timestamp: string }> = {};
  for (const [fileName, value] of Object.entries(parsed)) {
    const content = typeof value === 'string' ? value : value.content;
    if (fileName.endsWith('.json')) {
      migrated[fileName] = { content, timestamp: new Date().toISOString() };
    } else if (fileName.endsWith('.md')) {
      try {
        const list = parseMarkdownToList(content);
        const jsonName = fileName.replace(/\.md$/, '.json');
        migrated[jsonName] = { content: serializeListToJson(list), timestamp: new Date().toISOString() };
      } catch {
        console.warn(`Dropping corrupt pending write during migration: ${fileName}`);
      }
    }
  }

  setJson('dong-todo:pending-writes', migrated);
}

export function isOffline(): boolean {
  return !navigator.onLine;
}

export function cacheFileContent(name: string, content: string, sha: string): void {
  setJson(`dong-todo:file:${name}`, { content, sha, cachedAt: new Date().toISOString() });
}

export function getCachedFileContent(name: string): { content: string; sha: string } | null {
  const parsed = getJson<{ content?: string; sha?: string } | null>(`dong-todo:file:${name}`, null);
  if (!parsed || typeof parsed.content !== 'string' || typeof parsed.sha !== 'string') return null;
  return { content: parsed.content, sha: parsed.sha };
}

export function clearCachedFile(name: string): void {
  localStorage.removeItem(`dong-todo:file:${name}`);
}

export function cacheShaMap(map: Record<string, string>): void {
  setJson('dong-todo:sha-map', map);
}

export function getCachedShaMap(): Record<string, string> {
  return getJson<Record<string, string>>('dong-todo:sha-map', {});
}

type PendingWriteRecord = Record<string, string>;
type RawPendingWriteRecord = Record<string, string | { content: string; timestamp?: string }>;

function parsePendingWrites(raw: string | null): PendingWriteRecord {
  if (!raw) return {};
  try {
    const map = JSON.parse(raw) as Record<string, string | { content: string }>;
    return Object.fromEntries(
      Object.entries(map).map(([name, value]) => [
        name,
        typeof value === 'string' ? value : value.content,
      ]),
    );
  } catch {
    return {};
  }
}

export function addPendingWrite(name: string, content: string): void {
  updateJson<RawPendingWriteRecord>(
    'dong-todo:pending-writes',
    (map) => ({ ...map, [name]: { content, timestamp: new Date().toISOString() } }),
    {},
  );
}

export function getPendingWrites(): Record<string, string> {
  return parsePendingWrites(localStorage.getItem('dong-todo:pending-writes'));
}

interface PendingWriteDetail {
  fileName: string;
  content: string;
  timestamp: string;
}

export function getPendingWriteDetails(): PendingWriteDetail[] {
  const raw = localStorage.getItem('dong-todo:pending-writes');
  if (!raw) return [];
  try {
    const map = JSON.parse(raw) as Record<string, string | { content: string; timestamp?: string }>;
    return Object.entries(map).map(([fileName, value]) => {
      if (typeof value === 'string') {
        return { fileName, content: value, timestamp: new Date().toISOString() };
      }
      return {
        fileName,
        content: value.content,
        timestamp: value.timestamp ?? new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

/**
 * 只有当待写入内容与指定内容一致时才清除 pending write。
 * 用于防止在 async 间隙被更新的 pending write 被误清除。
 */
export function clearPendingIfUnchanged(fileName: string, content: string): boolean {
  const latestPending = getPendingWrites()[fileName];
  if (latestPending === content) {
    clearPendingWrite(fileName);
    return true;
  }
  return false;
}

export function clearPendingWrite(name: string): void {
  updateJson<RawPendingWriteRecord>(
    'dong-todo:pending-writes',
    (map) => {
      const next = { ...map };
      delete next[name];
      return next;
    },
    {},
  );
}

export function cacheActiveList(name: string): void {
  localStorage.setItem('dong-todo:active-list', name);
}

export function getCachedActiveList(): string | null {
  return localStorage.getItem('dong-todo:active-list');
}

export function cacheNotified(taskId: string, due: string): void {
  updateJson<Record<string, string>>(
    'dong-todo:notified-tasks',
    (map) => ({ ...map, [taskId]: due }),
    {},
  );
}

export function hasNotified(taskId: string, due: string): boolean {
  const map = getJson<Record<string, string>>('dong-todo:notified-tasks', {});
  return map[taskId] === due;
}
