// Browser smoke test against a simulated Supabase API (no real backend needed).
// Run: npm run build && npx vite preview --port 4173 &   then: node tests/e2e/smoke.cjs
const { chromium } = require('playwright');
const OUT = process.env.SMOKE_OUT || 'tests/e2e/out-';
(async () => {
  const b = await chromium.launch();
  const errors = [], results = {};
  const server = { notes: new Map(), folders: new Map(), cards: new Map(), attachments: new Map(), items: new Map() };
  let clock = Date.now();
  async function setup(page) {
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|realtime|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.route(/supabase\.co/, async (route) => {
      const req = route.request(); const u = new URL(req.url());
      const m = u.pathname.match(/\/rest\/v1\/(\w+)/);
      if (m && server[m[1]]) {
        const t = server[m[1]];
        if (req.method() === 'POST') {
          const rows = JSON.parse(req.postData() || '[]');
          const out = (Array.isArray(rows) ? rows : [rows]).map((r) => { const row = { ...r, updated_at: new Date(++clock).toISOString() }; t.set(r.id, row); return row; });
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(out) });
        }
        const gt = u.searchParams.get('updated_at'); const since = gt ? gt.replace('gt.', '') : null;
        const rows = [...t.values()].filter((r) => !since || r.updated_at > since).sort((a, c) => a.updated_at.localeCompare(c.updated_at));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const session = { access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '11111111-1111-1111-1111-111111111111', email: 'test@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
    await page.addInitScript((s) => localStorage.setItem('sb-pzicihpblasulpnxwtry-auth-token', JSON.stringify(s)), session);
  }
  const dialog = async (page, text) => { await page.fill('.dialog input', text); await page.click('.dialog .primary'); };

  const ctxA = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const a = await ctxA.newPage(); await setup(a);
  await a.goto('http://localhost:4173/'); await a.waitForSelector('.sidebar', { timeout: 10000 });
  await a.click('.list >> text=New note');
  await a.fill('.note-title', 'Sketch test');
  await a.click('.ProseMirror'); await a.keyboard.type('Page one text.');
  await a.click('.tb:has-text("Draw")');
  const svg = a.locator('.drawing svg');
  let box = await svg.boundingBox();
  const stroke = async (x0, y0, x1, y1, steps = 30) => { await a.mouse.move(box.x + x0, box.y + y0); await a.mouse.down(); for (let i = 1; i <= steps; i++) await a.mouse.move(box.x + x0 + (x1 - x0) * i / steps, box.y + y0 + (y1 - y0) * i / steps); await a.mouse.up(); };
  const strokes = async () => (await a.evaluate(() => JSON.parse(document.querySelector('.drawing')?.getAttribute('data-strokes') ?? 'null'))) ;
  const model = async () => a.evaluate(() => document.querySelectorAll('.drawing svg g:first-child path').length);
  await stroke(50, 80, 450, 80);     // horizontal line
  await stroke(50, 200, 200, 200);   // short line lower down
  results.afterDraw = await model();
  // eraser: cut the middle of the first line
  await a.click('.drawing-bar >> text=Eraser');
  results.eraserSizeSelect = await a.locator('.drawing-bar select').count();
  await a.selectOption('.drawing-bar select', '28');
  await a.mouse.move(box.x + 250, box.y + 60); await a.mouse.down(); await a.mouse.move(box.x + 250, box.y + 100, { steps: 5 }); await a.mouse.up();
  results.afterErase = await model();
  const widths = await a.evaluate(() => [...document.querySelectorAll('.drawing svg g:first-child path')].map((p) => p.getAttribute('stroke-width')));
  results.widthsUnchanged = widths.every((w) => w === '2.5');
  await a.screenshot({ path: OUT + 'erase.png' });
  await a.click('.drawing-bar >> text=Undo'); results.afterUndo = await model();
  await a.click('.drawing-bar >> text=Redo'); results.afterRedo = await model();
  await a.click('.drawing-bar >> text=Undo');
  // lasso the lower line, move it, then delete it
  await a.click('.drawing-bar >> text=Lasso');
  await a.mouse.move(box.x + 30, box.y + 180); await a.mouse.down();
  for (const [x, y] of [[230, 180], [230, 230], [30, 230], [30, 182]]) await a.mouse.move(box.x + x, box.y + y, { steps: 6 });
  await a.mouse.up();
  results.lassoSelected = await a.locator('.drawing .sel-box').count();
  const before = await a.evaluate(() => document.querySelectorAll('.drawing svg g:first-child path')[1].getAttribute('d'));
  await a.mouse.move(box.x + 120, box.y + 200); await a.mouse.down(); await a.mouse.move(box.x + 170, box.y + 260, { steps: 6 }); await a.mouse.up();
  const after = await a.evaluate(() => document.querySelectorAll('.drawing svg g:first-child path')[1].getAttribute('d'));
  results.lassoMoved = before !== after;
  await a.screenshot({ path: OUT + 'lasso.png' });
  await a.click('.drawing-bar >> text=Delete selection'); results.afterLassoDelete = await model();
  await a.click('.drawing-bar >> text=Undo'); results.afterUndoDelete = await model();
  // zoom
  await a.click('.drawing-bar >> text=Zoom in');
  results.zoomLabel = await a.locator('.drawing-bar button:has-text("%")').textContent();
  results.viewBox = await svg.getAttribute('viewBox');
  await a.click('.drawing-bar button:has-text("%")');
  // pages
  await a.click('.ProseMirror > p >> nth=-1'); await a.click('.tb:has-text("New page")'); await a.keyboard.type('Second page text.');
  await a.click('.tb:has-text("New page")'); await a.keyboard.type('Third page text.');
  results.pageLabels = await a.evaluate(() => [...document.querySelectorAll('.ProseMirror .page-break')].map((el) => getComputedStyle(el, '::after').content));
  await a.fill('#page-jump', '3'); await a.keyboard.press('Enter'); await a.waitForTimeout(600);
  results.scrolledForPage3 = await a.evaluate(() => document.querySelector('.editor-scroll').scrollTop > 0);
  // full width
  const w0 = await a.locator('.doc').evaluate((el) => el.getBoundingClientRect().width);
  await a.click('text=Full width'); await a.waitForTimeout(200);
  const w1 = await a.locator('.doc').evaluate((el) => el.getBoundingClientRect().width);
  results.fullWidth = `${Math.round(w0)}px -> ${Math.round(w1)}px of 1440`;
  await a.screenshot({ path: OUT + 'fullwidth.png' });
  await a.click('text=Exit full width');
  // autosave + reopen
  await a.waitForTimeout(2500);
  const saved = [...server.notes.values()].find((n) => n.title === 'Sketch test');
  const dnode = saved.content.content.find((n) => n.type === 'drawing');
  results.serverStrokes = dnode?.attrs.strokes.length;
  results.serverPages = saved.content.content.filter((n) => n.type === 'pageBreak').length + 1;
  await a.reload(); await a.waitForSelector('.note-item');
  await a.click('.note-item:has-text("Sketch test")'); await a.waitForTimeout(500);
  results.afterReopenStrokes = await model();
  results.afterReopenPages = await a.locator('.ProseMirror .page-break').count() + 1;
  await a.screenshot({ path: OUT + 'reopen.png' });
  // PDF content
  await a.evaluate(() => { window.print = () => { window.__printed = document.getElementById('print-root').innerHTML; }; });
  await a.click('.editor-head >> text=More'); await a.click('.dropdown >> text=Export PDF'); await a.waitForTimeout(400);
  results.pdfHasPagesAndDrawing = await a.evaluate(() => (window.__printed || '').includes('page-break') && (window.__printed || '').includes('<path'));
  console.log(JSON.stringify(results, null, 1));
  console.log('ERRORS:', errors);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
