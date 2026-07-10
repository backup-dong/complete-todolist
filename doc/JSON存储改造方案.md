# JSON 存储改造完整方案

## 1. 项目背景与改造目标

### 1.1 现状

当前 Dong Todo 使用 Markdown 文件作为数据库存储任务数据。每个清单对应一个 `.md` 文件，任务结构通过自定义的 `scanner.ts` / `serializer.ts` 解析和生成。

### 1.2 改造动机

- Markdown 格式对结构标记（`### `、`## `、元数据行、子任务属性行）极度敏感，手写或复杂备注容易破坏解析。
- 元数据、子任务属性、任务备注之间缺乏明确的边界，round-trip 过程中可能出现数据丢失或错位。
- 序列化时需要全量重写文件，无法做局部更新，且格式规范化会抹除手写注释和空行。
- 多设备同步时，Markdown 的文本冲突难以自动合并。

### 1.3 改造目标

将清单文件从 `.md` 迁移到 `.json`，保留 `ParsedList` / `Task` / `Subtask` 等内存数据结构不变，仅替换持久化格式。新格式应具备：

- 明确的 schema 边界，内容不再与结构标记冲突。
- 稳定的任务 ID，避免重命名导致身份丢失。
- 向后兼容的迁移路径，老用户数据可平滑升级。
- 与现有 UI、stores、utils 的最小耦合改动。

---

## 2. 改造原则

1. **内存模型不变**：`ParsedList`、`Group`、`Task`、`Subtask` 等类型保持现有结构，UI 和 store 业务逻辑尽量不动。
2. **双格式共存，渐进迁移**：读取时同时支持 `.md` 和 `.json`；保存时统一写 `.json`；lazy 迁移，打开清单时自动转换并删除旧 `.md`。
3. **版本化 schema**：JSON 文件顶部保留 `version` 字段，便于未来 schema 升级。
4. **离线/多设备安全**：localStorage 缓存、pending writes、SHA map 增加格式版本标记；启动时检测并迁移。
5. **可回滚**：保留旧 Markdown parser 至少一个版本，确保迁移失败时可降级读取。

---

## 3. 新 JSON 格式设计

### 3.1 文件结构

文件路径：`{basePath}/{listName}.json`
归档路径：`{basePath}/_archived/{listName}.json`

### 3.2 Schema（V1）

```json
{
  "version": 1,
  "meta": {
    "name": "工作",
    "created": "2026-06-01",
    "archived": false
  },
  "groups": [
    {
      "name": "项目Alpha",
      "tasks": [
        {
          "id": "a1b2c3d4",
          "title": "竞品调研报告",
          "group": "项目Alpha",
          "meta": {
            "status": "active",
            "priority": "high",
            "created": "2026-06-28",
            "start": "2026-06-28",
            "due": "2026-07-10",
            "repeat": "weekly",
            "repeat_until": "2026-12-31",
            "repeat_count": null,
            "order": 1,
            "tags": ["调研", "P0"]
          },
          "subtasks": [
            {
              "text": "收集飞书任务功能列表",
              "level": 1,
              "completed": true,
              "completed_at": "2026-07-02T14:30:00+08:00",
              "start": null,
              "due": null,
              "note": null,
              "links": null,
              "children": []
            }
          ],
          "note": "需要调研飞书任务、Notion、Todoist 三家的功能对比",
          "links": [
            { "title": "飞书任务官方", "url": "https://example.com" }
          ],
          "completed_at": null,
          "duration": null
        }
      ]
    }
  ]
}
```

### 3.3 Schema 说明

| 字段 | 说明 |
|------|------|
| `version` | 整数，当前为 `1`。未来 schema 升级时递增。 |
| `meta` | 清单级元数据，对应现有 `ListMeta`。 |
| `groups` | 分组数组，对应现有 `Group[]`。 |
| `tasks.id` | 稳定任务 ID。改造时保留旧 hash，新增任务使用 UUIDv4。 |
| `tasks.meta` | 任务级元数据，对应 `TaskMeta`。 |
| `tasks.note` | 仍然可以是 Markdown 字符串，但不再参与结构解析。 |
| `tasks.subtasks` | 嵌套子任务数组，`children` 支持递归。 |
| `tasks.completed_at` / `duration` | 显式记录完成时间和耗时，不再依赖 `🏁` 行解析。 |

### 3.4 与现有类型的映射

```ts
interface JsonListFile {
  version: number;
  meta: ListMeta;
  groups: Group[];
}
```

`ParsedList` 可继续复用，`rawContent` 字段改为存储原始 JSON 字符串。

---

## 4. 详细改造步骤

### 步骤 1：新增 JSON 解析/序列化模块

**新建文件：**

- `src/parser/jsonParser.ts`
- `src/parser/jsonSerializer.ts`

**`jsonParser.ts` 职责：**

```ts
export function parseJsonToList(content: string, sha?: string): ParsedList;
export function inferJsonVersion(content: string): number;
```

- 调用 `JSON.parse` 得到 `JsonListFile`。
- 校验 `version` 字段。
- 对缺失字段提供默认值（如 `meta.archived` 默认 `false`）。
- 返回 `ParsedList`，`rawContent` 为输入的 JSON 字符串。

**`jsonSerializer.ts` 职责：**

```ts
export function serializeListToJson(list: ParsedList): string;
export { normalizeTask } from './serializer'; // 复用
```

- 将 `ParsedList` 序列化为带 2 空格缩进的 JSON 字符串。
- 保留 `normalizeTask` / `inferStatus` 业务逻辑。

**保留旧模块：**

- `src/parser/scanner.ts` 和 `src/parser/serializer.ts` 暂时保留，用于读取和迁移旧 `.md` 文件。
- 新增 `src/parser/index.ts` 统一导出，便于上层切换：

```ts
export { parseJsonToList } from './jsonParser';
export { serializeListToJson } from './jsonSerializer';
export { parseMarkdownToList, inferStatus } from './scanner';
export { serializeList as serializeMarkdownList, normalizeTask } from './serializer';
```

### 步骤 2：调整类型定义

**文件：** `src/types/index.ts`

- `ParsedList.rawContent` 保持为 `string`，语义改为“原始文件内容（JSON 或 Markdown）”。
- 可选：在 `TaskMeta` 中保留 `id` 字段作为稳定标识（如果之前没有）。
- 新增类型：

```ts
export interface JsonListFile {
  version: number;
  meta: ListMeta;
  groups: Group[];
}
```

### 步骤 3：改造 GitHub Client

**文件：** `src/github/client.ts`

- 将 `listMarkdownFiles` 重命名为 `listJsonFiles`，过滤条件从 `.endsWith('.md')` 改为 `.endsWith('.json')`。
- 但为了迁移期双格式共存，建议新增一个通用函数：

```ts
export async function listFilesByExtension(
  config: GithubConfig,
  extension: '.md' | '.json',
  subPath?: string,
): Promise<Pick<GitHubFile, 'name' | 'path' | 'sha'>[]>;
```

- `getFileContent`、`writeFileContent`、`deleteFile` 保持不变，它们只处理字符串。

### 步骤 4：改造 listsStore

**文件：** `src/stores/listsStore.ts`

这是改造核心。主要改动点：

#### 4.1 文件名处理

```ts
const LEGACY_EXT = '.md';
const NEW_EXT = '.json';

function listNameToFileName(name: string): string {
  return `${name}${NEW_EXT}`;
}

function fileNameToListName(fileName: string): string {
  return fileName.replace(/\.(md|json)$/, '');
}
```

#### 4.2 fetchLists：双格式列表 + 去重

```ts
fetchLists: async () => {
  const sync = useSyncStore.getState();
  if (!sync.ensureInitialized()) return;

  sync.setSyncing();
  try {
    const mdFiles = await listFilesByExtension(sync.config!, '.md');
    const jsonFiles = await listFilesByExtension(sync.config!, '.json');
    const archivedMdFiles = await listFilesByExtension(
      sync.config!, '.md', '_archived'
    ).catch(() => []);
    const archivedJsonFiles = await listFilesByExtension(
      sync.config!, '.json', '_archived'
    ).catch(() => []);

    // 同名 .md 和 .json 共存时，以 .json 为准，.md 标记为待迁移
    const allFiles = [...mdFiles, ...jsonFiles, ...archivedMdFiles, ...archivedJsonFiles];
    const latestByName = new Map<string, { file: typeof allFiles[0]; isJson: boolean }>();

    for (const file of allFiles) {
      const name = fileNameToListName(file.name);
      const isJson = file.name.endsWith('.json');
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
    // 记录需要迁移的 .md 文件名
    const pendingMigrations = [...mdFiles, ...archivedMdFiles]
      .filter((f) => latestByName.get(fileNameToListName(f.name))?.isJson === false)
      .map((f) => fileNameToListName(f.name));
    set({ lists: listMetas, pendingMigrations });
    sync.setSynced();
  } catch (err) {
    console.error('fetchLists failed', err);
    sync.setUnsaved();
  }
}
```

#### 4.3 fetchListContent：根据扩展名选择解析器

```ts
fetchListContent: async (name) => {
  const sync = useSyncStore.getState();
  if (!sync.ensureInitialized()) return null;

  const jsonPath = filePath(config, name, '.json');
  const mdPath = filePath(config, name, '.md');

  try {
    sync.setSyncing();

    // 优先尝试读取 .json
    const jsonFile = await getFileContent(sync.config!, jsonPath).catch(() => null);
    if (jsonFile) {
      const list = parseJsonToList(jsonFile.content, jsonFile.sha);
      set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
      cacheFileContent(name, jsonFile.content, jsonFile.sha);
      sync.setSynced();
      return list;
    }

    // 回退读取旧 .md 并立即迁移
    const mdFile = await getFileContent(sync.config!, mdPath);
    const list = parseMarkdownToList(mdFile.content, mdFile.sha);
    await migrateListToJson(name, list, mdFile.sha);
    return list;
  } catch {
    // 本地缓存兜底
    const cached = getCachedFileContent(name);
    if (cached) {
      const list = cached.content.trimStart().startsWith('{')
        ? parseJsonToList(cached.content, cached.sha)
        : parseMarkdownToList(cached.content, cached.sha);
      set((state) => ({ fileCache: { ...state.fileCache, [name]: list } }));
      sync.setUnsaved();
      return list;
    }
    sync.setUnsaved();
    return null;
  }
}
```

#### 4.4 saveListContent：统一写 JSON

```ts
saveListContent: async (name, list) => {
  const sync = useSyncStore.getState();
  const content = serializeListToJson(list);
  const fileName = listNameToFileName(name);

  set((state) => ({ fileCache: { ...state.fileCache, [name]: { ...list, rawContent: content } } }));
  addPendingWrite(fileName, content);
  sync.setUnsaved();

  if (!sync.ensureInitialized() || sync.status === 'offline') return;

  triggerDebouncedSync(name, content, fileName, sync.config!);
}
```

#### 4.5 迁移辅助函数

```ts
async function migrateListToJson(
  config: GithubConfig,
  name: string,
  list: ParsedList,
  oldMdSha?: string,
): Promise<void> {
  const jsonContent = serializeListToJson(list);
  const jsonPath = filePath(config, name, '.json');
  const mdPath = filePath(config, name, '.md');

  // 写入 .json
  await writeFileContent(config, jsonPath, jsonContent);
  // 删除旧 .md
  if (oldMdSha) {
    await deleteFile(config, mdPath, oldMdSha);
  }
  // 更新本地缓存
  cacheFileContent(name, jsonContent);
}
```

#### 4.6 createList / deleteList / renameList

- `createList`：直接写 `.json`。
- `deleteList`：同时尝试删除 `.md` 和 `.json`。
- `renameList`：创建 `.json` 新文件，删除旧 `.md` 和旧 `.json`。

### 步骤 5：改造 tasksStore

**文件：** `src/stores/tasksStore.ts`

- `tasksStore` 主要消费 `ParsedList`，不直接依赖 Markdown。
- 需要检查是否有直接调用 `serializeList` 的地方，改为 `serializeListToJson`。
- `normalizeTask` 可以继续复用。

### 步骤 6：改造 localStorage 缓存与 pending writes

**文件：** `src/utils/storage.ts`

#### 6.1 增加格式版本标记

```ts
const STORAGE_FORMAT_VERSION = 'dong-todo:format-version';

export function getStorageFormatVersion(): number {
  return getJson<number>(STORAGE_FORMAT_VERSION, 0);
}

export function setStorageFormatVersion(version: number): void {
  setJson(STORAGE_FORMAT_VERSION, version);
}
```

版本 `0` 表示旧 Markdown 格式，`1` 表示 JSON 格式。

#### 6.2 启动时缓存迁移

在 `syncStore` 初始化或 `listsStore.fetchLists` 之前，执行：

```ts
function migrateLocalStorageCache(): void {
  const currentVersion = getStorageFormatVersion();
  if (currentVersion >= 1) return;

  // 清空旧的 file 缓存（因为格式可能混杂 .md/.json）
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('dong-todo:file:')) {
      localStorage.removeItem(key);
    }
  }
  // pending writes 在 pushPending 时由 syncStore 按文件名重新解析
  localStorage.removeItem('dong-todo:sha-map');
  setStorageFormatVersion(1);
}
```

#### 6.3 pending writes 处理

`getPendingWrites()` 目前返回 `Record<fileName, content>`。content 可能是旧 Markdown 或新 JSON。`syncStore.pushPending()` 在推送前应检查：

```ts
function normalizePendingWriteContent(fileName: string, content: string): string {
  if (fileName.endsWith('.json')) return content;
  // 旧 .md pending write，需要转换为 JSON
  if (fileName.endsWith('.md')) {
    const list = parseMarkdownToList(content);
    return serializeListToJson(list);
  }
  return content;
}
```

但更简单的做法是：升级后，`listsStore.saveListContent` 统一写 `.json`，pending writes 里的 key 自然变成 `.json`。只有遗留的 pending writes 需要迁移，可在 `migrateLocalStorageCache` 中一并转换。

### 步骤 7：改造 syncStore

**文件：** `src/stores/syncStore.ts`

- 在初始化时调用 `migrateLocalStorageCache()`。
- `pushPending()` 推送前，检查 pending writes 中的 `.md` 项并转换为 `.json`。
- SHA 轮询时缓存的 `sha-map` 文件名自然变为 `.json`。

### 步骤 8：新增/改造测试

#### 8.1 Parser 测试

**文件：** `src/parser/parser.test.ts`

- 重命名为 `src/parser/jsonParser.test.ts` 或保留原文件新增 `jsonParser.test.ts`。
- 新增 JSON round-trip 测试：
  - 完整清单解析与序列化。
  - 子任务嵌套、note、link、completed_at 保留。
  - 空数组、空分组、缺失字段默认值。
  - 版本号校验。

#### 8.2 listsStore 行为测试

- 如果已有 store 测试，补充：
  - `.md` 文件存在时能否正确读取并迁移。
  - `.md` 和 `.json` 同名时优先 `.json`。
  - 保存后生成 `.json`。

#### 8.3 E2E 测试

**文件：** `e2e-test.py`

- 将 mock 文件扩展名从 `.md` 改为 `.json`。
- 断言内容时使用 `json.loads()` 解析后检查字段，而不是字符串包含。
- 保留一个旧 `.md` 迁移场景的测试用例。

---

## 5. 数据迁移方案

### 5.1 远程仓库迁移

采用 **lazy migration（懒迁移）**：

1. `fetchLists` 同时拉取 `.md` 和 `.json` 文件列表。
2. 对于每个清单名：
   - 如果存在 `.json`，以 `.json` 为准。
   - 如果不存在 `.json`，仅存在 `.md`，在 `fetchListContent` 时读取 `.md`，调用旧 parser 解析，然后立即写回 `.json` 并删除 `.md`。
3. 这样不需要一次性处理整个仓库，避免大仓库超时或迁移失败导致全量数据损坏。

### 5.2 本地缓存迁移

1. 启动时检查 `dong-todo:format-version`。
2. 如果版本低于 `1`：
   - 清空所有 `dong-todo:file:*` 缓存。
   - 清空 `dong-todo:sha-map`。
   - 转换 `dong-todo:pending-writes` 中的 `.md` 内容为 `.json`。
   - 设置版本为 `1`。

### 5.3 Pending Writes 迁移

```ts
function migratePendingWrites(): void {
  const writes = getPendingWrites();
  const migrated: Record<string, { content: string; timestamp: string }> = {};

  for (const [fileName, content] of Object.entries(writes)) {
    if (fileName.endsWith('.json')) {
      migrated[fileName] = { content, timestamp: new Date().toISOString() };
    } else if (fileName.endsWith('.md')) {
      const list = parseMarkdownToList(content);
      const jsonContent = serializeListToJson(list);
      const jsonName = fileName.replace(/\.md$/, '.json');
      migrated[jsonName] = { content: jsonContent, timestamp: new Date().toISOString() };
    }
  }

  setJson('dong-todo:pending-writes', migrated);
}
```

### 5.4 多设备与离线场景

- **设备 A 已升级，设备 B 未升级**：设备 B 继续读写 `.md`；设备 A 读取时会优先 `.json`，无 `.json` 时读 `.md` 并迁移。最终设备 A 会把 `.md` 删除，设备 B 再写 `.md` 时会产生冲突。建议升级后所有设备尽快同步升级，或在 `.md` 被删除后设备 B 再写时自动转 JSON。
- **离线 pending writes**：用户在旧版本离线时产生的 `.md` pending writes，升级后首次上线时转换为 `.json` 再推送。

---

## 6. 代码改动清单

| 文件 | 改动内容 | 优先级 |
|------|----------|--------|
| `src/parser/jsonParser.ts` | 新建 JSON 解析器 | 高 |
| `src/parser/jsonSerializer.ts` | 新建 JSON 序列化器 | 高 |
| `src/parser/index.ts` | 统一导出旧/新 parser | 高 |
| `src/types/index.ts` | 增加 `JsonListFile` 类型 | 高 |
| `src/github/client.ts` | `listMarkdownFiles` 改为按扩展名列表 | 高 |
| `src/stores/listsStore.ts` | 双格式读取、统一 JSON 保存、lazy 迁移 | 高 |
| `src/stores/syncStore.ts` | 启动格式迁移、pending writes 转换 | 高 |
| `src/stores/tasksStore.ts` | 检查并替换 `serializeList` 调用 | 中 |
| `src/utils/storage.ts` | 增加 `format-version`、缓存清理、pending writes 迁移 | 高 |
| `src/parser/parser.test.ts` | 新增 JSON round-trip 测试 | 高 |
| `e2e-test.py` | 改 `.md` 为 `.json`，用 JSON 断言 | 中 |
| `doc/Markdown存储与解析风险登记.md` | 更新状态为“已迁移” | 低 |

---

## 7. 风险与回滚策略

### 7.1 主要风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| JSON schema 设计不合理 | 中 | 保留 `version` 字段；改造前先输出样例文件评审。 |
| 迁移过程中数据丢失 | 高 | lazy 迁移，先写 `.json` 再删 `.md`；保留旧 parser 至少一个版本。 |
| 多设备格式不一致 | 高 | 升级时清空本地缓存；尽快让所有设备升级；读取时优先 `.json`。 |
| 离线 pending writes 混乱 | 中 | 启动时统一转换 pending writes。 |
| 用户手动编辑 JSON 引入语法错误 | 中 | JSON 语法错误可通过 `JSON.parse` 捕获并提示；相比 Markdown 更容易校验。 |
| GitHub 写入失败导致 `.md` 已删、`.json` 未写 | 高 | 迁移函数中先确认 `.json` 写入成功再删除 `.md`。 |

### 7.2 回滚策略

- **代码回滚**：保留旧 `scanner.ts` / `serializer.ts`，如果 JSON 改造出现严重 bug，可快速切回 Markdown 读写。
- **数据回滚**：lazy 迁移不会一次性删除所有 `.md`。如果发现问题，可手动将 `.json` 回写为 `.md`（需补充一个反向迁移脚本）。
- **版本回滚**：如果用户升级后想降级，只要 `.md` 还在，旧版本就能读取。因此建议升级后不要立刻删除 `.md`，而是在所有设备都升级并同步完成后再批量删除。

---

## 8. 时间估算

| 阶段 | 预估时间 | 说明 |
|------|----------|------|
| 方案设计与 JSON Schema 评审 | 0.5 天 | 输出样例，团队/自己 review。 |
| JSON parser/serializer 开发 | 1 天 | 含边界默认值、version 校验。 |
| GitHub client / listsStore / syncStore 改造 | 2 天 | 双格式读取、lazy 迁移、缓存清理。 |
| tasksStore 与 UI 适配 | 0.5 天 | 基本无改动，主要是检查引用。 |
| 测试重写与补充 | 1.5 天 | parser 测试、e2e 测试、store 行为测试。 |
| 多设备/离线场景测试 | 1 天 | 模拟离线、pending writes、多设备冲突。 |
| 文档更新与回滚脚本 | 0.5 天 | 更新 CLAUDE.md、风险登记文档。 |
| **总计** | **约 7 天** | 单人全职，含测试。 |

---

## 9. 建议实施顺序

1. **先做最小验证**：新建 `jsonParser.ts` / `jsonSerializer.ts`，写几个 JSON round-trip 测试，确认 schema 设计合理。
2. **改造 listsStore 读取路径**：实现双格式读取 + lazy 迁移，但不改保存路径。此时应用可读 `.md` 和 `.json`，仍写 `.md`。
3. **切换保存路径**：统一写 `.json`，并在保存成功后删除旧 `.md`。
4. **加入本地缓存迁移**：处理 localStorage、pending writes、sha-map。
5. **跑通 e2e 测试**：将 e2e 改为 JSON 断言，补充旧 `.md` 迁移用例。
6. **灰度观察**：保留旧 parser 一个版本，观察是否有异常，再决定是否删除 Markdown 相关代码。

---

## 10. 附录：新旧格式对比示例

### 改造前（Markdown）

```markdown
# 工作

<!-- todo:list-meta
  created: 2026-06-01
  archived: false
-->

## 项目Alpha

### 竞品调研报告
status: active | priority: high | due: 2026-07-10 | created: 2026-06-28

- [x] 收集飞书任务功能列表 (2026-07-02T14:30:00+08:00)
- [ ] 收集 Notion 功能列表

**备注**
需要调研飞书任务、Notion、Todoist 三家的功能对比

---
```

### 改造后（JSON）

```json
{
  "version": 1,
  "meta": {
    "name": "工作",
    "created": "2026-06-01",
    "archived": false
  },
  "groups": [
    {
      "name": "项目Alpha",
      "tasks": [
        {
          "id": "abc123",
          "title": "竞品调研报告",
          "group": "项目Alpha",
          "meta": {
            "status": "active",
            "priority": "high",
            "created": "2026-06-28",
            "due": "2026-07-10"
          },
          "subtasks": [
            {
              "text": "收集飞书任务功能列表",
              "level": 1,
              "completed": true,
              "completed_at": "2026-07-02T14:30:00+08:00",
              "children": []
            },
            {
              "text": "收集 Notion 功能列表",
              "level": 1,
              "completed": false,
              "children": []
            }
          ],
          "note": "需要调研飞书任务、Notion、Todoist 三家的功能对比",
          "links": [],
          "completed_at": null,
          "duration": null
        }
      ]
    }
  ]
}
```

---

_文档版本：v1.0_  
_最后更新：2026-07-10_
