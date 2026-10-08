// node runocean.cjs <port> <shotsFile> <ids|all> <preview|1440|8k> <outdir>
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
  const ids = idsArg === 'all' ? Object.keys(shots.list) : idsArg.split(',');
  fs.mkdirSync(outDir, { recursive: true });
  for (const id of ids) {
    const s = shots.list[id];
    if (!s) { console.log('no shot', id); continue; }
    // (a fresh page for each: the missions keep their state)
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport: qhd ? { width: 1280, height: 720 } : big ? { width: 1920, height: 1080 } : { width: 1280, height: 720 } });
    page.setDefaultTimeout(0);
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    await page.addInitScript(() => { try { sessionStorage.setItem('triad.skipIntro', '1'); localStorage.setItem('triad.program', 'ocean'); localStorage.setItem('triad.seenVersion', '99'); localStorage.setItem('triad.space.seenVersion', '99'); localStorage.setItem('triad.ocean.seenVersion', '99'); localStorage.setItem('triad.gpuWarned', '1'); } catch {} });
    await page.goto(`http://localhost:${port}/`, { timeout: 0 });
    for (let i = 0; i < 2000; i++) { if (await page.evaluate(() => !!(window.game && window.game.state === 'menu' && window.__ocean && window.__dive)).catch(() => false)) break; await page.waitForTimeout(250); }
    const t0 = Date.now();
    try {
      await page.evaluate(() => {
        const g = window.game;
        Object.assign(g.settings.graphics, { quality: 'ultra', resolution: 'native', resolutionScale: 1, antialias: 4, shadows: 'ultra', terrainLighting: true, lightScattering: true, cloudQuality: 'ultra', cloudShadows: true, bloom: 0.65, autoRes: false });
        g.applySettings();
        // the page's own panels out of the picture (only the canvas is captured anyway)
        window.wait = (ms) => new Promise((r) => setTimeout(r, ms));
      });
      const cap = await page.evaluate(async (src) => {
        const fn = eval('(' + src + ')');
        return await fn(window.game);
      }, s.toString());
      if (qhd) await page.setViewportSize({ width: 2560, height: 1440 });
      if (big && !qhd) await page.evaluate(() => { const g = window.game; g.settings.graphics.resolution = '4320'; g.applySettings(); });
      await page.waitForTimeout(big ? 4000 : 2500);
      const r = await page.evaluate(() => new Promise((res) => {
        requestAnimationFrame(() => {
          const c = window.game.renderer.canvas;
          c.toBlob(async (b) => {
            const buf = new Uint8Array(await b.arrayBuffer());
            let s = '';
            for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
            res({ w: c.width, h: c.height, b64: btoa(s) });
          }, 'image/webp', 0.9);
        });
      }));
      const file = path.join(outDir, `${id}.webp`);
      fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
      console.log(id, `${r.w}x${r.h}`, (fs.statSync(file).size / 1e6).toFixed(2) + 'MB', ((Date.now() - t0) / 1000).toFixed(0) + 's', '|', cap);
    } catch (e) { console.log(id, 'FAILED', e.message.slice(0, 300)); }
    await page.close();
  }
  await browser.close();
})();
