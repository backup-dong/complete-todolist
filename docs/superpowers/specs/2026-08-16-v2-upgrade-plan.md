# JSON v2 升级方案（扁平化 + 字段缺口补齐 + MD 退役 + 独立迁移工具）

> 输入文件：
> - `docs/superpowers/specs/2026-07-25-v2-json-flatten-subtasks-design.md`（数据模型扁平化设计）
> - `doc/任务工作台.xmind`（产品维度脑图，含「任务工作台」与「字段」两个 sheet）
>
> 本方案是多个输入的汇合产物：以扁平化设计为数据层主干，用 XMind 产品维度做字段完备性校验；同时完成 Markdown 代码全面退役，并将 v1→v2 迁移能力做成**独立 CLI 工具**，应用本身零迁移代码。
>
> 状态：设计评审通过，待编写实现计划

## 1. 背景

当前 JSON 格式（version=1）使用递归嵌套 `Subtask[]` 表示子任务，导致：

- 两套语义相近但字段不同的类型（Task vs Subtask）
- 递归嵌套使 CRUD 复杂度高（`number[]` 索引 path 寻址贯穿 store/UI/dnd）
- 子任务无法拥有完整 meta（优先级、标签、重复等）
- 跨清单聚合（待办视图）无法将子任务作为独立条目

同时，将 XMind「任务工作台」的产品维度逐项对照现有 schema 后，发现若干字段级缺口。v2 是一次不可回避的 schema 升级，应借此一次性补齐，避免二次迁移。

本轮另有两项伴随决策：**全面退役 Markdown 存储代码**（应用只读写 JSON v2，仓库遗留 `.md` 文件不再读取、不清理），以及**独立 CLI 迁移工具**（`scripts/migrate-v1-to-v2.mjs` 直接操作 GitHub 待办仓库做 v1→v2 批量转换；应用不留任何迁移/转换代码）。

## 2. XMind 维度 → 字段对照与缺口分析

| 工作台维度 | 落点 | 现状 |
|---|---|---|
| 任务名称 | `title` | ✅ 已有 |
| 任务详情（如何执行/进展记录/关联想法/生活备注） | `note`（Markdown） | ✅ 已有 |
| 任务拆分（子任务） | `parentId`（v2 展平） | 🔄 本轮改造 |
| 优先级 | `meta.priority` | ✅ 已有 |
| **重要性** | **不收录** | 决策：去掉。与 `priority` 语义重叠，本轮无消费端；将来如需「紧急 vs 重要」双轴，用 tags 或字段扩展表达 |
| 状态（未开始/进行中/已完成） | `pending/active/done` | ✅ 已有，语义对齐 |
| 定期执行（天/周/月/年/工作日） | `meta.repeat` | ⚠️ **`yearly` 缺失**，本轮补齐 |
| 分类 | `group` | ✅ 已有 |
| 标签 | `meta.tags` | ✅ 已有 |
| 附件（笔记/感想/关联文件） | `note` + `files` | ⚠️ **感想无独立字段**，本轮补齐为 `reflection` |
| **提醒** | **`reminders`** | ❌ 字段本轮收录，通知触发功能后做 |
| 持续时间 / 截至日期 / 顺序 | `duration` / `due` / `meta.order` | ✅ 已有 |
| 每日任务安排 | — | 新功能，路线图，非本轮 |
| 每日总结 / 周报 / 年度汇总 | — | 周报已有；每日总结、年度汇总在路线图 |
| AI 理性/感性分析、AI 周报、AI 协作 | — | 路线图（连线输出到总结/汇总） |

## 3. 范围决策（已确认）

1. **范围**：v2 扁平化 + 补齐字段缺口（`reflection`、`repeat: 'yearly'`、`reminders`），报告类功能只做路线图规划。**不收录 `importance`**：与 `priority` 语义重叠、无消费端，YAGNI。
2. **提醒**：schema 收录字段，UI 与通知触发后续单独方案。
3. **order 位置**：保留在 `meta` 内（与 XMind 字段库、现有代码、`META_ORDER` 一致）。偏离原设计文档 3.2「移到 Task 顶层」——该改动无收益且增加 serializer/迁移改动量。
4. **排序语义**：同父节点内按 `meta.order` 排序（与现有行为一致），建树时按 order 排序组装。
5. **Markdown 全面退役**：删除所有 md 读写/迁移代码（§5.3 清理清单）；仓库遗留 `.md` 实体文件**留仓不读取**（不展示、不迁移、不删除）。
6. **迁移工具独立化**：开发 `scripts/migrate-v1-to-v2.mjs` CLI 工具（复用 `octokit` 依赖），直接操作 GitHub 待办仓库完成 v1→v2 批量转换。**新系统（应用）零迁移代码**：`parseJsonToList` 只接受 `version === 2`，v1 文件加载时抛「清单版本过旧，请先在仓库运行迁移工具」错误。
7. **陈旧缓存防御**：localStorage 残留的 v1 内容（旧版本 pending writes）由 `pushPending` 守卫丢弃（非二分逻辑），不推送、不迁移，防止把远程文件打回 v1。

## 4. 数据模型（version=2）

### 4.1 JSON Schema

```json
{
  "version": 2,
  "meta": { "name": "工作", "created": "2026-07-01", "archived": false },
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
            "due": "2026-07-10",
            "created": "2026-06-28"
          },
          "note": "需要调研飞书任务、Notion、Todoist 三家的功能对比",
          "reflection": null,
          "reminders": [{ "at": "2026-07-10T09:00:00+08:00" }],
          "links": null,
          "files": null,
          "completed_at": null,
          "duration": null
        },
        {
          "id": "x1y2z3w4",
          "title": "收集飞书任务功能列表",
          "parentId": "a1b2c3d4",
          "group": "项目Alpha",
          "meta": {
            "status": "done",
            "priority": "med",
            "created": "2026-06-28"
          },
          "note": null,
          "reflection": "感想：飞书任务的通知设计值得借鉴",
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

### 4.2 类型变更（`src/types/index.ts`）

- 删除 `Subtask` 接口。
- `Task`：删除 `subtasks`；新增 `parentId: string | null`、`reflection?: string`、`reminders?: Reminder[]`。
- 新增 `Reminder`：`{ at: string }`（ISO 8601 时间；本轮最小形态，触发相关字段留待提醒功能方案）。
- `TaskMeta`：`repeat` 联合类型新增 `'yearly'`；**保留 `order?: number`**（决策 3）。
- `sourceList` 仍为运行时字段，不持久化。

### 4.3 字段映射（v1 Subtask → v2 Task）

| v1 Subtask | v2 Task | 备注 |
|---|---|---|
| `text` | `title` | 直接迁移 |
| `level` | 丢弃 | 由 parentId 链深度推导（UI 深度上限 3 不变） |
| `completed` | `meta.status` | true→'done'，false→'pending' |
| `completed_at` | `completed_at` | 不变 |
| `start` / `due` | `meta.start` / `meta.due` | 不变 |
| `note` / `links` / `files` | `note` / `links` / `files` | 不变 |
| `children[]` | parentId 关联 | 递归展平 |
| — | `meta.order` | 展平时按原 children 顺序写入 1..n |

## 5. 迁移方案（独立 CLI 工具，应用零迁移代码）

### 5.1 工具设计

| 项 | 内容 |
|---|---|
| 位置 | `scripts/migrate-v1-to-v2.mjs`（自包含，**不 import `src/` 任何代码**） |
| 运行 | 本地执行：`git clone` 待办仓库 → `npm run migrate:v2 -- --dir <仓库目录>`；Node 18+ 环境 |
| 依赖 | `archiver`（devDependency，用于备份 zip）；转换逻辑 `scripts/transform.mjs` |
| 测试 | `scripts/transform.test.mjs`（vitest 收集，纯函数测试） |

工具流程（直接操作本地仓库目录，**不经过 GitHub API**）：

1. 递归扫描 `--dir` 下所有 `*.json`（跳过 `.git` / `node_modules` / 备份输出目录）。
2. 逐个读取解析，检测 `version`：
   - `version === 2` → 跳过（幂等，跑第二次全部跳过）。
   - `version === 1` → 进入迁移候选。
   - 其他 / 解析失败 → 告警跳过，不中断，计入失败报告（exit code 1）。
3. **备份**（默认开启，`--no-backup` 关闭）：把全部 v1 文件打包为 `dong-todo-v1-backup-<时间戳>.zip`（相对路径，UTF-8 中文文件名），输出到 `--dir` 的上一级（`--backup-dir` 可指定）。备份失败不中断迁移。
4. 逐个转换写回（UTF-8 原文件覆盖）。
5. 输出报告：迁移 N / 跳过 M / 失败 K / 备份路径。
6. `--dry-run`：只报告不写回、不备份。

转换核心 `migrateJsonV1toV2`（纯函数，含单测）：

- 递归展平 `subtasks` → 独立 Task；`text → title`、`completed → meta.status('done'/'pending')`、level 丢弃。
- 子任务继承父任务 `group`；缺 id 用 `generateTaskId(title, created)` 补齐（复制与 `src/utils/id.ts` 相同的确定性 hash 算法，冲突加后缀）。
- 同父 children 按原顺序写 `meta.order = 1..n`；`parentId` 指向父任务 id（顶层 `null`）。
- 顶层任务保持原数组顺序，`meta.order` 缺失时按位置补全。
- `completed_at` / `duration` / `note` / `links` / `files` / `meta.start/due/repeat/repeat_until/repeat_count/tags/priority/created` 原样保留。
- 输出 `version: 2` 的 JSON 字符串；v2 输入原样返回（幂等）。

### 5.2 应用侧（零迁移代码）行为

- `parseJsonToList`：仅接受 `version === 2`；`version !== 2` 抛 `Unsupported JSON list version: X`（错误信息额外交代：v1 清单需先运行迁移工具）。
- `fetchListContent`：不再有 v1 转换或写回分支（原 md 迁移骨架一并删除）。
- `pushPending` 守卫：推送前 `JSON.parse` 探测内容 `version`，非 2 者**丢弃**该 pending write 并告警（旧版本残留，防御性处理，非迁移逻辑）。
- CLI 工具（`scripts/`）不参与应用构建产物，bundle 零迁移代码。

### 5.3 Markdown 代码清理清单

| 位置 | 内容 | 处置 |
|---|---|---|
| `src/parser/scanner.ts`（464 行） | scanBlocks / 子任务属性解析 / parseMarkdownToList | **整体删除**；`inferStatus`（normalizeTask 唯一依赖）随 v2 重写迁出 |
| `src/parser/serializer.ts` | md 序列化（serializeMetadataLine / serializeSubtasks / serializeTask / serializeGroup / serializeList） | 删 md 部分；**保留 `normalizeTask`、`createEmptyList`**（v2 通用），迁至 jsonParser 侧，文件删除 |
| `src/parser/parser.test.ts`（332 行） | md round-trip 测试 | 整个删除；inferStatus 不变式测试迁入 jsonParser.test.ts |
| `src/parser/index.ts` | 导出清理 | 只导出 json 侧 + `normalizeTask`/`createEmptyList` |
| `src/github/client.ts` | `listMarkdownFiles`（已 @deprecated） | 删除；`listFilesByExtension` extension 参数收窄（仅 `.json`） |
| `src/stores/listsStore.ts` | `LEGACY_EXT`、`deleteLegacyMdIfExists`、`migrateListToJson`、fetchLists 的 `.md` 扫描、fetchListContent 的 md fallback、offline 分支 md 嗅探、`pendingMigrations`（死状态） | 全部删除；`fileNameToListName` 收窄为只剥 `.json` |
| `src/stores/tasksStore.ts:205-207` | 缓存 md 解析分支 | 删除 |
| `e2e-test.py` step 9 | md→json 懒迁移测试 | 删除（v1→v2 迁移已移至 CLI 工具，不受 e2e 覆盖） |
| `CLAUDE.md` | md 相关段落 | 同步更新，补充迁移工具用法 |

### 5.4 版本常量

- `JSON_FORMAT_VERSION` 升为 **2**：`src/parser/jsonParser.ts` 与 `src/parser/jsonSerializer.ts` 两处独立常量，本轮收敛为单一来源导出。

## 6. 架构与数据流

```
JSON v2 (flat, parentId)
  -> parseJsonToList() -> ParsedList { groups: [{ tasks: flat Task[] }] }   [仅接受 version === 2]
    -> listsStore.fileCache（flat Task[]，含 parentId）
      -> tasksStore 内部:
          存储: flat Task[]
          消费: buildSubtaskTree(tasks) -> 给每个 Task 挂载只读 .subtasks 子树
    -> serializeListToJson() -> flat 输出（直接序列化，无转换）

迁移路径（工具执行一次后永久完成）:
  GitHub 仓库 v1 文件
    -> scripts/migrate-v1-to-v2.mjs（CLI，octokit，独立于应用）
    -> GitHub 仓库 v2 文件
```

- `buildSubtaskTree`（新增，`src/utils/subtasks.ts`）：接收 flat `Task[]`，按 `parentId` 分组、组内按 `meta.order` 排序，为每个 Task 重建 `.subtasks` 子树（只读派生，供 UI 消费；持久化时丢弃，serializer 不序列化该字段）。**实现为纯函数：复制节点并挂载子树，绝不原地修改缓存中的 flat Task 对象**，保证 `tasksStore` 在每次渲染时安全重算。
- 所有修改操作基于任务 id 寻址（见 §7），禁止直接操作派生的 `.subtasks` 树。

## 7. 各层改造清单

| 文件 | 改动 |
|---|---|
| `src/types/index.ts` | §4.2 全部类型变更 |
| `src/parser/jsonParser.ts` | 仅接受 version===2（v1 抛错+工具提示）；删 `normalizeSubtask`；并入 `normalizeTask`/`createEmptyList`（从 serializer.ts 迁入）；`normalizeTask` 适配（parentId/reflection/reminders/yearly 默认值） |
| `src/parser/jsonSerializer.ts` | version→2；删 `serializeSubtask`；`serializeTask` 输出 flat 字段（含新字段 null 补齐）；`inferStatus` 重写后迁入 |
| `src/parser/scanner.ts`（464 行） | **整体删除**（md 退役） |
| `src/parser/serializer.ts`（159 行） | 删 md 序列化部分，`normalizeTask`/`createEmptyList` 迁出后**文件删除** |
| `src/parser/parser.test.ts`（332 行） | **整个删除**（md 测试；inferStatus 不变式测试迁入 jsonParser.test.ts） |
| `src/parser/index.ts` | 导出清理：只导出 json 侧 + `normalizeTask`/`createEmptyList` |
| `src/github/client.ts` | 删除 `listMarkdownFiles`；`listFilesByExtension` extension 参数收窄（仅 `.json`） |
| `src/utils/subtasks.ts` | 整体重写：`cloneTree / toggleTask / updateTask / deleteTask / addChild / reorder / resetDescendants` 均以 task id 寻址；新增 `buildSubtaskTree`、`getDescendants`、`getDepth` |
| `src/stores/tasksStore.ts` | `toggleSubtask(taskId, path)` → `toggleSubtask(taskId, childTaskId)`；新增 `addSubtask(taskId, title, parentId?)`；`advanceRepeatingTask` 的 `resetSubtasks` 改为重置所有后代；`inferStatus` 适配；缓存 md 分支（205-207）删除 |
| `src/stores/listsStore.ts` | md 清理全部删除；无任何 v1 迁移分支 |
| `src/stores/syncStore.ts` | `pushPending` 守卫：探测内容 version，非 2 丢弃 + 告警 |
| `src/utils/report.ts` | 5 个递归 helper（`hasSubtaskCompletedThisWeek` 等）改为 `getDescendants` 遍历 |
| `src/utils/repeat.ts` | `computeNextDue` 支持 `'yearly'`（生成 `formatRepeat` 文案、日历视图 occurence） |
| UI：`ContentArea.tsx`、`TaskList.tsx`、`TodoView.tsx` | `onToggle` 签名 `(taskId, path)` → `(taskId)` |
| UI：`TaskCard.tsx` | 消费 `.subtasks` 树的渲染部分不动；`SubtaskItem` 的 `path` 传递改为直接传子任务 id |
| UI：`TaskEditor.tsx` | 子任务 add/delete/edit/reorder 由 index path 改为 task id；dnd `idToPath` → taskId；深度上限 3 保留 |
| UI：新增 感想/提醒 编辑入口 | 感想：与 note 并列的 Markdown 编辑区；提醒：本轮仅编辑 `at`（列表增删），触发不做 |
| `src/utils/fileUpload.ts` 等 | 若内部有以 path 定位 subtask 上传的调用，改 task id |
| **`scripts/migrate-v1-to-v2.mjs`（新）** | CLI 工具入口：本地目录扫描 → 版本检测 → v1 文件打包备份 zip（archiver）→ 转换写回 → 报告；支持 `--dry-run`、`--no-backup`、`--backup-dir`（§5.1） |
| **`scripts/transform.mjs`（新）** | 纯转换函数 `migrateJsonV1toV2` + `generateTaskId` 复制实现（可单测） |
| **`scripts/transform.test.mjs`（新）** | 转换函数单测（vitest） |
| `package.json` | 新增 `"migrate:v2": "node scripts/migrate-v1-to-v2.mjs"`；新增 `archiver` devDependency |
| `e2e-test.py` | step 6 断言适配 v2 JSON；step 9（md 迁移）删除 |
| `CLAUDE.md` | 同步删除 md 相关段落、更新数据模型/架构描述、补充迁移工具用法 |

### 7.1 UI 不变的部分

- TaskCard / TaskEditor 中一切消费 `task.subtasks` 树的渲染逻辑（展开/折叠、进度条、预览前三项）——由 `buildSubtaskTree` 保证形状不变。
- CalendarView（只读 `meta.due`/`repeat`）、过滤/排序、todo-view 聚合逻辑。

## 8. 状态推断不变式（必须保持）

`normalizeTask` 的 `inferStatus` 语义在 v2 下必须等价于 v1：

| 条件 | status |
|---|---|
| 无后代 && 有 `completed_at` | done |
| 无后代 && 无 `completed_at` | pending |
| 后代全部 done | done |
| 至少一个后代 done | active |
| 其余 | pending |

该不变式被 parser 单测（迁入 jsonParser.test.ts）、report 单测、e2e 覆盖，改造后全部回归。

## 9. 测试计划

**单元测试**
- `scripts/transform.test.mjs`：v1 fixture → v2 转换（3 级嵌套、字段映射、order 补全、id 补齐、group 继承、幂等性——v2 输入原样输出）。
- `jsonParser.test.ts`：v2 round-trip；新字段（reflection/reminders/yearly）序列化；version!==2 抛错；inferStatus 不变式全分支（承接原 parser.test.ts）。
- `subtasks.test.ts`：`buildSubtaskTree` 组序/深序；`getDescendants`；toggle/delete/reorder 按 id。
- `repeat.test.ts`：`yearly` 计算（含闰日 2/29 边界）。
- `report.test.ts`：flat 模型下周报输出与 v1 等价。
- `tasksStore.test.ts`：toggleSubtask 新签名、重复任务推进重置后代。

**E2E（e2e-test.py）**
- 步骤 6 断言适配 v2 JSON 结构（subtask → 扁平 task + parentId）。
- 步骤 9 删除（迁移已脱离应用）；预置 v2 fixture 验证应用正常读取即可。

**工具冒烟（手动）**
- 对本地 clone 的仓库先 `--dry-run` 再实跑一次，确认备份 zip 生成、幂等与报告输出。

## 10. 工作量评估

| 工作项 | 预估 |
|---|---|
| md 代码退役（scanner/serializer/parser.test 删除，normalizeTask/createEmptyList 迁出，listsStore/tasksStore/client/e2e/CLAUDE.md 清理） | 1–1.5 天 |
| 独立迁移工具（CLI 本地模式 + 转换纯函数 + 备份 zip + 单测 + pushPending 守卫） | 1–1.5 天 |
| v2 系统改造（types/parser/subtasks/store/report/repeat + 5 个 UI 文件） | 2–3 天 |
| **合计** | **约 4–6 天** |

可行性评估：高。迁移工具为一次性运维工具，本地文件系统操作、不依赖网络/API 限额，与应用完全解耦（应用更简单：无迁移分支）；转换逻辑为纯函数可独立测试。主要风险：应用加载遗留 v1 清单时报错提示（需要迁移工具先行）、备份 zip 命名冲突（带时间戳，天然唯一）。

## 11. 路线图（范围外，预留）

按 XMind「任务工作台」连线，v2 落地后的独立方案：

1. **每日任务安排**（计划排期）：基于 due/important 的任务推荐视图。
2. **每日总结 / 年度汇总**（总结/汇总）：沿用 `report.ts` 模式扩展模板；周报已实现。
3. **提醒触发**：`reminders` 字段消费端——本地通知 + 轮询/服务 worker，含触发状态字段扩展。
4. **AI 理性/感性分析、AI 周报、AI 协作**：输出到总结/汇总与跟踪任务，依赖报告功能的模板体系。

## 12. 风险与注意点

- `JSON_FORMAT_VERSION` 双常量必须同步升 2（本轮收敛为单一来源导出）。
- **md 数据处置已定**：代码全部退役，仓库遗留 `.md` 文件留仓不读取——老清单若无对应 `.json` 将在应用中不可见，属可接受的数据决策（线上数据早已 JSON 化）。
- **升级顺序**：先跑迁移工具（本地 clone → 迁移 → 备份 → push），再部署新应用；若反向（先升应用后迁移），v1 清单在应用中报「版本过旧」错误，需提示用户运行工具（错误文案要可操作）。
- 迁移工具写回为本地文件覆盖（UTF-8），无 API 限额问题；转换前自动备份 v1 文件为 zip，备份失败不中断。
- 陈旧本地缓存（localStorage pending-writes）可能残留 v1 内容：`pushPending` 守卫直接丢弃（应用永不产生 v1，防御旧残留）。
- 工具与应用代码零耦合：工具不 import `src/`，转换实现（含 generateTaskId 算法副本）独立维护；应用迭代不影响工具。