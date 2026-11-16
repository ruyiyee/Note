import { describe, expect, it } from 'vitest';
import { bounds, densify, eraseAt, lassoSelect, normalizeStroke, pathFor, transform } from '../src/lib/drawing';
import { pageCount } from '../src/lib/pages';

const line = (y: number) => ({ p: densify([0, y, 100, y]), c: '#000', w: 2 });

describe('drawing geometry', () => {
  it('converts legacy path strokes', () => {
    expect(normalizeStroke({ d: 'M 1 2 L 3 4 L 5 6', c: '#f00', w: 2.5 })).toEqual({ p: [1, 2, 3, 4, 5, 6], c: '#f00', w: 2.5 });
  });
  it('densifies long segments', () => { expect(densify([0, 0, 10, 0], 2).length).toBeGreaterThanOrEqual(12); });
  it('erasing the middle splits a stroke into two clean pieces, width unchanged', () => {
    const out = eraseAt([line(10)], 50, 10, 5);
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.w === 2)).toBe(true);
    expect(Math.max(...out[0].p.filter((_, i) => i % 2 === 0))).toBeLessThan(44);
    expect(Math.min(...out[1].p.filter((_, i) => i % 2 === 0))).toBeGreaterThan(56);
  });
  it('erasing elsewhere leaves strokes untouched', () => {
    const s = [line(10)];
    expect(eraseAt(s, 50, 80, 5)[0]).toBe(s[0]);
  });
  it('a larger eraser removes more', () => {
    const small = eraseAt([line(10)], 50, 10, 3), big = eraseAt([line(10)], 50, 10, 20);
    const len = (xs: typeof small) => xs.reduce((a, s) => a + s.p.length, 0);
    expect(len(big)).toBeLessThan(len(small));
  });
  it('lasso selects strokes inside the loop only', () => {
    const poly = [-5, 0, 105, 0, 105, 20, -5, 20];
    expect(lassoSelect([line(10), line(50)], poly)).toEqual([0]);
  });
  it('moves and resizes', () => {
    const moved = transform(line(10), 0, 10, 1, 5, 5);
    expect(bounds([moved])).toMatchObject({ x0: 5, y0: 15, x1: 105 });
    const big = transform(line(10), 0, 10, 2, 0, 0);
    expect(bounds([big]).x1).toBe(200);
  });
  it('builds a path', () => { expect(pathFor([0, 0, 10, 10, 20, 0])).toMatch(/^M 0 0/); });
  it('counts pages', () => {
    expect(pageCount({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(1);
    expect(pageCount({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'pageBreak' }, { type: 'paragraph' }, { type: 'pageBreak' }] })).toBe(3);
  });
});
