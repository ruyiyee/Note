# TODO / status

_Last updated: 2026-11-16 (after the "simplify" redesign)_

## Done
- [x] Supabase schema with RLS on every table, private storage bucket, version-history trigger, account-deletion RPC, ping RPC (`0001_init.sql`); `items` table + `cards.notes` (`0002_items_and_card_notes.sql`)
- [x] Auth: sign up, sign in, magic link, password reset email, change password, sign out
- [x] Offline-first cache (IndexedDB) + outbox + sync engine (push/pull, cursors, Realtime, per-table isolation)
- [x] Six sections: All Notes, Favourites, Tasks, Calendar, Vocabulary, Trash
- [x] Folders → notebooks → notes; rename/delete; move a note via the notebook selector or drag onto a notebook
- [x] Notes: create, edit, autosave, duplicate, favourite, Trash → restore / empty, global search with highlighted matches, sort
- [x] Editor: text styles, bold/italic/underline, four pink highlights, bullets, numbers, checklist, table, freehand drawing, image/PDF attachments; hyperlinks disabled
- [x] Summary panel (local algorithm) and version history with restore
- [x] PDF export of a note or a notebook (browser print dialog); JSON + Markdown export of everything
- [x] Tasks: standalone list with optional due date
- [x] Calendar: add entries directly to a day
- [x] Vocabulary: word, definition, example, personal notes; flashcard review with SM-2
- [x] Account deletion; light/dark/system theme; responsive phone layout; installable PWA; offline app shell
- [x] GitHub Pages deploy workflow + daily Supabase keep-alive workflow

## Verified
- [x] `npm test`: 12 unit tests (sync engine incl. offline queue, edit-during-upload, one-table-failure isolation, folder deletion keeps notes; search; summary; SM-2)
- [x] `node tests/e2e/smoke.cjs` against a simulated Supabase API: folder → notebook → note, highlight + drawing saved, links not created, summary panel, PDF export content (note + notebook), search, tasks, calendar entry, vocabulary add + review, phone-sized second device receives note and drawing, no horizontal overflow, offline edit syncs on reconnect, reload persistence, no console errors
- [x] Live checks on the real project (2026-11-16): site loads, service worker active, anon cannot read or insert rows, anon cannot call `delete_my_account`, storage bucket not public
- [ ] **Not yet verified signed-in on the real project:** real sign-up/login, real cross-device sync, attachment upload to Storage, version history rows, account deletion, second user cannot see first user's rows

## Next priorities
1. Owner runs `0002_items_and_card_notes.sql` in Supabase (until then Tasks, Calendar and Vocabulary stay on the device and the badge shows "Sync problem"; notes sync normally)
2. Signed-in end-to-end test on the live URL (list above)
3. Code-split the bundle (about 1 MB)
4. Import from a JSON backup; include attachment files in export
5. Purge Trash older than 30 days automatically
6. Dedicated "set new password" screen for the `PASSWORD_RECOVERY` auth event
7. Drawing: pressure/smoothing, more pen sizes (only if the owner asks; they want minimal)

## Known issues / limitations
- Attachments and version history need a connection
- PDF export depends on the browser's print dialog ("Save as PDF")
- Conflicts are last-write-wins per note (older text recoverable from version history)
- Typing right after a highlighted word continues the highlight until it is toggled off (standard editor behaviour)
- `alert()` is still used for one error (emptying Trash while offline)
