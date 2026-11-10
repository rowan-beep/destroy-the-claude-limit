// node tools/jetview/view.cjs --type FA18EF [--port 5190] [--ppm 80] [--out dir] [--hero] [--gear] [--stores] [--persp]
// Renders one jet model on its own: orthographic views (shaded and silhouette) and, with --persp, beauty shots.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
(async () => {
  const type = opt('type', 'FA18EF');
  const out = path.resolve(opt('out', 'jetview-out'));
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: flag('gpu') ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: !flag('gpu') });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${opt('port', '5190')}/tools/jetview/view.html`, { timeout: 0 });
  for (let i = 0; i < 1200; i++) { if (await page.evaluate(() => !!window.jetviewReady).catch(() => false)) break; await page.waitForTimeout(250); }
  const o = { type, ppm: +opt('ppm', '80'), hero: flag('hero'), gear: flag('gear'), stores: flag('stores') };
  const save = (name, url) => fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  if (!flag('persp-only')) {
    const r = await page.evaluate((o) => window.jetview(o), o);
    for (const k of Object.keys(r)) if (k !== 'meta') save(k, r[k]);
    fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(r.meta, null, 1));
    console.log(type, JSON.stringify(r.meta));
  }
  if (flag('persp') || flag('persp-only')) {
    const shots = [
      ['p_front34', [-0.62, 0.3, -0.78], [0, 0, -1], 24],
      ['p_rear34', [0.66, 0.34, 0.86], [0, 0, 1], 24],
      ['p_low_front', [-0.5, -0.12, -0.9], [0, 0.3, -1], 24],
      ['p_top34', [-0.35, 0.9, -0.45], [0, 0, 0], 26],
    ];
    const r = await page.evaluate((o) => window.jetpersp(o), Object.assign({ w: +opt('pw', '1280'), h: +opt('ph', '720'), shots }, o, { stores: !flag('nostores'), hero: true }));
    for (const k of Object.keys(r)) save(k, r[k]);
  }
  await browser.close();
})();
