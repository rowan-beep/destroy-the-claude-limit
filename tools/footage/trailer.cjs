// ONE COMMAND: records a 60-second, 9:16 TRIAD trailer from the game itself (on your graphics card),
// cut to the beats of your music, and encodes it to an MP4.
//
//   node tools/footage/trailer.cjs --music "C:\path\to\Steel_Against_the_Clouds.mp3"
//
// (tip: type  --music  and a space, then drag the mp3 file into the PowerShell window)
//
// The scenes (60 s in all, timed to the music: hits at 4, 8, 12 s, the drop at 16 s, a quiet breakdown 44-48 s):
//   1   0-16 s  FORMATION   a smooth camera glides in on an F-22, F-35 and Su-57 over the islands, then the
//                           F-22 pulls straight up on the afterburner (the drop hits as it goes)
//   2  16-30 s  DOGFIGHT    5v5 over the Triad Isles at dusk: AI pilots on both sides, a camera director with
//                           chase, orbit and long-lens shots, a slow-motion close-up on every missile launch
//   3  30-38 s  HANGAR      the paint shop and loadouts, a change on every beat
//   4  38-48 s  DOGFIGHT    5v5 over Frostfall Strait in the morning; slow motion through the breakdown
//   5  48-60 s  SUNSET      a smooth orbit round two jets over the ocean, then the TRIAD.CHURCH end card
//
// Options (all optional):
//   --music <file>     your music: it is added to the finished video (60 s)
//   --port 5173        the game server (it is started for you if it is not running)
//   --size 1080x1920   picture size (9:16). --size 540x960 is a quick preview
//   --fps 30           frames per second
//   --out frames       where the pictures go (frames/trailer/s1 ... s5) and the finished video
//   --only 2,4         record just these scenes (then the video is put together from what exists)
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
const MUSIC = opt('music', '');
const ONLY = opt('only', '') ? opt('only', '').split(',').map((s) => +s) : null;
const PORTRAIT = H > W;
const SC = Math.min(W, H) / 1080; // text sizes scale with the picture

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ======================================================================================
// THE SCENES
// ======================================================================================

// the hangar: what changes when (s), on the music's beats. A paint is a wrap or a solid colour with a finish;
// a load is an index into the jet's loadouts (the F-15EX: 0 everyday, 1 missile truck, 2 strike, ...)
const HANGAR_OPS = [
  { at: 1.0, k: 'paint', p: { wrap: 'inferno', finish: 'gloss' } },
  { at: 2.0, k: 'load', i: 2 },
  { at: 3.0, k: 'paint', p: { wrap: 'aurora', finish: 'gloss' } },
  { at: 4.0, k: 'paint', p: { wrap: 'galaxy', finish: 'metallic' } },
  { at: 5.0, k: 'paint', p: { solid: '#d42a1f', finish: 'gloss' } },
  { at: 6.0, k: 'load', i: 1 },
  { at: 7.0, k: 'paint', p: { wrap: 'blackice', finish: 'gloss' } },
];

// (saved paints for the jets the player flies in a scene: the AI jets get random ones from the game)
const wrap = (id, a, b, finish) => ({ mode: 'wrap', color: a, color2: b, wrap: id, finish, brightness: 1, suit: '' });

const SCENES = [
  {
    id: 1, name: 'FORMATION OVER THE ISLANDS (Jade Archipelago)', map: 'jade', secs: 16, run: sceneFly, paints: {},
    opts: {
      lead: 'F22', wings: ['F35A', 'SU57'], tod: 'afternoon', weather: 'clear', where: 'coast', alt: 150, speed: 230, mach: 0.68,
      sunElev: 26, sunHdg: 200,
      climbAt: 12, // the F-22 pulls up on the beat at 12 s, the others peel away
      wingBreak: 11.5,
      // the camera rides the formation (offsets: right, up, back): first a slow push-in, then below and behind for the climb
      cams: [
        { t0: 0, t1: 8, a: [40, -4, 78], b: [20, 3, 22], fov: [46, 38], ahead: 10 },
        { t0: 8, t1: 16, a: [-26, -5, 40], b: [-10, -10, 30], fov: [50, 60], ahead: 14 },
      ],
    },
  },
  {
    id: 2, name: '5v5 DOGFIGHT (Triad Isles, dusk)', map: 'triad', secs: 14, run: sceneFight,
    paints: { SU57: wrap('inferno', '#0d0706', '#ff5a14', 'gloss') },
    opts: { jet: 'SU57', tod: 'dusk', weather: 'cloudy', shiftNm: 10.5 },
  },
  { id: 3, name: 'HANGAR (paint and loadout)', map: 'triad', secs: 8, run: sceneHangar, paints: {}, opts: { type: 'F15EX' }, ops: HANGAR_OPS },
  {
    id: 4, name: '5v5 DOGFIGHT (Frostfall Strait)', map: 'frost', secs: 10, run: sceneFight,
    paints: { F22: wrap('blackice', '#020405', '#2ec4d4', 'gloss') },
    opts: { jet: 'F22', tod: 'morning', weather: 'clear', shiftNm: 10.5 },
    slow: [{ from: 6, to: 10, speed: 0.4 }], // slow motion through the music's breakdown (44-48 s)
  },
  {
    id: 5, name: 'SUNSET + END CARD (Open Ocean)', map: 'ocean', secs: 12, run: sceneFly, paints: {},
    opts: {
      lead: 'TYPHOON', wings: ['RAFALE'], tod: 'dusk', weather: 'clear', where: 'sea', heading: 100, alt: 70, speed: 190, mach: 0.58,
      sunElev: 6, sunHdg: 80, climbAt: 999, wingBreak: 999,
      // one slow orbit round the formation: front-right quarter to rear-right quarter, the golden light on the jets
      cams: [{ t0: 0, t1: 12, orbit: { th: [28, 150], R: [36, 28], h: [6, 3] }, fov: [50, 44], ahead: 0 }],
    },
  },
];

// ======================================================================================
// TEXT ON THE PICTURES (computed here, drawn in the page)
// ======================================================================================

const ramp = (t, a, b, fi = 0.35, fo = 0.35) => Math.max(0, Math.min(1, (t - a) / fi, (b - t) / fo));
// (9:16: captions sit above the bottom strip the phone apps cover, and wrap to two lines)
const caption = (text, t, a, b) =>
  PORTRAIT
    ? { text, align: 'center', y: 0.7, size: 50 * SC, track: 0.12, maxW: 0.86, a: ramp(t, a, b) }
    : { text, x: 0.05, y: 0.87, size: 54 * SC, track: 0.14, a: ramp(t, a, b) };
const mark = () =>
  PORTRAIT
    ? { text: 'TRIAD.CHURCH', align: 'center', y: 0.8, size: 28 * SC, track: 0.3, w: 600, a: 0.6 }
    : { text: 'TRIAD.CHURCH', align: 'right', x: 0.03, y: 0.94, size: 26 * SC, track: 0.3, w: 600, a: 0.55 };
const BIG = PORTRAIT ? 0.88 : 1;

/** what is drawn over the picture at `t` seconds into scene `sc`: black fades, flashes, dimming, text */
function overlayFor(sc, t) {
  const lines = [];
  let flash = 0;
  let dim = 0;
  let dip = 0;
  switch (sc.id) {
    case 1:
      lines.push({ text: 'TRIAD', align: 'center', y: 0.42, size: 190 * SC * BIG, track: 0.3, a: ramp(t, 0.4, 3.8, 0.8, 0.6) });
      lines.push({ text: 'AIR COMBAT', align: 'center', y: 0.42 + 0.075, size: 44 * SC * BIG, track: 0.55, w: 600, a: ramp(t, 0.9, 3.8, 0.7, 0.6) });
      lines.push(caption('13 REAL JETS', t, 4.6, 7.6));
      dip = Math.max(0, 1 - Math.abs(t - 8) / 0.13); // a quick dip to black on the cut at the 8 s hit
      break;
    case 2:
      lines.push(caption('5 v 5 DOGFIGHTS', t, 0.4, 3.4));
      lines.push(caption('RADAR MISSILES · HEAT SEEKERS · GUNS', t, 7, 11));
      lines.push(mark());
      break;
    case 3: {
      lines.push(caption('CUSTOMIZE YOUR JET', t, 0.3, 3.6));
      lines.push(caption('CHOOSE YOUR LOADOUT', t, 4.3, 7.4));
      lines.push(mark());
      let last = -9;
      for (const op of sc.ops) if (t >= op.at) last = op.at;
      flash = 0.5 * Math.max(0, 1 - (t - last) / 0.2); // a flash on every change
      break;
    }
    case 4:
      lines.push(caption('FOUR THEATERS', t, 0.4, 3.4));
      lines.push(mark());
      break;
    case 5:
      dim = 0.4 * Math.max(0, Math.min(1, (t - 3.8) / 1.4));
      lines.push({ text: 'TRIAD', align: 'center', y: 0.42, size: 190 * SC * BIG, track: 0.3, a: ramp(t, 4.6, 99, 0.9, 1) });
      lines.push({ text: 'PLAY IN YOUR BROWSER', align: 'center', y: 0.42 + 0.1, size: 40 * SC * BIG, track: 0.35, w: 600, a: ramp(t, 6.0, 99, 0.8, 1) });
      lines.push({ text: 'TRIAD.CHURCH', align: 'center', y: 0.42 + 0.19, size: 70 * SC * BIG, track: 0.3, a: ramp(t, 7.0, 99, 0.8, 1) });
      break;
    default:
  }
  // every scene fades in from black and out to black
  const fade = Math.max(0, 1 - t / 0.2, 1 - (sc.secs - t) / 0.2, dip);
  return { fade, flash, dim, lines };
}

// slow motion forced on the scene's frames (the fight's director can also slow the action by itself)
function forceSpeed(sc, t) {
  for (const r of sc.slow || []) if (t >= r.from && t < r.to) return r.speed;
  return null;
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

// ---------------------------------------------------------------- the formation shots (the cinematic tool's scripted jets)

/**
 * o: { lead, wings[], tod, weather, where: 'coast'|'sea', heading?, alt, speed, mach, sunElev, sunHdg, climbAt, wingBreak, cams[] }
 * Sets up the theater with scripted jets (flown every frame by __flyFrame) and the camera rig that rides with them.
 */
async function flyInit(o) {
  const c = window.cine;
  const g = window.game;
  const THREE = window.__THREE;
  const D = Math.PI / 180;
  const { surfaceHeight } = await import('/src/world/terrain.ts');
  await c.start({ jet: o.lead, tod: o.tod, weather: o.weather });
  const p = g.player;
  const wings = [];
  for (const t of o.wings) wings.push(await c.add(t));
  let sx, sz, hdg;
  if (o.where === 'coast') {
    // start over open water about 9 km short of the highest ground nearby, flying at it
    const pk = await c.findHigh(p.fm.pos.x, p.fm.pos.z, 30000);
    let ux = pk[0] - p.fm.pos.x;
    let uz = pk[1] - p.fm.pos.z;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul;
    uz /= ul;
    const s = await c.findSea(pk[0] - ux * 9000, pk[1] - uz * 9000, 1500);
    sx = s[0];
    sz = s[1];
    hdg = pk[2] > 20 ? Math.atan2(pk[0] - sx, -(pk[1] - sz)) / D : 90;
  } else {
    const s = await c.findSea(p.fm.pos.x, p.fm.pos.z, 3000);
    sx = s[0];
    sz = s[1];
    hdg = o.heading;
  }
  // the height: clear of the highest ground on the way
  const hr = hdg * D;
  let maxH = 0;
  for (let d = 0; d <= 5000; d += 150) maxH = Math.max(maxH, surfaceHeight(sx + Math.sin(hr) * d, sz - Math.cos(hr) * d));
  const alt = Math.max(o.alt, maxH + 90);
  // (a tall frame sees less of the sides: the lenses open up)
  const AK = g.renderer.camera.aspect < 1 ? 1.35 : 1;
  window.__fly = {
    c, g, THREE, D, p, wings, o, hdg, alt, AK, surfaceHeight,
    lead: new THREE.Vector3(sx, alt, sz),
    wpos: wings.map(() => null),
    sunDone: false,
  };
}

/** one frame of the formation shot at t seconds; returns the JPEG (nothing if no overlay is given) */
async function flyFrame(t, dt, ov) {
  const S = window.__fly;
  const c = S.c;
  const g = S.g;
  const THREE = S.THREE;
  const D = S.D;
  const o = S.o;
  const V = THREE.Vector3;
  const sm = (a, b, x) => {
    const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const hd = S.hdg * D;
  const dirH = new V(Math.sin(hd), 0, -Math.cos(hd)); // the way they fly
  const rightH = new V(Math.cos(hd), 0, Math.sin(hd)); // to its right
  // ---- the lead: level, then a smooth pull-up into a climb
  const k = Math.max(0, t - o.climbAt);
  const pitch = 78 * sm(0, 2.4, k);
  const speed = o.speed * (1 - 0.12 * sm(0, 3, k));
  const pr = pitch * D;
  const fwd3 = new V(dirH.x * Math.cos(pr), Math.sin(pr), dirH.z * Math.cos(pr));
  const L = S.lead;
  L.addScaledVector(fwd3, speed * dt);
  if (pitch < 1) L.y = S.alt + 2.5 * Math.sin(t * 0.9);
  const climbing = pitch > 5;
  c.pose(S.p, { pos: [L.x, L.y, L.z], hdg: S.hdg, pitch, roll: climbing ? 0 : 4 * Math.sin(t * 0.7), aoa: climbing ? 10 : 3, speed, mach: o.mach, g: climbing ? 3.5 : 1.1, ab: 1 });
  // ---- the wingmen: in formation, then peeling away level
  S.wings.forEach((w, i) => {
    const side = i % 2 ? 1 : -1;
    const rank = 1 + Math.floor(i / 2);
    if (t < o.wingBreak) {
      const x = L.x + rightH.x * 26 * rank * side - dirH.x * 22 * rank;
      const z = L.z + rightH.z * 26 * rank * side - dirH.z * 22 * rank;
      S.wpos[i] = new V(x, S.alt + 1.2 * Math.sin(t * 1.3 + i * 2), z);
      c.pose(w, { pos: [x, S.wpos[i].y, z], hdg: S.hdg, pitch: 0, roll: 4 * Math.sin(t * 0.8 + i * 2), aoa: 3, speed: o.speed, mach: o.mach, g: 1.1, ab: 1 });
    } else {
      const wp = S.wpos[i];
      wp.addScaledVector(dirH, o.speed * dt);
      wp.addScaledVector(rightH, side * 12 * dt);
      c.pose(w, { pos: [wp.x, wp.y, wp.z], hdg: S.hdg + side * 4, pitch: 0, roll: side * 35, aoa: 3, speed: o.speed, mach: o.mach, g: 1.6, ab: 1 });
    }
  });
  if (!S.sunDone) {
    // the sun for the whole scene (the game's light and reflections follow it)
    c.sun(o.sunElev, S.hdg + o.sunHdg);
    try {
      g.world.bakeLighting(g.renderer.renderer);
      g.world.env.buildEnvMap(g.renderer.renderer);
    } catch (e) {
      /* the sun alone is fine */
    }
    S.sunDone = true;
  }
  // ---- the camera: it rides with the lead on a smooth move (no shake, no whip, the horizon level)
  let C = o.cams[o.cams.length - 1];
  for (const cc of o.cams) if (t >= cc.t0 && t <= cc.t1) C = cc;
  const u = sm(C.t0, C.t1, t);
  const mix = (a, b) => a + (b - a) * u;
  let cx, cy, cz, lx, ly, lz;
  if (C.orbit) {
    const th = mix(C.orbit.th[0], C.orbit.th[1]) * D;
    const R = mix(C.orbit.R[0], C.orbit.R[1]);
    const h = mix(C.orbit.h[0], C.orbit.h[1]);
    cx = L.x + rightH.x * Math.sin(th) * R + dirH.x * Math.cos(th) * R;
    cz = L.z + rightH.z * Math.sin(th) * R + dirH.z * Math.cos(th) * R;
    cy = L.y + h;
    lx = L.x;
    ly = L.y + 0.6;
    lz = L.z;
  } else {
    const r = mix(C.a[0], C.b[0]);
    const up = mix(C.a[1], C.b[1]);
    const back = mix(C.a[2], C.b[2]);
    cx = L.x + rightH.x * r - fwd3.x * back;
    cy = L.y + up - fwd3.y * back;
    cz = L.z + rightH.z * r - fwd3.z * back;
    lx = L.x + fwd3.x * C.ahead;
    ly = L.y + fwd3.y * C.ahead + 0.5;
    lz = L.z + fwd3.z * C.ahead;
  }
  const gh = Math.max(0, S.surfaceHeight(cx, cz));
  if (cy < gh + 3) cy = gh + 3;
  c.view([cx, cy, cz], [lx, ly, lz], mix(C.fov[0], C.fov[1]) * S.AK, 0);
  // (only a very slow float, so it never looks locked to a tripod)
  const cam = g.renderer.camera;
  cam.rotateX(Math.sin(t * 0.8) * 0.0012);
  cam.rotateY(Math.sin(t * 0.55) * 0.0014);
  c.frame(dt);
  return ov ? window.__grab(ov) : null;
}

/** (the page's first frames: the terrain around the camera streams in) */
async function flySettle() {
  await window.cine.settle(3500);
}

// ---------------------------------------------------------------- the 5v5 dogfights

/**
 * o: { jet, tod, weather, shiftNm }
 * Starts a 5v5 team battle, flies the player's jet with an AI pilot too, brings the two teams closer, and puts a
 * camera director in charge of the view. Everyone holds fire until __fight.go(): the first missiles fly on camera.
 *
 * The director: smooth shots only (chase, orbit and long lens with a level horizon, a slow float, nothing shaky),
 * a close-up in slow motion on every missile launch, then the missile's own view, then the kill in slow motion;
 * it favours jets near the enemy and jets of a type it has not shown yet, and cuts away from any jet that leaves the fight.
 */
async function fightInit(o) {
  const g = window.game;
  const THREE = window.__THREE;
  const V = THREE.Vector3;
  const { defaultMission } = await import('/src/game/mission.ts');
  const { AIPilot } = await import('/src/ai/pilot.ts');
  const { duelSkill } = await import('/src/ai/skill.ts');
  const { WEATHER_PRESETS } = await import('/src/world/weather.ts');
  const { surfaceHeight } = await import('/src/world/terrain.ts');
  document.querySelector('.menu-root')?.classList.add('hidden');
  Object.assign(g.settings.graphics, { quality: 'ultra', resolution: 'native', resolutionScale: 1, antialias: 4, shadows: 'ultra', terrainLighting: true, bloom: 0.65, lightScattering: true, cloudQuality: 'ultra', cloudShadows: true, autoRes: false, vignette: true });
  const cfg = Object.assign(defaultMission(), { mode: 'team', aircraft: o.jet, loadoutId: '', timeOfDay: o.tod, difficulty: 'HARD', teamAllies: 'mixed', duelRules: 'all' });
  await g.startMission(cfg, () => {});
  if (g.state === 'briefing') g.acceptBriefing();
  g.running = false; // (from here the script draws every frame itself)
  g.applySettings();
  if (o.weather) g.world.setWeather({ ...WEATHER_PRESETS[o.weather] });
  g.hud.root.style.display = 'none';
  // the two teams start closer, so the missiles fly and the jets merge within the scene
  for (const a of g.sim.aircraft) a.fm.pos.x += (a.team === 'blue' ? 1 : -1) * o.shiftNm * 1852;

  const F = { live: false };
  // everyone flies but holds fire until go(): the first missiles then leave their rails in front of the camera
  const hold = () => {
    for (const a of g.sim.aircraft) if (a.ai) a.ai.weaponsHold = !F.live;
  };
  // the player's jet is flown by an AI pilot too, on its team's patrol route
  F.attachAI = (p) => {
    const ally = g.sim.aircraft.find((a) => a.team === 'blue' && a !== p && a.ai && a.ai.route && a.ai.route.length);
    p.ai = new AIPilot(p, duelSkill('HARD'), g.picture);
    if (ally) p.ai.setRoute(ally.ai.route.map((v) => v.clone()), ally.ai.patrolAlt);
    p.ai.weaponsHold = !F.live;
  };
  hold();

  // ---- the camera director
  const cam = g.renderer.camera;
  const AK = cam.aspect < 1 ? 1.35 : 1; // (a tall frame: the lenses open up)
  const Dr = {
    vt: 0, dv: 1 / 30, shot: null, lastSubj: null, lastLaunchAt: -99, lastWreckAt: -99, pendLaunch: null, pendKill: null,
    warned: false, speed: 1, speedTarget: 1, seen: {}, init: false, cp: new V(), cq: new THREE.Quaternion(), cf: 50,
  };
  F.Dr = Dr;
  const t1 = new V();
  const t2 = new V();
  const UP = new V(0, 1, 0);
  const mat = new THREE.Matrix4();
  const qd = new THREE.Quaternion();
  const eul = new THREE.Euler(0, 0, 0, 'YXZ');
  const qq = new THREE.Quaternion();
  const aboveGround = (p, min) => {
    const gh = Math.max(0, surfaceHeight(p.x, p.z));
    if (p.y < gh + min) p.y = gh + min;
  };
  const inSim = (a) => !!a && g.sim.aircraft.indexOf(a) >= 0;
  g.sim.events.on('launch', (e) => {
    if (Dr.vt - Dr.lastLaunchAt > 5 && inSim(e.shooter) && Math.random() < 0.85) Dr.pendLaunch = e;
  });
  g.sim.events.on('destroyed', (e) => {
    if (Dr.vt - Dr.lastWreckAt > 5 && inSim(e.victim)) Dr.pendKill = e.victim;
  });
  const mk = (kind, subj, extra) => Object.assign({ kind, subj, vt: 0, dur: 4, fov: 50, kp: 8, kr: 8, pos: new V(), look: new V(), side: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * 6.283, snap: true, speed: 1, done: false }, extra);
  // a planned shot ends on a half second (the music is at 120 bpm), at least 2.5 s after it starts
  const endAt = (d) => Math.max(Dr.vt + 2.5, Math.round((Dr.vt + d) * 2) / 2);
  const nearestFoe = (a) => {
    let d = 1e9;
    for (const b of g.sim.aircraft) if (b.alive && b.team !== a.team) d = Math.min(d, a.fm.pos.distanceTo(b.fm.pos));
    return d;
  };
  // the jet with the most going on: near the enemy, a missile in the air, a type not shown yet, not the one we just saw
  const pickSubject = () => {
    let best = null;
    let bs = -1e9;
    for (const a of g.sim.aircraft) {
      if (!a.alive) continue;
      const dmin = nearestFoe(a);
      if (dmin > 12000) continue; // alone and far from the fight: never
      let s = -dmin / 1200;
      if (a === Dr.lastSubj) s -= 6;
      s += 3 / (1 + (Dr.seen[a.type] || 0));
      for (const m of g.sim.missiles) if (m.alive && (m.target === a || m.shooter === a)) s += 2;
      s += Math.random() * 2;
      if (s > bs) {
        bs = s;
        best = a;
      }
    }
    return best;
  };
  const launchShot = (e) => {
    const sh = e.shooter;
    const side = t1.subVectors(e.missile.pos, sh.fm.pos).dot(sh.fm.right) >= 0 ? 1 : -1;
    return mk('launch', sh, { missile: e.missile, side, dur: 7, kp: Infinity, kr: 14 });
  };
  const wreckShot = (v) => {
    const a = Math.random() * 6.283;
    return mk('wreck', v, { dur: 3.4, fov: 48, kp: Infinity, kr: 10, off: new V(Math.cos(a), 0.25, Math.sin(a)).multiplyScalar(75 + Math.random() * 35) });
  };
  const nextShot = () => {
    // a missile already in the air: ride it
    if (Dr.vt - Dr.lastLaunchAt > 4 && Math.random() < 0.4) {
      const ms = g.sim.missiles.filter((m) => m.alive && m.target && m.target.alive && inSim(m.shooter));
      if (ms.length) {
        Dr.lastLaunchAt = Dr.vt;
        return mk('trail', null, { missile: ms[Math.floor(Math.random() * ms.length)], dur: 6, fov: 56, kp: 6, kr: 9 });
      }
    }
    const s = pickSubject();
    if (!s) return null;
    Dr.lastSubj = s;
    Dr.seen[s.type] = (Dr.seen[s.type] || 0) + 1;
    const r = Math.random();
    const end = endAt(3.6 + Math.random() * 2.4);
    if (r < 0.4) return mk('chase', s, { endVT: end, fov: 52, kp: 6, kr: 7 });
    if (r < 0.72) return mk('orbit', s, { endVT: end, fov: 46, kp: Infinity, kr: 12 });
    // the long lens: far back, the position following the jet slowly, a flat, compressed look
    const a = Math.random() * 6.283;
    return mk('long', s, { endVT: end, fov: 20, kp: 1.6, kr: 5, off: new V(Math.cos(a), 0.12, Math.sin(a)).multiplyScalar(260) });
  };
  // is the shot still worth showing
  const bad = (s) => {
    if (s.kind === 'trail' || s.kind === 'launch') return false; // they end themselves
    if (!s.subj || !inSim(s.subj)) return true;
    if (s.kind === 'wreck') return false;
    if (!s.subj.alive) return true;
    return nearestFoe(s.subj) > 12000; // the jet has left the fight
  };

  // the missile seen from behind, looking at its target; the shot ends when it ends
  const trailPlace = (s, dv) => {
    const m = s.missile;
    t1.copy(m.vel);
    if (t1.lengthSq() < 1) t1.set(0, 0, -1);
    t1.normalize();
    s.pos.copy(m.pos).addScaledVector(t1, -12);
    s.pos.y += 2.5;
    const tg = m.target;
    if (tg && tg.alive) {
      s.look.copy(tg.fm.pos);
      s.lost = 0;
    } else {
      s.look.copy(m.pos).addScaledVector(t1, 150);
      s.lost = (s.lost || 0) + dv;
    }
    if (!m.alive) s.gone = (s.gone || 0) + dv;
    let near = 1e9;
    for (const a of g.sim.aircraft) if (a.alive) near = Math.min(near, a.fm.pos.distanceTo(m.pos));
    if ((s.gone || 0) > 0.9 || (s.lost || 0) > 0.7 || near > 3500 || s.vt > s.dur) s.done = true;
  };

  const place = (s, dv) => {
    const fm = s.subj ? s.subj.fm : null;
    const len = s.subj ? s.subj.spec.length : 16;
    if (s.kind === 'chase') {
      // behind and above, a little to one side, the position following with a short lag
      t1.copy(fm.fwd);
      t1.y *= 0.5;
      t1.normalize();
      s.pos.copy(fm.pos).addScaledVector(t1, -(len * 1.6 + 14));
      s.pos.y += len * 0.35 + 3;
      s.pos.addScaledVector(fm.right, s.side * len * 0.5);
      s.look.copy(fm.pos).addScaledVector(fm.fwd, len * 0.5);
    } else if (s.kind === 'orbit') {
      // a slow circle round the jet as it flies, the camera locked to it
      const a = s.seed + 0.28 * s.vt;
      const r = len * 2.6 + 14;
      const e = 0.18 + 0.1 * Math.sin(0.5 * s.vt + s.seed);
      s.pos.set(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r).add(fm.pos);
      s.look.copy(fm.pos);
    } else if (s.kind === 'long') {
      s.pos.copy(fm.pos).add(s.off);
      s.look.copy(fm.pos);
    } else if (s.kind === 'launch') {
      if (s.vt < 1.4) {
        // close on the missile leaving its rail, in slow motion
        s.pos.copy(fm.pos).addScaledVector(fm.right, s.side * 8.5).addScaledVector(fm.up, 0.8).addScaledVector(fm.fwd, -3.5);
        s.look.copy(s.missile.pos);
        s.kp = Infinity;
        s.kr = 14;
        s.fov = 46;
        s.speed = 0.3;
      } else {
        // then away with it
        trailPlace(s, dv);
        s.kp = 6;
        s.kr = 9;
        s.fov = 56;
        s.speed = 1;
      }
      if (s.vt > s.dur) s.done = true;
    } else if (s.kind === 'trail') {
      trailPlace(s, dv);
    } else {
      // a kill: the camera falls with the wreck at a short distance, in slow motion for the first moments
      s.pos.copy(fm.pos).add(s.off);
      s.look.copy(fm.pos);
      s.speed = s.vt < 2.2 ? 0.35 : 1;
      if (s.vt > s.dur) s.done = true;
    }
  };

  // the camera itself: the position and the aim follow the shot's with their own smoothing, a cut snaps
  const frameCam = (s, dv) => {
    aboveGround(s.pos, 3);
    if (!(isFinite(s.pos.x) && isFinite(s.pos.y) && isFinite(s.pos.z) && isFinite(s.look.x) && isFinite(s.look.y))) throw new Error('bad camera position');
    const snap = s.snap || !Dr.init;
    if (snap) Dr.cp.copy(s.pos);
    else if (s.kp === Infinity) Dr.cp.copy(s.pos);
    else Dr.cp.lerp(s.pos, 1 - Math.exp(-dv * s.kp));
    aboveGround(Dr.cp, 3);
    mat.lookAt(Dr.cp, s.look, UP);
    qd.setFromRotationMatrix(mat);
    if (snap) {
      Dr.cq.copy(qd);
      Dr.cf = s.fov * AK;
      s.snap = false;
      Dr.init = true;
    } else {
      Dr.cq.slerp(qd, 1 - Math.exp(-dv * s.kr));
      Dr.cf += (s.fov * AK - Dr.cf) * (1 - Math.exp(-dv * 4));
    }
    cam.position.copy(Dr.cp);
    cam.quaternion.copy(Dr.cq);
    // only a very slow float
    const T = Dr.vt;
    eul.set(Math.sin(T * 0.8) * 0.0012 + Math.sin(T * 0.31) * 0.0016, Math.sin(T * 0.57) * 0.0016, Math.sin(T * 0.43) * 0.0006);
    cam.quaternion.multiply(qq.setFromEuler(eul));
    cam.fov = Math.min(85, Dr.cf);
    cam.updateProjectionMatrix();
  };

  const direct = () => {
    const dv = Dr.dv;
    let s = Dr.shot;
    if (Dr.pendLaunch && inSim(Dr.pendLaunch.shooter) && Dr.pendLaunch.missile.alive) {
      s = launchShot(Dr.pendLaunch);
      Dr.lastLaunchAt = Dr.vt;
    } else if (Dr.pendKill) {
      s = wreckShot(Dr.pendKill);
      Dr.lastWreckAt = Dr.vt;
    } else if (!s || s.done || (s.endVT !== undefined && Dr.vt >= s.endVT) || bad(s)) s = nextShot();
    Dr.pendLaunch = null;
    Dr.pendKill = null;
    if (!s) return;
    Dr.shot = s;
    s.vt += dv;
    place(s, dv);
    Dr.speedTarget = s.speed;
    frameCam(s, dv);
  };
  const orig = g.cam.update.bind(g.cam);
  g.cam.update = (dt, ac, eye) => {
    try {
      g.cam.shake = 0; // (the game's explosion shake: none of it)
      direct();
    } catch (e) {
      // (the game's own camera, if the director ever fails: the footage goes on)
      if (!Dr.warned) {
        Dr.warned = true;
        console.warn('camera director failed', e);
      }
      orig(dt, ac, eye);
    }
  };
  // the fight starts: weapons free, the director starts fresh
  F.go = () => {
    F.live = true;
    hold();
    Dr.shot = null;
    Dr.pendLaunch = null;
    Dr.pendKill = null;
    Dr.speed = 1;
    Dr.speedTarget = 1;
    Dr.init = false;
    Dr.lastLaunchAt = -99;
    Dr.lastWreckAt = -99;
    Dr.lastSubj = null;
    Dr.seen = {};
  };
  window.__fight = F;
}

/** one frame of the fight (draws it if an overlay is given); force: slow motion asked for by the scene */
async function fightStep(dtReal, ov, force, vt) {
  const g = window.game;
  const F = window.__fight;
  const Dr = F.Dr;
  if (g.state === 'paused') g.setState('playing');
  const p = g.player;
  if (p && p.alive && !p.ai) F.attachAI(p);
  if (vt != null) Dr.vt = vt;
  Dr.dv = dtReal;
  // the speed of the action eases to what the shot (or the scene) wants: 1 normal, 0.3 slow motion
  const want = force == null ? Dr.speedTarget : Math.min(force, Dr.speedTarget);
  Dr.speed += (want - Dr.speed) * (1 - Math.exp(-dtReal * 6));
  g.frame(dtReal * Dr.speed);
  return ov ? window.__grab(ov) : null;
}

/** run the sim on without drawing until the fight starts (the five-second briefing), at most `max` frames */
function fightFast(max) {
  const g = window.game;
  const F = window.__fight;
  F.Dr.dv = 1 / 30;
  g.renderer.render = () => {};
  let n = 0;
  try {
    for (; n < max; n++) {
      if (g.state === 'paused') g.setState('playing');
      const p = g.player;
      if (p && p.alive && !p.ai) F.attachAI(p);
      g.frame(1 / 30);
      if (g.mode && g.mode.phase === 'combat') break;
    }
  } finally {
    delete g.renderer.render;
  }
  return n;
}

// ---------------------------------------------------------------- the hangar

/** o: { type, dur } the hangar's own camera is replaced by a slow orbit that tightens as the scene goes on */
async function hangarInit(o) {
  const g = window.game;
  const h = window.__hangar;
  const THREE = window.__THREE;
  g.running = false; // (from here the script draws every frame itself)
  document.querySelector('.menu-root')?.classList.add('hidden');
  Object.assign(g.settings.graphics, { quality: 'ultra', resolution: 'native', resolutionScale: 1, antialias: 4, shadows: 'ultra', terrainLighting: true, bloom: 0.65, lightScattering: true, cloudQuality: 'ultra', cloudShadows: true, autoRes: false, vignette: true });
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
    const yaw = 0.4 + t * 0.36;
    const pitch = 0.1 + 0.08 * Math.sin(t * 0.6);
    const dist = 22 - 7 * ease;
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
    const hf = (cam.aspect < 1 ? 50 - 12 * ease : 70 - 18 * ease) * (Math.PI / 180);
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

async function sceneFly(page, sc, emit) {
  await page.addScriptTag({ path: path.join(REPO, 'tools', 'cinematics', 'lib.js') });
  await page.evaluate(installGrab, { W, H });
  await install(page, '__flyFrame', flyFrame);
  await page.evaluate(flyInit, sc.opts);
  // the first pose of the first pass, so the terrain streams in around the camera before the picture starts
  await page.evaluate(([tt, dt]) => window.__flyFrame(tt, dt, null), [0, 1 / FPS]);
  await page.evaluate(flySettle);
  const total = Math.round(sc.secs * FPS);
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    emit(await page.evaluate(([tt, dt, ov]) => window.__flyFrame(tt, dt, ov), [t, 1 / FPS, overlayFor(sc, t)]));
    progress(sc, i, total);
  }
}

async function sceneFight(page, sc, emit) {
  await page.evaluate(installGrab, { W, H });
  await install(page, '__fightStep', fightStep);
  await install(page, '__fightFast', fightFast);
  await page.evaluate(fightInit, sc.opts);
  log('  the battle is set up (everyone holds fire); letting the terrain load...');
  for (let i = 0; i < 40; i++) {
    await page.evaluate(([dt]) => window.__fightStep(dt, null, null, 0), [1 / 30]);
    await page.waitForTimeout(40);
  }
  const n = await page.evaluate(() => window.__fightFast(900));
  log(`  briefing over after ${(n / 30).toFixed(1)} s`);
  for (let i = 0; i < 45; i++) {
    await page.evaluate(([dt]) => window.__fightStep(dt, null, null, 0), [1 / 30]);
    await page.waitForTimeout(40);
  }
  // weapons free: the first missiles are fired in front of the camera
  await page.evaluate(() => window.__fight.go());
  log('  weapons free; recording');
  const total = Math.round(sc.secs * FPS);
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    emit(await page.evaluate(([dt, ov, f, vt]) => window.__fightStep(dt, ov, f, vt), [1 / FPS, overlayFor(sc, t), forceSpeed(sc, t), t]));
    progress(sc, i, total);
  }
}

async function sceneHangar(page, sc, emit) {
  await page.evaluate(installGrab, { W, H });
  await install(page, '__hangarFrame', hangarFrame);
  await page.evaluate(hangarInit, { type: sc.opts.type, dur: sc.secs });
  // a few frames first: the paint shaders compile
  for (let i = 0; i < 20; i++) {
    await page.evaluate(([dt]) => window.__hangarFrame(dt, null, []), [1 / 30]);
    await page.waitForTimeout(60);
  }
  const total = Math.round(sc.secs * FPS);
  let next = 0;
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    const ops = i === 0 ? [{ k: 'reset' }] : [];
    while (next < sc.ops.length && sc.ops[next].at <= t) ops.push(sc.ops[next++]);
    emit(await page.evaluate(([dt, ov, o]) => window.__hangarFrame(dt, ov, o), [1 / FPS, overlayFor(sc, t), ops]));
    progress(sc, i, total);
  }
}

// ======================================================================================
// RUNNING IT
// ======================================================================================

let sceneStart = 0;
function progress(sc, i, total) {
  if (i % FPS === 0) log(`  scene ${sc.id}: ${Math.floor(i / FPS)}/${sc.secs} s  (${((Date.now() - sceneStart) / 1000).toFixed(0)} s so far)`);
}

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

async function openScene(browser, sc) {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: W, height: H } });
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => log('  PAGE ERROR:', e.message));
  await page.addInitScript((paints) => {
    try {
      sessionStorage.setItem('triad.skipIntro', '1');
      localStorage.setItem('triad.seenVersion', '99');
      localStorage.setItem('triad.gpuWarned', '1');
      localStorage.setItem('triad.program', 'air');
      // (the one-time "everyone back to factory paint" reset is done, then the paints this scene wants)
      localStorage.setItem('triad.paint.factoryReset.v2', '1');
      localStorage.setItem('triad.paint.v1', JSON.stringify(paints));
    } catch (e) {
      /* storage blocked */
    }
  }, sc.paints);
  log('  opening the game on the ' + sc.map + ' map...');
  await page.goto(`http://localhost:${PORT}/#map=${sc.map}`, { timeout: 0 });
  await page.bringToFront();
  for (let i = 0; i < 2400; i++) {
    if (await page.evaluate(() => !!(window.game && window.game.state === 'menu' && window.__THREE && window.__hangar)).catch(() => false)) break;
    await page.waitForTimeout(250);
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
  const ff = findFfmpeg();
  const dirs = SCENES.filter((s) => fs.existsSync(path.join(OUT, 's' + s.id)) && fs.readdirSync(path.join(OUT, 's' + s.id)).some((f) => f.endsWith('.jpg')));
  if (!dirs.length) {
    log('no pictures to put together.');
    return null;
  }
  if (!ff) {
    log('\nThe pictures are done, but no ffmpeg was found to make the video.');
    log('Make it with (from your my-video folder):');
    for (const s of dirs) log(`  npx remotion ffmpeg -y -framerate ${FPS} -i "${path.join(OUT, 's' + s.id, '%05d.jpg')}" -c:v libx264 -crf 17 -pix_fmt yuv420p "${path.join(OUT, 's' + s.id + '.mp4')}"`);
    log('then join the pieces s1.mp4 ... s5.mp4 in your editor.');
    return null;
  }
  const parts = [];
  for (const s of dirs) {
    const mp4 = path.join(OUT, 's' + s.id + '.mp4');
    log(`encoding scene ${s.id}...`);
    ffmpeg(ff, ['-y', '-framerate', String(FPS), '-i', path.join(OUT, 's' + s.id, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), mp4]);
    parts.push(mp4);
  }
  const list = path.join(OUT, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n') + '\n');
  const final = path.join(OUTROOT, 'triad-trailer.mp4');
  log('joining the scenes...');
  ffmpeg(ff, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
  if (!MUSIC) return final;
  if (!fs.existsSync(MUSIC)) {
    log(`\nThe music file was not found: ${MUSIC}\n(the video without music is at ${final})`);
    return final;
  }
  // the music under the picture: it starts with the video and ends with it (60 s)
  const withMusic = path.join(OUTROOT, 'triad-trailer-music.mp4');
  const secs = SCENES.reduce((a, sc) => a + sc.secs, 0);
  log('adding the music...');
  ffmpeg(ff, ['-y', '-i', final, '-i', MUSIC, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', String(secs), '-movflags', '+faststart', withMusic]);
  return withMusic;
}

function selfTest() {
  // (no browser: the timing and the text for every frame are worked out and checked)
  const total = SCENES.reduce((a, s) => a + s.secs, 0);
  console.log('scenes:', SCENES.map((s) => `${s.id}=${s.secs}s`).join(' '), '| total', total, 's');
  let bad = 0;
  for (const sc of SCENES) {
    for (let i = 0; i < sc.secs * FPS; i++) {
      const ov = overlayFor(sc, i / FPS);
      for (const v of [ov.fade, ov.flash, ov.dim]) if (!(v >= 0 && v <= 1.0001)) bad++;
      for (const l of ov.lines) if (!(l.a >= 0 && l.a <= 1.0001) || typeof l.text !== 'string') bad++;
    }
  }
  const fs4 = [0, 5.9, 6, 9.9, 10].map((t) => forceSpeed(SCENES[3], t));
  console.log('slow motion in scene 4 at 0, 5.9, 6, 9.9, 10 s:', fs4.join(' '));
  console.log(bad ? `PROBLEM: ${bad} bad overlay values` : 'overlays ok');
  if (total !== 60 || bad) process.exit(1);
}

async function main() {
  if (flag('help')) {
    const src = fs.readFileSync(__filename, 'utf8').split('\n');
    console.log(src.slice(0, src.findIndex((l) => l.startsWith("'use strict'"))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  if (flag('selftest')) return selfTest();
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
    for (const sc of SCENES) {
      if (ONLY && !ONLY.includes(sc.id)) continue;
      log(`\n=== scene ${sc.id} of ${SCENES.length}: ${sc.name} ===`);
      const dir = path.join(OUT, 's' + sc.id);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      let n = 0;
      const emit = (b64) => fs.writeFileSync(path.join(dir, String(++n).padStart(5, '0') + '.jpg'), Buffer.from(b64, 'base64'));
      sceneStart = Date.now();
      let page = null;
      try {
        page = await openScene(browser, sc);
        await sc.run(page, sc, emit);
        log(`  scene ${sc.id} done: ${n} pictures in ${((Date.now() - sceneStart) / 1000).toFixed(0)} s`);
      } catch (e) {
        failed.push(sc.id);
        log(`  SCENE ${sc.id} FAILED: ${e.message}`);
        log('  (the other scenes go on; run again with --only ' + sc.id + ' to redo this one)');
      } finally {
        if (page) await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    stopServer(server);
  }
  log(`\nthe pictures took ${((Date.now() - t0) / 60000).toFixed(1)} minutes.`);
  if (flag('no-encode')) return;
  const final = encode();
  if (final) {
    log('\nDONE: ' + final);
    log('open the folder with:  explorer ' + OUTROOT);
  }
  if (failed.length) log(`\nscenes that failed: ${failed.join(', ')} (see above)`);
}

main().catch((e) => {
  console.error('\nFAILED:', e && e.stack ? e.stack : e);
  process.exit(1);
});
