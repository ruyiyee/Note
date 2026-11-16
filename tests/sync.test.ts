import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearLocal } from '../src/lib/db';
import { push, pull, syncNow, type Remote } from '../src/lib/sync';
import { createNote, setCurrentUser, updateNote } from '../src/lib/store';
import type { SyncedTable } from '../src/lib/types';

/** In-memory fake of the server: assigns increasing updated_at like the DB trigger. */
function fakeServer() {
  const tables: Record<string, Map<string, any>> = { folders: new Map(), notes: new Map(), attachments: new Map(), cards: new Map() };
  let clock = Date.parse('2030-01-01T00:00:00Z');
  const remote: Remote = {
    async upsert(t: SyncedTable, rows) {
      return rows.map((r) => { const row = { ...tables[t].get(r.id), ...r, updated_at: new Date(++clock).toISOString() }; tables[t].set(r.id, row); return row; });
    },
    async pullSince(t: SyncedTable, since, limit) {
      return [...tables[t].values()].filter((r) => !since || r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, limit);
    },
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
    const failing: Remote = { async upsert() { throw new Error('network'); }, async pullSince() { throw new Error('network'); } };
    const n = await createNote({ title: 'queued' });
    await syncNow(failing);
    expect((await db.notes.get(n.id))!._dirty).toBe(1);
    const s = fakeServer();
    await syncNow(s.remote);
    expect(s.tables.notes.get(n.id).title).toBe('queued');
  });
});
