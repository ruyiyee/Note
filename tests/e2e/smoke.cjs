const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const server = { notes: new Map(), folders: new Map(), cards: new Map(), attachments: new Map() };
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
  // Device A
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await ctxA.newPage(); await setup(a);
  await a.goto('http://localhost:4173/'); await a.waitForSelector('.sidebar', { timeout: 10000 });
  await a.click('text=＋ New note'); await a.click('.template >> text=Lecture / academic notes');
  await a.fill('.note-title', 'Biology lecture');
  await a.click('.ProseMirror'); await a.keyboard.press('End'); await a.keyboard.type(' Mitochondria :: powerhouse of the cell');
  await a.waitForTimeout(2500);
  await a.screenshot({ path: 'tests/e2e/out-desktop.png' });
  const synced = [...server.notes.values()].find((n) => n.title === 'Biology lecture');
  console.log('server has note:', !!synced, synced && synced.content_text.includes('Mitochondria'));
  console.log('badge:', await a.textContent('.sync-badge'), '| state:', await a.textContent('.save-state'));
  // search
  await a.fill('.search input', 'mitochondria'); await a.waitForTimeout(300);
  console.log('search hits:', await a.locator('.notes li mark').count());
  await a.fill('.search input', '');
  // study panel
  await a.click('button[title="Study: summary & flashcards"]'); await a.waitForTimeout(300);
  console.log('cards generated:', await a.locator('.gen-card').count());
  await a.click('text=Save as flashcards'); await a.waitForTimeout(1500);
  // other views
  for (const v of ['Tasks', 'Calendar', 'Connections', 'Vocabulary & review', 'Trash', 'All notes']) { await a.click(`.nav-item:has-text("${v}")`); await a.waitForTimeout(300); }
  await a.click('.nav-item:has-text("Vocabulary & review")'); await a.waitForTimeout(300);
  await a.screenshot({ path: 'tests/e2e/out-vocab.png' });
  console.log('server cards:', server.cards.size);
  // Device B (fresh) sees the note
  const ctxB = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const bp = await ctxB.newPage(); await setup(bp);
  await bp.goto('http://localhost:4173/'); await bp.waitForTimeout(2500);
  console.log('device B sees note:', await bp.locator('.note-item:has-text("Biology lecture")').count());
  await bp.screenshot({ path: 'tests/e2e/out-mobile-list.png' });
  await bp.click('.note-item:has-text("Biology lecture")'); await bp.waitForTimeout(500);
  await bp.screenshot({ path: 'tests/e2e/out-mobile-editor.png' });
  // Offline on A
  await ctxA.setOffline(true); await a.click('.nav-item:has-text("All notes")'); await a.click('.note-item:has-text("Biology lecture")');
  await a.click('.ProseMirror'); await a.keyboard.type(' offline edit'); await a.waitForTimeout(1500);
  console.log('offline badge:', await a.textContent('.sync-badge'));
  await ctxA.setOffline(false); await a.evaluate(() => window.dispatchEvent(new Event('online'))); await a.waitForTimeout(2500);
  const n2 = [...server.notes.values()].find((n) => n.title === 'Biology lecture');
  console.log('after reconnect server has offline edit:', n2.content_text.includes('offline edit'), '| badge:', await a.textContent('.sync-badge'));
  // reload A, persistence locally
  await a.reload(); await a.waitForTimeout(1500);
  console.log('after reload note present:', await a.locator('.note-item:has-text("Biology lecture")').count());
  console.log('ERRORS:', errors);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
