import { describe, expect, it } from 'vitest';
import { docToText, parseTerms, scoreText, snippet, summarize } from '../src/lib/text';
import { review } from '../src/lib/srs';

const doc = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Photosynthesis' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Plants turn light into chemical energy.' }] },
  { type: 'drawing', attrs: { strokes: [{ d: 'M 1 1 L 2 2', c: '#000', w: 2 }], height: 320 } },
  { type: 'taskList', content: [
    { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Revise chapter' }] }] },
  ] },
] };

describe('text utils', () => {
  it('extracts text and ignores drawings', () => { expect(docToText(doc)).toBe('Photosynthesis\nPlants turn light into chemical energy.\nRevise chapter'); });
  it('searches', () => {
    expect(parseTerms('"light energy" Plants')).toEqual(['light energy', 'plants']);
    expect(scoreText('Photosynthesis', docToText(doc), ['light'])).toBeGreaterThan(0);
    expect(scoreText('x', 'y', ['missing'])).toBe(0);
    expect(snippet('Plants turn light into energy', ['light']).some(([t, hit]) => hit && t === 'light')).toBe(true);
  });
  it('summarises', () => { expect(summarize('One sentence about cats and dogs here. Another sentence about cats only here. Third one is unrelated stuff entirely here. Cats cats cats are great pets.', 2)).toHaveLength(2); });
  it('schedules SM-2 reviews', () => {
    const base: any = { ease: 2.5, interval_days: 0, reps: 0, lapses: 0 };
    const r1 = review(base, 2); expect(r1.interval_days).toBe(1);
    const r2 = review({ ...base, ...r1 }, 2); expect(r2.interval_days).toBe(3);
    const again = review({ ...base, ...r2 } as any, 0); expect(again.reps).toBe(0); expect(again.lapses).toBe(1);
  });
});
