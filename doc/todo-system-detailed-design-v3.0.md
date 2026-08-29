# 待办系统详细设计 v3.0（JSON v2 · 扁平化数据模型）

> 本文档描述 **Dong Todo** 当前实现（JSON v2 数据格式时代）的完整详细设计。
> 相比 v2.0 文档（嵌套子任务设计稿），v3.0 是**已落地实现**的定稿版本：
> 持久化格式采用「扁平任务数组 + `parentId` 表达层级」的 JSON Schema V2，
> 并配套本地迁移 CLI（`scripts/migrate-v1-to-v2.mjs`）、状态级联推断、
> 重复任务 + 假日库、离线 pending writes 等能力。

## 变更摘要（v3.0 —— JSON v2 扁平化数据模型定稿）

| 维度 | v2.0 设计稿 | v3.0 实现（本文） |
| --- | --- | --- |
| 持久化格式 | Markdown 文本 + 结构解析；JSON 改造设计（嵌套 `subtasks`） | JSON 文件，`"version": 2`，任务**扁平数组** + `parentId` 表达层级 |
| 结构解析 | 依赖 部分 Markdown 注入（`#`/`-`/`##`） | 纯 `JSON.parse` + 逐字段归一化，无文本结构解析 |
| 子任务 | 嵌套递归数组 | 扁平数组，层级完全由 `parentId` 决定；树形仅内存派生 |
| 完成语义 | `meta.status: done` | `meta.status` + `completed_at` + `duration`（可派生、可显式） |
| 迁移 | Lazy 迁移（读取时转换） | 本地 CLI 一次性迁移（`npm run migrate:v2 -- --dir <repo>`），旧版 v1 文件被解析器拒绝并提示 |
| 重复任务 | 基础 daily/weekly | daily / weekly / monthly / yearly / weekdays / 自定义星期 / 每月多日 + `repeat_until` + 假日跳过（工作日规则） |
| 待办视图 | 单清单聚合 | 跨清单聚合（`sourceList` 标记），支持 start-week / all / high / calendar 四种视图 |
| 离线 | — | 失败写入进 `dong-todo:pending-writes`，`online` 事件自动 flush |
| 同步 | SHA 轮询 | SHA 轮询 + 仅推送 `version === 2` 的版本守卫 |

## 一、产品概述

### 核心设计理念

- **JSON 即数据库**：每个清单是一个 `.json` 文件，存放于 GitHub 私有仓库的
  指定路径（默认 `todo/`）下；应用通过 GitHub REST API（Octokit）读写，无后端。
- **纯前端单页应用**：React 19 + Vite，所有数据服务能力均由浏览器直连 GitHub。
- **文件即清单**：文件名（不含 `.json`）即清单名；`meta.name` 为显示名。
- **层级扁平化**：任务与子任务统一存在于 `tasks` 数组，层级 = 数据，
  不做递归嵌套，序列化无损、合并排序简单。
- **状态可推断**：任何任务的 `status`/`completed_at`/`duration`
  可由自身 + 全部后代推导，不存在「数据与展示不一致」的中间态。

### 用户画像与场景

- 个人任务管理：多清单（工作 / 生活 / 学习）、分组、子任务拆解。
- 移动端优先：PWA 安装、离线可读缓存、待办提醒（本地 Notification）。
- 数据自主权：数据放自己的 GitHub 仓库，应用可随时替换。

## 二、数据结构（JSON Schema V2）

> 本章是全文核心。所有读写路径（解析、序列化、迁移工具、GitHub 同步）都严格遵循本节 Schema。

### 2.1 仓库目录结构

```
<GitHub 私有仓库>
└── <basePath>/            # 默认 "todo"，可在设置中修改
    ├── 工作.json          # 清单文件，文件名（去掉 .json）= 清单名
    ├── 生活.json
    └── ...
```

- 清单发现：`listFilesByExtension(config, '.json', basePath)` 列出 basePath 下的 JSON 文件；文件名（去 `.json`）即清单名，`meta.name` 是显示名（可不同）。
- 当前仅扫描 basePath 一层目录，不递归子目录。
- 应用写回时会重新序列化整个文件（归一化排序与推断字段），因此手改的 JSON 可能被规范化重写。
- `basePath` 为空时即仓库根目录。清单名不合法时（如含 `/`）会在建清单时拦截。

### 2.2 清单文件格式（完整示例）

`"version": 2`（`JSON_FORMAT_VERSION`）。任务全部**扁平**排列在各分组 `tasks` 数组中；
层级仅由 `parentId` 表达；顺序由 `meta.order`（同父级内 1 起）表达。

```json
{
  "version": 2,
  "meta": {
    "name": "工作",
    "created": "2026-07-01",
    "archived": false
  },
  "groups": [
    {
      "name": "项目Alpha",
      "tasks": [
        {
          "id": "a1b2c3d4",
          "title": "竞品调研报告",
          "parentId": null,
          "group": "项目Alpha",
          "meta": {
            "status": "active",
            "priority": "high",
            "created": "2026-06-28",
            "start": "2026-07-01T09:00:00+08:00",
            "due": "2026-07-10",
            "repeat": "weekly",
            "repeat_until": "2026-12-31",
            "order": 1
          },
          "note": "需要调研飞书任务、Notion、Todoist 三家的功能对比",
          "reflection": null,
          "reminders": [ { "at": "2026-07-09T18:00:00+08:00" } ],
          "links": [ { "title": "飞书任务官方", "url": "https://example.com" } ],
          "files": null,
          "completed_at": null,
          "duration": null
        },
        {
          "id": "b2c3d4e5",
          "title": "收集飞书任务功能列表",
          "parentId": "a1b2c3d4",
          "group": "项目Alpha",
          "meta": {
            "status": "done",
            "priority": "med",
            "created": "2026-06-28",
            "order": 2
          },
          "note": null,
          "reflection": null,
          "reminders": null,
          "links": null,
          "files": null,
          "completed_at": "2026-07-02T14:30:00+08:00",
          "duration": "4d"
        }
      ]
    }
  ]
}
```

### 2.3 字段说明

#### 清单文件顶层（`JsonListFile`）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `version` | number | 是 | 固定 `2`，决定解析器行为；`1` 被拒并提示迁移 |
| `meta` | `ListMeta` | 是 | 清单元数据 |
| `groups` | `Group[]` | 是 | 分组数组；解析时若缺失/为空则补一个「默认分组」 |

#### 清单元数据（`ListMeta`）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 否 | 显示名，缺省「未命名清单」 |
| `created` | string | 否 | 创建日期 `yyyy-MM-dd`，缺省今天 |
| `archived` | boolean | 否 | 归档标记，缺省 `false` |

#### 分组（`Group`）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 分组名；同名分组会被合并（视为同一分组） |
| `tasks` | `Task[]` | 是 | **扁平**任务数组（含本组所有层级的任务） |

#### 任务（`Task`）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 稳定 ID；基于标题+创建时间的确定性 hash（缺失时生成并会在写回时补齐） |
| `title` | string | 是 | 任务标题 |
| `parentId` | string \| null | 是 | 父任务 id；`null` 表示顶层任务。指向不存在的 id 即视为顶层 |
| `group` | string | 是 | 所属分组名（归一化后与所在 Group.name 一致） |
| `meta` | `TaskMeta` | 是 | 任务元数据 |
| `note` | string \| null | 否 | Markdown 文本备注；仅作字符串显示，**不参与结构解析** |
| `reflection` | string \| null | 否 | 感想/复盘，与 note 平级 |
| `reminders` | `Reminder[]` \| null | 否 | 提醒时间列表 |
| `links` | `Link[]` \| null | 否 | 相关链接列表 |
| `files` | `FileRef[]` \| null | 否 | 附件引用列表 |
| `completed_at` | string \| null | 否 | 完成时刻（ISO 8601 带时区）；与 status 相关联 |
| `duration` | string \| null | 否 | 耗时描述（如 `"4d"`）；由 interval → 自然文案/数值派生 |
| `sourceList` | string | 仅内存 | **不持久化**；待办视图跨清单聚合时标记来源清单 |
| `subtasks` | `Task[]` | 仅内存 | **不持久化**；`buildSubtaskTree` 派生的树形引用，序列化时丢弃 |

#### 任务元数据（`TaskMeta`）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `status` | `'pending' \| 'active' \| 'done'` | 否 | 归一化后必有值（见 2.5 推断规则） |
| `priority` | `'high' \| 'med' \| 'low'` | 是 | 缺省 `med` |
| `created` | string | 是 | 创建时刻 ISO 8601；缺省今天 |
| `start` | string | 否 | 开始时刻（ISO）；用于 duration 计算基准 |
| `due` | string | 否 | 截止日期 `yyyy-MM-dd`；重复任务的推进基准 |
| `repeat` | string | 否 | 重复规则（见第五章） |
| `repeat_until` | string | 否 | 重复截止日期；超过则不再推进 |
| `repeat_count` | number | 否 | 已推进次数计数 |
| `order` | number | 否 | 同父级内位置，1 起；`buildSubtaskTree` 依据它排序 |
| `tags` | string[] | 否 | 标签列表（编辑/筛选行为见 9.8 标签） |

#### 链接（`Link`）、附件（`FileRef`）、提醒（`Reminder`）

| 类型 | 字段 | 说明 |
| --- | --- | --- |
| `Link` | `title` / `url` | 仅接受两者均为 string 的条目，否则解析时丢弃 |
| `FileRef` | `name` / `path` / `sha`（必填），`size` / `mime` / `uploadedAt` | 附件引用；`size` 缺省 0，`mime` 缺省 `application/octet-stream` |
| `Reminder` | `at` (ISO 8601) | 必须为 string，否则丢弃 |

### 2.4 内存模型 vs 持久化模型

| 维度 | 持久化（JSON 文件） | 内存（Zustand / 组件） |
| --- | --- | --- |
| 任务存放 | 扁平数组（`Group.tasks`） | 扁平数组（store 内）+ 树（`Task.subtasks`，渲染用） |
| 层级 | `parentId` 引用 | `buildSubtaskTree(flat, parentId=null)` 派生嵌套 `subtasks[]` |
| 额外字段 | 无 | `sourceList`（待办视图聚合时）、`subtasks` |
| 时间 | string（ISO / yyyy-MM-dd） | 同 string，展示时用 date-fns 格式化 |
| 排序 | 写回前按 `order` 归一化重排 | 顶层=数组序；子树按 `order` 升序 |

- **单一事实来源**：`ParsedList`（含 `rawContent` 与 `sha`）缓存在 `listsStore.fileCache`；
  组件渲染一律取 `fileCache`，绝不直接用 GitHub 响应。
- 序列化保证：`serializeTask` 显式列出 12 个字段（含值为 `null` 的），
  持久化文件中**永远不存在** `subtasks`、`sourceList` 字段；多字段去留由迁移与写回决定。

### 2.5 任务状态推断规则（状态机）

状态只在**两类入口**被计算：解析归一化（仅补缺省）与变更时归一化（store 层传入
后代集合）。规则（`inferStatus` + `normalizeTask`）：

1. **无子任务**：有 `completed_at` → `done`；否则 → `pending`。
2. **有子任务**（全部后代，任意层）：
   - 全部 `done` → `done`；
   - 至少一个 `done` → `active`；
   - 全部非 done → `pending`。
3. 到达 `done` 时若缺 `completed_at`：补 `nowIso()`；`duration` 取
   `start → completed_at`，无 `start` 则 `created → completed_at` 的天数。
4. 离开 `done`（取消完成）：清空 `completed_at` 与 `duration`。
5. 显式指定 `explicitStatus` 时优先于推断（用于用户手动改状态到 pending）。

**级联方向**：变更发生在 store 层，先改目标任务，再沿祖先链逐级用
**已更新数组**重算 `getDescendants` 后归一化（父 → 爷 → … 直至顶层）。

### 2.6 排序规则

- `meta.order`：同一父任务的所有直接子任务中 1 起的整数；缺失按当前尾部补。
- 顶层顺序 = 分组 `tasks` 数组序（`order` 归一化后与数组序一致）。
- 渲染时 `buildSubtaskTree` 对子节点按 `order` 升序排序；
  拖拽重排（drag 模式）写回新的 `order` 序列。
- 排序模式 `SortMode = 'drag' | 'due' | 'priority'`：后两者是渲染期排序，
  不写回磁盘；`drag` 是唯一持久化顺序。

### 2.7 不变量与约束（Invariants）

1. `version === 2` 才会被解析；v1 抛错并提示本地迁移命令。
2. 持久化任务绝不带 `subtasks` / `sourceList` 字段。
3. `parentId` 恒为 string 或 null；指向自身/后代形成环时按顶层处理（防御）。
4. 同一分组的任务 `group` 字段与该分组 `name` 一致（解析时强制对齐）。
5. `done` ⇔ 有 `completed_at`（归一化后双向成立）。
6. 顶层任务的 `order` 在写回前重排为 1..n 连续；同父子任务同理。
7. 同名分组在解析后合并为一个 `Group`。
8. 清单文件至少含一个分组（解析时兜底「默认分组」）。

## 三、解析与序列化

### 3.1 模块职责

| 模块 | 职责 |
| --- | --- |
| `src/parser/jsonParser.ts` | JSON 字符串 → `ParsedList`；版本校验、字段归一化、缺失 id 生成、分组兜底 |
| `src/parser/jsonSerializer.ts` | `ParsedList` → 规范 JSON 字符串；状态推断、`completed_at`/`duration` 派生、剔除内存字段 |
| `src/utils/id.ts` | 确定性任务 id（标题+创建时间 → 字符串 hash → 36 进制） |
| `src/utils/date.ts` | ISO 格式化、相对日期、due 谓词（today/week/overdue）、`durationDays` |

### 3.2 解析流程（`parseJsonToList(content, sha?)`）

```
content --JSON.parse--> raw
  ├─ 解析失败            → throw 'Invalid JSON list content'
  ├─ 非对象              → throw 'JSON list must be an object'
  ├─ version !== 2
  │    ├─ version === 1  → throw（提示先跑 npm run migrate:v2 -- --dir <repo>）
  │    └─ 其他           → throw 'Unsupported JSON list version'
  └─ meta / groups 归一化 → 空 groups 兜底默认分组
        └─ 每个 task：normalizeTask（类型校验、meta 缺省、id/group 修复）
```

要点：

- `inferJsonVersion(content)`：快速判定（`trimStart` 后是 `{` 才尝试 parse），
  供加载前分流（如提示迁移），解析入口不重复检查。
- 逐字段白名单归一化：`note/reflection/reminders/links/files/completed_at/duration`
  仅在类型正确时写入；`reminders/links/files` 数组逐项校验，非法项丢弃。
- 归一化**不做**状态推断、**不做**排序——这些延迟到变更/序列化时，保证「读什么是什么」。
- 返回的 `ParsedList` 带 `rawContent`（原始字符串）与 `sha`（远端 ETag），
  用于后续 SHA 冲突检测与 pending 写入。

### 3.3 序列化流程（`serializeListToJson(list)`）

```
ParsedList
  └─ 每 Group → serializeGroup
       └─ 每 Task → normalizeTask(descendants, explicitStatus)  ← store 层已归一化
            └─ serializeTask 显式 12 字段（缺省补 null，剔除 subtasks/sourceList）
payload = { version: 2, meta, groups }
return JSON.stringify(payload, null, 2)
```

- 序列化前由 store 负责：状态级联归一化（2.5）、`order` 归一化（2.6）、
  同级去重/ID 修复。序列化器本身是「最后一公里」的纯输出函数。
- 归一化会**重写**手改内容：字段顺序固定、数组重排、推断字段补齐——
  因此「阅读文件所见」与「应用内存模型」永远有一致化过程。

### 3.4 幂等性与往返保证

- 解析 → 序列化 → 再解析：结构完全等价（字段齐全、类型稳定、`version` 保持 2）。
- 序列化输出不含 v1 任何残留（嵌套 `subtasks`、`## ` Markdown 头）。
- 迁移工具（`scripts/transform.mjs`）与前端解析器**各自独立实现**同一 Schema，
  以 `transform.test.mjs` 锁定转换正确性，避免「为了迁移而依赖前端代码」。

## 四、子任务层级工具函数（`src/utils/subtasks.ts`）

所有函数操作**扁平数组**（与持久化形状一致），绝不假设内存树形：

| 函数 | 行为 |
| --- | --- |
| `buildSubtaskTree(flat, parentId)` | 把扁平任务数组组建成树；返回以 `parentId` 为父的顶层数组，子节点按 `order` 升序挂到 `task.subtasks`（仅内存） |
| `flattenSubtaskTree(tree)` | 树 → 扁平数组（DFS），带 `subtasks` 引用检测防环 |
| `getDescendants(tasks, id)` | 收集某任务的全部后代（任意层级） |
| `getAncestors(tasks, id)` | 收集某任务的全部祖先（任意层级，含顶层） |
| `toggleSubtaskState(tasks, id)` | 完成/取消完成：先改目标任务，再沿祖先链基于**更新后数组**级联归一化（2.5 第 5 点） |
| `resetDescendants(tasks, ids)` | 把一组任务的子树全部重置为未完成（用于重复任务推进后） |
| `deleteSubtaskTree(tasks, id)` | 删除任务及其全部后代（级联删除） |
| `replaceSubtree(parentId, newChildren)` | 替换某父的整棵子树（拖拽重组落地） |

使用约定：

- store 层的「读」一律 `getFilteredTasks()`（顶层）+ 组件层 `buildSubtaskTree`；
  「写」一律在扁平数组上操作后 `rebuildGroups` 落回 `groups`。
- `toggleSubtaskState` 是列表与编辑器共用的唯一状态翻转入口，
  保证 UI 多处勾选行为一致（含父卡片的圆环状态与可点性判断）。
- 有子任务的任务在列表视图中**不显示可点击状态圆环**（避免“父环=全完成”误解）；
  编辑器内 Subtab 状态点仍可单独翻转。

## 五、重复任务与假日

### 5.1 重复规则（`meta.repeat`）

| 规则 | 语义 | 推进方式 |
| --- | --- | --- |
| `daily` | 每天 | `+1 day` |
| `weekly` | 每周（按当前 due 的星期几） | `+7 days` |
| `monthly` | 每月（日期保持，末日对齐自动处理） | `+1 month`（date-fns `addMonths`） |
| `yearly` | 每年 | `+1 year` |
| `weekdays` | 工作日（跳过周末与假日） | 下一个非周末、非假日工作日 |
| `mon,tue,...` | 自定义星期（逗号分隔英文缩写） | 下一个命中的星期 |
| `1,15,...` | 每月多日（逗号分隔数字，1-31） | 下一个命中的日期；超出月末自动落到下月 |

- 规则判定：纯数字串 → 每月多日；全部为星期缩写 → 自定义星期；其余为预设。
- `repeat_until`：推进结果超过该日期 → 返回 `null`（不再产生新 due）。
- `formatRepeat`：规则 → 中文可读文案（每天/每周/每月/每年/工作日/每周一二/每月1、15日）。

### 5.2 推进与有效日期

| 函数 | 行为 |
| --- | --- |
| `computeNextDue(due, repeat, repeatUntil?, holidays?)` | 按规则算下一次 due（`yyyy-MM-dd`）；受 `repeat_until` 限制；`weekdays` 接收假日列表 |
| `getFirstDueDate(repeat)` | 新任务建的初始 due：普通规则=今天；weekdays=今天若工作日否则下个工作日；自定义=以昨天为基准的最近命中日 |
| `computeEffectiveDueDate(due, repeat, repeatUntil?, holidays?)` | **显示层**：到期未完成的重任务，循环推进（上限 4000 次）直到 ≥ 今天，返回“应显示为”的 due；非重任务原样返回 |

### 5.3 完成推进（`advanceRepeatingTask`，tasksStore）

完成一个重复任务时：`due = computeNextDue(...)`，旧子任务批次
`resetDescendants` 清空，使“每周例会”这类任务每次完成都回到未完成批次。
假日数据来自 `holidayStore`（见下）。

### 5.4 假日库（`src/utils/holidays.ts` + `src/stores/holidayStore.ts`）

- 数据源：`https://date.nager.at/api/v3/publicholidays/{year}/{cc}`，取当前与下一年。
- 国家代码默认 `CN`，可在设置配置；按 ISO 周历/key 缓存。
- localStorage 缓存：`dong-todo:holidays`（数据）+ 配置，避免离线闪空。
- e2e 中 `date.nager.at` 被 Playwright mock，保证推进确定性。

## 六、状态管理（Zustand）

### 6.1 `syncStore` —— GitHub 配置与系统同步状态

- 持有 `GithubConfig`（`token/owner/repo/basePath`，来自 localStorage）、
  同步状态（`synced | syncing | unsaved | offline | unconfigured`）、`lastSyncAt`、`pendingWrites` 计数。
- 负责：初始化/清理 Octokit 单例、`pollSha()`（每 60s + `visibilitychange→visible`，
  拉取远端 SHA map 更新缓存）、`pushPending()`（`online` 事件触发 flush 未写入）。
- **版本守卫**：`pushSingleFile` 前检查缓存内容 `version === 2`，
  非 v2 直接跳过——防止旧格式被写回仓库。

### 6.2 `listsStore` —— 清单目录、活动清单、文件缓存

- 清单目录（fetchLists）、`activeListName`、`activeGroup`、`fileCache`（name → `ParsedList`）。
- 唯一与 GitHub client 和 storage 打交道的 store：
  - `loadListContent` / `saveListContent`（序列化 → `cacheFileContent` → 推送或入 pending）
  - 变更走 1.5s 防抖推送；失败 → `pending-writes` + `offline/unsaved`。
- 所有任务变更最终调用 `saveListContent` 落盘。

### 6.3 `tasksStore` —— 活动清单的任务视图

- 顶层任务列表（`flattenTasks` 只取顶层）、筛选/排序状态、`selectedTaskId`。
- 层级感知操作全部委托 `subtasks.ts` 纯函数；持久化委托 `listsStore.saveListContent`。
- 重复任务推进 `advanceRepeatingTask`、待办视图聚合 `findTaskAcrossLists` + `matchesTodoView`。
- 读路径：组件取 `fileCache` → `buildSubtaskTree`（列表视图树形）；
  待办视图保持扁平（跨清单无层级）。

### 6.4 `holidayStore` —— 假日数据

- 拉取/缓存今明两年 nager 假日；暴露 `holidays` 与 `isHoliday` 供
  `computeNextDue`（weekdays 规则）与日历视图使用。

## 七、持久化与同步

### 7.1 localStorage Schema 全表

| Key | 内容 | 说明 |
| --- | --- | --- |
| `dong-todo:github-config` | `GithubConfig` | 未完整配置视为未配置，重定向 `/settings` |
| `dong-todo:file:{清单名}` | `{ content, sha, cachedAt }` | 文件内容缓存（唯一离线读取源） |
| `dong-todo:pending-writes` | `{ [清单名]: content }` | 离线/失败的待推送内容（兼容旧 `{content}` 形态） |
| `dong-todo:active-list` | 清单名字符串 | 上次活动清单，重启恢复 |
| `dong-todo:notified-tasks` | `{ [taskId]: due }` | 已通知的任务+due，防重复提醒 |
| `dong-todo:holidays` | 假日数据 | 今日和明年 nager 假日缓存 |
| `dong-todo:holiday-config` | 国家代码等 | 假日数据源配置 |

### 7.2 正常同步链路

```
用户操作 → tasksStore 变更（内存 + 级联归一化）
        → listsStore.saveListContent
        → serializeListToJson（规范 JSON）
        → cacheFileContent（localStorage 实时更新）
        → triggerDebouncedPush(1.5s) → writeFileContent(config, path, content, sha)
        → 成功：更新 sha 与 fileCache；失败：addPendingWrite + offline/unsaved
```

### 7.3 冲突与离线

- 写入带 `sha`（远端 ETag）；远端被挪动时 GitHub 返回 409 → 重新拉取合并。
- SHA 轮询仅缓存远端 SHA map，**不自动拉取**别处修改的内容（已知局限，
  见 12 风险表）；下一次用户操作写入时会以最新 SHA 为准。
- `online` 事件 → `pushPending()` 按顺序 flush；成功清 `pending-writes` 并回 `synced`。

## 八、路由与 UI

### 8.1 路由（`src/App.tsx`）

| 路径 | 页面 |
| --- | --- |
| `/` | `MainLayout`（侧边栏 + 内容区） |
| `/settings` | GitHub 配置页（token/owner/repo/basePath） |
| 其他 | 重定向 `/` |
| 未配置时 | 任意路径重定向 `/settings` |

### 8.2 列表视图数据管线（ContentArea）

```
activeList(fileCache) → flatAll = groups.flatMap(g => g.tasks)
  → buildSubtaskTree(flatAll, null)          ← 树化（含全部层级）
  → 顶层按 filteredTopIds(筛选/搜索/标签结果) ∩ activeGroup 过滤
  → displayTasks（树形，TaskCard 递归渲染 subtasks）
待办视图：不走树化，保持扁平 + matchesTodoView 过滤 + sourceList 标记来源
```

- TaskCard 递归渲染子任务：卡片内 `task.subtasks.map(...)`；
  「全部完成/部分完成」圆环来自 `normalizeTask` 推断结果。
- 有子任务的父任务在列表不渲染可点击圆环（防止误解与误操作，见第四章约定）。

### 8.3 编辑器（TaskEditor / TaskEditorDialog）

- 支持：标题、note（Markdown 渲染 + 语法高亮）、links、files、reminders、
  priority/status、start/due/repeat（`repeat_until`）、标签、子任务编辑与拖拽排序。
- 子任务操作与列表共用 `toggleSubtaskState` / `replaceSubtree`，自动保存到 store。

## 九、核心功能

### 9.1 清单管理

- 建清单 = 在 `basePath` 下 PUT 新 JSON 文件（`createEmptyList` 起步：默认分组、空任务）。
- 删清单 = DELETE 文件（需 SHA）；归档 = `meta.archived: true`（不移文件）。
- 重命名 = 新建新文件名 + 迁移内容 + 删旧文件（两步写）。

### 9.2 分组管理

- 分组名即 `Group.name`；建组 = 新增空分组；删组 = 该组任务并入「默认分组」。
- 同名分组合并（解析不变量 7）。

### 9.3 任务 CRUD

- 创建：`generateTaskId(title, created)` 确定性 id + 默认 meta + 追加到当前分组顶层。
- 更新：编辑器成套保存（note/links/meta…）→ `saveListContent`。
- 删除：`deleteSubtaskTree` 级联删后代；带确认弹窗。
- 拖拽：dnd-kit 支持跨组/跨父移动，`replaceSubtree` + `order` 重排写回。

### 9.4 搜索与过滤

- `FilterState = { status[], priority, timeRange, tags[] }`；
  `timeRange ∈ all|today|week|overdue`（基于 `src/utils/date.ts` 谓词）；
  `tags` 为标签数组，空数组表示全部。
- 标签过滤为 OR 语义：`filter.tags` 非空时，任务任一标签命中即匹配（`matchesFilter`）。
- 搜索文本已包含标签（haystack = `title + note + tags.join(' ')`）。
- 搜索命中顶层后，`filteredTopIds` 保留整棵子树显示。
- 按标签筛选入口在侧边栏「标签」区块，行为见 9.8 标签。

### 9.5 周报导出

- 基于活跃任务 + `completed_at`，聚合出周报 Markdown（`src/utils/report.ts`），复制到剪贴板。
- 只统计 completed（含推断），不统计 pending。

### 9.6 待办视图

- 跨清单聚合（`findTaskAcrossLists`）：`start-week`（本周起始）、`all`、`high`、`calendar`。
- `TodoViewKey = 'start-week' | 'all' | 'high' | 'calendar'`；扁平渲染 + `sourceList` 徽标。

### 9.7 主题

- 明/暗主题持久化于 localStorage；Tailwind 变量驱动。

### 9.8 标签（Tags）

**数据模型**

- 标签存储于 `TaskMeta.tags?: string[]`，随任务 JSON 持久化（序列化随 `meta` 原样写出）。
- 解析归一化：仅接受字符串数组；逐项 `trim()`、丢弃空串与非字符串，否则置为
  `undefined`——防止畸形 JSON（如 `"tags": "oops"`）在搜索/过滤的 `.join`/`.some` 处崩溃。

**展示（`TagPill`）**

- 任务卡片 meta 行以胶囊渲染标签（`src/components/tasks/TagPill.tsx`），
  中性灰底 + 边框 + 次级文字色，与高/中/低优先级（红/琥珀/蓝填充）明显区分，
  明暗主题均随 CSS 变量适配；卡片与编辑器共用同一组件。

**编辑（TaskEditor「标签」区块）**

- 自由输入：文本框回车或逗号分隔提交，`trim()` 后精确去重，逐标签生成。
- 建议：列出当前清单（含子任务）已存在的标签，点击即可添加（最多显示 8 个）；
  全部已用则隐藏建议行。
- 每个标签带 ✕ 可移除；空数组保存时折叠为 `undefined`（JSON 不残留空数组）。

**筛选（侧边栏「标签」区块，位于「我的清单」下方）**

- 标签列表从当前上下文任务（活动清单顶层任务 / 待办视图聚合任务）统计，按计数降序展示。
- 点击标签 → `setFilter({ tags: [tag] })` 并清除 `activeGroup`，作为跨分组视图；
  再次点击同一标签取消。
- 语义：标签之间为 OR，与状态/优先级/时间/搜索过滤组合为 AND（`matchesFilter`）。
- 待办视图：`setTodoView` 会重置 `filter`（含 `tags`），进入待办视图自动清空标签过滤；
  待在视图内点标签则在聚合任务上叠加过滤。
- 工具栏「清除筛选」与移动端筛选徽标均计入标签过滤。

**实现位置**

- `src/components/tasks/TagPill.tsx`（组件）、`TaskEditor.tsx`（编辑）、
  `TaskCard.tsx`（展示）、`Sidebar.tsx`（侧边栏区块）、
  `src/stores/tasksStore.ts`（`matchesFilter` / `setFilter`）、
  `src/types/index.ts`（`FilterState.tags`）。

## 十、备注（Note）、链接（Links）与附件（Files）详解

### 10.1 备注（note）

**数据结构**

- `note?: string`，纯 Markdown 文本；视为普通字符串，**绝不参与结构解析**（见 ADR 4）。
- 解析归一化：仅当 `typeof note === 'string'` 才写入任务；其余类型（数字、
  对象、数组）一律丢弃。
- 序列化：`note ?? null`，与其它可选字段一致显式写出 null。
- 与 `reflection`（感想）平级，两者互不依赖；空备注在预览时显示「（暂无内容）」。

**编辑（`NoteEditor`）**

- 双模式切换：`preview`（默认，点击内容区即进入编辑）↔ `edit`（textarea，自动聚焦）。
- 工具栏 `NoteToolbar` 提供：
  - 排版：加粗（Ctrl+B）、斜体（Ctrl+I）、H1/H2/H3 下拉；
  - 插入：链接（Ctrl+K）、图片、表格——分别弹 `InsertLinkDialog` /
    `InsertImageDialog` / `InsertTableDialog` 可视化填参后注入；
  - 列表：有序 / 无序 / 任务列表；代码块。
- 所有插入由纯函数 `insertFormat(value, selStart, selEnd, type, extra?)`
  生成「新文本 + 新光标位」，写回后 `requestAnimationFrame` 恢复选区；
  标题/列表操作按当前行首拼前缀，避免误改其它行。
- 中文输入法组合键不触发快捷键（`e.nativeEvent.isComposing` 守卫）。
- 全屏编辑（`NoteEditorDialog`）：左右 1:1 分栏「源码｜预览」，滚动按比例同步，
  `syncing` 原子锁防回环；Esc 关闭（插入弹窗打开时优先关闭弹窗）。

**渲染（`MarkdownPreview`）**

- `react-markdown` + `remark-gfm`（表格、任务列表、删除线等 GFM 扩展），
  容器为 `prose prose-sm`（typography 样式）。
- 纯显示层：渲染产物不回流成任务结构，也不反向解析（与「备注只是字符串」决策一致）。

**使用位置**：任务编辑器内嵌（任务级与子任务级均可编辑）；任务卡片不预渲染
note，点击卡片进入编辑器查看。

### 10.2 链接（links）

**数据结构**

- `Link { title: string; url: string }`；解析时仅保留两者均为 string 的条目，
  其余丢弃（`normalizeLink`）。
- 数组顺序即显示顺序；不做 url 去重（依赖用户维护）。
- 对外跳转一律 `target="_blank"` + `rel="noopener noreferrer"`。

**编辑（`LinksEditor` / `SubtaskLinksEditor`）**

- 编辑形态为多行文本域，**一行一条**，保存时 `textToLinks` 解析，三种写法：
  1. `[标题](url)` —— Markdown 链接语法；
  2. `标题 url` —— 空格分隔，最后一个 token 为 url，其余拼为标题；
  3. `url` —— 单独一行（标题缺省为 url 本身）。
- 校验：`url` 必须以 `http` 开头，否则该行丢弃；空结果写 `undefined`（清空链接）。
- `linksToText` 反向生成文本（title=url 时只输出 url），编辑器打开时回填。
- 子任务编辑器（`SubtaskLinksEditor`）同格式，`blur` 时提交。

**展示（`TaskCard.TaskLinks`）**

- 胶囊样式：primary 底 + primary 文字，单条 `max-w-160px` 截断，`title` 悬浮显示完整 url。
- 点击在新窗口打开（`_blank` + noopener）；容器 `stopPropagation` 防止误触打开任务编辑器。
- 任务卡默认显示前 5 条 +「+N 个链接」；子任务紧凑模式前 3 条。

### 10.3 附件（files）

**数据结构**（`FileRef`，字段见 2.3）

- `name`：用户原始文件名（展示用）；`path`：仓库存储路径；`sha`：该文件 blob SHA。
- 解析默认值：`size` 0、`mime` `application/octet-stream`、`uploadedAt` `''`。
- 附件文件**不经过 JSON 防抖通道**，直接写入仓库；`files` 引用数组随任务 JSON 保存。

**存储布局（内容去重）**

```
<basePath>/attachments/<清单名>/<任务id>/<sha12>.<ext>
```

- 存储文件名 = 文件内容 SHA-256 的前 12 位 hex（`computeFileHash`）+ 原扩展名。
- 上传前 `fileExists` 探测：同一内容永远命中同一路径，**复用 sha 不再重复上传**；
  因此同内容文件跨清单/跨任务共享一份仓库文件。

**上传（`uploadFileToRepo`）**

1. 计算内容哈希 → 拼接存储路径；
2. `fileExists` 探测：存在则取 sha 复用；
3. 不存在则 `fileToBase64`（FileReader DataURL）→ `uploadBinaryFile`
   （GitHub contents API，base64 提交）；
4. 组装 `FileRef`（name / path / sha / size / mime / uploadedAt=now）返回。
- 编辑器批量上传逐文件 try/catch：单个失败仅 console.error，不阻塞其余；上传中置灰。
- 同一任务重复添加相同内容时按 `path` 去重（existingPaths 集合）。

**展示与下载（`FileListDisplay` / `useFileDownload`）**

- 按 mime 映射图标：image / pdf / spreadsheet / document / text / archive / file；
  显示文件名 + 大小（`formatFileSize`：B / KB / MB）。
- 下载：`downloadFileRef` → `getBinaryFileContent`（base64）→ atob 转
  Uint8Array → `Blob(type=mime)` → 临时 `<a download>` 触发浏览器下载。
- 任务卡显示前 5 条 +「+N 个文件」，紧凑模式不显示大小；列表卡片可直接下载，
  无需进入编辑器。

**删除**

- 两步：先移除内存引用（`files` 过滤），再异步 `deleteFile(path, sha)` 删除仓库文件；
  删除失败仅 console.error，引用移除不回滚。
- 已知局限：内容去重导致路径共享，若同一附件被多个任务引用，任一任务删除
  都会同时删掉仓库文件，其余引用随即失效（已登记第十三章风险表）。

**孤儿文件与清理**

- 附件上传成功但任务 JSON 保存失败时，仓库会残留孤儿附件（git 历史可见，
  可手工清理），属可接受权衡；不做 GC。

## 十一、技术栈

| 类别 | 选型 |
| --- | --- |
| 构建 | Vite 6 + React 插件（`base: '/'`，`@` 别名 = `src/`） |
| 框架 | React 19（StrictMode）、TypeScript 5、TS project references |
| 路由 | React Router DOM 7 |
| 状态 | Zustand 5（syncStore / listsStore / tasksStore / holidayStore） |
| 样式 | Tailwind CSS 4（`@tailwindcss/vite`） |
| Markdown 渲染 | `react-markdown` + `remark-gfm`（仅 note/links 显示层） |
| 拖拽 | `@dnd-kit/core` + `@dnd-kit/sortable` |
| 无头组件 | Radix（Dialog / DropdownMenu / Select / Tooltip） |
| GitHub API | Octokit 4（浏览器直连 `api.github.com`，无代理） |
| PWA | `vite-plugin-pwa`（离线可用 + 安装） |
| 日期 | `date-fns` |

## 十二、首次使用与部署

1. 生成 GitHub Personal Access Token（`repo` 权限）。
2. 打开应用 → 自动跳 `/settings`：填 token、owner、repo、basePath（默认 `todo`）。
3. 仓库下不存在 basePath 时自动创建目录结构；已有 v1 JSON 先本地迁移
   （`npm run migrate:v2 -- --dir <repo>`），否则解析被拒并提示。
4. 部署：`npm run build` → 产物 `dist/` 静态托管（任意静态服务器/GitHub Pages）；
   子路径部署需改 `vite.config.ts` 的 `base`。

## 十三、风险与回滚策略

| 风险 | 缓解 |
| --- | --- |
| SHA 轮询不自动拉取远端修改 | 写入前以最新 SHA 写入；多端同时编辑可能覆盖，靠改文件历史找回 |
| 手改 JSON 被归一化重写 | 归一化是幂等的；保留 git 历史可 diff |
| v1 文件被硬拒 | 解析器提示明确迁移命令；迁移工具带 `--dry-run` 与自动备份 |
| 离线丢变更 | `pending-writes` + online flush；失败不丢 rawContent |
| 假日 API 不稳定 | 本地缓存 + 失败回退（无假日数据时按纯周末推进） |
| 共享附件删除导致其他引用失效 | 附件按内容哈希去重共享仓库文件（10.3）；删除附件会连同仓库文件一起删除，多任务引用同一附件时其余引用失效——可改为仅移除引用、保留文件 |
| 孤儿附件残留 | 上传成功但任务 JSON 保存失败时仓库残留孤儿文件；依赖 git 历史手工清理，不做 GC |

回滚：仓库是 git，任何写坏的文件可用 `git checkout` 恢复；应用自身无服务端。

## 十四、决策记录（ADR）

1. **扁平 `parentId` 而非嵌套数组**：序列化零递归、拖拽/排序算法简单、
   迁移可逆；代价是解析需二遍（引用校验）——已有 `getAncestors` 防御环。
2. **状态可推断而非人工维护**：避免“父完成但子未完成”的矛盾展示；
   `completed_at/duration` 由推断填充，也允许显式指定。
3. **迁移工具独立于前端实现**：`scripts/` 纯 Node 无 `src/` 依赖，
   保证能在克隆仓库本地执行，且带测试锁定行为。
4. **备注只当字符串**：放弃 Markdown 结构解析，杜绝“换格式即丢数据”。
5. **列表视图树形、待办视图扁平**：两组渲染管线共用同一持久化，
   不引入第二套 Schema。
6. **链接用「一行一条」多行文本编辑**：兼容 Markdown 语法、裸 url、
   「标题 url」三种写法，解析规则简单可解释；强制 `http` 前缀校验防无效数据。
7. **附件按内容哈希命名与去重**：SHA-256 前 12 位 hex 保证同内容不重复入库，
   天然支持跨任务共享；代价是删除语义变为「移除引用 + 删除仓库文件」两步
   （共享引用失效风险见 13 风险表）。

