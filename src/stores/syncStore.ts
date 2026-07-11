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
  getPendingWrites,
  clearPendingWrite,
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

async function tryPushOneFile(
  name: string,
  content: string,
  config: GithubConfig,
  localShaMap: Record<string, string>,
): Promise<PushResult> {
  const path = `${config.basePath}/${name}`;
  try {
    const remote = await getFileContent(config, path).catch(() => null);
    if (remote && localShaMap[name] && remote.sha !== localShaMap[name]) {
      return { kind: 'conflict' };
    }
    const sha = remote?.sha;
    await writeFileContent(config, path, content, sha);
    clearPendingWrite(name);
    return { kind: 'success' };
  } catch (err) {
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
    conflictFiles: conflicts > 0 ? ['conflict'] : [], // placeholder, replaced by caller
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
  setSynced: () => set({ status: 'synced', lastSyncAt: new Date().toISOString(), pendingWrites: 0 }),
  setUnsaved: () => {
    const pending = Object.keys(getPendingWrites()).length;
    set({ status: 'unsaved', pendingWrites: pending });
  },
  setOffline: () => set({ status: 'offline' }),
  setUnconfigured: () => set({ status: 'unconfigured' }),

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
      cacheShaMap(remoteMap);
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
    const localShaMap = getCachedShaMap();

    try {
      for (const name of pendingKeys) {
        const content = pending[name];
        const result = await tryPushOneFile(name, content, config, localShaMap);
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
    if (strategy === 'remote') {
      clearPendingWrite(fileName);
    } else {
      // local: keep pending content, retry immediately
      await get().pushPending();
    }
    set((state) => ({
      conflictFiles: state.conflictFiles.filter((f) => f !== fileName),
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
    store.setSynced();
    store.pushPending();
  } else {
    store.setUnconfigured();
  }
});

window.addEventListener('offline', () => {
  useSyncStore.getState().setOffline();
});
