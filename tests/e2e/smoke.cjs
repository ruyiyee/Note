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

  // ---- Device A (desktop) ----
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const a = await ctxA.newPage(); await setup(a);
  await a.goto('http://localhost:4173/'); await a.waitForSelector('.sidebar', { timeout: 10000 });
  results.sections = await a.locator('.sidebar-scroll > .nav-item').allTextContents();

  // folder -> notebook -> note
  await a.click('text=New folder'); await dialog(a, 'University');
  await a.click('.list >> text=New notebook'); await dialog(a, 'Biology');
  await a.click('.list >> text=New note');
  await a.fill('.note-title', 'Cell structure');
  await a.click('.ProseMirror'); await a.keyboard.type('Mitochondria are the powerhouse of the cell. ');
  await a.keyboard.down('Shift'); for (let i = 0; i < 10; i++) await a.keyboard.press('ArrowLeft'); await a.keyboard.up('Shift');
  await a.click('.swatch >> nth=2');
  await a.keyboard.press('End');
  await a.click('.tb:has-text("Draw")');
  const box = await a.locator('.drawing svg').boundingBox();
  await a.mouse.move(box.x + 60, box.y + 60); await a.mouse.down();
  for (let i = 1; i <= 20; i++) await a.mouse.move(box.x + 60 + i * 14, box.y + 60 + Math.sin(i / 2) * 40);
  await a.mouse.up();
  await a.waitForTimeout(2500);
  const note = [...server.notes.values()].find((n) => n.title === 'Cell structure');
  const json = JSON.stringify(note?.content ?? {});
  results.noteOnServer = !!note && note.content_text.includes('Mitochondria');
  results.noteInNotebook = !!note && server.folders.get(note.folder_id)?.name === 'Biology' && !!server.folders.get(note.folder_id)?.parent_id;
  results.highlightSaved = json.includes('"highlight"') && json.includes('#f7bcd0');
  results.drawingSaved = /"type":"drawing".*"p":\[/.test(json);
  results.saveState = await a.textContent('.save-state');
  await a.screenshot({ path: OUT + 'desktop.png' });

  // links are disabled
  await a.click('.ProseMirror p >> nth=0'); await a.keyboard.press('End'); await a.keyboard.type(' https://example.com ');
  results.noLinks = (await a.locator('.ProseMirror a').count()) === 0;

  // Summary is removed; history panel opens
  await a.click('.editor-head >> text=More');
  results.noSummaryItem = (await a.locator('.dropdown >> text=Summary').count()) === 0;
  await a.click('.dropdown >> text=Version history');
  results.historyPanel = await a.locator('.side-panel h3').textContent();
  await a.click('.side-panel >> text=Close');

  // PDF export container (print dialog itself is stubbed)
  await a.evaluate(() => { window.print = () => { window.__printed = document.getElementById('print-root').innerHTML; }; });
  await a.click('.editor-head >> text=More'); await a.click('.dropdown >> text=Export PDF'); await a.waitForTimeout(400);
  const printed = await a.evaluate(() => window.__printed || '');
  results.pdfNote = printed.includes('Cell structure') && printed.includes('<path') && printed.includes('<mark');
  await a.evaluate(() => { window.__printed = ''; window.dispatchEvent(new Event('afterprint')); });
  await a.click('.list-actions >> text=Export PDF'); await a.waitForTimeout(400);
  results.pdfNotebook = (await a.evaluate(() => window.__printed || '')).includes('Biology');
  await a.evaluate(() => window.dispatchEvent(new Event('afterprint')));

  // search
  await a.fill('.search input', 'mitochondria'); await a.waitForTimeout(300);
  results.searchHits = await a.locator('.notes li mark').count();
  await a.fill('.search input', '');

  // tasks
  await a.click('.nav-item:has-text("Tasks")');
  await a.fill('input[aria-label="New task"]', 'Buy notebooks'); await a.keyboard.press('Enter');
  await a.fill('input[aria-label="New task"]', 'Email tutor'); await a.keyboard.press('Enter');
  await a.waitForTimeout(300);
  await a.locator('.task input[type=checkbox]').first().click(); await a.waitForTimeout(300);
  await a.screenshot({ path: OUT + 'tasks.png' });

  // calendar
  await a.click('.nav-item:has-text("Calendar")');
  await a.fill('input[aria-label="New calendar entry"]', 'Dentist 3pm'); await a.keyboard.press('Enter');
  await a.waitForTimeout(300);
  results.calendarEntry = await a.locator('.cal-entry:has-text("Dentist 3pm")').count();
  await a.screenshot({ path: OUT + 'calendar.png' });

  // vocabulary
  await a.click('.nav-item:has-text("Vocabulary")');
  await a.click('text=Add word');
  await a.fill('.word-form label:has-text("Word") input', 'ephemeral');
  await a.fill('.word-form label:has-text("Definition") textarea', 'lasting a very short time');
  await a.fill('.word-form label:has-text("Example") textarea', 'Fame is ephemeral.');
  await a.fill('.word-form label:has-text("Personal notes") textarea', 'from Greek ephemeros');
  await a.click('.word-form .primary'); await a.click('.word-card >> text=Done');
  await a.screenshot({ path: OUT + 'vocab.png' });
  await a.click('.tabs >> text=Review'); await a.click('text=Show answer');
  results.flashcardBack = await a.locator('.flashcard .back').textContent();
  await a.screenshot({ path: OUT + 'review.png' });
  await a.click('.grades >> text=Good');
  await a.waitForTimeout(2000);
  const card = [...server.cards.values()][0];
  results.cardOnServer = card?.notes === 'from Greek ephemeros' && card.reps === 1;
  results.itemsOnServer = [...server.items.values()].map((i) => `${i.kind}:${i.title}:${i.done}`).sort();

  // ---- Device B (phone, fresh) ----
  const ctxB = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctxB.newPage(); await setup(p);
  await p.goto('http://localhost:4173/'); await p.waitForTimeout(2500);
  results.deviceBSeesNote = await p.locator('.note-item:has-text("Cell structure")').count();
  await p.screenshot({ path: OUT + 'mobile-list.png' });
  await p.click('.list >> text=Menu'); await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + 'mobile-menu.png' });
  await p.click('.nav-item:has-text("All Notes")');
  await p.click('.note-item:has-text("Cell structure")'); await p.waitForTimeout(600);
  results.deviceBSeesDrawing = await p.locator('.drawing svg path').count();
  await p.screenshot({ path: OUT + 'mobile-editor.png' });
  results.mobileOverflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  // ---- offline edit on A, then reconnect ----
  await a.click('.nav-item:has-text("All Notes")'); await a.click('.note-item:has-text("Cell structure")');
  await ctxA.setOffline(true);
  await a.click('.ProseMirror p >> nth=0'); await a.keyboard.type('Offline edit. '); await a.waitForTimeout(1500);
  results.offlineBadge = await a.textContent('.sync-badge');
  await ctxA.setOffline(false); await a.evaluate(() => window.dispatchEvent(new Event('online'))); await a.waitForTimeout(2500);
  results.offlineEditSynced = [...server.notes.values()].find((n) => n.title === 'Cell structure').content_text.includes('Offline edit');
  await a.reload(); await a.waitForTimeout(1500);
  results.afterReload = await a.locator('.note-item:has-text("Cell structure")').count();

  // ---- dark theme ----
  await a.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await a.click('.note-item:has-text("Cell structure")'); await a.waitForTimeout(300);
  await a.screenshot({ path: OUT + 'dark.png' });

  console.log(JSON.stringify(results, null, 1));
  console.log('ERRORS:', errors);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
