// Freehand drawing block for the editor. Strokes are stored inside the note's
// document (node attrs), so drawings sync, version and export like any other content.
import { Node, mergeAttributes } from '@tiptap/core';

export interface Stroke { d: string; c: string; w: number }
const SVG = 'http://www.w3.org/2000/svg';
const W = 800; // drawing coordinate width; the SVG scales to the note width
export const PEN_COLORS = [['Ink', '#4a2f38'], ['Rose', '#d9819c']] as const;

function pathEl(s: Stroke, i: number) {
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', s.d); p.setAttribute('stroke', s.c); p.setAttribute('stroke-width', String(s.w));
  p.setAttribute('fill', 'none'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  p.dataset.i = String(i);
  return p;
}

export const Drawing = Node.create({
  name: 'drawing',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      strokes: {
        default: [],
        parseHTML: (el) => { try { return JSON.parse(el.getAttribute('data-strokes') || '[]'); } catch { return []; } },
        renderHTML: (a) => ({ 'data-strokes': JSON.stringify(a.strokes) }),
      },
      height: { default: 320, parseHTML: (el) => Number(el.getAttribute('data-height')) || 320, renderHTML: (a) => ({ 'data-height': a.height }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-drawing]' }]; },

  // Static HTML (used for PDF export): an inline SVG of the strokes.
  renderHTML({ node, HTMLAttributes }) {
    const strokes = (node.attrs.strokes as Stroke[]).map((s) => [`${SVG} path`, { d: s.d, stroke: s.c, 'stroke-width': s.w, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }]);
    return ['div', mergeAttributes({ 'data-drawing': '', class: 'drawing' }, HTMLAttributes), [`${SVG} svg`, { viewBox: `0 0 ${W} ${node.attrs.height}` }, ...strokes]] as any;
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      let mode: 'pen' | 'erase' = 'pen';
      let color: string = PEN_COLORS[0][1];

      const dom = document.createElement('div');
      dom.className = 'drawing'; dom.contentEditable = 'false';
      const bar = document.createElement('div'); bar.className = 'drawing-bar';
      const svg = document.createElementNS(SVG, 'svg');
      dom.append(bar, svg);

      const commit = (attrs: Record<string, unknown>) => {
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (pos === undefined) return;
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }));
      };
      const strokes = () => current.attrs.strokes as Stroke[];

      const buttons: [string, () => void, () => boolean][] = [
        ...PEN_COLORS.map(([name, c]) => [name, () => { mode = 'pen'; color = c; }, () => mode === 'pen' && color === c] as [string, () => void, () => boolean]),
        ['Eraser', () => { mode = 'erase'; }, () => mode === 'erase'],
        ['Undo', () => commit({ strokes: strokes().slice(0, -1) }), () => false],
        ['Clear', () => commit({ strokes: [] }), () => false],
        ['More space', () => commit({ height: current.attrs.height + 160 }), () => false],
      ];
      const renderBar = () => {
        bar.replaceChildren(...buttons.map(([label, run, active]) => {
          const b = document.createElement('button');
          b.type = 'button'; b.textContent = label; if (active()) b.className = 'on';
          b.onclick = () => { run(); renderBar(); svg.classList.toggle('erasing', mode === 'erase'); };
          return b;
        }));
      };
      const render = () => {
        svg.setAttribute('viewBox', `0 0 ${W} ${current.attrs.height}`);
        svg.replaceChildren(...strokes().map(pathEl));
      };
      renderBar(); render();

      const point = (e: PointerEvent) => {
        const r = svg.getBoundingClientRect(); const k = W / r.width;
        return `${((e.clientX - r.left) * k).toFixed(1)} ${((e.clientY - r.top) * k).toFixed(1)}`;
      };
      let live: SVGPathElement | null = null; let d = '';
      const eraseAt = (e: PointerEvent) => {
        const el = document.elementFromPoint(e.clientX, e.clientY) as SVGElement | null;
        if (el?.tagName === 'path' && el.dataset.i && svg.contains(el)) commit({ strokes: strokes().filter((_, i) => i !== Number(el.dataset.i)) });
      };
      svg.addEventListener('pointerdown', (e) => {
        if (!editor.isEditable) return;
        e.preventDefault(); svg.setPointerCapture(e.pointerId);
        if (mode === 'erase') return eraseAt(e);
        d = `M ${point(e)}`;
        live = pathEl({ d: `${d} l 0.1 0.1`, c: color, w: 2.5 }, -1); svg.append(live);
      });
      svg.addEventListener('pointermove', (e) => {
        if (mode === 'erase') { if (e.buttons) eraseAt(e); return; }
        if (!live) return;
        d += ` L ${point(e)}`; live.setAttribute('d', d);
      });
      const end = () => {
        if (!live) return;
        live = null;
        commit({ strokes: [...strokes(), { d: d.includes('L') ? d : `${d} l 0.1 0.1`, c: color, w: 2.5 }] });
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);

      return {
        dom,
        update(next) { if (next.type !== current.type) return false; current = next; if (!live) render(); return true; },
        stopEvent: () => true,
        ignoreMutation: () => true,
      };
    };
  },
});
