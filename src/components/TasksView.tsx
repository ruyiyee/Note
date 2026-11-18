import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { createItem, trashItem, updateItem } from '../lib/store';
import type { Item } from '../lib/types';

const fmt = (d: string) => new Date(d + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// A simple standalone task list. Tasks are not linked to notes.
export default function TasksView({ onBack }: { onBack: () => void }) {
  const all = useLiveQuery(() => db.items.where('kind').equals('task').toArray(), [], []);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const today = new Date().toLocaleDateString('en-CA');
  const { open, done } = useMemo(() => {
    const live = all.filter((t) => !t.deleted_at);
    return {
      open: live.filter((t) => !t.done).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.created_at.localeCompare(b.created_at)),
      done: live.filter((t) => t.done).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    };
  }, [all]);

  return (
    <section className="fullpane">
      <header className="list-head">
        <button className="text-btn mobile-only" onClick={onBack}>Menu</button>
        <h2 className="grow">Tasks</h2>
      </header>
      <div className="fullpane-body narrow-body">
        <form className="add-row" onSubmit={async (e) => { e.preventDefault(); if (!title.trim()) return; await createItem({ kind: 'task', title: title.trim(), date: date || null }); setTitle(''); setDate(''); }}>
          <input className="grow" placeholder="Add a task" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New task" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date (optional)" />
          <button className="primary">Add</button>
        </form>
        <ul className="tasks">{open.map((t) => <Row key={t.id} t={t} today={today} />)}</ul>
        {!open.length && <p className="muted empty">Nothing to do.</p>}
        {done.length > 0 && <>
          <h4>Completed</h4>
          <ul className="tasks">{done.map((t) => <Row key={t.id} t={t} today={today} />)}</ul>
        </>}
      </div>
    </section>
  );
}

function Row({ t, today }: { t: Item; today: string }) {
  return (
    <li className={`task ${t.done ? 'done' : ''}`}>
      <input type="checkbox" checked={t.done} onChange={() => updateItem(t.id, { done: !t.done })} aria-label={t.done ? 'Mark as not done' : 'Mark as done'} />
      <span className="grow">{t.title}</span>
      {t.date && <span className={`due ${!t.done && t.date < today ? 'late' : ''}`}>{fmt(t.date)}</span>}
      <button className="text-btn row-action" onClick={() => trashItem(t.id)}>Remove</button>
    </li>
  );
}
