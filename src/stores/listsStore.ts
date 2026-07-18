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
  clearPendingIfUnchanged,
  cacheShaMap,
  getCachedShaMap,
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

function isConflictError(err: unknown): boolean {
  const status = err && typeof err === 'object' && 'status' in err ? (err as { status: number }).status : 0;
  return status === 409 || status === 422;
}

/** 本地已知的远端 sha：优先文件缓存，其次 sha map */
function knownRemoteSha(name: string): string | undefined {
  const cached = getCachedFileContent(name);
  if (cached?.sha) return cached.sha;
  return getCachedShaMap()[listNameToFileName(name)] || undefined;
}

async function uploadContent(
  name: string,
  content: string,
  config: GithubConfig,
): Promise<{ sha: string } | { conflict: true } | null> {
  const path = filePath(config, name);
  let knownSha = knownRemoteSha(name);
  if (!knownSha) {
    // 本地没有远端 sha 记录（如换新设备）：没有冲突判断依据，退回先取远端 sha 再写
    const remote = await getFileContent(config, path).catch(() => null);
    knownSha = remote?.sha;
  }
  try {
    // 条件写入：基于本地已知的远端 sha。远端被其他设备修改时 GitHub 返回 409/422，
    // 此时不能覆盖，走冲突流程由用户决定
    const sha = await writeFileContent(config, path, content, knownSha);
    return { sha };
  } catch (err) {
    if (isConflictError(err)) return { conflict: true };
    throw err;
  }
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
      if ('conflict' in result) {
        // 远端已被其他设备修改：保留本地待写入，提示用户解决冲突
        sync.markConflict(fileName);
        return;
      }

      // 只有在待写入内容没有再次被覆盖时才清除 pending
      if (clearPendingIfUnchanged(fileName, content)) {
        cacheFileContent(name, content, result.sha);
        // 同步更新内存中清单的 sha，避免后续保存基于过期 sha 产生假冲突
        const cached = useListsStore.getState().fileCache[name];
        if (cached && cached.rawContent === content) {
          useListsStore.setState((state) => ({
            fileCache: { ...state.fileCache, [name]: { ...cached, sha: result.sha } },
          }));
        }
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

async function deleteLegacyMdIfExists(config: GithubConfig, name: string, sha?: string): Promise<void> {
  if (!sha) return;
  const path = filePath(config, name, LEGACY_EXT);
  await deleteFile(config, path, sha).catch((err) => {
    console.warn(`Failed to delete legacy .md for ${name}:`, err);
  });
}

function resolveListSha(name: string): { json?: string; md?: string } {
  const cached = getCachedFileContent(name);
  if (cached?.sha) {
    return { json: cached.sha };
  }
  const shaMap = getCachedShaMap();
  return {
    json: shaMap[listNameToFileName(name)],
    md: shaMap[`${name}${LEGACY_EXT}`],
  };
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
    // 先写 .json
    const newSha = await writeFileContent(config, jsonPath, jsonContent);
    // 写成功后再删 .md
    if (oldMdSha) {
      await deleteLegacyMdIfExists(config, name, oldMdSha);
    }
    return newSha;
  } catch (err) {
    console.error(`migrateListToJson failed for ${name}`, err);
    throw err;
  }
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

    sync.setSyncing();
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

      const shaMap: Record<string, string> = {};
      const listMetas: ListMeta[] = [];
      const defaultCreated = new Date().toISOString().slice(0, 10);

      for (const { file } of latestByName.values()) {
        shaMap[file.name] = file.sha;
        listMetas.push(buildListMeta(file, defaultCreated));
      }

      cacheShaMap(shaMap);

      const pendingMigrations = [...mdFiles, ...archivedMdFiles]
        .filter((f) => latestByName.get(fileNameToListName(f.name))?.isJson === false)
        .map((f) => fileNameToListName(f.name));

      const nextActive = cleanupActiveList(listMetas, get().activeListName);
      set({ lists: listMetas, activeListName: nextActive, pendingMigrations, initialLoading: listMetas.length > 0, listsFetched: true });
      sync.setSynced();
    } catch (err) {
      console.error('fetchLists failed', err);
      set({ initialLoading: false, listsFetched: true });
      sync.setUnsaved();
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
      sync.setSyncing();
      const sha = await writeFileContent(sync.config!, path, content);
      const parsed = parseJsonToList(content, sha);
      set((state) => ({
        lists: [...state.lists, { name, created: list.meta.created, archived: false }],
        fileCache: { ...state.fileCache, [name]: parsed },
        activeListName: name,
      }));
      cacheFileContent(name, content, sha);
      sync.setSynced();
    } catch (err) {
      console.error('createList failed', err);
      addPendingWrite(listNameToFileName(name), serializeListToJson(list));
      sync.setUnsaved();
      throw err;
    }
  },

  deleteList: async (name) => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) return;

    try {
      sync.setSyncing();
      const shas = resolveListSha(name);
      if (shas.json) {
        await deleteRemoteList(sync.config!, name, shas.json);
      }
      if (shas.md) {
        await deleteLegacyMdIfExists(sync.config!, name, shas.md);
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
      const content = serializeListToJson(newList);
      const shas = resolveListSha(oldName);

      // 创建新文件
      const newSha = await createRemoteList(sync.config!, newName, content);
      // 删除旧文件（.json 和 .md）
      if (shas.json) {
        await deleteRemoteList(sync.config!, oldName, shas.json);
      }
      if (shas.md) {
        await deleteLegacyMdIfExists(sync.config!, oldName, shas.md);
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

    const jsonPath = filePath(sync.config!, name);
    const mdPath = filePath(sync.config!, name, LEGACY_EXT);

    try {
      sync.setSyncing();

      // 优先读取 .json
      const jsonFile = await getFileContent(sync.config!, jsonPath).catch(() => null);
      if (jsonFile) {
        const list = parseJsonToList(jsonFile.content, jsonFile.sha);

        // 检查是否有未同步的本地修改，避免覆盖本地数据
        const pendingWrites = getPendingWrites();
        const payloadFileName = listNameToFileName(name);
        if (pendingWrites[payloadFileName]) {
          // 本地有待写入修改：从 localStorage 加载待写入数据到 UI
          const cached = getCachedFileContent(name);
          if (cached && cached.content !== jsonFile.content) {
            const cachedList = cached.content.trimStart().startsWith('{')
              ? parseJsonToList(cached.content, cached.sha)
              : parseMarkdownToList(cached.content, cached.sha);
            set((state) => ({ fileCache: { ...state.fileCache, [name]: cachedList } }));
          } else {
            // 没有额外缓存，先用远程数据展示
            set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
          }
          // 不覆盖 cacheFileContent，防止丢失待写入数据的 SHA
          sync.setUnsaved();
        } else {
          set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
          cacheFileContent(name, jsonFile.content, jsonFile.sha);
          sync.setSynced();
        }
        return list;
      }

      // 回退读取旧 .md 并立即迁移
      const mdFile = await getFileContent(sync.config!, mdPath);
      const list = parseMarkdownToList(mdFile.content, mdFile.sha);
      const newSha = await migrateListToJson(sync.config!, name, list, mdFile.sha);
      const jsonContent = serializeListToJson(list);
      set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
      cacheFileContent(name, jsonContent, newSha);
      sync.setSynced();
      return list;
    } catch {
      // 尝试本地缓存
      const cached = getCachedFileContent(name);
      if (cached) {
        const list = cached.content.trimStart().startsWith('{')
          ? parseJsonToList(cached.content, cached.sha)
          : parseMarkdownToList(cached.content, cached.sha);
        set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
        sync.setUnsaved();
      } else {
        sync.setUnsaved();
      }
    } finally {
      // 首次进入时，无论成功失败，只要已经尝试加载当前激活清单内容，就关闭遮罩
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

    // 1. 立即更新本地状态与待写入队列，UI 不阻塞
    set((state) => ({ fileCache: { ...state.fileCache, [name]: { ...list, rawContent: content } } }));
    addPendingWrite(fileName, content);
    // 同步写入 localStorage 缓存，防止页面刷新后待写入数据丢失。
    // sha 保持为本地已知的远端 sha（条件写入的并发控制依据），不用 list.sha（可能已过期）
    cacheFileContent(name, content, knownRemoteSha(name) ?? list.sha ?? '');
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

  fetchAllListsContent: async () => {
    const sync = useSyncStore.getState();
    if (!sync.ensureInitialized()) return;

    const { lists, fileCache } = get();
    const pendingWrites = getPendingWrites();
    const results = await Promise.allSettled(
      lists.map((list) => {
        // 待写入中的清单跳过远程拉取，防止覆盖本地修改
        if (pendingWrites[listNameToFileName(list.name)]) {
          return Promise.resolve();
        }
        if (fileCache[list.name]) {
          // 已有缓存则后台静默刷新，不阻塞视图渲染
          return get().fetchListContent(list.name);
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
