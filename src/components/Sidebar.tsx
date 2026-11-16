import { useMemo, useState } from 'react';
import type { Folder, Note } from '../lib/types';
import type { View } from './Workspace';
import { createFolder, trashFolder, updateFolder, updateNote } from '../lib/store';
import SyncBadge from './SyncBadge';

const COLORS = ['', '#c0533f', '#d08a2e', '#c8a24a', '#5b8a4f', '#3f7f8c', '#4d6fb3', '#7d5ab5', '#b35a8a', '#7a746b'];
const ICONS = ['📁', '📚', '🎓', '💼', '🧪', '📝', '💡', '🗂️', '🌍', '❤️', '🏠', '⭐'];

interface Props {
  view: View; onView: (v: View) => void; notes: Note[]; folders: Folder[];
  onNewNote: () => void; onQuickCapture: () => void; onSettings: () => void; email: string;
}

export default function Sidebar({ view, onView, notes, folders, onNewNote, onQuickCapture, onSettings, email }: Props) {
  const live = notes.filter((n) => !n.deleted_at);
  const counts = {
    inbox: live.filter((n) => n.inbox && !n.archived).length,
    all: live.filter((n) => !n.archived).length,
    favorites: live.filter((n) => n.favorite && !n.archived).length,
    archive: live.filter((n) => n.archived).length,
    trash: notes.filter((n) => n.deleted_at).length,
  };
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    live.forEach((n) => n.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  const is = (k: string) => view.kind === k;
  const Item = ({ k, label, icon, count }: { k: any; label: string; icon: string; count?: number }) => (
    <button className={`nav-item ${is(k) ? 'active' : ''}`} onClick={() => onView({ kind: k })}>
      <span className="ico">{icon}</span><span className="grow">{label}</span>{count ? <span className="count">{count}</span> : null}
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button className="primary block" onClick={onNewNote} title="New note (Ctrl/⌘ Alt N)">＋ New note</button>
        <button className="ghost block" onClick={onQuickCapture} title="Quick capture to Inbox (Ctrl/⌘ Shift I)">⚡ Quick capture</button>
      </div>
      <nav className="sidebar-scroll">
        <Item k="inbox" label="Inbox" icon="📥" count={counts.inbox} />
        <Item k="all" label="All notes" icon="🗒️" count={counts.all} />
        <Item k="recent" label="Recent" icon="🕘" />
        <Item k="favorites" label="Favourites" icon="★" count={counts.favorites} />
        <Item k="tasks" label="Tasks" icon="☑" />
        <Item k="calendar" label="Calendar" icon="📅" />
        <Item k="graph" label="Connections" icon="🕸️" />
        <Item k="vocab" label="Vocabulary & review" icon="🔤" />

        <div className="section-head">
          <span>Folders</span>
          <button className="icon-btn" title="New folder" onClick={async () => { const name = prompt('Folder name'); if (name?.trim()) await createFolder(name.trim()); }}>＋</button>
        </div>
        <FolderTree folders={folders} notes={live} parent={null} depth={0} view={view} onView={onView} />

        {tags.length > 0 && <div className="section-head"><span>Tags</span></div>}
        {tags.map(([t, c]) => (
          <button key={t} className={`nav-item ${view.kind === 'tag' && view.tag === t ? 'active' : ''}`} onClick={() => onView({ kind: 'tag', tag: t })}>
            <span className="ico">#</span><span className="grow">{t}</span><span className="count">{c}</span>
          </button>
        ))}

        <div className="section-head"><span>Library</span></div>
        <Item k="archive" label="Archive" icon="🗄️" count={counts.archive} />
        <Item k="trash" label="Trash" icon="🗑️" count={counts.trash} />
      </nav>
      <div className="sidebar-foot">
        <SyncBadge />
        <button className="ghost small" onClick={onSettings} title={email}>⚙ Settings</button>
      </div>
    </aside>
  );
}

function FolderTree({ folders, notes, parent, depth, view, onView }: { folders: Folder[]; notes: Note[]; parent: string | null; depth: number; view: View; onView: (v: View) => void }) {
  const kids = folders.filter((f) => f.parent_id === parent).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  return <>{kids.map((f) => <FolderRow key={f.id} f={f} folders={folders} notes={notes} depth={depth} view={view} onView={onView} />)}</>;
}

function FolderRow({ f, folders, notes, depth, view, onView }: { f: Folder; folders: Folder[]; notes: Note[]; depth: number; view: View; onView: (v: View) => void }) {
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState(false);
  const [drop, setDrop] = useState(false);
  const hasKids = folders.some((x) => x.parent_id === f.id);
  const count = notes.filter((n) => n.folder_id === f.id && !n.archived).length;
  const active = view.kind === 'folder' && view.id === f.id;
  return (
    <>
      <div
        className={`nav-item folder ${active ? 'active' : ''} ${drop ? 'drop' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onView({ kind: 'folder', id: f.id })}
        onDragOver={(e) => { e.preventDefault(); setDrop(true); }} onDragLeave={() => setDrop(false)}
        onDrop={(e) => { e.preventDefault(); setDrop(false); const id = e.dataTransfer.getData('text/note-id'); if (id) updateNote(id, { folder_id: f.id }); }}
        role="button" tabIndex={0}
      >
        <span className="twisty" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{hasKids ? (open ? '▾' : '▸') : ''}</span>
        <span className="ico" style={{ color: f.color ?? undefined }}>{f.icon || '📁'}</span>
        <span className="grow" style={{ color: f.color ?? undefined }}>{f.name}</span>
        {count ? <span className="count">{count}</span> : null}
        <span className="icon-btn row-menu" onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}>⋯</span>
      </div>
      {menu && (
        <div className="folder-menu" style={{ marginLeft: 8 + depth * 14 }} onMouseLeave={() => setMenu(false)}>
          <button onClick={() => { const n = prompt('Rename folder', f.name); if (n?.trim()) updateFolder(f.id, { name: n.trim() }); setMenu(false); }}>Rename</button>
          <button onClick={async () => { const n = prompt('Subfolder name'); if (n?.trim()) await createFolder(n.trim(), f.id); setMenu(false); setOpen(true); }}>New subfolder</button>
          <div className="swatches">{COLORS.map((c) => <span key={c || 'none'} className="swatch" style={{ background: c || 'transparent' }} title={c || 'Default'} onClick={() => updateFolder(f.id, { color: c || null })} />)}</div>
          <div className="swatches">{ICONS.map((i) => <span key={i} className="swatch emoji" onClick={() => updateFolder(f.id, { icon: i })}>{i}</span>)}</div>
          <button className="danger" onClick={() => { if (confirm(`Delete folder “${f.name}”? Notes inside are kept and moved out of the folder.`)) trashFolder(f.id); setMenu(false); }}>Delete folder</button>
        </div>
      )}
      {open && <FolderTree folders={folders} notes={notes} parent={f.id} depth={depth + 1} view={view} onView={onView} />}
    </>
  );
}
