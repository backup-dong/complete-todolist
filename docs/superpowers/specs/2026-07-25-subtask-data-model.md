# 子任务数据模型

## 背景

Subtask 是任务（Task）内部的子条目，自 first commit 起即存在。随着需求演进，Subtask 逐步增加了元数据字段（时间、备注、链接、附件），使其具备与顶级任务几乎同等的信息承载能力。

## 数据模型

```typescript
interface Subtask {
  text: string;        // 子任务文字（必填）
  level: number;       // 缩进层级 1 | 2 | 3
  completed: boolean;  // 是否完成
  completed_at?: string; // ISO 8601 时间戳，完成时写入
  start?: string;      // ISO 日期（yyyy-MM-dd），v1.1 新增
  due?: string;        // ISO 日期（yyyy-MM-dd），v1.1 新增
  note?: string;       // Markdown 格式的备注文本
  links?: Link[];      // 链接列表
  files?: FileRef[];   // 附件列表，2026-07-25 新增
  children: Subtask[]; // 递归子任务
}
```

辅助类型：

```typescript
interface Link {
  title: string;
  url: string;
}

interface FileRef {
  name: string;        // 原始文件名
  path: string;        // GitHub 存储路径
  sha: string;         // Git blob SHA
  size: number;        // 字节数
  mime: string;        // MIME type
  uploadedAt: string;  // ISO 时间戳
}
```

## 字段说明

| 字段 | 首次出现 | 说明 |
|------|---------|------|
| `text` | first commit | 子任务内容，纯文本 |
| `level` | first commit | 缩进层级，用于多级嵌套展示 |
| `completed` | first commit | 完成状态，影响父任务的状态推断 |
| `completed_at` | first commit | 完成时间，与 `completed=true` 配合使用 |
| `start` | first commit | 开始日期，仅作展示和过滤 |
| `due` | first commit | 截止日期，用于 overdue 判断 |
| `note` | first commit | Markdown 备注，仅在编辑器展开时可见 |
| `links` | first commit | 相关链接，与 Task 层的 links 行为一致 |
| `files` | 2026-07-25 | 文件附件，与 Task 层共享存储目录 |
| `children` | first commit | 递归嵌套子任务 |

## 完成状态推断

Subtask 的 `completed` 和 `completed_at` 参与任务（Task）的自动状态推断：

- 如果某个 Task 的所有 Subtask（递归）均 `completed=true`，则该 Task 自动标记为 `status=done`，`completed_at` 取最晚的子任务完成时间
- 如果一个 Task 的部分 Subtask 已完成，另一部分未完成，Task 状态标记为 `active`

## JSON 示例

```json
{
  "text": "收集竞品功能列表",
  "level": 1,
  "completed": true,
  "completed_at": "2026-07-02T14:30:00+08:00",
  "start": "2026-07-01",
  "due": "2026-07-05",
  "note": "包括飞书、Notion、Todoist",
  "links": [
    { "title": "飞书任务", "url": "https://example.com" }
  ],
  "files": [
    {
      "name": "竞品报告.pdf",
      "path": "todo/attachments/work/abc123/a1b2c3d4e5f6.pdf",
      "sha": "abc123def456",
      "size": 204800,
      "mime": "application/pdf",
      "uploadedAt": "2026-07-25T10:00:00+08:00"
    }
  ],
  "children": []
}
```

## 相关文件

| 文件 | 作用 |
|------|------|
| `src/types/index.ts` | Subtask 类型定义 |
| `src/parser/jsonParser.ts` | JSON → Subtask 解析 |
| `src/parser/jsonSerializer.ts` | Subtask → JSON 序列化 |
| `src/parser/serializer.ts` | `normalizeTask` 中状态推断逻辑 |
