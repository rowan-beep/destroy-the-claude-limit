// node run.cjs <port> <shotsFile> <ids comma|all> <res: preview|1440|8k> <outdir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [port, shotsFile, idsArg, mode, outDir] = process.argv.slice(2);
const shots = require(path.resolve(shotsFile));
(async () => {
  const big = mode === '8k' || mode === '1440';
  const qhd = mode === '1440';
  // (a visible window on the real graphics card; CINE_SOFTWARE=1 renders on the CPU instead, headless)
  const soft = !!process.env.CINE_SOFTWARE;
  const browser = await chromium.launch({
    headless: soft,
    args: soft
      ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=8192']
      : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force_high_performance_gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--js-flags=--max-old-space-size=8192'],
  });
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: qhd ? { width: 1280, height: 720 } : big ? { width: 1920, height: 1080 } : { width: 1280, height: 720 } });
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/CERT|net::/.test(m.text())) console.log('console', m.text().slice(0, 300)); });
  await page.addInitScript(() => { try { sessionStorage.setItem('triad.skipIntro', '1'); localStorage.setItem('triad.seenVersion', '99'); localStorage.setItem('triad.gpuWarned', '1'); localStorage.setItem('triad.program', 'air'); } catch {} });
  await page.goto(`http://localhost:${port}/#map=${shots.map || 'triad'}`, { timeout: 0 });
  for (let i = 0; i < 2000; i++) { if (await page.evaluate(() => !!(window.game && window.game.state === 'menu')).catch(() => false)) break; await page.waitForTimeout(250); }
  await page.addScriptTag({ path: path.join(__dirname, 'lib.js') });
  await page.evaluate(() => { document.querySelectorAll('.perf-warn, .gpu-warn').forEach((e) => e.remove()); });
  const ids = idsArg === 'all' ? Object.keys(shots.list) : idsArg.split(',');
  fs.mkdirSync(outDir, { recursive: true });
  for (const id of ids) {
    const s = shots.list[id];
    if (!s) { console.log('no shot', id); continue; }
    const t0 = Date.now();
    try {
      const cap = await page.evaluate(async ([src, big]) => {
        const fn = eval('(' + src + ')');
        const caption = await fn(window.cine, window.game, window.__THREE, big);
        return caption;
      }, [s.toString(), big]);
      if (big && !qhd) await page.evaluate(() => window.cine.setRes('4320'));
      // (set up small, then only the last frames at 2560 x 1440: software rendering is slow)
      if (qhd) await page.setViewportSize({ width: 2560, height: 1440 });
      await page.evaluate((b) => window.cine.settle(b ? 1500 : 500).catch(() => {}), big);
      const r = await page.evaluate(() => window.cine.capture(0.9));
      const file = path.join(outDir, `${id}.webp`);
      fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
      if (big && !qhd) await page.evaluate(() => window.cine.setRes('native'));
      if (qhd) await page.setViewportSize({ width: 1280, height: 720 });
      console.log(id, `${r.w}x${r.h}`, (fs.statSync(file).size / 1e6).toFixed(2) + 'MB', ((Date.now() - t0) / 1000).toFixed(0) + 's', '|', cap);
    } catch (e) { console.log(id, 'FAILED', e.message.slice(0, 300)); }
  }
  await browser.close();
})();
