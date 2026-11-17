// Version history, taken by the app:
// - While you edit a note, its previous state is saved at most once every 30 minutes.
// - Each page load is one "visit" (SESSION). When a note is first edited in a new visit,
//   earlier visits are compacted on the server to one snapshot each (their latest).
// Snapshots need a connection; offline edits are still saved, just without a snapshot.
import { db } from './db';
import { supabase } from './supabase';

export const SNAPSHOT_EVERY_MS = 30 * 60 * 1000;
export const SESSION = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());

const lastSnap = new Map<string, number>();
const compacted = new Set<string>();

/** True when a new snapshot is due for a note last snapshotted at `last` (ms, or undefined). */
export const snapshotDue = (last: number | undefined, now: number) => last === undefined || now - last >= SNAPSHOT_EVERY_MS;

/** Call before changing a note's content or title. */
export async function beforeEdit(noteId: string, force = false) {
  const now = Date.now();
  if (!force && !snapshotDue(lastSnap.get(noteId), now)) return;
  lastSnap.set(noteId, now);
  const n = await db.notes.get(noteId);
  if (!n || (!n.title && !n.content_text.trim() && !JSON.stringify(n.content ?? '').includes('"drawing"'))) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { lastSnap.delete(noteId); return; }
  try {
    const { error } = await supabase.from('note_versions').insert({
      note_id: n.id, user_id: n.user_id, title: n.title, content: n.content, content_text: n.content_text, session_id: SESSION,
    });
    if (error) throw error;
    if (!compacted.has(noteId)) {
      compacted.add(noteId);
      await supabase.rpc('compact_note_versions', { p_note: noteId, p_session: SESSION });
    }
  } catch {
    lastSnap.delete(noteId); // try again on the next edit
  }
}
