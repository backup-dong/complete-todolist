# 待办系统详细设计（基于 Markdown + GitHub Repo）

版本：v1.2 | 日期：2026-07-09 | 状态：已同步实现

---

## 变更摘要（v1.2 —— 同步当前实现）

与 v1.0/v1.1 相比，当前代码实现已在以下方面调整/补全：

1. **任务编辑改为居中弹窗**：`TaskEditorDialog` 替代右侧固定面板，桌面端最大宽度 `max-w-4xl`，内部可滚动。
2. **状态过滤改为多选**：`FilterState.status` 为 `TaskStatus[]`，空数组表示全部；使用 Radix DropdownMenu 实现复选下拉。
3. **批量删除任务**：任务列表顶部新增「批量」入口，多选后一键确认删除；`tasksStore` 新增 `deleteTasks`。
4. **子任务支持拖拽排序**：在任务详情弹窗中，同层级子任务可拖拽 reorder，新增 `reorderSubtasksAtPath`。
5. **主题切换**：支持浅色 / 深色 / 跟随系统，基于 CSS 变量与 `dark` class 切换。
6. **同步待写入队列 + 冲突提示条**：底部同步指示器展示待同步文件数，点击展开队列可手动重试；`ConflictBanner` 提示远端 SHA 冲突。
7. **周报导出**：内容区顶部「导出周报」按钮，按自然周导出当前清单已完成事项到剪贴板。
8. **子任务开始/截止日期**：Markdown、解析/序列化、TaskEditor UI 已同步支持。
9. **重复规则扩展**：除 daily/weekly/monthly 外，还支持 `weekdays`、自定义星期（`mon,wed,fri`）、自定义月日（`1,15`）。
10. **路由简化**：实际仅使用 `/` 与 `/settings`，清单/分组/任务状态由 Zustand 管理，不体现在 URL。

---

## 一、产品概述

一个纯前端 Web SPA 待办系统，数据以 Markdown 文件形式存储于 GitHub 私有仓库，通过 GitHub API 进行读写同步。

### 核心设计理念

- **Markdown 即数据库**：所有待办数据以纯 Markdown 存储，任何文本编辑器可打开读写，导出即原始文件。
- **无后端依赖**：数据通过 GitHub API 直接在前端和仓库之间传输，不涉及任何后端服务器。
- **离线友好**：浏览器缓存 + 本地存储作为加速层，支持断网时的基本读写。

### 用户画像

- 主用户：本人（产品经理）。
- 使用场景：桌面浏览器为主，配合浏览器 Notification API 做到期提醒。
- 核心诉求：轻量、导出方便、数据在自己手里、跨设备同步。

---

## 二、数据结构（Markdown 格式规范）

### 2.1 整体目录结构

```
todo/
├── README.md              # 自动生成的总览（各清单统计，预留）
├── 工作.md                # 清单 = 一个 Markdown 文件
├── 学习.md
├── 个人.md
├── 生活.md
└── _archived/             # 已归档清单（结构与主文件一致）
    ├── 工作.md
    └── 学习.md
```

- **一个清单 = 一个文件**，文件名即清单名。
- 不支持嵌套目录做清单（如 `工作/项目A.md`），分组由文件内的 H2 承担。
- `_archived/` 目录专门存放已被用户归档的**清单**（整个文件标记 `archived: true`），不是单条任务归档。

### 2.2 清单文件格式

```markdown
# 工作

<!-- todo:list-meta
  created: 2026-06-01
  archived: false
-->

## 项目Alpha

### 竞品调研报告
status: active | priority: high | start: 2026-07-01 | due: 2026-07-10 | created: 2026-06-28 | order: 1

- [x] 收集飞书任务功能列表 (2026-07-02T14:30:00+08:00)
- [x] 收集 Notion 功能列表 (2026-07-03T10:00:00+08:00)
  start: 2026-07-02
  due: 2026-07-03
- [ ] 收集 Todoist 功能列表
- [ ] 撰写对比报告
- [ ] 发给团队评审

**备注**
需要调研飞书任务、Notion、Todoist 三家的功能对比

**链接**
- [飞书任务官方](https://example.com)
- [Notion 模板](https://example.com)

---

### 周报模板优化
status: pending | priority: med | created: 2026-06-30 | due: 2026-07-15 | repeat: weekly | repeat_until: 2026-12-31 | order: 2

- [ ] 设计新的进度展示格式
- [ ] 找两个同事试用
- [ ] 根据反馈调整

---

### 每日站会记录
status: active | priority: low | created: 2026-07-01 | due: 2026-07-04 | repeat: weekdays | order: 3

- [x] 确认昨日进度 (2026-07-04T09:30:00+08:00)
- [ ] 记录今日计划

---

## 项目Beta

### 架构文档评审
status: done | priority: high | created: 2026-06-25 | due: 2026-07-03 | order: 1

- [x] 阅读初稿 (2026-07-01T11:00:00+08:00)
- [x] 反馈意见 (2026-07-02T16:00:00+08:00)

🏁 2026-07-03T17:30:00+08:00 | ⏱ 8d

---
```

### 2.3 格式规则（严格定义）

#### 元数据结构

| 字段 | 格式 | 位置 | 必填 | 说明 |
|---|---|---|---|---|
| `status` | `pending` / `active` / `done` | 任务元数据行 | 否 | 由系统根据子任务状态自动推断并维护；无子任务时用户点击完成也会写入 `done` |
| `priority` | `high` / `med` / `low` | 任务元数据行 | 否（默认 `med`） | |
| `created` | ISO 日期 `YYYY-MM-DD` | 任务元数据行 | 是 | 创建时间，自动生成 |
| `start` | ISO 日期 | 任务元数据行 | 否 | 开始时间 |
| `due` | ISO 日期 | 任务元数据行 | 否 | 截止时间 |
| `repeat` | 见下文 | 任务元数据行 | 否 | 重复规则 |
| `repeat_until` | ISO 日期 | 任务元数据行 | 否 | 重复结束日期 |
| `repeat_count` | 数字 | 任务元数据行 | 否 | 重复次数上限（当前已解析/序列化，但未在自动推进逻辑中强制限制） |
| `order` | 数字 | 任务元数据行 | 否 | 拖拽排序序号 |
| `tags` | 逗号分隔字符串 | 任务元数据行 | 否 | 标签列表 |

#### 任务状态推断规则

`status` 字段由系统**自动维护**，序列化时始终写入当前推断值。推断规则如下：

| 场景 | 系统行为 |
|---|---|
| 该任务**没有子任务** | 状态为 `pending`；用户点击完成按钮 → 变为 `done` 并追加 `🏁` 行 |
| 有子任务，**全部标记完成** | 状态为 `done`，追加/更新 `🏁` 完成总结行 |
| 有子任务，**部分完成** | 状态为 `active`，如存在 `🏁` 行则删除 |
| 有子任务，**全部未完成** | 状态为 `pending`，如存在 `🏁` 行则删除 |
| 已完成的任务，某子任务被取消 | 重新推断，回退到 `active` 或 `pending`，删除 `🏁` 行 |

#### 子任务格式

子任务的深度通过缩进表示。**简单子任务维持一行格式：**

```markdown
- [ ] 任务描述
- [x] 任务描述 (YYYY-MM-DDThh:mm:ss+08:00)
  - [ ] 二级子任务
    - [x] 三级子任务 (YYYY-MM-DDThh:mm:ss+08:00)
```

已完成子任务在末尾括号内记录**完成时间（ISO 8601 带时区）**。元数据结构和解析器对子任务深度不做限制；当前 UI 默认渲染并允许编辑 3 层，更深层级在任务卡片中自动折叠展示「展开」按钮。

**子任务开始/截止日期：**

子任务支持独立的 `start` 和 `due` 字段，写法与 `note:` / `link:` 一致：以该子任务的缩进级别 +2 空格开始，放在子任务行之后、下一个子任务或备注/链接行之前。

```markdown
- [ ] 收集飞书任务功能列表
  start: 2026-07-05
  due: 2026-07-08
- [x] 收集 Notion 功能列表 (2026-07-03T10:00:00+08:00)
  due: 2026-07-03
  note: 已确认 Notion 最新版功能清单
```

规则：
- `start:` / `due:` 后接 ISO 日期（建议 `YYYY-MM-DD`），解析时按日期字符串原样保留。
- 多个子任务属性（`start` / `due` / `note` / `link`）可以任意顺序出现，但都必须位于该子任务缩进 +2 空格的级别。
- 出现下一个 `- [ ]`（同级或更深）或非属性行时，当前子任务的属性块结束。

#### 备注与链接

备注和链接是「挂件」，不改变任务结构。**主任务和子任务均支持备注和链接。**

**主任务备注/链接：** 放在子任务列表之后、`###` 区块结束前。

```markdown
### 任务标题
...
- [ ] 子任务

**备注**
备注内容（Markdown 自由格式）

**链接**
- [标题](https://example.com)
```

**子任务备注/链接/日期：** 放在该子任务行之后、下一个 `- [ ]` 或 `---` 之前，通过缩进后缀的标记行关联：

```markdown
- [ ] 子任务标题
  start: 2026-07-05
  due: 2026-07-08
  note: 备注内容
  link: [标题](https://example.com)
- [ ] 下一个子任务
  - [ ] 嵌套子任务
    due: 2026-07-10
    note: 更深层的备注
```

使用 `note:` / `link:` / `start:` / `due:` 前缀行替代 `**备注**` 段落，原因是：
- 缩进段落与列表项的关联在不同解析器下行为不一致。
- `note:` / `link:` / `start:` / `due:` 前缀是确定性的行级别标记，解析器不需要判断缩进上下文。
- 相比多行块格式，解析逻辑从「判断缩进延续范围」简化为「前缀匹配」。

备注/链接/日期段落均以该子任务的缩进级别 +2 空格开始，遇到下一个 `- [ ]`（同级或更深）或非属性行时结束。`note:` 支持多行续写，保留子任务备注中的无序列表等 Markdown 内容。

主任务和子任务备注/链接均可选，两个段落可同时存在或都不存在。

#### 任务完成总结标记

```
🏁 2026-07-03T17:30:00+08:00 | ⏱ 8d
```

- `🏁`：任务完成时间（自动写入）。
- `⏱`：耗时（从完成时间减去 `start` 或 `created` 计算，精确到天）。
- 写入规则：任务所有子任务完成时自动追加到任务区块末尾；回退时删除。

#### 任务分隔线

`---` 是可选的视觉分隔线，**不作为解析依据**。解析时以 `###` 为任务起点、下一个 `###` 或 `##` 或文件末尾为任务终点。

```markdown
### 任务A
...

---          ← 可选，纯视觉糖

### 任务B   ← 这才是任务B的边界
...
```

即：`---` 的缺失不会导致解析错误，`---` 出现在备注内也不会干扰解析。

#### 清单元数据

在文件头部 `<!-- todo:list-meta ... -->` 块中记录清单元数据：
- `created`：创建时间。
- `archived`：是否已归档。

#### 清单内分组

以 H2 `## 分组名` 作为分组标题，分组内可包含多个任务。不限制分组深度（但建议不超过两级，即 H2 内 H3 做任务）。解析器会在没有 H2 时自动插入「默认分组」。

### 2.4 解析方案（两遍扫描）

**核心原则：** 不依赖通用 Markdown 解析器（remark）的语义来提取任务结构。通用解析器只用于渲染备注/链接中的富文本内容。任务结构本身通过**专用两遍行级扫描器**提取。

#### 第一遍：结构扫描（行级，不解析 AST）

输入：原始 Markdown 文本（按行分割）
输出：文件标题、清单元数据、任务块分组列表

```typescript
type TaskBlock = {
  heading: string;           // ### 后的标题文本
  metadata: string;          // ### 下方第一行（如果是元数据行）
  bodyLines: string[];       // 元数据行之后、下一个 ###/##/EOF 之前的所有行
}

function scanBlocks(lines: string[]): { title: string; meta: ListMeta; groups: RawGroup[] }
```

实际实现要点（`src/parser/scanner.ts`）：
- `# 标题` 提取为清单名。
- `<!-- todo:list-meta ... -->` HTML 注释块整体解析为 `ListMeta`。
- `## 分组名` 开启新分组，并 flush 上一个任务块。
- `### 任务标题` 开启新任务块，并 flush 上一个任务块。
- 第一个非空行若为 `key: value | ...` 格式则视为元数据行；否则归入 `bodyLines`。
- 元数据行必须顶格（无前导缩进），避免与子任务属性行混淆。
- `---` 被完全忽略（不影响解析，不产生语义）。

#### 第二遍：细节解析（逐块）

```typescript
type ParsedTask = {
  title: string;
  priority: 'high' | 'med' | 'low';
  status: 'pending' | 'active' | 'done';
  created: string;       // ISO date
  start?: string;
  due?: string;
  repeat?: string;
  repeat_until?: string;
  repeat_count?: number;
  order?: number;
  tags?: string[];
  subtasks: ParsedSubtask[];
  note?: string;          // 备注（Markdown 文本）
  links?: Link[];
  completed_at?: string;  // 🏁 时间
  duration?: string;      // ⏱ 耗时
  group: string;          // 所属分组名
}

type ParsedSubtask = {
  text: string;
  level: number;           // 1/2/3...
  completed: boolean;
  completed_at?: string;
  start?: string;          // 开始日期
  due?: string;            // 截止日期
  note?: string;
  links?: Link[];
  children: ParsedSubtask[];
}
```

**元数据行解析：**
- 按 `|` 分割（前后允许空格）。
- 每段按第一个 `:` 分割为 key/value。
- 只识别预定义的字段名列表（`META_KEYS`），未知字段忽略。
- 使用专用 parser 处理 `status`、`priority`、`repeat_count`、`order`、`tags` 等字段。

**子任务解析（逐行扫描 bodyLines）：**
- 匹配 `^(\s*)-\s*\[([ xX])\]\s+(.+)$` 正则。
- 前置空格数 `indent` → 除以 2 得 `level`（1=一级子任务，2=二级）。
- `level` 跨越式增长时自动补齐中间层级（如从 level 1 跳到 level 3，中间插入空 level 2）。
- 子任务行之后，如果下一行以 `note:` / `link:` / `start:` / `due:` 开头且缩进 `>= indent + 2`，归属该子任务。
- 连续多个 `note:` 行拼接为多段备注（保留换行）。
- `start:` / `due:` 行取冒号后日期字符串，赋值给子任务对应字段。

**备注与链接解析：**
- 在 bodyLines 中发现 `**备注**` 行 → 之后的段落（直到下一个 `**链接**`、`###` 或 `🏁`）为备注内容。
- 在 bodyLines 中发现 `**链接**` 行 → 之后的 Markdown 链接列表解析为 `Link[]`。
- 备注和链接**不归入子任务列表**，它们是主任务层级的挂件。

**🏁 行解析：**
- 匹配 `🏁 (ISO时间) \| ⏱ (耗时)`。
- 位置在任务区块末尾，属于主任务。
- 若元数据为 `done` 但缺少 `🏁` 行，解析器会自动补全当前时间与耗时。

#### 序列化（逆向过程）

从当前内存中的 `ParsedList` 逆向生成 Markdown 文本。序列化是严格确定的，不保留源格式中的无关空格、缩进差异或 `---` 位置。即：**解析 → 修改 → 序列化 = 格式化后的标准 Markdown。**

**序列化算法概览：**
1. 写入 `# 清单名`。
2. 写入 `<!-- todo:list-meta ... -->` 块。
3. 写入分组标题 `## 分组名`。
4. 对每个任务：
   a. 写入 `### 标题`
   b. 写入元数据行（按固定字段顺序：status → priority → created → start → due → repeat → repeat_until → repeat_count → order → tags）
   c. 空行
   d. 递归写入子任务（每个子任务一行 `- [x] 描述 (时间)`，子任务备注/链接/日期以 `note:` / `link:` / `start:` / `due:` 前缀另起一行）
   e. 空行
   f. 如果有备注，写入 `**备注**\n备注内容`
   g. 如果有链接，写入 `**链接**\n- [标题](url)`
   h. 如果已完成，写入 `🏁 时间 | ⏱ 耗时`
   i. 写入 `---`

**关键原则：** 序列化产生的 Markdown 一定可被解析器正确重新解析。双向转换是**无损的**。

---

## 三、核心功能行为定义

### 3.1 状态推断引擎

状态推断与完成标记由 `normalizeTask`（`src/parser/serializer.ts`）统一处理：

```typescript
function normalizeTask(task: Task, explicitStatus?: TaskStatus): Task {
  const inferred = inferStatus(task.subtasks, task.completed_at);
  const nextStatus = explicitStatus ?? inferred;
  let completedAt = task.completed_at;
  let duration = task.duration;

  if (nextStatus === 'done' && !completedAt) {
    completedAt = nowIso();
    duration = task.meta.start
      ? durationDays(task.meta.start, completedAt)
      : durationDays(task.meta.created, completedAt);
  }

  if (nextStatus !== 'done') {
    completedAt = undefined;
    duration = undefined;
  }

  return { ...task, meta: { ...task.meta, status: nextStatus }, completed_at: completedAt, duration };
}
```

**写入规则：**
- 子任务变化时实时触发重算。
- 无子任务任务被用户点击完成 → 显式传入 `done`，写入 `status: done` + `🏁` 行。
- `done` → 回退（用户取消子任务或手动改状态）→ 删除 `🏁` 行，重算写入新的状态。
- 所有任务在序列化时都会写出 `status` 字段。

### 3.2 周期性任务引擎

**规则：** 到期日由 `due` 日期 + `repeat` 规则共同决定，**与完成日期无关**。

```
repeat: daily          → 次日
repeat: weekly         → 下周同一天（周一为基准）
repeat: monthly        → 下月同日
repeat: weekdays       → 下一个工作日
repeat: mon,wed,fri    → 最近的设定星期（逗号分隔英文缩写）
repeat: 1,15           → 最近的设定月日（逗号分隔数字）
```

**关键行为：**
- 用户完成一个周期性任务后，系统**自动下移该任务**，更新 `due` 为下一个周期日，并重置所有子任务为未完成、清除 `completed_at` 与 `duration`。
- `repeat_until` 达到后不再自动下移（`repeat_count` 已解析但未在自动推进逻辑中强制限制）。
- 如果任务的 new `due` 已经过期（比如用户很久没打开系统），仍然按规则计算，不做跳跃。

**数据结构示例：**
```markdown
### 每周同步
status: pending | priority: med | created: 2026-06-01 | due: 2026-07-06 | repeat: weekly | order: 1
```

完成一次后变成：
```markdown
### 每周同步
status: pending | priority: med | created: 2026-06-01 | due: 2026-07-13 | repeat: weekly | order: 1
```

### 3.3 删除行为

- **删除任务：** 物理删除该 `###` 到下一个 `###`/`##`/EOF 之间的整个区块（包括子任务、备注、链接、完成总结）。
- **批量删除任务：** 用户可在任务列表进入批量选择模式，勾选多个任务后一键确认删除；底层调用 `deleteTasks(ids[])` 一次性从 `groups` 中移除。
- **删除分组：** 物理删除该 `##` 到下一个 `##` 或文件末尾之间的所有内容；删除后若清单无分组，自动创建「默认分组」。
- **删除清单：** 物理删除整个文件（删除前弹二次确认）。

### 3.4 浏览器 Notification API 实现

```typescript
Notification.requestPermission().then((permission) => {
  if (permission !== 'granted') return;

  const check = () => {
    const allTasks = Object.values(fileCache).flatMap((list) => list.groups.flatMap((g) => g.tasks));
    for (const task of allTasks) {
      if (task.meta.due && isDueToday(task.meta.due) && task.meta.status !== 'done') {
        const key = `${task.id}-${task.meta.due}`;
        if (!hasNotified(task.id, task.meta.due)) {
          new Notification('待办提醒', { body: `${task.title} 今天到期`, tag: key });
          cacheNotified(task.id, task.meta.due);
        }
      }
    }
  };

  check();
  setInterval(check, 60_000);
});
```

**实现范围：** 页面打开时请求权限，每分钟检查所有清单中「今天到期且未完成」的任务，弹通知并记录到 `dong-todo:notified-tasks`。页面关闭即停止。

### 3.5 排序与过滤

**排序（三个视图可切换，默认拖拽排序）：**
1. 自定义拖拽排序（默认）—— 用户拖拽决定顺序，结果写入 `order` 字段。
2. 按截止时间升序（无 due 的任务排在最后）。
3. 按优先级降序（高 > 中 > 低）。

**过滤条（同时可组合）：**
- 状态：多选 `pending` / `active` / `done`，空数组表示全部。
- 优先级：全部 / 高 / 中 / 低。
- 关键词搜索（实时模糊匹配任务标题、备注、标签）。
- 时间段：全部 / 今天到期 / 本周到期 / 已逾期。
- 分组：点击侧边栏分组可只显示该分组任务（与过滤条件可叠加）。

**智能列表：** 侧边栏「今天」「已安排」「全部」「已标记」点击后自动设置过滤条件：
- 今天：`timeRange: today`
- 已安排：`timeRange: week`
- 全部：清空所有过滤
- 已标记：`priority: high`

**搜索：** 前端全量搜索标题 + 备注 + 标签，无需后端。

### 3.6 进度可视化

**清单层级（文件级别）：** 统计该清单下所有任务，展示进度条与 `done/total`。

**分组层级（H2 级别）：** 同上，按分组统计；分组标题栏 sticky 置顶。

**任务层级（H3 级别）：** 任务卡片上显示子任务完成数，如 `2/5`。

全部在 UI 中实时计算，不写入 Markdown。

### 3.7 周报导出

为便于撰写工作周报，系统支持按清单导出本周已完成事项到剪贴板。

- **触发位置**：中间内容区顶部标题栏右侧的「导出周报」按钮。
- **导出范围**：当前自然周（周一 00:00 至周日 23:59）。判断依据包括任务 `completed_at` 和子任务 `completed_at`。
- **输出格式**：纯文本，按原分组顺序组织，分组序号使用中文数字，组内任务使用阿拉伯数字编号，下方列出本周完成的子任务。
- **空结果**：若本周无完成事项，提示「本周暂无已完成事项」。

---

## 四、用户界面方案

### 4.1 页面结构

当前为桌面端为主的左右布局；暂未实现移动端 Drawer 适配。

```
┌────────────────────────────────────────────────────────────┐
│ 侧边栏 (240px)              │ 任务内容区                     │
├─────────────────────────────┬──────────────────────────────┤
│                             │                              │
│ [Dong Todo logo]            │ [清单名] [进度条] [导出周报]   │
│                             │ [新建分组] [批量] [排序切换]   │
│ ─── 智能列表 ───            │                              │
│ 📋 今天                     │ [🔍 搜索任务...]              │
│ 📅 已安排                   │ [状态▼] [优先级▼] [时间▼]      │
│ 🗂 全部                     │                              │
│ ⚑ 已标记                   │ ━━━ 拖拽排序 ━━━━━━━━━━━━━━━  │
│                             │ ○ 任务1       🔴 07/10       │
│ ─── 我的清单 ───            │ ☐ 子任务1                    │
│ 📁 工作           8/20     │ ○ 任务2 进行中  🟡           │
│ 📁 学习           3/10     │ ○ 任务3          07/15       │
│ 📁 个人           5/5      │ ○ 任务4       🟢 明天        │
│                             │                              │
│ [+ 新建清单]               │ [+ 新建任务...]               │
│                             │                              │
│ [同步状态 ● 已同步 12:00]  │                              │
│ [🌙 主题] [设置] [立即同步]│                              │
└─────────────────────────────┴──────────────────────────────┘
```

**设计要点：**
- **侧边栏常驻显示**，宽度固定，不做收起/展开动画。
- **智能列表置于最上方**：今天、已安排、全部、已标记，固定不滚动。
- **自定义清单列表在下方**，每个清单行显示名称；展开当前清单后显示其分组及 `done/total`。
- **任务区顶部** 包含清单标题、进度条、导出周报、新建分组、批量选择、排序切换。
- **搜索/过滤条** 在标题栏下方，状态过滤为多选下拉。
- **任务行紧凑展示**：标题左侧为状态图标（无子任务时可点击完成）+ 右侧显示截止日期、优先级、重复规则、子任务进度。
- **拖拽手柄** 在每条任务左侧，仅在「拖拽排序」模式下可用。
- **底部新建栏**：任务区底部「新建任务」输入框；批量模式下底部变为批量操作栏。

### 4.2 路由设计

当前实现仅使用以下路由：

```
/           → MainLayout（清单/任务主界面，无配置时自动跳转 /settings）
/settings   → GitHub 配置/主题设置页面
*           → 重定向到 /
```

清单、分组、选中任务等状态由 Zustand 管理，不体现在 URL 路径中。

### 4.3 组件树（React）

```
<ThemeProvider>
  <NotificationProvider>
    <App>
      <AppRoutes>
        <Route / => <MainLayout>>
          <Sidebar>
            <SmartListsSection />
            <ListsSection>
              <ListRow />
              <ListGroups>
                <GroupRow />
                <NewGroupInput />
              </ListGroups>
            </ListsSection>
            <NewListInput />
            <SidebarFooter>
              <SyncIndicator />
              <PendingQueue />
              <ThemeToggle />
              <SettingsButton />
              <SyncButton />
            </SidebarFooter>
          </Sidebar>
          <ContentArea>
            <ConflictBanner />
            <ListHeader>
              <ProgressBar />
              <CopyWeeklyReportButton />
              <NewGroupButton />
              <BatchModeToggle />
              <ViewToggle />
            </ListHeader>
            <SearchBar />
            <FilterDropdown />
            <TaskList>               ← 可拖拽排序
              <SortableTaskCard>
                <DragHandle />
                <StatusIcon />
                <TaskTitle />
                <DueDateBadge />
                <PriorityBadge />
                <SubtaskItem />
              </SortableTaskCard>
            </TaskList>
            <NewTaskBar /> / <BatchActionBar />
          </ContentArea>
        </MainLayout>
        <Route /settings => <Settings />
      </AppRoutes>
      <ConfirmDialog />
      <ToastContainer />
    </App>
  </NotificationProvider>
</ThemeProvider>
```

### 4.4 关键交互

**新建任务：** 在底部「新建任务」输入框输入标题并按回车即可创建；默认使用当前选中的分组（未选分组则使用第一个分组），优先级默认中，无截止日期。

**编辑任务：** 点击任务卡片或标题 → 弹出居中 `TaskEditorDialog`，所有字段均可编辑：
- 标题、分组、优先级、状态。
- 开始时间、截止时间、重复规则、重复截止。
- 子任务（支持添加、删除、勾选、编辑标题、设置开始/截止、备注/链接、同层级拖拽排序）。
- 备注（Markdown，支持编辑/预览切换）。
- 链接（每行「标题 URL」，自动解析为 `Link[]`）。

**勾选子任务：** 点击 checkbox → 前端即时更新状态 → 写入时间戳 → 触发重算主任务状态 → 如果全部完成，自动写入 `🏁` 标记；若任务有 `repeat` 规则且完成，则自动推进到下一周期。

**完成任务（无子任务）：** 点击任务卡片左侧状态图标 → 若当前非 `done` 则调用 `completeTaskWithoutSubtasks` 写入 `done` + `🏁`；再次点击则回退为 `pending`。

**拖拽排序（任务）：** 任务列表默认支持拖拽排序，拖拽手柄在任务行左侧。排序结果通过 `order` 字段持久化写入 Markdown 元数据行。在分组视图下，拖拽仅在同一分组内生效。

**拖拽排序（子任务）：** 在任务编辑弹窗的子任务区域，同层级子任务可拖拽调整顺序。

**批量删除：** 点击顶部「批量」按钮进入选择模式，任务卡片左侧出现复选框；勾选后底部显示「删除 N 项」按钮，二次确认后批量删除。

**周报导出：** 点击顶部「导出周报」按钮，生成本周已完成事项的纯文本并写入剪贴板。

**主题切换：** 侧边栏底部/设置页可切换浅色/深色/跟随系统。

### 4.5 移动端适配

**当前实现状态：** 暂未实现专门的移动端 Drawer 适配。当前布局在桌面端侧边栏常驻，在小屏幕下会水平溢出。后续可补充：
- 顶栏左侧 ☰ 按钮触发 Drawer。
- 任务编辑弹窗在窄屏下改为全屏/底部滑出。
- 搜索框在顶栏右侧图标展开。
- 拖拽排序通过 dnd-kit 的触摸支持默认可用。

### 4.6 组件 Props 定义（TypeScript）

```typescript
// ========== 数据模型 ==========

interface TaskMeta {
  status?: 'pending' | 'active' | 'done';
  priority: 'high' | 'med' | 'low';
  created: string;           // ISO 8601
  start?: string;
  due?: string;
  repeat?: 'daily' | 'weekly' | 'monthly' | 'weekdays' | string;
  repeat_until?: string;
  repeat_count?: number;
  order?: number;
  tags?: string[];
}

interface Link {
  title: string;
  url: string;
}

interface Subtask {
  text: string;
  level: number;              // 1 | 2 | 3 ...
  completed: boolean;
  completed_at?: string;      // ISO 8601
  start?: string;             // ISO 日期
  due?: string;               // ISO 日期
  note?: string;
  links?: Link[];
  children: Subtask[];
}

interface Task {
  id: string;                 // 基于标题+创建时间的 hash
  title: string;
  meta: TaskMeta;
  subtasks: Subtask[];
  note?: string;              // Markdown 文本
  links?: Link[];
  completed_at?: string;      // 🏁 时间
  duration?: string;          // ⏱ 耗时文字
  group: string;              // 所属分组名
}

interface ListMeta {
  name: string;
  created: string;
  archived: boolean;
}

interface ParsedList {
  meta: ListMeta;
  groups: Group[];
  rawContent: string;
  sha?: string;
}

interface Group {
  name: string;
  tasks: Task[];
}

// ========== 组件 Props ==========

type SortMode = 'drag' | 'due' | 'priority';

interface FilterState {
  status: TaskStatus[];       // 空数组表示全部
  priority: 'all' | 'high' | 'med' | 'low';
  timeRange: 'all' | 'today' | 'week' | 'overdue';
}

interface TaskListProps {
  tasks: Task[];
  sortMode: SortMode;
  groupBy?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onReorderInGroup?: (groupName: string, fromIndex: number, toIndex: number) => void;
  onToggle: (taskId: string, path: number[]) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onComplete?: (taskId: string) => void;
  onToggleSelect?: (taskId: string) => void;
}

interface TaskEditorDialogProps {
  task: Task | null;
  groups: string[];
  onSave: (updated: Task) => void;
  onClose: () => void;
}

interface MarkdownPreviewProps {
  source: string;
  className?: string;
}
```

### 4.7 空/加载/错误状态 UI

**全局同步状态：** 侧边栏底部显示圆点指示器与最后一次同步时间。

| 状态 | 指示器 | 行为 |
|---|---|---|
| 已同步 | 绿色圆点 | 正常 |
| 同步中 | 黄色圆点 + 旋转图标 | 正在拉取或写入 |
| 待同步 | 黄色圆点 + 数字徽标 | 有待写入队列，点击可展开 |
| 离线 | 红色圆点 | 网络不可用 |
| 未配置 | 灰色圆点 | 无 GitHub Token |

点击同步状态可展开待同步文件列表，显示文件名与加入时间，并提供「全部重试」按钮。

**冲突提示条：** 当 `pushPending` 检测到远端 SHA 与本地缓存不一致时，顶部显示 `ConflictBanner`，提供「放弃本地」「使用本地」两个操作。

**清单为空（首次使用）：**

```
┌──────────────────────┐
│                      │
│     📋               │
│  还没有清单         │
│  点击「+ 新建清单」  │
│  开始管理你的待办    │
│                      │
│  [新建清单]          │
└──────────────────────┘
```

**清单内无任务：**

```
┌──────────────────────┐
│  [📁 工作]           │
│                      │
│     ✅               │
│  当前清单还没有任务  │
│  点击「+ 新建任务」  │
│                      │
└──────────────────────┘
```

**搜索无结果：**

```
┌──────────────────────┐
│  🔍 [搜索关键词]     │
│                      │
│      🔎             │
│  没有匹配的任务      │
│  试试其他关键词      │
│                      │
└──────────────────────┘
```

**Token 未配置/过期：**

首次打开无配置时自动跳转到 `/settings`，提供 Token、仓库所有者、仓库名、存储路径输入，以及主题切换和清除配置按钮。

**网络错误/GitHub API 限流：**

非阻断式 toast 提示（成功/错误/信息三种类型），几秒后自动消失。用户可继续编辑，修改暂存在 `localStorage`。

---

## 五、技术方案

### 5.1 技术栈

| 层级 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 构建工具 | Vite | ^6.x | 快速 HMR |
| 框架 | React | ^19.x | |
| 语言 | TypeScript | ^5.x | 严格模式 |
| 路由 | React Router DOM | ^7.x | |
| 状态管理 | Zustand | ^5.x | 轻量，多个独立 store |
| Markdown 结构解析 | 自写两遍扫描器 | — | 行级正则解析任务块/子任务/元数据，不依赖通用 Markdown 解析器 |
| Markdown 富文本渲染 | react-markdown + remark-gfm | ^9.x / ^4.x | 仅用于渲染备注/链接中的富文本内容 |
| GitHub API | Octokit | ^4.x | 官方 SDK |
| PWA | vite-plugin-pwa | ^0.21.x | 离线缓存 + 可安装 |
| 样式 | Tailwind CSS | ^4.x | CSS 变量主题 |
| UI 组件 | 手写 + Radix UI（Dialog / DropdownMenu / Select / Tooltip）| 最新 | 保持轻量 |
| 拖拽 | @dnd-kit/core + sortable | ^6.x / ^8.x | 触摸友好 |
| 通知 | Web Notifications API | 原生 | 无需库 |
| 日期处理 | date-fns | ^4.x | 轻量日期库 |
| 图标 | lucide-react | ^1.x | |

### 5.2 为什么选这些

- **Zustand** 比 Redux 轻量得多，这个系统状态复杂度不高，不需要 Redux 的分层。
- **自写两遍扫描器**：结构解析用行级正则，不依赖通用解析器的 AST 语义，确保边界判定和子任务层级准确无误。
- **react-markdown + remark-gfm**：仅用于渲染备注和链接中的 Markdown 富文本（加粗、列表、代码块等），不做结构提取。
- **Octokit** 是 GitHub 官方 SDK，处理了鉴权和分页。
- **dnd-kit** 比 react-beautiful-dnd 更现代、触摸支持更好。
- **Radix UI**：提供无障碍、可访问性良好的基础弹窗/下拉组件，避免从零造轮子。

### 5.3 GitHub API 方案

**需要的权限：**
- `Contents: Read and write`（读写文件）。
- 可选 `Metadata: Read`（检查仓库基本信息）。

**API 调用模式（`src/github/client.ts`）：**

```typescript
// 初始化
const octokit = new Octokit({ auth: token });

// 读取清单文件
async function getFileContent(config, path): Promise<{ content: string; sha: string }>

// 写入清单文件
async function writeFileContent(config, path, content, sha?): Promise<string>

// 删除清单文件
async function deleteFile(config, path, sha): Promise<void>

// 获取所有 Markdown 文件列表
async function listMarkdownFiles(config): Promise<{ name: string; sha: string; path: string }[]>
```

**Token 配置：**
- 用户需手动创建一个 Fine-grained PAT（GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens）。
- 权限：选择目标仓库，`Contents: Read and write`。
- Token 与仓库信息存储在 `localStorage`，键为 `dong-todo:github-config`。
- ⚠️ 风险提示：Token 存在浏览器中，安全性等同于用户的设备安全。

**同步策略（实际实现）：**

**核心模型：** 本地缓存 + GitHub 远端 = 两副本，通过文件 SHA 比对判断差异。

```
GitHub Repo (远端权威) ←── getFileContent / writeFileContent ──→ 浏览器 localStorage (本地缓存)
                                      ↑                                ↑
                                      │ 文件级 SHA 比对                 │ dong-todo:file:{name}
                                      │ 待写入队列                      │ dong-todo:pending-writes
                                      │ 冲突提示条                      │ dong-todo:sha-map
```

**触发拉取（Pull）的时机：**
1. 页面加载/刷新 → 全量拉取清单列表与当前激活清单内容。
2. 页面从后台切回前台（`visibilitychange`）→ 调用 `pollSha()` 刷新远端 SHA 映射（目前仅缓存 SHA，不自动拉取新内容）。
3. 定时轮询 → 每 60 秒静默比对一次清单文件的 SHA（仅存 SHA，不拉内容）。
4. 用户手动点击「立即同步」→ 触发 `pushPending()`。

**写入（Push）策略：**
- 每次编辑操作后**立即更新本地 `fileCache` 与待写入队列**，UI 不阻塞。
- 触发**文件级防抖后台同步**（1.5 秒）：`saveListContent` 将序列化内容加入 `dong-todo:pending-writes`，然后启动 `triggerDebouncedSync`。
- 后台同步时先读取远端文件 SHA，若与本地缓存 SHA 不一致则标记为冲突；否则携带远端 SHA 写入。
- 写入失败时（断网 / API 错误）保留 `pending-writes`，`syncStore` 状态变为 `unsaved`，网络恢复后自动重试或用户手动重试。
- **当前未实现三路合并**：检测到 SHA 不一致时不会自动拉取合并，而是交由 `ConflictBanner` 让用户选择「放弃本地」或「使用本地」。

**缓存键（`src/utils/storage.ts`）：**
- `dong-todo:github-config`：GitHub Token / owner / repo / basePath。
- `dong-todo:active-list`：最后选中的清单名。
- `dong-todo:file:{name}`：清单文件原始 Markdown + SHA + 缓存时间。
- `dong-todo:sha-map`：文件名 → 远端 SHA 映射。
- `dong-todo:pending-writes`：待写入队列（文件名 → { content, timestamp }）。
- `dong-todo:notified-tasks`：已发送通知的任务 ID → due 映射。

**冲突处理（单用户场景简化）：**
- 当前策略是让用户在 `ConflictBanner` 中选择策略：
  - **放弃本地**：清除该文件待写入记录，下次拉取时显示远端版本。
  - **使用本地**：立即重试 pushPending，用本地内容覆盖远端。
- 未来若多端使用频繁，可补充自动拉取 + 三路合并。

### 5.4 离线策略

- `localStorage` 缓存所有清单文件完整内容 + SHA。
- 写入失败时（断网）暂存到 `dong-todo:pending-writes`，联网后由 `online` 事件自动触发 `pushPending()`。
- 侧边栏同步状态指示离线，并展示待同步文件队列与手动重试按钮。
- 当前「离线编辑」能力有限：离线时仍可继续编辑，编辑会追加到待写入队列；但不能主动创建/删除清单（这些操作需要即时 API 调用）。

### 5.5 Zustand Store 设计

当前拆分为 5 个独立 store：

```typescript
// ===================== 同步 Store =====================
interface SyncStore extends SyncStatusState {
  config: GithubConfig | null;
  conflictFiles: string[];
  configure: (token: string, owner: string, repo: string, basePath?: string) => void;
  ensureInitialized: () => boolean;
  pollSha: () => Promise<Record<string, string> | null>;
  pushPending: () => Promise<{ succeeded: string[]; failed: string[]; conflicts: string[] }>;
  resolveConflict: (fileName: string, strategy: 'local' | 'remote') => Promise<void>;
  clear: () => void;
}

interface SyncStatusState {
  status: 'synced' | 'syncing' | 'unsaved' | 'offline' | 'unconfigured';
  lastSyncAt: string | null;
  pendingWrites: number;
}

// ===================== 清单 Store =====================
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

// ===================== 任务 Store =====================
interface TasksState {
  tasks: Task[];
  selectedTaskId: string | null;
  sortMode: SortMode;
  filter: FilterState;
  searchQuery: string;

  loadTasks: (listName: string) => Promise<void>;
  createTask: (title: string, group?: string) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task> & { meta?: Partial<TaskMeta> }) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  deleteTasks: (ids: string[]) => Promise<void>;
  toggleSubtask: (taskId: string, path: number[]) => Promise<void>;
  completeTaskWithoutSubtasks: (taskId: string) => Promise<void>;
  reorderTasks: (fromIdx: number, toIdx: number) => Promise<void>;
  reorderTasksInGroup: (groupName: string, fromIdx: number, toIdx: number) => Promise<void>;
  refreshTasks: (listName: string) => void;
  selectTask: (id: string | null) => void;
  setSortMode: (mode: SortMode) => void;
  setFilter: (f: Partial<FilterState>) => void;
  setSearchQuery: (q: string) => void;
  getFilteredTasks: () => Task[];
  getSelectedTask: () => Task | null;
}

// ===================== 主题 Store =====================
interface ThemeState {
  theme: 'light' | 'dark' | 'system';
  effectiveTheme: 'light' | 'dark';
  cycleTheme: () => void;
}

// ===================== 确认/提示 Store =====================
interface ConfirmState {
  open: boolean;
  message: string;
  confirm: (message: string) => Promise<boolean>;
}

interface ToastState {
  toasts: ToastItem[];
  showToast: (message: string, options?: { type?: ToastType; duration?: number }) => void;
  dismiss: (id: string) => void;
}
```

**Store 交互流程（典型场景）：**

```
页面加载
  → SyncStore 从 localStorage 读取 token 并 initGitHub
  → 若未配置则 redirect /settings
  → ListsStore.fetchLists() 拉取清单列表
  → ListsStore.fetchListContent('工作') 拉取并解析默认清单
  → TasksStore.loadTasks('工作') 将解析结果写入 tasks

用户新建任务
  → TasksStore.createTask('标题')
  → 更新 list.groups 并序列化
  → ListsStore.saveListContent() 更新 fileCache + pending-writes + 触发防抖同步
  → 后台写入 GitHub → 更新 SHA → status = synced

用户切换清单
  → ListsStore.selectList('学习')
  → TasksStore.loadTasks('学习') 先使用本地缓存渲染，再后台拉取最新内容刷新

定时轮询
  → SyncStore.pollSha() 每 60s 检查所有文件 SHA
  → 仅更新 dong-todo:sha-map，不自动拉取内容
```

### 5.6 构建与部署

**构建产出：** 纯静态 SPA，无需后端服务器。

| 项目 | 配置 |
|---|---|
| 构建命令 | `npm run build` → 输出到 `dist/` |
| 静态托管 | GitHub Pages |
| 自定义域名 | 可选，通过 CNAME 文件配置 |
| base 路径 | `/complete-todolist/`（`vite.config.ts` 中配置，部署到子路径时使用） |
| Token | 不打包进构建产物，用户在页面中输入 |

**部署步骤：**

```bash
# 1. 创建 GitHub 仓库（私有），用于存储待办数据
# 2. 创建另一个仓库（公开或私有），用于托管前端代码
# 3. 配置 GitHub Pages（托管前端仓库的 dist/ 目录）

# 可选：如想合并在同一个仓库
# ├── todo/       ← 待办数据（Markdown 文件）
# ├── src/        ← 前端源码
# ├── dist/       ← 构建产出（部署到 GitHub Pages）
# └── ...
```

---

## 六、扩展预留

### 6.1 Markdown 格式扩展字段

当前元数据行已经预留了扩展空间——所有字段都是键值对 `key: value` 格式，新增字段只需加新的键：

```markdown
### 任务标题
priority: high | due: 2026-07-10 | created: 2026-06-28 | order: 3 | tags: 调研,竞品
```

**已预留字段：**
- `order`：自定义排序序号（已启用，拖拽排序默认使用）。
- `tags`：标签（逗号分隔，已解析并参与搜索）。
- `repeat_count`：重复次数上限（已解析/序列化，自动推进逻辑尚未强制限制）。

### 6.2 任务嵌套深度

元数据结构和解析器对子任务深度不做限制。当前 UI 默认渲染/编辑 3 层，更深层级在任务卡片中自动折叠展示「展开」按钮。

### 6.3 未来可能的扩展方向（不纳入当前版本）

- 看板视图（拖拽跨列改变状态）。
- 日历视图（以截止时间分布在日历上）。
- Service Worker 实现后台通知。
- GitHub Actions 定时推送邮件。
- 多用户协作（通过 repo 的 collaborator 机制 + 文件锁）。
- 番茄钟功能（跟任务绑定）。
- 统计数据面板（完成率趋势图）。
- 移动端 Drawer 与响应式布局。
- 任务/子任务到期前更细粒度提醒。

---

## 七、当前版本交付范围

| 功能 | 状态 | 说明 |
|---|---|---|
| 清单管理（创建/删除/重命名） | ✅ | |
| 分组管理（创建/选择/删除/重命名） | ✅ | 重命名/删除 UI 在清单展开后的分组行上 |
| 任务 CRUD（创建/编辑/删除） | ✅ | |
| 批量删除任务 | ✅ | 多选后确认删除 |
| 子任务（多层） | ✅ | 解析/序列化无限层，UI 默认 3 层 |
| 子任务拖拽排序 | ✅ | 任务编辑弹窗内同层级拖拽 |
| 状态推断引擎 | ✅ | 主任务状态自动推断 + 无子任务场景 |
| 优先级设置 | ✅ | |
| 开始/截止时间 | ✅ | 任务 + 子任务均支持 |
| Markdown 备注 | ✅ | 支持编辑/预览切换 |
| 链接 | ✅ | |
| 搜索与过滤 | ✅ | 标题/备注/标签搜索；状态多选 |
| 排序（截止时间/优先级/拖拽） | ✅ | 拖拽排序为默认视图，顺序写入 `order` 字段 |
| 进度可视化（分组/清单层面） | ✅ | |
| GitHub API 同步 | ✅ | 读写私有仓库 |
| 删除清单 | ✅ | 物理删除，带二次确认 |
| 周期性任务 | ✅ | daily/weekly/monthly/weekdays/自定义 |
| Notification API 提醒 | ✅ | 今天到期提醒 |
| 已完成任务保留在原文件 | ✅ | status 推断，不拆分文件 |
| 周报导出 | ✅ | 按自然周导出已完成事项 |
| 主题切换 | ✅ | 浅色/深色/跟随系统 |
| 回收站功能 | ❌ | 暂不实现，删除前弹确认 |

### 延期项

| 功能 | 理由 |
|---|---|
| 看板视图 | 优先级不高，UI 复杂度大 |
| 离线完整支持 | 当前只做写入失败缓存与待写入队列，离线时新建/删除清单受限 |
| 回收站 | 暂不实现，删除时二次确认即可 |
| 移动端响应式布局 | 当前桌面优先，后续补充 Drawer |

---

## 八、开发顺序建议（已落地）

```
Phase 1: 基础架构
  ✅ Vite + React + TypeScript 项目初始化
  ✅ Zustand store 设计（syncStore / listsStore / tasksStore / themeStore / confirm+toastStore）
  ✅ 两遍扫描解析器（结构扫描 + 细节解析 + 序列化）
  ✅ Octokit GitHub API 模块（读/写/列表/删除）
  ✅ Token 配置页面
  ⚠️ 跨设备同步引擎（SHA 轮询 + 待写入队列 + 冲突提示已实现；自动拉取合并待完善）

Phase 2: 数据结构 + 渲染
  ✅ 两遍扫描解析器（结构扫描 + 细节解析）
  ✅ Markdown 渲染组件（react-markdown 渲染备注/链接）
  ✅ 状态推断引擎
  ✅ 周期性任务引擎
  ✅ 子任务开始/截止日期解析与序列化

Phase 3: 交互功能
  ✅ 清单管理（CRUD）
  ✅ 分组管理（创建/选择/删除/重命名）
  ✅ 任务编辑弹窗（居中 Dialog）
  ✅ 子任务勾选 + 完成时间记录
  ✅ 子任务拖拽排序
  ✅ 优先级/开始时间/截止时间
  ✅ 备注/链接编辑 + 实时预览
  ✅ 任务拖拽排序（dnd-kit 集成 + order 字段写入）
  ✅ 批量删除

Phase 4: 排序与搜索
  ✅ 按截止时间排序
  ✅ 按优先级排序
  ✅ 搜索过滤（标题/备注/标签）
  ✅ 状态多选过滤
  ✅ 进度统计

Phase 5: 通知与优化
  ✅ Notification API 提醒
  ✅ PWA 配置（vite-plugin-pwa）
  ✅ 离线缓存（写入失败暂存 localStorage，联网后自动重试）
  ✅ 待写入队列展示 + 手动重试
  ✅ 冲突提示条
  ✅ 主题切换
  ❌ 回收站（暂不实现，删除时二次确认即可）

Phase 6: 打磨
  ✅ UI 细节调整
  ✅ 错误处理完善（Toast 提示）
  ✅ 首次使用引导（无配置时自动跳转 /settings）
  ✅ 周报导出
```

---

## 九、已决策事项

1. **token 存储安全性** → `localStorage` 存储，因数据同步到 GitHub 仓库本身有版本控制，token 泄露的影响范围仅限该私有仓库的读写权限。
2. **文件冲突** → 当前方案（SHA 比对 + 冲突提示条 + 用户选择本地/远端）足够，因为一般只有一个人在用，冲突概率极低。暂未实现自动拉取合并。
3. **跨设备同步** → 页面加载/聚焦/定时轮询触发 SHA 比对；目前仅缓存远端 SHA，内容拉取发生在切换清单或首次加载时。写入采用防抖后台同步 + 失败重试。
4. **任务编辑 UI** → 使用居中弹窗而非右侧固定面板，以获得更大编辑空间。
5. **状态过滤** → 由单选改为多选，使用 Radix DropdownMenu 实现，空数组表示全部。
6. **子任务拖拽** → 仅在任务编辑弹窗内实现同层级拖拽，不改变父子关系。
7. **周报导出** → 输出纯文本而非 Markdown，便于直接粘贴到周报文档。

---

## 十、导出本周完成事项

为便于撰写工作周报，系统支持按清单导出本周已完成事项到剪贴板。

### 10.1 触发位置

- 在**中间内容区顶部**的标题栏右侧放置一个「导出周报」按钮。
- 点击后导出当前正在查看的清单（即 `activeListName` 对应的清单）。

### 10.2 导出范围

- 以当前自然周为范围：**周一 00:00 至周日 23:59**（采用中国常用的周一起始）。
- 判断依据包括：
  - 任务的 `completed_at` 字段（即 `🏁` 行记录的任务完成时间）。
  - 子任务的 `completed_at` 字段（子任务完成但主任务尚未完成时，也会纳入导出）。
- 只要任务本身或它的任意子任务在本周内完成，该任务就会被列出。

### 10.3 输出格式

输出为**纯文本**（非 Markdown），按原分组顺序组织：

```text
工作 本周完成事项（07/07 - 07/13）

一、项目Alpha
1. 竞品调研报告
  - 收集飞书任务功能列表
  - 收集 Notion 功能列表
2. 周报模板优化
  - 设计新的进度展示格式

二、项目Beta
1. 架构文档评审
  - 阅读初稿
  - 反馈意见
```

规则：

- 第一行为清单名 + "本周完成事项" + 本周起止日期。
- 每个有完成事项的分组显示一行分组标题，分组序号使用中文数字：`一、`、`二、`、`三、`…。
- 组内任务使用阿拉伯数字编号：`1.`、`2.`…，仅显示任务标题。
- 每个任务下方列出**本周内完成**的子任务，使用 `- ` 缩进两层（每深一层再缩进两空格）。
- 本周没有完成事项的分组不显示。
- 若整个清单本周没有完成事项，点击导出按钮后提示「本周暂无已完成事项」，不向剪贴板写入内容。

### 10.4 交互流程

1. 用户在中间内容区顶部点击「导出周报」按钮。
2. 系统判断当前清单数据：
   - 若本周无完成事项（含子任务），提示「本周暂无已完成事项」。
   - 否则把生成的纯文本写入剪贴板，并提示「已复制到剪贴板」。
3. 写入失败（如浏览器未授权剪贴板权限）时提示「复制失败，请检查浏览器权限」。

---

有问题或想调整的，直接说，我改。
