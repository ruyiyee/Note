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

export interface TaskRef { text: string; checked: boolean; due: string | null; index: number }
const DUE_RE = /(?:@|due:)\s*(\d{4}-\d{2}-\d{2})/i;

/** Checklist items in a document. A date like "@2026-12-01" or "due: 2026-12-01" is a deadline. */
export function extractTasks(doc: unknown): TaskRef[] {
  const tasks: TaskRef[] = [];
  const walk = (n: PMNode) => {
    if (n.type === 'taskItem') {
      const text = docToText({ type: 'doc', content: (n.content ?? []).filter((c) => c.type !== 'taskList') });
      const m = text.match(DUE_RE);
      tasks.push({ text: text.replace(DUE_RE, '').trim(), checked: !!n.attrs?.checked, due: m ? m[1] : null, index: tasks.length });
    }
    n.content?.forEach(walk);
  };
  if (doc && typeof doc === 'object') walk(doc as PMNode);
  return tasks;
}

/** Toggle the nth taskItem in a document (returns a new doc). */
export function toggleTask(doc: any, index: number): any {
  let i = 0;
  const walk = (n: any): any => {
    if (n.type === 'taskItem') {
      const mine = i++ === index;
      const content = n.content?.map(walk);
      return { ...n, attrs: { ...n.attrs, checked: mine ? !n.attrs?.checked : n.attrs?.checked }, content };
    }
    return n.content ? { ...n, content: n.content.map(walk) } : n;
  };
  return walk(doc);
}

/** [[Wiki links]] to other notes by title. */
export function extractWikiLinks(text: string): string[] {
  return [...new Set([...text.matchAll(/\[\[([^\]\n]{1,200})\]\]/g)].map((m) => m[1].trim()))];
}

// ---------- search ----------
export interface ParsedQuery { terms: string[]; tags: string[]; folder: string | null; is: string[] }

/** Supports: words, "exact phrase", tag:name, #name, folder:name, is:pinned|favorite|archived|task */
export function parseQuery(q: string): ParsedQuery {
  const res: ParsedQuery = { terms: [], tags: [], folder: null, is: [] };
  const re = /"([^"]+)"|(\S+)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const tok = (m[1] ?? m[2]).toLowerCase();
    if (m[1]) res.terms.push(tok);
    else if (tok.startsWith('tag:')) res.tags.push(tok.slice(4));
    else if (tok.startsWith('#') && tok.length > 1) res.tags.push(tok.slice(1));
    else if (tok.startsWith('folder:')) res.folder = tok.slice(7);
    else if (tok.startsWith('is:')) res.is.push(tok.slice(3));
    else res.terms.push(tok);
  }
  return res;
}

/** Score a note against the text terms (0 = no match). Title hits weigh more. */
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

// ---------- study tools (local algorithms, no AI service) ----------
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

/** Top keywords, used for tag suggestions and related-note matching. */
export function keywords(text: string, n = 8): string[] {
  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[\p{L}][\p{L}\p{N}'-]+/gu) ?? []) if (!STOP.has(w) && w.length > 3) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

export interface GeneratedCard { front: string; back: string }

/**
 * Flashcards / active-recall questions from note text. Recognises:
 *   "Term :: definition", "Term — definition", "Term: definition" (short term),
 *   "Question? Answer" on one line, and "Heading" followed by its first line.
 */
export function generateCards(doc: unknown): GeneratedCard[] {
  const cards: GeneratedCard[] = [];
  const lines = docToText(doc).split('\n');
  for (const line of lines) {
    let m = line.match(/^(.{1,80}?)\s*(?:::|\s[—–-]\s)\s*(.{2,})$/);
    if (!m) m = line.match(/^([^:]{1,40}):\s+(.{3,})$/);
    if (m) { cards.push({ front: m[1].trim(), back: m[2].trim() }); continue; }
    const q = line.match(/^(.{5,200}\?)\s+(.{2,})$/);
    if (q) cards.push({ front: q[1].trim(), back: q[2].trim() });
  }
  // headings → "Explain <heading>" with the following paragraph as answer
  const walkTop = (doc as PMNode)?.content ?? [];
  for (let i = 0; i < walkTop.length - 1; i++) {
    const h = walkTop[i], next = walkTop[i + 1];
    if (h.type === 'heading' && next.type !== 'heading') {
      const title = docToText(h), body = docToText(next);
      if (title && body.length > 10) cards.push({ front: `Explain: ${title}`, back: body.slice(0, 500) });
    }
  }
  const seen = new Set<string>();
  return cards.filter((c) => !seen.has(c.front.toLowerCase()) && seen.add(c.front.toLowerCase()));
}
