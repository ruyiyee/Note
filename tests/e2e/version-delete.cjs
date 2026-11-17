// Version history: delete one version, delete all for a note, delete all history from Settings.
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
  results.emptyState = await a.locator('.empty-title').textContent();
  await a.click('.empty-state >> text=New note'); await a.fill('.note-title', 'History');
  await a.click('.ProseMirror'); await a.keyboard.type('Some text'); await a.waitForTimeout(1500);
  const noteId = [...server.notes.keys()][0];
  const uid = '11111111-1111-1111-1111-111111111111';
  server.note_versions.clear();
  for (let i = 0; i < 3; i++) server.note_versions.set('v' + i, { id: 'v' + i, note_id: noteId, user_id: uid, title: 'History', content: {}, content_text: 'old ' + i, created_at: new Date(Date.now() - i * 3600e3).toISOString(), session_id: 'old', updated_at: new Date(Date.now() - i * 3600e3).toISOString() });
  server.note_versions.set('vx', { id: 'vx', note_id: 'other', user_id: uid, title: 'Other', content: {}, content_text: 'x', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  await a.click('.editor-head >> text=More'); await a.click('.dropdown >> text=Version history');
  await a.waitForSelector('.version'); results.listed = await a.locator('.version').count();
  await a.click('.version >> nth=1'); await a.click('text=Delete this version'); await a.click('.dialog .primary');
  await a.waitForTimeout(300); results.afterDeleteOne = await a.locator('.version').count();
  await a.screenshot({ path: OUT + 'history.png' });
  await a.click('text=Delete all versions of this note'); await a.click('.dialog .primary');
  await a.waitForTimeout(300); results.afterDeleteAll = await a.locator('.version').count();
  results.otherNoteKept = server.note_versions.has('vx');
  await a.click('.side-panel >> text=Close');
  await a.click('text=Settings'); await a.click('text=Delete all version history'); await a.click('.dialog .primary');
  await a.waitForTimeout(400); results.settingsMsg = await a.locator('.modal p.small').last().textContent();
  results.deletes = deletes;
  console.log(JSON.stringify(results, null, 1)); console.log('ERRORS:', errors);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
