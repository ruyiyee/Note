import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { createItem, trashItem } from '../lib/store';
import type { Item } from '../lib/types';

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// A plain calendar: entries are added directly to a day and are not linked to notes.
export default function CalendarView({ onBack }: { onBack: () => void }) {
  const all = useLiveQuery(() => db.items.where('kind').equals('event').toArray(), [], []);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState(key(new Date()));
  const [title, setTitle] = useState('');
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const e of all) if (!e.deleted_at && e.date) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    for (const v of m.values()) v.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return m;
  }, [all]);
  const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7)); // Monday first
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const today = key(new Date());
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const entries = byDay.get(day) ?? [];

  return (
    <section className="fullpane">
      <header className="list-head">
        <button className="text-btn mobile-only" onClick={onBack}>Menu</button>
        <h2 className="grow">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button className="text-btn" onClick={() => shift(-1)}>Previous</button>
        <button className="text-btn" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setDay(key(d)); }}>Today</button>
        <button className="text-btn" onClick={() => shift(1)}>Next</button>
      </header>
      <div className="fullpane-body cal-layout">
        <div className="cal">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {days.map((d) => { const k = key(d); const ev = byDay.get(k) ?? []; return (
            <button key={k} className={`cal-day ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${k === today ? 'today' : ''} ${k === day ? 'selected' : ''}`} onClick={() => setDay(k)}>
              <span className="cal-num">{d.getDate()}</span>
              {ev.slice(0, 2).map((e) => <span key={e.id} className="cal-entry">{e.title}</span>)}
              {ev.length > 2 && <span className="cal-more">{ev.length - 2} more</span>}
            </button>
          ); })}
        </div>
        <div className="day-panel">
          <h3>{new Date(day + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
          <form className="add-row" onSubmit={async (e) => { e.preventDefault(); if (!title.trim()) return; await createItem({ kind: 'event', title: title.trim(), date: day }); setTitle(''); }}>
            <input className="grow" placeholder="Add to this day" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New calendar entry" />
            <button className="primary">Add</button>
          </form>
          <ul className="tasks">
            {entries.map((e) => (
              <li key={e.id} className="task"><span className="grow">{e.title}</span><button className="text-btn row-action" onClick={() => trashItem(e.id)}>Remove</button></li>
            ))}
          </ul>
          {!entries.length && <p className="muted empty">Nothing planned.</p>}
        </div>
      </div>
    </section>
  );
}
