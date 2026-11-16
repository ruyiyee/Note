// All local mutations go through here: write to IndexedDB, mark dirty, schedule sync.
import { db } from './db';
import { scheduleSync } from './sync';
import { docToText } from './text';
import type { Card, Folder, Note, SyncedTable } from './types';

let currentUser = '';
export function setCurrentUser(id: string) { currentUser = id; }
export function getCurrentUser() { return currentUser; }

const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

async function write<T extends { id: string }>(table: SyncedTable, id: string, patch: Partial<T>) {
  const t = db.table_(table);
  await db.transaction('rw', t, async () => {
    const cur = await t.get(id);
    if (!cur) return;
    await t.put({ ...cur, ...patch, updated_at: now(), _dirty: 1, _rev: (cur._rev ?? 0) + 1 });
  });
  scheduleSync();
}

async function insert<T extends { id: string }>(table: SyncedTable, row: T) {
  await db.table_(table).put({ ...row, _dirty: 1, _rev: 1 });
  scheduleSync(200);
  return row;
}

// ---------- notes ----------
export function createNote(init: Partial<Note> = {}): Promise<Note> {
  const t = now();
  const content = init.content ?? { type: 'doc', content: [{ type: 'paragraph' }] };
  return insert<Note>('notes', {
    id: uuid(), user_id: currentUser, folder_id: null, title: '', content, content_text: docToText(content),
    tags: [], pinned: false, favorite: false, archived: false, inbox: false,
    created_at: t, updated_at: t, deleted_at: null, ...init,
  });
}
export const updateNote = (id: string, patch: Partial<Note>) => write<Note>('notes', id, patch);
export const saveNoteContent = (id: string, content: unknown) => write<Note>('notes', id, { content, content_text: docToText(content) });
export const trashNote = (id: string) => write<Note>('notes', id, { deleted_at: now(), pinned: false });
export const restoreNote = (id: string) => write<Note>('notes', id, { deleted_at: null });
export async function duplicateNote(id: string) {
  const n = await db.notes.get(id); if (!n) return;
  const { _dirty, _rev, ...rest } = n;
  return createNote({ ...rest, id: uuid(), title: `${n.title || 'Untitled'} (copy)`, pinned: false, created_at: now(), updated_at: now() });
}

// ---------- folders ----------
export function createFolder(name: string, parent_id: string | null = null): Promise<Folder> {
  const t = now();
  return insert<Folder>('folders', { id: uuid(), user_id: currentUser, parent_id, name, color: null, icon: null, position: Date.now(), created_at: t, updated_at: t, deleted_at: null });
}
export const updateFolder = (id: string, patch: Partial<Folder>) => write<Folder>('folders', id, patch);
export async function trashFolder(id: string) {
  // Notes inside move to "no folder" rather than being deleted; subfolders move up.
  const f = await db.folders.get(id);
  const notes = await db.notes.where('folder_id').equals(id).toArray();
  for (const n of notes) await updateNote(n.id, { folder_id: null });
  const kids = await db.folders.where('parent_id').equals(id).toArray();
  for (const k of kids) await updateFolder(k.id, { parent_id: f?.parent_id ?? null });
  await write<Folder>('folders', id, { deleted_at: now() });
}

// ---------- cards ----------
export function createCard(init: Partial<Card>): Promise<Card> {
  const t = now();
  return insert<Card>('cards', {
    id: uuid(), user_id: currentUser, kind: 'vocab', deck: 'Vocabulary', front: '', back: '', example: '', pronunciation: '',
    source_note_id: null, ease: 2.5, interval_days: 0, reps: 0, lapses: 0, due_at: t, last_reviewed_at: null,
    created_at: t, updated_at: t, deleted_at: null, ...init,
  });
}
export const updateCard = (id: string, patch: Partial<Card>) => write<Card>('cards', id, patch);
export const trashCard = (id: string) => write<Card>('cards', id, { deleted_at: now() });

export { write as writeRow, insert as insertRow };
