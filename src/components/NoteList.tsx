import { useMemo } from 'react';
import type { Folder, Note } from '../lib/types';
import type { Sort, View } from './Workspace';
import { parseTerms, scoreText, snippet } from '../lib/text';
import { createFolder, restoreNote, trashFolder, updateFolder } from '../lib/store';
import { printNotes } from '../lib/export';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { askConfirm, askText } from './Dialog';

interface Props {
  view: View; onView: (v: View) => void; notes: Note[]; folders: Folder[]; query: string; onQuery: (q: string) => void; sort: Sort; onSort: (s: Sort) => void;
  selectedId: string | null; onOpen: (id: string) => void; onNew: () => void; onBack: () => void;
}

const TITLES: Record<string, string> = { all: 'All Notes', favorites: 'Favourites', trash: 'Trash' };

export default function NoteList({ view, onView, notes, folders, query, onQuery, sort, onSort, selectedId, onOpen, onNew, onBack }: Props) {
  const terms = useMemo(() => parseTerms(query), [query]);
  const searching = terms.length > 0;
  const here = view.kind === 'folder' || view.kind === 'notebook' ? folders.find((f) => f.id === view.id) : undefined;
  const parent = here?.parent_id ? folders.find((f) => f.id === here.parent_id) : undefined;
  const notebooks = view.kind === 'folder' ? folders.filter((f) => f.parent_id === view.id).sort((a, b) => a.name.localeCompare(b.name)) : [];

  const cmp = (a: Note, b: Note) => sort === 'title' ? (a.title || 'Untitled').localeCompare(b.title || 'Untitled') : sort === 'created' ? b.created_at.localeCompare(a.created_at) : b.updated_at.localeCompare(a.updated_at);

  const list = useMemo(() => {
    let xs = view.kind === 'trash' ? notes.filter((n) => n.deleted_at) : notes.filter((n) => !n.deleted_at);
    if (!searching) {
      if (view.kind === 'favorites') xs = xs.filter((n) => n.favorite);
      if (view.kind === 'folder' || view.kind === 'notebook') xs = xs.filter((n) => n.folder_id === view.id);
    }
    return xs.map((n) => ({ n, s: scoreText(n.title, n.content_text, terms) })).filter((x) => x.s > 0)
      .sort((a, b) => (searching && b.s !== a.s ? b.s - a.s : 0) || cmp(a.n, b.n)).map((x) => x.n);
  }, [notes, view, terms, sort, searching]);

  const where = (id: string | null) => {
    const f = id ? folders.find((x) => x.id === id) : null; if (!f) return null;
    const p = f.parent_id ? folders.find((x) => x.id === f.parent_id) : null;
    return p ? `${p.name} / ${f.name}` : f.name;
  };

  async function emptyTrash() {
    if (!(await askConfirm('Permanently delete everything in Trash? This cannot be undone.', 'Delete'))) return;
    const ids = notes.filter((n) => n.deleted_at).map((n) => n.id);
    const { error } = await supabase.from('notes').delete().in('id', ids);
    if (error) return alert('Could not empty Trash: ' + error.message);
    await db.notes.bulkDelete(ids);
  }
  async function rename() { if (!here) return; const name = await askText('Rename', here.name); if (name) updateFolder(here.id, { name }); }
  async function remove() {
    if (!here) return;
    const what = view.kind === 'folder' ? 'folder and its notebooks' : 'notebook';
    if (!(await askConfirm(`Delete this ${what}? The notes inside are kept and stay in All Notes.`, 'Delete'))) return;
    await trashFolder(here.id);
    onView(parent ? { kind: 'folder', id: parent.id } : { kind: 'all' });
  }
  async function newNotebook() {
    const name = await askText('New notebook', '', 'Create');
    if (name && here) { const nb = await createFolder(name, here.id); onView({ kind: 'notebook', id: nb.id }); }
  }

  const canNew = !searching && (view.kind === 'all' || view.kind === 'favorites' || view.kind === 'notebook');

  return (
    <section className="list">
      <header className="list-head">
        <button className="text-btn mobile-only" onClick={onBack}>Menu</button>
        <div className="grow">
          {parent && !searching && <button className="crumb" onClick={() => onView({ kind: 'folder', id: parent.id })}>{parent.name}</button>}
          <h2>{searching ? 'Search' : here?.name ?? TITLES[view.kind]}</h2>
        </div>
        {canNew && <button className="primary small" onClick={onNew}>New note</button>}
        {!searching && view.kind === 'folder' && <button className="primary small" onClick={newNotebook}>New notebook</button>}
        {view.kind === 'trash' && notes.some((n) => n.deleted_at) && <button className="text-btn danger" onClick={emptyTrash}>Empty</button>}
      </header>
      {here && !searching && (
        <div className="list-actions">
          {view.kind === 'notebook' && list.length > 0 && <button className="text-btn" onClick={() => printNotes(here.name, [...list].sort((a, b) => a.created_at.localeCompare(b.created_at)))}>Export PDF</button>}
          <button className="text-btn" onClick={rename}>Rename</button>
          <button className="text-btn" onClick={remove}>Delete</button>
        </div>
      )}
      <div className="search">
        <input type="search" placeholder="Search all notes" value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Search all notes" />
      </div>
      <div className="list-scroll">
        {!searching && view.kind === 'folder' && (
          <ul className="notebooks">
            {notebooks.map((nb) => (
              <li key={nb.id}><button onClick={() => onView({ kind: 'notebook', id: nb.id })}>
                <span className="grow">{nb.name}</span>
                <span className="muted small">{notes.filter((n) => n.folder_id === nb.id && !n.deleted_at).length} notes</span>
              </button></li>
            ))}
            {!notebooks.length && <li className="muted empty">This folder has no notebooks yet. Create one to start adding notes.</li>}
          </ul>
        )}
        {(list.length > 0 || view.kind !== 'folder') && (
          <div className="list-tools">
            <span className="muted small">{list.length} {list.length === 1 ? 'note' : 'notes'}</span>
            <select value={sort} onChange={(e) => onSort(e.target.value as Sort)} aria-label="Sort notes">
              <option value="updated">Last edited</option><option value="created">Created</option><option value="title">Title</option>
            </select>
          </div>
        )}
        <ul className="notes">
          {list.map((n) => (
            <li key={n.id} className={n.id === selectedId ? 'active' : ''} draggable onDragStart={(e) => e.dataTransfer.setData('text/note-id', n.id)}>
              <button className="note-item" onClick={() => onOpen(n.id)}>
                <div className="note-item-title">{n.title || 'Untitled'}</div>
                <div className="note-item-snippet">
                  {snippet(n.content_text, terms, 120).map(([t, hit], i) => hit ? <mark key={i}>{t}</mark> : <span key={i}>{t}</span>)}
                </div>
                <div className="note-item-meta">
                  <span>{new Date(sort === 'created' ? n.created_at : n.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  {(searching || view.kind === 'all' || view.kind === 'favorites') && where(n.folder_id) && <span>{where(n.folder_id)}</span>}
                  {n._dirty === 1 && <span className="unsynced">Not synced yet</span>}
                </div>
              </button>
              {view.kind === 'trash' && <button className="text-btn restore" onClick={() => restoreNote(n.id)}>Restore</button>}
            </li>
          ))}
          {!list.length && view.kind !== 'folder' && <li className="muted empty">{searching ? 'No matches.' : view.kind === 'trash' ? 'Trash is empty.' : 'No notes here yet.'}</li>}
        </ul>
      </div>
    </section>
  );
}
