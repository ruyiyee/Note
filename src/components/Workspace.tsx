import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { setRemote, scheduleSync, syncNow } from '../lib/sync';
import { subscribeRealtime, supabaseRemote } from '../lib/remote';
import { createNote } from '../lib/store';
import { htmlToDoc } from '../lib/extensions';
import type { Template } from '../lib/templates';
import Sidebar from './Sidebar';
import NoteList from './NoteList';
import Editor from './Editor';
import VocabView from './VocabView';
import TasksView from './TasksView';
import CalendarView from './CalendarView';
import GraphView from './GraphView';
import Settings from './Settings';
import TemplatePicker from './TemplatePicker';

export type View =
  | { kind: 'inbox' | 'all' | 'recent' | 'favorites' | 'archive' | 'trash' | 'tasks' | 'vocab' | 'calendar' | 'graph' }
  | { kind: 'folder'; id: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'day'; date: string };

export type Sort = 'updated' | 'created' | 'title';
type Pane = 'sidebar' | 'list' | 'editor';

export default function Workspace({ session }: { session: Session }) {
  const [view, setView] = useState<View>({ kind: 'all' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('updated');
  const [pane, setPane] = useState<Pane>('list');
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);

  const notes = useLiveQuery(() => db.notes.toArray(), [], []);
  const folders = useLiveQuery(() => db.folders.toArray(), [], []);
  const liveFolders = useMemo(() => folders.filter((f) => !f.deleted_at), [folders]);

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

  const openNote = useCallback((id: string) => { setSelectedId(id); setPane('editor'); }, []);

  const newNote = useCallback(async (tpl?: Template) => {
    const init: any = {};
    if (view.kind === 'folder') init.folder_id = view.id;
    if (view.kind === 'tag') init.tags = [view.tag];
    if (view.kind === 'inbox') init.inbox = true;
    if (tpl) { init.title = tpl.title; init.content = htmlToDoc(tpl.html); }
    const n = await createNote(init);
    if (!['folder', 'tag', 'inbox', 'all', 'recent'].includes(view.kind)) setView({ kind: 'all' });
    openNote(n.id);
    setTimeout(() => (document.querySelector('.note-title') as HTMLTextAreaElement | null)?.focus(), 50);
  }, [view, openNote]);

  const quickCapture = useCallback(async () => {
    const n = await createNote({ inbox: true });
    setView({ kind: 'inbox' }); openNote(n.id);
    setTimeout(() => (document.querySelector('.ProseMirror') as HTMLElement | null)?.focus(), 50);
  }, [openNote]);

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) { if (e.key === 'Escape') setPane((p) => (p === 'editor' ? 'list' : p)); return; }
      const k = e.key.toLowerCase();
      if (k === 'k' || (k === 'f' && e.shiftKey)) { e.preventDefault(); setPane('list'); setTimeout(() => (document.querySelector('.search input') as HTMLInputElement)?.focus(), 10); }
      else if (k === 'n' && e.altKey) { e.preventDefault(); newNote(); }
      else if (k === 'i' && e.shiftKey) { e.preventDefault(); quickCapture(); }
      else if (k === '\\') { e.preventDefault(); setSidebarHidden((h) => !h); }
      else if (k === 's') { e.preventDefault(); syncNow(supabaseRemote); }
      else if (k === ',') { e.preventDefault(); setShowSettings(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newNote, quickCapture]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;
  const fullWidth = ['vocab', 'tasks', 'calendar', 'graph'].includes(view.kind);

  const chooseView = (v: View) => { setView(v); setPane('list'); if (v.kind !== 'trash') setQuery(''); };

  return (
    <div className={`workspace pane-${pane} ${sidebarHidden ? 'no-sidebar' : ''} ${fullWidth ? 'full' : ''}`}>
      <Sidebar
        view={view} onView={chooseView} notes={notes} folders={liveFolders}
        onNewNote={() => setShowTemplates(true)} onQuickCapture={quickCapture} onSettings={() => setShowSettings(true)}
        email={session.user.email ?? ''}
      />
      {view.kind === 'vocab' ? <VocabView onBack={() => setPane('sidebar')} /> :
       view.kind === 'tasks' ? <TasksView notes={notes} onOpen={(id) => { setView({ kind: 'all' }); openNote(id); }} onBack={() => setPane('sidebar')} /> :
       view.kind === 'calendar' ? <CalendarView notes={notes} onPick={(date) => setView({ kind: 'day', date })} onBack={() => setPane('sidebar')} /> :
       view.kind === 'graph' ? <GraphView notes={notes} onOpen={(id) => { setView({ kind: 'all' }); openNote(id); }} onBack={() => setPane('sidebar')} /> : (
        <>
          <NoteList
            view={view} notes={notes} folders={liveFolders} query={query} onQuery={setQuery} sort={sort} onSort={setSort}
            selectedId={selectedId} onOpen={openNote} onNew={() => newNote()} onBack={() => setPane('sidebar')}
          />
          {selected ? (
            <Editor key={selected.id} note={selected} notes={notes} folders={liveFolders} onBack={() => setPane('list')} onOpen={openNote} searchTerms={query} />
          ) : (
            <main className="editor empty-editor">
              <div className="muted center">
                <p>Select a note or create one.</p>
                <p className="kbd-hints"><kbd>Ctrl/⌘ Alt N</kbd> new note · <kbd>Ctrl/⌘ K</kbd> search · <kbd>Ctrl/⌘ Shift I</kbd> quick capture</p>
              </div>
            </main>
          )}
        </>
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} session={session} />}
      {showTemplates && <TemplatePicker onClose={() => setShowTemplates(false)} onPick={(t) => { setShowTemplates(false); newNote(t); }} />}
    </div>
  );
}
