// Drawing tools show only while editing the drawing.
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

  const ctxA = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const a = await ctxA.newPage(); await setup(a);
  await a.goto('http://localhost:4173/'); await a.waitForSelector('.sidebar', { timeout: 10000 });
  results.emptyState = await a.locator('.empty-title').textContent();
  await a.click('.empty-state >> text=New note'); await a.waitForTimeout(500); await a.fill('.note-title', 'Sketch');
  await a.click('.ProseMirror'); await a.keyboard.type('Above the drawing.');
  await a.click('.toolbar >> text=Draw'); await a.waitForSelector('.drawing svg');
  const barShown = () => a.locator('.drawing-bar').isVisible();
  const strokes = () => a.locator('.drawing svg path').count();
  results.newDrawingToolsShown = await barShown();
  const box = await a.locator('.drawing svg').boundingBox();
  await a.mouse.move(box.x + 50, box.y + 50); await a.mouse.down(); await a.mouse.move(box.x + 150, box.y + 90, { steps: 8 }); await a.mouse.up();
  results.strokesAfterDraw = await strokes();
  await a.click('.ProseMirror p:has-text("Above")'); await a.waitForTimeout(200);
  results.toolsAfterClickOutside = await barShown();
  const b2 = await a.locator('.drawing svg').boundingBox();
  await a.mouse.click(b2.x + 200, b2.y + 120); await a.waitForTimeout(200);
  results.toolsAfterTap = await barShown(); results.tapAddedNoStroke = (await strokes()) === results.strokesAfterDraw;
  results.svgMovedPx = Math.round((await a.locator('.drawing svg').boundingBox()).y - b2.y);
  await a.screenshot({ path: OUT + 'draw-active.png' });
  await a.click('.drawing-bar >> text=Done'); await a.waitForTimeout(200); results.toolsAfterDone = await barShown();
  await a.screenshot({ path: OUT + 'draw-done.png' });
  await a.mouse.click(b2.x + 200, b2.y + 120); await a.waitForTimeout(200); await a.keyboard.press('Escape'); await a.waitForTimeout(200);
  results.toolsAfterEscape = await barShown();
  console.log(JSON.stringify(results, null, 1)); console.log('ERRORS:', errors);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
