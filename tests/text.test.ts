import { describe, expect, it } from 'vitest';
import { docToText, extractTasks, generateCards, parseQuery, scoreText, toggleTask, extractWikiLinks, summarize } from '../src/lib/text';
import { review } from '../src/lib/srs';

const doc = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Photosynthesis' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Plants turn light into chemical energy. See [[Cells]].' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Chlorophyll :: green pigment' }] },
  { type: 'taskList', content: [
    { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Revise chapter @2030-02-01' }] }] },
    { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read notes' }] }] },
  ] },
] };

describe('text utils', () => {
  it('extracts text', () => { expect(docToText(doc)).toContain('Chlorophyll :: green pigment'); });
  it('extracts tasks with deadlines and toggles them', () => {
    const t = extractTasks(doc);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ text: 'Revise chapter', due: '2030-02-01', checked: false });
    expect(extractTasks(toggleTask(doc, 0))[0].checked).toBe(true);
  });
  it('finds wiki links', () => { expect(extractWikiLinks(docToText(doc))).toEqual(['Cells']); });
  it('generates flashcards', () => {
    const c = generateCards(doc);
    expect(c.find((x) => x.front === 'Chlorophyll')?.back).toBe('green pigment');
    expect(c.some((x) => x.front === 'Explain: Photosynthesis')).toBe(true);
  });
  it('parses search queries', () => {
    expect(parseQuery('tag:bio #exam folder:school "light energy" plants is:pinned')).toEqual({ terms: ['light energy', 'plants'], tags: ['bio', 'exam'], folder: 'school', is: ['pinned'] });
    expect(scoreText('Photosynthesis', docToText(doc), ['light'])).toBeGreaterThan(0);
    expect(scoreText('x', 'y', ['missing'])).toBe(0);
  });
  it('summarises', () => { expect(summarize('One sentence about cats and dogs here. Another sentence about cats only here. Third one is unrelated stuff entirely here. Cats cats cats are great pets.', 2)).toHaveLength(2); });
  it('schedules SM-2 reviews', () => {
    const base: any = { ease: 2.5, interval_days: 0, reps: 0, lapses: 0 };
    const r1 = review(base, 2); expect(r1.interval_days).toBe(1);
    const r2 = review({ ...base, ...r1 }, 2); expect(r2.interval_days).toBe(3);
    const again = review({ ...base, ...r2 } as any, 0); expect(again.reps).toBe(0); expect(again.lapses).toBe(1);
  });
});
