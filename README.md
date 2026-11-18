# Notes

A personal, cloud-synced note-taking app. It runs in the browser and installs as a PWA on desktop and mobile. Your data lives in **your own Supabase project** (Postgres, Auth and Storage) and is cached on each device for offline use. The app has no dependency on Claude or any paid AI service.

- **Live URL:** `https://ruyiyee.github.io/Note/` (GitHub Pages, deployed by `.github/workflows/deploy.yml`)
- **Cost:** $0 on the free tiers of GitHub Pages and Supabase. The limits are listed below.

## Architecture

```
Browser / installed PWA (React + TypeScript + Vite)
 ├─ UI: src/components/*  (sidebar · note list · TipTap editor · Tasks, Calendar, Vocabulary pages)
 ├─ Local cache + outbox: IndexedDB via Dexie (src/lib/db.ts)
 ├─ Sync engine: src/lib/sync.ts  (push dirty rows → pull by server updated_at cursor)
 ├─ Remote adapter: src/lib/remote.ts  (supabase-js + Realtime change feed)
 └─ Service worker (vite-plugin-pwa / Workbox): app shell works offline
                 │ HTTPS, user JWT
                 ▼
Supabase project (owned by the user)
 ├─ Auth: email + password, magic link, password reset
 ├─ Postgres: folders, notes, note_versions, attachments, cards, items — all with RLS "user_id = auth.uid()"
 ├─ Storage: private bucket "attachments", object paths "<user_id>/<uuid>-<name>", owner-only policies
 └─ Realtime: change events trigger a pull on other devices
```

### How sync works (`src/lib/sync.ts`)
1. Every local write goes through `src/lib/store.ts`. It writes the row to IndexedDB with `_dirty=1`, bumps `_rev` and schedules a sync after about 0.8 s.
2. **push:** dirty rows are upserted to Supabase. Folders go first, parents before children. A row's `_dirty` is cleared only if `_rev` didn't change during the upload.
3. **pull:** rows with `updated_at > cursor` (one cursor per table, kept in the `meta` table) are fetched. `updated_at` is always set by a server trigger, so device clocks don't matter. Local rows that are still dirty are not overwritten.
4. **When it runs:** on app start, on local edits, on window focus or visibility change, when the device comes back online, every 60 s, and on Realtime events.
5. **Conflicts:** the last write wins, per row. Overwritten note content can be recovered from **version history**: the app (`src/lib/versions.ts`) stores the previous content at most once every 30 minutes per note while you edit. Each page load is a "visit"; the first time a note is edited in a new visit, the `compact_note_versions` RPC trims every earlier visit down to its last snapshot. Snapshots need a connection (offline edits are saved, without a snapshot). Requires `0003_version_history_per_visit.sql`.
6. **Per-table isolation:** push and pull handle each table separately, so a failure in one table (for example a migration that hasn't been run) doesn't block the others.
7. **Deletes:** deletes are soft (`deleted_at`, shown in Trash). "Empty trash" hard-deletes the rows on the server and requires a connection.

The sync engine is unit-tested against an in-memory fake server (`tests/sync.test.ts`).

## Product shape (after the "simplify" redesign)
Six sections only: **All Notes, Favourites, Tasks, Calendar, Vocabulary, Trash**.
- **Folders → notebooks → notes.** Both levels live in the `folders` table: a row with `parent_id = null` is a folder, a row with a `parent_id` is a notebook inside it. A note's `folder_id` points at its notebook (or is null = unfiled, shown in All Notes).
- **Tasks** and **Calendar** entries are standalone rows in `items` (`kind` = `task` or `event`). They are not linked to notes.
- **Vocabulary** entries are rows in `cards` (word, definition, example, personal notes) reviewed with SM-2 spaced repetition.
- **Editor:** text styles, bold/italic/underline, four pink highlight colours, lists, checklist, table, freehand drawing block, pages, image/PDF attachments. **Hyperlinks are deliberately disabled.** "Full width" (Ctrl/⌘+Shift+E) hides the sidebar and list so the note uses nearly the whole screen.
- **Drawing block** (`src/lib/drawing.ts`): strokes are point lists `{p:[x,y,...], c, w}` in canvas pixels, stored in the note JSON (old `{d}` path strokes are converted on load). Tools: Ink/Pink pen, Eraser (small/medium/large; removes only the touched part of a stroke by splitting it), Lasso (select, drag to move, corner handle to resize, Delete), Move view (pan). Zoom 50–400% with buttons, Ctrl/⌘+wheel or pinch. Undo/Redo (also Ctrl/⌘+Z, Ctrl/⌘+Shift+Z) cover drawing, erasing, lasso and clear; the history lives while the note is open. Every finished gesture is saved into the document, so it autosaves and syncs.
- **Pages** (`src/lib/pages.ts`): a `pageBreak` node shown as a dashed line labelled "Page N" (CSS counter). The note stays continuous; the header's "Page" box jumps to a page number; PDF export starts each page on a new sheet.
- **Photo shrinking:** images are resized to at most 2000 px on the longest side and re-encoded (JPEG 85%, or WebP for PNG/WebP to keep transparency) before upload (`src/lib/image.ts`). GIF, SVG, PDFs and images that wouldn't get smaller are uploaded unchanged. Originals are not kept (owner's choice).
- **Closing:** "Close" in the note header (and moving a note to Trash) returns the editor to an "Open a note" empty state.
- **Spelling and grammar check:** on by default; Settings → Writing turns it off on this device (`src/lib/prefs.ts`, sets `spellcheck`, `autocorrect`, `autocapitalize` and Grammarly's `data-gramm` attributes).
- **Per note (More menu):** Version history, Duplicate, Export PDF, Move to Trash.
- **PDF export** of a note or a whole notebook uses the browser print dialog ("Save as PDF"), see `printNotes` in `src/lib/export.ts`.
- **Design rules from the owner:** navy and pink, five colours (`--white #ffffff`, `--pale #fde4ec`, `--rose #e86a92`, `--navy #1f2a44`, `--grey #8a93a8` in `src/styles.css`), navy sidebar, light theme only (no dark mode), no emojis, no icons, text labels only, generous spacing. Keep it that way.
- Removed on purpose: Inbox, Recent, Archive, tags, templates, links/backlinks/graph, flashcard generation from notes, dictionary lookup. The database columns (`inbox`, `archived`, `pinned`, `tags`, `color`, `icon`) still exist and are simply unused; old data is preserved and all non-deleted notes show in All Notes.

## Project layout
```
src/
  App.tsx                 auth gate, local-cache owner check
  components/
    Workspace.tsx         layout, views, keyboard shortcuts, sync wiring
    Sidebar.tsx           six sections + folder/notebook tree
    NoteList.tsx          notes of the current view, notebooks of a folder, search, rename/delete, notebook PDF export
    Editor.tsx            TipTap editor, toolbar, autosave, attachments, word count
    History.tsx           version history (server snapshots) + restore
    TasksView.tsx         standalone task list
    CalendarView.tsx      month grid + entries per day
    VocabView.tsx         words list/add/edit + flashcard review
    Settings.tsx          theme, password, export (JSON/Markdown), sign-out, account deletion
    Dialog.tsx            in-app text prompt / confirm (askText, askConfirm)
    SyncBadge.tsx, Auth.tsx
  lib/
    supabase.ts db.ts sync.ts remote.ts store.ts types.ts
    text.ts (search, word count)  srs.ts (SM-2)  drawing.ts (drawing block)  pages.ts (page separators)
    extensions.ts (TipTap setup + private image node)  attachments.ts  export.ts  theme.ts
supabase/migrations/      0001_init.sql, 0002_items_and_card_notes.sql (idempotent, run in order)
tests/                    vitest unit tests; tests/e2e/smoke.cjs and drawing.cjs, close-and-spellcheck.cjs browser tests with a simulated server
.github/workflows/deploy.yml        test + build + deploy to GitHub Pages on push to main
.github/workflows/keepalive.yml     daily ping so the free Supabase project is not paused
```

## Database schema (see `supabase/migrations/`)
| table | purpose | key columns |
|---|---|---|
| `folders` | folders (parent_id null) and notebooks (parent_id set) | `parent_id`, `name`, `color`, `icon`, `position`, `deleted_at` |
| `notes` | notes | `folder_id`, `title`, `content` (TipTap JSON), `content_text` (plain text), `tags text[]`, `pinned`, `favorite`, `archived`, `inbox`, `deleted_at` |
| `note_versions` | history snapshots (written by the app, one per 30 min per visit) | `note_id`, `title`, `content`, `session_id`, `created_at` |
| `attachments` | file metadata, files in Storage | `note_id`, `path`, `name`, `mime`, `size`, `deleted_at` |
| `cards` | vocabulary entries with SM-2 state | `front` (word), `back` (definition), `example`, `notes`, `ease`, `interval_days`, `reps`, `lapses`, `due_at` |
| `items` | standalone tasks and calendar entries | `kind` (`task`/`event`), `title`, `date`, `done`, `deleted_at` |

Every table has `id uuid` (generated on the client), `user_id` (defaults to `auth.uid()`), `created_at` and `updated_at` (set by the server). RLS policy `own rows`: `user_id = auth.uid()` for all operations, `authenticated` role only.

RPCs: `delete_my_account()` deletes the caller's auth user, and the delete cascades to all rows. The client removes Storage files first. `ping()` is used by the keep-alive workflow.

## API
There is no custom backend. The client talks to Supabase directly:
- PostgREST: `/rest/v1/<table>` (select/upsert/delete, filtered by RLS) and `/rest/v1/rpc/<fn>`
- Auth: `/auth/v1/*` via `supabase.auth`
- Storage: `/storage/v1/object/attachments/<user_id>/...` (upload, signed URLs, list, remove)
- Realtime: `postgres_changes` on the five synced tables, filtered by `user_id`

## Environment variables
| name | where | notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.production` (committed), `.env.local` (dev) | Project URL. Public. |
| `VITE_SUPABASE_ANON_KEY` | same | anon / publishable key. Public by design; access is enforced by RLS. |
| `BASE_PATH` | set by the deploy workflow | `/<repo>/` for GitHub Pages |

**Never** commit the `service_role` / secret key or the database password. The app doesn't need them.

## Setup from scratch
1. **Supabase:** create a free project. In the **SQL Editor**, paste and run each file in `supabase/migrations/` in order. The scripts are safe to re-run.
2. **Auth URLs:** in Supabase go to Authentication → URL Configuration. Set **Site URL** to the deployed URL (e.g. `https://ruyiyee.github.io/Note/`) and add it under **Redirect URLs**. Add `http://localhost:5173/` too for local development. Confirmation and magic-link emails use these URLs.
3. Put the project URL and anon key in `.env.production`. For local development, also copy them to `.env.local`.
4. **GitHub Pages:** go to repo Settings → Pages → Build and deployment → Source: **GitHub Actions**. Pushing to `main` then deploys.
5. **Local development:** `npm install && npm run dev`. Tests: `npm test`. Type check and production build: `npm run build`.

## Free-tier limits (honest list)
- **Supabase Free:** 500 MB database (note text, drawings, version history, words, tasks), 1 GB file storage (attachments), 50 MB per file, 5 GB download traffic per month. **Projects are paused after 7 days with no database activity.** `keepalive.yml` queries the database twice a day (06:17 and 18:47 UTC) and re-enables itself via the API on every run, so GitHub's 60-day "inactive repository" rule doesn't switch the schedule off. If the project is ever paused anyway (e.g. GitHub Actions outage for a week), data is kept: open supabase.com → the project → Restore. A failed ping shows as a failed run (red) in the repo's Actions tab, and GitHub emails the repo owner.
- **Supabase's built-in email** sends only a few auth emails per hour. For heavier use, configure custom SMTP under Auth → SMTP.
- **Backups:** the free tier has no downloadable point-in-time backups. Use Settings → Export regularly. The JSON export contains all rows, but it doesn't include attachment files; download those from Supabase Storage.
- **GitHub Pages:** free for public repos. The repo contains only code and public keys, no notes.

## Keyboard shortcuts
`Ctrl/⌘+Alt+N` new note · `Ctrl/⌘+K` search · `Ctrl/⌘+Shift+E` full width · `Ctrl/⌘+\` toggle sidebar · `Ctrl/⌘+S` sync now · `Ctrl/⌘+B/I/U` formatting.

## For the next agent
Read `TODO.md` first. Keep all local writes inside `src/lib/store.ts` so sync stays correct. Every schema change goes into a new numbered, idempotent migration in `supabase/migrations/`, and `src/lib/types.ts` must match it. Run `npm test && npm run build` before you push.
