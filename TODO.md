# TODO / status

_Last updated: 2026-11-16 (navy and pink theme, drawing tools, pages)_

## Done
- [x] Supabase schema with RLS on every table, private storage bucket, version-history trigger, account-deletion RPC, ping RPC (`0001_init.sql`); `items` table + `cards.notes` (`0002_items_and_card_notes.sql`); version history every 30 min per visit, earlier visits compacted to one (`0003_version_history_per_visit.sql`, user must run it)
- [x] Auth: sign up, sign in, magic link, password reset email, change password, sign out
- [x] Offline-first cache (IndexedDB) + outbox + sync engine (push/pull, cursors, Realtime, per-table isolation)
- [x] Six sections: All Notes, Favourites, Tasks, Calendar, Vocabulary, Trash
- [x] Folders → notebooks → notes; rename/delete; move a note via the notebook selector or drag onto a notebook
- [x] Notes: create, edit, autosave, duplicate, favourite, Trash → restore / empty, global search with highlighted matches, sort
- [x] Editor: text styles, bold/italic/underline, four pink highlights, bullets, numbers, checklist, table, freehand drawing, image/PDF attachments; hyperlinks disabled
- [x] Delete version history: one version, all versions of a note (History panel), or all history (Settings → Your data); uses the existing "own rows" RLS, no extra SQL
- [x] Word count under the note (total, or "N of M words selected" while text is selected; CJK characters count as one word each)
- [x] Version history with restore (Summary was removed at the user's request)
- [x] Images live only inside the note (pasted at the cursor, dropped where dropped, movable by dragging); the "Files" list under a note shows only non-image files such as PDFs (`tests/e2e/images-inline.cjs`)
- [x] Colourful PDF export in the app palette (title accent, coloured headings and bullets, navy table header, highlights kept)
- [x] PDF export of a note or a notebook (browser print dialog); JSON + Markdown export of everything
- [x] Tasks: standalone list with optional due date
- [x] Calendar: add entries directly to a day
- [x] Vocabulary: word, definition, example, personal notes; flashcard review with SM-2
- [x] Navy and pink theme (light only), full-width writing mode
- [x] Drawing: clean split-stroke eraser with 3 sizes, undo/redo, zoom and pan (buttons, Ctrl/⌘+wheel, pinch), lasso select/move/resize/delete
- [x] Pages within a note (dashed "Page N" separators, go-to-page box, one page per sheet in PDF)
- [x] Close button and "Open a note" empty state (also after moving a note to Trash); spelling/grammar check toggle in Settings
- [x] Automatic photo shrinking before upload (tested in Chromium: 8.6 MB 4032×3024 photo → 0.66 MB 2000×1500)
- [x] Fixed: cursor jumped to the empty line below a list after leaving and returning to the tab (own saved content coming back from the server with re-ordered JSON keys reset the editor). Now compared order-insensitively, and real remote changes keep the cursor position. Test: tests/e2e/cursor-after-return.cjs
- [x] Account deletion; responsive phone layout; installable PWA; offline app shell
- [x] GitHub Pages deploy workflow + daily Supabase keep-alive workflow

## Verified
- [x] `npm test`: 25 unit tests (incl. 30-minute snapshot interval, word count) (incl. eraser splitting, eraser size, lasso, move/resize, legacy stroke conversion, page count) + (sync engine incl. offline queue, edit-during-upload, one-table-failure isolation, folder deletion keeps notes; search; SM-2)
- [x] `node tests/e2e/smoke.cjs` against a simulated Supabase API: folder → notebook → note, highlight + drawing saved, links not created, no Summary item, PDF export content (note + notebook), search, tasks, calendar entry, vocabulary add + review, phone-sized second device receives note and drawing, no horizontal overflow, offline edit syncs on reconnect, reload persistence, no console errors
- [x] `node tests/e2e/drawing.cjs`: draw, partial erase with unchanged stroke width, undo/redo of erase, lasso move + delete + undo, zoom, three pages + go to page 3, full width (878px → 1440px), autosave to server, strokes and pages intact after reload, PDF content
- [x] Live checks on the real project (2026-11-16): site loads, service worker active, anon cannot read or insert rows, anon cannot call `delete_my_account`, storage bucket not public
- [ ] **Not yet verified signed-in on the real project:** real sign-up/login, real cross-device sync, attachment upload to Storage, version history rows, account deletion, second user cannot see first user's rows

## Next priorities
1. Owner runs `0002_items_and_card_notes.sql` in Supabase (until then Tasks, Calendar and Vocabulary stay on the device and the badge shows "Sync problem"; notes sync normally)
2. Signed-in end-to-end test on the live URL (list above)
3. Code-split the bundle (about 1 MB)
4. Import from a JSON backup; include attachment files in export
5. Purge Trash older than 30 days automatically
6. Dedicated "set new password" screen for the `PASSWORD_RECOVERY` auth event
7. Drawing: pressure, pen sizes, Apple Pencil palm rejection (only if the owner asks; they want minimal)
8. Drawing undo history is per open note (not kept after closing the note); the note itself is versioned server-side

## Known issues / limitations
- Attachments and version history need a connection
- PDF export depends on the browser's print dialog ("Save as PDF")
- Conflicts are last-write-wins per note (older text recoverable from version history)
- Typing right after a highlighted word continues the highlight until it is toggled off (standard editor behaviour)
- `alert()` is still used for one error (emptying Trash while offline)
