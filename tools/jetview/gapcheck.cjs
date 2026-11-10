// node tools/jetview/gapcheck.cjs [--port 5190] [--limit 0.03] TYPE [TYPE ...]
// Reports, for each jet, how far its canopy sill floats above the fuselage skin (see canopygap in view.ts).
const { chromium } = require('playwright');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const types = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(`http://localhost:${opt('port', '5190')}/tools/jetview/view.html`, { timeout: 0 });
  for (let i = 0; i < 1200; i++) { if (await page.evaluate(() => !!window.jetviewReady).catch(() => false)) break; await page.waitForTimeout(250); }
  const limit = +opt('limit', '0.03');
  for (const type of types) {
    const r = await page.evaluate((type) => window.canopygap({ type, ppm: 50 }), type);
    const g = r.samples.filter((s) => s.gap !== null);
    const worst = g.slice().sort((a, b) => b.gap - a.gap).slice(0, 4);
    const holes = r.samples.filter((s) => s.gap === null).length;
    const floating = g.filter((s) => s.gap > limit);
    console.log(`${type}: ${g.length} samples, worst gap ${worst[0] ? worst[0].gap : '-'} m at z ${worst[0] ? worst[0].z : '-'}, ${floating.length} over ${limit} m, ${holes} with no skin below`);
    for (const w of worst.filter((w) => w.gap > limit)) console.log(`    z ${w.z} x ${w.x}: rail ${w.rail}, skin ${w.hit}, gap ${w.gap}`);
  }
  await browser.close();
})();
