# Dong Todo

基于 Markdown + GitHub Repo 的纯前端待办系统。

## 技术栈

- Vite 6 + React 19 + TypeScript 5
- React Router 7
- Zustand
- Tailwind CSS 4
- Octokit (GitHub API)
- dnd-kit (拖拽排序)
- date-fns (日期处理)
- react-markdown + remark-gfm (备注渲染)
- vite-plugin-pwa (PWA)

## 数据结构

所有待办数据以 Markdown 文件形式存储于 GitHub 私有仓库的 `todo/` 目录下：

```
todo/
├── 工作.md
├── 学习.md
└── _archived/
    └── 工作.md
```

每个 `.md` 文件即一个清单，内部使用 `## 分组` 和 `### 任务` 组织。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

## 部署

1. 创建一个 GitHub 私有仓库，用于存储待办 Markdown 数据。
2. 创建另一个仓库（或使用同一仓库的 `gh-pages` 分支）托管前端构建产物。
3. 在设置页面配置 GitHub Token（Fine-grained PAT，需要 Contents: Read and write 权限）。
4. 如需部署到子路径，修改 `vite.config.ts` 中的 `base`。

## 首次使用

打开应用后，系统会引导至设置页面：
1. 输入 GitHub Token
2. 输入仓库所有者（用户名）
3. 输入仓库名
4. 输入存储路径（默认 `todo`）
5. 点击「保存并同步」

## 核心功能

- 清单管理：创建、删除、重命名
- 分组管理：在任务编辑中创建新分组
- 任务 CRUD：创建、编辑、删除
- 子任务：最多支持 3 层嵌套
- 状态自动推断：根据子任务完成情况自动维护主任务状态
- 优先级、开始/截止时间
- Markdown 备注与链接
- 搜索与过滤
- 排序：拖拽排序（默认）、按截止时间、按优先级
- 进度可视化
- GitHub API 同步与本地缓存
- 周期性任务：daily / weekly / monthly
- 浏览器 Notification 到期提醒

## 设计文档

- UI 设计系统规范：`doc/UI_DESIGN_SYSTEM.md`
- 产品详细设计文档：`doc/todo-system-detailed-design.md`
- 代码架构与开发规范：`CLAUDE.md`
