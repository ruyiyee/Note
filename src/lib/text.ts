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

// Word count. Chinese/Japanese/Korean characters count one word each (they have no spaces);
// everything else is counted by runs of letters/digits, so "don't" and "e-mail" are one word.
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/gu;
export function countWords(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const rest = text.replace(CJK, ' ').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  return cjk + rest;
}
