import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearLocal } from '../src/lib/db';
import { push, pull, syncNow, type Remote } from '../src/lib/sync';
import { createFolder, createItem, createNote, setCurrentUser, trashFolder, updateNote } from '../src/lib/store';
import type { SyncedTable } from '../src/lib/types';

/** In-memory fake of the server: assigns increasing updated_at like the DB trigger. */
function fakeServer() {
  const tables: Record<string, Map<string, any>> = { folders: new Map(), notes: new Map(), attachments: new Map(), cards: new Map(), items: new Map() };
  let clock = Date.parse('2030-01-01T00:00:00Z');
  const remote: Remote = {
    async upsert(t: SyncedTable, rows) {
      return rows.map((r) => { const row = { ...tables[t].get(r.id), ...r, updated_at: new Date(++clock).toISOString() }; tables[t].set(r.id, row); return row; });
    },
    async pullSince(t: SyncedTable, since, limit) {
      return [...tables[t].values()].filter((r) => !since || r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, limit);
    },
    async existingIds(t: SyncedTable, ids) { return ids.filter((id) => tables[t].has(id)); },
  };
  return { tables, remote, edit(t: string, id: string, patch: any) { tables[t].set(id, { ...tables[t].get(id), ...patch, updated_at: new Date(++clock).toISOString() }); } };
}

beforeEach(async () => { await clearLocal(); setCurrentUser('u1'); });

describe('sync engine', () => {
  it('pushes local notes and clears the dirty flag', async () => {
    const s = fakeServer();
    const n = await createNote({ title: 'Hello' });
    expect((await db.notes.get(n.id))!._dirty).toBe(1);
    await push(s.remote);
    expect(s.tables.notes.get(n.id).title).toBe('Hello');
    expect(s.tables.notes.get(n.id)._dirty).toBeUndefined();
    expect((await db.notes.get(n.id))!._dirty).toBe(0);
  });

  it('pulls remote changes from another device', async () => {
    const s = fakeServer();
    const n = await createNote({ title: 'A' });
    await syncNow(s.remote);
    s.edit('notes', n.id, { title: 'Edited elsewhere' });
    await pull(s.remote);
    expect((await db.notes.get(n.id))!.title).toBe('Edited elsewhere');
  });

  it('keeps unsynced local edits over incoming remote rows', async () => {
    const s = fakeServer();
    const n = await createNote({ title: 'A' });
    await syncNow(s.remote);
    s.edit('notes', n.id, { title: 'Remote' });
    await updateNote(n.id, { title: 'Local' });
    await pull(s.remote);
    expect((await db.notes.get(n.id))!.title).toBe('Local');
    await push(s.remote);
    expect(s.tables.notes.get(n.id).title).toBe('Local');
  });

  it('a second device starting empty receives everything', async () => {
    const s = fakeServer();
    await createNote({ title: 'One' }); await createNote({ title: 'Two' });
    await syncNow(s.remote);
    await clearLocal(); // simulate a fresh device
    await pull(s.remote);
    expect((await db.notes.toArray()).map((n) => n.title).sort()).toEqual(['One', 'Two']);
  });

  it('does not clear dirty if the row was edited during upload', async () => {
    const s = fakeServer();
    const n = await createNote({ title: 'v1' });
    const slow: Remote = { ...s.remote, async upsert(t, rows) { await updateNote(n.id, { title: 'v2' }); return s.remote.upsert(t, rows); } };
    await push(slow);
    const local = (await db.notes.get(n.id))!;
    expect(local.title).toBe('v2');
    expect(local._dirty).toBe(1);
  });

  it('reports offline and keeps changes queued when the server fails', async () => {
    const failing: Remote = { async upsert() { throw new Error('network'); }, async pullSince() { throw new Error('network'); }, async existingIds() { throw new Error('network'); } };
    const n = await createNote({ title: 'queued' });
    await syncNow(failing);
    expect((await db.notes.get(n.id))!._dirty).toBe(1);
    const s = fakeServer();
    await syncNow(s.remote);
    expect(s.tables.notes.get(n.id).title).toBe('queued');
  });

  it('keeps syncing notes when another table fails (e.g. migration not run yet)', async () => {
    const s = fakeServer();
    const partial: Remote = {
      upsert: (t, rows) => (t === 'items' ? Promise.reject(new Error('relation "items" does not exist')) : s.remote.upsert(t, rows)),
      pullSince: (t, since, limit) => (t === 'items' ? Promise.reject(new Error('relation "items" does not exist')) : s.remote.pullSince(t, since, limit)),
      existingIds: s.remote.existingIds,
    };
    const n = await createNote({ title: 'still syncs' });
    const task = await createItem({ kind: 'task', title: 'waits' });
    await syncNow(partial);
    expect(s.tables.notes.get(n.id).title).toBe('still syncs');
    expect((await db.notes.get(n.id))!._dirty).toBe(0);
    expect((await db.items.get(task.id))!._dirty).toBe(1);
    await syncNow(s.remote);
    expect(s.tables.items.get(task.id).title).toBe('waits');
  });

  it('deleting a folder removes its notebooks but keeps the notes', async () => {
    const folder = await createFolder('Uni');
    const nb = await createFolder('Biology', folder.id);
    const n = await createNote({ title: 'Cells', folder_id: nb.id });
    await trashFolder(folder.id);
    expect((await db.folders.get(nb.id))!.deleted_at).toBeTruthy();
    const kept = (await db.notes.get(n.id))!;
    expect(kept.deleted_at).toBeNull();
    expect(kept.folder_id).toBeNull();
  });

  it('drops notes that another device emptied from Trash', async () => {
    const s = fakeServer();
    const kept = await createNote({ title: 'kept in trash', deleted_at: '2030-01-01T00:00:00Z' });
    const purged = await createNote({ title: 'emptied elsewhere', deleted_at: '2030-01-01T00:00:00Z' });
    await syncNow(s.remote);
    s.tables.notes.delete(purged.id); // the other device emptied Trash
    await syncNow(s.remote);
    expect(await db.notes.get(purged.id)).toBeUndefined();
    expect(await db.notes.get(kept.id)).toBeTruthy();
  });

  it('picks up a change saved with a slightly earlier timestamp than the cursor', async () => {
    const s = fakeServer();
    const n = await createNote({ title: 'A' });
    await syncNow(s.remote);
    const cursor = s.tables.notes.get(n.id).updated_at;
    // another device's save that committed late, stamped 1 second before the cursor
    s.tables.notes.set('late', { ...s.tables.notes.get(n.id), id: 'late', title: 'late', updated_at: new Date(Date.parse(cursor) - 1000).toISOString() });
    await syncNow(s.remote);
    expect((await db.notes.get('late'))?.title).toBe('late');
  });
});
