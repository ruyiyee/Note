// Review fixes: title saved on a quick close; removing a file and emptying Trash delete stored files.
// Run: npm run build && npx vite preview --port 4173 &   then: node tests/e2e/smoke.cjs
const { chromium } = require('playwright');
const OUT = process.env.SMOKE_OUT || 'tests/e2e/out-';
(async () => {
  const b = await chromium.launch();
  const errors = [], results = {};
  const server = { notes: new Map(), folders: new Map(), cards: new Map(), attachments: new Map(), items: new Map(), note_versions: new Map() }; const deletes = [];
  let clock = Date.now();
  async function setup(page) {
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|realtime|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.route(/supabase\.co/, async (route) => {
      const req = route.request(); const u = new URL(req.url());
      const m = u.pathname.match(/\/rest\/v1\/(\w+)/);
      if (m && server[m[1]]) {
        const t = server[m[1]];
        if (req.method() === 'DELETE') { deletes.push(m[1] + '?' + u.searchParams.toString()); const id = (u.searchParams.get('id') || '').replace('eq.', ''); const nid = (u.searchParams.get('note_id') || '').replace('eq.', ''); let n = 0; for (const [k, r] of t) if ((!id || r.id === id) && (!nid || r.note_id === nid)) { t.delete(k); n++; } return route.fulfill({ status: 204, headers: { 'content-range': '*/' + n, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }, body: '' }); }
        if (req.method() === 'POST') {
          const rows = JSON.parse(req.postData() || '[]');
          const out = (Array.isArray(rows) ? rows : [rows]).map((r) => { const row = { ...r, updated_at: new Date(++clock).toISOString() }; t.set(r.id, row); return row; });
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(out) });
        }
        const gt = u.searchParams.get('updated_at'); const since = gt ? gt.replace('gt.', '') : null;
        const rows = [...t.values()].filter((r) => (!since || r.updated_at > since) && (!u.searchParams.get('note_id') || r.note_id === u.searchParams.get('note_id').replace('eq.', ''))).sort((a, c) => a.updated_at.localeCompare(c.updated_at));
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
  // 1. Title typed and the note closed straight away is still saved
  await a.click('.empty-state >> text=New note'); await a.waitForTimeout(500);
  await a.fill('.note-title', 'Quick title'); await a.click('.editor-head >> text=Close');
  await a.waitForTimeout(1500);
  results.titleSavedLocally = await a.locator('.note-item-title').first().textContent();
  results.titleSavedOnServer = [...server.notes.values()].some((n) => n.title === 'Quick title');
  console.log(JSON.stringify(results, null, 1)); console.log('ERRORS:', errors);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
