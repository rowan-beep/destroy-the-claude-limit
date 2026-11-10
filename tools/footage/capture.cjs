// Records in-game dogfight footage, one picture per frame, for a video editor.
//
//   node tools/footage/capture.cjs [options]
//     --port 5173        the dev server (npm run dev)
//     --seconds 30       length of the clip
//     --fps 30           frames per second of the clip
//     --size 1920x1080   picture size
//     --skip 25          seconds of the fight to fast-forward before recording starts
//     --jet F22          your jet (every jet in the game works)
//     --time dusk        dawn, morning, noon, afternoon or dusk
//     --out frames       output folder (a subfolder per clip)
//     --name clip1       the clip's name
//     --software         draw on the CPU (a slow test; the default is your graphics card)
//
// The game is stepped one frame at a time, so the video is smooth however slow the picture is
// to draw. Every jet in the fight, yours included, is flown by the game's AI pilots.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const port = opt('port', '5173');
const seconds = +opt('seconds', '30');
const fps = +opt('fps', '30');
const [W, H] = opt('size', '1920x1080').split('x').map(Number);
const skip = +opt('skip', '25');
const jet = opt('jet', 'F22');
const tod = opt('time', 'dusk');
const name = opt('name', 'clip1');
const outDir = path.resolve(opt('out', 'frames'), name);

(async () => {
  const soft = flag('software');
  const browser = await chromium.launch({
    headless: soft,
    args: soft
      ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
      : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force_high_performance_gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: W, height: H } });
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.addInitScript(() => { try { sessionStorage.setItem('triad.skipIntro', '1'); localStorage.setItem('triad.seenVersion', '99'); localStorage.setItem('triad.gpuWarned', '1'); localStorage.setItem('triad.program', 'air'); } catch {} });
  console.log('opening the game...');
  await page.goto(`http://localhost:${port}/`, { timeout: 0 });
  for (let i = 0; i < 4000; i++) { if (await page.evaluate(() => !!(window.game && window.game.state === 'menu')).catch(() => false)) break; await page.waitForTimeout(250); }

  console.log('starting the dogfight...');
  await page.evaluate(async ([jet, tod, W, H]) => {
    const g = window.game;
    const { defaultMission } = await import('/src/game/mission.ts');
    const { AIPilot } = await import('/src/ai/pilot.ts');
    const { duelSkill } = await import('/src/ai/skill.ts');
    document.querySelectorAll('.menu-root, .perf-warn, .gpu-warn').forEach((e) => e.classList.add('hidden'));
    Object.assign(g.settings.graphics, { quality: 'ultra', resolution: 'native', resolutionScale: 1, antialias: 4, shadows: 'ultra', terrainLighting: true, bloom: 0.65, lightScattering: true, cloudQuality: 'ultra', cloudShadows: true, autoRes: false, vignette: true });
    const cfg = Object.assign(defaultMission(), { mode: 'team', aircraft: jet, timeOfDay: tod, difficulty: 'HARD', teamAllies: 'mixed' });
    await g.startMission(cfg, () => {});
    if (g.state === 'briefing') g.acceptBriefing();
    g.running = false; // (from here the script draws every frame itself)
    g.applySettings();
    // the player's jet is flown by an AI pilot too
    const p = g.player;
    p.ai = new AIPilot(p, duelSkill('HARD'), g.picture);
    g.hud.root.style.display = 'none';
    window.__shot = { g, mode: 'chase', next: 0, t: 0 };
  }, [jet, tod, W, H]);

  // the camera: mostly behind the jet, now and then a fly-by
  const frame = (dt, shoot) => page.evaluate(async ([dt, shoot]) => {
    const s = window.__shot, g = s.g;
    s.t += dt;
    if (shoot && s.t >= s.next) {
      s.mode = s.mode === 'chase' && Math.random() < 0.4 ? 'flyby' : 'chase';
      s.next = s.t + 3.5 + Math.random() * 3;
      if (g.cam.mode !== 'weapon' && g.cam.mode !== 'death') g.cam.setMode(s.mode);
    }
    g.frame(dt);
    if (!shoot) return null;
    const c = g.renderer.canvas;
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let b = '';
    for (let i = 0; i < buf.length; i += 0x8000) b += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(b);
  }, [dt, shoot]);

  const dt = 1 / fps;
  console.log(`fast-forwarding ${skip}s...`);
  for (let i = 0; i < skip * 30; i++) await frame(1 / 30, false);
  fs.mkdirSync(outDir, { recursive: true });
  const n = Math.round(seconds * fps);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const b64 = await frame(dt, true);
    fs.writeFileSync(path.join(outDir, String(i + 1).padStart(5, '0') + '.png'), Buffer.from(b64, 'base64'));
    if (i % fps === 0) console.log(`frame ${i + 1}/${n}  (${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)} s per frame)`);
  }
  console.log('done:', outDir);
  await browser.close();
})();
