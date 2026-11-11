// node tools/jetview/vapor.cjs --type F16C --opts opts.json [--port 5190] [--out dir]
// Flies the jet through a steady hard turn and renders the vapour on it from the shots in opts.json
// (see window.jetvapor in view.ts): { w, h, nz, alpha, tas, seconds, shots: [[name, [x,y,z lengths], [x,y,z m], fov], ...] }
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
(async () => {
  const type = opt('type', 'F16C');
  const out = path.resolve(opt('out', 'vapor-out'));
  fs.mkdirSync(out, { recursive: true });
  const o = JSON.parse(fs.readFileSync(opt('opts'), 'utf8'));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 4000)); });
  await page.goto(`http://localhost:${opt('port', '5190')}/tools/jetview/view.html`, { timeout: 0 });
  for (let i = 0; i < 1200; i++) { if (await page.evaluate(() => !!window.jetviewReady).catch(() => false)) break; await page.waitForTimeout(250); }
  const t0 = Date.now();
  const r = await page.evaluate((arg) => window.jetvapor(arg), Object.assign({ w: 1100, h: 620 }, o, { type }));
  for (const k of Object.keys(r)) fs.writeFileSync(path.join(out, k + '.png'), Buffer.from(r[k].split(',')[1], 'base64'));
  console.log(type, Object.keys(r).length, 'shots in', Math.round((Date.now() - t0) / 1000), 's');
  await browser.close();
})();
