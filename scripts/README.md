# v1 → v2 清单迁移工具

将旧版 JSON（`version: 1`，递归嵌套 `subtasks`）待办清单转换为新版 JSON（`version: 2`，扁平 `parentId` 结构）。工具在本地直接操作 clone 下来的待办仓库，不经过 GitHub API，**迁移前自动备份**。

## 使用前提

- Node.js 18+
- 已 clone 待办仓库：`git clone <your-todo-repo> <local-dir>`
- 本仓库依赖已安装：`npm install`

## 快速开始

### 1. dry-run 预览（不写任何文件）

```bash
npm run migrate:v2 -- --dir <local-dir> --dry-run
```

输出扫描到的文件数与待迁移清单，确认无误再实跑。

### 2. 正式迁移

```bash
npm run migrate:v2 -- --dir <local-dir>
```

- 迁移前自动把所有 v1 文件打包备份为 `dong-todo-v1-backup-<时间戳>.zip`，默认输出到仓库目录的**上一级**
- v1 文件原地转换为 v2；v2 文件跳过（幂等，可重复执行）；解析失败/未知版本的文件告警跳过
- 结束输出报告：迁移 N / 跳过 N / 失败 N / 备份路径；存在失败时退出码为 1

### 3. 推送回远程

```bash
cd <local-dir>
git add -A
git commit -m "migrate lists to JSON v2"
git push
```

## 参数

| 参数 | 说明 |
|---|---|
| `--dir <path>` | （必填）待办仓库根目录 |
| `--backup-dir <path>` | 备份 zip 输出目录，默认 `--dir` 的上一级 |
| `--no-backup` | 不生成备份压缩包 |
| `--dry-run` | 只报告，不写回、不备份 |

示例：

```bash
# 指定备份目录
npm run migrate:v2 -- --dir C:\todo-repo --backup-dir D:\backups

# 不备份（已手动备份过时）
npm run migrate:v2 -- --dir C:\todo-repo --no-backup
```

## 转换规则

| v1 | v2 |
|---|---|
| `subtasks[]` 嵌套 | 全部展平为独立 Task，`parentId` 关联 |
| `text` | `title` |
| `completed` | `meta.status`（`done` / `pending`） |
| `level` | 丢弃（由 parentId 链深度推导） |
| `children[]` 顺序 | 同父子任务按原顺序写 `meta.order = 1..n` |
| `start` / `due` / `note` / `links` / `files` / `completed_at` | 原样保留 |
| 缺 `id` 的子任务 | 用确定性 hash 生成（同文本冲突自动加后缀） |
| `group` | 子任务继承父任务 |

迁移后的清单以 `version: 2` 输出；已是 v2 的文件原样不动。

## 文件结构

```
scripts/
├── README.md                # 本文件
├── migrate-v1-to-v2.mjs     # CLI 入口（本地扫描 → 备份 → 转换 → 写回）
├── transform.mjs            # v1→v2 纯转换函数（不依赖应用代码）
└── transform.test.mjs       # 转换函数单测（npm run test 自动收集）
```

## 注意事项

- 先迁移再部署新应用；若应用已升级且尚未迁移，v1 清单在应用中会报「版本过旧」错误，此时不要编辑该清单，跑完本工具即可
- 工具不处理 `.md` 遗留文件（应用已不再读取 Markdown）
- 备份 zip 内含所有迁移前的 v1 文件原文（相对路径），可用于回滚