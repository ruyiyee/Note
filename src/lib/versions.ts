// Version history, taken by the app:
// - While you edit a note, its previous state is saved at most once every 30 minutes.
// - Each page load is one "visit" (SESSION). When a note is first edited in a new visit,
//   earlier visits are compacted on the server to one snapshot each (their latest).
// Snapshots need a connection; offline edits are still saved, just without a snapshot.
import { db } from './db';
import { supabase } from './supabase';
import type { Note } from './types';

export const SNAPSHOT_EVERY_MS = 30 * 60 * 1000;
export const SESSION = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());

const lastSnap = new Map<string, number>();
const compacted = new Set<string>();

/** True when a new snapshot is due for a note last snapshotted at `last` (ms, or undefined). */
export const snapshotDue = (last: number | undefined, now: number) => last === undefined || now - last >= SNAPSHOT_EVERY_MS;

/**
 * Call before changing a note's content or title. Reads the current (pre-edit) note from
 * this device and uploads it in the background, so saving never waits for the network.
 */
export async function beforeEdit(noteId: string, force = false) {
  const now = Date.now();
  if (!force && !snapshotDue(lastSnap.get(noteId), now)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // try again on the next edit
  lastSnap.set(noteId, now);
  const n = await db.notes.get(noteId);
  if (!n || (!n.title && !n.content_text.trim() && !JSON.stringify(n.content ?? '').includes('"drawing"'))) return;
  void upload(n);
}

async function upload(n: Note) {
  try {
    const { error } = await supabase.from('note_versions').insert({
      note_id: n.id, user_id: n.user_id, title: n.title, content: n.content, content_text: n.content_text, session_id: SESSION,
    });
    if (error) throw error;
    if (!compacted.has(n.id)) {
      compacted.add(n.id);
      await supabase.rpc('compact_note_versions', { p_note: n.id, p_session: SESSION });
    }
  } catch {
    lastSnap.delete(n.id); // try again on the next edit
  }
}

// ---- Deleting history (frees database space; the notes themselves are untouched) ----
async function uid() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id; if (!id) throw new Error('Not signed in.');
  return id;
}
const ok = ({ error }: { error: { message: string } | null }) => { if (error) throw new Error(error.message); };
export async function deleteVersion(id: string) {
  ok(await supabase.from('note_versions').delete().eq('id', id).eq('user_id', await uid()));
}
export async function deleteNoteVersions(noteId: string) {
  ok(await supabase.from('note_versions').delete().eq('note_id', noteId).eq('user_id', await uid()));
  lastSnap.delete(noteId);
}
export async function deleteAllVersions(): Promise<number> {
  const res = await supabase.from('note_versions').delete({ count: 'exact' }).eq('user_id', await uid());
  ok(res); lastSnap.clear();
  return res.count ?? 0;
}
