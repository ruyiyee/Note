import { useMemo, useState } from 'react';
import type { Note } from '../lib/types';
import { generateCards, keywords, summarize } from '../lib/text';
import { createCard } from '../lib/store';

// Local study tools: no AI service, no network, no cost.
export default function StudyPanel({ note, onClose }: { note: Note; onClose: () => void }) {
  const summary = useMemo(() => summarize(note.content_text, 4), [note.content_text]);
  const kws = useMemo(() => keywords(note.content_text, 8), [note.content_text]);
  const cards = useMemo(() => generateCards(note.content), [note.content]);
  const [picked, setPicked] = useState<Set<number>>(() => new Set(cards.map((_, i) => i)));
  const [done, setDone] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);

  async function save() {
    const deck = note.title || 'Notes';
    let n = 0;
    for (const [i, c] of cards.entries()) if (picked.has(i)) { await createCard({ kind: 'qa', deck, front: c.front, back: c.back, source_note_id: note.id }); n++; }
    setDone(`Added ${n} card${n === 1 ? '' : 's'} to deck “${deck}”. Review them under Vocabulary & review.`);
  }

  return (
    <aside className="side-panel">
      <header><h3>Study</h3><button className="icon-btn" onClick={onClose}>×</button></header>
      <p className="muted small">Generated on your device with simple text rules. No AI service is used.</p>
      <h4>Key points</h4>
      {summary.length ? <ul className="tight">{summary.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="muted small">Write a few sentences first.</p>}
      {kws.length > 0 && <p className="small"><strong>Keywords:</strong> {kws.join(', ')}</p>}
      <h4>Flashcards & questions ({cards.length})</h4>
      <p className="muted small">Detected from lines like <code>Term :: meaning</code>, <code>Term — meaning</code>, <code>Question? Answer</code> and headings.</p>
      {cards.map((c, i) => (
        <label key={i} className="gen-card">
          <input type="checkbox" checked={picked.has(i)} onChange={() => { const s = new Set(picked); s.has(i) ? s.delete(i) : s.add(i); setPicked(s); }} />
          <span><strong>{c.front}</strong><br /><span className="muted">{c.back}</span></span>
        </label>
      ))}
      {cards.length > 0 && <div className="row gap">
        <button className="primary" onClick={save} disabled={!picked.size}>Save as flashcards</button>
        <button className="ghost" onClick={() => { setQuiz(0); setReveal(false); }}>Quiz me now</button>
      </div>}
      {done && <p className="ok small">{done}</p>}
      {quiz !== null && cards[quiz] && (
        <div className="quiz">
          <p className="muted small">Question {quiz + 1} of {cards.length}</p>
          <p><strong>{cards[quiz].front}</strong></p>
          {reveal ? <p>{cards[quiz].back}</p> : <button className="ghost" onClick={() => setReveal(true)}>Show answer</button>}
          {reveal && <button className="primary" onClick={() => { setReveal(false); setQuiz(quiz + 1 < cards.length ? quiz + 1 : null); }}>{quiz + 1 < cards.length ? 'Next' : 'Finish'}</button>}
        </div>
      )}
    </aside>
  );
}
