import { create } from 'zustand';
import { initGitHub, clearGitHub, getFileContent, writeFileContent } from '@/github/client';
import type { GithubConfig, SyncStatusState, SyncStatus } from '@/types';
import {
  loadConfig,
  saveConfig,
  clearConfig,
  isOffline,
  cacheFileContent,
  getPendingWrites,
  clearPendingWrite,
} from '@/utils/storage';

interface SyncStore {
  config: GithubConfig | null;
  status: SyncStatusState['status'];
  lastSyncAt: string | null;
  pendingWrites: number;
  configure: (token: string, owner: string, repo: string, basePath?: string) => void;
  ensureInitialized: () => boolean;
  pushPending: () => Promise<{ succeeded: string[]; failed: string[] }>;
  clear: () => void;
}

function deriveStatus(): SyncStatus {
  if (isOffline()) return 'unsaved';
  const cfg = loadConfig();
  if (!cfg) return 'unconfigured';
  if (Object.keys(getPendingWrites()).length > 0) return 'unsaved';
  return 'synced';
}

function computeState() {
  return {
    status: deriveStatus(),
    pendingWrites: Object.keys(getPendingWrites()).length,
    lastSyncAt: deriveStatus() === 'synced' ? new Date().toISOString() : null,
  };
}

const initialConfig = loadConfig();
if (initialConfig) {
  initGitHub(initialConfig);
}

async function pushSingleFile(
  fileName: string,
  content: string,
  config: GithubConfig,
): Promise<boolean> {
  const path = `${config.basePath}/${fileName}`;
  try {
    const remote = await getFileContent(config, path).catch(() => null);
    const sha = await writeFileContent(config, path, content, remote?.sha);
    clearPendingWrite(fileName);
    const listName = fileName.replace(/\.json$/, '');
    cacheFileContent(listName, content, sha);
    return true;
  } catch (err) {
    console.error(`Failed to push ${fileName}`, err);
    return false;
  }
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  config: initialConfig,
  status: deriveStatus(),
  lastSyncAt: null,
  pendingWrites: Object.keys(getPendingWrites()).length,

  configure: (token, owner, repo, basePath = 'todo') => {
    const config: GithubConfig = { token, owner, repo, basePath };
    saveConfig(config);
    initGitHub(config);
    set(computeState());
  },

  ensureInitialized: () => {
    const { config } = get();
    if (!config) return false;
    initGitHub(config);
    return true;
  },

  pushPending: async () => {
    const { config, ensureInitialized } = get();
    if (!ensureInitialized() || !config) return { succeeded: [], failed: [] };
    if (isOffline()) {
      set(computeState());
      return { succeeded: [], failed: [] };
    }

    const pending = getPendingWrites();
    const keys = Object.keys(pending);
    if (keys.length === 0) {
      set(computeState());
      return { succeeded: [], failed: [] };
    }

    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const name of keys) {
      const ok = await pushSingleFile(name, pending[name], config);
      if (ok) succeeded.push(name);
      else failed.push(name);
    }

    set(computeState());
    return { succeeded, failed };
  },

  clear: () => {
    clearConfig();
    clearGitHub();
    set({ config: null, status: 'unconfigured', lastSyncAt: null, pendingWrites: 0 });
  },
}));

window.addEventListener('online', () => {
  useSyncStore.getState().pushPending();
});

window.addEventListener('offline', () => {
  useSyncStore.setState(computeState());
});
