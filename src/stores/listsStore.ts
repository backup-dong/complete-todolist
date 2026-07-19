import { create } from 'zustand';
import type { GithubConfig, ListMeta, ParsedList } from '@/types';
import { getFileContent, listFilesByExtension, writeFileContent, deleteFile } from '@/github/client';
import { parseJsonToList, parseMarkdownToList, serializeListToJson, createEmptyList } from '@/parser';
import { useSyncStore } from './syncStore';
import {
  cacheFileContent,
  getCachedFileContent,
  clearCachedFile,
  cacheActiveList,
  getCachedActiveList,
  addPendingWrite,
  clearPendingWrite,
  getPendingWrites,
} from '@/utils/storage';

interface ListsState {
  lists: ListMeta[];
  activeListName: string | null;
  activeGroup: string | null;
  fileCache: Record<string, ParsedList>;
  pendingMigrations: string[];
  initialLoading: boolean;
  listsFetched: boolean;

  fetchLists: () => Promise<void>;
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
  createGroup: (name: string) => Promise<void>;
  renameGroup: (oldName: string, newName: string) => Promise<void>;
  deleteGroup: (name: string) => Promise<void>;
}

const LEGACY_EXT = '.md';
const NEW_EXT = '.json';

function listNameToFileName(name: string): string {
  return `${name}${NEW_EXT}`;
}

function fileNameToListName(fileName: string): string {
  return fileName.replace(/\.(md|json)$/, '');
}

function filePath(config: { basePath: string }, name: string, ext = NEW_EXT): string {
  return `${config.basePath}/${name}${ext}`;
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

async function deleteLegacyMdIfExists(config: GithubConfig, name: string, sha?: string): Promise<void> {
  if (!sha) return;
  const path = filePath(config, name, LEGACY_EXT);
  await deleteFile(config, path, sha).catch((err) => {
    console.warn(`Failed to delete legacy .md for ${name}:`, err);
  });
}

async function migrateListToJson(
  config: GithubConfig,
  name: string,
  list: ParsedList,
  oldMdSha?: string,
): Promise<string> {
  const jsonContent = serializeListToJson(list);
  const jsonPath = filePath(config, name);

  try {
    const newSha = await writeFileContent(config, jsonPath, jsonContent);
    if (oldMdSha) {
      await deleteLegacyMdIfExists(config, name, oldMdSha);
    }
    return newSha;
  } catch (err) {
    console.error(`migrateListToJson failed for ${name}`, err);
    throw err;
  }
}

function getCachedSha(name: string): string | undefined {
  return getCachedFileContent(name)?.sha;
}

export const useListsStore = create<ListsState>((set, get) => ({
  lists: [],
  activeListName: getCachedActiveList(),
  activeGroup: null,
  fileCache: {},
  pendingMigrations: [],
  initialLoading: true,
  listsFetched: false,

  fetchLists: async () => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) return;

    try {
      const [mdFiles, jsonFiles, archivedMdFiles, archivedJsonFiles] = await Promise.all([
        listFilesByExtension(sync.config!, '.md'),
        listFilesByExtension(sync.config!, '.json'),
        listFilesByExtension(sync.config!, '.md', '_archived').catch(() => []),
        listFilesByExtension(sync.config!, '.json', '_archived').catch(() => []),
      ]);

      const allFiles = [...mdFiles, ...jsonFiles, ...archivedMdFiles, ...archivedJsonFiles];
      const latestByName = new Map<string, { file: (typeof allFiles)[0]; isJson: boolean }>();

      for (const file of allFiles) {
        const name = fileNameToListName(file.name);
        const isJson = file.name.endsWith(NEW_EXT);
        const existing = latestByName.get(name);
        if (!existing || (!existing.isJson && isJson)) {
          latestByName.set(name, { file, isJson });
        }
      }

      const listMetas: ListMeta[] = [];
      const defaultCreated = new Date().toISOString().slice(0, 10);

      for (const { file } of latestByName.values()) {
        listMetas.push(buildListMeta(file, defaultCreated));
      }

      const pendingMigrations = [...mdFiles, ...archivedMdFiles]
        .filter((f) => latestByName.get(fileNameToListName(f.name))?.isJson === false)
        .map((f) => fileNameToListName(f.name));

      const nextActive = cleanupActiveList(listMetas, get().activeListName);
      set({ lists: listMetas, activeListName: nextActive, pendingMigrations, initialLoading: listMetas.length > 0, listsFetched: true });
    } catch (err) {
      console.error('fetchLists failed', err);
      set({ initialLoading: false, listsFetched: true });
    }
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
      clearPendingWrite(`${name}${LEGACY_EXT}`);
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
    const mdPath = filePath(sync.config!, name, LEGACY_EXT);

    try {
      const jsonFile = await getFileContent(sync.config!, jsonPath).catch(() => null);
      if (jsonFile) {
        const list = parseJsonToList(jsonFile.content, jsonFile.sha);
        const pendingWrites = getPendingWrites();
        const payloadFileName = listNameToFileName(name);
        if (pendingWrites[payloadFileName]) {
          const cached = getCachedFileContent(name);
          if (cached && cached.content !== jsonFile.content) {
            const cachedList = cached.content.trimStart().startsWith('{')
              ? parseJsonToList(cached.content, cached.sha)
              : parseMarkdownToList(cached.content, cached.sha);
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

      const mdFile = await getFileContent(sync.config!, mdPath);
      const list = parseMarkdownToList(mdFile.content, mdFile.sha);
      const newSha = await migrateListToJson(sync.config!, name, list, mdFile.sha);
      set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
      cacheFileContent(name, serializeListToJson(list), newSha);
      return list;
    } catch {
      const cached = getCachedFileContent(name);
      if (cached) {
        const list = cached.content.trimStart().startsWith('{')
          ? parseJsonToList(cached.content, cached.sha)
          : parseMarkdownToList(cached.content, cached.sha);
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
                const parsed = cached.content.trimStart().startsWith('{')
                  ? parseJsonToList(cached.content, cached.sha)
                  : parseMarkdownToList(cached.content, cached.sha);
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
