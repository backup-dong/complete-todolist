# NoteEditor 增强设计

## 目标

改善备注（Markdown）编辑体验，解决编辑区域小、无工具栏、表格/图片等复杂语法纯手搓的问题。

## 方案

两层编辑模式：**内联模式（默认）** + **全屏分栏模式（点击后打开）**

---

### 内联模式

保留现有「编辑 / 预览」切换，编辑 tab 增加格式工具栏。

```
┌──────────────────────────────────────────────────────────┐
│ [B] [I] [H▼] [🔗] [🖼] [📋] [OL] [UL] [☑] [<>] [🔲]    │ [全屏] [编辑|预览]
│──────────────────────────────────────────────────────────│
│ auto-resize textarea (编辑时)                             │
│ MarkdownPreview (预览时)                                  │
└──────────────────────────────────────────────────────────┘
```

**工具栏按钮（编辑 tab 显示）：**

| 按钮 | 操作 | 快捷键 |
|------|------|--------|
| **B** 加粗 | 插入 `**text**` 或包裹选中文本 | Ctrl+B |
| *I* 斜体 | 插入 `*text*` 或包裹选中文本 | Ctrl+I |
| H 标题 | 下拉选择 H1/H2/H3，插入 `# ` / `## ` / `### ` | - |
| 🔗 链接 | 弹出输入框（文字 + URL），插入 `[text](url)` | Ctrl+K |
| 🖼 图片 | 弹出输入框（alt + URL），插入 `![alt](url)` | - |
| 📋 表格 | 弹出输入框（行数 + 列数），插入 Markdown 表格模板 | - |
| OL 有序列表 | 插入 `1. ` | - |
| UL 无序列表 | 插入 `- ` | - |
| ☑ 任务列表 | 插入 `- [ ] ` | - |
| <> 代码块 | 插入 ` ```\n\n``` ` | - |
| 🔲 全屏 | 打开全屏分栏 Dialog | |

### 全屏分栏模式

点击「全屏」按钮 → Dialog 覆盖全屏（`90vh × 90vw` / `max-w-6xl`）

```
┌───────────────────────────────────────────────────────────────┐
│ [B] [I] [H▼] [🔗] [🖼] [📋] [OL] [UL] [☑] [<>]    [✕ 关闭]  │
├────────────────────────┬──────────────────────────────────────┤
│                        │                                      │
│   编辑器 (textarea)     │      实时预览 (react-markdown)       │
│                        │                                      │
│                        │                                      │
└────────────────────────┴──────────────────────────────────────┘
```

- 左侧编辑区：textarea + 顶部工具栏（同内联）
- 右侧预览区：`MarkdownPreview`，随输入实时更新
- 关闭方式：右上角 ✕ 按钮 / ESC 键
- 全屏模式下 textarea 撑满左半区域（`h-full resize-none`）

### 表格插入交互

点击「📋」→ 弹出小卡片：

```
┌──────────────────┐
│ 插入表格          │
│ 行数: [3]         │
│ 列数: [3]         │
│ [Cancel] [Insert] │
└──────────────────┘
```

点击 Insert 后在光标处插入：

```
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
| Cell 7   | Cell 8   | Cell 9   |
```

### 链接/图片插入交互

点击「🔗」→ 弹出小卡片：

```
┌──────────────────┐
│ 插入链接          │
│ 文字: [_______]   │
│ URL:  [_______]   │
│ [Cancel] [Insert] │
└──────────────────┘
```

光标位置插入 `[文字](url)`。

### textarea auto-resize

- 内联模式：`min-h-[80px]`，随内容增高
- 全屏模式：撑满左侧区域，`h-full resize-none`

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/components/common/NoteEditor.tsx` | 新增工具栏、全屏按钮、auto-resize；引入 `NoteEditorDialog` |
| `src/components/common/NoteEditorDialog.tsx` | 新增全屏分栏 Dialog |
| `src/components/common/NoteToolbar.tsx` | 新增工具栏组件（可复用） |
| `src/components/common/InsertTableDialog.tsx` | 新增表格行数列数输入弹窗 |
| `src/components/common/InsertLinkDialog.tsx` | 新增链接输入弹窗 |
| `src/components/common/InsertImageDialog.tsx` | 新增图片输入弹窗 |
| `src/components/tasks/TaskEditor.tsx` | 适配 NoteEditor 接口（不变，仅移除旧 label 文案） |

### 接口兼容

`NoteEditor` 组件 Props **不变**：

```ts
interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}
```

所有调用方（`TaskEditor.tsx` 两处）无需改动代码。
