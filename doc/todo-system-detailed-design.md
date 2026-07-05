# 待办系统详细设计（基于 Markdown + GitHub Repo）

版本：v1.0 | 日期：2026-07-04 | 状态：已定稿

---

## 一、产品概述

一个纯前端 Web SPA 待办系统，数据以 Markdown 文件形式存储于 GitHub 私有仓库，通过 GitHub API 进行读写同步。

### 核心设计理念

- **Markdown 即数据库**：所有待办数据以纯 Markdown 存储，任何文本编辑器可打开读写，导出即原始文件
- **无后端依赖**：数据通过 GitHub API 直接在前端和仓库之间传输，不涉及任何后端服务器
- **离线友好**：浏览器缓存 + 本地存储作为加速层，支持断网时的基本读写

### 用户画像

- 主用户：本人（产品经理）
- 使用场景：桌面浏览器为主，配合浏览器 Notification API 做到期提醒
- 核心诉求：轻量、导出方便、数据在自己手里、跨设备同步

---

## 二、数据结构（Markdown 格式规范）

### 2.1 整体目录结构

```
todo/
├── README.md              # 自动生成的总览（各清单统计）
├── 工作.md                # 清单 = 一个 Markdown 文件
├── 学习.md
├── 个人.md
├── 生活.md
└── _archived/             # 用户主动归档的任务（规则见下文）
    ├── 工作.md
    └── 学习.md
```

- **一个清单 = 一个文件**，文件名即清单名
- 不支持嵌套目录做清单（如 `工作/项目A.md`），分组由文件内的 H2 承担
- `_archived/` 目录专门存放已被用户归档的旧任务，结构与主文件一致

### 2.2 清单文件格式

```markdown
# 工作

<!-- todo:list-meta
  created: 2026-06-01
  archived: false
-->

## 项目Alpha

### 竞品调研报告
status: active | priority: high | start: 2026-07-01 | due: 2026-07-10 | created: 2026-06-28

- [x] 收集飞书任务功能列表 (2026-07-02T14:30:00+08:00)
- [x] 收集 Notion 功能列表 (2026-07-03T10:00:00+08:00)
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
status: active | priority: med | due: 2026-07-15 | created: 2026-06-30
repeat: weekly | repeat_until: 2026-12-31

- [ ] 设计新的进度展示格式
- [ ] 找两个同事试用
- [ ] 根据反馈调整

---

### 每日站会记录
status: active | priority: low | due: 2026-07-04 | created: 2026-07-01
repeat: daily

- [x] 确认昨日进度 (2026-07-04T09:30:00+08:00)
- [ ] 记录今日计划

---

## 项目Beta

### 架构文档评审
status: done | priority: high | due: 2026-07-03 | created: 2026-06-25

- [x] 阅读初稿 (2026-07-01T11:00:00+08:00)
- [x] 反馈意见 (2026-07-02T16:00:00+08:00)

🏁 2026-07-03T17:30:00+08:00 | ⏱ 2d

```

### 2.3 格式规则（严格定义）

#### 元数据结构

| 字段 | 格式 | 位置 | 必填 | 说明 |
|---|---|---|---|---|
| `status` | `pending` / `active` / `done` | 任务元数据行 | 否 | 由系统根据子任务推断自动维护，无子任务时用户勾选直接写入 |
| `priority` | `high` / `med` / `low` | 任务元数据行 | 否（默认 `med`） | |
| `created` | ISO 日期 | 任务元数据行 | 是 | 创建时间，自动生成 |
| `start` | ISO 日期 | 任务元数据行 | 否 | 开始时间 |
| `due` | ISO 日期 | 任务元数据行 | 否 | 截止时间 |
| `repeat` | 见下文 | 任务元数据行 | 否 | 重复规则 |
| `repeat_until` | ISO 日期 | 任务元数据行 | 否 | 重复结束日期 |
| `repeat_count` | 数字 | 任务元数据行 | 否 | 重复次数上限 |

#### 任务状态推断规则（方案B：保留 status 字段，系统自动维护）

`status` 字段存储在元数据行中，但**用户不可直接编辑**，由系统根据以下规则自动写入：

**推断规则：**

| 场景 | 系统行为 |
|---|---|
| 该任务**没有子任务** | 元数据行不写 `status` 字段（视为 pending），UI 显示完成按钮；用户点击完成 → 系统写入 `status: done` |
| 有子任务，**全部标记完成** | 系统写入 `status: done`，追加 `🏁` 完成总结行 |
| 有子任务，**部分完成** | 系统写入 `status: active` |
| 有子任务，**全部未完成** | 系统写入 `status: pending`（首次创建时不写，隐含 pending） |
| 已完成的任务，某子任务被取消 | 系统重新计算，回退到 `active` 或 `pending`，删除 `🏁` 行 |

**无子任务场景的完成标记写入：**

用户点击完成按钮后，系统在元数据行写入 `status: done`，同时在任务末尾追加 `🏁` 完成总结行。不插入额外的子任务行。

#### 子任务格式

子任务的深度通过缩进表示。**简单子任务维持一行格式：**

```markdown
- [ ] 任务描述
- [x] 任务描述 (YYYY-MM-DDThh:mm:ss+08:00)
  - [ ] 二级子任务
    - [x] 三级子任务 (YYYY-MM-DDThh:mm:ss+08:00)
```

已完成子任务在末尾括号内记录**完成时间（ISO 8601 带时区）**。层级最多支持 3 层，元数据结构层数不做限制，UI 渲染 3 层以上自动折叠。

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

**子任务备注/链接：** 放在该子任务行之后、下一个 `- [ ]` 或 `---` 之前，通过缩进后缀的标记行关联：

```markdown
- [ ] 子任务标题
  note: 备注内容
  link: [标题](https://example.com)
- [ ] 下一个子任务
  - [ ] 嵌套子任务
    note: 更深层的备注
```

使用 `note:` 和 `link:` 前缀行替代 `**备注**` 段落，原因是：
- 缩进段落与列表项的关联在不同解析器下行为不一致
- `note:` 前缀是确定性的行级别标记，解析器不需要判断缩进上下文
- 相比多行块格式，解析逻辑从「判断缩进延续范围」简化为「前缀匹配」

备注/链接段落均以该子任务的缩进级别 +2 空格开始，遇到下一个 `- [ ]`（同级或更深）或非备注/链接行时结束。

主任务和子任务备注/链接均可选，两个段落可同时存在或都不存在。

#### 任务完成总结标记

```
🏁 2026-07-03T17:30:00+08:00 | ⏱ 2d
```

- `🏁`：任务完成时间（自动写入）
- `⏱`：耗时（从完成时间减去 created 或 start 计算，精确到天）
- 写入规则：任务所有子任务完成时自动追加到任务区块末尾

#### 任务分隔线

`---` 是可选的视觉分隔线，**不作为解析依据**。解析时以 `###` 为任务起点、下一个 `###` 或 `##` 或文件末尾为任务终点。

```
### 任务A
...

---          ← 可选，纯视觉糖

### 任务B   ← 这才是任务B的边界
...
```

即：`---` 的缺失不会导致解析错误，`---` 出现在备注内也不会干扰解析。

#### 清单元数据

在文件头部 `<-- todo:list-meta ... -->` 块中记录清单元数据：
- `created`：创建时间
- `archived`：是否已归档

#### 清单内分组

以 H2 `## 分组名` 作为分组标题，分组内可包含多个任务。不限制分组深度（但建议不超过两级，即 H2 内 H3 做任务）。

### 2.4 解析方案（两遍扫描）

**核心原则：** 不依赖通用 Markdown 解析器(remark)的语义来提取任务结构。通用解析器只用于渲染备注/链接中的富文本内容。任务结构本身通过**专用两遍行级扫描器**提取。

#### 第一遍：结构扫描（行级，不解析 AST）

输入：原始 Markdown 文本（按行分割）
输出：任务块列表

```typescript
type TaskBlock = {
  heading: string;           // ### 后的标题文本
  metadata: string;          // ### 下方第一行（如果是元数据行）
  bodyLines: string[];       // 元数据行之后、下一个 ###/##/EOF 之前的所有行
}

function scanBlocks(lines: string[]): TaskBlock[] {
  const blocks: TaskBlock[] = [];
  let currentBlock: TaskBlock | null = null;
  
  for (const line of lines) {
    // ### → 新任务开始
    if (line.startsWith('### ')) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { heading: line.slice(4), metadata: '', bodyLines: [] };
      continue;
    }
    // ## → 分组标题，也结束当前任务
    if (line.startsWith('## ')) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = null;
      continue;
    }
    // # → 文件标题（忽略）
    if (line.startsWith('# ') && !line.startsWith('## ')) continue;
    
    if (currentBlock) {
      // 第一个非空行 → 判断是否为元数据行
      if (!currentBlock.metadata && line.trim() && isMetaLine(line)) {
        currentBlock.metadata = line;
      } else {
        currentBlock.bodyLines.push(line);
      }
    }
  }
  if (currentBlock) blocks.push(currentBlock);
  return blocks;
}
```

**边界判定规则：**
- `###` = 绝对的任务起点，不依赖 `---` 或其他标记
- 遇到 `###`、`##`、`# `（文件头）、EOF 时关闭当前任务
- `---` 被完全忽略（不影响解析，不产生语义）
- 代码块内部的 `###` 被排除（标记检测）

#### 第二遍：细节解析（逐块）

```typescript
type ParsedTask = {
  title: string;
  priority: 'high' | 'med' | 'low';
  status: 'pending' | 'active' | 'done' | null;
  created: string;       // ISO date
  start?: string;
  due?: string;
  repeat?: string;
  repeat_until?: string;
  repeat_count?: number;
  subtasks: ParsedSubtask[];
  note?: string;          // 备注（Markdown 文本）
  links?: Link[];
  completed_at?: string;  // 🏁 时间
  duration?: string;      // ⏱ 耗时
  order?: number;         // 拖拽排序序号
}

type ParsedSubtask = {
  text: string;
  level: number;           // 1/2/3
  completed: boolean;
  completed_at?: string;
  note?: string;
  links?: Link[];
  children: ParsedSubtask[];
}
```

**元数据行解析：**
- 按 `|` 分割（前后允许空格）
- 每段按 `: ` 分割为 key/value
- 只识别预定义的字段名列表，未知字段忽略（预留）
- `status` 行不存在时视为 `pending`

**子任务解析（逐行扫描 bodyLines）：**
- 匹配 `  *- \[([ x])\] (.+)` 正则
- 前置空格数 `indent` → 除以 2 得 `level`（1=一级子任务, 2=二级）
- `level` 跨越式增长时自动补齐中间层级（如从 level 1 跳到 level 3，中间插入空 level 2）
- 子任务行之后，如果下一行以 `note:` 或 `link:` 开头且缩进 `>= indent + 2`，归属该子任务
- 连续多个 `note:` 行拼接为多段备注（保留换行）

**备注与链接解析：**
- 在 bodyLines 中发现 `**备注**` 行 → 之后的段落（直到下一个 `**链接**`、`---`、`###` 或 `🏁`）为备注内容
- 在 bodyLines 中发现 `**链接**` 行 → 之后的 Markdown 链接列表解析为 `Link[]`
- 备注和链接**不归入子任务列表**，它们是主任务层级的挂件

**🏁 行解析：**
- 匹配 `🏁 (ISO时间) \| ⏱ (耗时)`
- 位置在任务区块末尾，属于主任务

#### 序列化（逆向过程）

从当前内存中的 `ParsedTask[]` 逆向生成 Markdown 文本。序列化是严格确定的，不保留源格式中的无关空格、缩进差异或 `---` 位置。即：**解析 → 修改 → 序列化 = 格式化后的标准 Markdown。**

**序列化算法概览：**
1. 写入 `# 清单名`
2. 写入分组标题 `## 分组名`
3. 对每个任务：
   a. 写入 `### 标题`
   b. 写入元数据行（按固定字段顺序：status → priority → created → start → due → repeat → repeat_until → repeat_count → order）
   c. 空行
   d. 递归写入子任务（每个子任务一行 `- [x] 描述 (时间)`，子任务备注以 `note:` 前缀另起一行）
   e. 空行
   f. 如果有备注，写入 `**备注**\n备注内容`
   g. 如果有链接，写入 `**链接**\n- [标题](url)`
   h. 如果已完成，写入 `🏁 时间 | ⏱ 耗时`
   i. 写入 `---` 作为可读分隔

**关键原则：** 序列化产生的 Markdown 一定可被解析器正确重新解析。双向转换是**无损的**。

---

## 三、核心功能行为定义

### 3.1 状态推断引擎（方案B：写到元数据行）

**输入：** 一个任务的所有子任务 + 当前元数据行
**输出：** 写入 `status` 字段到元数据行 + 管理 `🏁` 行

```
function inferAndWriteStatus(task):
    subtasks = task.subtasks
    
    if subtasks 为空:
        // 无子任务时：不写 status 字段（隐含 pending）
        // 用户点完成 → 直接写入 status: done + 🏁 时间行
        return
    
    if 所有 subtasks 均为 done:
        写入 status: done
        追加 🏁 完成总结行（如已存在则更新）
    elif 至少一个 subtask 为 done:
        写入 status: active
        如果存在 🏁 行则删除
    else:
        写入 status: pending
        如果存在 🏁 行则删除
```

**写入规则：**
- 子任务变化时实时触发重算
- 首次创建无子任务的任务时，元数据行不写 `status` 字段
- 用户点击无子任务任务的完成按钮 → 直接写入 `status: done` + `🏁` 行
- `done` → 回退（用户取消子任务）：删除 `status` 字段和 `🏁` 行，重算写入新的状态

### 3.2 周期性任务引擎

**规则：** 到期日由 `due` 日期 + `repeat` 规则共同决定，**与完成日期无关**。

```
repeat: daily          → 每次完成后的次日
repeat: weekly         → 每次完成后的下周一（距离最近）
repeat: monthly        → 每次完成后的下月同日
repeat: weekdays       → 每次完成后的下一个工作日
repeat: mon,wed,fri    → 每次完成后的最近一个设定日
repeat: 1,15           → 每次完成后的最近一个设定日（每月1日和15日）
```

**关键行为：**
- 用户完成一个周期性任务后，系统**自动下移该任务**，更新 `due` 为下一个周期日
- `repeat_until` 或 `repeat_count` 达上限后，不再自动下移
- 如果任务的 new `due` 已经过期（比如用户很久没打开系统），仍然按规则计算，不做跳跃

**数据结构示例：**
```markdown
### 每周同步
priority: med | created: 2026-06-01 | due: 2026-07-06 | repeat: weekly
```

完成一次后变成：
```markdown
### 每周同步
priority: med | created: 2026-06-01 | due: 2026-07-13 | repeat: weekly
```

### 3.3 删除行为

- **删除任务：** 物理删除该 `###` 到 `---` 之间的整个区块（包括子任务、备注、链接、完成总结）
- **删除分组：** 物理删除该 `##` 到下一个 `##` 或文件末尾之间的所有内容
- **删除清单：** 物理删除整个文件（删除前弹二次确认）

### 3.4 浏览器 Notification API 实现

实现路径（非常简单）：

```typescript
// 请求权限
const permission = await Notification.requestPermission();
if (permission === 'granted') {
  // 注册定时检查
  setInterval(checkDueTasks, 60_000); // 每分钟检查一次
}

function checkDueTasks() {
  const tasks = getDueTasks(); // 从本地缓存取
  tasks.forEach(task => {
    if (task.due && isDueToday(task) && !notifiedBefore(task)) {
      new Notification('待办提醒', {
        body: `${task.title} 今天到期`,
        tag: task.id, // 去重
      });
      markNotified(task);
    }
  });
}
```

**第一期实现范围：** 页面打开时每分钟检查「今天到期」任务，弹通知。页面关闭就不管了（后续可扩展 Service Worker）。

### 3.5 排序与过滤

**排序（三个视图可切换，默认拖拽排序）：**
1. 自定义拖拽排序（默认）—— 用户拖拽决定顺序，结果写入 `order` 字段
2. 按截止时间升序
3. 按优先级降序（高 > 中 > 低）

**过滤条（同时可组合）：**
- 状态：全部 / 待处理 / 进行中 / 已完成
- 优先级：全部 / 高 / 中 / 低
- 关键词搜索（实时模糊匹配任务标题和备注）
- 时间段：今天到期 / 本周到期 / 已逾期

**搜索：** 前端全量搜索标题 + 备注，无需后端。Markdown 文本特征使得搜索极其简单。

### 3.6 进度可视化

**清单层级（文件级别）：** 统计该清单下所有任务，展示：

```
工作 (12/20 已完成)  ███████████░░░░░░░░░ 60%
```

**分组层级（H2 级别）：** 同上，按分组统计。

**任务层级（H3 级别）：** 子任务进度条。

全部在 UI 中实时计算，不写入 Markdown。

---

## 四、用户界面方案

### 4.1 页面结构（参考 Apple Reminders 布局）

```
┌──────────────────────────────────────────────────┐
│ 侧边栏                    │ 任务内容区            │
├───────────────────────────┬──────────────────────┤
│                           │                      │
│ 🔍 搜索清单...            │ 🔍 搜索任务...        │
│                           │                      │
│ ─── 智能列表 ───          │ ○ 任务1       🔴 07/10│
│ 📋 今天          3件待办  │ ☐ 子任务1            │
│ 📅 已安排         5件     │ ○ 任务2 进行中  🟡   │
│ 🗂 全部              12件 │ ━━━ 拖拽排序 ━━━━━━━  │
│ ⚑ 已标记           2件   │ ○ 任务3          07/15│
│                           │ ○ 任务4       🟢 明天 │
│ ─── 我的清单 ───          │                      │
│ 📁 工作           8/20 ✓ │                      │
│ 📁 学习           3/10 ✓ │                      │
│ 📁 个人           5/5  ✓ │                      │
│ 📁 生活           1/3  ✓ │                      │
│                           │                      │
│ [+ 新建清单]              │ [+ 新建任务]          │
│                           │                      │
│ 右下角: [设置] [同步: ✅] │                      │
└───────────────────────────┴──────────────────────┘
```

**设计要点：**
- **侧边栏常驻显示**，不做收起/展开动画，保持 Apple Reminders 式的稳定导航
- **智能列表置于最上方**：今天、已安排、全部、已标记，固定不滚动
- **自定义清单列表在下方**，每个清单行显示名称 + 进度（已完成/总数）
- **任务区顶部是搜索和排序**，搜索支持跨字段搜索
- **任务行紧凑展示**：标题左侧为状态图标 + 右侧显示截止日期和优先级标记
- **拖拽手柄**在每条任务左侧，长按/拖拽即可重新排序
- **底部新建按钮**：侧边栏底部「新建清单」，任务区底部「新建任务」

### 4.2 路由设计

```
/                    → 重定向到默认清单（最近使用的）
/清单名              → 显示该清单的任务列表（含分组）
/清单名/分组名       → 显示该分组下的任务列表
/清单名/任务id       → 任务详情页（查看/编辑）
/settings            → 设置页面（GitHub token、主题等）
```

### 4.3 组件树（React）

```
<App>
  <MainLayout>
    <Sidebar>
      <SidebarSearch />         ← 搜索清单
      <SmartListSection>        ← 智能列表区域
        <SmartListItem icon="📋" label="今天" count={3} />
        <SmartListItem icon="📅" label="已安排" count={5} />
        <SmartListItem icon="🗂" label="全部" count={12} />
        <SmartListItem icon="⚑" label="已标记" count={2} />
      </SmartListSection>
      <MyListsSection>          ← 我的清单列表
        <ListTitle>我的清单</ListTitle>
        <ListRow name="工作" progress={8/20} />
        <ListRow name="学习" progress={3/10} />
        <NewListButton />
      </MyListsSection>
      <SidebarFooter>
        <SettingsButton />
        <SyncStatusIndicator />
      </SidebarFooter>
    </Sidebar>
    <ContentArea>
      <Toolbar>
        <SearchBar />           ← 搜索任务
        <FilterDropdown />
        <ViewToggle />          ← 排序视图切换
      </Toolbar>
      <TaskList>               ← 可拖拽排序
        <TaskCard>             ← 每个任务卡片
          <DragHandle />       ← 拖拽手柄
          <StatusIcon />       ← ○/◉/●
          <TaskTitle />
          <DueDateBadge />     ← 截止日期徽标
          <PriorityBadge />    ← 优先级标记
        </TaskCard>
      </TaskList>
      <DetailPanel>            ← 右侧详情面板（点击任务展开）
        <TaskEditor />         ← 编辑标题/备注/子任务等
      </DetailPanel>
      <NewTaskInput />         ← 底部快速新建
    </ContentArea>
  </MainLayout>
</App>
```

### 4.4 关键交互

**新建任务：** 点击底栏 "+" → 弹出一个 Modal / Drawer，填写：
- 标题（必填）
- 分组（下拉选择已有分组或新建）
- 优先级（高/中/低，默认中）
- 开始时间（可选）
- 截止时间（可选）
- 备注（可选，Markdown 编辑器）
- 链接（可选，URL 输入框）
- 子任务（可选，逐行输入）
- 重复规则（可选，下拉选择）

**编辑任务：** 点击任务卡片 → 进入详情页（或展开)。所有字段均可编辑。

**勾选子任务：** 点击 checkbox → 前端即时更新状态 → 写入时间戳 → 触发重算主任务状态 → 如果全部完成，自动写入 `🏁` 标记。

**拖拽排序（核心交互）：** 所有任务默认支持拖拽排序，拖拽手柄在任务行左侧。拖拽排序是默认排序视图，新建任务默认插入列表末尾。排序结果通过 `order` 字段持久化写入 Markdown 元数据行。长按/拖拽即可重新排序。

### 4.5 移动端适配（Drawer 侧拉）

**设计原则：** 桌面端保持侧边栏常驻；移动端（<768px）侧边栏转为 Drawer，从左侧滑入。

```
桌面端（>768px）：                   移动端（<768px）：
┌──────────┬──────────────────┐     ┌──────────────────────┐
│ 侧边栏   │ 内容区            │     │ [☰] 待办系统  [🔍]   │ ← 顶栏
│          │                   │     ├──────────────────────┤
│ 常驻显示  │                  │     │ 任务列表              │
│          │                   │     │ ○ 任务1          🔴  │
│          │                   │     │ ○ 任务2  🟡          │
│          │                   │     │ ○ 任务3              │
│          │                   │     │                      │
│          │                   │     │ [+ 新建任务]          │
└──────────┴──────────────────┘     └──────────────────────┘
                                        ↑点击☰弹出Drawer
```

**移动端交互规则：**
- 顶栏左上方 ☰ 按钮 → 点击从左侧滑入 Drawer，内容与桌面端侧边栏一致
- 选择清单后 Drawer 自动关闭，回到任务列表
- 详情面板在全屏状态下覆盖整个屏幕（底部滑入），顶部有返回按钮
- 任务新建按钮固定在底栏
- 搜索框在顶栏右侧（图标展开）
- 拖拽排序在移动端通过长按触发（dnd-kit 默认支持触摸）

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

interface Subtask {
  text: string;
  level: number;              // 1 | 2 | 3
  completed: boolean;
  completed_at?: string;      // ISO 8601
  note?: string;
  links?: string[];           // Markdown links
  children: Subtask[];
}

interface Task {
  id: string;                 // 基于标题+创建时间的 hash
  title: string;
  meta: TaskMeta;
  subtasks: Subtask[];
  note?: string;              // Markdown 文本
  links?: string[];
  completed_at?: string;      // 🏁 时间
  duration?: string;          // ⏱ 耗时文字
  group: string;              // 所属分组名
}

interface ListMeta {
  name: string;
  created: string;
  archived: boolean;
}

// ========== 组件 Props ==========

// 侧边栏
interface SidebarProps {
  lists: ListMeta[];            // 所有清单元数据
  groups: string[];             // 当前清单下的分组
  activeList: string;           // 当前选中的清单名
  activeGroup: string | null;   // 当前选中的分组
  onSelectList: (name: string) => void;
  onSelectGroup: (name: string | null) => void;
  onNewList: () => void;
  onNewGroup: () => void;
}

// 智能列表项
interface SmartListItemProps {
  icon: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

// 清单行
interface ListRowProps {
  name: string;
  progress: { done: number; total: number };  // 已完成/总数
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}

// 任务卡片
interface TaskCardProps {
  task: Task;
  onToggle: (subtaskPath: number[]) => void;  // 子任务路径索引
  onStartEdit: () => void;
  onDelete: () => void;
}

// 子任务项
interface SubtaskItemProps {
  subtask: Subtask;
  path: number[];               // 从根到该子任务的索引路径
  onToggle: (path: number[]) => void;
  depth: number;                // 当前层级（用于缩进控制）
}

// 详情面板
interface DetailPanelProps {
  task: Task | null;            // null = 未选中
  onSave: (updated: Task) => void;
  onClose: () => void;
  groups: string[];             // 可分配的分组列表
  onNewGroup: (name: string) => void;
}

// 拖拽排序上下文
type SortMode = 'drag' | 'due' | 'priority';

interface TaskListProps {
  tasks: Task[];
  sortMode: SortMode;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggle: (taskId: string, path: number[]) => void;
  onSelect: (taskId: string) => void;
}

// 搜索条
interface SearchBarProps {
  value: string;
  onChange: (q: string) => void;
  placeholder?: string;
}

// 过滤
interface FilterState {
  status: 'all' | 'pending' | 'active' | 'done';
  priority: 'all' | 'high' | 'med' | 'low';
  timeRange: 'all' | 'today' | 'week' | 'overdue';
}

interface FilterDropdownProps {
  filter: FilterState;
  onChange: (filter: FilterState) => void;
}
```

### 4.7 空/加载/错误状态 UI

**全局同步状态：** 顶栏右侧显示圆点指示器

| 状态 | 指示器 | 行为 |
|---|---|---|
| 已同步 | 🟢 绿色 | 正常 |
| 同步中 | 🟡 黄色 + 旋转 | 正在拉取或写入 |
| 未同步（有本地修改） | 🟠 橙色 | 有未提交的修改 |
| 离线 | 🔴 红色 | 网络不可用 |
| 首次配置（无 token） | ⚪ 灰色 + 点击引导 | 弹出配置页面 |

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

**加载中（首次拉取 GitHub）：**

侧边栏和任务区各自显示骨架屏（Skeleton），不显示空白页：

```
┌──────────┬──────────────────────┐
│ ░░░░░░░░ │ ░░░░░░░░░░░░░░░░░░░  │
│ ░░░░░░░░ │ ░░░░░░░░░░░░░░░░░░░  │
│ ░░░░░░░░ │ ░░░░░░░░░░░░░░░░░░░  │
│          │ ░░░░░░░░░░░░░░░░░░░  │
│          │ ░░░░░░░░░░░░░░░░░░░  │
└──────────┴──────────────────────┘
```

**Token 未配置/过期：**

```
┌──────────────────────────────┐
│ 🔐 需要配置 GitHub Token     │
│                              │
│ 本系统通过 GitHub API 同步   │
│ 数据，需要你创建一个         │
│ Personal Access Token。      │
│                              │
│ 1. 打开 github.com/settings/ │
│    tokens                   │
│ 2. 创建 Fine-grained PAT    │
│ 3. 权限：Contents R/W       │
│                              │
│ [粘贴 Token] [________________]
│                              │
│ [保存并同步]                 │
└──────────────────────────────┘
```

**网络错误/GitHub API 限流：**

非阻断式 toast 提示，3 秒后自动消失。用户可继续编辑，修改暂存在 localStorage。

```
┌──────────────────────────────┐
│ ⚠️ 同步失败，修改已暂存本地  │
│    网络恢复后自动重试       │
└──────────────────────────────┘
```

---

## 五、技术方案

### 5.1 技术栈

| 层级 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 构建工具 | Vite | ^6.x | 快速 HMR |
| 框架 | React | ^19.x | |
| 语言 | TypeScript | ^5.x | 严格模式 |
| 路由 | React Router | ^7.x | |
| 状态管理 | Zustand | 最新 | 轻量，适合中小型应用 |
| Markdown 结构解析 | 自写两遍扫描器 | — | 行级正则解析任务块/子任务/元数据，不依赖通用 Markdown 解析器 |
| Markdown 富文本渲染 | react-markdown + remark-gfm | 最新 | 仅用于渲染备注/链接中的富文本内容 |
| GitHub API | Octokit | ^4.x | 官方 SDK |
| PWA | vite-plugin-pwa | 最新 | 离线缓存 + 可安装 |
| 样式 | Tailwind CSS | ^4.x | 快速构建 UI |
| UI 组件 | 手写 + Radix UI（少量基础组件） | 最新 | 保持轻量 |
| 拖拽 | dnd-kit | 最新 | 触摸友好 |
| 通知 | Web Notifications API | 原生 | 无需库 |
| 日期处理 | date-fns | 最新 | 轻量日期库 |

### 5.2 为什么选这些

- **Zustand** 比 Redux 轻量得多，这个系统状态复杂度不高，不需要 Redux 的分层
- **自写两遍扫描器**：结构解析用行级正则，不依赖通用解析器的 AST 语义，确保边界判定和子任务层级准确无误
- **react-markdown + remark-gfm**：仅用于渲染备注和链接中的 Markdown 富文本（加粗、列表、代码块等），不做结构提取
- **Octokit** 是 GitHub 官方 SDK，处理了鉴权和分页
- **dnd-kit** 比 react-beautiful-dnd 更现代、触摸支持更好

### 5.3 GitHub API 方案

**需要的权限：**
- `Contents: Read and write`（读写文件）
- 可选 `Metadata: Read`（检查仓库基本信息）

**API 调用模式：**

```typescript
// 初始化
const octokit = new Octokit({ auth: token });
const owner = '你的用户名';
const repo = '你的仓库名';
const basePath = 'todo';

// 读取清单文件
async function readList(listName: string): Promise<string> {
  const { data } = await octokit.rest.repos.getContent({
    owner, repo, path: `${basePath}/${listName}.md`,
  });
  // data 是 base64 编码的
  return Buffer.from(data.content, 'base64').toString('utf-8');
}

// 写入清单文件
async function writeList(listName: string, content: string, sha: string) {
  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo,
    path: `${basePath}/${listName}.md`,
    message: `update ${listName}.md`,
    content: Buffer.from(content).toString('base64'),
    sha,  // 通过 getContent 获取
  });
}

// 获取所有清单文件列表
async function listLists(): Promise<string[]> {
  const { data } = await octokit.rest.repos.getContent({
    owner, repo, path: basePath,
  });
  return data.filter(f => f.name.endsWith('.md')).map(f => f.name);
}
```

**Token 配置：** 
- 用户需手动创建一个 Fine-grained PAT（GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens）
- 权限：选择目标仓库，`Contents: Read and write`
- Token 存储在 `localStorage`（或加密存储），首次使用时弹出配置页面
- ⚠️ 风险提示：Token 存在浏览器中，安全性等同于用户的设备安全

**同步策略（参考主流云同步做法）：**

**核心模型：** 本地缓存 + GitHub 远端 = 两副本，通过文件 SHA 比对判断差异。

```
GitHub Repo (远端权威) ←→ 浏览器 localStorage (本地缓存)
    ↑ SHA 比对（仅元数据）              ↑
    ↓ 差异检测 → 拉取最新              ↓
用户 UI (编辑视图) ←──────────────────
```

**触发拉取（Pull）的时机：**
1. 页面加载/刷新 → 全量拉取
2. 页面从后台切回前台（visibilitychange） → SHA 比对后增量拉取
3. 定时轮询 → 每 60 秒静默比对一次清单文件的 SHA（仅存 SHA，不拉内容）
4. 用户手动「下拉刷新」或点击同步按钮

**写入（Push）策略：**
- 每次编辑操作后立即写回 GitHub API（同步写入），不延迟批量
- 写回时携带当前文件的 `sha`，如果远端已变更（SHA 不匹配）：
  a. 增量拉取远端最新内容
  b. 将本地修改 merge 到最新内容上（三路合并：远端版本 + 本地修改 = 合并结果）
  c. 如果合并冲突（同一字段在两端都被修改），保留远端版本，在 UI 提示用户手动检查
- 写入失败时（断网）暂存到 `localStorage`，联网后自动重试

**缓存优化：**
- `localStorage` 缓存所有清单文件的完整内容 + 对应 SHA
- `sessionStorage` 缓存当前打开的清单，加速切换
- SHA 只存映射表（文件名 → SHA），不做内容比对

**冲突处理（单用户场景简化）：**
由于一般只有一个人在用，冲突概率低。简化策略：
- 检测到 SHA 不匹配时，自动拉取远端内容
- 将本地修改覆盖到远端内容之上（以当前编辑为准）
- 写入完成后更新 SHA
- 如涉及同一字段被两端同时修改，保留远端版本并通知用户

### 5.4 离线策略

**第一期最小方案：**
- `localStorage` 缓存当前编辑中的清单内容
- 写入失败时（断网）暂存到本地，联网后自动重试
- 提示用户当前处于离线模式

### 5.5 Zustand Store 设计

**Store 拆分（3 个独立 store，用 Zustand create 创建）：**

```typescript
// ===================== 清单 Store =====================
interface ListsState {
  // Data
  lists: ListMeta[];                   // 所有清单
  activeListName: string | null;       // 当前选中的清单名
  activeGroup: string | null;          // 当前选中的分组名
  
  // 各清单的完整内容缓存（文件名 → 原始 Markdown + SHA）
  fileCache: Record<string, {
    content: string;                   // 原始 Markdown 文本
    sha: string;                       // GitHub 文件 SHA
  }>;
  
  // Actions
  fetchLists: () => Promise<void>;     // 从 GitHub 拉取清单列表
  selectList: (name: string) => void;
  selectGroup: (name: string | null) => void;
  createList: (name: string) => Promise<void>;
  deleteList: (name: string) => Promise<void>;
  renameList: (oldName: string, newName: string) => Promise<void>;
  fetchListContent: (name: string) => Promise<Task[]>;  // 拉取并解析
}

// ===================== 任务 Store =====================
interface TasksState {
  // Data
  tasks: Task[];                       // 当前清单的解析后任务列表
  selectedTaskId: string | null;       // 详情面板中选中的任务
  
  // 过滤/排序
  sortMode: SortMode;
  filter: FilterState;
  searchQuery: string;
  
  // Computed (getter)
  filteredTasks: () => Task[];         // 经搜索/过滤/排序后的列表
  
  // Actions
  loadTasks: (listName: string) => Promise<void>;
  createTask: (title: string) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleSubtask: (taskId: string, path: number[]) => Promise<void>;
  reorderTasks: (fromIdx: number, toIdx: number) => Promise<void>;
  selectTask: (id: string | null) => void;
  setSortMode: (mode: SortMode) => void;
  setFilter: (f: Partial<FilterState>) => void;
  setSearchQuery: (q: string) => void;
}

// ===================== 同步 Store =====================
interface SyncState {
  // Data
  status: 'synced' | 'syncing' | 'unsaved' | 'offline' | 'unconfigured';
  lastSyncAt: string | null;
  pendingWrites: number;               // 待写入数量
  
  // Config
  token: string | null;
  repoOwner: string;
  repoName: string;
  
  // Actions
  configure: (token: string, owner: string, repo: string) => void;
  sync: () => Promise<void>;           // 触发同步
  pushChanges: () => Promise<void>;    // 推送本地修改
  pollSha: () => Promise<boolean>;     // 轮询 SHA 检测远端变更
  clearConfig: () => void;
}
```

**Store 交互流程（典型场景）：**

```
页面加载
  → SyncStore.configure() 从 localStorage 读取 token
  → ListsStore.fetchLists() 拉取清单列表
  → ListsStore.fetchListContent('工作') 拉取并解析默认清单
  → TasksStore.loadTasks() 将解析结果写入 tasks

用户新建任务
  → TasksStore.createTask('标题')
  → 写入 local task list + 触发 parse 并转回 Markdown
  → SyncStore.status = 'unsaved'
  → SyncStore.pushChanges() → 写入 GitHub → status = 'synced'

用户切换清单
  → ListsStore.selectList('学习')
  → syncStore.pollSha() 先检查远端是否有变化
  → TasksStore.loadTasks('学习') 拉取并解析

定时轮询
  → SyncStore.pollSha() 每 60s 检查所有文件 SHA
  → 如有变化 → fetchListContent → 更新 tasks
```

### 5.6 构建与部署

**构建产出：** 纯静态 SPA，无需后端服务器。

| 项目 | 配置 |
|---|---|
| 构建命令 | `npm run build` → 输出到 `dist/` |
| 静态托管 | GitHub Pages |
| 自定义域名 | 可选，通过 CNAME 文件配置 |
| 环境变量 | `VITE_GITHUB_OWNER`、`VITE_GITHUB_REPO`（默认值，用户可在设置页修改） |
| Token | 不打包进构建产物，用户在首次使用页面中输入 |

**部署步骤：**

```bash
# 1. 创建 GitHub 仓库（私有），用于存储待办数据
# 2. 创建另一个仓库（公开或私有），用于托管前端代码
# 3. 配置 GitHub Pages（托管前端仓库的 dist/ 目录）

# 可选：如想合并在同一个仓库
# ├── todo/       ← 待办数据（Markdown 文件）
# ├── frontend/   ← 前端源码
# └── docs/       ← GitHub Pages 指向 docs/
```

**推荐的仓库结构（合并方案）：**

```
todo-system/
├── todo/                    # 待办数据（Markdown）
│   ├── 工作.md
│   ├── 学习.md
│   └── ...
├── src/                     # 前端源码
├── dist/                    # 构建产出（部署到 GitHub Pages）
├── .gitignore
├── vite.config.ts
├── package.json
└── README.md
```

**GitHub Pages 配置：**

`vite.config.ts` 中设置 `base: '/todo-system/'`（如果部署在子路径），或自定义域名时设 `base: '/'`。

---

## 六、扩展预留

### 6.1 Markdown 格式扩展字段

当前元数据行已经预留了扩展空间——所有字段都是键值对 `key: value` 格式，新增字段只需加新的键：

```markdown
### 任务标题
priority: high | due: 2026-07-10 | created: 2026-06-28 | order: 3 | tags: 调研,竞品
```

**已预留字段：**
- `order`：自定义排序序号（第一期已启用，拖拽排序默认使用）
- `tags`：标签（逗号分隔）

### 6.2 任务嵌套深度

元数据和解析器对子任务深度不做限制。当前 UI 默认渲染 3 层，更深层级自动折叠展示「展开」按钮。

### 6.3 未来可能的扩展方向（不纳入第一期）

- 看板视图（拖拽跨列改变状态）
- 日历视图（以截止时间分布在日历上）
- Service Worker 实现后台通知
- GitHub Actions 定时推送邮件
- 多用户协作（通过 repo 的 collaborator 机制 + 文件锁）
- 番茄钟功能（跟任务绑定）
- 统计数据面板（完成率趋势图）

---

## 七、第一期交付范围（MVP）

| 功能 | 状态 | 说明 |
|---|---|---|
| 清单管理（创建/删除/重命名） | ✅ | |
| 分组管理（创建/删除/重命名） | ✅ | |
| 任务 CRUD（创建/编辑/删除） | ✅ | |
| 子任务（最多3层） | ✅ | |
| 状态推断引擎 | ✅ | 主任务状态自动推断 + 无子任务场景 |
| 优先级设置 | ✅ | |
| 开始/截止时间 | ✅ | |
| Markdown 备注 | ✅ | |
| 链接 | ✅ | |
| 搜索与过滤 | ✅ | |
| 排序（截止时间/优先级/拖拽） | ✅ | 拖拽排序为默认视图，顺序写入 `order` 字段 |
| 进度可视化（分组/清单层面） | ✅ | |
| GitHub API 同步 | ✅ | 读写私有仓库 |
| 删除清单 | ✅ | 物理删除，带二次确认 |
| 周期性任务 | ✅ | 仅 daily/weekly/monthly |
| Notification API 提醒 | ✅ | 今天到期提醒 |
| 已完成任务保留在原文件 | ✅ | status 推断，不拆分文件 |
| 回收站功能 | ❌ | 暂不实现 |

### 第一期延期项

| 功能 | 理由 |
|---|---|

| 看板视图 | 优先级不高，UI 复杂度大 |
| 离线完整支持 | 第一期只做写入失败缓存，不做离线编辑 |
| 回收站 | 暂不实现，删除前弹确认即可 |

---

## 八、开发顺序建议

```
Phase 1: 基础架构
  ✅ Vite + React + TypeScript 项目初始化
  ✅ Zustand store 设计（syncStore / listsStore / tasksStore）
  ✅ 两遍扫描解析器（结构扫描 + 细节解析 + 序列化）
  ✅ Octokit GitHub API 模块（读/写/列表）
  ✅ Token 配置页面
  ⚠️ 跨设备同步引擎（SHA 比对 + 轮询已实现；远端变更自动拉取合并待完善）

Phase 2: 数据结构 + 渲染
  ✅ 两遍扫描解析器（结构扫描 + 细节解析）
  ✅ Markdown 渲染组件（react-markdown 渲染备注/链接）
  ✅ 状态推断引擎
  ✅ 周期性任务引擎

Phase 3: 交互功能
  ✅ 清单管理（CRUD）
  ✅ 分组管理（创建/选择；重命名/删除 UI 未单独提供）
  ✅ 任务编辑（创建/编辑/删除）
  ✅ 子任务勾选 + 完成时间记录
  ✅ 优先级/开始时间/截止时间
  ✅ 备注/链接编辑
  ✅ 拖拽排序（dnd-kit 集成 + order 字段写入）

Phase 4: 排序与搜索
  ✅ 按截止时间排序
  ✅ 按优先级排序
  ✅ 搜索过滤
  ✅ 进度统计

Phase 5: 通知与优化
  ✅ Notification API 提醒
  ✅ PWA 配置（vite-plugin-pwa）
  ✅ 离线缓存（写入失败暂存 localStorage，联网后自动重试）
  ❌ 回收站（暂不实现，删除时二次确认即可）

Phase 6: 打磨
  ✅ UI 细节调整
  ✅ 错误处理完善（基础实现）
  ✅ 首次使用引导（无配置时自动跳转 /settings）
```

---

## 九、已决策事项

1. **token 存储安全性** → `localStorage` 存储，因数据同步到 GitHub 仓库本身有版本控制，token 泄露的影响范围仅限该私有仓库的读写权限。
2. **文件冲突** → 当前方案（SHA + 自动拉取覆盖）足够，因为一般只有一个人在用，冲突概率极低。同一字段被两端同时修改时保留远端版本并通知用户。
3. **跨设备同步** → 参考主流云同步做法：页面加载/聚焦/定时轮询三重触发 + SHA 比对 + 增量拉取。见上方「同步策略」详细说明。

---

有问题或想调整的，直接说，我改。
