import { useMemo, useState } from 'react';
import type { Note } from '../lib/types';
import { extractTasks } from '../lib/text';

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CalendarView({ notes, onPick, onBack }: { notes: Note[]; onPick: (date: string) => void; onBack: () => void }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const byDay = useMemo(() => {
    const m = new Map<string, { notes: number; due: number }>();
    const bump = (k: string, f: 'notes' | 'due') => { const v = m.get(k) ?? { notes: 0, due: 0 }; v[f]++; m.set(k, v); };
    for (const n of notes) {
      if (n.deleted_at) continue;
      const c = key(new Date(n.created_at)), u = key(new Date(n.updated_at));
      bump(c, 'notes'); if (u !== c) bump(u, 'notes');
      for (const t of extractTasks(n.content)) if (t.due && !t.checked) bump(t.due, 'due');
    }
    return m;
  }, [notes]);
  const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7)); // Monday first
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const today = key(new Date());
  return (
    <section className="fullpane">
      <header className="list-head">
        <button className="icon-btn mobile-only" onClick={onBack} aria-label="Menu">☰</button>
        <h2 className="grow">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <button className="ghost small" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
        <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </header>
      <div className="fullpane-body">
        <div className="cal">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {days.map((d) => { const k = key(d); const v = byDay.get(k); return (
            <button key={k} className={`cal-day ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${k === today ? 'today' : ''}`} onClick={() => onPick(k)}>
              <span>{d.getDate()}</span>
              {v?.notes ? <span className="cal-dot">{v.notes} note{v.notes > 1 ? 's' : ''}</span> : null}
              {v?.due ? <span className="cal-due">{v.due} due</span> : null}
            </button>
          ); })}
        </div>
        <p className="muted small">Click a day to see notes created or edited that day.</p>
      </div>
    </section>
  );
}
