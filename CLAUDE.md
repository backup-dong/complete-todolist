# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Dong Todo is a single-page React application that treats JSON files as its database. Tasks live as structured objects inside JSON files stored in a GitHub private repository; the app reads and writes those files through the GitHub API using Octokit. It is a pure frontend app with no backend server. Old Markdown (`.md`) files are still readable and are lazily migrated to JSON on first access.

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

- **Unit tests** live next to the code they test (`*.test.ts`). The parser tests are especially important because the JSON serializer round-trip is the core of the app; legacy Markdown parser tests are kept for migration coverage.
- **End-to-end tests** (`e2e-test.py`) run against a local Vite server with the GitHub API intercepted and mocked by Playwright. They cover settings, list/task CRUD, subtask status inference, repeating tasks, and deletion.
- The e2e test requires Python and `playwright` installed (`pip install playwright` and `playwright install chromium`).

## Architecture

### Data model: JSON as database

Each list is a single JSON file inside the configured GitHub repository path. The file name (without `.json`) is the list name. A file looks like:

```json
{
  "version": 1,
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
          "group": "项目Alpha",
          "meta": {
            "status": "active",
            "priority": "high",
            "due": "2026-07-10",
            "created": "2026-06-28"
          },
          "subtasks": [
            {
              "text": "收集飞书任务功能列表",
              "level": 1,
              "completed": true,
              "completed_at": "2026-07-02T14:30:00+08:00",
              "children": []
            }
          ],
          "note": "需要调研飞书任务、Notion、Todoist 三家的功能对比",
          "links": [
            { "title": "飞书任务官方", "url": "https://example.com" }
          ],
          "completed_at": null,
          "duration": null
        }
      ]
    }
  ]
}
```

Key formatting rules:

- `groups` array defines groups inside a list.
- Each object in `tasks` defines a task with a stable `id`.
- `task.meta` holds task-level metadata such as `status`, `priority`, `created`, `start`, `due`, `repeat`, `order`, and `tags`.
- `subtasks` is a recursive array; each subtask has `text`, `level`, `completed`, `completed_at`, optional `start`/`due`, `note`, `links`, and `children`.
- `note` may contain arbitrary Markdown, but it is treated as a plain string field and no longer participates in structure parsing.
- A completed task has `meta.status: "done"` plus non-null `completed_at` and `duration`.

### Parsing

Do **not** use `react-markdown` or a generic Markdown parser to extract task structure. The primary persistence format is JSON, parsed by `src/parser/jsonParser.ts`.

- `parseJsonToList(content, sha?)` parses a JSON string into `ParsedList` and validates the `version` field.
- `serializeListToJson(list)` in `src/parser/jsonSerializer.ts` turns the in-memory `ParsedList` back into canonical JSON.
- The legacy Markdown scanner in `src/parser/scanner.ts` and serializer in `src/parser/serializer.ts` are kept for migrating old `.md` files. `listMarkdownFiles` / `serializeList` should only be used in migration contexts.

After any edit, the flow is `ParsedList` → `serializeListToJson` → GitHub write (or pending write if offline). Re-serialization normalizes ordering and inferred fields, so hand-edited JSON may be rewritten.

`normalizeTask` in `src/parser/serializer.ts` is the single place where a task's `status`, `completed_at`, and `duration` are inferred from its subtasks. It is reused by `jsonSerializer.ts`.

### State management

State is split across three Zustand stores in `src/stores/`:

- **`syncStore.ts`** owns the GitHub config (`token`, `owner`, `repo`, `basePath`), sync status (`synced` | `syncing` | `unsaved` | `offline` | `unconfigured`), and polling/SHA logic. It initializes Octokit and exposes `pollSha()` and `pushPending()`.
- **`listsStore.ts`** owns the list catalog, the active list/group, and the `fileCache` of parsed `ParsedList` objects. It is the only store that talks to `src/github/client.ts` and `src/utils/storage.ts`. All task mutations eventually call `saveListContent` here, which serializes the list to JSON and pushes it to GitHub (or queues a pending write if offline). It also handles reading legacy `.md` files and lazily migrating them to `.json`.
- **`tasksStore.ts`** owns the flattened task list for the active list, filtering/sorting state, and selected task ID. It reads from `listsStore.fileCache` and delegates persistence back to `listsStore.saveListContent`. It also contains the repeating-task advancement logic.

### GitHub client

`src/github/client.ts` wraps Octokit with these helpers:

- `initGitHub(config)` / `clearGitHub()` manage a module-level Octokit instance.
- `listFilesByExtension(config, extension, subPath?)` lists files with the given extension (`.json` or `.md`) under the configured base path. `fetchLists` uses this to discover both JSON lists and legacy Markdown lists.
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
- When adding new metadata fields, add them to `TaskMeta` in `src/types/index.ts`, to the JSON parser defaults in `src/parser/jsonParser.ts`, and to `jsonSerializer.ts` so the round-trip parse/serialize remains lossless. Only update the legacy Markdown `META_KEYS` / `META_ORDER` switches if the field also needs to survive Markdown migration.
- Avoid changing the boundary rules in the legacy `scanBlocks` unless you also update the legacy serializer; the Markdown parser relies on `###` and `##` lines as the only structural boundaries. New features should rely on the JSON schema instead.
