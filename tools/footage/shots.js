// The trailer's shots, run inside the game's page by tools/footage/trailer.cjs (with tools/cinematics/lib.js).
//
// Every jet is flown by the game's own flight model: real physics, the wind and turbulence of the
// weather, the inertia of the airframe. A "pilot" (the AI's own steering) flies each one through its
// manoeuvre, wingmen hold their slots the way pilots do (never perfectly), and the catapult, the
// arresting wires, the tanker's boom, the missiles, flares and bombs are the game's own.
//
// The camera is a camera plane: it follows a smoothed copy of the jet, so the jet moves in the frame
// (bumps, corrections, the formation shuffling); it swings round late in turns and floats a little.
//
// A shot is { mission, init(S), frame(S, dt), end?(S) }; S.t is the time into the shot.
window.TR = (() => {
  const D = Math.PI / 180;
  const G = () => window.game;
  const C = () => window.cine;
  const T3 = () => window.__THREE;
  const v3 = (x = 0, y = 0, z = 0) => new (T3().Vector3)(x, y, z);
  const sm = (a, b, x) => {
    const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const mix = (a, b, u) => a + (b - a) * u;
  const dirOf = (h) => v3(Math.sin(h * D), 0, -Math.cos(h * D));
  const rightOf = (h) => v3(Math.cos(h * D), 0, Math.sin(h * D));
  const hdgOf = (dx, dz) => Math.atan2(dx, -dz) / D;
  const KT = 0.514444;

  const TR = { key: '', jets: {}, shared: {}, focus: null, gfx: null, mods: null, sea: null, peak: null, start: null };

  /** the lens: `hf` is the angle seen across the WIDTH of the picture (deg), whatever its shape */
  const lens = (hf) => {
    const a = G().renderer.camera.aspect;
    return Math.min(100, (2 * Math.atan(Math.tan((hf * D) / 2) / a)) / D);
  };
  const look = (from, at, hf) => {
    C().view([from.x, from.y, from.z], [at.x, at.y, at.z], lens(hf), 0);
    TR.focus = at.clone();
  };
  const ground = (x, z) => Math.max(0, TR.mods.surfaceHeight(x, z));
  const highAlong = (x, z, h, len) => {
    const d = dirOf(h);
    let m = 0;
    for (let s = 0; s <= len; s += 120) m = Math.max(m, ground(x + d.x * s, z + d.z * s));
    return m;
  };
  const sun = (elev, az) => {
    const g = G();
    C().sun(elev, az);
    try {
      g.sim.sunDir.copy(g.world.env.sunDir);
      g.world.env.buildEnvMap(g.renderer.renderer);
      g.world.bakeLighting(g.renderer.renderer);
    } catch (e) {
      /* the sun alone is fine */
    }
  };

  // ------------------------------------------------------------------ jets and their pilots
  const park = (a) => {
    a.scripted = true;
    a.script = null;
    a.ai = null;
    a.fm.pos.set(a.fm.pos.x, -50000, a.fm.pos.z);
    a.fm.vel.set(0, 0, 0);
  };
  /** another jet in the flight (made once per flight, reused) */
  const jet = (type, team = 'blue') => {
    const k = type + ':' + team;
    let a = TR.jets[k];
    if (a && !a.alive) {
      G().sim.remove(a);
      a = null;
    }
    if (!a) {
      a = new TR.mods.Aircraft(type, team, team === 'red' ? 'BANDIT' : 'CINE');
      park(a);
      G().sim.add(a);
      TR.jets[k] = a;
    }
    return a;
  };
  /** put a jet in the air and give it a pilot: fn(dt) sets its stick and throttle every physics step */
  const fly = (a, pos, hdg, kts, pitch, fn) => {
    a.scripted = false;
    a.script = null;
    a.fm.setAirborne(pos, hdg, kts * KT, pitch || 0);
    a.controls.gearDown = false;
    a.controls.throttle = 0.9;
    a.controls.pitch = a.controls.roll = a.controls.yaw = 0;
    a.ai = { skill: {}, state: 'PATROL', target: null, route: [], update: (dt) => fn(dt) };
    return a;
  };
  const steer = (a, dir, o) => TR.mods.steerToward(a, dir, Object.assign({ gCap: 3, tau: 1.6, maxBank: 35 }, o));
  const speed = (a, kts, ab, dt) => TR.mods.holdSpeed(a, kts * KT, !!ab, dt);
  /** a direction toward a compass heading, climbing (deg) */
  const toward = (h, climb = 0) => {
    const d = dirOf(h);
    d.y = Math.tan(climb * D);
    return d.normalize();
  };
  /** fly level on a heading at a height, as a pilot does: small corrections, never exact */
  const cruise = (a, h, alt, kts, dt, o = {}) => {
    const climb = Math.max(-8, Math.min(8, (alt - a.fm.pos.y) * 0.05));
    steer(a, toward(h, climb), o);
    speed(a, kts, o.ab, dt);
  };
  /** hold a slot (right, up, back of the lead, in metres) as a wingman does */
  const slot = (a, lead, r, u, b, dt, o = {}) => {
    const lf = lead.fm;
    const h = hdgOf(lf.vel.x, lf.vel.z);
    const want = lf.pos.clone().addScaledVector(rightOf(h), r).addScaledVector(dirOf(h), -b).add(v3(0, u, 0));
    const ahead = want.clone().addScaledVector(lf.vel, 1.4);
    const err = want.clone().sub(a.fm.pos);
    const along = err.dot(dirOf(h));
    steer(a, ahead.sub(a.fm.pos), Object.assign({ gCap: 3, tau: 1.0, maxBank: 40 }, o));
    speed(a, Math.max(120, lf.cas / KT + along * 0.6), o.ab, dt);
  };

  /** everything parked, no weapons in the air, no smoke left from the last shot */
  const clear = () => {
    const g = G();
    for (const a of g.sim.aircraft) park(a);
    g.sim.missiles.length = 0;
    try {
      g.combat.clearEffects();
    } catch (e) {
      /* nothing to clear */
    }
  };
  /** the world on by dt: every jet's pilot and physics, the weapons, the carriers (pre: once per step) */
  const physics = (dt, pre) => {
    const g = G();
    const n = Math.max(0, Math.round(dt * 120));
    for (let i = 0; i < n; i++) {
      if (pre) pre(1 / 120);
      g.sim.step(1 / 120);
    }
  };

  // ------------------------------------------------------------------ the camera plane
  /**
   * A camera that follows `a` from an offset (right, up, back) in the frame of the jet's smoothed flight
   * path. It follows a smoothed copy of the jet, so the jet bumps and wanders in the frame; the offset
   * swings round late in turns; it floats a little.
   * o: { off: [r,u,b] or fn(u) -> [r,u,b], at: [r,u,ahead], hf (deg across), pitch (follow climbs 0..1), k (follow), seed }
   */
  const rig = (S, a, o) => {
    const f = a.fm;
    const R = S.rig || (S.rig = { p: f.pos.clone(), v: f.vel.clone(), off: null, seed: o.seed != null ? o.seed : Math.random() * 10 });
    return (dt) => {
      const k = o.k || 2.2;
      R.v.lerp(f.vel, 1 - Math.exp(-dt * 2.5));
      R.p.addScaledVector(R.v, dt);
      R.p.lerp(f.pos, 1 - Math.exp(-dt * k));
      const sp = R.v.length() > 1 ? R.v.clone().normalize() : dirOf(hdgOf(f.fwd.x, f.fwd.z));
      const h = hdgOf(sp.x, sp.z);
      const pf = o.pitch || 0;
      const fwd = dirOf(h).multiplyScalar(Math.cos(Math.asin(Math.max(-1, Math.min(1, sp.y))) * pf)).add(v3(0, sp.y * pf, 0)).normalize();
      const right = rightOf(h);
      const up = right.clone().cross(fwd);
      const u = S.dur ? Math.min(1, S.t / S.dur) : 0;
      const off = typeof o.off === 'function' ? o.off(sm(0, 1, u)) : o.off;
      const want = right.clone().multiplyScalar(off[0]).addScaledVector(up, off[1]).addScaledVector(fwd, -off[2]);
      if (!R.off) R.off = want.clone();
      R.off.lerp(want, 1 - Math.exp(-dt * (o.swing || 1.6)));
      const s = R.seed;
      const t = S.t;
      const drift = v3(Math.sin(t * 0.37 + s) * 1.4 + Math.sin(t * 0.91 + s * 2) * 0.5, Math.sin(t * 0.53 + s * 3) * 0.9, Math.sin(t * 0.29 + s * 4) * 1.2);
      const cam = R.p.clone().add(R.off).add(drift);
      const gh = ground(cam.x, cam.z) + 3;
      if (cam.y < gh) cam.y = gh;
      const at = o.at || [0, 0, 20];
      let tgt = R.p.clone().addScaledVector(right, at[0]).addScaledVector(up, at[1]).addScaledVector(fwd, at[2]);
      if (o.with) {
        // two jets in the picture: aim between them, smoothly
        const w = o.with.fm.pos.clone().lerp(f.pos, 1 - (o.withK || 0.35));
        R.lk = R.lk ? R.lk.lerp(w, 1 - Math.exp(-dt * 3)) : w;
        tgt = R.lk.clone();
      }
      const hf = typeof o.hf === 'function' ? o.hf(sm(0, 1, u)) : o.hf || 40;
      look(cam, tgt, hf);
    };
  };

  /** start (or reuse) the flight a shot needs, and set its light and weather */
  async function mission(m) {
    const g = G();
    const key = m.jet + '|' + (m.mode || 'free');
    if (TR.key !== key) {
      document.querySelector('.menu-root')?.classList.add('hidden');
      if (TR.gfx) Object.assign(g.settings.graphics, TR.gfx);
      const cfg = Object.assign(TR.mods.defaultMission(), { mode: m.mode || 'free', aircraft: m.jet, loadoutId: m.loadout || '', freeStart: 'air', timeOfDay: m.tod || 'afternoon', difficulty: 'EASY' });
      await g.startMission(cfg, () => {});
      if (g.state === 'briefing') g.acceptBriefing();
      g.running = false; // (from here every frame is drawn by the script)
      g.applySettings();
      g.hud.root.style.display = 'none';
      TR.key = key;
      TR.jets = {};
      TR.shared = {};
      const p0 = g.player.fm.pos;
      TR.start = [p0.x, p0.z];
      TR.sea = await C().findSea(p0.x, p0.z, 3000);
      TR.peak = await C().findHigh(p0.x, p0.z, 30000);
      // (nothing on the ground shoots at the film crew, and no AI joins in)
      g.sim.defenses.length = 0;
      for (const a of g.sim.aircraft) if (a !== g.player) a.ai = null;
    }
    clear();
    g.world.env.setTimeOfDay(m.tod || 'afternoon');
    g.world.setWeather({ ...TR.mods.WEATHER_PRESETS[m.weather || 'clear'] });
    g.sim.sunDir.copy(g.world.env.sunDir);
    try {
      g.world.env.buildEnvMap(g.renderer.renderer);
      g.world.bakeLighting(g.renderer.renderer);
    } catch (e) {
      /* the light of the flight's own start is fine */
    }
  }

  // ====================================================================================
  // THE SHOTS
  // ====================================================================================
  const shots = {};
  const aim = (pk, from) => {
    let ux = pk[0] - from[0];
    let uz = pk[1] - from[1];
    const ul = Math.hypot(ux, uz) || 1;
    return [ux / ul, uz / ul];
  };

  // ---- TITLE: three jets over the sea toward the islands, the camera plane easing in behind
  shots.title = {
    mission: { jet: 'F22', tod: 'afternoon', weather: 'cloudy' },
    async init(S) {
      const g = G();
      const pk = TR.peak;
      const [ux, uz] = aim(pk, TR.start);
      const s = await C().findSea(pk[0] - ux * 9000, pk[1] - uz * 9000, 1500);
      const h = pk[2] > 20 ? hdgOf(pk[0] - s[0], pk[1] - s[1]) : 90;
      const alt = Math.max(220, highAlong(s[0], s[1], h, 5000) + 140);
      TR.shared.line = { x: s[0], z: s[1], h, alt };
      const L = fly(g.player, v3(s[0], alt, s[1]), h, 430, 0, (dt) => cruise(L, h + 3 * Math.sin(S.t * 0.25), alt, 430, dt, { maxBank: 20 }));
      const r = rightOf(h);
      const d = dirOf(h);
      const w1 = jet('SU57');
      const w2 = jet('SU57');
      fly(w1, v3(s[0], alt, s[1]).addScaledVector(r, -11).addScaledVector(d, -22), h, 430, 0, (dt) => slot(w1, L, -11, -2, 22, dt));
      fly(w2, v3(s[0], alt, s[1]).addScaledVector(r, 11).addScaledVector(d, -44), h, 430, 0, (dt) => slot(w2, L, 11, -4, 44, dt));
      physics(1.5); // (settled in: everyone flying, the slots found)
      S.cam = rig(S, L, { off: (u) => [mix(10, 5, u), mix(42, 26, u), mix(145, 100, u)], at: [0, -2, -18], hf: (u) => mix(36, 32, u), seed: 1 });
      sun(30, h + 140);
    },
    frame(S, dt) {
      physics(dt);
      S.cam(dt);
    },
  };

  // ---- COCKPIT: the real cockpit view, banking gently round toward the island
  shots.cockpit = {
    mission: { jet: 'F22', tod: 'afternoon', weather: 'cloudy' },
    ownDraw: true,
    async init(S) {
      const g = G();
      const p = g.player;
      const ln = TR.shared.line || { x: TR.sea[0], z: TR.sea[1], h: 90, alt: 250 };
      const d = dirOf(ln.h);
      const x = ln.x + d.x * 1500;
      const z = ln.z + d.z * 1500;
      const alt = Math.max(240, highAlong(x, z, ln.h, 6000) + 140);
      fly(p, v3(x, alt, z), ln.h - 25, 450, 0, (dt) => {
        steer(p, toward(ln.h + 15, (alt - p.fm.pos.y) * 0.03), { gCap: 2.5, tau: 2.2, maxBank: 32 });
        speed(p, 450, false, dt);
      });
      physics(1.2);
      if (g.state !== 'playing') g.setState('playing');
      S.fov = g.cam.fovBase;
      g.cam.fovBase = 84;
      g.cam.setMode('cockpit');
      sun(30, ln.h + 140);
    },
    frame(S, dt, render) {
      const g = G();
      if (g.state !== 'playing') g.setState('playing');
      if (!render) g.renderer.render = () => {};
      try {
        g.frame(dt);
      } finally {
        if (!render) delete g.renderer.render;
      }
    },
    end(S) {
      const g = G();
      g.cam.fovBase = S.fov;
      g.cam.setMode('chase');
      g.renderer.setOverlay(null, null);
    },
  };

  // ---- THE JETS: four, each in a real manoeuvre
  const JETS = [
    // a hard turn low over the water, seen from outside the turn
    { type: 'SU57', alt: 160, kts: 470, pitch: 0, off: [-46, 8, 30], at: [0, 0, 10], hf: 36, pilot: (a, S, dt) => {
      steer(a, toward(S.h0 - 160, 0), { gCap: 6, tau: 0.5 });
      speed(a, 470, true, dt);
    } },
    // into the vertical on the burners, seen from below and behind
    { type: 'F15EX', alt: 900, kts: 500, pitch: 25, off: [8, -14, 34], at: [0, 2, 20], hf: 38, pitchFollow: 0.9, pilot: (a, S, dt) => {
      steer(a, toward(S.h0, 85), { gCap: 5, tau: 0.6, maxBank: 0 });
      speed(a, 600, true, dt);
    } },
    // just under the speed of sound, low: the vapour
    { type: 'RAFALE', alt: 70, kts: 640, pitch: 0, off: [-18, 4, 30], at: [0, 0, 6], hf: 34, pilot: (a, S, dt) => {
      cruise(a, S.h0, 70, 650, dt, { ab: true, maxBank: 8 });
    } },
    // a seven-g turn, the vapour off the wings
    { type: 'FA18EF', alt: 1500, kts: 380, pitch: 0, off: [30, 18, 38], at: [0, 0, 8], hf: 36, pilot: (a, S, dt) => {
      steer(a, toward(S.h0 + 170, 0), { gCap: 7.5, tau: 0.4, override: true });
      speed(a, 380, true, dt);
    } },
  ];
  shots.jets = {
    mission: { jet: 'F22', tod: 'afternoon', weather: 'cloudy' },
    async init(S) {
      S.i = -1;
      S.base = 70;
      sun(32, S.base + 150);
    },
    frame(S, dt) {
      const n = JETS.length;
      const each = S.dur / n;
      const i = Math.min(n - 1, Math.floor(S.t / each));
      const J = JETS[i];
      if (i !== S.i) {
        clear();
        S.i = i;
        S.h0 = S.base + i * 40;
        const a = jet(J.type);
        const pos = v3(TR.sea[0] + i * 1500, Math.max(J.alt, ground(TR.sea[0] + i * 1500, TR.sea[1]) + J.alt), TR.sea[1]);
        fly(a, pos, S.h0, J.kts, J.pitch, (d) => J.pilot(a, S, d));
        physics(0.6); // (already into the manoeuvre when the shot starts)
        const sub = { t: 0, dur: each };
        S.sub = sub;
        S.cam = rig(sub, a, { off: J.off, at: J.at, hf: J.hf, pitch: J.pitchFollow || 0.3, seed: i * 3 });
      }
      physics(dt);
      S.sub.t += dt;
      S.cam(dt);
    },
  };

  // ---- CARRIER: a real catapult shot, the camera beside the deck edge
  const carrier = () => TR.mods.CARRIERS.find((x) => x.f.team === 'blue') || TR.mods.CARRIERS[0];
  shots.cat = {
    mission: { jet: 'FA18EF', tod: 'morning', weather: 'cloudy' },
    async init(S) {
      const g = G();
      const p = g.player;
      const cv = carrier();
      if (!cv) throw new Error('no carrier on this map');
      cv.catBusy.fill(null);
      p.scripted = false;
      p.ai = null;
      TR.mods.spawnOnRunway(p, cv.f);
      p.ai = { skill: {}, state: 'PATROL', target: null, route: [], update: () => {
        const c = p.controls;
        c.throttle = 1.1;
        c.gearDown = true;
        c.pitch = p.fm.cat ? 0 : 0.25;
        c.roll = 0;
        c.yaw = 0;
      } };
      // full power, the salute; the shot starts as the shuttle fires
      for (let i = 0; i < 12 * 120 && p.fm.cat && p.fm.cat.phase === 'hold'; i++) g.sim.step(1 / 120);
      S.cv = cv;
      // a fixed camera on the deck edge ahead, panning as the jet comes past
      const f = p.fm;
      const h = hdgOf(f.fwd.x, f.fwd.z);
      S.from = f.pos.clone().addScaledVector(dirOf(h), 55).addScaledVector(rightOf(h), 26).add(v3(0, 4, 0));
      S.atp = f.pos.clone();
      sun(24, h + 70);
    },
    frame(S, dt) {
      const p = G().player;
      physics(dt);
      // the camera rides with the ship (it moves and turns) and pans after the jet
      const cv = S.cv;
      S.from.x += cv.vx * dt;
      S.from.z += cv.vz * dt;
      S.atp.lerp(p.fm.pos.clone().add(v3(0, 1.5, 0)), 1 - Math.exp(-dt * 5));
      look(S.from, S.atp, 50);
    },
  };

  // ---- CARRIER: a low, fast pass over the deck, filmed from the ship
  shots.trap = {
    mission: { jet: 'FA18EF', tod: 'morning', weather: 'cloudy' },
    async init(S) {
      const p = G().player;
      const cv = carrier();
      if (!cv) throw new Error('no carrier on this map');
      S.cv = cv;
      const h = cv.heading;
      const y = 95;
      // from astern, up the ship's side, a little to port
      const start = v3(cv.x, y, cv.z).addScaledVector(dirOf(h), -1400).addScaledVector(rightOf(h), -40);
      fly(p, start, h, 520, 0, (dt) => {
        const goal = v3(cv.x, y, cv.z).addScaledVector(rightOf(h), -40).addScaledVector(dirOf(h), 3000);
        steer(p, goal.sub(p.fm.pos), { gCap: 2, tau: 1.2, maxBank: 10 });
        speed(p, 520, true, dt);
      });
      physics(1.6);
      // the camera plane: off the jet's left, the carrier going by below on the right
      S.cam = rig(S, p, { off: [-16, 7, 42], at: [10, -12, 30], hf: 50, k: 2.4, seed: 4 });
      sun(24, h + 120);
    },
    frame(S, dt) {
      physics(dt);
      S.cam(dt);
    },
  };

  // ---- DOGFIGHT: on his tail in a hard turn
  const fightSky = () => v3(TR.sea[0], 2600, TR.sea[1]);
  shots.merge = {
    mission: { jet: 'F15EX', tod: 'dusk', weather: 'cloudy' },
    async init(S) {
      const g = G();
      const p = g.player;
      const b = jet('SU35', 'red');
      const c = fightSky();
      S.h0 = 30;
      fly(b, c, S.h0, 420, 0, (dt) => {
        // a sustained hard turn, the bandit trying to get out of it
        steer(b, toward(hdgOf(b.fm.vel.x, b.fm.vel.z) - 60, 2 * Math.sin(S.t * 0.8)), { gCap: 4.5, tau: 0.8 });
        speed(b, 420, true, dt);
      });
      fly(p, c.clone().addScaledVector(dirOf(S.h0), -150).add(v3(0, 6, 0)), S.h0, 420, 0, (dt) => {
        // on his tail: the nose a little ahead of him, the throttle keeping about 150 m
        const to = b.fm.pos.clone().addScaledVector(b.fm.vel, 0.35).sub(p.fm.pos);
        steer(p, to, { gCap: 7, tau: 0.45 });
        const gap = p.fm.pos.distanceTo(b.fm.pos);
        speed(p, b.fm.cas / KT + (gap - 150) * 0.6, true, dt);
      });
      physics(2.5);
      S.b = b;
      S.cam = rig(S, p, { off: [4, 8, 30], with: b, withK: 0.5, hf: 50, k: 2.6, swing: 2.2, seed: 7 });
      sun(9, 220);
    },
    frame(S, dt) {
      physics(dt);
      S.cam(dt);
    },
  };

  // ---- DOGFIGHT: the missile off the rail (slow motion), seen from behind and above
  shots.launch = {
    mission: { jet: 'F15EX', tod: 'dusk', weather: 'cloudy' },
    async init(S) {
      const g = G();
      const p = g.player;
      const b = jet('SU35', 'red');
      const c = fightSky();
      S.h = 80;
      fly(b, c.clone().addScaledVector(dirOf(S.h), 650).add(v3(40, 30, 0)), S.h + 10, 440, 0, (dt) => {
        steer(b, toward(S.h + 25, 0), { gCap: 4, tau: 1.0 });
        speed(b, 440, true, dt);
      });
      fly(p, c, S.h, 460, 0, (dt) => {
        steer(p, b.fm.pos.clone().sub(p.fm.pos), { gCap: 4, tau: 1.2, maxBank: 30 });
        speed(p, 460, true, dt);
      });
      physics(1.0);
      S.b = b;
      S.fired = false;
      S.cam = rig(S, p, { off: [3, 7, 30], at: [0, 0.5, 14], hf: 42, k: 3, seed: 9 });
      sun(9, 220);
    },
    frame(S, dt) {
      const g = G();
      const p = g.player;
      const sdt = dt * 0.5;
      if (!S.fired && S.t >= 0.12) {
        S.fired = true;
        p.missileCooldown = 0;
        let m = p.fireMissile(g.sim, p.irMissile, S.b);
        if (!m) {
          p.missileCooldown = 0;
          m = p.fireMissile(g.sim, p.radarMissile, S.b);
        }
        console.log('[TR] launch: missile ' + (m ? 'away' : 'NOT fired'));
      }
      physics(sdt);
      S.cam(sdt);
    },
  };

  // ---- DOGFIGHT: the bandit breaks hard and throws flares
  shots.flares = {
    mission: { jet: 'F15EX', tod: 'dusk', weather: 'cloudy' },
    async init(S) {
      const b = jet('SU35', 'red');
      S.h0 = 140;
      fly(b, fightSky(), S.h0, 400, 0, (dt) => {
        steer(b, toward(S.h0 + 150, -4), { gCap: 8, tau: 0.35, override: true });
        speed(b, 400, true, dt);
      });
      physics(0.5);
      S.b = b;
      S.next = 0;
      S.st = 0;
      S.cam = rig(S, b, { off: [-10, 12, -38], at: [0, 0, 0], hf: 38, k: 2.4, swing: 2.0, seed: 11 });
      sun(9, 220);
    },
    frame(S, dt) {
      const g = G();
      const sdt = dt * 0.6;
      S.st += sdt;
      while (S.st >= S.next) {
        S.next += 0.09;
        try {
          g.sim.cms.deploy(S.b, 'flare');
        } catch (e) {
          /* no flares: the break alone */
        }
      }
      physics(sdt);
      S.cam(sdt);
    },
  };

  // ---- DOGFIGHT: the missile arrives (slow motion from the hit), the camera beside the bandit
  shots.kill = {
    mission: { jet: 'F15EX', tod: 'dusk', weather: 'cloudy' },
    async init(S) {
      const g = G();
      const p = g.player;
      const b = jet('SU35', 'red');
      S.h = 100;
      const c = fightSky();
      fly(b, c, S.h, 440, 0, (dt) => {
        steer(b, toward(S.h + 20 * Math.sin(S.t * 0.6), 0), { gCap: 4, tau: 0.9 });
        speed(b, 440, true, dt);
      });
      fly(p, c.clone().addScaledVector(dirOf(S.h), -1400).add(v3(0, -20, 0)), S.h, 480, 0, (dt) => {
        steer(p, b.fm.pos.clone().sub(p.fm.pos), { gCap: 3, tau: 1.2 });
        speed(p, 480, true, dt);
      });
      physics(0.5);
      p.missileCooldown = 0;
      S.m = p.fireMissile(g.sim, p.radarMissile, b);
      console.log('[TR] kill: missile ' + (S.m ? 'away' : 'NOT fired'));
      for (let i = 0; i < 12 * 30 && S.m && S.m.alive && b.alive; i++) {
        physics(1 / 30);
        if (S.m.pos.distanceTo(b.fm.pos) < 430) break;
      }
      S.b = b;
      S.dead = false;
      S.cam = rig(S, b, { off: [120, 22, -70], at: [0, 0, 0], hf: 30, k: 1.8, seed: 13 });
      sun(9, 220);
    },
    frame(S, dt) {
      const g = G();
      const b = S.b;
      const hit = !b.alive || !S.m || !S.m.alive || S.t > 1.3;
      if (hit && !S.dead) {
        S.dead = true;
        if (b.alive) b.destroy(g.sim, 'MISSILE', g.player);
        park(g.player);
      }
      const sdt = dt * (S.dead ? 0.32 : 1);
      physics(sdt);
      S.cam(sdt);
    },
  };

  // ---- TEAM: five different jets in echelon over the mountains
  shots.team = {
    mission: { jet: 'F15EX', tod: 'morning', weather: 'clear' },
    async init(S) {
      const pk = TR.peak;
      const [ux, uz] = aim(pk, TR.start);
      const x = pk[0] - ux * 7000;
      const z = pk[1] - uz * 7000;
      const h = hdgOf(ux, uz) + 18;
      const alt = highAlong(x, z, h, 6000) + 300;
      TR.shared.ridge = { x, z, h };
      const types = ['TYPHOON', 'GRIPEN', 'F16C', 'SU35', 'SU57'];
      const L = jet(types[0]);
      const start = v3(x, alt, z);
      fly(L, start, h, 440, 0, (dt) => cruise(L, h + 2 * Math.sin(S.t * 0.3), alt, 440, dt, { maxBank: 15 }));
      const r = rightOf(h);
      const d = dirOf(h);
      for (let i = 1; i < types.length; i++) {
        const a = jet(types[i]);
        fly(a, start.clone().addScaledVector(r, 8 * i).addScaledVector(d, -20 * i).add(v3(0, -1.5 * i, 0)), h, 440, 0, (dt) => slot(a, L, 8 * i, -1.5 * i, 20 * i, dt));
      }
      physics(2.0);
      S.cam = rig(S, L, { off: (u) => [mix(28, 24, u), mix(36, 30, u), mix(150, 132, u)], at: [16, -4, -32], hf: 34, seed: 15 });
      sun(26, h + 150);
    },
    frame(S, dt) {
      physics(dt);
      S.cam(dt);
    },
  };

  // ---- THEATER: low over the ridges, following the ground
  shots.canyon = {
    mission: { jet: 'F15EX', tod: 'morning', weather: 'clear' },
    async init(S) {
      const rg = TR.shared.ridge || { x: TR.peak[0] - 6000, z: TR.peak[1], h: 90 };
      const h = rg.h - 30;
      const d = dirOf(h);
      const x = rg.x + d.x * 1500;
      const z = rg.z + d.z * 1500;
      const a = jet('GRIPEN');
      fly(a, v3(x, highAlong(x, z, h, 800) + 110, z), h, 400, 0, (dt) => {
        const ahead = a.fm.pos.clone().addScaledVector(dirOf(h + 8 * Math.sin(S.t * 0.5)), 900);
        ahead.y = highAlong(a.fm.pos.x, a.fm.pos.z, h, 1100) + 100;
        steer(a, ahead.sub(a.fm.pos), { gCap: 4, tau: 0.8, maxBank: 40 });
        speed(a, 400, true, dt);
      });
      physics(1.0);
      S.cam = rig(S, a, { off: [9, 8, 36], at: [0, 0, 40], hf: 46, pitch: 0.5, seed: 17 });
      sun(26, h + 150);
    },
    frame(S, dt) {
      physics(dt);
      S.cam(dt);
    },
  };

  // ---- AIRSTRIKE: the bombs come off (slow motion), seen from under the tail
  shots.bombs = {
    mission: { jet: 'F15EX', mode: 'strike', tod: 'morning', weather: 'clear' },
    async init(S) {
      const g = G();
      const p = g.player;
      const units = (g.mode.primaries || []).filter((u) => u.alive);
      const all = units.length ? units : g.sim.ground.filter((u) => u.alive);
      if (!all.length) throw new Error('no ground target in this strike');
      if (!p.bombType) throw new Error('this jet has no bombs');
      S.units = all;
      const tp = all[0].pos;
      S.h = 90;
      const d = dirOf(S.h);
      const x = tp.x - d.x * 2700;
      const z = tp.z - d.z * 2700;
      const alt = Math.max(tp.y + 1000, highAlong(x, z, S.h, 2700) + 350);
      fly(p, v3(x, alt, z), S.h, 470, 0, (dt) => cruise(p, S.h, alt, 470, dt, { maxBank: 10 }));
      physics(0.8);
      S.n = 0;
      S.st = 0;
      S.bombs = [];
      TR.shared.strike = S;
      S.cam = rig(S, p, { off: [4.5, -6.5, 19], at: [0, -2.5, -4], hf: 44, k: 3.2, seed: 19 });
      sun(28, S.h + 150);
    },
    frame(S, dt) {
      const g = G();
      const p = g.player;
      const sdt = dt * 0.5;
      S.st += sdt;
      if (S.n < 4 && S.st >= 0.2 + S.n * 0.22) {
        const u = S.units[S.n % S.units.length];
        p.missileCooldown = 0;
        const b = p.releaseBomb(g.sim, u, u.pos);
        if (b) S.bombs.push(b);
        S.n++;
      }
      physics(sdt);
      S.cam(sdt);
    },
  };

  // ---- AIRSTRIKE: the target, as they arrive
  shots.impact = {
    mission: { jet: 'F15EX', mode: 'strike', tod: 'morning', weather: 'clear' },
    async init(S) {
      const B = TR.shared.strike;
      if (!B || !B.bombs.length) throw new Error('no bombs in the air');
      S.B = B;
      const tp = B.units[0].pos;
      S.tp = tp.clone();
      for (let i = 0; i < 40 * 30; i++) {
        const live = B.bombs.filter((b) => b.alive);
        if (!live.length) break;
        let near = 1e9;
        for (const b of live) near = Math.min(near, b.st.pos.distanceTo(b.target));
        if (near < 260) break;
        physics(1 / 30);
      }
      S.side = rightOf(B.h);
      S.lk = S.tp.clone().add(v3(0, 6, 0));
      sun(28, B.h + 60);
    },
    frame(S, dt) {
      physics(dt);
      const u = sm(0, S.dur, S.t);
      const dist = mix(210, 175, u);
      const from = S.tp.clone().addScaledVector(S.side, dist).addScaledVector(dirOf(S.B.h), -40 + 6 * Math.sin(S.t * 0.7));
      from.y = Math.max(S.tp.y + 60, ground(from.x, from.z) + 8) + Math.sin(S.t * 0.5) * 1.5;
      look(from, S.lk, 42);
    },
  };

  // ---- TANKER: on the boom of the KC-46
  shots.tanker = {
    mission: { jet: 'F15EX', tod: 'afternoon', weather: 'cloudy' },
    async init(S) {
      const g = G();
      const p = g.player;
      const tk = g.tanker;
      if (!tk) throw new Error('no tanker in this flight');
      S.tk = tk;
      p.fm.fuelInternal = p.spec.internalFuel * 0.4;
      tk.update(0.001, null, () => {});
      const kind = TR.mods.aarKind(p.spec.type);
      const hd = hdgOf(tk.vel.x, tk.vel.z);
      // in the pre-contact position, behind and below; the auto-connect takes it from there
      const pre = tk.toWorld(TR.mods.contactTarget(kind)).add(v3(0, -8, 0)).addScaledVector(dirOf(hd), -25);
      fly(p, pre, hd, tk.speed / KT, 0, (dt) => {
        if (tk.held) return;
        const want = tk.toWorld(TR.mods.contactTarget(kind)).sub(TR.mods.receiverPoint(p, kind).applyQuaternion(p.fm.quat));
        steer(p, want.addScaledVector(tk.vel, 1.5).sub(p.fm.pos), { gCap: 2, tau: 1.2, maxBank: 15 });
        TR.mods.holdSpeed(p, tk.speed * 1.03 + p.fm.cas - p.fm.vel.length(), false, dt);
      });
      const pre1 = (dt) => tk.update(dt, p, () => {});
      for (let i = 0; i < 10 * 30; i++) {
        physics(1 / 30, pre1);
        if (tk.state === 'contact' && i > 45) break;
      }
      S.pre = pre1;
      S.cam = rig(S, p, { off: [12, -7, 34], at: [0, 6, 18], hf: 44, k: 2.0, seed: 21 });
      sun(34, hd + 150);
    },
    frame(S, dt) {
      physics(dt, S.pre);
      S.tk.drawAt(1);
      S.cam(dt);
    },
  };

  // ---- RECON: the SR-71 at 80,000 ft
  shots.recon = {
    mission: { jet: 'F15EX', tod: 'afternoon', weather: 'clear' },
    async init(S) {
      const a = jet('SR71');
      const h = 60;
      fly(a, v3(TR.sea[0], 24400, TR.sea[1]), h, 1850, 2, (dt) => cruise(a, h, 24400, 1850, dt, { ab: true, maxBank: 6 }));
      physics(1.0);
      S.cam = rig(S, a, { off: (u) => [mix(16, 7, u), mix(15, 9, u), mix(62, 44, u)], at: [0, 0, 30], hf: 40, seed: 23 });
      sun(30, h + 130);
    },
    frame(S, dt) {
      physics(dt);
      S.cam(dt);
    },
  };

  // ---- WEATHER: low over the sea in a storm, the turbulence throwing it about
  shots.storm = {
    mission: { jet: 'FA18EF', tod: 'morning', weather: 'storm' },
    async init(S) {
      const p = G().player;
      const h = 40;
      fly(p, v3(TR.sea[0] + 3000, 90, TR.sea[1] + 3000), h, 400, 0, (dt) => cruise(p, h, 90, 400, dt, { ab: true, maxBank: 20 }));
      physics(1.0);
      S.cam = rig(S, p, { off: (u) => [mix(7, 4, u), mix(4.5, 3, u), mix(30, 22, u)], at: [0, 0.5, 8], hf: 40, k: 1.6, seed: 25 });
    },
    frame(S, dt) {
      physics(dt);
      S.cam(dt);
    },
  };

  // ---- AIRSHOW: a low pass down the runway with a full aileron roll, seen on a long lens from the crowd line
  shots.cobra = {
    mission: { jet: 'F22', tod: 'afternoon', weather: 'clear' },
    async init(S) {
      const f = TR.mods.ROLES.duelBlue;
      const h = hdgOf(f.ax, f.az);
      const a = jet('SU57');
      const y = f.elev + 70;
      S.rolled = 0;
      fly(a, v3(f.x - f.ax * 700, y, f.z - f.az * 700), h, 430, 0, (dt) => {
        const c = a.controls;
        if (S.t > 0.7 && S.rolled < 350) {
          // one full roll to the right: the stick held over, a touch of back pressure
          S.rolled += Math.abs(a.fm.rollRate) * dt;
          c.roll = 1;
          c.pitch = 0.04;
          c.yaw = 0;
          speed(a, 430, true, dt);
        } else {
          steer(a, toward(h, (y - a.fm.pos.y) * 0.04), { gCap: 3, tau: 0.8, maxBank: 8 });
          speed(a, 430, true, dt);
        }
      });
      physics(0.2);
      // the crowd line: off the side of the runway, ahead of the jet
      S.from = v3(f.x + f.rxv * 150, f.elev + 4, f.z + f.rzv * 150).addScaledVector(dirOf(h), -60);
      S.lk = a.fm.pos.clone();
      S.a = a;
      sun(34, h + 60);
    },
    frame(S, dt) {
      physics(dt);
      // the long lens panning after it, a little late
      S.lk.lerp(S.a.fm.pos, 1 - Math.exp(-dt * 7));
      look(S.from, S.lk, 20);
    },
  };

  // ---- THE END: two jets low over the sea into the setting sun, the camera easing back and up
  shots.end = {
    mission: { jet: 'FA18EF', tod: 'dusk', weather: 'clear' },
    async init(S) {
      const h = 100;
      const a = jet('TYPHOON');
      const b = jet('RAFALE');
      const start = v3(TR.sea[0], 90, TR.sea[1]);
      fly(a, start, h, 400, 0, (dt) => cruise(a, h + 2 * Math.sin(S.t * 0.3), 90, 400, dt, { maxBank: 12 }));
      fly(b, start.clone().addScaledVector(rightOf(h), 11).addScaledVector(dirOf(h), -14), h, 400, 0, (dt) => slot(b, a, 11, -1, 14, dt));
      physics(1.5);
      S.cam = rig(S, a, { off: (u) => [mix(5.5, 5.5, u), mix(9, 18, u), mix(52, 84, u)], at: [5.5, 2, 40], hf: (u) => mix(38, 42, u), seed: 27 });
      sun(6, h + 8);
    },
    frame(S, dt) {
      physics(dt);
      S.cam(dt);
    },
  };

  // ====================================================================================
  // RUNNING A SHOT
  // ====================================================================================
  const NOVIS = { greyout: 0, tunnel: 0, mono: 0, redout: 0, blackout: 0, flash: 0, damage: 0, blur: 0, pinhole: 0, heart: 0 };
  /** draw the frame (or, with render off, only move the effects on) */
  const draw = (dt, render) => {
    const g = G();
    const R = g.renderer;
    const cam = R.camera;
    R.setOverlay(null, null);
    const pv = g.combat.aircraftVis.get(g.player);
    if (pv) pv.setCockpitView(false);
    cam.updateMatrixWorld();
    if (render) g.world.update(dt, cam, TR.focus || g.player.fm.pos);
    g.combat.update(dt, cam);
    if (g.ground) g.ground.update(dt, cam);
    if (g.tanker) g.tanker.drawAt(1);
    if (!render) return;
    R.setHaze(g.combat.haze);
    R.setSpeed(0);
    R.setVision(NOVIS);
    R.render();
  };

  let cur = null;
  let S = null;

  TR.setup = async (o) => {
    TR.gfx = o.gfx || null;
    const [mi, ac, wx, te, cr, is, tk, st, sp] = await Promise.all([
      import('/src/game/mission.ts'),
      import('/src/aircraft/aircraft.ts'),
      import('/src/world/weather.ts'),
      import('/src/world/terrain.ts'),
      import('/src/world/carriers.ts'),
      import('/src/world/islands.ts'),
      import('/src/game/tanker.ts'),
      import('/src/ai/steering.ts'),
      import('/src/game/spawn.ts'),
    ]);
    TR.mods = {
      defaultMission: mi.defaultMission, Aircraft: ac.Aircraft, WEATHER_PRESETS: wx.WEATHER_PRESETS, surfaceHeight: te.surfaceHeight,
      CARRIERS: cr.CARRIERS, ROLES: is.ROLES, aarKind: tk.aarKind, contactTarget: tk.contactTarget, receiverPoint: tk.receiverPoint,
      steerToward: st.steerToward, holdSpeed: st.holdSpeed, spawnOnRunway: sp.spawnOnRunway,
    };
  };

  TR.begin = async (name, dur) => {
    if (cur && cur.end) {
      try {
        cur.end(S);
      } catch (e) {
        /* the next shot sets everything again */
      }
    }
    cur = shots[name];
    if (!cur) throw new Error('no shot called ' + name);
    S = { t: 0, dur };
    await mission(cur.mission);
    await cur.init(S);
    if (cur.ownDraw) cur.frame(S, 0, true);
    else {
      if (S.cam) S.cam(0);
      draw(0, true);
    }
  };

  TR.settle = async (ms) => {
    if (cur && cur.ownDraw) return;
    const g = G();
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      draw(0, true);
      await new Promise((r) => setTimeout(r, 30));
      const w = g.world;
      if (performance.now() - t0 > 600 && w.terrain && w.terrain.isSettled && w.terrain.isSettled()) break;
    }
  };

  TR.step = (dt, render) => {
    S.t += dt;
    cur.frame(S, dt, render);
    if (!cur.ownDraw) draw(dt, render);
  };

  TR.skip = (n, dt) => {
    for (let i = 0; i < n; i++) TR.step(dt, false);
  };

  TR.finish = () => {
    if (cur && cur.end) cur.end(S);
    cur = null;
  };

  TR.shots = shots;
  return TR;
})();
