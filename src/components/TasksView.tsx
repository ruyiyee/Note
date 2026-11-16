import { useMemo, useState } from 'react';
import type { Note } from '../lib/types';
import { extractTasks, toggleTask } from '../lib/text';
import { saveNoteContent } from '../lib/store';

// Tasks are checklist items inside notes. "@2026-12-01" or "due: 2026-12-01" sets a deadline.
export default function TasksView({ notes, onOpen, onBack }: { notes: Note[]; onOpen: (id: string) => void; onBack: () => void }) {
  const [showDone, setShowDone] = useState(false);
  const tasks = useMemo(() => notes.filter((n) => !n.deleted_at && !n.archived)
    .flatMap((n) => extractTasks(n.content).map((t) => ({ ...t, note: n }))), [notes]);
  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter((t) => showDone || !t.checked)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.note.title.localeCompare(b.note.title));
  const groups: [string, typeof open][] = [
    ['Overdue', open.filter((t) => t.due && t.due < today && !t.checked)],
    ['Today', open.filter((t) => t.due === today)],
    ['Upcoming', open.filter((t) => t.due && t.due > today)],
    ['No deadline', open.filter((t) => !t.due)],
    ['Done', showDone ? open.filter((t) => t.checked && t.due && t.due < today) : []],
  ];
  return (
    <section className="fullpane">
      <header className="list-head">
        <button className="icon-btn mobile-only" onClick={onBack} aria-label="Menu">☰</button>
        <h2 className="grow">Tasks</h2>
        <label className="small"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done</label>
      </header>
      <div className="fullpane-body">
        <p className="muted small">Every checklist item in your notes appears here. Add a deadline by writing <code>@2026-12-01</code> in the item.</p>
        {groups.map(([name, xs]) => xs.length > 0 && (
          <div key={name} className="task-group">
            <h4 className={name === 'Overdue' ? 'error' : ''}>{name}</h4>
            {xs.map((t) => (
              <div key={`${t.note.id}-${t.index}`} className={`task ${t.checked ? 'done' : ''}`}>
                <input type="checkbox" checked={t.checked} onChange={() => saveNoteContent(t.note.id, toggleTask(t.note.content, t.index))} />
                <span className="grow">{t.text || '(empty task)'}</span>
                {t.due && <span className="due small">{new Date(t.due + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                <button className="link small" onClick={() => onOpen(t.note.id)}>{t.note.title || 'Untitled'}</button>
              </div>
            ))}
          </div>
        ))}
        {!open.length && <p className="muted pad">No tasks. Add a checklist (☑) to any note.</p>}
      </div>
    </section>
  );
}
