// Word count: total, selection, update on typing.
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
  await a.click('.empty-state >> text=New note'); await a.fill('.note-title', 'Count');
  await a.click('.ProseMirror'); await a.keyboard.type('One two three four five.');
  await a.waitForTimeout(300); results.total = await a.locator('.word-count').textContent();
  await a.keyboard.press('Shift+Home'); await a.waitForTimeout(300);
  results.allSelected = await a.locator('.word-count').textContent();
  await a.keyboard.press('End'); for (let i = 0; i < 11; i++) await a.keyboard.press('Shift+ArrowLeft');
  await a.waitForTimeout(300); results.partSelected = await a.locator('.word-count').textContent();
  await a.keyboard.press('End'); await a.waitForTimeout(300); results.afterDeselect = await a.locator('.word-count').textContent();
  await a.screenshot({ path: OUT + 'wordcount.png' });
  const m = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await m.newPage(); await setup(p);
  await p.goto('http://localhost:4173/'); await p.waitForSelector('.note-list, .sidebar', { state: 'attached' }); await p.waitForTimeout(800);
  results.mobileOverflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(JSON.stringify(results, null, 1)); console.log('ERRORS:', errors);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
