import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { createCard, trashCard, updateCard } from '../lib/store';
import { isDue, review } from '../lib/srs';
import type { Card } from '../lib/types';
import { askConfirm } from './Dialog';

type Fields = Pick<Card, 'front' | 'back' | 'example' | 'notes'>;
const EMPTY: Fields = { front: '', back: '', example: '', notes: '' };

export default function VocabView({ onBack }: { onBack: () => void }) {
  const all = useLiveQuery(() => db.cards.toArray(), [], []);
  const cards = useMemo(() => all.filter((c) => !c.deleted_at).sort((a, b) => a.front.localeCompare(b.front)), [all]);
  const due = useMemo(() => cards.filter((c) => isDue(c)).sort((a, b) => a.due_at.localeCompare(b.due_at)), [cards]);
  const [tab, setTab] = useState<'words' | 'review'>('words');

  return (
    <section className="fullpane">
      <header className="list-head">
        <button className="text-btn mobile-only" onClick={onBack}>Menu</button>
        <h2 className="grow">Vocabulary</h2>
        <span className="muted small">{cards.length} {cards.length === 1 ? 'word' : 'words'}, {due.length} to review</span>
      </header>
      <div className="tabs">
        <button className={tab === 'words' ? 'active' : ''} onClick={() => setTab('words')}>Words</button>
        <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Review</button>
      </div>
      <div className="fullpane-body narrow-body">
        {tab === 'words' ? <Words cards={cards} /> : <Review due={due} />}
      </div>
    </section>
  );
}

function WordForm({ initial, submit, onSave, onCancel }: { initial: Fields; submit: string; onSave: (f: Fields) => void; onCancel?: () => void }) {
  const [f, setF] = useState<Fields>(initial);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="word-form" onSubmit={(e) => { e.preventDefault(); if (!f.front.trim()) return; onSave({ ...f, front: f.front.trim() }); if (!onCancel) setF(EMPTY); }}>
      <label>Word<input value={f.front} onChange={set('front')} required /></label>
      <label>Definition<textarea rows={2} value={f.back} onChange={set('back')} /></label>
      <label>Example sentence<textarea rows={2} value={f.example} onChange={set('example')} /></label>
      <label>Personal notes<textarea rows={2} value={f.notes} onChange={set('notes')} /></label>
      <div className="row gap">
        <button className="primary">{submit}</button>
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function Words({ cards }: { cards: Card[] }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const xs = cards.filter((c) => !q || `${c.front} ${c.back}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      {adding ? (
        <div className="word-card"><WordForm initial={EMPTY} submit="Add word" onSave={(f) => createCard({ ...f, kind: 'vocab' })} /><button className="text-btn" onClick={() => setAdding(false)}>Done</button></div>
      ) : (
        <div className="add-row">
          <input className="grow" type="search" placeholder="Search words" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search words" />
          <button className="primary" onClick={() => setAdding(true)}>Add word</button>
        </div>
      )}
      <ul className="words">
        {xs.map((c) => editing === c.id ? (
          <li key={c.id} className="word-card">
            <WordForm initial={c} submit="Save" onSave={(f) => { updateCard(c.id, f); setEditing(null); }} onCancel={() => setEditing(null)} />
            <button className="text-btn danger" onClick={async () => (await askConfirm(`Delete "${c.front}"?`, 'Delete')) && trashCard(c.id)}>Delete word</button>
          </li>
        ) : (
          <li key={c.id}><button className="word" onClick={() => setEditing(c.id)}>
            <span className="word-term">{c.front}</span>
            {c.back && <span className="word-def">{c.back}</span>}
            {c.example && <span className="word-ex">{c.example}</span>}
            {c.notes && <span className="word-notes">{c.notes}</span>}
          </button></li>
        ))}
      </ul>
      {!xs.length && <p className="muted empty">{cards.length ? 'No matches.' : 'No words yet. Add your first word to start.'}</p>}
    </>
  );
}

function Review({ due }: { due: Card[] }) {
  const [show, setShow] = useState(false);
  const c = due[0];
  if (!c) return <p className="muted empty">Nothing to review right now. Words come back here when they are due.</p>;
  const grade = (g: 0 | 1 | 2 | 3) => { updateCard(c.id, review(c, g)); setShow(false); };
  return (
    <div className="flashcard-wrap">
      <div className="flashcard">
        <div className="front">{c.front}</div>
        {show && <>
          {c.back && <div className="back">{c.back}</div>}
          {c.example && <div className="example">{c.example}</div>}
          {c.notes && <div className="muted">{c.notes}</div>}
        </>}
      </div>
      {!show ? <button className="primary" onClick={() => setShow(true)}>Show answer</button> : (
        <div className="grades">
          <button onClick={() => grade(0)}>Again</button>
          <button onClick={() => grade(1)}>Hard</button>
          <button onClick={() => grade(2)}>Good</button>
          <button onClick={() => grade(3)}>Easy</button>
        </div>
      )}
      <p className="muted small">{due.length} left</p>
    </div>
  );
}
