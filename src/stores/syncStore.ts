import { create } from 'zustand';
import { initGitHub, clearGitHub, listFilesByExtension, getFileContent, writeFileContent } from '@/github/client';
import type { GithubConfig, SyncStatusState } from '@/types';
import {
  loadConfig,
  saveConfig,
  clearConfig,
  isOffline,
  cacheShaMap,
  getCachedShaMap,
  getCachedFileContent,
  cacheFileContent,
  getPendingWrites,
  clearPendingWrite,
  clearPendingIfUnchanged,
  migrateLocalStorageCache,
} from '@/utils/storage';

// 启动时先迁移本地缓存格式
migrateLocalStorageCache();

interface SyncStore extends SyncStatusState {
  config: GithubConfig | null;
  conflictFiles: string[];
  configure: (token: string, owner: string, repo: string, basePath?: string) => void;
  ensureInitialized: () => boolean;
  setSyncing: () => void;
  setSynced: () => void;
  setUnsaved: () => void;
  setOffline: () => void;
  setUnconfigured: () => void;
  markConflict: (fileName: string) => void;
  pollSha: () => Promise<Record<string, string> | null>;
  pushPending: () => Promise<{ succeeded: string[]; failed: string[]; conflicts: string[] }>;
  resolveConflict: (fileName: string, strategy: 'local' | 'remote') => Promise<void>;
  clear: () => void;
}

function initialStatus(): SyncStatusState['status'] {
  if (isOffline()) return 'offline';
  const cfg = loadConfig();
  if (!cfg) return 'unconfigured';
  return 'synced';
}

const initialConfig = loadConfig();
if (initialConfig) {
  initGitHub(initialConfig);
}

interface PushResult {
  kind: 'success' | 'conflict' | 'error';
}

function isConflictError(err: unknown): boolean {
  const status = err && typeof err === 'object' && 'status' in err ? (err as { status: number }).status : 0;
  return status === 409 || status === 422;
}

function fileNameToListName(fileName: string): string {
  return fileName.replace(/\.json$/, '');
}

/** 本地已知的远端 sha：优先文件缓存，其次 sha map */
function knownRemoteSha(fileName: string): string | undefined {
  const cached = getCachedFileContent(fileNameToListName(fileName));
  if (cached?.sha) return cached.sha;
  return getCachedShaMap()[fileName] || undefined;
}

async function tryPushOneFile(
  name: string,
  content: string,
  config: GithubConfig,
): Promise<PushResult> {
  const path = `${config.basePath}/${name}`;
  try {
    // 条件写入：基于本地已知的远端 sha；远端被其他设备修改时 409/422，走冲突流程。
    // 本地没有 sha 记录时没有冲突判断依据，先取远端 sha 再写。
    let sha = knownRemoteSha(name);
    if (!sha) {
      const remote = await getFileContent(config, path).catch(() => null);
      sha = remote?.sha;
    }
    const newSha = await writeFileContent(config, path, content, sha);
    // 安全清除：只有待写入内容未被更新时才清除，
    // 防止 async 间隙新内容被误清除
    if (clearPendingIfUnchanged(name, content)) {
      cacheFileContent(fileNameToListName(name), content, newSha);
    }
    return { kind: 'success' };
  } catch (err) {
    if (isConflictError(err)) {
      return { kind: 'conflict' };
    }
    console.error(`pushPending failed for ${name}`, err);
    return { kind: 'error' };
  }
}

function deriveStatusFromResults(
  failed: number,
  conflicts: number,
): Pick<SyncStatusState, 'status' | 'pendingWrites'> & { conflictFiles: string[] } {
  const remaining = Object.keys(getPendingWrites()).length;
  if (remaining === 0 && failed === 0 && conflicts === 0) {
    return { status: 'synced', pendingWrites: 0, conflictFiles: [] };
  }
  return {
    status: remaining > 0 ? 'unsaved' : 'synced',
    pendingWrites: remaining,
    conflictFiles: [], // 由调用方填充具体冲突文件
  };
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  status: initialStatus(),
  lastSyncAt: null,
  pendingWrites: Object.keys(getPendingWrites()).length,
  config: loadConfig(),
  conflictFiles: [],

  configure: (token, owner, repo, basePath = 'todo') => {
    const config: GithubConfig = { token, owner, repo, basePath };
    saveConfig(config);
    initGitHub(config);
    set({ config, status: isOffline() ? 'offline' : 'synced', pendingWrites: Object.keys(getPendingWrites()).length });
  },

  ensureInitialized: () => {
    const { config } = get();
    if (!config) return false;
    initGitHub(config);
    return true;
  },

  setSyncing: () => set({ status: 'syncing' }),
  // 根据实际待写入队列计算状态：其他文件可能仍有 pending，不能无条件置 synced
  setSynced: () => {
    const pending = Object.keys(getPendingWrites()).length;
    set({
      status: pending > 0 ? 'unsaved' : 'synced',
      lastSyncAt: new Date().toISOString(),
      pendingWrites: pending,
    });
  },
  setUnsaved: () => {
    const pending = Object.keys(getPendingWrites()).length;
    set({ status: 'unsaved', pendingWrites: pending });
  },
  setOffline: () => set({ status: 'offline' }),
  setUnconfigured: () => set({ status: 'unconfigured' }),
  markConflict: (fileName) =>
    set((state) => ({
      status: 'unsaved',
      pendingWrites: Object.keys(getPendingWrites()).length,
      conflictFiles: state.conflictFiles.includes(fileName)
        ? state.conflictFiles
        : [...state.conflictFiles, fileName],
    })),

  pollSha: async () => {
    const { config, ensureInitialized } = get();
    if (!ensureInitialized() || !config) return null;
    if (isOffline()) {
      set({ status: 'offline' });
      return null;
    }

    try {
      const remoteFiles = await listFilesByExtension(config, '.json');
      const remoteMap: Record<string, string> = {};
      remoteFiles.forEach((f) => {
        remoteMap[f.name] = f.sha;
      });

      // 对比上一轮 sha map，检测远端变更
      const prevMap = getCachedShaMap();
      cacheShaMap(remoteMap);

      const pending = getPendingWrites();
      // 本地有待写入的文件跳过：以本地为准，推送时如遇远端修改走冲突流程
      const changed = Object.keys(remoteMap).filter(
        (name) => prevMap[name] && prevMap[name] !== remoteMap[name] && !pending[name],
      );
      const added = Object.keys(remoteMap).filter((name) => !(name in prevMap));
      const removed = Object.keys(prevMap).filter((name) => !(name in remoteMap) && !pending[name]);

      if (added.length > 0 || removed.length > 0 || changed.length > 0) {
        // 动态引入避免与 listsStore 的循环依赖
        const { useListsStore } = await import('./listsStore');
        if (added.length > 0 || removed.length > 0) {
          // 文件增删：刷新清单目录
          await useListsStore.getState().fetchLists();
        }
        for (const fileName of changed) {
          const listName = fileNameToListName(fileName);
          if (useListsStore.getState().lists.some((l) => l.name === listName)) {
            // fetchListContent 内部会再次检查 pending，不会覆盖本地修改
            await useListsStore.getState().fetchListContent(listName);
          }
        }
      }

      return remoteMap;
    } catch (err) {
      console.error('pollSha failed', err);
      return null;
    }
  },

  pushPending: async () => {
    const { config, ensureInitialized } = get();
    if (!ensureInitialized() || !config) return { succeeded: [], failed: [], conflicts: [] };
    if (isOffline()) {
      set({ status: 'offline' });
      return { succeeded: [], failed: [], conflicts: [] };
    }

    const pending = getPendingWrites();
    const pendingKeys = Object.keys(pending);
    if (pendingKeys.length === 0) {
      set({ status: 'synced', pendingWrites: 0, conflictFiles: [] });
      return { succeeded: [], failed: [], conflicts: [] };
    }

    set({ status: 'syncing' });
    const succeeded: string[] = [];
    const failed: string[] = [];
    const conflicts: string[] = [];

    try {
      for (const name of pendingKeys) {
        const content = pending[name];
        const result = await tryPushOneFile(name, content, config);
        if (result.kind === 'success') succeeded.push(name);
        else if (result.kind === 'conflict') conflicts.push(name);
        else failed.push(name);
      }

      const statusState = deriveStatusFromResults(failed.length, conflicts.length);
      set({
        ...statusState,
        conflictFiles: conflicts,
        lastSyncAt: statusState.status === 'synced' ? new Date().toISOString() : get().lastSyncAt,
      });
    } catch (err) {
      console.error('pushPending failed', err);
      set({ status: 'unsaved', pendingWrites: Object.keys(getPendingWrites()).length });
    }

    return { succeeded, failed, conflicts };
  },

  resolveConflict: async (fileName, strategy) => {
    const { config, ensureInitialized } = get();
    if (!ensureInitialized() || !config) return;
    const listName = fileNameToListName(fileName);
    const path = `${config.basePath}/${fileName}`;

    if (strategy === 'remote') {
      // 放弃本地修改：清除待写入，重新拉取远端内容刷新 UI
      clearPendingWrite(fileName);
      const { useListsStore } = await import('./listsStore');
      await useListsStore.getState().fetchListContent(listName);
    } else {
      // 保留本地修改：基于远端最新 sha 强制覆盖写入（用户已确认以本地为准）
      const pending = getPendingWrites()[fileName];
      if (pending) {
        try {
          const remote = await getFileContent(config, path).catch(() => null);
          const newSha = await writeFileContent(config, path, pending, remote?.sha);
          if (clearPendingIfUnchanged(fileName, pending)) {
            cacheFileContent(listName, pending, newSha);
          }
        } catch (err) {
          console.error(`resolveConflict failed for ${fileName}`, err);
          return; // 保留冲突标记，允许用户重试
        }
      }
    }

    const remaining = Object.keys(getPendingWrites()).length;
    set((state) => ({
      conflictFiles: state.conflictFiles.filter((f) => f !== fileName),
      status: remaining > 0 ? 'unsaved' : 'synced',
      pendingWrites: remaining,
    }));
  },

  clear: () => {
    clearConfig();
    clearGitHub();
    set({ config: null, status: 'unconfigured', lastSyncAt: null, pendingWrites: 0, conflictFiles: [] });
  },
}));

// 页面可见性变化时更新离线状态
window.addEventListener('online', () => {
  const store = useSyncStore.getState();
  if (store.config) {
    store.pushPending(); // pushPending 内部会处理 sync 状态转换
  } else {
    store.setUnconfigured();
  }
});

window.addEventListener('offline', () => {
  useSyncStore.getState().setOffline();
});

// 其他标签页修改了待写入队列时，同步本页的状态计数
window.addEventListener('storage', (e) => {
  if (e.key !== 'dong-todo:pending-writes') return;
  const store = useSyncStore.getState();
  if (store.status === 'offline' || store.status === 'unconfigured') return;
  if (Object.keys(getPendingWrites()).length > 0) {
    store.setUnsaved();
  } else {
    store.setSynced();
  }
});
