import type { GithubConfig } from '@/types';

const CONFIG_KEY = 'dong-todo:github-config';

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

type PendingWriteStore = Record<string, string>;

function parsePendingWrites(raw: string | null): PendingWriteStore {
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
  updateJson<PendingWriteStore>(
    'dong-todo:pending-writes',
    (map) => ({ ...map, [name]: content }),
    {},
  );
}

export function getPendingWrites(): PendingWriteStore {
  return parsePendingWrites(localStorage.getItem('dong-todo:pending-writes'));
}

export function clearPendingWrite(name: string): void {
  updateJson<PendingWriteStore>(
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
