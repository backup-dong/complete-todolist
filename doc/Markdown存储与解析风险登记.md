# Markdown 存储与解析风险登记

## 概述

本项目（Dong Todo）将 Markdown 文件作为数据库，通过自定义的 scanner/serializer（`src/parser/scanner.ts`、`src/parser/serializer.ts`）解析任务结构。这种设计简单、可读、便于 GitHub 托管，但也存在一些结构解析与内容语义冲突的风险。本文档汇总目前已识别的风险点及对应优化措施，供后续迭代参考。

_最后更新：2026-07-10_

---

## 一、Markdown 作为数据库的通用风险

| 风险点 | 影响程度 | 说明 | 对应优化措施 |
|--------|----------|------|--------------|
| 结构标记对格式极度敏感 | 高 | `### `、`## `、元数据行必须严格符合固定格式。手写时多空格、少空格、缩进、中文 key 等都会导致任务/分组丢失或元数据失效（`scanner.ts:16-19`、`82-94`）。 | 保存前增加格式校验；解析失败时降级保留 raw text；在 UI 中限制手写编辑入口。 |
| 元数据字段含特殊字符被错误分割 | 高 | 元数据行用 `\|` 分隔（`scanner.ts:149-151`），标题、标签、URL 中若含 `\|` 会导致字段错位。 | 序列化时对 `\|`、`\n`、`#` 等特殊字符转义或拒绝写入；解析时支持转义反转。 |
| 序列化会重写整个文件 | 中 | `serializeList`（`serializer.ts:136-151`）每次都重新生成 Markdown，手写格式、注释、空行可能被规范化丢失。 | 尽量通过 UI 编辑，减少手写；必要时实现局部 patch 而非全量重写。 |
| 任务 ID 基于标题+创建时间 | 中 | `generateTaskId(title, created)`（`scanner.ts:403`），重命名或修改创建时间会导致 ID 变化，影响选中状态、过滤、周报引用。 | 引入稳定 ID 字段（如首次创建时生成 UUID 并存入 metadata `id: xxx`）。 |
| 多设备/离线同步冲突 | 高 | SHA 轮询只缓存远程 SHA 不自动拉内容；离线 pending writes 排队覆盖；无三向合并（`CLAUDE.md` 同步策略）。 | 保存前拉取最新内容做 diff/merge；metadata 增加 `updated_at` 或版本号；冲突时提示用户。 |
| 备注中结构标记越界 | 高 | 任务备注若包含 `### `、`## `、`🏁 ... \| ⏱ ...`、`---` 等，可能被 `scanBlocks` 误认为新任务/分组/完成线。 | 序列化备注时对结构标记转义；或在解析阶段引入“备注块”定界符保护。 |
| 子任务缩进层级计算问题 | 中 | `level = Math.floor(indent / 2) + 1`（`scanner.ts:190`），奇数缩进、Tab、非标准缩进会导致层级混乱；跳级时生成 `text: ''` 的空占位子任务（`scanner.ts:226-236`）。 | 严格规范编辑器输出 2 空格缩进；解析时拒绝或修正异常缩进。 |
| 状态推断可能覆盖手写状态 | 中 | `normalizeTask`（`serializer.ts:66-91`）会根据子任务状态推断并覆盖主任务状态，手动设置的 `done` 可能被改写。 | 区分“显式状态”与“推断状态”，显式状态优先且持久化。 |
| 无解析错误反馈 | 中 | `parseMarkdownToList` 不返回解析警告，异常输入会被静默丢弃或误解析。 | 解析器返回 warnings 数组，UI 提示用户哪些行无法识别。 |

---

## 二、子任务备注使用复杂 Markdown 的风险

子任务备注在 UI 中通过 `react-markdown` + `remark-gfm` 渲染，但底层存储仍受自定义 parser 约束。

| 风险点 | 影响程度 | 说明 | 对应优化措施 |
|--------|----------|------|--------------|
| 复选框列表 `- [ ]` 被解析为新子任务 | 高 | `parseSubtaskLine`（`scanner.ts:171-204`）会匹配备注中的 `- [ ]` 行，导致该行从备注中移出，变成独立子任务。 | 序列化时对备注中的 `- [ ]` / `- [x]` 做转义（如加反斜杠或零宽空格），解析时反转义。 |
| 属性行 `note:` / `link:` / `start:` / `due:` 打断备注 | 高 | `SUBTASK_ATTR_RE`（`scanner.ts:175`）会匹配这些行，备注提前终止，后续内容被解析为子任务属性（`scanner.ts:282-291`）。 | 对备注内的属性行前缀做转义；或在解析器中为备注引入更严格的结束条件。 |
| 空行在 round-trip 中丢失 | 中 | `serializer.ts:51` 写备注时跳过空行，导致 `first\n\nsecond` 变成 `first\nsecond`，破坏多段文字和代码块。 | 修改序列化逻辑，保留空行（输出仅含缩进的空行）。 |
| 缩进代码块缩进被抹平 | 中 | 序列化时对每行 `.trim()` 并重写缩进（`serializer.ts:50`），缩进代码块失去缩进，变成普通文本。 | 保留备注内相对缩进；或采用 fenced code block 存储复杂备注。 |
| 备注内标题/注释被当普通文本保留 | 低 | `### `、`## `、`<!-- -->` 在子任务备注中会被吞入 note 文本，不会破坏结构（因为发生在 `parseSubtasks` 阶段），但语义上可能让用户困惑。 | 无需强制修复；可在编辑器中给出提示。 |
| UI 中子任务备注不可见 | 中 | `TaskCard` 不显示 `subtask.note`，只有编辑器里才能看到，用户可能 unaware 备注已被破坏。 | 在任务卡片或子任务行增加 note 指示器/预览。 |
| Markdown 渲染无显式消毒 | 低 | `MarkdownPreview` 使用 `react-markdown` 默认行为，未配置 `rehype-sanitize`/`DOMPurify`。 | 增加 `rehype-sanitize` 或 `DOMPurify`，防止依赖升级后 XSS 风险。 |

---

## 三、建议的优化优先级

### 高优先级（建议尽快处理）

1. **子任务备注边界保护**：对 `- [ ]`、`- [x]`、`note:`、`link:`、`start:`、`due:` 等会打断备注的语法进行转义/反转义。
2. **保留备注空行**：修复 `serializer.ts:51` 丢弃空行的问题。
3. **任务 ID 稳定化**：引入持久化 UUID，避免重命名导致 ID 变化。
4. **同步冲突处理**：保存前拉取最新内容，至少提示用户存在冲突。

### 中优先级（建议后续迭代）

5. **解析器返回 warnings**：让 `parseMarkdownToList` 返回无法识别或可能异常的片段，便于 UI 提示。
6. **特殊字符转义**：对元数据值、标题、URL 中的 `\|`、`\n`、`#` 等做转义处理。
7. **Markdown 渲染消毒**：为 `MarkdownPreview` 增加 `rehype-sanitize`。

### 低优先级（可选优化）

8. **复杂备注专用存储格式**：当备注含代码块、多段、表格时，使用 fenced block 或 YAML-like 块存储。
9. **限制手写编辑入口**：提供只读原始 Markdown 查看，编辑尽量走 UI，减少格式破坏。

---

## 四、相关代码位置

- `src/parser/scanner.ts` — 自定义 Markdown 扫描与解析
- `src/parser/serializer.ts` — 内存结构序列化为 Markdown
- `src/parser/parser.test.ts` — 解析器 round-trip 测试
- `src/types/index.ts` — `Task`、`Subtask`、`TaskMeta` 类型定义
- `src/components/common/NoteEditor.tsx` — 备注编辑器
- `src/components/common/MarkdownPreview.tsx` — 备注 Markdown 预览
- `src/components/tasks/TaskCard.tsx` — 任务卡片（不显示子任务备注）
- `CLAUDE.md` — 项目架构与同步策略说明

---

## 五、测试建议

补充以下 parser round-trip 用例：

- 子任务备注包含 `- [ ]` 复选框列表。
- 子任务备注包含 `note:` / `link:` / `start:` / `due:` 行。
- 子任务备注包含空行。
- 子任务备注包含缩进代码块。
- 子任务备注包含 fenced code block。
- 任务备注包含 `### ` / `## ` / `🏁 ... \| ⏱ ...` / `---`。
- 元数据值包含 `\|` 字符。
- 任务标题包含 `\|`、`#`、换行。

运行 `npm run test` 验证修复后的行为。
