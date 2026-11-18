// Emptying Trash: permanent deletion of notes, their files and file records.
import { db } from './db';
import { supabase } from './supabase';
import { deleteFiles } from './attachments';

const ok = ({ error }: { error: { message: string } | null }) => { if (error) throw new Error(error.message); };

export async function purgeNotes(ids: string[]) {
  if (!ids.length) return;
  if (!navigator.onLine) throw new Error('You are offline. Emptying Trash needs a connection.');
  const gone = new Set(ids);
  const files = await db.attachments.where('note_id').anyOf(ids).toArray();
  // A duplicated note shows the same images as the original: keep files another note still uses.
  const inUse = (await db.notes.toArray()).filter((n) => !gone.has(n.id)).map((n) => JSON.stringify(n.content ?? '')).join('\n');
  await deleteFiles(files.map((f) => f.path).filter((p) => !inUse.includes(p)));
  for (let i = 0; i < ids.length; i += 100) { // keep each request URL short
    const batch = ids.slice(i, i + 100);
    ok(await supabase.from('attachments').delete().in('note_id', batch));
    ok(await supabase.from('notes').delete().in('id', batch));
  }
  await db.transaction('rw', db.notes, db.attachments, async () => {
    await db.notes.bulkDelete(ids);
    await db.attachments.bulkDelete(files.map((f) => f.id));
  });
}
