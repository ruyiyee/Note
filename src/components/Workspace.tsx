import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { setRemote, scheduleSync, syncNow } from '../lib/sync';
import { subscribeRealtime, supabaseRemote } from '../lib/remote';
import { createNote } from '../lib/store';
import Sidebar from './Sidebar';
import NoteList from './NoteList';
import Editor from './Editor';
import VocabView from './VocabView';
import TasksView from './TasksView';
import CalendarView from './CalendarView';
import Settings from './Settings';
import { DialogHost } from './Dialog';

// Folder = folders row with parent_id null. Notebook = folders row inside a folder.
export type View =
  | { kind: 'all' | 'favorites' | 'tasks' | 'calendar' | 'vocab' | 'trash' }
  | { kind: 'folder'; id: string }
  | { kind: 'notebook'; id: string };

export type Sort = 'updated' | 'created' | 'title';
type Pane = 'sidebar' | 'list' | 'editor';

export default function Workspace({ session }: { session: Session }) {
  const [view, setView] = useState<View>({ kind: 'all' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('updated');
  const [pane, setPane] = useState<Pane>('list');
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [wide, setWide] = useState(() => { try { return localStorage.getItem('wide') === '1'; } catch { return false; } });
  const toggleWide = () => setWide((w) => { try { localStorage.setItem('wide', w ? '0' : '1'); } catch { /* ignore */ } return !w; });

  const notes = useLiveQuery(() => db.notes.toArray(), [], []);
  const allFolders = useLiveQuery(() => db.folders.toArray(), [], []);
  const folders = useMemo(() => allFolders.filter((f) => !f.deleted_at), [allFolders]);

  // ---- sync wiring ----
  useEffect(() => {
    setRemote(supabaseRemote);
    syncNow(supabaseRemote);
    const kick = () => scheduleSync(300);
    const unsub = subscribeRealtime(session.user.id, kick);
    window.addEventListener('online', kick);
    window.addEventListener('focus', kick);
    const vis = () => { if (document.visibilityState === 'visible') kick(); };
    document.addEventListener('visibilitychange', vis);
    const iv = setInterval(kick, 60_000);
    return () => { unsub(); setRemote(null); window.removeEventListener('online', kick); window.removeEventListener('focus', kick); document.removeEventListener('visibilitychange', vis); clearInterval(iv); };
  }, [session.user.id]);

  // If the open folder or notebook disappears (deleted here or on another device), go back.
  useEffect(() => {
    if ((view.kind === 'folder' || view.kind === 'notebook') && allFolders.length && !folders.some((f) => f.id === view.id)) setView({ kind: 'all' });
  }, [folders, view]);

  const openNote = useCallback((id: string) => { setSelectedId(id); setPane('editor'); }, []);

  const newNote = useCallback(async () => {
    const n = await createNote(view.kind === 'notebook' ? { folder_id: view.id } : view.kind === 'favorites' ? { favorite: true } : {});
    if (!['notebook', 'all', 'favorites'].includes(view.kind)) setView({ kind: 'all' });
    setQuery('');
    openNote(n.id);
    setTimeout(() => (document.querySelector('.note-title') as HTMLTextAreaElement | null)?.focus(), 50);
  }, [view, openNote]);

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'k') { e.preventDefault(); setPane('list'); setTimeout(() => (document.querySelector('.search input') as HTMLInputElement)?.focus(), 10); }
      else if (k === 'n' && e.altKey) { e.preventDefault(); newNote(); }
      else if (k === '\\') { e.preventDefault(); setSidebarHidden((h) => !h); }
      else if (k === 'e' && e.shiftKey) { e.preventDefault(); toggleWide(); }
      else if (k === 's') { e.preventDefault(); syncNow(supabaseRemote); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newNote]);

  const found = notes.find((n) => n.id === selectedId) ?? null;
  // A deleted note is not shown in the editor (except while browsing Trash).
  const selected = found && (!found.deleted_at || view.kind === 'trash') ? found : null;
  const closeNote = useCallback(() => { setSelectedId(null); setPane('list'); }, []);
  const fullWidth = ['vocab', 'tasks', 'calendar'].includes(view.kind);
  const chooseView = (v: View) => { setView(v); setPane('list'); setQuery(''); if ((v.kind === 'trash') !== (view.kind === 'trash')) setSelectedId(null); };

  return (
    <div className={`workspace pane-${pane} ${sidebarHidden ? 'no-sidebar' : ''} ${fullWidth ? 'full' : ''} ${wide && selected && !fullWidth ? 'wide' : ''}`}>
      <Sidebar view={view} onView={chooseView} folders={folders} onSettings={() => setShowSettings(true)} />
      {view.kind === 'vocab' ? <VocabView onBack={() => setPane('sidebar')} /> :
       view.kind === 'tasks' ? <TasksView onBack={() => setPane('sidebar')} /> :
       view.kind === 'calendar' ? <CalendarView onBack={() => setPane('sidebar')} /> : (
        <>
          <NoteList
            view={view} onView={chooseView} notes={notes} folders={folders} query={query} onQuery={setQuery} sort={sort} onSort={setSort}
            selectedId={selectedId} onOpen={openNote} onNew={newNote} onBack={() => setPane('sidebar')}
          />
          {selected ? (
            <Editor key={selected.id} note={selected} folders={folders} onBack={() => setPane('list')} onClose={closeNote} onOpen={openNote} wide={wide} onToggleWide={toggleWide} />
          ) : (
            <main className="editor empty-editor">
              <div className="empty-state">
                <p className="empty-title">Open a note</p>
                <p className="muted">Choose a note from the list, or start a new one.</p>
                {view.kind !== 'trash' && view.kind !== 'folder' && <button className="primary" onClick={newNote}>New note</button>}
              </div>
            </main>
          )}
        </>
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} session={session} />}
      <DialogHost />
    </div>
  );
}
