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
          const out = (Array.isArray(rows) ? rows : [rows]).map((r) => { const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
          const row = sortKeys({ ...r, updated_at: new Date(++clock).toISOString() }); t.set(r.id, row); return row; });
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

  const ctxA = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await ctxA.newPage(); await setup(a);
  await a.goto(process.env.APP_URL || 'http://localhost:4173/'); await a.waitForSelector('.sidebar', { timeout: 10000 });
  await a.click('.empty-state >> text=New note'); await a.fill('.note-title', 'Cursor');
  await a.click('.ProseMirror'); await a.keyboard.type('Intro');
  await a.keyboard.press('Enter'); await a.keyboard.type('- ');
  await a.keyboard.type('Bullet one'); await a.keyboard.press('Enter'); await a.keyboard.type('Bullet two');
  await a.waitForTimeout(1500);
  await a.keyboard.type(' and'); // typed, then leave before autosave fires
  // leave the tab (before autosave fires): focus goes away, then the app syncs on return
  await a.evaluate(() => { document.activeElement.blur(); window.dispatchEvent(new Event('blur')); });
  await a.waitForTimeout(1500);
  await a.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await a.waitForTimeout(2000);
  results.selBeforeReturn = await a.evaluate(() => { const ed = document.querySelector('.ProseMirror').editor; return ed.state.selection.from + '/' + ed.state.doc.content.size; });
  results.serverKeys = Object.keys([...server.notes.values()][0].content).join(',');
  // browser restores focus to the editor where it was
  await a.evaluate(() => document.querySelector('.ProseMirror').focus());
  await a.keyboard.type(' more');
  await a.waitForTimeout(300);
  results.blocks = await a.evaluate(() => [...document.querySelectorAll('.ProseMirror > *')].map((el) => el.tagName + ':' + el.textContent));
  console.log(JSON.stringify(results)); console.log('ERRORS:', errors);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
