import type { GithubConfig } from '@/types';

const CONFIG_KEY = 'dong-todo:github-config';

export function loadConfig(): GithubConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.token && parsed.owner && parsed.repo) {
      return {
        ...parsed,
        basePath: parsed.basePath ?? 'todo',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveConfig(config: GithubConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function clearConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
}

export function isOffline(): boolean {
  return !navigator.onLine;
}

export function cacheFileContent(name: string, content: string, sha: string): void {
  try {
    localStorage.setItem(`dong-todo:file:${name}`, JSON.stringify({ content, sha, cachedAt: new Date().toISOString() }));
  } catch {
    // 忽略缓存写入失败
  }
}

export function getCachedFileContent(name: string): { content: string; sha: string } | null {
  try {
    const raw = localStorage.getItem(`dong-todo:file:${name}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { content: parsed.content, sha: parsed.sha };
  } catch {
    return null;
  }
}

export function clearCachedFile(name: string): void {
  localStorage.removeItem(`dong-todo:file:${name}`);
}

export function cacheShaMap(map: Record<string, string>): void {
  try {
    localStorage.setItem('dong-todo:sha-map', JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getCachedShaMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem('dong-todo:sha-map');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function addPendingWrite(name: string, content: string): void {
  try {
    const key = 'dong-todo:pending-writes';
    const raw = localStorage.getItem(key) ?? '{}';
    const map = JSON.parse(raw);
    map[name] = { content, timestamp: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getPendingWrites(): Record<string, string> {
  try {
    const raw = localStorage.getItem('dong-todo:pending-writes') ?? '{}';
    const map = JSON.parse(raw);
    // 兼容旧格式：可能是字符串或对象
    return Object.fromEntries(
      Object.entries(map).map(([name, value]) => [
        name,
        typeof value === 'string' ? value : (value as { content: string }).content,
      ]),
    );
  } catch {
    return {};
  }
}

export interface PendingWriteDetail {
  fileName: string;
  content: string;
  timestamp: string;
}

export function getPendingWriteDetails(): PendingWriteDetail[] {
  try {
    const raw = localStorage.getItem('dong-todo:pending-writes') ?? '{}';
    const map = JSON.parse(raw);
    return Object.entries(map).map(([fileName, value]) => {
      if (typeof value === 'string') {
        return { fileName, content: value, timestamp: new Date().toISOString() };
      }
      return {
        fileName,
        content: (value as { content: string }).content,
        timestamp: (value as { timestamp: string }).timestamp,
      };
    });
  } catch {
    return [];
  }
}

export function clearPendingWrite(name: string): void {
  try {
    const key = 'dong-todo:pending-writes';
    const raw = localStorage.getItem(key) ?? '{}';
    const map = JSON.parse(raw);
    delete map[name];
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function cacheActiveList(name: string): void {
  localStorage.setItem('dong-todo:active-list', name);
}

export function getCachedActiveList(): string | null {
  return localStorage.getItem('dong-todo:active-list');
}

export function cacheNotified(taskId: string, due: string): void {
  try {
    const key = 'dong-todo:notified-tasks';
    const raw = localStorage.getItem(key) ?? '{}';
    const map = JSON.parse(raw);
    map[taskId] = due;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function hasNotified(taskId: string, due: string): boolean {
  try {
    const raw = localStorage.getItem('dong-todo:notified-tasks') ?? '{}';
    const map = JSON.parse(raw);
    return map[taskId] === due;
  } catch {
    return false;
  }
}
