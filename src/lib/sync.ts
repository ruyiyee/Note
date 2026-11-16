// Sync engine: local IndexedDB <-> Supabase Postgres.
//
// Model
// - Every local write marks the row _dirty=1 and bumps _rev (see store.ts).
// - push(): uploads dirty rows (upsert), then clears _dirty if the row was not
//   edited again meanwhile, and adopts the server's updated_at.
// - pull(): fetches rows with server updated_at > per-table cursor. A local row
//   that is still dirty is kept (local wins; it will be pushed next).
// - Conflict policy: last write wins per row. Overwritten note content is still
//   recoverable from note_versions (server trigger snapshots old content).
// - Triggers: local edits (debounced), app start, window focus, coming back
//   online, a 60s interval, and Supabase Realtime change events.
import { db, getMeta, setMeta } from './db';
import { SYNCED_TABLES, type SyncedTable } from './types';

/** The subset of the Supabase API the sync engine needs (injectable for tests). */
export interface Remote {
  upsert(table: SyncedTable, rows: any[]): Promise<any[]>;
  pullSince(table: SyncedTable, since: string | null, limit: number): Promise<any[]>;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';
interface Status { state: SyncState; pending: number; lastSyncedAt: string | null; error: string | null }

let status: Status = { state: 'idle', pending: 0, lastSyncedAt: null, error: null };
const listeners = new Set<(s: Status) => void>();
export function getStatus() { return status; }
export function onStatus(fn: (s: Status) => void) { listeners.add(fn); fn(status); return () => { listeners.delete(fn); }; }
function setStatus(patch: Partial<Status>) { status = { ...status, ...patch }; listeners.forEach((l) => l(status)); }

export function stripLocal<T extends Record<string, any>>(row: T) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(row)) if (!k.startsWith('_')) out[k] = row[k];
  return out;
}

export async function countPending() {
  let n = 0;
  for (const t of SYNCED_TABLES) n += await db.table_(t).where('_dirty').equals(1).count();
  return n;
}

// push/pull handle each table independently: a failure in one table (for example
// a migration that has not been run yet) must not block the others.
export async function push(remote: Remote) {
  let firstErr: unknown;
  for (const t of SYNCED_TABLES) {
   try {
    const table = db.table_(t);
    let dirty = await table.where('_dirty').equals(1).toArray();
    if (!dirty.length) continue;
    if (t === 'folders') dirty = sortParentsFirst(dirty);
    for (let i = 0; i < dirty.length; i += 200) {
      const batch = dirty.slice(i, i + 200);
      const saved = await remote.upsert(t, batch.map(stripLocal));
      const byId = new Map(saved.map((r) => [r.id, r]));
      await db.transaction('rw', table, async () => {
        for (const local of batch) {
          const cur = await table.get(local.id);
          const srv = byId.get(local.id);
          if (!cur || !srv) continue;
          if ((cur._rev ?? 0) === (local._rev ?? 0)) {
            await table.put({ ...srv, _dirty: 0, _rev: cur._rev });
          }
        }
      });
    }
   } catch (e) { firstErr ??= e; }
  }
  if (firstErr) throw firstErr;
}

export async function pull(remote: Remote) {
  let firstErr: unknown;
  for (const t of SYNCED_TABLES) {
   try {
    const table = db.table_(t);
    const key = `cursor:${t}`;
    let cursor = (await getMeta<string>(key)) ?? null;
    for (;;) {
      const rows = await remote.pullSince(t, cursor, 1000);
      if (!rows.length) break;
      await db.transaction('rw', table, async () => {
        for (const r of rows) {
          const cur = await table.get(r.id);
          if (cur && cur._dirty === 1) continue; // local edits win, will be pushed
          await table.put({ ...r, _dirty: 0, _rev: cur?._rev ?? 0 });
        }
      });
      cursor = rows[rows.length - 1].updated_at;
      await setMeta(key, cursor);
      if (rows.length < 1000) break;
    }
   } catch (e) { firstErr ??= e; }
  }
  if (firstErr) throw firstErr;
}

let running: Promise<void> | null = null;
let again = false;

/** Push then pull. Coalesces concurrent calls. */
export function syncNow(remote: Remote): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus({ state: 'offline', pending: await countPending() });
        break;
      }
      setStatus({ state: 'syncing' });
      try {
        let err: unknown;
        try { await push(remote); } catch (e) { err = e; }
        try { await pull(remote); } catch (e) { err ??= e; }
        if (err) throw err;
        setStatus({ state: 'idle', error: null, lastSyncedAt: new Date().toISOString(), pending: await countPending() });
      } catch (e: any) {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setStatus({ state: offline ? 'offline' : 'error', error: String(e?.message ?? e), pending: await countPending() });
      }
    } while (again);
  })().finally(() => { running = null; });
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let remoteRef: Remote | null = null;
export function setRemote(r: Remote | null) { remoteRef = r; }

/** Called after every local write. */
export function scheduleSync(delay = 800) {
  countPending().then((pending) => setStatus({ pending }));
  clearTimeout(timer);
  timer = setTimeout(() => { if (remoteRef) syncNow(remoteRef); }, delay);
}

function sortParentsFirst<T extends { id: string; parent_id: string | null }>(rows: T[]): T[] {
  const ids = new Set(rows.map((r) => r.id));
  const out: T[] = []; const done = new Set<string>();
  const visit = (r: T, depth = 0) => {
    if (done.has(r.id) || depth > 50) return;
    if (r.parent_id && ids.has(r.parent_id)) { const p = rows.find((x) => x.id === r.parent_id); if (p) visit(p, depth + 1); }
    done.add(r.id); out.push(r);
  };
  rows.forEach((r) => visit(r));
  return out;
}
