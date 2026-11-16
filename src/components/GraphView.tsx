import { useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '../lib/types';
import { extractWikiLinks } from '../lib/text';

// Simple force-directed graph of [[wiki links]] and shared tags. Pure SVG, no libraries.
export default function GraphView({ notes, onOpen, onBack }: { notes: Note[]; onOpen: (id: string) => void; onBack: () => void }) {
  const live = useMemo(() => notes.filter((n) => !n.deleted_at && !n.archived), [notes]);
  const { nodes, edges } = useMemo(() => {
    const byTitle = new Map(live.filter((n) => n.title).map((n) => [n.title.toLowerCase(), n.id]));
    const edges: { a: string; b: string; kind: 'link' | 'tag' }[] = [];
    for (const n of live) for (const t of extractWikiLinks(n.content_text)) { const id = byTitle.get(t.toLowerCase()); if (id && id !== n.id) edges.push({ a: n.id, b: id, kind: 'link' }); }
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) if (live[i].tags.some((t) => live[j].tags.includes(t))) edges.push({ a: live[i].id, b: live[j].id, kind: 'tag' });
    const connected = new Set(edges.flatMap((e) => [e.a, e.b]));
    return { nodes: live.filter((n) => connected.has(n.id)), edges };
  }, [live]);
  const [pos, setPos] = useState<Map<string, { x: number; y: number }>>(new Map());
  const W = 900, H = 600;
  const raf = useRef(0);
  useEffect(() => {
    const p = new Map(nodes.map((n, i) => [n.id, { x: W / 2 + Math.cos(i) * 200 * Math.random(), y: H / 2 + Math.sin(i) * 200 * Math.random(), vx: 0, vy: 0 }]));
    let iter = 0;
    const step = () => {
      const arr = [...p.values()];
      for (const a of arr) for (const b of arr) if (a !== b) { const dx = a.x - b.x, dy = a.y - b.y, d2 = Math.max(100, dx * dx + dy * dy); a.vx += (dx / d2) * 800; a.vy += (dy / d2) * 800; }
      for (const e of edges) { const a = p.get(e.a)!, b = p.get(e.b)!; const dx = b.x - a.x, dy = b.y - a.y; const k = e.kind === 'link' ? 0.02 : 0.005; a.vx += dx * k; a.vy += dy * k; b.vx -= dx * k; b.vy -= dy * k; }
      for (const a of arr) { a.vx += (W / 2 - a.x) * 0.002; a.vy += (H / 2 - a.y) * 0.002; a.x = Math.min(W - 20, Math.max(20, a.x + a.vx)); a.y = Math.min(H - 20, Math.max(20, a.y + a.vy)); a.vx *= 0.6; a.vy *= 0.6; }
      setPos(new Map(p));
      if (++iter < 200) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [nodes, edges]);
  return (
    <section className="fullpane">
      <header className="list-head">
        <button className="icon-btn mobile-only" onClick={onBack} aria-label="Menu">☰</button>
        <h2 className="grow">Connections</h2>
      </header>
      <div className="fullpane-body">
        <p className="muted small">Solid lines are <code>[[links]]</code> between notes; dotted lines are shared tags. Click a note to open it.</p>
        {!nodes.length ? <p className="muted pad">No connections yet. Write <code>[[Another note's title]]</code> in a note, or give notes the same tag.</p> : (
          <svg viewBox={`0 0 ${W} ${H}`} className="graph">
            {edges.map((e, i) => { const a = pos.get(e.a), b = pos.get(e.b); return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={e.kind} /> : null; })}
            {nodes.map((n) => { const p = pos.get(n.id); return p ? (
              <g key={n.id} transform={`translate(${p.x},${p.y})`} onClick={() => onOpen(n.id)} className="gnode">
                <circle r={6} /><text x={9} y={4}>{(n.title || 'Untitled').slice(0, 28)}</text>
              </g>) : null; })}
          </svg>
        )}
      </div>
    </section>
  );
}
