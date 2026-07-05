# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Dong Todo is a single-page React application that treats Markdown files as its database. Tasks live as `###` headings inside Markdown files stored in a GitHub private repository; the app reads and writes those files through the GitHub API using Octokit. It is a pure frontend app with no backend server.

## Tech stack

- **Build tool:** Vite 6 with React plugin
- **Framework:** React 19 (strict mode), TypeScript 5
- **Routing:** React Router DOM 7
- **State:** Zustand 5
- **Styling:** Tailwind CSS 4 via `@tailwindcss/vite`
- **Markdown rendering:** `react-markdown` + `remark-gfm` (only for notes/links, never for structure parsing)
- **Drag & drop:** `@dnd-kit/core`, `@dnd-kit/sortable`
- **Headless UI primitives:** Radix UI (`Dialog`, `DropdownMenu`, `Select`, `Tooltip`)
- **GitHub API:** Octokit 4
- **PWA:** `vite-plugin-pwa`
- **Date library:** `date-fns`

## Common commands

All commands run from the repository root.

```bash
# Start the dev server (Vite HMR)
npm run dev

# Type-check and build for production; output goes to dist/
npm run build

# Preview the production build locally
npm run preview

# Lint TypeScript/TSX with ESLint
npm run lint

# Run unit tests (Vitest)
npm run test

# Run end-to-end tests with a mocked GitHub API (requires Python + Playwright)
npm run test:e2e
```

## Development notes

- The app requires a GitHub Personal Access Token to function. On first load, if no token is saved, the app redirects to `/settings` where the user must provide a token, repository owner, repository name, and an optional base path (default `todo`).
- Token and repository settings are persisted in `localStorage` under the key `dong-todo:github-config`.
- The Vite dev server proxy is not configured for the GitHub API; requests go directly to `api.github.com` from the browser.

## Testing

- **Unit tests** live next to the code they test (`*.test.ts`). The parser tests are especially important because the Markdown scanner/serializer round-trip is the core of the app.
- **End-to-end tests** (`e2e-test.py`) run against a local Vite server with the GitHub API intercepted and mocked by Playwright. They cover settings, list/task CRUD, subtask status inference, repeating tasks, and deletion.
- The e2e test requires Python and `playwright` installed (`pip install playwright` and `playwright install chromium`).

## Architecture

### Data model: Markdown as database

Each list is a single Markdown file inside the configured GitHub repository path. The file name (without `.md`) is the list name. A file looks like:

```markdown
# 工作

<!-- todo:list-meta
  created: 2026-07-01
  archived: false
-->

## 项目Alpha

### 竞品调研报告
status: active | priority: high | due: 2026-07-10 | created: 2026-06-28

- [x] 收集飞书任务功能列表 (2026-07-02T14:30:00+08:00)
- [ ] 收集 Notion 功能列表

**备注**
需要调研飞书任务、Notion、Todoist 三家的功能对比

**链接**
- [飞书任务官方](https://example.com)

---
```

Key formatting rules:

- `##` headings define groups inside a list.
- `###` headings define tasks.
- The line directly under a task heading is a metadata line with `key: value` pairs separated by `|`.
- Subtasks are nested `- [ ]` / `- [x]` list items. Completed subtasks record an ISO 8601 timestamp in parentheses.
- Task notes use a `**备注**` section; task links use a `**链接**` section.
- A completed task ends with a `🏁 时间 | ⏱ 耗时` line.
- `---` separators are purely visual; the parser ignores them and uses `###` / `##` boundaries.

### Parsing

Do **not** use `react-markdown` or a generic Markdown parser to extract task structure. The project uses a dedicated two-pass scanner in `src/parser/scanner.ts`:

1. `scanBlocks(lines)` splits the raw text into task blocks by `###` / `##` boundaries.
2. `parseTaskBlock(block, groupName)` parses metadata, subtasks, notes, links, and the finish line.

`src/parser/serializer.ts` is the inverse: it turns the in-memory `ParsedList` back into canonical Markdown. After any edit, the flow is `ParsedList` → `serializeList` → GitHub write. Re-serialization normalizes whitespace and ordering, so hand-edited formatting may be rewritten.

`normalizeTask` in `src/parser/serializer.ts` is the single place where a task's `status`, `completed_at`, and `duration` are inferred from its subtasks.

### State management

State is split across three Zustand stores in `src/stores/`:

- **`syncStore.ts`** owns the GitHub config (`token`, `owner`, `repo`, `basePath`), sync status (`synced` | `syncing` | `unsaved` | `offline` | `unconfigured`), and polling/SHA logic. It initializes Octokit and exposes `pollSha()` and `pushPending()`.
- **`listsStore.ts`** owns the list catalog, the active list/group, and the `fileCache` of parsed `ParsedList` objects. It is the only store that talks to `src/github/client.ts` and `src/utils/storage.ts`. All task mutations eventually call `saveListContent` here, which serializes the list and pushes it to GitHub (or queues a pending write if offline).
- **`tasksStore.ts`** owns the flattened task list for the active list, filtering/sorting state, and selected task ID. It reads from `listsStore.fileCache` and delegates persistence back to `listsStore.saveListContent`. It also contains the repeating-task advancement logic.

### GitHub client

`src/github/client.ts` wraps Octokit with these helpers:

- `initGitHub(config)` / `clearGitHub()` manage a module-level Octokit instance.
- `listMarkdownFiles(config)` lists `.md` files under the configured base path.
- `getFileContent(config, path)` fetches and base64-decodes a file.
- `writeFileContent(config, path, content, sha?)` creates or updates a file.
- `deleteFile(config, path, sha)` deletes a file.

### Offline / sync strategy

- `localStorage` caches file content, SHA map, active list, pending writes, and notified tasks. See `src/utils/storage.ts` for all key names.
- When a save fails because the user is offline or the API errors, the serialized content is stored in `dong-todo:pending-writes` and `syncStore` moves to `unsaved`.
- On `online` event, `syncStore.pushPending()` attempts to flush pending writes.
- SHA polling runs every 60 seconds and on `visibilitychange` to `visible`, but currently only caches the remote SHA map; it does not automatically pull changed content.

### Routing

`src/App.tsx` sets up two routes:

- `/` renders `MainLayout` (sidebar + content area).
- `/settings` renders the GitHub configuration page.
- Unknown paths redirect to `/`.

If no GitHub config exists, the app redirects to `/settings`.

### Important utilities

- `src/utils/date.ts` – ISO formatting, relative date display, due-date predicates (today, this week, overdue), and duration calculation.
- `src/utils/repeat.ts` – `computeNextDue` for daily, weekly, monthly, weekdays, and custom comma-separated weekday/month-day rules.
- `src/utils/id.ts` – deterministic task ID generated from title + created date.
- `src/utils/storage.ts` – all `localStorage` access.

### Build configuration

- `vite.config.ts` uses `@/` as an alias for `src/`.
- `base: '/'` is set in Vite config; change it if deploying to a subpath.
- PWA manifest is configured for installability.
- `tsconfig.json` is a project-reference root referencing `tsconfig.app.json` and `tsconfig.node.json`.

## Working on the codebase

- When modifying task state, prefer going through `tasksStore` actions; persistence is handled by `listsStore.saveListContent`.
- When adding new metadata fields, add them to `TaskMeta` in `src/types/index.ts`, to `META_KEYS` and the switch in `parseMetadataLine`, and to `META_ORDER` and the switch in `serializeMetadataLine`. Keep the round-trip parse/serialize lossless.
- Avoid changing the boundary rules in `scanBlocks` unless you also update the serializer; the parser relies on `###` and `##` lines as the only structural boundaries.
