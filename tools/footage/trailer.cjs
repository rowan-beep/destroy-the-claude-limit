// ONE COMMAND: records a 60-second, 9:16 TRIAD trailer from the game itself (on your graphics card)
// and encodes it to a silent MP4 (add your own sound in your editor).
//
//   node tools/footage/trailer.cjs
//
// Nineteen staged shots of 2-5 s (tools/footage/shots.js), each with a short label:
//   the title formation, the cockpit, four jets, a carrier launch and landing, a dogfight (on his tail,
//   missile away, flares, the kill), a five-ship team, an airstrike (release and impact), the tanker,
//   the SR-71, a storm, the mountains, the airshow cobra, the paint shop, and the TRIAD.CHURCH end card.
//
// Options (all optional):
//   --port 5173        the game server (it is started for you if it is not running)
//   --size 1080x1920   picture size (9:16). --size 540x960 is a quick preview
//   --fps 30           frames per second
//   --out frames       where the pictures go (frames/trailer/01-title ...) and the finished video
//   --only cat,kill    record just these shots (then the video is put together from what exists)
//   --stills 3         a quick look: only 3 pictures of each shot (frames/trailer/stills), no video
//   --quality low      draw with the low graphics preset (for a quick look; the default is ultra)
//   --no-encode        only record the pictures
//   --software         draw on the CPU (a very slow test; the default is your graphics card)
//   --my-video <dir>   where Remotion is installed, to borrow its ffmpeg (default: ../my-video)
//   --help

'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const cp = require('child_process');

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const flag = (k) => argv.includes('--' + k);

const PORT = +opt('port', '5173');
const [W, H] = opt('size', '1080x1920').split('x').map(Number);
const FPS = +opt('fps', '30');
const REPO = path.resolve(__dirname, '..', '..');
const OUTROOT = path.resolve(opt('out', 'frames'));
const OUT = path.join(OUTROOT, 'trailer');
const MYVIDEO = path.resolve(opt('my-video', path.join(REPO, '..', 'my-video')));
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const STILLS = +opt('stills', '0');
const PORTRAIT = H > W;
const SC = Math.min(W, H) / 1080; // text sizes scale with the picture

const GFX = {
  ultra: { quality: 'ultra', resolution: 'native', resolutionScale: 1, antialias: 4, shadows: 'ultra', terrainLighting: true, bloom: 0.65, lightScattering: true, cloudQuality: 'ultra', cloudShadows: true, autoRes: false, vignette: true },
  low: { quality: 'low', resolution: 'native', resolutionScale: 1, antialias: 0, shadows: 'off', terrainLighting: false, bloom: 0, lightScattering: false, cloudQuality: 'low', cloudShadows: false, autoRes: false, vignette: true },
}[opt('quality', 'ultra')];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ======================================================================================
// THE CUT: every shot in the order it is shown (60 s in all)
// ======================================================================================

// map: the theater the shot is filmed in (each theater is opened once and films all of its shots)
const SHOTS = [
  { id: 'title', map: 'jade', dur: 4.5, label: '' },
  { id: 'cockpit', map: 'jade', dur: 2.5, label: 'FULL COCKPITS' },
  { id: 'jets', map: 'jade', dur: 5, label: '13 REAL JETS' },
  { id: 'cat', map: 'ocean', dur: 2.5, label: 'CARRIER OPS' },
  { id: 'trap', map: 'ocean', dur: 2.5, label: 'CARRIER OPS' },
  { id: 'merge', map: 'triad', dur: 3, label: 'DOGFIGHTS' },
  { id: 'launch', map: 'triad', dur: 2, label: 'MISSILES' },
  { id: 'flares', map: 'triad', dur: 2.5, label: 'COUNTERMEASURES' },
  { id: 'kill', map: 'triad', dur: 3.5, label: '' },
  { id: 'team', map: 'frost', dur: 2.5, label: '5 v 5 TEAM BATTLES' },
  { id: 'bombs', map: 'frost', dur: 2.5, label: 'AIRSTRIKES' },
  { id: 'impact', map: 'frost', dur: 2.5, label: 'AIRSTRIKES' },
  { id: 'tanker', map: 'triad', dur: 2.5, label: 'AIR REFUELLING' },
  { id: 'recon', map: 'triad', dur: 2.5, label: 'MACH 3 RECON' },
  { id: 'storm', map: 'ocean', dur: 2.5, label: 'ANY WEATHER' },
  { id: 'canyon', map: 'frost', dur: 2.5, label: 'FOUR THEATERS', film: 10.5 },
  { id: 'cobra', map: 'jade', dur: 2.5, label: 'AIRSHOWS' },
  { id: 'hangar', map: 'hangar', dur: 5, label: 'CUSTOMIZE YOUR JET' },
  { id: 'end', map: 'ocean', dur: 7, label: '' },
];
{
  let t = 0;
  SHOTS.forEach((s, i) => {
    s.n = i + 1;
    s.t0 = t;
    t += s.dur;
    s.dir = String(s.n).padStart(2, '0') + '-' + s.id;
  });
}
const TOTAL = SHOTS.reduce((a, s) => a + s.dur, 0);
// the theaters, in the order they are opened
const PAGES = ['jade', 'ocean', 'triad', 'frost', 'hangar'];

// the hangar: what changes when (s into the shot). A paint is a wrap or a solid colour with a finish;
// a load is an index into the jet's loadouts (the F-15EX: 0 everyday, 1 missile truck, 2 strike, ...)
const HANGAR_OPS = [
  { at: 0.7, k: 'paint', p: { wrap: 'inferno', finish: 'gloss' } },
  { at: 1.4, k: 'paint', p: { wrap: 'aurora', finish: 'gloss' } },
  { at: 2.1, k: 'paint', p: { solid: '#d42a1f', finish: 'gloss' } },
  { at: 2.8, k: 'load', i: 1 },
  { at: 3.5, k: 'paint', p: { wrap: 'galaxy', finish: 'metallic' } },
  { at: 4.2, k: 'paint', p: { wrap: 'blackice', finish: 'gloss' } },
];

// ======================================================================================
// TEXT ON THE PICTURES (computed here, drawn in the page)
// ======================================================================================

const ramp = (t, a, b, fi = 0.2, fo = 0.2) => Math.max(0, Math.min(1, (t - a) / fi, (b - t) / fo));
const BIG = PORTRAIT ? 0.88 : 1;

/** what is drawn over the picture at T seconds into the video (the shot being `sc`) */
function overlayFor(sc, T) {
  const lines = [];
  const t = T - sc.t0;
  // the label: it holds across neighbouring shots that share it
  if (sc.label) {
    let a = sc.t0;
    let b = sc.t0 + sc.dur;
    for (let i = sc.n - 2; i >= 0 && SHOTS[i].label === sc.label; i--) a = SHOTS[i].t0;
    for (let i = sc.n; i < SHOTS.length && SHOTS[i].label === sc.label; i++) b = SHOTS[i].t0 + SHOTS[i].dur;
    lines.push(
      PORTRAIT
        ? { text: sc.label, align: 'center', y: 0.74, size: 58 * SC, track: 0.14, maxW: 0.88, a: ramp(T, a + 0.1, b - 0.05) }
        : { text: sc.label, x: 0.05, y: 0.87, size: 54 * SC, track: 0.14, a: ramp(T, a + 0.1, b - 0.05) },
    );
  }
  let flash = 0;
  let dim = 0;
  if (sc.id === 'title') {
    lines.push({ text: 'TRIAD', align: 'center', y: 0.3, size: 190 * SC * BIG, track: 0.3, a: ramp(t, 0.5, 4.1, 0.7, 0.5) });
    lines.push({ text: 'AIR COMBAT', align: 'center', y: 0.3 + 0.075, size: 44 * SC * BIG, track: 0.55, w: 600, a: ramp(t, 1.0, 4.1, 0.6, 0.5) });
  } else if (sc.id === 'hangar') {
    let last = -9;
    for (const op of HANGAR_OPS) if (t >= op.at) last = op.at;
    flash = 0.45 * Math.max(0, 1 - (t - last) / 0.18); // a flash on every change
  } else if (sc.id === 'end') {
    dim = 0.38 * Math.max(0, Math.min(1, (t - 1.2) / 1.2));
    lines.push({ text: 'TRIAD', align: 'center', y: 0.36, size: 190 * SC * BIG, track: 0.3, a: ramp(t, 1.6, 99, 0.8, 1) });
    lines.push({ text: 'PLAY IN YOUR BROWSER', align: 'center', y: 0.36 + 0.1, size: 40 * SC * BIG, track: 0.35, w: 600, a: ramp(t, 2.6, 99, 0.7, 1) });
    lines.push({ text: 'TRIAD.CHURCH', align: 'center', y: 0.36 + 0.19, size: 70 * SC * BIG, track: 0.3, a: ramp(t, 3.4, 99, 0.7, 1) });
  }
  // the video opens from black and ends on black; the shots between cut straight
  const fade = Math.max(0, 1 - T / 0.3, 1 - (TOTAL - T) / 0.5);
  return { fade, flash, dim, lines };
}

// ======================================================================================
// CODE THAT RUNS INSIDE THE GAME'S PAGE (each function is sent to the browser as it is)
// ======================================================================================

/** a.W a.H: the picture size. Defines window.__grab(overlay): the game's canvas plus the overlay, as a JPEG (base64). */
async function installGrab(a) {
  const W = a.W;
  const H = a.H;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  const FONT = '"Rajdhani","Segoe UI",system-ui,sans-serif';
  try {
    await Promise.race([document.fonts.load('700 100px Rajdhani'), new Promise((r) => setTimeout(r, 2500))]);
  } catch (e) {
    /* the fallback font will do */
  }
  window.__grab = async (ov) => {
    const g = window.game;
    ctx.globalAlpha = 1;
    // (drawn at once, in the same task as the frame, before the browser can clear the drawing buffer)
    ctx.drawImage(g.renderer.canvas, 0, 0, W, H);
    if (ov) {
      if (ov.dim > 0) {
        ctx.globalAlpha = ov.dim;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      }
      for (const l of ov.lines || []) {
        if (!(l.a > 0.003)) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(1, l.a);
        ctx.font = (l.w || 700) + ' ' + l.size + 'px ' + FONT;
        ctx.fillStyle = l.color || '#eef3f8';
        ctx.shadowColor = 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = l.size * 0.3;
        const sp = Math.round(l.size * (l.track == null ? 0.2 : l.track));
        try {
          ctx.letterSpacing = sp + 'px';
        } catch (e) {
          /* older browsers: no letter spacing */
        }
        ctx.textBaseline = 'middle';
        // long text wraps to the width it is given
        const maxPx = (l.maxW || 0) * W;
        let rows = [l.text];
        if (maxPx > 0) {
          rows = [];
          let cur = '';
          for (const word of l.text.split(' ')) {
            const test = cur ? cur + ' ' + word : word;
            if (cur && ctx.measureText(test).width > maxPx) {
              rows.push(cur);
              cur = word;
            } else cur = test;
          }
          rows.push(cur);
        }
        const lh = l.size * 1.22;
        rows.forEach((row, i) => {
          const y = l.y * H + (i - (rows.length - 1) / 2) * lh;
          if (l.align === 'center') {
            ctx.textAlign = 'center';
            ctx.fillText(row, W / 2 + sp / 2, y);
          } else if (l.align === 'right') {
            ctx.textAlign = 'right';
            ctx.fillText(row, W - l.x * W + sp, y);
          } else {
            ctx.textAlign = 'left';
            ctx.fillText(row, l.x * W, y);
          }
        });
        ctx.restore();
      }
      if (ov.flash > 0) {
        ctx.globalAlpha = Math.min(1, ov.flash);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
      }
      if (ov.fade > 0) {
        ctx.globalAlpha = Math.min(1, ov.fade);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = 1;
    }
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.93));
    const url = await new Promise((r) => {
      const fr = new FileReader();
      fr.onload = () => r(fr.result);
      fr.readAsDataURL(blob);
    });
    return url.slice(url.indexOf(',') + 1);
  };
}

/** o: { type, dur, gfx } the hangar's own camera is replaced by a slow orbit that tightens as the scene goes on */
async function hangarInit(o) {
  const g = window.game;
  const h = window.__hangar;
  const THREE = window.__THREE;
  g.running = false; // (from here the script draws every frame itself)
  document.querySelector('.menu-root')?.classList.add('hidden');
  if (o.gfx) Object.assign(g.settings.graphics, o.gfx);
  g.applySettings();
  const { SPECS } = await import('/src/aircraft/specs.ts');
  const { WRAPS, defaultPaint } = await import('/src/aircraft/models/paint.ts');
  const { HANGAR } = await import('/src/ui/menu/hangarInterior.ts');
  const spec = SPECS[o.type];
  h.userView = true; // (no idle turntable drift)
  h.setJet(o.type, spec.loadouts[0].id);
  for (let i = 0; i < 300 && h.current !== o.type; i++) await new Promise((r) => setTimeout(r, 50));
  h.previewPaint(o.type, { ...defaultPaint(), mode: 'factory' });
  const S = { g, h, THREE, spec, WRAPS, defaultPaint, HANGAR, type: o.type, dur: o.dur, t: 0 };
  window.__hg = S;
  const orig = h.drawWith;
  h.drawWith = (sc, cam) => {
    const t = S.t;
    const T = Math.min(1, t / S.dur);
    const ease = T * T * (3 - 2 * T);
    const yaw = -0.6 + 1.2 * ease;
    const pitch = 0.34 - 0.08 * ease;
    const dist = 21 - 4 * ease;
    const ty = 2.4;
    let x = Math.sin(yaw) * Math.cos(pitch) * dist;
    let y = ty + Math.sin(pitch) * dist;
    let z = -Math.cos(yaw) * Math.cos(pitch) * dist;
    // (inside the building, as the hangar's own camera is)
    x = Math.max(-S.HANGAR.W / 2 + 1.2, Math.min(S.HANGAR.W / 2 - 1.2, x));
    z = Math.max(-S.HANGAR.D / 2 - 6, Math.min(S.HANGAR.D / 2 - 7.5, z));
    y = Math.max(0.6, Math.min(S.HANGAR.H - 3.2, y));
    cam.position.set(x, y, z);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, ty, 0);
    // the lens: a horizontal angle that closes in as the camera does (a tall frame needs a taller lens for the same width)
    const hf = (cam.aspect < 1 ? 52 - 8 * ease : 70 - 18 * ease) * (Math.PI / 180);
    cam.fov = Math.min(95, (2 * Math.atan(Math.tan(hf / 2) / cam.aspect)) * (180 / Math.PI));
    cam.updateProjectionMatrix();
    orig(sc, cam);
  };
}

/** one frame of the hangar; ops: changes to make first ({k:'reset'} | {k:'paint', p} | {k:'load', i}) */
async function hangarFrame(dt, ov, ops) {
  const S = window.__hg;
  for (const op of ops) {
    if (op.k === 'reset') S.t = 0;
    else if (op.k === 'paint') {
      const base = S.defaultPaint();
      const p = op.p;
      let cfg;
      if (p.solid) cfg = { ...base, mode: 'solid', color: p.solid, color2: p.solid, finish: p.finish || 'gloss' };
      else {
        const w = S.WRAPS.find((x) => x.id === p.wrap);
        cfg = { ...base, mode: 'wrap', wrap: p.wrap, color: w.a, color2: w.b, finish: p.finish || 'satin' };
      }
      S.h.previewPaint(S.type, cfg);
    } else if (op.k === 'load') S.h.setJet(S.type, S.spec.loadouts[op.i % S.spec.loadouts.length].id);
  }
  S.t += dt;
  const sz = S.g.renderer.size;
  S.h.render(dt, sz.w, sz.h);
  return ov ? window.__grab(ov) : null;
}

// ======================================================================================
// THE RUNNERS (in this process)
// ======================================================================================

/** put a function (by its source) in the page as window[name], to call every frame */
async function install(page, name, fn) {
  await page.evaluate(([n, src]) => {
    window[n] = (0, eval)('(' + src + ')');
  }, [name, fn.toString()]);
}

/** which frames of a shot are drawn: all of them, or (--stills N) N of them spread through it */
function drawnFrames(total) {
  if (!STILLS) return null;
  const set = new Set();
  for (let k = 0; k < STILLS; k++) set.add(Math.min(total - 1, Math.round(((k + 0.5) / STILLS) * total)));
  return set;
}

let shotStart = 0;
function progress(sc, i, total) {
  if (!STILLS && i % FPS === 0) log(`  ${sc.id}: ${Math.floor(i / FPS)}/${sc.dur} s  (${((Date.now() - shotStart) / 1000).toFixed(0)} s so far)`);
}

/** where a shot's pictures go, and the function that saves the next one */
function sink(sc) {
  if (STILLS) {
    const dir = path.join(OUT, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    let k = 0;
    return (b64) => fs.writeFileSync(path.join(dir, `${sc.dir}-${++k}.jpg`), Buffer.from(b64, 'base64'));
  }
  const dir = path.join(OUT, sc.dir);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  return (b64) => fs.writeFileSync(path.join(dir, String(++n).padStart(5, '0') + '.jpg'), Buffer.from(b64, 'base64'));
}

/** film one staged shot (tools/footage/shots.js) */
async function filmShot(page, sc) {
  const emit = sink(sc);
  const total = Math.round(sc.dur * FPS);
  const drawn = drawnFrames(total);
  const dt = 1 / FPS;
  await page.evaluate(([id, dur]) => window.TR.begin(id, dur), [sc.id, sc.dur]);
  await page.evaluate((ms) => window.TR.settle(ms), STILLS ? 1500 : 3000);
  let pending = 0;
  for (let i = 0; i < total; i++) {
    if (drawn && !drawn.has(i)) {
      pending++;
      continue;
    }
    if (pending) {
      await page.evaluate(([n, d]) => window.TR.skip(n, d), [pending, dt]);
      pending = 0;
    }
    const T = sc.t0 + i / FPS;
    emit(await page.evaluate(([d, ov]) => {
      window.TR.step(d, true);
      return window.__grab(ov);
    }, [dt, overlayFor(sc, T)]));
    progress(sc, i, total);
  }
}

/** film the hangar: the paint shop and the loadouts on the turntable */
async function filmHangar(page, sc) {
  const emit = sink(sc);
  const total = Math.round(sc.dur * FPS);
  const drawn = drawnFrames(total);
  await install(page, '__hangarFrame', hangarFrame);
  await page.evaluate(hangarInit, { type: 'F15EX', dur: sc.dur, gfx: GFX });
  // a few frames first: the paint shaders compile
  for (let i = 0; i < (STILLS ? 3 : 20); i++) {
    await page.evaluate(([dt]) => window.__hangarFrame(dt, null, []), [1 / 30]);
    await page.waitForTimeout(60);
  }
  let next = 0;
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    const ops = i === 0 ? [{ k: 'reset' }] : [];
    while (next < HANGAR_OPS.length && HANGAR_OPS[next].at <= t) ops.push(HANGAR_OPS[next++]);
    const show = !drawn || drawn.has(i);
    const b64 = await page.evaluate(([dt, ov, o]) => window.__hangarFrame(dt, ov, o), [1 / FPS, show ? overlayFor(sc, sc.t0 + t) : null, ops]);
    if (show) emit(b64);
    progress(sc, i, total);
  }
}

// ======================================================================================
// RUNNING IT
// ======================================================================================

function serverUp() {
  return new Promise((res) => {
    const r = http.get({ host: 'localhost', port: PORT, path: '/', timeout: 2500 }, (resp) => {
      resp.resume();
      res(true);
    });
    r.on('error', () => res(false));
    r.on('timeout', () => {
      r.destroy();
      res(false);
    });
  });
}

/** the game server: used if it is running, started (and stopped at the end) if not */
async function ensureServer() {
  if (await serverUp()) return null;
  log(`starting the game server on port ${PORT}...`);
  const child = cp.spawn(`npm run dev -- --port ${PORT} --strictPort`, { cwd: REPO, shell: true, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    if (await serverUp()) return child;
    await sleep(1000);
  }
  throw new Error(`the game server did not start. Run "npm run dev" in another window, then run this again.`);
}

function stopServer(child) {
  if (!child) return;
  try {
    if (process.platform === 'win32') cp.spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child.kill();
  } catch (e) {
    /* it will close with the window */
  }
}

async function openPage(browser, map) {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: W, height: H } });
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => log('  PAGE ERROR:', e.message));
  page.on('console', (m) => {
    if (m.text().startsWith('[TR]')) log('  ' + m.text());
  });
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('triad.skipIntro', '1');
      localStorage.setItem('triad.seenVersion', '99');
      localStorage.setItem('triad.gpuWarned', '1');
      localStorage.setItem('triad.program', 'air');
      // (every jet in its factory paint)
      localStorage.setItem('triad.paint.factoryReset.v2', '1');
      localStorage.setItem('triad.paint.v1', '{}');
    } catch (e) {
      /* storage blocked */
    }
  });
  await page.goto(`http://localhost:${PORT}/#map=${map === 'hangar' ? 'jade' : map}`, { timeout: 0 });
  await page.bringToFront();
  for (let i = 0; i < 2400; i++) {
    if (await page.evaluate(() => !!(window.game && window.game.state === 'menu' && window.__THREE && window.__hangar)).catch(() => false)) break;
    await page.waitForTimeout(250);
  }
  await page.evaluate(installGrab, { W, H });
  if (map !== 'hangar') {
    await page.addScriptTag({ path: path.join(REPO, 'tools', 'cinematics', 'lib.js') });
    await page.addScriptTag({ path: path.join(__dirname, 'shots.js') });
    await page.evaluate((gfx) => window.TR.setup({ gfx }), GFX);
  }
  return page;
}

// ---- ffmpeg (the system one, or the one Remotion brought)
const quote = (s) => (/[\s"&|<>^()]/.test(s) ? '"' + s.replace(/"/g, '\\"') + '"' : s);
function findFfmpeg() {
  const works = (prefix, cwd) => {
    const r = cp.spawnSync(prefix + ' -version', { shell: true, cwd, encoding: 'utf8' });
    return r.status === 0 && /ffmpeg version/i.test((r.stdout || '') + (r.stderr || ''));
  };
  if (process.env.FFMPEG && works(quote(process.env.FFMPEG))) return { prefix: quote(process.env.FFMPEG) };
  if (works('ffmpeg')) return { prefix: 'ffmpeg' };
  if (fs.existsSync(MYVIDEO) && works('npx remotion ffmpeg', MYVIDEO)) return { prefix: 'npx remotion ffmpeg', cwd: MYVIDEO };
  return null;
}
function ffmpeg(ff, args) {
  const r = cp.spawnSync(ff.prefix + ' ' + args.map(quote).join(' '), { shell: true, cwd: ff.cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + ((r.stderr || '') + (r.stdout || '')).slice(-1500));
}

function encode() {
  const have = SHOTS.filter((s) => fs.existsSync(path.join(OUT, s.dir)) && fs.readdirSync(path.join(OUT, s.dir)).some((f) => f.endsWith('.jpg')));
  if (!have.length) {
    log('no pictures to put together.');
    return null;
  }
  const ff = findFfmpeg();
  if (!ff) {
    log('\nThe pictures are done (in ' + OUT + '), but no ffmpeg was found to make the video.');
    log('Import each numbered folder into your editor as an image sequence at ' + FPS + ' fps, in order.');
    return null;
  }
  const parts = [];
  for (const s of have) {
    const mp4 = path.join(OUT, s.dir + '.mp4');
    ffmpeg(ff, ['-y', '-framerate', String(FPS), '-i', path.join(OUT, s.dir, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), mp4]);
    parts.push(mp4);
  }
  const list = path.join(OUT, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n') + '\n');
  const final = path.join(OUTROOT, 'triad-trailer.mp4');
  ffmpeg(ff, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
  return final;
}

function selfTest() {
  // (no browser: the timing and the text for every frame are worked out and checked)
  console.log(SHOTS.map((s) => `${s.t0.toFixed(1).padStart(5)}  ${s.id.padEnd(8)} ${String(s.dur).padEnd(4)} ${s.map.padEnd(7)} ${s.label}`).join('\n'));
  console.log('total', TOTAL, 's');
  let bad = 0;
  for (const sc of SHOTS) {
    for (let i = 0; i < sc.dur * FPS; i++) {
      const ov = overlayFor(sc, sc.t0 + i / FPS);
      for (const v of [ov.fade, ov.flash, ov.dim]) if (!(v >= 0 && v <= 1.0001)) bad++;
      for (const l of ov.lines) if (!(l.a >= 0 && l.a <= 1.0001) || typeof l.text !== 'string') bad++;
    }
    if (!PAGES.includes(sc.map)) bad++;
  }
  console.log(bad ? `PROBLEM: ${bad} bad values` : 'overlays ok');
  if (TOTAL !== 60 || bad) process.exit(1);
}

async function main() {
  if (flag('help')) {
    const src = fs.readFileSync(__filename, 'utf8').split('\n');
    console.log(src.slice(0, src.findIndex((l) => l.startsWith("'use strict'"))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  if (flag('selftest')) return selfTest();
  if (ONLY) for (const id of ONLY) if (!SHOTS.some((s) => s.id === id)) throw new Error(`no shot called "${id}" (the shots: ${SHOTS.map((s) => s.id).join(', ')})`);
  const { chromium } = require('playwright');
  const server = await ensureServer();
  const t0 = Date.now();
  const browser = await chromium.launch({
    headless: flag('software'),
    args: flag('software')
      ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
      : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force_high_performance_gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  fs.mkdirSync(OUT, { recursive: true });
  const failed = [];
  try {
    for (const map of PAGES) {
      const list = SHOTS.filter((s) => s.map === map && (!ONLY || ONLY.includes(s.id))).sort((a, b) => (a.film || a.n) - (b.film || b.n));
      if (!list.length) continue;
      log(`\n=== ${map === 'hangar' ? 'the hangar' : 'the ' + map + ' theater'}: ${list.map((s) => s.id).join(', ')} ===`);
      let page = null;
      try {
        page = await openPage(browser, map);
        for (const sc of list) {
          shotStart = Date.now();
          try {
            if (sc.id === 'hangar') await filmHangar(page, sc);
            else await filmShot(page, sc);
            log(`  ${sc.id} done in ${((Date.now() - shotStart) / 1000).toFixed(0)} s`);
          } catch (e) {
            failed.push(sc.id);
            log(`  SHOT ${sc.id} FAILED: ${String(e.message).split('\n')[0]}`);
          }
        }
      } catch (e) {
        for (const sc of list) if (!failed.includes(sc.id)) failed.push(sc.id);
        log(`  THE ${map} THEATER FAILED TO OPEN: ${String(e.message).split('\n')[0]}`);
      } finally {
        if (page) await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    stopServer(server);
  }
  log(`\nthe pictures took ${((Date.now() - t0) / 60000).toFixed(1)} minutes.`);
  if (failed.length) log(`shots that failed: ${failed.join(', ')}  (redo them with --only ${failed.join(',')})`);
  if (STILLS) {
    log('stills are in ' + path.join(OUT, 'stills'));
    return;
  }
  if (flag('no-encode')) return;
  log('making the video...');
  const final = encode();
  if (final) {
    log('\nDONE: ' + final);
    log('open the folder with:  explorer ' + OUTROOT);
  }
}

main().catch((e) => {
  console.error('\nFAILED:', e && e.stack ? e.stack : e);
  process.exit(1);
});
