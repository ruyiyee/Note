import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { createCard, trashCard, updateCard } from '../lib/store';
import { isDue, isLearned, review } from '../lib/srs';
import type { Card } from '../lib/types';

function speak(text: string) {
  if (!('speechSynthesis' in window)) return alert('Speech is not supported in this browser.');
  const u = new SpeechSynthesisUtterance(text); u.rate = 0.9;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

/** Optional free dictionary lookup (dictionaryapi.dev, English, no key, no cost). */
async function lookup(word: string) {
  const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`);
  if (!r.ok) throw new Error('No dictionary entry found.');
  const j = await r.json();
  const e = j[0]; const m = e?.meanings?.[0]; const d = m?.definitions?.[0];
  return {
    definition: d?.definition ? `${m.partOfSpeech ? `(${m.partOfSpeech}) ` : ''}${d.definition}` : '',
    example: d?.example ?? '',
    pronunciation: e?.phonetic ?? e?.phonetics?.find((p: any) => p.text)?.text ?? '',
  };
}

export default function VocabView({ onBack }: { onBack: () => void }) {
  const all = useLiveQuery(() => db.cards.toArray(), [], []);
  const cards = useMemo(() => all.filter((c) => !c.deleted_at), [all]);
  const decks = useMemo(() => [...new Set(cards.map((c) => c.deck))].sort(), [cards]);
  const [deck, setDeck] = useState<string>('');
  const [tab, setTab] = useState<'review' | 'cards' | 'add'>('review');
  const inDeck = cards.filter((c) => !deck || c.deck === deck);
  const due = inDeck.filter((c) => isDue(c)).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const reviewedToday = cards.filter((c) => c.last_reviewed_at?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  return (
    <section className="fullpane">
      <header className="list-head">
        <button className="icon-btn mobile-only" onClick={onBack} aria-label="Menu">☰</button>
        <h2 className="grow">Vocabulary & review</h2>
        <select value={deck} onChange={(e) => setDeck(e.target.value)} aria-label="Deck"><option value="">All decks</option>{decks.map((d) => <option key={d}>{d}</option>)}</select>
      </header>
      <div className="stats">
        <div><strong>{due.length}</strong><span>due now</span></div>
        <div><strong>{inDeck.length}</strong><span>cards</span></div>
        <div><strong>{inDeck.filter(isLearned).length}</strong><span>learned (21d+)</span></div>
        <div><strong>{reviewedToday}</strong><span>reviewed today</span></div>
      </div>
      <div className="tabs">
        {(['review', 'cards', 'add'] as const).map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{{ review: 'Review', cards: 'All cards', add: 'Add word' }[t]}</button>)}
      </div>
      <div className="fullpane-body">
        {tab === 'review' && <Review due={due} />}
        {tab === 'cards' && <CardTable cards={inDeck} />}
        {tab === 'add' && <AddCard decks={decks} defaultDeck={deck || 'Vocabulary'} />}
      </div>
    </section>
  );
}

function Review({ due }: { due: Card[] }) {
  const [show, setShow] = useState(false);
  const c = due[0];
  if (!c) return <div className="center muted pad"><p>Nothing due. Nice work.</p><p className="small">Add words, or open a note and use 🎓 Study to make flashcards.</p></div>;
  const grade = (g: 0 | 1 | 2 | 3) => { updateCard(c.id, review(c, g)); setShow(false); };
  return (
    <div className="flashcard-wrap">
      <div className="flashcard" onClick={() => setShow(true)}>
        <div className="muted small">{c.deck}</div>
        <div className="front">{c.front}</div>
        {c.pronunciation && <div className="muted">{c.pronunciation}</div>}
        {c.kind === 'vocab' && <button className="ghost small" onClick={(e) => { e.stopPropagation(); speak(c.front); }}>🔊 Pronounce</button>}
        {show ? <>
          <hr /><div className="back">{c.back}</div>
          {c.example && <div className="example">“{c.example}”</div>}
        </> : <p className="muted small">Tap or press Show to reveal</p>}
      </div>
      {!show ? <button className="primary" onClick={() => setShow(true)}>Show answer</button> : (
        <div className="grades">
          <button onClick={() => grade(0)} className="g0">Again<small>10 min</small></button>
          <button onClick={() => grade(1)} className="g1">Hard</button>
          <button onClick={() => grade(2)} className="g2">Good</button>
          <button onClick={() => grade(3)} className="g3">Easy</button>
        </div>
      )}
      <p className="muted small">{due.length} left in this session</p>
    </div>
  );
}

function CardTable({ cards }: { cards: Card[] }) {
  const [q, setQ] = useState('');
  const xs = cards.filter((c) => !q || `${c.front} ${c.back}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.front.localeCompare(b.front));
  return (
    <div>
      <input type="search" placeholder="Filter cards" value={q} onChange={(e) => setQ(e.target.value)} className="block-input" />
      <table className="cards-table">
        <thead><tr><th>Front</th><th>Back</th><th>Next review</th><th /></tr></thead>
        <tbody>{xs.map((c) => (
          <tr key={c.id}>
            <td contentEditable suppressContentEditableWarning onBlur={(e) => e.currentTarget.textContent !== c.front && updateCard(c.id, { front: e.currentTarget.textContent ?? '' })}>{c.front}</td>
            <td contentEditable suppressContentEditableWarning onBlur={(e) => e.currentTarget.textContent !== c.back && updateCard(c.id, { back: e.currentTarget.textContent ?? '' })}>{c.back}</td>
            <td className="muted small">{isDue(c) ? 'due' : new Date(c.due_at).toLocaleDateString()}</td>
            <td><button className="icon-btn" title="Delete card" onClick={() => confirm(`Delete “${c.front}”?`) && trashCard(c.id)}>×</button></td>
          </tr>
        ))}</tbody>
      </table>
      {!xs.length && <p className="muted pad">No cards.</p>}
    </div>
  );
}

function AddCard({ decks, defaultDeck }: { decks: string[]; defaultDeck: string }) {
  const empty = { front: '', back: '', example: '', pronunciation: '', deck: defaultDeck };
  const [f, setF] = useState(empty);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="add-card" onSubmit={async (e) => { e.preventDefault(); if (!f.front.trim()) return; await createCard({ ...f, kind: 'vocab' }); setF({ ...empty, deck: f.deck }); setMsg(`Added “${f.front}”.`); }}>
      <label>Word or phrase<input value={f.front} onChange={set('front')} required autoFocus /></label>
      <div className="row gap">
        <button type="button" className="ghost small" disabled={!f.front || busy} onClick={async () => {
          setBusy(true); setMsg(null);
          try { const r = await lookup(f.front); setF((x) => ({ ...x, back: x.back || r.definition, example: x.example || r.example, pronunciation: x.pronunciation || r.pronunciation })); }
          catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
        }}>{busy ? 'Looking up…' : '📖 Look up (English, free dictionary)'}</button>
        <button type="button" className="ghost small" disabled={!f.front} onClick={() => speak(f.front)}>🔊 Listen</button>
      </div>
      <label>Definition<textarea rows={2} value={f.back} onChange={set('back')} /></label>
      <label>Example sentence<textarea rows={2} value={f.example} onChange={set('example')} /></label>
      <label>Pronunciation (IPA)<input value={f.pronunciation} onChange={set('pronunciation')} /></label>
      <label>Deck<input list="decks" value={f.deck} onChange={set('deck')} /></label>
      <datalist id="decks">{decks.map((d) => <option key={d} value={d} />)}</datalist>
      <button className="primary">Add card</button>
      {msg && <p className="muted small">{msg}</p>}
    </form>
  );
}
