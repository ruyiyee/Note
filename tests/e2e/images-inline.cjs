// Images: placed inline (not listed under the note), dropped where you drop them, movable by dragging; PDFs listed under Files.
// Run: npm run build && npx vite preview --port 4173 &   then: node tests/e2e/smoke.cjs
const { chromium } = require('playwright');
const OUT = process.env.SMOKE_OUT || 'tests/e2e/out-';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAKElEQVR42u3OMQEAAAgDoK1/aI3hAZ5QIBdHrEgRERERERERERERkW8eRhAAIZoQ+YgAAAAASUVORK5CYII=', 'base64');
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
      if (u.pathname.includes('/storage/v1/object/sign/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: '/storage/v1/object/x?token=t' }) });
      if (u.pathname.includes('/storage/v1/object/x')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      if (u.pathname.includes('/storage/v1/object/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'k' }) });
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
  await a.click('.empty-state >> text=New note'); await a.waitForTimeout(500); await a.fill('.note-title', 'Pics');
  await a.click('.ProseMirror'); const k = a.keyboard;
  await k.type('First paragraph.'); await k.press('Enter'); await k.type('Second paragraph.'); await k.press('Enter'); await k.type('Third paragraph.');
  // Paste an image at the cursor (end of the second paragraph)
  await a.click('.ProseMirror p:has-text("Second")'); await k.press('End');
  await a.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bin], 'pasted.png', { type: 'image/png' }));
    document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG.toString('base64'));
  await a.waitForSelector('.ProseMirror img', { timeout: 8000 }); await a.waitForTimeout(500);
  const order = () => a.evaluate(() => [...document.querySelector('.ProseMirror').children].map((e) => e.tagName === 'IMG' ? 'IMG' : e.textContent.slice(0, 6)));
  results.afterPaste = await order();
  results.filesListAfterImage = await a.locator('.attachments').count();
  // Drop a second image onto the first paragraph
  const box = await a.locator('.ProseMirror p:has-text("First")').boundingBox();
  await a.evaluate(async ({ b64, x, y }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bin], 'dropped.png', { type: 'image/png' }));
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }, { b64: PNG.toString('base64'), x: box.x + 5, y: box.y + box.height / 2 });
  await a.waitForFunction(() => document.querySelectorAll('.ProseMirror img').length === 2, null, { timeout: 8000 }); await a.waitForTimeout(400);
  results.afterDrop = await order();
  // Drag the pasted image (last image) to the end of the note
  const imgs = a.locator('.ProseMirror img'); const src = await imgs.nth(1).boundingBox(); const dst = await a.locator('.ProseMirror p:has-text("Third")').boundingBox();
  await a.mouse.move(src.x + 10, src.y + 10); await a.mouse.down(); await a.mouse.move(src.x + 30, src.y + 30, { steps: 5 });
  await a.mouse.move(dst.x + dst.width - 5, dst.y + dst.height - 2, { steps: 10 }); await a.mouse.up(); await a.waitForTimeout(400);
  results.afterDrag = await order();
  // A PDF still shows under Files
  await a.setInputFiles('input[type=file]', { name: 'worksheet.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await a.waitForSelector('.attachments', { timeout: 8000 }); results.filesList = await a.locator('.attachments').innerText();
  await a.screenshot({ path: OUT + 'images-inline.png' });
  console.log(JSON.stringify(results, null, 1)); console.log('ERRORS:', errors);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
