// Local IndexedDB mirror of the user's cloud data (offline cache + outbox).
// The cloud (Supabase) is the source of truth; this is a cache that makes the
// app fast and usable offline. Rows with _dirty=1 are waiting to be uploaded.
import Dexie, { type Table } from 'dexie';
import type { Attachment, Card, Folder, Note, SyncedTable } from './types';

export class LocalDB extends Dexie {
  notes!: Table<Note, string>;
  folders!: Table<Folder, string>;
  attachments!: Table<Attachment, string>;
  cards!: Table<Card, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('notes-app');
    this.version(1).stores({
      notes: 'id, updated_at, folder_id, _dirty, deleted_at',
      folders: 'id, parent_id, _dirty',
      attachments: 'id, note_id, _dirty',
      cards: 'id, due_at, deck, _dirty',
      meta: 'key',
    });
  }

  table_(name: SyncedTable): Table<any, string> {
    return this[name];
  }
}

export const db = new LocalDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

export async function clearLocal() {
  await db.transaction('rw', [db.notes, db.folders, db.attachments, db.cards, db.meta], async () => {
    await Promise.all([db.notes.clear(), db.folders.clear(), db.attachments.clear(), db.cards.clear(), db.meta.clear()]);
  });
}
