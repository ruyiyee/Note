import type { Folder } from '../lib/types';
import type { View } from './Workspace';
import { createFolder, updateNote } from '../lib/store';
import { askText } from './Dialog';
import SyncBadge from './SyncBadge';

interface Props { view: View; onView: (v: View) => void; folders: Folder[]; onSettings: () => void }

const byName = (a: Folder, b: Folder) => a.name.localeCompare(b.name);

export default function Sidebar({ view, onView, folders, onSettings }: Props) {
  const top = folders.filter((f) => !f.parent_id).sort(byName);
  const openFolderId = view.kind === 'folder' ? view.id : view.kind === 'notebook' ? folders.find((f) => f.id === view.id)?.parent_id : null;

  const Section = ({ k, label }: { k: 'all' | 'favorites' | 'tasks' | 'calendar' | 'vocab' | 'trash'; label: string }) => (
    <button className={`nav-item ${view.kind === k ? 'active' : ''}`} onClick={() => onView({ kind: k })}>{label}</button>
  );

  return (
    <aside className="sidebar">
      <div className="brand-row">Notes</div>
      <nav className="sidebar-scroll">
        <Section k="all" label="All Notes" />
        <div className="tree">
          {top.map((f) => (
            <div key={f.id}>
              <button className={`nav-item sub ${view.kind === 'folder' && view.id === f.id ? 'active' : ''}`} onClick={() => onView({ kind: 'folder', id: f.id })}>{f.name}</button>
              {openFolderId === f.id && folders.filter((n) => n.parent_id === f.id).sort(byName).map((nb) => (
                <button key={nb.id} className={`nav-item sub2 ${view.kind === 'notebook' && view.id === nb.id ? 'active' : ''}`}
                  onClick={() => onView({ kind: 'notebook', id: nb.id })}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { const id = e.dataTransfer.getData('text/note-id'); if (id) updateNote(id, { folder_id: nb.id }); }}>
                  {nb.name}
                </button>
              ))}
            </div>
          ))}
          <button className="nav-item sub quiet" onClick={async () => { const name = await askText('New folder', '', 'Create'); if (name) { const f = await createFolder(name); onView({ kind: 'folder', id: f.id }); } }}>New folder</button>
        </div>
        <Section k="favorites" label="Favourites" />
        <Section k="tasks" label="Tasks" />
        <Section k="calendar" label="Calendar" />
        <Section k="vocab" label="Vocabulary" />
        <Section k="trash" label="Trash" />
      </nav>
      <div className="sidebar-foot">
        <SyncBadge />
        <button className="text-btn" onClick={onSettings}>Settings</button>
      </div>
    </aside>
  );
}
