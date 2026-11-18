// Files are stored in the private Supabase Storage bucket under "<user_id>/...".
// Access is via short-lived signed URLs; storage policies restrict to the owner.
import { BUCKET, supabase } from './supabase';
import { getCurrentUser, insertRow, uuid, writeRow } from './store';
import type { Attachment } from './types';
import { shrinkImage } from './image';

const MAX = 50 * 1024 * 1024;

export async function uploadFile(original: File, noteId: string | null): Promise<Attachment> {
  if (!navigator.onLine) throw new Error('You are offline. Attachments need a connection to upload.');
  const file = await shrinkImage(original);
  if (file.size > MAX) throw new Error('Files must be under 50 MB.');
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-100);
  const path = `${getCurrentUser()}/${uuid()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  const t = new Date().toISOString();
  return insertRow<Attachment>('attachments', {
    id: uuid(), user_id: getCurrentUser(), note_id: noteId, path, name: file.name, mime: file.type || 'application/octet-stream',
    size: file.size, created_at: t, updated_at: t, deleted_at: null,
  });
}

const cache = new Map<string, { url: string; exp: number }>();
export async function signedUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw error ?? new Error('Could not open file');
  cache.set(path, { url: data.signedUrl, exp: Date.now() + 3500_000 });
  return data.signedUrl;
}

/** Delete stored files by path (in batches; storage accepts many paths per call). */
export async function deleteFiles(paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}

/** Remove a file from a note: frees its storage, then marks the row deleted so other devices drop it. */
export async function removeAttachment(a: Attachment) {
  if (!navigator.onLine) throw new Error('You are offline. Removing a file needs a connection.');
  await deleteFiles([a.path]);
  await writeRow<Attachment>('attachments', a.id, { deleted_at: new Date().toISOString() });
}

/** Remove every file of the current user (used by account deletion). */
export async function deleteAllFiles() {
  const prefix = getCurrentUser();
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
    if (error) throw error;
    if (!data?.length) break;
    await deleteFiles(data.map((f) => `${prefix}/${f.name}`));
    if (data.length < 1000) break;
  }
}
