# TODO / status

_Last updated: 2026-11-16_

## Done (in code; see "Verified" for what has actually been tested)
- [x] Supabase schema with RLS on every table, a private storage bucket with owner-only policies, a version-history trigger, an account-deletion RPC and a ping RPC (`supabase/migrations/0001_init.sql`)
- [x] Auth: sign up, sign in, magic link, password reset email, change password, sign out (warns about unsynced changes)
- [x] Offline-first local cache (IndexedDB) + outbox + sync engine (push/pull, cursors, Realtime, retry on focus/online/interval)
- [x] Notes: create, edit, autosave (600 ms debounce + flush on blur/close), duplicate, archive, soft delete → Trash → restore / empty, pin, favourite, inbox
- [x] Save/sync indicators: per note ("Saved to cloud" or "Saved on this device · waiting to sync") and global (sidebar badge)
- [x] Rich text (TipTap): H1–H3, bold/italic/underline/strike, highlight, code, lists, checklists, quotes, code blocks, tables, links
- [x] Attachments: images (inline, private, via signed URLs), PDFs and other files (listed under the note); paste/drop upload
- [x] Nested folders with colour + icon, rename, subfolders, delete (notes are kept), drag a note onto a folder
- [x] Tags, tag suggestions (keywords), sort by edited/created/title, Recent, Inbox quick capture
- [x] Global search with filters (`tag:` `#` `folder:` `is:pinned|favorite|archived|task` and "phrases"), highlighted snippets
- [x] Keyboard shortcuts (see README)
- [x] Templates: lecture, research, meeting, weekly plan, vocabulary list
- [x] Version history panel with restore
- [x] Connections: `[[wiki links]]`, backlinks, related notes, graph view
- [x] Tasks view across notes with `@YYYY-MM-DD` deadlines, toggling from the view
- [x] Calendar view (notes by day, tasks due)
- [x] Vocabulary: decks, SM-2 spaced repetition review, stats, free dictionary lookup, speech
- [x] Study panel: extractive summary, keywords, flashcard/question generation, quick quiz
- [x] Export: full JSON + Markdown (all notes), Markdown per note, print to PDF
- [x] Account deletion (files, then account; all rows cascade)
- [x] Light/dark/system theme, responsive single-pane mobile layout, installable PWA, offline app shell
- [x] GitHub Pages deploy workflow + daily Supabase keep-alive workflow

## Verified
- [x] `npm test`: 13 unit tests (sync engine against a fake server: push, pull, local-wins-while-dirty, fresh-device pull, edit-during-upload, offline queue; text utils; SM-2)
- [x] `npm run build` (type check + production build) passes
- [ ] **Not yet verified against the real Supabase project or on the live URL.** The build container can't reach supabase.co. To do: sign up, create/edit a note, reload, second browser/device sync, attachment upload, offline edit → reconnect, export, account deletion, RLS check (a second user can't read the first user's rows)

## Next priorities
1. Run the SQL migration in Supabase and set the Auth Site URL / Redirect URLs (owner action, see README → Setup)
2. End-to-end test on the live URL (list above) and fix what fails
3. Code-split the bundle (about 1 MB; lazy-load VocabView/GraphView/CalendarView and turndown)
4. "Import JSON backup" (restore from export)
5. Include attachment files in export (zip) — currently only metadata
6. Clickable `[[links]]` inside the editor, with autocomplete when typing `[[`
7. Purge Trash older than 30 days automatically (currently manual)
8. Handle `PASSWORD_RECOVERY` auth event with a dedicated "set new password" screen (currently: user lands signed in and can change the password in Settings)
9. Smarter conflict handling (per-field merge, or show a conflict copy) instead of last-write-wins
10. Card editing of example/pronunciation in the table; deck rename

## Known issues / limitations
- Attachments need a connection to upload; images show "unavailable offline" when offline unless the browser has cached them
- Version history needs a connection
- The graph view is O(n²) on tag edges; fine for hundreds of notes, slow for thousands
- Folder/tag management uses `prompt()`/`confirm()` dialogs (functional, not pretty)
