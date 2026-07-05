# Dong Todo UI 设计系统

> 本文档定义 Dong Todo 的视觉语言与组件规范，确保界面在后续迭代中保持一致、优雅与可维护。
> 任何新增组件、页面或样式调整，应优先遵循本规范。

---

## 1. 设计原则

**Quiet Precision · 安静的精确**

Dong Todo 是一款把 Markdown 当作数据库的待办应用。它的界面应当像一本做工精良的笔记本：

- **克制**：不喧宾夺主，让任务内容成为主角。
- **清晰**：层级、状态、操作一目了然。
- **温暖**：避免冷峻的默认灰蓝，使用暖白纸张感背景与蓝色主色。
- **一致**：颜色、字体、间距、圆角、图标在所有组件中保持统一。
- **可访问**：焦点可见、对比度充足、尊重用户的动效偏好。

---

## 2. 颜色系统

所有颜色通过 Tailwind v4 的 `@theme` 定义为 CSS 自定义属性，使用语义化命名。浅色与深色模式共用同一套变量名，仅在根元素 `.dark` 下切换取值。

### 2.1 主色 / Brand

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-primary` | `#2563EB` | `#60A5FA` | 主按钮、激活态、链接、焦点环 |
| `--color-primary-hover` | `#1D4ED8` | `#93C5FD` | 主按钮悬停 |
| `--color-primary-subtle` | `#EFF6FF` | `#1E3A8A` | 主色淡背景、badge |
| `--color-primary-muted` | `#93C5FD` | `#93C5FD` | 主色背景上的次要图标 |

### 2.2 背景 / 表面

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-bg` | `#FDFCFA` | `#121212` | 页面背景 |
| `--color-surface` | `#FFFFFF` | `#1E1E1E` | 卡片、面板、输入框背景 |
| `--color-surface-raised` | `#FAFAF8` | `#252525` | 侧边栏等抬升表面 |
| `--color-surface-hover` | `#F5F4F2` | `#2E2E2E` | 列表项、按钮悬停 |

### 2.3 文字

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-text` | `#1A1A1A` | `#F0F0F0` | 主要文字 |
| `--color-text-secondary` | `#4A4A4A` | `#B0B0B0` | 次要文字、标签 |
| `--color-text-muted` | `#8A8A8A` | `#707070` | 占位、禁用、提示 |
| `--color-text-inverse` | `#FFFFFF` | `#121212` | 主色背景上的文字 |

### 2.4 边框

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-border` | `#E8E6E3` | `#333333` | 默认边框、分隔线 |
| `--color-border-subtle` | `#F0EEEB` | `#2A2A2A` | 微弱分隔（卡片内线） |
| `--color-border-focus` | `rgba(37, 99, 235, 0.15)` | `rgba(96, 165, 250, 0.25)` | 焦点环颜色 |

### 2.5 语义 / 状态

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-success` | `#3A8D5D` | `#5BC98A` | 已完成、已同步 |
| `--color-success-subtle` | `#E8F5EE` | `#163826` | 成功淡背景 |
| `--color-warning` | `#C9872C` | `#E6A84C` | 进行中、即将到期 |
| `--color-warning-subtle` | `#FDF3E3` | `#3D2E14` | 警告淡背景 |
| `--color-danger` | `#C44B4B` | `#E76B6B` | 删除、错误、逾期 |
| `--color-danger-subtle` | `#FCECEC` | `#3D1D1D` | 危险淡背景 |

### 2.6 优先级

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-priority-high` | `#C44B4B` | `#E76B6B` | 高优先级 |
| `--color-priority-med` | `#C9872C` | `#E6A84C` | 中优先级 |
| `--color-priority-low` | `#5B8A72` | `#7FB89C` | 低优先级 |

---

## 3. 字体排版

### 3.1 字体栈

```css
font-family: "Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
```

- Latin 使用 Inter，中文优先 PingFang SC / Microsoft YaHei。
- 按钮继承字体栈：`button { font-family: inherit; }`。

### 3.2 字号规范

| Token | 大小 | 字重 | 行高 | 字间距 | 用途 |
|-------|------|------|------|--------|------|
| `text-xs` | 12px | 400 | 1.5 | 0 | 说明文字、元数据 |
| `text-sm` | 13px | 400 | 1.5 | 0 | 正文小字、标签 |
| `text-base` | 14px | 400 | 1.6 | 0 | 正文（CJK 适当增加行高） |
| `text-lg` | 16px | 500 | 1.4 | -0.01em | 小标题 |
| `text-xl` | 20px | 600 | 1.3 | -0.02em | 页面标题 |
| `text-2xl` | 24px | 600 | 1.2 | -0.02em | 应用标题 |

### 3.3 中文排版注意事项

- 中文最小字重为 400，避免极细字重导致可读性下降。
- 大标题可使用轻微负字间距，正文保持默认。
- 行高在 1.5–1.6 之间，给 CJK 字符留出呼吸感。

---

## 4. 间距与布局

### 4.1 间距单位

以 4px 为基准：

| Token | 值 | 用途 |
|-------|-----|------|
| `space-1` | 4px | 紧凑间隙、图标内边距 |
| `space-2` | 8px | 行内间隙、小 padding |
| `space-3` | 12px | 卡片内边距、表单间隙 |
| `space-4` | 16px | 区块内边距 |
| `space-5` | 20px | 面板内边距 |
| `space-6` | 24px | 大间隙 |
| `space-8` | 32px | 页面级间距 |

### 4.2 布局尺寸

| 区域 | 尺寸 | 说明 |
|------|------|------|
| 侧边栏 | `240px` (`w-60`) | 固定宽度 |
| 内容区 | 流体 | 占据剩余宽度 |
| 任务编辑器面板 | `360px` (`w-[360px]`) | 右侧滑出 |
| 卡片间隙 | `12px` (`space-y-3`) | 任务列表卡片间距 |
| 页面内边距 | `16px` (`p-4`) | 内容区内部 |

---

## 5. 圆角与阴影

### 5.1 圆角

| Token | 值 | 用途 |
|-------|-----|------|
| `radius-sm` | 4px | 小按钮、标签 |
| `radius-md` | 6px | 输入框、按钮 |
| `radius-lg` | 10px | 卡片 |
| `radius-xl` | 14px | 面板、弹窗 |
| `radius-full` | 9999px | Pill、头像 |

### 5.2 阴影

| Token | 值 | 用途 |
|-------|-----|------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | 卡片默认 |
| `shadow-md` | `0 2px 8px rgba(0,0,0,0.06)` | 卡片悬停、下拉 |
| `shadow-lg` | `0 4px 16px rgba(0,0,0,0.08)` | 面板、弹窗 |
| `shadow-focus` | `0 0 0 2px rgba(45,107,94,0.15)` | 焦点环 |

深色模式下阴影使用黑色，但降低不透明度，避免过暗时发灰。

---

## 6. 图标规范

### 6.1 图标库

使用 [`lucide-react`](https://lucide.dev/)。所有图标统一为 SVG，避免跨平台 emoji 渲染差异。

### 6.2 图标尺寸

| 场景 | 尺寸 | Tailwind |
|------|------|----------|
| 行内文字 | 16px | `w-4 h-4` |
| 按钮/工具栏 | 18px | `w-[18px] h-[18px]` |
| 侧边栏导航 | 18px | `w-[18px] h-[18px]` |
| 空状态 | 48px | `w-12 h-12` |

### 6.3 图标颜色

- 默认：`text-[var(--color-text-muted)]`
- 激活/选中：`text-[var(--color-primary)]` 或 `text-white`（在主色背景上）
- 成功：`text-[var(--color-success)]`
- 警告：`text-[var(--color-warning)]`
- 危险：`text-[var(--color-danger)]`

### 6.4 常用图标映射

| 语义 | 图标 |
|------|------|
| 应用 Logo | `ListTodo` |
| 今天 | `Calendar` |
| 已安排 | `CalendarDays` |
| 全部 | `Layers` |
| 已标记 | `Flag` |
| 清单 | `Folder` / `Notebook` |
| 新建 | `Plus` |
| 删除 | `Trash2` |
| 搜索 | `Search` |
| 设置 | `Settings2` |
| 同步 | `RefreshCw` |
| 主题切换 | `Sun` / `Moon` |
| 拖拽 | `GripVertical` |
| 关闭 | `X` |
| 展开/收起 | `ChevronDown` / `ChevronUp` |
| 日期 | `CalendarClock` |
| 重复 | `Repeat` |
| 进度 | `ListChecks` |
| 分组 | `Tag` |

---

## 7. 组件模式

### 7.1 按钮

#### Primary

```
bg-[var(--color-primary)] text-white rounded-md px-4 py-2 text-sm font-medium
hover:bg-[var(--color-primary-hover)]
active:scale-[0.98] transition-transform
focus:ring-2 focus:ring-[var(--color-border-focus)] focus:outline-none
disabled:opacity-50 disabled:cursor-not-allowed
```

#### Secondary

```
bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] rounded-md px-4 py-2 text-sm
hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-text-muted)]
active:bg-[var(--color-border)]
focus:ring-2 focus:ring-[var(--color-border-focus)] focus:outline-none
```

#### Ghost

```
bg-transparent text-[var(--color-text-muted)] rounded-md px-3 py-1.5 text-sm
hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]
active:bg-[var(--color-border)]
focus:ring-2 focus:ring-[var(--color-border-focus)] focus:outline-none
```

#### Danger

```
bg-[var(--color-danger)] text-white rounded-md px-4 py-2 text-sm font-medium
hover:opacity-90
active:scale-[0.98]
```

### 7.2 输入框

```
w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]
placeholder:text-[var(--color-text-muted)]
focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-border-focus)] focus:outline-none
disabled:bg-[var(--color-surface-hover)] disabled:opacity-60
```

### 7.3 卡片

```
rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] p-4 shadow-sm
hover:shadow-md hover:border-[var(--color-border)]
transition-all duration-150 ease-out
```

### 7.4 Badge / 标签

```
inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
```

变体：

| 类型 | 背景 | 文字 |
|------|------|------|
| 高优先级 | `bg-[var(--color-danger-subtle)]` | `text-[var(--color-danger)]` |
| 中优先级 | `bg-[var(--color-warning-subtle)]` | `text-[var(--color-warning)]` |
| 低优先级 | `bg-[var(--color-primary-subtle)]` | `text-[var(--color-primary)]` |

### 7.5 空状态

```
flex flex-col items-center justify-center text-center py-16
icon: w-12 h-12 text-[var(--color-text-muted)] mb-4
title: text-base font-medium text-[var(--color-text-secondary)] mb-1
subtitle: text-sm text-[var(--color-text-muted)]
```

### 7.6 侧边栏导航项

```
flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-sm text-[var(--color-text-secondary)]
hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]
focus:ring-2 focus:ring-[var(--color-border-focus)] focus:outline-none
transition-colors duration-120
```

激活态：

```
bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]
```

### 7.7 任务状态图标

使用 SVG 圆环，而非字符：

- **pending 待处理**：空心圆环，边框 `var(--color-text-muted)`。
- **active 进行中**：双环，外圈 `var(--color-warning)`，内圈实心。
- **done 已完成**：实心圆，填充 `var(--color-success)`，内部白色对勾。

### 7.8 任务卡片元数据

使用 Lucide 图标 + 文字，统一 12px：

- 截止日期：`CalendarClock`
- 重复规则：`Repeat`
- 子任务进度：`ListChecks`
- 分组：`Tag`
- 优先级：badge

---

### 7.9 Toast / 全局气泡提示

所有非阻塞式用户反馈必须使用全局 Toast 气泡，**禁止直接使用浏览器原生 `alert()`**。

#### 触发方式

在代码中调用统一 API：

```typescript
import { toast } from '@/utils/toast';

toast.success('已复制到剪贴板');
toast.error('创建清单失败：网络错误');
toast.info('请先配置 GitHub Token');
```

`toast.raw(message, { type, duration })` 也可用于需要动态类型的场景。

#### 视觉规范

- **位置**：页面顶部居中，`fixed top-4 left-1/2 -translate-x-1/2`。
- **堆叠**：多个 Toast 垂直向下堆叠，间距 `8px`。
- **形状**：圆角胶囊形（`rounded-full`），带细边框与阴影。
- **最大宽度**：`max-w-xs`（约 320px），避免过长提示破坏布局。
- **进入动画**：从上方轻微滑入并淡入（`toast-enter` keyframe，200ms ease-out）。
- **自动消失**：默认 2500ms；错误类提示可酌情延长。
- **关闭**：点击右侧 `X` 图标可立即关闭。

#### 类型与配色

| 类型 | 图标 | 边框/背景 | 文字 | 使用场景 |
|------|------|-----------|------|----------|
| `success` | `CheckCircle2` | `border-success/20` + `bg-success-subtle` | `text-success` | 操作成功，如复制、保存、同步完成 |
| `error` | `XCircle` | `border-danger/20` + `bg-danger-subtle` | `text-danger` | 操作失败、异常、权限不足 |
| `info` | `Info` | `border-primary/20` + `bg-primary-subtle` | `text-primary` | 中性提示、说明、空状态提示 |

#### 实现结构

- `src/stores/toastStore.ts`：Zustand 状态管理，维护当前显示的 Toast 列表。
- `src/utils/toast.ts`：对外 API 封装。
- `src/components/common/ToastContainer.tsx`：全局容器，已在 `src/App.tsx` 挂载。
- `src/index.css`：`.animate-toast-enter` 动画，并受 `prefers-reduced-motion` 控制。

#### 禁止做法

- ❌ 使用 `alert('...')` 做提示。
- ❌ 在每个组件内单独实现 Toast  DOM。
- ❌ 把 Toast 放在页面底部或右下角（当前规范为顶部居中）。
- ✅ 所有非阻塞反馈统一走 `toast.*`，阻塞确认继续使用 `confirm()`。

---

### 7.10 Confirm / 全局确认对话框

对于需要用户明确确认才能继续的阻塞式操作（如删除清单、删除分组、覆盖远端修改），使用全局确认对话框，而不是浏览器原生 `confirm()`。

#### 触发方式

```typescript
import { confirm } from '@/stores/confirmStore';

if (await confirm('确定删除该清单？')) {
  // 执行删除
}
```

`confirm(message)` 返回 `Promise<boolean>`，用户点击「确定」返回 `true`，点击「取消」或关闭弹窗返回 `false`。

#### 视觉规范

- **位置**：屏幕正中央，模态遮罩覆盖全屏。
- **遮罩**：`bg-black/40` + `backdrop-blur-sm`，点击遮罩等同于「取消」。
- **卡片**：`rounded-xl`、白色/深色表面背景、`shadow-lg`、最大宽度 `max-w-md`。
- **标题**：固定为「确认」。
- **按钮顺序**：右侧为「确定」（主按钮/危险按钮），左侧为「取消」（次按钮）。
- **危险操作**：确认按钮使用危险红（`btn-danger`），如删除。
- **普通确认**：确认按钮可使用主按钮样式。
- **关闭**：标题栏右侧提供 `X` 关闭按钮，行为等同于「取消」。

#### 使用场景

| 场景 | 示例文案 | 确认按钮样式 |
|------|----------|--------------|
| 删除清单 | 确定删除清单「工作」？ | 危险 |
| 删除分组 | 确定删除分组「项目Alpha」及其所有任务？ | 危险 |
| 覆盖远端 | 本地修改与远端冲突，确认覆盖？ | 危险/主色 |

#### 实现结构

- `src/stores/confirmStore.ts`：Zustand 状态管理，提供 `confirm(message)` API。
- `src/components/common/ConfirmDialog.tsx`：全局对话框组件，已在 `src/App.tsx` 挂载。

#### 禁止做法

- ❌ 使用浏览器原生 `confirm('...')`。
- ❌ 在业务组件里单独写确认弹窗 DOM。
- ❌ 把确认按钮放在左侧、取消按钮放在右侧（破坏用户预期）。
- ✅ 所有阻塞确认统一走 `confirm()`，非阻塞提示走 `toast.*`。

---

## 8. 交互状态

| 状态 | 视觉处理 |
|------|----------|
| **Hover** | 背景过渡至 `--color-surface-hover`；卡片阴影由 `shadow-sm` 升至 `shadow-md` |
| **Focus** | `box-shadow: 0 0 0 2px rgba(45,107,94,0.15)`，边框变为主色 |
| **Active / Pressed** | 按钮 `transform: scale(0.98)`，背景略深 |
| **Disabled** | `opacity: 0.5`，`cursor: not-allowed`，无 hover 效果 |
| **Selected** | 背景 `--color-primary`，文字/图标白色 |
| **Loading** | 内容透明度降低，显示旋转 spinner |

---

## 9. 深色模式

- 通过 HTML 根元素 `.dark` 类切换，配合 Tailwind `dark:` 变体。
- 用户偏好持久化到 `localStorage`，键名为 `dong-todo:theme`。
- 支持三种模式：`light`、`dark`、`system`。
- `system` 模式监听 `matchMedia('(prefers-color-scheme: dark)')` 变化。
- 滚动条、阴影、边框在深色模式下需单独校验，避免发灰或消失。

---

## 10. 动效原则

**像纸张在桌面上滑动——快速、有目的、不弹跳。**

| 动画 | 时长 | 缓动 | 用途 |
|------|------|------|------|
| 淡入 | 150ms | `ease-out` | 内容出现 |
| 右滑入 | 200ms | `cubic-bezier(0.16, 1, 0.3, 1)` | 编辑器面板打开 |
| 悬停抬升 | 150ms | `ease-out` | 卡片阴影增加 |
| 按钮按下 | 100ms | `ease-in-out` | 缩放反馈 |
| 同步脉冲 | 2s | `ease-in-out` infinite | 同步中指示器 |

### 10.1 减弱动画

当用户开启 `prefers-reduced-motion: reduce` 时，所有过渡时长设为 `0ms`，仅保留必要的状态变化。

---

## 11. 无障碍

- **焦点可见**：所有可交互元素必须有可见焦点环。
- **颜色对比**：正文文字对比度 ≥ 4.5:1，大文字 ≥ 3:1。
- **触摸目标**：按钮最小 44×44px，输入框最小高度 32px。
- **图标语义**：所有图标组件应提供 `aria-label` 或在父元素上说明用途。
- **键盘导航**：支持完整 Tab 导航与 Enter/Space 激活。
- **表单标签**：每个输入框都有关联的 `<label>` 或 `aria-label`。

---

## 12. 如何换肤 / 换主色

本项目所有颜色通过 `src/index.css` 中的 CSS 变量集中管理。组件代码里不直接写任何 hex 或 rgba，只引用语义变量。因此：

### 12.1 换主色

只需修改 `src/index.css` 中以下变量，整个应用会自动跟随：

```css
@theme {
  --color-primary: #2563EB;        /* 主按钮、激活态 */
  --color-primary-hover: #1D4ED8;  /* 悬停 */
  --color-primary-subtle: #EFF6FF; /* 淡背景、badge */
  --color-primary-muted: #93C5FD;  /* 主色背景上的次要元素 */
  --color-border-focus: rgba(37, 99, 235, 0.15); /* 焦点环 */
}

.dark {
  --color-primary: #60A5FA;
  --color-primary-hover: #93C5FD;
  --color-primary-subtle: #1E3A8A;
  --color-primary-muted: #93C5FD;
  --color-border-focus: rgba(96, 165, 250, 0.25);
}
```

换肤后建议同步更新：
- `doc/UI_DESIGN_SYSTEM.md` 第 2.1 节颜色表格
- `vite.config.ts` 中的 PWA `theme_color` / `background_color`

### 12.2 换整体色系

如果想做一套完全不同的配色（例如把暖白换成冷灰、把橙主色换成蓝主色），建议按语义批量替换：

1. **背景/表面**：`--color-bg`、`--color-surface`、`--color-surface-raised`、`--color-surface-hover`
2. **文字**：`--color-text`、`--color-text-secondary`、`--color-text-muted`
3. **边框**：`--color-border`、`--color-border-subtle`
4. **状态**：`--color-success`、`--color-warning`、`--color-danger` 及对应的 `-subtle`
5. **阴影**：`--shadow-sm/md/lg/inset`（浅色用低不透明度黑，深色用高不透明度黑）

### 12.3 禁止做法

- ❌ 在组件中写死 `bg-red-500`、`text-[#123456]`、`shadow-[rgba(...)]`
- ❌ 在组件中覆盖 `--color-*` 变量
- ✅ 所有颜色必须来自 `src/index.css` 的语义变量

---

## 13. 实现文件

| 文件 | 说明 |
|------|------|
| `src/index.css` | 设计令牌、工具类、滚动条、减弱动画 |
| `src/stores/themeStore.ts` | 主题偏好状态与持久化 |
| `src/components/common/ThemeProvider.tsx` | 应用主题类名到 `<html>` |
| `src/components/common/ThemeToggle.tsx` | 主题切换按钮 |
| `src/components/layout/Sidebar.tsx` | 侧边栏导航与主题入口 |
| `src/components/layout/ContentArea.tsx` | 主内容区布局 |
| `src/components/tasks/Toolbar.tsx` | 搜索、过滤、视图切换 |
| `src/components/tasks/TaskList.tsx` | 任务列表与拖拽 |
| `src/components/tasks/TaskCard.tsx` | 任务卡片 |
| `src/components/tasks/TaskEditor.tsx` | 任务编辑面板 |
| `src/components/settings/Settings.tsx` | 设置页 |
| `src/stores/toastStore.ts` | 全局 Toast 气泡状态 |
| `src/utils/toast.ts` | Toast 便捷 API |
| `src/components/common/ToastContainer.tsx` | 全局 Toast 容器 |
| `src/stores/confirmStore.ts` | 全局确认对话框状态 |
| `src/components/common/ConfirmDialog.tsx` | 全局确认对话框 |
| `vite.config.ts` | PWA manifest 颜色 |

---

## 14. 更新规范

当需要新增颜色、组件或交互模式时：

1. 先更新本文档，说明新增令牌/模式的用途与取值。
2. 再到 `src/index.css` 添加对应 CSS 变量或工具类。
3. 最后在实际组件中使用，确保引用语义变量而非硬编码颜色。
4. 若新增组件，需在本文档第 7 节补充其规范示例。

---

*最后更新：2026-07-05*
