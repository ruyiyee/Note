// Run with the dev server: npx vite --port 5179 &  then: node tests/e2e/shrink-image.cjs
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://localhost:5179/'); await p.waitForTimeout(1000);
  const r = await p.evaluate(async () => {
    const { shrinkImage } = await import('/src/lib/image.ts');
    const make = async (w, h, type, noisy) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#e86a92'); g.addColorStop(1, '#1f2a44'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      if (noisy) { const d = x.getImageData(0, 0, w, h); for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - .5) * 60; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } x.putImageData(d, 0, 0); }
      x.fillStyle = '#fff'; x.font = '120px sans-serif'; x.fillText('Whiteboard text', 200, 600);
      const blob = await new Promise((res) => c.toBlob(res, type, 0.98));
      return new File([blob], 'photo.' + (type === 'image/png' ? 'png' : 'jpg'), { type });
    };
    const out = {};
    for (const [label, f] of [['phone photo 4032x3024 jpeg', await make(4032, 3024, 'image/jpeg', true)], ['screenshot 2880x1800 png', await make(2880, 1800, 'image/png', false)], ['small 800x600 jpeg', await make(800, 600, 'image/jpeg', true)]]) {
      const s = await shrinkImage(f);
      const bmp = await createImageBitmap(s);
      out[label] = `${(f.size / 1e6).toFixed(2)} MB -> ${(s.size / 1e6).toFixed(2)} MB, ${bmp.width}x${bmp.height}, ${s.type}, unchanged=${s === f}`;
    }
    const gif = new File([new Uint8Array([71, 73, 70])], 'a.gif', { type: 'image/gif' });
    out.gif = (await shrinkImage(gif)) === gif ? 'unchanged' : 'changed';
    const pdf = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
    out.pdf = (await shrinkImage(pdf)) === pdf ? 'unchanged' : 'changed';
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); await b.close();
})();
