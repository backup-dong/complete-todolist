# 待办系统详细设计（基于 JSON + GitHub Repo）

版本：v2.0 | 日期：2026-07-11 | 状态：基于 JSON 存储，兼容旧 Markdown 迁移

---

## 变更摘要（v2.0 —— JSON 存储改造）

与 v1.2 相比，v2.0 将持久化格式从 Markdown 迁移到 JSON，内存模型与 UI 交互基本保持不变：

1. **持久化格式改为 JSON**：每个清单对应一个 `.json` 文件，结构由 `JsonListFile` schema 定义。
2. **双格式共存与懒迁移**：读取时同时支持 `.md` 和 `.json`；保存时统一写 `.json`；首次访问旧 `.md` 时自动转换并删除原文件。
3. **稳定的任务 ID**：JSON 中任务带 `id` 字段；旧数据迁移时保留原 hash，新增任务使用 UUIDv4。
4. **本地缓存版本化**：`localStorage` 增加 `dong-todo:format-version`，启动时自动清理旧缓存并转换 pending writes。
5. **解析层升级**：新增 `jsonParser.ts` / `jsonSerializer.ts` 为主路径；旧 `scanner.ts` / `serializer.ts` 保留至少一个版本作为迁移 fallback。
6. **UI 继续简化**：去掉中间区域顶部栏的「新建分组」按钮，分组创建统一在侧边栏；去掉底部新建输入框左侧的分组名称展示。
7. **新建任务滚动高亮**：创建任务后自动滚动到任务位置并播放脉冲高亮动画。
8. **保留 v1.2 全部功能**：弹窗编辑、状态多选过滤、批量删除、子任务拖拽、主题切换、待写入队列、冲突提示条、周报导出、待办视图等。

---

## 一、产品概述

一个纯前端 Web SPA 待办系统，数据以 JSON 文件形式存储于 GitHub 私有仓库，通过 GitHub API 进行读写同步。

### 核心设计理念

- **JSON 即数据库**：清单文件为结构化的 JSON，便于程序解析、校验与版本升级；同时保留 Markdown 作为备注内容的渲染格式。
- **无后端依赖**：数据通过 GitHub API 直接在前端和仓库之间传输，不涉及任何后端服务器。
- **离线友好**：浏览器缓存 + 本地存储作为加速层，支持断网时的基本读写，联网后自动同步。
- **向后兼容**：老用户的 Markdown 数据无需手动迁移，打开清单时自动转换。

### 用户画像

- 主用户：本人（产品经理）。
- 使用场景：桌面浏览器为主，配合浏览器 Notification API 做到期提醒。
- 核心诉求：轻量、导出方便、数据在自己手里、跨设备同步。

---

## 二、数据结构（JSON 格式规范）

### 2.1 整体目录结构

```
todo/
├── 工作.json                # 清单 = 一个 JSON 文件
├── 学习.json
├── 个人.json
├── 生活.json
└── _archived/               # 已归档清单（结构与主文件一致）
    ├── 工作.json
    └── 学习.json
```

- **一个清单 = 一个文件**，文件名即清单名。
- 不支持嵌套目录做清单（如 `工作/项目A.json`），分组由文件内的 `groups` 承担。
- `_archived/` 目录专门存放已被用户归档的**清单**（整个文件标记 `meta.archived: true`），不是单条任务归档。
- 旧版 `.md` 文件在迁移完成后会被删除。

### 2.2 清单文件格式（Schema V1）

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

### 2.3 字段说明

#### 清单文件顶层 (`JsonListFile`)

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `version` | `integer` | 是 | `1` | 文件格式版本，当前固定为 `1`。 |
| `meta` | `object` (`ListMeta`) | 是 | - | 清单级元数据。 |
| `groups` | `array` (`Group[]`) | 是 | `[]` | 分组数组。 |

#### 清单元数据 (`ListMeta`)

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | `string` | 是 | `"未命名清单"` | 清单显示名称，对应旧 Markdown 中的 `# 标题`。 |
| `created` | `string` (ISO 8601 date) | 是 | 当前日期 | 清单创建日期，格式 `yyyy-MM-dd`。 |
| `archived` | `boolean` | 是 | `false` | 是否归档。归档清单应存放在 `_archived/` 目录。 |

#### 分组 (`Group`)

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | `string` | 是 | `"默认分组"` | 分组名称。当文件中没有分组时，解析器会自动注入一个默认分组。 |
| `tasks` | `array` (`Task[]`) | 是 | `[]` | 该分组下的任务数组。 |

#### 任务 (`Task`)

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | `string` | 是 | 自动生成 | 稳定任务标识。旧 `.md` 迁移时保留 `generateTaskId(title, created)` 的 hash；新增任务使用 UUIDv4。 |
| `title` | `string` | 是 | `""` | 任务标题。 |
| `group` | `string` | 是 | 所属分组名 | 冗余记录任务所属分组，便于扁平化查询与移动分组后定位。 |
| `meta` | `object` (`TaskMeta`) | 是 | - | 任务级元数据。 |
| `subtasks` | `array` (`Subtask[]`) | 是 | `[]` | 子任务数组，支持递归嵌套。 |
| `note` | `string` / `null` | 否 | `null` | 任务备注，允许是任意 Markdown 字符串，**不再参与结构解析**。 |
| `links` | `array` (`Link[]`) / `null` | 否 | `null` | 任务链接数组。 |
| `completed_at` | `string` (ISO 8601) / `null` | 否 | `null` | 任务完成时间。由 `normalizeTask` 在状态变为 `done` 时自动填充。 |
| `duration` | `string` / `null` | 否 | `null` | 耗时文字，例如 `"3d"`。由 `normalizeTask` 自动计算。 |

#### 任务元数据 (`TaskMeta`)

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `status` | `string` enum | 否 | 由子任务推断 | 取值：`pending`、`active`、`done`。 |
| `priority` | `string` enum | 是 | `"med"` | 取值：`high`、`med`、`low`。 |
| `created` | `string` (ISO 8601 date) | 是 | 当前日期 | 任务创建日期。 |
| `start` | `string` (ISO 8601 date) | 否 | - | 计划开始日期。 |
| `due` | `string` (ISO 8601 date) | 否 | - | 截止日期。 |
| `repeat` | `string` | 否 | - | 重复规则：`daily`、`weekly`、`monthly`、`weekdays` 或自定义逗号分隔的星期/日期。 |
| `repeat_until` | `string` (ISO 8601 date) | 否 | - | 重复截止日期。 |
| `repeat_count` | `integer` | 否 | - | 最大重复次数。 |
| `order` | `integer` | 否 | - | 同组内排序权重。 |
| `tags` | `array` (`string[]`) | 否 | - | 标签数组。 |

#### 子任务 (`Subtask`)

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `text` | `string` | 是 | `""` | 子任务文本。 |
| `level` | `integer` | 是 | `1` | 层级，取值 `1`、`2`、`3`，对应不同缩进。 |
| `completed` | `boolean` | 是 | `false` | 是否完成。 |
| `completed_at` | `string` (ISO 8601) / `null` | 否 | `null` | 完成时间。 |
| `start` | `string` (ISO 8601 date) / `null` | 否 | `null` | 开始日期。 |
| `due` | `string` (ISO 8601 date) / `null` | 否 | `null` | 截止日期。 |
| `note` | `string` / `null` | 否 | `null` | 子任务备注，允许含 `###`、`- [ ]` 等 Markdown 而不会被误解为结构标记。 |
| `links` | `array` (`Link[]`) / `null` | 否 | `null` | 子任务链接。 |
| `children` | `array` (`Subtask[]`) | 是 | `[]` | 嵌套子任务，递归结构。 |

#### 链接 (`Link`)

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `title` | `string` | 是 | - | 链接标题。 |
| `url` | `string` (URL) | 是 | - | 链接地址。 |

### 2.4 任务状态推断规则

`status` 字段由系统**自动维护**，序列化时始终写入当前推断值。推断规则如下：

| 场景 | 系统行为 |
|---|---|
| 该任务**没有子任务** | 状态为 `pending`；用户点击完成按钮 → 变为 `done` 并填充 `completed_at` / `duration`。 |
| 有子任务，**全部标记完成** | 状态为 `done`，填充 `completed_at` / `duration`。 |
| 有子任务，**部分完成** | 状态为 `active`，清空 `completed_at` / `duration`。 |
| 有子任务，**全部未完成** | 状态为 `pending`，清空 `completed_at` / `duration`。 |
| 已完成的任务，某子任务被取消 | 重新推断，回退到 `active` 或 `pending`，清空 `completed_at` / `duration`。 |

状态推断统一在 `normalizeTask`（`src/parser/serializer.ts`）中完成。

### 2.5 排序规则

- **拖拽排序**：任务 `meta.order` 为同组内排序权重。新任务默认取当前分组最小 `order - 1`，因此出现在分组顶部。
- **按截止时间**：按 `meta.due` 升序，无截止日期放最后。
- **按优先级**：高 → 中 → 低。

---

## 三、解析与序列化

### 3.1 模块职责

| 文件 | 职责 |
|---|---|
| `src/parser/jsonParser.ts` | 将 JSON 字符串解析为 `ParsedList`；校验 `version`；提供字段默认值。 |
| `src/parser/jsonSerializer.ts` | 将 `ParsedList` 序列化为带 2 空格缩进的 JSON 字符串。 |
| `src/parser/scanner.ts` | 旧 Markdown 解析器，仅用于读取和迁移旧 `.md` 文件。 |
| `src/parser/serializer.ts` | 旧 Markdown 序列化器；`normalizeTask` 仍被 JSON 序列化复用。 |
| `src/parser/index.ts` | 统一导出新旧解析器/序列化器。 |

### 3.2 解析流程

1. `listsStore.fetchListContent(name)` 优先请求 `.json` 文件。
2. 若 `.json` 存在，调用 `parseJsonToList(content, sha)`。
3. 若 `.json` 不存在但 `.md` 存在，调用 `parseMarkdownToList(content, sha)` 解析，然后立即写回 `.json` 并删除旧 `.md`。
4. 若都不存在，回退到 `localStorage` 缓存。

### 3.3 序列化流程

1. 任何任务/清单变更后，`listsStore.saveListContent(name, list)` 调用 `serializeListToJson(list)`。
2. `serializeListToJson` 先遍历所有任务并调用 `normalizeTask` 推断状态、完成时间、耗时。
3. 生成的 JSON 字符串存入 `fileCache[name].rawContent` 并推入 `pending-writes` 队列。
4. 联网时通过 GitHub API 写入 `.json` 文件。

---

## 四、持久化与同步

### 4.1 双格式读取、JSON 唯一写入

- `listsStore.fetchLists()` 同时拉取 `.md` 和 `.json` 文件列表。
- 同名文件共存时，**以 `.json` 为准**。
- `listsStore.saveListContent()` 永远写 `.json`。
- `createList` / `renameList` 直接操作 `.json`；`deleteList` 同时尝试删除 `.md` 和 `.json`。

### 4.2 Lazy 迁移（懒迁移）

1. `fetchLists` 发现某清单只有 `.md` 时，将其加入 `pendingMigrations`。
2. 用户打开该清单时，`fetchListContent` 读取 `.md`，解析为 `ParsedList`。
3. 调用 `migrateListToJson(name, list, oldMdSha)`：先写 `.json`，写入成功后再删 `.md`。
4. 更新本地缓存为 JSON 内容。

### 4.3 本地缓存迁移

启动时 `syncStore` 调用 `migrateLocalStorageCache()`：

1. 检查 `dong-todo:format-version`。
2. 若版本低于 `1`：
   - 清空所有 `dong-todo:file:*` 缓存。
   - 清空 `dong-todo:sha-map`。
   - 转换 `dong-todo:pending-writes` 中的 `.md` 项为 `.json`。
   - 设置版本为 `1`。

### 4.4 Pending Writes

- 离线或 API 失败时，序列化后的 JSON 内容存入 `dong-todo:pending-writes`，key 为 `.json` 文件名。
- 联网后 `syncStore.pushPending()` 依次推送。
- 旧 `.md` pending writes 在缓存迁移阶段已转换。

### 4.5 SHA 轮询与冲突

- 每 60 秒及页面重新可见时，`syncStore.pollSha()` 拉取远程文件 SHA 映射。
- 若本地缓存的 SHA 与远程不一致，显示 `ConflictBanner` 提示用户手动处理。
- 当前版本不会自动拉取变更内容，防止覆盖本地未同步的修改。

---

## 五、状态管理

状态继续按三个 Zustand store 拆分：

| Store | 文件 | 职责 |
|---|---|---|
| `syncStore` | `src/stores/syncStore.ts` | GitHub 配置、同步状态、SHA 轮询、pending writes 推送。 |
| `listsStore` | `src/stores/listsStore.ts` | 清单目录、`fileCache`、清单 CRUD、分组 CRUD、懒迁移。 |
| `tasksStore` | `src/stores/tasksStore.ts` | 当前清单的扁平任务列表、筛选/排序、选中任务、任务 CRUD。 |

### 5.1 关键接口变更

- `listsStore.saveListContent(name, list)` 内部改为 `serializeListToJson(list)`。
- `tasksStore.createTask(title, group)` 返回 `Promise<string | undefined>`，用于新建任务后的滚动高亮。

### 5.2 任务创建与选中

1. `ContentArea` 底部输入框提交后调用 `createTask(title, effectiveNewTaskGroup)`。
2. 新任务默认插入到所属分组最上方，`selectedTaskId` 自动设为新任务 id。
3. `ContentArea` 拿到返回的 id 后设置 `highlightedTaskId`，并在下一帧查询 DOM 执行 `scrollIntoView`。
4. 1.5s 后 `highlightedTaskId` 自动清除，脉冲高亮动画结束。

---

## 六、UI/UX 设计

### 6.1 布局

- **桌面端**：左侧固定侧边栏（清单、分组、待办视图），右侧内容区（顶部工具栏 + 任务列表 + 底部新建栏）。
- **移动端**：侧边栏变为抽屉；内容区顶部显示标题与进度。

### 6.2 顶部工具栏（ListHeader）

左侧：清单标题、进度条、当前分组徽章。
右侧：
- 导出周报
- 批量选择开关
- 排序切换：拖拽 / 截止 / 优先级

**v2.0 移除**：顶部「新建分组」按钮。分组创建统一在侧边栏。

### 6.3 底部新建栏（NewTaskBar）

- 输入框 + 「新建」按钮。
- 输入框 placeholder 为「新建任务...」。
- 新任务默认进入当前选中的分组；未选中分组时进入第一个分组。

**v2.0 移除**：输入框左侧的分组名称展示 div。

### 6.4 任务列表

- `drag` 模式下按分组渲染，支持同组内拖拽排序。
- `due` / `priority` 模式下渲染扁平列表。
- 任务卡片显示：标题、优先级、截止日期、重复规则、子任务进度、链接、子任务摘要。
- 已选中的任务带有主色边框与背景。
- 新建任务额外播放一次 `animate-task-highlight` 脉冲环动画。

### 6.5 任务编辑弹窗

- 点击任务卡片打开 `TaskEditorDialog`。
- 桌面端最大宽度 `max-w-4xl`，内部可滚动。
- 支持编辑标题、分组、优先级、开始/截止日期、重复规则、标签、备注、链接、子任务。
- 子任务编辑区为折叠面板，同一时刻最多展开一个子任务详情。

---

## 七、核心功能

### 7.1 清单管理

- 侧边栏显示全部清单，支持新建、重命名、删除、归档。
- 归档清单移入 `_archived/` 目录。

### 7.2 分组管理

- 分组创建、重命名、删除统一在侧边栏完成。
- 删除分组时，组内任务可选择移动到其他分组或一并删除。

### 7.3 任务 CRUD

- 创建：底部输入框或弹窗中复制。
- 编辑：弹窗编辑，保存后自动序列化。
- 删除：任务卡片悬停删除按钮或批量删除。
- 完成：点击状态图标；无子任务时直接完成，有子任务时依赖子任务状态推断。

### 7.4 子任务

- 支持最多 3 层嵌套（UI 默认展示 3 层，更深层自动折叠）。
- 子任务支持独立开始/截止日期、备注、链接。
- 任务详情弹窗中同层级子任务可拖拽排序。

### 7.5 搜索与过滤

- 搜索框按任务标题实时过滤。
- 状态过滤为多选下拉（Radix DropdownMenu），空数组表示全部。
- 优先级过滤、时间范围过滤。

### 7.6 排序

- 拖拽排序（默认）：按 `meta.order`。
- 按截止时间：`due` 升序。
- 按优先级：`high` → `med` → `low`。

### 7.7 周报导出

- 内容区顶部「导出周报」按钮。
- 按自然周导出当前清单已完成事项。
- 每个分组内按任务自身或子任务的最新本周完成时间升序排列。
- 包含下周计划：未完成的逾期任务与下周到期任务，按逾期优先、到期日升序排列，逾期任务标注逾期天数并附加备注提醒。
- 无完成事项但有计划时标题自动切换为「工作周报」。

### 7.8 待办视图

- 侧边栏「今天 / 本周 / 全部 / 高优先级」。
- 跨所有清单聚合任务，先按来源清单分组，再按分组显示。
- 点击任务打开编辑弹窗。

### 7.9 周期性任务

- 支持 `daily`、`weekly`、`monthly`、`weekdays`、自定义星期（`mon,wed,fri`）、自定义月日（`1,15`）。
- 完成任务后，若存在重复规则，自动推进到下一个到期日。

### 7.10 主题

- 浅色 / 深色 / 跟随系统，基于 CSS 变量与 `dark` class 切换。

---

## 八、技术栈

| 层级 | 选型 |
|---|---|
| 构建工具 | Vite 6 |
| 框架 | React 19 + TypeScript 5 |
| 路由 | React Router DOM 7 |
| 状态 | Zustand 5 |
| 样式 | Tailwind CSS 4 |
| 拖拽 | @dnd-kit/core + @dnd-kit/sortable |
| 日期 | date-fns |
| Markdown 渲染 | react-markdown + remark-gfm（仅用于备注） |
| GitHub API | Octokit 4 |
| PWA | vite-plugin-pwa |

---

## 九、首次使用与部署

### 9.1 首次使用

1. 打开应用后自动跳转 `/settings`。
2. 输入 GitHub Token（Fine-grained PAT，需要 Contents: Read and write 权限）。
3. 输入仓库所有者、仓库名、存储路径（默认 `todo`）。
4. 点击「保存并同步」。

### 9.2 部署

1. 创建 GitHub 私有仓库存放 JSON 数据。
2. 创建另一仓库或 `gh-pages` 分支托管前端构建产物。
3. 如需子路径部署，修改 `vite.config.ts` 中的 `base`。

---

## 十、风险与回滚策略

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| JSON schema 设计不合理 | 中 | 保留 `version` 字段；改造前已输出样例文件评审。 |
| 迁移过程中数据丢失 | 高 | lazy 迁移，先写 `.json` 再删 `.md`；保留旧 parser 至少一个版本。 |
| 多设备格式不一致 | 高 | 升级时清空本地缓存；尽快让所有设备升级；读取时优先 `.json`。 |
| 离线 pending writes 混乱 | 中 | 启动时统一转换 pending writes。 |
| 用户手动编辑 JSON 引入语法错误 | 中 | JSON 语法错误可通过 `JSON.parse` 捕获并提示。 |
| GitHub 写入失败导致 `.md` 已删、`.json` 未写 | 高 | 迁移函数中先确认 `.json` 写入成功再删除 `.md`。 |

### 回滚

- **代码回滚**：保留旧 `scanner.ts` / `serializer.ts`，可快速切回 Markdown 读写。
- **数据回滚**：lazy 迁移不会一次性删除所有 `.md`；如发现问题，可手动将 `.json` 回写为 `.md`。
- **版本回滚**：升级后不要立刻删除 `.md`，待所有设备同步完成后再批量清理。

---

## 十一、决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-07-11 | 持久化格式从 Markdown 迁移到 JSON | Markdown 对结构标记敏感，难以校验和局部更新；JSON 更稳定且便于版本升级。 |
| 2026-07-11 | 保留旧 Markdown parser 作为迁移 fallback | 确保老用户数据可平滑升级，降低回滚风险。 |
| 2026-07-11 | 分组创建从顶部栏移到侧边栏 | 减少内容区顶部按钮数量，统一分组管理入口。 |
| 2026-07-11 | 新建任务后滚动并高亮 | 提升新建任务的可见性，避免用户找不到刚创建的任务。 |

---

_文档版本：v2.0_  
_最后更新：2026-07-11_
