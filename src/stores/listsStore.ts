import { create } from 'zustand';
import type { GithubConfig, ListMeta, ParsedList } from '@/types';
import { getFileContent, listMarkdownFiles, writeFileContent, deleteFile } from '@/github/client';
import { parseMarkdownToList } from '@/parser/scanner';
import { serializeList, createEmptyList } from '@/parser/serializer';
import { useSyncStore } from './syncStore';
import {
  cacheFileContent,
  getCachedFileContent,
  clearCachedFile,
  cacheActiveList,
  getCachedActiveList,
  addPendingWrite,
  clearPendingWrite,
  cacheShaMap,
  getCachedShaMap,
  getPendingWrites,
} from '@/utils/storage';

interface ListsState {
  lists: ListMeta[];
  activeListName: string | null;
  activeGroup: string | null;
  fileCache: Record<string, ParsedList>;

  fetchLists: () => Promise<void>;
  selectList: (name: string) => void;
  selectGroup: (name: string | null) => void;
  createList: (name: string) => Promise<void>;
  deleteList: (name: string) => Promise<void>;
  renameList: (oldName: string, newName: string) => Promise<void>;
  fetchListContent: (name: string) => Promise<ParsedList | null>;
  saveListContent: (name: string, list: ParsedList) => Promise<void>;
  getActiveList: () => ParsedList | null;
  createGroup: (name: string) => Promise<void>;
  renameGroup: (oldName: string, newName: string) => Promise<void>;
  deleteGroup: (name: string) => Promise<void>;
}

function fileNameToListName(fileName: string): string {
  return fileName.replace(/\.md$/, '');
}

function listNameToFileName(name: string): string {
  return `${name}.md`;
}

function filePath(config: { basePath: string }, name: string): string {
  return `${config.basePath}/${listNameToFileName(name)}`;
}

function buildListMeta(file: { name: string; path: string }, defaultCreated = new Date().toISOString().slice(0, 10)): ListMeta {
  return {
    name: fileNameToListName(file.name),
    created: defaultCreated,
    archived: file.path.includes('_archived'),
  };
}

function cleanupActiveList(lists: ListMeta[], currentActive: string | null): string | null {
  if (!currentActive) return null;
  if (lists.some((l) => l.name === currentActive)) return currentActive;
  cacheActiveList('');
  return null;
}

// 按文件防抖的后台同步
const syncTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
const syncInFlight: Map<string, Promise<void>> = new Map();

function triggerDebouncedSync(name: string, content: string, fileName: string, config: GithubConfig): void {
  const existing = syncTimeouts.get(name);
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(() => {
    syncTimeouts.delete(name);
    performBackgroundSync(name, content, fileName, config);
  }, 1500);

  syncTimeouts.set(name, timeout);
}

async function waitForInFlight(name: string): Promise<void> {
  const inFlight = syncInFlight.get(name);
  if (inFlight) {
    await inFlight.catch(() => {});
  }
}

async function uploadContent(
  name: string,
  content: string,
  config: GithubConfig,
): Promise<{ sha: string; remoteSha?: string } | null> {
  const path = filePath(config, name);
  const remote = await getFileContent(config, path).catch(() => null);
  const sha = await writeFileContent(config, path, content, remote?.sha);
  return { sha, remoteSha: remote?.sha };
}

function clearPendingIfUnchanged(fileName: string, content: string): boolean {
  const latestPending = getPendingWrites()[fileName];
  if (latestPending === content) {
    clearPendingWrite(fileName);
    return true;
  }
  return false;
}

async function performBackgroundSync(name: string, content: string, fileName: string, config: GithubConfig): Promise<void> {
  await waitForInFlight(name);

  const sync = useSyncStore.getState();
  const promise = (async () => {
    try {
      sync.setSyncing();
      const result = await uploadContent(name, content, config);
      if (!result) {
        sync.setUnsaved();
        return;
      }

      // 只有在待写入内容没有再次被覆盖时才清除 pending
      if (clearPendingIfUnchanged(fileName, content)) {
        cacheFileContent(name, content, result.sha);
        sync.setSynced();
      } else {
        sync.setUnsaved();
      }
    } catch (err) {
      console.error('Background sync failed', err);
      sync.setUnsaved();
    }
  })();

  syncInFlight.set(name, promise);
  try {
    await promise;
  } finally {
    syncInFlight.delete(name);
  }
}

async function createRemoteList(config: GithubConfig, name: string, content: string): Promise<string> {
  const path = filePath(config, name);
  return writeFileContent(config, path, content);
}

async function deleteRemoteList(config: GithubConfig, name: string, sha: string): Promise<void> {
  const path = filePath(config, name);
  await deleteFile(config, path, sha);
}

function resolveListSha(name: string): string | undefined {
  return getCachedFileContent(name)?.sha ?? getCachedShaMap()[listNameToFileName(name)];
}

export const useListsStore = create<ListsState>((set, get) => ({
  lists: [],
  activeListName: getCachedActiveList(),
  activeGroup: null,
  fileCache: {},

  fetchLists: async () => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) return;

    sync.setSyncing();
    try {
      const files = await listMarkdownFiles(sync.config!);
      const archivedFiles = await listMarkdownFiles({ ...sync.config!, basePath: `${sync.config!.basePath}/_archived` }).catch(() => []);

      const allFiles = [...files, ...archivedFiles];
      const shaMap: Record<string, string> = {};
      const listMetas: ListMeta[] = [];

      const defaultCreated = new Date().toISOString().slice(0, 10);
      for (const file of allFiles) {
        shaMap[file.name] = file.sha;
        listMetas.push(buildListMeta(file, defaultCreated));
      }

      cacheShaMap(shaMap);
      const nextActive = cleanupActiveList(listMetas, get().activeListName);
      set({ lists: listMetas, activeListName: nextActive });
      sync.setSynced();
    } catch (err) {
      console.error('fetchLists failed', err);
      sync.setUnsaved();
    }
  },

  selectList: (name) => {
    cacheActiveList(name);
    set({ activeListName: name, activeGroup: null });
  },

  selectGroup: (name) => {
    set({ activeGroup: name });
  },

  createList: async (name) => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) {
      throw new Error('GitHub 未配置，请先前往设置页面配置 Token');
    }

    const list = createEmptyList(name);
    const content = serializeList(list);
    const path = filePath(sync.config!, name);

    try {
      sync.setSyncing();
      const sha = await writeFileContent(sync.config!, path, content);
      const parsed = parseMarkdownToList(content, sha);
      set((state) => ({
        lists: [...state.lists, { name, created: list.meta.created, archived: false }],
        fileCache: { ...state.fileCache, [name]: parsed },
        activeListName: name,
      }));
      cacheFileContent(name, content, sha);
      sync.setSynced();
    } catch (err) {
      console.error('createList failed', err);
      addPendingWrite(listNameToFileName(name), serializeList(list));
      sync.setUnsaved();
      throw err;
    }
  },

  deleteList: async (name) => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) return;

    const path = filePath(sync.config!, name);
    try {
      sync.setSyncing();
      const sha = resolveListSha(name);
      if (sha) {
        await deleteFile(sync.config!, path, sha);
      }
      set((state) => ({
        lists: state.lists.filter((l) => l.name !== name),
        fileCache: Object.fromEntries(Object.entries(state.fileCache).filter(([k]) => k !== name)),
        activeListName: state.activeListName === name ? null : state.activeListName,
      }));
      if (get().activeListName === null) {
        cacheActiveList('');
      }
      clearCachedFile(name);
      sync.setSynced();
    } catch (err) {
      console.error('deleteList failed', err);
      sync.setUnsaved();
    }
  },

  renameList: async (oldName, newName) => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) return;

    try {
      sync.setSyncing();
      const oldList = get().fileCache[oldName] ?? createEmptyList(oldName);
      const newList = { ...oldList, meta: { ...oldList.meta, name: newName } };
      const content = serializeList(newList);
      const oldSha = resolveListSha(oldName);

      // 创建新文件
      const newSha = await createRemoteList(sync.config!, newName, content);
      // 删除旧文件
      if (oldSha) {
        await deleteRemoteList(sync.config!, oldName, oldSha);
      }

      set((state) => ({
        lists: state.lists.map((l) => (l.name === oldName ? { ...l, name: newName } : l)),
        fileCache: Object.fromEntries(
          Object.entries(state.fileCache).map(([k, v]) =>
            k === oldName ? [newName, { ...v, meta: { ...v.meta, name: newName }, rawContent: content, sha: newSha }] : [k, v],
          ),
        ),
        activeListName: state.activeListName === oldName ? newName : state.activeListName,
      }));
      cacheFileContent(newName, content, newSha);
      sync.setSynced();
    } catch (err) {
      console.error('renameList failed', err);
      sync.setUnsaved();
    }
  },

  fetchListContent: async (name) => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) return null;

    const path = filePath(sync.config!, name);
    try {
      sync.setSyncing();
      const file = await getFileContent(sync.config!, path);
      const list = parseMarkdownToList(file.content, file.sha);
      set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
      cacheFileContent(name, file.content, file.sha);
      sync.setSynced();
      return list;
    } catch {
      // 尝试本地缓存
      const cached = getCachedFileContent(name);
      if (cached) {
        const list = parseMarkdownToList(cached.content, cached.sha);
        set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
        sync.setUnsaved();
        return list;
      }
      sync.setUnsaved();
      return null;
    }
  },

  saveListContent: async (name, list) => {
    const sync = useSyncStore.getState();
    const content = serializeList(list);
    const fileName = listNameToFileName(name);

    // 1. 立即更新本地状态与待写入队列，UI 不阻塞
    set((state) => ({ fileCache: { ...state.fileCache, [name]: { ...list, rawContent: content } } }));
    addPendingWrite(fileName, content);
    sync.setUnsaved();

    // 离线或未配置时直接返回，后续由 pushPending 或 online 事件兜底
    if (!sync.ensureInitialized() || sync.status === 'offline') return;

    // 2. 触发后台防抖同步
    triggerDebouncedSync(name, content, fileName, sync.config!);
  },

  getActiveList: () => {
    const { activeListName, fileCache } = get();
    return activeListName ? fileCache[activeListName] ?? null : null;
  },

  createGroup: async (name) => {
    const { activeListName, fileCache, saveListContent } = get();
    if (!activeListName) return;
    const list = fileCache[activeListName];
    if (!list) return;
    if (list.groups.some((g) => g.name === name)) return;

    const nextList = { ...list, groups: [...list.groups, { name, tasks: [] }] };
    await saveListContent(activeListName, nextList);
  },

  renameGroup: async (oldName, newName) => {
    const { activeListName, fileCache, saveListContent } = get();
    if (!activeListName) return;
    const list = fileCache[activeListName];
    if (!list) return;
    if (oldName === newName) return;
    if (list.groups.some((g) => g.name === newName)) return;

    const nextList = {
      ...list,
      groups: list.groups.map((g) =>
        g.name === oldName
          ? { ...g, name: newName, tasks: g.tasks.map((t) => ({ ...t, group: newName })) }
          : g,
      ),
    };
    await saveListContent(activeListName, nextList);
  },

  deleteGroup: async (name) => {
    const { activeListName, fileCache, saveListContent, selectGroup } = get();
    if (!activeListName) return;
    const list = fileCache[activeListName];
    if (!list) return;

    let nextGroups = list.groups.filter((g) => g.name !== name);
    if (nextGroups.length === 0) {
      nextGroups = [{ name: '默认分组', tasks: [] }];
    }

    const nextList = { ...list, groups: nextGroups };
    await saveListContent(activeListName, nextList);
    selectGroup(null);
  },
}));
