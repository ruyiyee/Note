// Freehand drawing block for the editor.
//
// Storage: node attrs { strokes, height }. Each stroke is { p: [x0,y0,x1,y1,...], c: colour, w: width }
// in canvas pixels (1 unit = 1 CSS px at 100% zoom). Strokes live inside the note's
// document, so drawings autosave, sync, version and export like any other content.
// Older strokes stored as an SVG path string { d } are converted on load.
//
// Tools: pen (two colours), eraser (adjustable size, cuts strokes cleanly), lasso
// (select, move, resize, delete), hand (pan). Zoom with buttons or Ctrl/⌘ + wheel / pinch.
// Undo and Redo cover drawing, erasing and lasso edits.
import { Node, mergeAttributes } from '@tiptap/core';

export interface Stroke { p: number[]; c: string; w: number }
type Tool = 'pen' | 'erase' | 'lasso' | 'hand';

const SVG = 'http://www.w3.org/2000/svg';
export const PEN_COLORS = [['Ink', '#1f2a44'], ['Pink', '#e86a92']] as const;
const PEN_WIDTH = 2.5;
const ERASER_SIZES = [['Small', 6], ['Medium', 14], ['Large', 28]] as const;
const MIN_ZOOM = 0.5, MAX_ZOOM = 4;

// ---------- geometry helpers (exported for tests) ----------

/** Convert a legacy "M x y L x y ..." path into a point list. */
export function normalizeStroke(s: any): Stroke {
  if (Array.isArray(s?.p)) return { p: s.p, c: s.c ?? PEN_COLORS[0][1], w: s.w ?? PEN_WIDTH };
  const nums = String(s?.d ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  return { p: nums.length % 2 ? nums.slice(0, -1) : nums, c: s?.c ?? PEN_COLORS[0][1], w: s?.w ?? PEN_WIDTH };
}

/** Smooth SVG path through the points (quadratic curves through midpoints). */
export function pathFor(p: number[]): string {
  if (p.length < 2) return '';
  if (p.length <= 4) return `M ${p[0]} ${p[1]} L ${p[p.length - 2] + 0.01} ${p[p.length - 1] + 0.01}`;
  let d = `M ${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
    d += ` Q ${p[i]} ${p[i + 1]} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  return d + ` L ${p[p.length - 2]} ${p[p.length - 1]}`;
}

/** Insert points so consecutive points are at most `step` apart (makes erasing precise). */
export function densify(p: number[], step = 2): number[] {
  const out = p.slice(0, 2);
  for (let i = 2; i < p.length; i += 2) {
    const x0 = out[out.length - 2], y0 = out[out.length - 1], x1 = p[i], y1 = p[i + 1];
    const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / step);
    for (let k = 1; k < n; k++) out.push(+(x0 + ((x1 - x0) * k) / n).toFixed(1), +(y0 + ((y1 - y0) * k) / n).toFixed(1));
    out.push(x1, y1);
  }
  return out;
}

/**
 * Erase a circle (cx, cy, r) from the strokes. Points inside the circle are removed and
 * strokes are split at the gap, so only the touched part disappears.
 */
export function eraseAt(strokes: Stroke[], cx: number, cy: number, r: number): Stroke[] {
  const out: Stroke[] = [];
  for (const s of strokes) {
    const reach = r + s.w / 2;
    let run: number[] = [], hit = false;
    for (let i = 0; i < s.p.length; i += 2) {
      if (Math.hypot(s.p[i] - cx, s.p[i + 1] - cy) <= reach) {
        hit = true;
        if (run.length >= 4) out.push({ ...s, p: run });
        run = [];
      } else run.push(s.p[i], s.p[i + 1]);
    }
    if (!hit) out.push(s);
    else if (run.length >= 4) out.push({ ...s, p: run });
  }
  return out;
}

export function pointInPolygon(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Indices of strokes with at least half their points inside the lasso polygon. */
export function lassoSelect(strokes: Stroke[], poly: number[]): number[] {
  if (poly.length < 6) return [];
  return strokes.flatMap((s, i) => {
    let n = 0;
    for (let k = 0; k < s.p.length; k += 2) if (pointInPolygon(s.p[k], s.p[k + 1], poly)) n++;
    return n * 2 >= s.p.length / 2 ? [i] : [];
  });
}

export function bounds(strokes: Stroke[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (let i = 0; i < s.p.length; i += 2) {
    x0 = Math.min(x0, s.p[i]); x1 = Math.max(x1, s.p[i]); y0 = Math.min(y0, s.p[i + 1]); y1 = Math.max(y1, s.p[i + 1]);
  }
  return { x0, y0, x1, y1 };
}

/** Move and scale points: p' = origin + (p - origin) * k + (dx, dy). */
export function transform(s: Stroke, ox: number, oy: number, k: number, dx: number, dy: number): Stroke {
  const p = s.p.map((v, i) => +((i % 2 ? oy + (v - oy) * k + dy : ox + (v - ox) * k + dx)).toFixed(1));
  return { ...s, p, w: +(s.w * Math.sqrt(k)).toFixed(2) };
}

// ---------- the TipTap node ----------

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
      height: { default: 360, parseHTML: (el) => Number(el.getAttribute('data-height')) || 360, renderHTML: (a) => ({ 'data-height': a.height }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-drawing]' }]; },

  // Static HTML (PDF export): an inline SVG of the strokes.
  renderHTML({ node, HTMLAttributes }) {
    const strokes = (node.attrs.strokes as any[]).map(normalizeStroke);
    const b = bounds(strokes);
    const w = Math.max(700, Number.isFinite(b.x1) ? b.x1 + 10 : 0);
    const paths = strokes.map((s) => [`${SVG} path`, { d: pathFor(s.p), stroke: s.c, 'stroke-width': s.w, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }]);
    return ['div', mergeAttributes({ 'data-drawing': '', class: 'drawing' }, HTMLAttributes), [`${SVG} svg`, { viewBox: `0 0 ${w} ${node.attrs.height}` }, ...paths]] as any;
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      let tool: Tool = 'pen';
      let color: string = PEN_COLORS[0][1];
      let eraser = 14;
      let view = { s: 1, x: 0, y: 0 }; // zoom and pan (not saved)
      let selected: number[] = [];
      const undo: Stroke[][] = [], redo: Stroke[][] = [];

      const saved = () => (current.attrs.strokes as any[]).map(normalizeStroke);
      let work: Stroke[] = saved(); // what is on screen (may run ahead of the saved doc during a gesture)

      // ---- DOM ----
      const dom = document.createElement('div');
      dom.className = 'drawing'; dom.contentEditable = 'false'; dom.tabIndex = 0;
      const bar = document.createElement('div'); bar.className = 'drawing-bar';
      const svg = document.createElementNS(SVG, 'svg');
      const gStrokes = document.createElementNS(SVG, 'g');
      const gOverlay = document.createElementNS(SVG, 'g');
      svg.append(gStrokes, gOverlay);
      dom.append(bar, svg);

      const commit = (next: Stroke[], extra: Record<string, unknown> = {}) => {
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (pos === undefined) return;
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...extra, strokes: next }));
      };
      /** Record an undo step and save. */
      const change = (next: Stroke[]) => { undo.push(saved()); if (undo.length > 100) undo.shift(); redo.length = 0; work = next; commit(next); };

      // ---- coordinates ----
      const size = () => ({ w: svg.clientWidth || 700, h: current.attrs.height as number });
      const toCanvas = (e: { clientX: number; clientY: number }) => {
        const r = svg.getBoundingClientRect();
        return [+(view.x + (e.clientX - r.left) / view.s).toFixed(1), +(view.y + (e.clientY - r.top) / view.s).toFixed(1)];
      };
      const clampView = () => {
        const { w, h } = size();
        view.s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.s));
        view.x = Math.min(Math.max(view.x, -w / 2), w - w / view.s / 2);
        view.y = Math.min(Math.max(view.y, -h / 2), h - h / view.s / 2);
      };
      const zoomAt = (k: number, cx: number, cy: number) => {
        const s0 = view.s; view.s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s0 * k));
        view.x = cx - (cx - view.x) * (s0 / view.s); view.y = cy - (cy - view.y) * (s0 / view.s);
        clampView(); render(); renderBar();
      };

      // ---- rendering ----
      const el = (tag: string, attrs: Record<string, string | number>) => {
        const e = document.createElementNS(SVG, tag);
        for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
        return e;
      };
      let lassoPath: number[] | null = null;
      let eraserAt: [number, number] | null = null;
      const render = () => {
        const { w, h } = size();
        svg.style.height = `${h}px`;
        svg.setAttribute('viewBox', `${view.x} ${view.y} ${w / view.s} ${h / view.s}`);
        svg.dataset.tool = tool;
        gStrokes.replaceChildren(...work.map((s) => el('path', { d: pathFor(s.p), stroke: s.c, 'stroke-width': s.w, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })));
        const o: SVGElement[] = [];
        const thin = 1 / view.s;
        if (lassoPath && lassoPath.length >= 4) o.push(el('path', { d: `M ${lassoPath.slice(0, 2).join(' ')} L ${lassoPath.slice(2).join(' ')} Z`, class: 'lasso-line', 'stroke-width': thin, 'stroke-dasharray': `${4 * thin} ${4 * thin}` }));
        if (selected.length) {
          const b = bounds(selected.map((i) => work[i]).filter(Boolean)); const pad = 6 * thin, hs = 10 * thin;
          o.push(el('rect', { x: b.x0 - pad, y: b.y0 - pad, width: b.x1 - b.x0 + 2 * pad, height: b.y1 - b.y0 + 2 * pad, class: 'sel-box', 'stroke-width': thin, 'stroke-dasharray': `${4 * thin} ${3 * thin}` }));
          o.push(el('rect', { x: b.x1 + pad - hs / 2, y: b.y1 + pad - hs / 2, width: hs, height: hs, class: 'sel-handle', 'stroke-width': thin }));
        }
        if (eraserAt && tool === 'erase') o.push(el('circle', { cx: eraserAt[0], cy: eraserAt[1], r: eraser / view.s, class: 'eraser-ring', 'stroke-width': thin }));
        gOverlay.replaceChildren(...o);
      };

      const btn = (label: string, run: () => void, on = false, disabled = false) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label; if (on) b.className = 'on'; b.disabled = disabled;
        b.onmousedown = (e) => e.preventDefault();
        b.onclick = () => { run(); renderBar(); render(); };
        return b;
      };
      const sep = () => { const s = document.createElement('span'); s.className = 'sep'; return s; };
      const setTool = (t: Tool) => { tool = t; if (t !== 'lasso') selected = []; };
      const renderBar = () => {
        const items: HTMLElement[] = [
          ...PEN_COLORS.map(([name, c]) => btn(name, () => { setTool('pen'); color = c; }, tool === 'pen' && color === c)),
          btn('Eraser', () => setTool('erase'), tool === 'erase'),
          btn('Lasso', () => setTool('lasso'), tool === 'lasso'),
          btn('Move view', () => setTool('hand'), tool === 'hand'),
        ];
        if (tool === 'erase') {
          const sel = document.createElement('select');
          sel.setAttribute('aria-label', 'Eraser size');
          for (const [name, v] of ERASER_SIZES) { const o = document.createElement('option'); o.value = String(v); o.textContent = `${name} eraser`; o.selected = v === eraser; sel.append(o); }
          sel.onchange = () => { eraser = Number(sel.value); };
          items.push(sel);
        }
        if (tool === 'lasso' && selected.length) items.push(btn('Delete selection', deleteSelection));
        items.push(sep(),
          btn('Undo', doUndo, false, !undo.length), btn('Redo', doRedo, false, !redo.length), sep(),
          btn('Zoom out', () => zoomAt(1 / 1.25, view.x + size().w / view.s / 2, view.y + size().h / view.s / 2)),
          btn(`${Math.round(view.s * 100)}%`, () => { view = { s: 1, x: 0, y: 0 }; }),
          btn('Zoom in', () => zoomAt(1.25, view.x + size().w / view.s / 2, view.y + size().h / view.s / 2)), sep(),
          btn('More space', () => commit(work, { height: current.attrs.height + 240 })),
          btn('Clear', () => { if (work.length) { selected = []; change([]); } }));
        bar.replaceChildren(...items);
      };

      const doUndo = () => { const prev = undo.pop(); if (!prev) return; redo.push(saved()); selected = []; work = prev; commit(prev); };
      const doRedo = () => { const next = redo.pop(); if (!next) return; undo.push(saved()); selected = []; work = next; commit(next); };
      const deleteSelection = () => { if (!selected.length) return; const drop = new Set(selected); selected = []; change(work.filter((_, i) => !drop.has(i))); };

      // ---- pointer handling ----
      const pointers = new Map<number, { x: number; y: number }>();
      let gesture: null | { kind: 'draw'; pts: number[] } | { kind: 'erase'; before: Stroke[] } | { kind: 'lasso' } | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
        | { kind: 'move' | 'resize'; start: number[]; orig: Stroke[]; box: ReturnType<typeof bounds> } | { kind: 'pinch'; d: number; s: number } = null;

      const onSelection = (x: number, y: number) => {
        if (!selected.length) return null;
        const b = bounds(selected.map((i) => work[i])); const pad = 6 / view.s, hs = 14 / view.s;
        if (Math.abs(x - (b.x1 + pad)) <= hs && Math.abs(y - (b.y1 + pad)) <= hs) return 'resize';
        if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) return 'move';
        return null;
      };

      svg.addEventListener('pointerdown', (e) => {
        if (!editor.isEditable) return;
        e.preventDefault(); dom.focus({ preventScroll: true });
        svg.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) { // two fingers: pinch-zoom and pan
          const [a, b] = [...pointers.values()];
          if (gesture && gesture.kind !== 'pan') { lassoPath = null; work = saved(); }
          gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s };
          render(); return;
        }
        const [x, y] = toCanvas(e);
        if (tool === 'hand' || e.button === 1) { gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; return; }
        if (tool === 'erase') { gesture = { kind: 'erase', before: work }; eraserAt = [x, y]; work = eraseAt(work, x, y, eraser / view.s); render(); return; }
        if (tool === 'lasso') {
          const hit = onSelection(x, y);
          if (hit) { gesture = { kind: hit, start: [x, y], orig: work, box: bounds(selected.map((i) => work[i])) }; return; }
          selected = []; lassoPath = [x, y]; gesture = { kind: 'lasso' }; render(); renderBar(); return;
        }
        gesture = { kind: 'draw', pts: [x, y] };
        work = [...work, { p: [x, y], c: color, w: PEN_WIDTH }]; render();
      });

      svg.addEventListener('pointermove', (e) => {
        const [x, y] = toCanvas(e);
        if (tool === 'erase') { eraserAt = [x, y]; if (!gesture) render(); }
        if (!pointers.has(e.pointerId) || !gesture) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        switch (gesture.kind) {
          case 'pinch': {
            const [a, b] = [...pointers.values()]; if (!b) return;
            const r = svg.getBoundingClientRect();
            const cx = view.x + ((a.x + b.x) / 2 - r.left) / view.s, cy = view.y + ((a.y + b.y) / 2 - r.top) / view.s;
            zoomAt((gesture.s * Math.hypot(a.x - b.x, a.y - b.y)) / gesture.d / view.s, cx, cy); return;
          }
          case 'pan': view.x = gesture.vx - (e.clientX - gesture.sx) / view.s; view.y = gesture.vy - (e.clientY - gesture.sy) / view.s; clampView(); render(); return;
          case 'erase': work = eraseAt(work, x, y, eraser / view.s); render(); return;
          case 'lasso': lassoPath!.push(x, y); render(); return;
          case 'draw': {
            const p = gesture.pts; if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 0.8 / view.s) return;
            p.push(x, y); work = [...work.slice(0, -1), { p: [...p], c: color, w: PEN_WIDTH }]; render(); return;
          }
          case 'move': case 'resize': {
            const { start, orig, box } = gesture; const pick = new Set(selected);
            let k = 1, dx = x - start[0], dy = y - start[1];
            if (gesture.kind === 'resize') {
              const w0 = Math.max(4, box.x1 - box.x0), h0 = Math.max(4, box.y1 - box.y0);
              k = Math.max(0.1, Math.max((w0 + dx) / w0, (h0 + dy) / h0)); dx = 0; dy = 0;
            }
            work = orig.map((s, i) => (pick.has(i) ? transform(s, box.x0, box.y0, k, dx, dy) : s)); render(); return;
          }
        }
      });

      const end = (e: PointerEvent) => {
        pointers.delete(e.pointerId);
        const g = gesture; if (!g) return;
        if (g.kind === 'pinch') { if (pointers.size === 0) gesture = null; return; }
        gesture = null;
        if (g.kind === 'draw') { const last = work[work.length - 1]; const p = last.p.length === 2 ? [last.p[0], last.p[1], last.p[0] + 0.1, last.p[1] + 0.1] : densify(last.p); change([...saved(), { ...last, p }]); }
        else if (g.kind === 'erase') { if (JSON.stringify(work) !== JSON.stringify(g.before)) { const next = work; work = g.before; change(next); } }
        else if (g.kind === 'lasso') { selected = lassoSelect(work, lassoPath ?? []); lassoPath = null; renderBar(); }
        else if (g.kind === 'move' || g.kind === 'resize') { const next = work; work = g.orig; change(next); }
        render();
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
      svg.addEventListener('pointerleave', () => { if (!gesture) { eraserAt = null; render(); } });

      svg.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && !e.metaKey && tool !== 'hand') return; // let the page scroll normally
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) { const [x, y] = toCanvas(e); zoomAt(Math.exp(-e.deltaY * 0.01), x, y); }
        else { view.x += e.deltaX / view.s; view.y += e.deltaY / view.s; clampView(); render(); }
      }, { passive: false });

      dom.addEventListener('keydown', (e) => {
        const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase();
        if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); renderBar(); render(); }
        else if (mod && k === 'y') { e.preventDefault(); doRedo(); renderBar(); render(); }
        else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) { e.preventDefault(); deleteSelection(); renderBar(); render(); }
        else if (e.key === 'Escape' && selected.length) { selected = []; renderBar(); render(); }
      });

      const ro = new ResizeObserver(() => render());
      ro.observe(svg);
      renderBar(); render();

      return {
        dom,
        update(next) {
          if (next.type !== current.type) return false;
          current = next;
          if (!gesture) { work = saved(); selected = selected.filter((i) => i < work.length); renderBar(); render(); }
          return true;
        },
        stopEvent: () => true,
        ignoreMutation: () => true,
        destroy: () => ro.disconnect(),
      };
    };
  },
});
