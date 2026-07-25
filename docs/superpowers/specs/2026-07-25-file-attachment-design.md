# 文件附件功能设计

## 背景

Dong Todo 是一个纯前端的待办应用，以 JSON 文件为数据库，通过 GitHub API（Octokit）读写。本文档定义在任务/子任务上附加文件的设计。

## 数据模型

### 新增类型 `FileRef`

```typescript
interface FileRef {
  name: string;        // 原始文件名，如 "竞品报告.pdf"
  path: string;        // GitHub 存储路径，如 "todo/attachments/work/abc123/a1b2c3d4.pdf"
  sha: string;         // Git blob SHA，用于更新/删除
  size: number;        // 字节数
  mime: string;        // MIME type
  uploadedAt: string;  // ISO 时间戳
}
```

### 影响的数据结构

`Task` 和 `Subtask` 各新增一个可选字段 `files`：

```typescript
interface Task {
  // ... 现有字段 ...
  files?: FileRef[];
}

interface Subtask {
  // ... 现有字段 ...
  files?: FileRef[];
}
```

## 文件存储路径

格式：`<basePath>/attachments/<清单名>/<taskId>/<内容SHA256前12位>.<ext>`

示例：
```
todo/attachments/work/abc123/a1b2c3d4e5f6.pdf
todo/attachments/personal/def456/7890abcdef01.png
```

- 物理路径只到 task 级别，不区分文件属于 task 还是 subtask
- 同一个 task 下的所有文件（无论属于 task 本层还是其子任务）共享一个目录
- 文件名取 SHA-256 前 12 位，天然避免同名冲突，且同一内容不会重复存储

## GitHub 客户端变更

`src/github/client.ts` 需要新增：

1. **`uploadFile(config, path, file: File, sha?)`** — 将二进制文件以 base64 写入 GitHub，返回 `FileRef`
2. **`downloadFile(config, path)`** — 从 GitHub 获取文件内容（含 SHA），返回 ArrayBuffer 或 Blob
3. **`deleteFile`** 已有，可直接复用

当前 `writeFileContent` 只处理 UTF-8 文本字符串，需要新增处理二进制（Blob/ArrayBuffer → base64）的方法。

## 内容哈希（去重）

上传前在客户端用 Web Crypto API（`SubtleCrypto.digest('SHA-256', ...)`）计算文件内容的 SHA-256 哈希。取前 12 位作为文件名，写入前先查询该路径是否已存在同名文件（通过 GitHub API 的 getContent 判断）。

- 若哈希相同 → 说明内容重复，不上传，直接复用
- 若哈希不同但文件名相同 → 不可能（哈希冲突概率极低，忽略）

## UI 变更

### TaskCard（列表展示）

在现有 `TaskLinks` 附近展示文件列表，每个文件渲染为：

- 文件图标（根据 mime 类型区分 PDF/图片/文档等）
- 文件名（`FileRef.name`）
- 文件大小（格式化显示，如 "200 KB"）
- 点击下载（通过 GitHub raw 内容或 API 获取后触发浏览器下载）

### TaskEditor（编辑面板）

新增"附件"区域，包含：

- **上传按钮** — `<input type="file" multiple>`，支持多选
- **拖拽上传** — 支持拖拽文件到该区域
- **已上传文件列表** — 每个文件显示：
  - 文件名
  - 大小
  - 删除按钮
  - 下载按钮
  - 文件图标
- **上传进度** — 上传中的文件显示 loading 状态

### 子任务编辑器

在子任务的展开面板中，同样添加附件区域，功能同上。

### 下载实现

通过 `downloadFile` 获取文件 ArrayBuffer，创建 Blob，利用 `<a download>` 触发下载，文件名使用 `FileRef.name`。

## 边界情况

### 删除任务时的文件清理

- 删除任务时，引用会被清除，但 GitHub 上的文件暂时保留
- 后续可通过批量清理脚本或懒清理机制处理孤立文件（v1 暂不实现）

### 离线状态

- 文件上传需要网络，离线时隐藏上传按钮
- 已上传的文件引用在离线状态下仍可查看信息（文件名、大小），但无法下载

### 文件大小限制

- GitHub API 单文件最大 100MB
- UI 层面建议对超大文件（>50MB）给出警告提示

### 同任务内重名不会发生

文件物理名基于内容哈希而非原始文件名，不会冲突。不同文件即使原始文件名相同，哈希不同则物理路径不同，不会覆盖。

## 涉及修改的文件清单

| 文件 | 修改内容 |
|---|---|
| `src/types/index.ts` | 新增 `FileRef` 类型，Task/Subtask 加 `files?` 字段 |
| `src/parser/jsonParser.ts` | `normalizeTask`/`normalizeSubtask` 解析 `files` 字段 |
| `src/parser/jsonSerializer.ts` | `serializeTask`/`serializeSubtask` 序列化 `files` 字段 |
| `src/parser/serializer.ts` | `normalizeTask` 透传 `files` 字段 |
| `src/parser/scanner.ts` | `inferStatus` 无需改动，`files` 不影响状态推断 |
| `src/github/client.ts` | 新增 `uploadFile`/`downloadFile` 方法 |
| `src/components/tasks/TaskCard.tsx` | 在 card 中渲染文件附件列表 |
| `src/components/tasks/TaskEditor.tsx` | 新增附件编辑区域 |
| `src/stores/listsStore.ts` | 无变更（saveListContent 已通用） |
| `src/stores/tasksStore.ts` | 无变更（updateTask 已通用） |
