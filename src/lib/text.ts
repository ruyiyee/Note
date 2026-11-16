// Pure helpers over TipTap JSON documents and plain text. No network, no AI services.

type PMNode = { type?: string; text?: string; attrs?: Record<string, any>; content?: PMNode[] };

const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote', 'codeBlock', 'tableRow', 'horizontalRule']);

/** Plain text of a document, one line per block. */
export function docToText(doc: unknown): string {
  const out: string[] = [];
  let line = '';
  const walk = (n: PMNode) => {
    if (n.type === 'text' && n.text) line += n.text;
    else if (n.type === 'hardBreak') line += '\n';
    else if (n.type === 'tableCell' || n.type === 'tableHeader') { n.content?.forEach(walk); line += ' | '; return; }
    n.content?.forEach(walk);
    if (n.type && BLOCKS.has(n.type)) { if (line.trim()) out.push(line.trim()); line = ''; }
  };
  if (doc && typeof doc === 'object') walk(doc as PMNode);
  if (line.trim()) out.push(line.trim());
  return out.join('\n');
}

// ---------- search ----------
/** Splits a query into lowercase terms; "quoted phrases" stay together. */
export function parseTerms(q: string): string[] {
  const terms: string[] = [];
  const re = /"([^"]+)"|(\S+)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(q))) terms.push((m[1] ?? m[2]).toLowerCase());
  return terms;
}

/** Score a note against the terms (0 = no match). Title hits weigh more. */
export function scoreText(title: string, body: string, terms: string[]): number {
  if (!terms.length) return 1;
  const t = title.toLowerCase(), b = body.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const inT = t.includes(term), inB = b.includes(term);
    if (!inT && !inB) return 0;
    score += (inT ? 10 : 0) + (inB ? 1 + Math.min(5, b.split(term).length - 2) : 0);
  }
  return score;
}

/** A short snippet around the first match, split into [text, isMatch] parts for highlighting. */
export function snippet(body: string, terms: string[], len = 160): [string, boolean][] {
  const flat = body.replace(/\s+/g, ' ');
  const lower = flat.toLowerCase();
  let at = -1;
  for (const term of terms) { const i = lower.indexOf(term); if (i >= 0 && (at < 0 || i < at)) at = i; }
  const start = Math.max(0, at - 40);
  const s = (start > 0 ? '…' : '') + flat.slice(start, start + len);
  return highlightParts(s, terms);
}

export function highlightParts(s: string, terms: string[]): [string, boolean][] {
  const ts = terms.filter(Boolean);
  if (!ts.length) return [[s, false]];
  const re = new RegExp(`(${ts.map(escapeRe).join('|')})`, 'gi');
  return s.split(re).filter(Boolean).map((p) => [p, ts.some((t) => t === p.toLowerCase())] as [string, boolean]);
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- summary (a local algorithm, not an AI service) ----------
const STOP = new Set('a an and are as at be but by for from has have he her his i in is it its of on or our she that the their them they this to was we were will with you your not can do does did so if then than there these those which who what when where how all any also into about over more most such only other some'.split(' '));

/** Extractive summary: picks the highest-scoring sentences by word frequency. */
export function summarize(text: string, maxSentences = 3): string[] {
  const sentences = text.replace(/\n+/g, '. ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 20);
  if (sentences.length <= maxSentences) return sentences;
  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []) if (!STOP.has(w) && w.length > 2) freq.set(w, (freq.get(w) ?? 0) + 1);
  const scored = sentences.map((s, i) => {
    const words = s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    const sc = words.reduce((a, w) => a + (freq.get(w) ?? 0), 0) / Math.max(4, words.length);
    return { s, i, sc };
  });
  return scored.sort((a, b) => b.sc - a.sc).slice(0, maxSentences).sort((a, b) => a.i - b.i).map((x) => x.s);
}
