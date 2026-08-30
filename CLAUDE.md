# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Dong Todo is a single-page React application that treats JSON files as its database. Tasks live as structured objects inside JSON files stored in a GitHub private repository; the app reads and writes those files through the GitHub API using Octokit. It is a pure frontend app with no backend server. Only v2 JSON lists are supported; v1 data must be converted locally with the migration tool before use.

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
# NOTE: `npm run test:e2e` currently points at a stale absolute path (with_server.py no longer exists).
# Run manually: start `npm run dev` in one terminal, then `python -X utf8 e2e-test.py`.
npm run test:e2e

# Migrate legacy v1 JSON lists to v2 (local execution against a cloned todo repo)
npm run migrate:v2 -- --dir <local-repo-dir> [--dry-run] [--no-backup]
```

## Development notes

- The app requires a GitHub Personal Access Token to function. On first load, if no token is saved, the app redirects to `/settings` where the user must provide a token, repository owner, repository name, and an optional base path (default `todo`).
- Token and repository settings are persisted in `localStorage` under the key `dong-todo:github-config`.
- The Vite dev server proxy is not configured for the GitHub API; requests go directly to `api.github.com` from the browser.

## Testing

- **Unit tests** live next to the code they test (`*.test.ts`). The parser tests are especially important because the JSON serializer round-trip is the core of the app.
- **End-to-end tests** (`e2e-test.py`) run against a local Vite server with the GitHub API intercepted and mocked by Playwright. They cover settings, list/task CRUD, subtask status inference, repeating tasks, and deletion. The holiday API (`api.apisbo.com`) is also mocked so repeating-task advancement stays deterministic.
- The e2e test requires Python and `playwright` installed (`pip install playwright` and `playwright install chromium`).

## Architecture

### Data model: JSON as database

Each list is a single JSON file inside the configured GitHub repository path. The file name (without `.json`) is the list name. A file looks like:

```json
{
  "version": 2,
  "meta": {
    "name": "工作",
    "created": "2026-07-01",
    "archived": false
  },
  "groups": [
    {
      "name": "项目Alpha",
      "tasks": [
        {
          "id": "a1b2c3d4",
          "title": "竞品调研报告",
          "parentId": null,
          "group": "项目Alpha",
          "meta": {
            "status": "active",
            "priority": "high",
            "due": "2026-07-10",
            "created": "2026-06-28"
          },
          "note": "需要调研飞书任务、Notion、Todoist 三家的功能对比",
          "links": [
            { "title": "飞书任务官方", "url": "https://example.com" }
          ],
          "completed_at": null,
          "duration": null
        },
        {
          "id": "b2c3d4e5",
          "title": "收集飞书任务功能列表",
          "parentId": "a1b2c3d4",
          "group": "项目Alpha",
          "meta": {
            "status": "done",
            "priority": "med",
            "created": "2026-06-28"
          },
          "completed_at": "2026-07-02T14:30:00+08:00",
          "duration": "4d"
        }
      ]
    }
  ]
}
```

Key formatting rules:

- `groups` array defines groups inside a list.
- Every task (top-level or subtask) is a **flat object** in the `tasks` array. Hierarchy is expressed with `parentId` (a subtask points to its parent's `id`; `null` means top-level). There is no recursive `subtasks` array in persisted JSON.
- `task.meta` holds task-level metadata such as `status`, `priority`, `created`, `start`, `due`, `repeat`, `repeat_until`, `order`, and `tags`.
- `order` (in `meta`) is positional, 1-based within the same parent; `buildSubtaskTree` sorts children by `order`.
- `note` may contain arbitrary Markdown, but it is treated as a plain string field and no longer participates in structure parsing.
- A completed task has `meta.status: "done"` plus non-null `completed_at` (ISO string) and `duration` (e.g. `"4d"`).
- The legacy v1 format (nested subtasks) is rejected by the parser with a hint to run the migration tool first.

### Parsing

Do **not** use `react-markdown` or a generic Markdown parser to extract task structure. The primary persistence format is JSON, parsed by `src/parser/jsonParser.ts`.

- `parseJsonToList(content, sha?)` parses a JSON string into `ParsedList` and validates the `version` field. v1 content throws with a hint to run the local migration tool.
- `serializeListToJson(list)` in `src/parser/jsonSerializer.ts` turns the in-memory `ParsedList` back into canonical JSON.
- The migration tool lives in `scripts/` (`transform.mjs` pure functions, `migrate-v1-to-v2.mjs` CLI, `transform.test.mjs` tests) and is fully decoupled from `src/` — it converts legacy v1 JSON (nested subtasks) to v2 locally.

After any edit, the flow is `ParsedList` → `serializeListToJson` → GitHub write (or pending write if offline). Re-serialization normalizes ordering and inferred fields, so hand-edited JSON may be rewritten.

`normalizeTask` in `src/parser/jsonSerializer.ts` computes a task's `status`, `completed_at`, and `duration` from its `completed_at`, its descendants (passed in by the caller via `getDescendants`), and an optional explicit status. Parsing itself only normalizes shapes; status inference happens at mutation time in the store layer.

### State management

State is split across three Zustand stores in `src/stores/`:

- **`syncStore.ts`** owns the GitHub config (`token`, `owner`, `repo`, `basePath`), sync status (`synced` | `syncing` | `unsaved` | `offline` | `unconfigured`), and polling/SHA logic. It initializes Octokit and exposes `pollSha()` and `pushPending()`.
- **`listsStore.ts`** owns the list catalog, the active list/group, and the `fileCache` of parsed `ParsedList` objects. It is the only store that talks to `src/github/client.ts` and `src/utils/storage.ts`. All task mutations eventually call `saveListContent` here, which serializes the list to JSON and pushes it to GitHub (or queues a pending write if offline).
- **`tasksStore.ts`** owns the top-level task list for the active list, filtering/sorting state, and selected task ID. It reads from `listsStore.fileCache` and delegates persistence back to `listsStore.saveListContent`. All hierarchy-aware operations (toggle, cascade delete, subtree replace) go through the pure helpers in `src/utils/subtasks.ts`, which operate on the flattened task arrays. It also contains the repeating-task advancement logic.

### GitHub client

`src/github/client.ts` wraps Octokit with these helpers:

- `initGitHub(config)` / `clearGitHub()` manage a module-level Octokit instance.
- `listFilesByExtension(config, extension, subPath?)` lists files with the given extension (`.json`) under the configured base path. `fetchLists` uses this to discover JSON lists.
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
- When adding new metadata fields, add them to `TaskMeta` in `src/types/index.ts`, to the JSON parser defaults in `src/parser/jsonParser.ts`, and to `jsonSerializer.ts` so the round-trip parse/serialize remains lossless.
- When changing flat/descendant semantics, keep the pure helpers in `src/utils/subtasks.ts` flat-array based (they operate on the persisted shape, not on in-memory trees).

## Git workflow

- Commit directly to the current branch (usually `main`). Do not create a feature branch unless the user explicitly asks for one.
- Only push when explicitly asked.
