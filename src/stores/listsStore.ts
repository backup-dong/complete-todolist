import { create } from 'zustand';
import type { GithubConfig, ListMeta, ParsedList } from '@/types';
import { getFileContent, listFilesByExtension, writeFileContent, deleteFile } from '@/github/client';
import { parseJsonToList, serializeListToJson, createEmptyList } from '@/parser';
import { useSyncStore, computeState } from './syncStore';
import { toast } from '@/utils/toast';
import {
  cacheFileContent,
  getCachedFileContent,
  clearCachedFile,
  cacheActiveList,
  getCachedActiveList,
  addPendingWrite,
  clearPendingWrite,
  getPendingWrites,
  clearAllCachedFiles,
  clearAllPendingWrites,
  clearActiveListCache,
} from '@/utils/storage';

interface ListsState {
  lists: ListMeta[];
  activeListName: string | null;
  activeGroup: string | null;
  fileCache: Record<string, ParsedList>;
  initialLoading: boolean;
  listsFetched: boolean;

  fetchLists: () => Promise<boolean>;
  setInitialLoading: (value: boolean) => void;
  selectList: (name: string) => void;
  selectGroup: (name: string | null) => void;
  createList: (name: string) => Promise<void>;
  deleteList: (name: string) => Promise<void>;
  renameList: (oldName: string, newName: string) => Promise<void>;
  fetchListContent: (name: string) => Promise<ParsedList | null>;
  fetchAllListsContent: () => Promise<void>;
  saveListContent: (name: string, list: ParsedList) => Promise<void>;
  getActiveList: () => ParsedList | null;
  resetListsState: () => void;
  createGroup: (name: string) => Promise<void>;
  renameGroup: (oldName: string, newName: string) => Promise<void>;
  deleteGroup: (name: string) => Promise<void>;
}

const NEW_EXT = '.json';

function listNameToFileName(name: string): string {
  return `${name}${NEW_EXT}`;
}

function fileNameToListName(fileName: string): string {
  return fileName.replace(/\.json$/, '');
}

function filePath(config: { basePath: string }, name: string): string {
  return `${config.basePath}/${name}${NEW_EXT}`;
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

const syncTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
let fetchListsInFlight: Promise<boolean> | null = null;

function fetchListsErrorMessage(err: unknown): string {
  const status = typeof err === 'object' && err !== null && 'status' in err
    ? (err as { status?: unknown }).status
    : undefined;
  if (status === 401 || status === 403) {
    return 'GitHub 验证失败，Token 可能不正确或无权限';
  }
  if (status === 404) {
    return 'GitHub 仓库路径不存在，请检查所有者 / 仓库名 / 存储路径';
  }
  return 'GitHub 连接失败，请检查网络或稍后重试';
}

async function debouncedPush(name: string): Promise<void> {
  const pending = getPendingWrites();
  const fileName = listNameToFileName(name);
  const content = pending[fileName];
  if (!content) return;

  const config = useSyncStore.getState().config;
  if (!config) return;

  const path = `${config.basePath}/${fileName}`;
  try {
    const remote = await getFileContent(config, path).catch(() => null);
    const sha = await writeFileContent(config, path, content, remote?.sha);
    clearPendingWrite(fileName);
    cacheFileContent(name, content, sha);
    const cached = useListsStore.getState().fileCache[name];
    if (cached && cached.rawContent === content) {
      useListsStore.setState((state) => ({
        fileCache: { ...state.fileCache, [name]: { ...cached, sha } },
      }));
    }
    useSyncStore.setState(computeState());
  } catch (err) {
    console.error(`Debounced push failed for ${name}`, err);
  }
}

function triggerDebouncedPush(name: string): void {
  const existing = syncTimeouts.get(name);
  if (existing) clearTimeout(existing);
  const timeout = setTimeout(() => {
    syncTimeouts.delete(name);
    debouncedPush(name);
  }, 1500);
  syncTimeouts.set(name, timeout);
}

async function createRemoteList(config: GithubConfig, name: string, content: string): Promise<string> {
  const path = filePath(config, name);
  return writeFileContent(config, path, content);
}

async function deleteRemoteList(config: GithubConfig, name: string, sha: string): Promise<void> {
  const path = filePath(config, name);
  await deleteFile(config, path, sha);
}

function getCachedSha(name: string): string | undefined {
  return getCachedFileContent(name)?.sha;
}

export const useListsStore = create<ListsState>((set, get) => ({
  lists: [],
  activeListName: getCachedActiveList(),
  activeGroup: null,
  fileCache: {},
  initialLoading: true,
  listsFetched: false,

  fetchLists: () => {
    if (fetchListsInFlight) return fetchListsInFlight;

    fetchListsInFlight = (async (): Promise<boolean> => {
      const sync = useSyncStore.getState();
      if (!sync.ensureInitialized()) return false;

      try {
        const [jsonFiles, archivedJsonFiles] = await Promise.all([
          listFilesByExtension(sync.config!, '.json'),
          listFilesByExtension(sync.config!, '.json', '_archived').catch(() => []),
        ]);

        const allFiles = [...jsonFiles, ...archivedJsonFiles];
        const latestByName = new Map<string, (typeof allFiles)[0]>();

        for (const file of allFiles) {
          const name = fileNameToListName(file.name);
          const existing = latestByName.get(name);
          if (!existing) {
            latestByName.set(name, file);
          }
        }

        const listMetas: ListMeta[] = [];
        const defaultCreated = new Date().toISOString().slice(0, 10);

        for (const file of latestByName.values()) {
          listMetas.push(buildListMeta(file, defaultCreated));
        }

        const nextActive = cleanupActiveList(listMetas, get().activeListName);
        set({ lists: listMetas, activeListName: nextActive, initialLoading: listMetas.length > 0, listsFetched: true });
        return true;
      } catch (err) {
        console.error('fetchLists failed', err);
        toast.error(fetchListsErrorMessage(err));
        set({ initialLoading: false, listsFetched: true });
        return false;
      }
    })().finally(() => {
      fetchListsInFlight = null;
    });

    return fetchListsInFlight;
  },

  setInitialLoading: (value) => set({ initialLoading: value }),

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
    const content = serializeListToJson(list);
    const path = filePath(sync.config!, name);

    try {
      const sha = await writeFileContent(sync.config!, path, content);
      const parsed = parseJsonToList(content, sha);
      set((state) => ({
        lists: [...state.lists, { name, created: list.meta.created, archived: false }],
        fileCache: { ...state.fileCache, [name]: parsed },
        activeListName: name,
      }));
      cacheFileContent(name, content, sha);
    } catch (err) {
      console.error('createList failed', err);
      addPendingWrite(listNameToFileName(name), serializeListToJson(list));
      throw err;
    }
  },

  deleteList: async (name) => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) return;

    try {
      const sha = getCachedSha(name);
      if (sha) {
        await deleteRemoteList(sync.config!, name, sha);
      } else {
        const path = filePath(sync.config!, name);
        const remote = await getFileContent(sync.config!, path).catch(() => null);
        if (remote) {
          await deleteRemoteList(sync.config!, name, remote.sha);
        }
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
      clearPendingWrite(listNameToFileName(name));
    } catch (err) {
      console.error('deleteList failed', err);
    }
  },

  renameList: async (oldName, newName) => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) return;

    try {
      const oldList = get().fileCache[oldName] ?? createEmptyList(oldName);
      const newList = { ...oldList, meta: { ...oldList.meta, name: newName } };
      const content = serializeListToJson(newList);

      const newSha = await createRemoteList(sync.config!, newName, content);

      const oldSha = getCachedSha(oldName);
      if (oldSha) {
        await deleteRemoteList(sync.config!, oldName, oldSha);
      } else {
        const path = filePath(sync.config!, oldName);
        const remote = await getFileContent(sync.config!, path).catch(() => null);
        if (remote) {
          await deleteRemoteList(sync.config!, oldName, remote.sha);
        }
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
    } catch (err) {
      console.error('renameList failed', err);
    }
  },

  fetchListContent: async (name) => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) return null;

    const jsonPath = filePath(sync.config!, name);

    try {
      const jsonFile = await getFileContent(sync.config!, jsonPath).catch(() => null);
      if (jsonFile) {
        const list = parseJsonToList(jsonFile.content, jsonFile.sha);
        const pendingWrites = getPendingWrites();
        const payloadFileName = listNameToFileName(name);
        if (pendingWrites[payloadFileName]) {
          const cached = getCachedFileContent(name);
          if (cached && cached.content !== jsonFile.content) {
            const cachedList = parseJsonToList(cached.content, cached.sha);
            set((state) => ({ fileCache: { ...state.fileCache, [name]: cachedList } }));
          } else {
            set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
          }
        } else {
          set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
          cacheFileContent(name, jsonFile.content, jsonFile.sha);
        }
        return list;
      }

      toast.error(`清单文件 ${name}.json 不存在`);
    } catch {
      const cached = getCachedFileContent(name);
      if (cached) {
        const list = parseJsonToList(cached.content, cached.sha);
        set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
      }
    } finally {
      if (get().activeListName === name && get().initialLoading) {
        set({ initialLoading: false });
      }
    }
    return get().fileCache[name] ?? null;
  },

  saveListContent: async (name, list) => {
    const sync = useSyncStore.getState();
    const content = serializeListToJson(list);
    const fileName = listNameToFileName(name);

    set((state) => ({ fileCache: { ...state.fileCache, [name]: { ...list, rawContent: content } } }));
    addPendingWrite(fileName, content);
    cacheFileContent(name, content, list.sha ?? '');

    if (!sync.ensureInitialized()) return;

    triggerDebouncedPush(name);
  },

  getActiveList: () => {
    const { activeListName, fileCache } = get();
    return activeListName ? fileCache[activeListName] ?? null : null;
  },

  resetListsState: () => {
    for (const timeout of syncTimeouts.values()) {
      clearTimeout(timeout);
    }
    syncTimeouts.clear();

    clearAllCachedFiles();
    clearAllPendingWrites();
    clearActiveListCache();

    set({
      lists: [],
      activeListName: null,
      activeGroup: null,
      fileCache: {},
      initialLoading: true,
      listsFetched: false,
    });

    useSyncStore.setState(computeState());
  },

  fetchAllListsContent: async () => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) return;

    const { lists, fileCache, activeListName } = get();
    const pendingWrites = getPendingWrites();
    const results = await Promise.allSettled(
      lists.map((list) => {
        const pendingFileName = listNameToFileName(list.name);
        if (pendingWrites[pendingFileName]) {
          if (!fileCache[list.name]) {
            const cached = getCachedFileContent(list.name);
            if (cached) {
              try {
                const parsed = parseJsonToList(cached.content, cached.sha);
                set((state) => ({
                  fileCache: { ...state.fileCache, [list.name]: parsed },
                  initialLoading: state.initialLoading && state.activeListName === list.name ? false : state.initialLoading,
                }));
              } catch {
                // ignore
              }
            }
            if (get().initialLoading && activeListName === list.name) {
              set({ initialLoading: false });
            }
          }
          return Promise.resolve();
        }
        return get().fetchListContent(list.name);
      }),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`Failed to fetch list content for ${lists[index]?.name}:`, result.reason);
      }
    });
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
