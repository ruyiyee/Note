import { useMemo } from 'react';
import type { Folder, Note } from '../lib/types';
import type { Sort, View } from './Workspace';
import { parseQuery, scoreText, snippet } from '../lib/text';
import { restoreNote } from '../lib/store';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';

interface Props {
  view: View; notes: Note[]; folders: Folder[]; query: string; onQuery: (q: string) => void; sort: Sort; onSort: (s: Sort) => void;
  selectedId: string | null; onOpen: (id: string) => void; onNew: () => void; onBack: () => void;
}

export function viewTitle(view: View, folders: Folder[]) {
  switch (view.kind) {
    case 'folder': return folders.find((f) => f.id === view.id)?.name ?? 'Folder';
    case 'tag': return `#${view.tag}`;
    case 'day': return new Date(view.date + 'T00:00').toLocaleDateString(undefined, { dateStyle: 'full' });
    default: return ({ inbox: 'Inbox', all: 'All notes', recent: 'Recent', favorites: 'Favourites', archive: 'Archive', trash: 'Trash' } as any)[view.kind] ?? '';
  }
}

function descendants(folders: Folder[], id: string): Set<string> {
  const out = new Set([id]); let grew = true;
  while (grew) { grew = false; for (const f of folders) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) { out.add(f.id); grew = true; } }
  return out;
}

export default function NoteList({ view, notes, folders, query, onQuery, sort, onSort, selectedId, onOpen, onNew, onBack }: Props) {
  const pq = useMemo(() => parseQuery(query), [query]);
  const searching = query.trim().length > 0;

  const list = useMemo(() => {
    let xs = notes;
    if (view.kind === 'trash') xs = xs.filter((n) => n.deleted_at);
    else {
      xs = xs.filter((n) => !n.deleted_at);
      if (view.kind === 'archive') xs = xs.filter((n) => n.archived);
      else if (!searching || !pq.is.includes('archived')) xs = xs.filter((n) => !n.archived);
    }
    if (!searching) {
      if (view.kind === 'inbox') xs = xs.filter((n) => n.inbox);
      if (view.kind === 'favorites') xs = xs.filter((n) => n.favorite);
      if (view.kind === 'folder') { const ids = descendants(folders, view.id); xs = xs.filter((n) => n.folder_id && ids.has(n.folder_id)); }
      if (view.kind === 'tag') xs = xs.filter((n) => n.tags.includes(view.tag));
      if (view.kind === 'day') xs = xs.filter((n) => n.created_at.slice(0, 10) === view.date || n.updated_at.slice(0, 10) === view.date);
    }
    // search filters (global across all notes)
    if (pq.tags.length) xs = xs.filter((n) => pq.tags.every((t) => n.tags.some((nt) => nt.toLowerCase().includes(t))));
    if (pq.folder) { const fs = folders.filter((f) => f.name.toLowerCase().includes(pq.folder!)); const ids = new Set(fs.flatMap((f) => [...descendants(folders, f.id)])); xs = xs.filter((n) => n.folder_id && ids.has(n.folder_id)); }
    if (pq.is.includes('pinned')) xs = xs.filter((n) => n.pinned);
    if (pq.is.includes('favorite') || pq.is.includes('favourite')) xs = xs.filter((n) => n.favorite);
    if (pq.is.includes('task')) xs = xs.filter((n) => n.content_text && JSON.stringify(n.content).includes('"taskItem"'));
    let scored = xs.map((n) => ({ n, s: scoreText(n.title, n.content_text, pq.terms) })).filter((x) => x.s > 0);
    const cmp = (a: Note, b: Note) => sort === 'title' ? (a.title || 'Untitled').localeCompare(b.title || 'Untitled') : sort === 'created' ? b.created_at.localeCompare(a.created_at) : b.updated_at.localeCompare(a.updated_at);
    scored.sort((a, b) => (pq.terms.length && b.s !== a.s ? b.s - a.s : 0) || (view.kind !== 'trash' && +b.n.pinned - +a.n.pinned) || cmp(a.n, b.n));
    if (view.kind === 'recent' && !searching) scored = scored.slice(0, 30);
    return scored.map((x) => x.n);
  }, [notes, folders, view, pq, sort, searching]);

  const folderName = (id: string | null) => (id ? folders.find((f) => f.id === id)?.name : null);

  async function emptyTrash() {
    if (!confirm('Permanently delete everything in Trash? This cannot be undone.')) return;
    const ids = notes.filter((n) => n.deleted_at).map((n) => n.id);
    const { error } = await supabase.from('notes').delete().in('id', ids);
    if (error) return alert('Could not empty trash: ' + error.message);
    await db.notes.bulkDelete(ids);
  }

  return (
    <section className="list">
      <header className="list-head">
        <button className="icon-btn mobile-only" onClick={onBack} aria-label="Menu">☰</button>
        <h2 className="grow">{searching ? 'Search' : viewTitle(view, folders)}</h2>
        {view.kind === 'trash' ? (notes.some((n) => n.deleted_at) && <button className="ghost small danger" onClick={emptyTrash}>Empty</button>)
          : <button className="icon-btn" onClick={onNew} title="New note (Ctrl/⌘ Alt N)">＋</button>}
      </header>
      <div className="search">
        <input type="search" placeholder="Search…  (tag:x folder:y is:pinned)" value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Search notes" />
      </div>
      <div className="list-tools">
        <span className="muted small">{list.length} note{list.length === 1 ? '' : 's'}</span>
        <select value={sort} onChange={(e) => onSort(e.target.value as Sort)} aria-label="Sort">
          <option value="updated">Last edited</option><option value="created">Created</option><option value="title">Title</option>
        </select>
      </div>
      {view.kind === 'trash' && <p className="muted small pad">Deleted notes stay here until you delete them permanently.</p>}
      <ul className="notes">
        {list.map((n) => (
          <li key={n.id} className={n.id === selectedId ? 'active' : ''} draggable onDragStart={(e) => e.dataTransfer.setData('text/note-id', n.id)}>
            <button className="note-item" onClick={() => onOpen(n.id)}>
              <div className="note-item-title">
                {n.pinned && <span className="pin" title="Pinned">📌</span>}
                {n.favorite && <span className="fav" title="Favourite">★</span>}
                <span>{n.title || 'Untitled'}</span>
              </div>
              <div className="note-item-snippet">
                {snippet(n.content_text, pq.terms, 120).map(([t, hit], i) => hit ? <mark key={i}>{t}</mark> : <span key={i}>{t}</span>)}
              </div>
              <div className="note-item-meta">
                <span>{new Date(sort === 'created' ? n.created_at : n.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                {folderName(n.folder_id) && <span>· {folderName(n.folder_id)}</span>}
                {n.tags.slice(0, 3).map((t) => <span key={t} className="tag">#{t}</span>)}
                {n._dirty === 1 && <span className="unsynced" title="Not yet synced">•</span>}
              </div>
            </button>
            {view.kind === 'trash' && <button className="ghost small restore" onClick={() => restoreNote(n.id)}>Restore</button>}
          </li>
        ))}
        {!list.length && <li className="muted pad">{searching ? 'No matches.' : 'No notes here yet.'}</li>}
      </ul>
    </section>
  );
}
