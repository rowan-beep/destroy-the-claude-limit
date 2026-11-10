// ONE COMMAND: records a 60-second TRIAD trailer from the game itself (on your graphics card)
// and encodes it to an MP4.
//
//   node tools/footage/trailer.cjs
//
// The scenes (60 s in all):
//   1  LOW PASS     9 s   a three-ship formation, then a burner pull-up, past a shaking camera (Jade Archipelago)
//   2  DOGFIGHT    17 s   a 5v5 team battle, AI pilots on both sides, a camera director (Triad Isles, dusk)
//   3  HANGAR       9 s   the paint shop and loadout screen: liveries and weapons changing on a turntable
//   4  DOGFIGHT    14 s   another 5v5, another map and other jets (Frostfall Strait)
//   5  SUNSET      11 s   a low pass over the open ocean, then the TRIAD.CHURCH end card
//
// Options (all optional):
//   --port 5173        the game server (it is started for you if it is not running)
//   --size 1920x1080   picture size (--size 960x540 is a quick preview)
//   --fps 30           frames per second
//   --out frames       where the pictures go (frames/trailer/s1 ... s5) and the finished video
//   --only 2,4         record just these scenes (then the video is put together from what exists)
//   --no-encode        only record the pictures
//   --software         draw on the CPU (a very slow test; the default is your graphics card)
//   --my-video <dir>   where Remotion is installed, to borrow its ffmpeg (default: ../my-video)
//   --help
//
// There is no sound: add music in your editor.

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
const [W, H] = opt('size', '1920x1080').split('x').map(Number);
const FPS = +opt('fps', '30');
const REPO = path.resolve(__dirname, '..', '..');
const OUTROOT = path.resolve(opt('out', 'frames'));
const OUT = path.join(OUTROOT, 'trailer');
const MYVIDEO = path.resolve(opt('my-video', path.join(REPO, '..', 'my-video')));
const ONLY = opt('only', '') ? opt('only', '').split(',').map((s) => +s) : null;
const SC = H / 1080; // text sizes scale with the picture

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ======================================================================================
// THE SCENES
// ======================================================================================

// the hangar: what changes when (s). A paint is a wrap or a solid colour with a finish; a load is
// an index into the jet's loadouts (the F-15EX: 0 everyday, 1 missile truck, 2 strike, ...)
const HANGAR_OPS = [
  { at: 0.9, k: 'paint', p: { wrap: 'inferno', finish: 'gloss' } },
  { at: 1.9, k: 'paint', p: { wrap: 'aurora', finish: 'gloss' } },
  { at: 2.9, k: 'paint', p: { wrap: 'galaxy', finish: 'metallic' } },
  { at: 3.9, k: 'paint', p: { solid: '#d42a1f', finish: 'gloss' } },
  { at: 4.9, k: 'paint', p: { wrap: 'arctic', finish: 'satin' } },
  { at: 5.5, k: 'load', i: 2 },
  { at: 6.4, k: 'paint', p: { wrap: 'blackice', finish: 'gloss' } },
  { at: 7.0, k: 'load', i: 1 },
  { at: 7.9, k: 'paint', p: { wrap: 'raptor', finish: 'satin' } },
];

// (saved paints for the jets the player flies in a scene: the AI jets get random ones from the game)
const wrap = (id, a, b, finish) => ({ mode: 'wrap', color: a, color2: b, wrap: id, finish, brightness: 1, suit: '' });

const SCENES = [
  {
    id: 1, name: 'LOW PASS (Jade Archipelago)', map: 'jade', secs: 9, run: sceneFly, paints: {},
    opts: {
      lead: 'F22', wings: ['F35A', 'SU57'], tod: 'afternoon', weather: 'clear', where: 'runway', sunElev: 28, sunOff: 150,
      passes: [
        // a three-ship formation, low, left to right, the camera on the ground beside the runway
        { t0: 0, kind: 'formation', dir: 1, speed: 300, mach: 0.93, alt: 24, passAt: 3.4, camAcross: 95, camH: 2.6, k: 8, frame: 40, fovMin: 20, fovMax: 62, shake: 1 },
        // then one jet past the camera and straight up on the afterburner
        { t0: 4.6, kind: 'climb', dir: -1, speed: 290, mach: 0.9, alt: 20, passAt: 2.3, climbAt: 2.4, camAcross: -70, camH: 2.2, k: 10, frame: 22, fovMin: 24, fovMax: 70, shake: 1.2 },
      ],
    },
  },
  {
    id: 2, name: '5v5 DOGFIGHT (Triad Isles, dusk)', map: 'triad', secs: 17, run: sceneFight,
    paints: { SU57: wrap('inferno', '#0d0706', '#ff5a14', 'gloss') },
    opts: { jet: 'SU57', tod: 'dusk', weather: 'cloudy', shiftNm: 10.5 },
  },
  { id: 3, name: 'HANGAR (paint and loadout)', map: 'triad', secs: 9, run: sceneHangar, paints: {}, opts: { type: 'F15EX' }, ops: HANGAR_OPS },
  {
    id: 4, name: '5v5 DOGFIGHT (Frostfall Strait)', map: 'frost', secs: 14, run: sceneFight,
    paints: { F22: wrap('blackice', '#020405', '#2ec4d4', 'gloss') },
    opts: { jet: 'F22', tod: 'morning', weather: 'clear', shiftNm: 10.5 },
  },
  {
    id: 5, name: 'SUNSET + END CARD (Open Ocean)', map: 'ocean', secs: 11, run: sceneFly, paints: {},
    opts: {
      lead: 'TYPHOON', wings: ['RAFALE'], tod: 'dusk', weather: 'clear', where: 'sea', heading: 100, sunElev: 5, sunHdg: 12,
      passes: [{ t0: 0, kind: 'formation', dir: 1, speed: 250, mach: 0.78, alt: 30, passAt: 4.4, camAcross: 120, camH: 3.2, k: 7, frame: 40, fovMin: 14, fovMax: 60, shake: 0.8 }],
    },
  },
];

// ======================================================================================
// TEXT ON THE PICTURES (computed here, drawn in the page)
// ======================================================================================

const ramp = (t, a, b, fi = 0.35, fo = 0.35) => Math.max(0, Math.min(1, (t - a) / fi, (b - t) / fo));
const caption = (text, t, a, b) => ({ text, x: 0.05, y: 0.87, size: 54 * SC, track: 0.14, a: ramp(t, a, b) });
const mark = () => ({ text: 'TRIAD.CHURCH', align: 'right', x: 0.03, y: 0.94, size: 26 * SC, track: 0.3, w: 600, a: 0.55 });

/** what is drawn over the picture at `t` seconds into scene `sc`: black fades, flashes, dimming, text */
function overlayFor(sc, t) {
  const lines = [];
  let flash = 0;
  let dim = 0;
  let dip = 0;
  switch (sc.id) {
    case 1:
      lines.push({ text: 'TRIAD', align: 'center', y: 0.44, size: 190 * SC, track: 0.3, a: ramp(t, 0.4, 3.7, 0.8, 0.8) });
      lines.push({ text: 'AIR COMBAT', align: 'center', y: 0.58, size: 46 * SC, track: 0.55, w: 600, a: ramp(t, 0.9, 3.7, 0.7, 0.8) });
      lines.push(caption('13 REAL JETS', t, 5.2, 8.3));
      dip = Math.max(0, 1 - Math.abs(t - 4.6) / 0.13); // a quick dip to black on the cut between the two passes
      break;
    case 2:
      lines.push(caption('5 v 5 DOGFIGHTS', t, 0.5, 3.4));
      lines.push(caption('RADAR MISSILES · HEAT SEEKERS · GUNS', t, 8.5, 12.2));
      lines.push(mark());
      break;
    case 3: {
      lines.push(caption('CUSTOMIZE YOUR JET', t, 0.3, 3.6));
      lines.push(caption('CHOOSE YOUR LOADOUT', t, 5.3, 8.4));
      lines.push(mark());
      let last = -9;
      for (const op of sc.ops) if (t >= op.at) last = op.at;
      flash = 0.5 * Math.max(0, 1 - (t - last) / 0.2); // a flash on every change
      break;
    }
    case 4:
      lines.push(caption('FOUR THEATERS', t, 0.5, 3.4));
      lines.push(caption('FLY ANY OF 13 JETS', t, 6.8, 10.4));
      lines.push(mark());
      break;
    case 5:
      dim = 0.42 * Math.max(0, Math.min(1, (t - 3.8) / 1.4));
      lines.push({ text: 'TRIAD', align: 'center', y: 0.42, size: 200 * SC, track: 0.3, a: ramp(t, 4.6, 99, 0.9, 1) });
      lines.push({ text: 'PLAY IN YOUR BROWSER', align: 'center', y: 0.57, size: 50 * SC, track: 0.5, w: 600, a: ramp(t, 5.5, 99, 0.8, 1) });
      lines.push({ text: 'TRIAD.CHURCH', align: 'center', y: 0.67, size: 72 * SC, track: 0.35, a: ramp(t, 6.2, 99, 0.8, 1) });
      break;
    default:
  }
  // every scene fades in from black and out to black
  const fade = Math.max(0, 1 - t / 0.2, 1 - (sc.secs - t) / 0.2, dip);
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
        if (l.align === 'center') {
          ctx.textAlign = 'center';
          ctx.fillText(l.text, W / 2 + sp / 2, l.y * H);
        } else if (l.align === 'right') {
          ctx.textAlign = 'right';
          ctx.fillText(l.text, W - l.x * W + sp, l.y * H);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(l.text, l.x * W, l.y * H);
        }
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

// ---------------------------------------------------------------- the fly-bys (the cinematic tool's scripted jets)

/**
 * o: { lead, wings[], tod, weather, where: 'runway'|'sea', heading?, sunElev, sunOff?|sunHdg?, passes[] }
 * Sets up the theater with scripted jets (posed every frame by __flyFrame) and a camera on the ground.
 */
async function flyInit(o) {
  const c = window.cine;
  const g = window.game;
  const THREE = window.__THREE;
  const D = Math.PI / 180;
  const { ROLES } = await import('/src/world/islands.ts');
  await c.start({ jet: o.lead, tod: o.tod, weather: o.weather });
  const p = g.player;
  const wings = [];
  for (const t of o.wings) wings.push(await c.add(t));
  let ox, oz, hdg, ground;
  if (o.where === 'runway') {
    // along the blue runway, the camera on the grass beside it
    const f = ROLES.duelBlue;
    ox = f.x;
    oz = f.z;
    hdg = Math.atan2(f.ax, -f.az) / D;
    ground = f.elev;
  } else {
    // out over open water
    const s = await c.findSea(p.fm.pos.x, p.fm.pos.z, 3000);
    ox = s[0];
    oz = s[1];
    hdg = o.heading;
    ground = 0;
  }
  window.__fly = { c, g, THREE, D, p, wings, ox, oz, hdg, ground, o, pass: -1, look: new THREE.Vector3(), cpos: null, sunDone: false };
}

/** one frame of a fly-by at t seconds; returns the JPEG */
async function flyFrame(t, dt, ov) {
  const S = window.__fly;
  const c = S.c;
  const g = S.g;
  const THREE = S.THREE;
  const D = S.D;
  const o = S.o;
  let idx = 0;
  for (let i = 0; i < o.passes.length; i++) if (t >= o.passes[i].t0) idx = i;
  const P = o.passes[idx];
  const enter = idx !== S.pass;
  const Hh = S.hdg + (P.dir < 0 ? 180 : 0);
  const dx = Math.sin(Hh * D);
  const dz = -Math.cos(Hh * D); // along the flight line
  const rx = Math.cos(Hh * D);
  const rz = Math.sin(Hh * D); // to its right
  const y0 = S.ground + P.alt;
  const tl = t - P.t0;
  let lx, ly, lz;
  let pitch = 0;
  let roll = 0;
  let aoa = 3;
  let gl = 1.1;
  let spd = P.speed;
  if (P.kind === 'climb') {
    if (enter || !S.cpos) S.cpos = new THREE.Vector3(S.ox - dx * P.speed * P.passAt, y0, S.oz - dz * P.speed * P.passAt);
    const k = Math.max(0, tl - P.climbAt);
    pitch = Math.min(85, k * 58);
    spd = P.speed * (1 - 0.1 * Math.min(k, 3));
    const pr = pitch * D;
    S.cpos.x += dx * Math.cos(pr) * spd * dt;
    S.cpos.y += Math.sin(pr) * spd * dt;
    S.cpos.z += dz * Math.cos(pr) * spd * dt;
    roll = 20 * Math.sin(Math.min(1, k / 1.5) * Math.PI);
    if (pitch > 5) {
      aoa = 12;
      gl = 4.5;
    }
    lx = S.cpos.x;
    ly = S.cpos.y;
    lz = S.cpos.z;
  } else {
    const along = P.speed * (tl - P.passAt);
    lx = S.ox + dx * along;
    lz = S.oz + dz * along;
    ly = y0 + 1.5 * Math.sin(tl * 1.7);
    roll = 5 * Math.sin(tl * 1.3);
  }
  const camX = S.ox + rx * P.camAcross;
  const camZ = S.oz + rz * P.camAcross;
  const camY = S.ground + P.camH;
  if (enter) {
    // a new pass: the smoke and trails of the last one go, the camera starts on its jet
    try {
      g.combat.clearEffects();
    } catch (e) {
      /* nothing to clear */
    }
    S.look.set(lx, ly, lz);
  }
  if (!S.sunDone) {
    // the sun for the whole scene (the game's light and reflections follow it)
    const brg = Math.atan2(S.ox - camX, -(S.oz - camZ)) / D;
    c.sun(o.sunElev, o.sunHdg != null ? S.hdg + o.sunHdg : brg + o.sunOff);
    try {
      g.world.bakeLighting(g.renderer.renderer);
      g.world.env.buildEnvMap(g.renderer.renderer);
    } catch (e) {
      /* the sun alone is fine */
    }
    S.sunDone = true;
  }
  c.pose(S.p, { pos: [lx, ly, lz], hdg: Hh, pitch, roll, aoa, speed: spd, mach: P.mach, g: gl, ab: 1 });
  S.wings.forEach((w, i) => {
    if (P.kind === 'climb') {
      // (the wingmen are out of the picture for the pull-up)
      c.pose(w, { pos: [lx, -50000, lz], hdg: Hh, speed: 200 });
      return;
    }
    const side = i % 2 ? 1 : -1;
    const rank = 1 + Math.floor(i / 2);
    const back = 42 * rank;
    const out = 52 * rank * side;
    c.pose(w, {
      pos: [lx - dx * back + rx * out, ly + 1.2 * Math.sin(tl * 2 + i), lz - dz * back + rz * out],
      hdg: Hh, pitch: 0, roll: 5 * Math.sin(tl * 1.4 + i * 2), aoa: 3, speed: P.speed, mach: P.mach, g: 1.1, ab: 1,
    });
  });
  // the camera: on the ground, tracking the lead a little late (the pan lags), zooming to keep the jets framed
  S.look.lerp(new THREE.Vector3(lx, ly, lz), 1 - Math.exp(-dt * P.k));
  const dist = Math.hypot(camX - lx, camY - ly, camZ - lz);
  const fov = Math.max(P.fovMin, Math.min(P.fovMax, (2 * Math.atan(P.frame / Math.max(dist, 1))) / D));
  c.view([camX, camY, camZ], [S.look.x, S.look.y, S.look.z], fov, 0);
  // the shake: a handheld judder that jumps as the jets go by
  const amp = P.shake * (0.35 + 1.5 * Math.exp(-dist / 160)) * 0.004;
  const cam = g.renderer.camera;
  cam.rotateX(Math.sin(t * 53) * amp + Math.sin(t * 91) * amp * 0.5);
  cam.rotateY(Math.sin(t * 47) * amp);
  cam.rotateZ(Math.sin(t * 71) * amp * 0.4);
  S.pass = idx;
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
 * camera director in charge of the view: chase, wing, orbit, fly-by, missile and kill cameras, with shake.
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

  // the player's jet is flown by an AI pilot too, on its team's patrol route
  const attachAI = (p) => {
    const ally = g.sim.aircraft.find((a) => a.team === 'blue' && a !== p && a.ai && a.ai.route && a.ai.route.length);
    p.ai = new AIPilot(p, duelSkill('HARD'), g.picture);
    if (ally) p.ai.setRoute(ally.ai.route.map((v) => v.clone()), ally.ai.patrolAlt);
  };

  // ---- the camera director
  const cam = g.renderer.camera;
  const Dr = { t: 0, shot: null, shake: 0, lastSubj: null, lastMissileAt: -99, lastWreckAt: -99, pendMissile: null, pendKill: null, warned: false };
  const t1 = new V();
  const t2 = new V();
  const eul = new THREE.Euler(0, 0, 0, 'YXZ');
  const qq = new THREE.Quaternion();
  const aboveGround = (p, min) => {
    const gh = Math.max(0, surfaceHeight(p.x, p.z));
    if (p.y < gh + min) p.y = gh + min;
  };
  const inSim = (a) => !!a && g.sim.aircraft.indexOf(a) >= 0;
  g.sim.events.on('launch', (e) => {
    if (Dr.t - Dr.lastMissileAt > 7 && Math.random() < 0.75) Dr.pendMissile = e.missile;
  });
  g.sim.events.on('destroyed', (e) => {
    Dr.shake = Math.min(1.6, Dr.shake + 0.8);
    if (Dr.t - Dr.lastWreckAt > 4.5 && inSim(e.victim)) Dr.pendKill = e.victim;
  });
  const mk = (kind, subj, extra) => Object.assign({ kind, subj, t: 0, dur: 4, shake: 0.3, fov: 55, pos: new V(), look: new V(), init: false, side: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * 6.283 }, extra);
  // the jet with the most going on: near the enemy, a missile in the air, burners lit, and not the one we just saw
  const pickSubject = () => {
    const jets = g.sim.aircraft.filter((a) => a.alive);
    if (!jets.length) return null;
    let best = null;
    let bs = -1e9;
    for (const a of jets) {
      let dmin = 1e9;
      for (const b of jets) if (b.team !== a.team) dmin = Math.min(dmin, a.fm.pos.distanceTo(b.fm.pos));
      let s = -Math.min(dmin, 30000) / 1500;
      if (a === Dr.lastSubj) s -= 5;
      for (const m of g.sim.missiles) if (m.alive && (m.target === a || m.shooter === a)) s += 2.5;
      if (a.fm.afterburner > 0.5) s += 0.8;
      s += Math.random() * 2.5;
      if (s > bs) {
        bs = s;
        best = a;
      }
    }
    return best;
  };
  const nextShot = () => {
    const s = pickSubject();
    if (!s) return null;
    Dr.lastSubj = s;
    const r = Math.random();
    const spd = s.fm.vel.length();
    if (r < 0.3) return mk('chase', s, { dur: 3.2 + Math.random() * 2, fov: 58, shake: 0.4 });
    if (r < 0.52) return mk('wing', s, { dur: 3 + Math.random() * 1.8, fov: 52, shake: 0.55 });
    if (r < 0.75 || spd < 120) return mk('orbit', s, { dur: 3.5 + Math.random() * 1.8, fov: 48, shake: 0.3 });
    return mk('flyby', s, { dur: 5, fov: 32, shake: 0.8 });
  };
  const bad = (s) => (s.kind === 'missile' ? false : !s.subj || !inSim(s.subj) || (s.kind !== 'wreck' && !s.subj.alive));

  const place = (s, dt) => {
    const fm = s.subj ? s.subj.fm : null;
    const len = s.subj ? s.subj.spec.length : 16;
    let shake = s.shake;
    let up = null;
    if (s.kind === 'chase') {
      // behind and above, a little to one side, the position following with a short lag
      t1.copy(fm.fwd).multiplyScalar(-(len * 1.1 + 6)).add(fm.pos);
      t1.y += len * 0.3 + 2;
      t1.addScaledVector(fm.right, s.side * len * 0.35);
      if (!s.init) {
        s.pos.copy(t1);
        s.init = true;
      } else s.pos.lerp(t1, 1 - Math.exp(-dt * 12));
      s.look.copy(fm.pos).addScaledVector(fm.fwd, len * 0.7);
    } else if (s.kind === 'wing') {
      // off the wingtip, rolling with the jet (the horizon tilts in the turns)
      s.pos.copy(fm.pos).addScaledVector(fm.right, s.side * len * 0.9).addScaledVector(fm.up, len * 0.18).addScaledVector(fm.fwd, -len * 0.25);
      s.look.copy(fm.pos).addScaledVector(fm.fwd, len * 0.15);
      up = fm.up;
    } else if (s.kind === 'orbit') {
      // circling the jet as it flies
      const a = s.seed + s.t * 0.55;
      const r = len * 2 + 10;
      const e = 0.22 + 0.14 * Math.sin(s.t * 0.8 + s.seed);
      s.pos.set(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r).add(fm.pos);
      s.look.copy(fm.pos);
    } else if (s.kind === 'flyby') {
      // a camera left in the sky ahead of the jet: it passes close, the camera whips round and shakes
      if (!s.init) {
        const sp = Math.max(120, fm.vel.length());
        t1.copy(fm.vel).setLength(sp * 1.9);
        s.pos.copy(fm.pos).add(t1).addScaledVector(fm.right, s.side * (45 + Math.random() * 40));
        s.pos.y += 4 + Math.random() * 18;
        s.look.copy(fm.pos);
        s.init = true;
      }
      s.look.lerp(fm.pos, 1 - Math.exp(-dt * 9));
      const dist = s.pos.distanceTo(fm.pos);
      shake = 0.35 + 1.5 * Math.exp(-dist / 120);
      t1.subVectors(fm.pos, s.pos);
      if (s.t > 1 && t1.dot(fm.vel) > 0 && dist > 140) s.dur = Math.min(s.dur, s.t + 0.6);
    } else if (s.kind === 'missile') {
      // riding behind a missile in flight, looking at its target
      const m = s.missile;
      if (!m.alive) {
        s.gone = (s.gone || 0) + dt;
        if (s.gone > 1) s.dur = 0;
      }
      t1.copy(m.vel);
      if (t1.lengthSq() < 1) t1.set(0, 0, -1);
      t1.normalize();
      t2.copy(m.pos).addScaledVector(t1, -11);
      t2.y += 2.4;
      if (!s.init) {
        s.pos.copy(t2);
        s.init = true;
      } else s.pos.lerp(t2, 1 - Math.exp(-dt * 14));
      if (m.target && m.target.alive) s.look.copy(m.target.fm.pos);
      else s.look.copy(m.pos).addScaledVector(t1, 120);
    } else {
      // a kill: the camera falls with the wreck at a short distance
      if (!s.init) {
        s.off = new V(Math.cos(s.seed), 0.22, Math.sin(s.seed)).multiplyScalar(70 + Math.random() * 50);
        s.init = true;
      }
      s.pos.copy(fm.pos).add(s.off);
      s.look.copy(fm.pos);
      shake = 0.3;
    }
    aboveGround(s.pos, 3);
    if (!(isFinite(s.pos.x) && isFinite(s.pos.y) && isFinite(s.look.x))) throw new Error('bad camera position');
    cam.position.copy(s.pos);
    if (up) cam.up.copy(up);
    else cam.up.set(0, 1, 0);
    cam.lookAt(s.look);
    const amp = (shake + Dr.shake) * 0.006;
    const T = Dr.t;
    eul.set(Math.sin(T * 53) * amp + Math.sin(T * 91) * amp * 0.5, Math.sin(T * 47) * amp, Math.sin(T * 71) * amp * 0.3);
    cam.quaternion.multiply(qq.setFromEuler(eul));
    cam.fov = s.fov;
    cam.updateProjectionMatrix();
  };

  const direct = (dt) => {
    Dr.t += dt;
    Dr.shake = Math.max(0, Dr.shake - dt * 1.1);
    // (the game's own explosion shake: it is never worked off here, so take it and clear it)
    if (g.cam.shake > 0) {
      Dr.shake = Math.min(1.6, Dr.shake + g.cam.shake * 0.5);
      g.cam.shake = 0;
    }
    let s = Dr.shot;
    if (Dr.pendMissile && Dr.pendMissile.alive) {
      s = mk('missile', null, { missile: Dr.pendMissile, dur: 6, fov: 58, shake: 0.6 });
      Dr.lastMissileAt = Dr.t;
    } else if (Dr.pendKill) {
      s = mk('wreck', Dr.pendKill, { dur: 2.8, fov: 50 });
      Dr.lastWreckAt = Dr.t;
    } else if (!s || s.t >= s.dur || bad(s)) s = nextShot();
    Dr.pendMissile = null;
    Dr.pendKill = null;
    if (!s) return;
    Dr.shot = s;
    s.t += dt;
    place(s, dt);
  };
  const orig = g.cam.update.bind(g.cam);
  g.cam.update = (dt, ac, eye) => {
    try {
      direct(dt);
    } catch (e) {
      // (the game's own camera, if the director ever fails: the footage goes on)
      if (!Dr.warned) {
        Dr.warned = true;
        console.warn('camera director failed', e);
      }
      orig(dt, ac, eye);
    }
  };
  window.__fight = { Dr, attachAI };
}

/** one frame of the fight (draws it if an overlay is given) */
async function fightStep(dt, ov) {
  const g = window.game;
  if (g.state === 'paused') g.setState('playing');
  const p = g.player;
  if (p && p.alive && !p.ai) window.__fight.attachAI(p);
  g.frame(dt);
  return ov ? window.__grab(ov) : null;
}

/** run the sim on without drawing until the fight starts (the five-second briefing), at most `max` frames */
function fightFast(max) {
  const g = window.game;
  g.renderer.render = () => {};
  let n = 0;
  try {
    for (; n < max; n++) {
      if (g.state === 'paused') g.setState('playing');
      const p = g.player;
      if (p && p.alive && !p.ai) window.__fight.attachAI(p);
      g.frame(1 / 30);
      if (g.mode && g.mode.phase === 'combat') break;
    }
  } finally {
    delete g.renderer.render;
  }
  return n;
}

// ---------------------------------------------------------------- the hangar

/** o: { type, dur, W, H } the hangar's own camera is replaced by a slow orbit that tightens as the scene goes on */
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
    const yaw = 0.4 + t * 0.42;
    const pitch = 0.1 + 0.1 * Math.sin(t * 0.8);
    const dist = 21 - 7 * ease;
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
    cam.rotateX(Math.sin(t * 7.1) * 0.0012);
    cam.rotateY(Math.sin(t * 5.3) * 0.0012);
    cam.fov = 54 - 14 * ease;
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
  log('  the battle is set up; letting the terrain load...');
  for (let i = 0; i < 40; i++) {
    await page.evaluate(([dt]) => window.__fightStep(dt, null), [1 / 30]);
    await page.waitForTimeout(40);
  }
  const n = await page.evaluate(() => window.__fightFast(900));
  log(`  briefing over after ${(n / 30).toFixed(1)} s; the fight is on`);
  for (let i = 0; i < 45; i++) {
    await page.evaluate(([dt]) => window.__fightStep(dt, null), [1 / 30]);
    await page.waitForTimeout(40);
  }
  const total = Math.round(sc.secs * FPS);
  for (let i = 0; i < total; i++) {
    emit(await page.evaluate(([dt, ov]) => window.__fightStep(dt, ov), [1 / FPS, overlayFor(sc, i / FPS)]));
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
  return final;
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
