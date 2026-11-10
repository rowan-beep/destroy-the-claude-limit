// The trailer's shots, run inside the game's page by tools/footage/trailer.cjs (with tools/cinematics/lib.js).
//
// Every shot is staged: the jets are flown on scripted paths (the game's own models, effects, weapons,
// carriers, tanker and ground targets), and the camera is placed by hand so the subject is always in the
// picture. The picture is tall (9:16), so most shots look along the jet (it runs up the frame) or at a jet
// standing on its tail. The camera never shakes: it is locked to the jet or moves on a slow, eased path.
//
// A shot is { mission, init(S), frame(S, dt), end?(S) }:
//   mission  the flight it needs (jet, mode, time of day, weather); shots with the same one share it
//   init     places everything for the first frame
//   frame    moves everything on by dt seconds and points the camera; S.t is the time into the shot
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
  /** unit vectors for a compass heading (deg): the way it points, and to its right */
  const dirOf = (h) => v3(Math.sin(h * D), 0, -Math.cos(h * D));
  const rightOf = (h) => v3(Math.cos(h * D), 0, Math.sin(h * D));
  const hdgOf = (dx, dz) => Math.atan2(dx, -dz) / D;

  const TR = { key: '', jets: {}, shared: {}, focus: null, gfx: null, mods: null, sea: null, peak: null, start: null };

  /** the lens: `hf` is the angle seen across the WIDTH of the picture (deg), whatever its shape */
  const lens = (hf) => {
    const a = G().renderer.camera.aspect;
    return Math.min(100, (2 * Math.atan(Math.tan((hf * D) / 2) / a)) / D);
  };
  /** camera at `from` looking at `at` (vectors), `hf` degrees across the picture */
  const look = (from, at, hf) => {
    C().view([from.x, from.y, from.z], [at.x, at.y, at.z], lens(hf), 0);
    TR.focus = at.clone();
  };
  /** a point beside a jet's position, in a level frame along heading h: right, up, ahead (m) */
  const rel = (pos, h, r, u, f) => pos.clone().addScaledVector(rightOf(h), r).addScaledVector(dirOf(h), f).add(v3(0, u, 0));
  const pose = (a, pos, o) => C().pose(a, Object.assign({ pos: [pos.x, pos.y, pos.z] }, o));
  const hide = (a) => {
    a.fm.pos.set(a.fm.pos.x, -50000, a.fm.pos.z);
    a.fm.vel.set(0, 0, 0);
  };
  const ground = (x, z) => Math.max(0, TR.mods.surfaceHeight(x, z));
  /** the highest ground along a line (m) */
  const highAlong = (x, z, h, len) => {
    const d = dirOf(h);
    let m = 0;
    for (let s = 0; s <= len; s += 120) m = Math.max(m, ground(x + d.x * s, z + d.z * s));
    return m;
  };
  /** the sun for a shot: elevation and compass bearing (deg); the light and reflections follow */
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
  /** another jet in the flight (made once per flight, reused by later shots) */
  const jet = (type, team = 'blue') => {
    const k = type + ':' + team;
    let a = TR.jets[k];
    if (!a) {
      a = new TR.mods.Aircraft(type, team, team === 'red' ? 'BANDIT' : 'CINE');
      a.scripted = true;
      a.script = null;
      G().sim.add(a);
      TR.jets[k] = a;
    }
    if (!a.alive) {
      // (shot down in an earlier take: a fresh one)
      G().sim.remove(a);
      delete TR.jets[k];
      return jet(type, team);
    }
    a.scripted = true;
    a.script = null;
    return a;
  };
  /** everything out of the picture, no weapons in the air, no smoke left from the last shot */
  const clear = () => {
    const g = G();
    for (const a of g.sim.aircraft) {
      a.scripted = true;
      a.script = null;
      hide(a);
    }
    g.sim.missiles.length = 0;
    try {
      g.combat.clearEffects();
    } catch (e) {
      /* nothing to clear */
    }
  };
  /** move the weapons, flares and wrecks on by dt (the scripted jets stay where the shot put them) */
  const simStep = (dt) => {
    const g = G();
    const n = Math.max(0, Math.round(dt * 120));
    for (let i = 0; i < n; i++) g.sim.step(1 / 120);
  };
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
    if (!render) return;
    R.setHaze(g.combat.haze);
    R.setSpeed(0);
    R.setVision(NOVIS);
    R.render();
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
      // (nothing on the ground shoots at the film crew)
      g.sim.defenses.length = 0;
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

  // ---- TITLE: three jets over the sea toward the islands, the camera easing in from behind
  shots.title = {
    mission: { jet: 'F22', tod: 'afternoon', weather: 'clear' },
    async init(S) {
      const pk = TR.peak;
      let ux = pk[0] - TR.start[0];
      let uz = pk[1] - TR.start[1];
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul;
      uz /= ul;
      const s = await C().findSea(pk[0] - ux * 9000, pk[1] - uz * 9000, 1500);
      S.h = pk[2] > 20 ? hdgOf(pk[0] - s[0], pk[1] - s[1]) : 90;
      S.alt = Math.max(170, highAlong(s[0], s[1], S.h, 5000) + 110);
      S.pos = v3(s[0], S.alt, s[1]);
      S.wings = [jet('F35A'), jet('SU57')];
      TR.shared.line = { x: s[0], z: s[1], h: S.h };
      sun(30, S.h + 140);
    },
    frame(S, dt) {
      const d = dirOf(S.h);
      const r = rightOf(S.h);
      const L = S.pos.addScaledVector(d, 220 * dt);
      L.y = S.alt + 2 * Math.sin(S.t * 0.9);
      pose(G().player, L, { hdg: S.h, roll: 3 * Math.sin(S.t * 0.7), aoa: 3, speed: 220, mach: 0.65, g: 1, ab: 0.35 });
      S.wings.forEach((w, i) => {
        const side = i ? 1 : -1;
        const wp = L.clone().addScaledVector(r, 9 * side).addScaledVector(d, -20 * (i + 1));
        wp.y += 1.2 * Math.sin(S.t * 1.2 + i * 2) - 1;
        pose(w, wp, { hdg: S.h, roll: 3 * Math.sin(S.t * 0.8 + i * 2), aoa: 3, speed: 220, mach: 0.65, g: 1, ab: 0.35 });
      });
      const u = sm(0, S.dur, S.t);
      look(rel(L, S.h, mix(8, 3, u), mix(40, 25, u), mix(-135, -94, u)), rel(L, S.h, 0, 0, -12), mix(36, 32, u));
    },
  };

  // ---- COCKPIT: the real cockpit view, low over the water toward the island
  shots.cockpit = {
    mission: { jet: 'F22', tod: 'afternoon', weather: 'clear' },
    ownDraw: true,
    async init(S) {
      const g = G();
      const ln = TR.shared.line || { x: TR.sea[0], z: TR.sea[1], h: 90 };
      const d = dirOf(ln.h);
      const x = ln.x + d.x * 1500;
      const z = ln.z + d.z * 1500;
      S.h = ln.h;
      S.pos = v3(x, Math.max(200, highAlong(x, z, ln.h, 5000) + 110), z);
      if (g.state !== 'playing') g.setState('playing');
      S.fov = g.cam.fovBase;
      g.cam.fovBase = 84;
      g.cam.setMode('cockpit');
      sun(30, ln.h + 140);
    },
    frame(S, dt, render) {
      const g = G();
      if (g.state !== 'playing') g.setState('playing');
      S.h += 1.5 * dt;
      S.pos.addScaledVector(dirOf(S.h), 240 * dt);
      pose(g.player, S.pos, { hdg: S.h, pitch: 2, roll: 9 + 3 * Math.sin(S.t * 0.9), aoa: 3, speed: 240, mach: 0.7, g: 1.1, ab: 0.3 });
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

  // ---- THE JETS: four of them, a second and a bit each
  const JETS = [
    // a wave-top turn, seen from just ahead of the wing
    { type: 'SU57', y: 30, pitch: 3, roll: -64, aoa: 9, speed: 240, mach: 0.72, g: 4.5, ab: 0.7, turn: -9, brg: 35, el: 2, dist: 40, hf: 34, sweep: 8 },
    // straight up on the burners, seen from below
    { type: 'F15EX', y: 1500, pitch: 84, roll: 0, aoa: 3, speed: 250, mach: 0.78, g: 1.2, ab: 1, turn: 0, brg: 200, el: -38, dist: 38, hf: 30, sweep: 14 },
    // through its own vapour, just under the speed of sound
    { type: 'RAFALE', y: 45, pitch: 1, roll: 0, aoa: 2, speed: 325, mach: 0.965, g: 1.1, ab: 1, turn: 0, brg: 150, el: 6, dist: 46, hf: 30, sweep: -10 },
    // a seven-g turn, the vapour pouring off the wings
    { type: 'FA18EF', y: 1400, pitch: 10, roll: -78, aoa: 14, speed: 170, mach: 0.55, g: 7.2, ab: 0.4, turn: -22, brg: 160, el: 20, dist: 38, hf: 32, sweep: 12 },
  ];
  shots.jets = {
    mission: { jet: 'F22', tod: 'afternoon', weather: 'clear' },
    async init(S) {
      S.i = -1;
      S.h0 = 70;
      sun(32, S.h0 + 150);
    },
    frame(S, dt) {
      const n = JETS.length;
      const each = S.dur / n;
      const i = Math.min(n - 1, Math.floor(S.t / each));
      const J = JETS[i];
      if (i !== S.i) {
        // the next jet: the last one and its trails go
        clear();
        S.i = i;
        S.a = jet(J.type);
        S.h = S.h0 + i * 25;
        S.pos = v3(TR.sea[0] + i * 400, J.y, TR.sea[1] + i * 400);
      }
      const u = (S.t - i * each) / each;
      S.h += J.turn * dt;
      const d = dirOf(S.h);
      const pr = J.pitch * D;
      S.pos.x += d.x * Math.cos(pr) * J.speed * dt;
      S.pos.y += Math.sin(pr) * J.speed * dt;
      S.pos.z += d.z * Math.cos(pr) * J.speed * dt;
      pose(S.a, S.pos, { hdg: S.h, pitch: J.pitch, roll: J.roll, aoa: J.aoa, speed: J.speed, mach: J.mach, g: J.g, ab: J.ab });
      const b = (S.h + J.brg + J.sweep * u) * D;
      const e = J.el * D;
      const from = v3(S.pos.x + Math.sin(b) * Math.cos(e) * J.dist, S.pos.y + Math.sin(e) * J.dist, S.pos.z - Math.cos(b) * Math.cos(e) * J.dist);
      if (from.y < 2.5) from.y = 2.5;
      look(from, S.pos, J.hf);
    },
  };

  // ---- CARRIER: the catapult stroke, the camera travelling with the jet
  const carrier = () => TR.mods.CARRIERS.find((x) => x.f.team === 'blue') || TR.mods.CARRIERS[0];
  shots.cat = {
    mission: { jet: 'FA18EF', tod: 'morning', weather: 'clear' },
    async init(S) {
      const cv = carrier();
      if (!cv) throw new Error('no carrier on this map');
      S.cv = cv;
      S.cat = cv.layout.cats[0];
      S.h = (cv.heading + S.cat.off + 360) % 360;
      S.stroke = S.cat.stroke || 90;
      S.acc = (2 * S.stroke) / (1.9 * 1.9);
      S.fly = null;
      sun(24, S.h + 70);
    },
    frame(S, dt) {
      const p = G().player;
      const cv = S.cv;
      const tau = Math.max(0, S.t - 0.3); // (a moment at full power first)
      const s = 0.5 * S.acc * tau * tau;
      const v = S.acc * tau;
      let pos;
      if (s <= S.stroke + 8) {
        const o = S.cat.off * D;
        const u = S.cat.u - 6 + s * Math.cos(o);
        const w = S.cat.v + s * Math.sin(o);
        const W = cv.toWorld(u, w, { x: 0, z: 0 });
        pos = v3(W.x, cv.deckY(u, w) + p.spec.gear.height, W.z);
        pose(p, pos, { hdg: S.h, pitch: 0, roll: 0, aoa: 0, speed: v, gear: 1, ab: 1 });
        p.fm.onGround = true;
        S.last = pos.clone();
        S.v = v;
      } else {
        // off the bow: the nose comes up and it climbs away
        const k = S.fly === null ? (S.fly = 0) : (S.fly += dt);
        const pitch = Math.min(12, k * 30);
        const d = dirOf(S.h);
        S.last.addScaledVector(d, S.v * dt);
        S.last.y += Math.sin(pitch * D) * S.v * dt;
        pos = S.last;
        pose(p, pos, { hdg: S.h, pitch, roll: 0, aoa: 8, speed: S.v, gear: 1, ab: 1 });
      }
      look(rel(pos, S.h, 12, 3.4, 17), rel(pos, S.h, 0, 1.4, 0), 46);
    },
  };

  // ---- CARRIER: down the glide slope to the deck, seen from behind
  shots.trap = {
    mission: { jet: 'FA18EF', tod: 'morning', weather: 'clear' },
    async init(S) {
      const cv = carrier();
      if (!cv) throw new Error('no carrier on this map');
      S.f = cv.f;
      S.back = 330;
      sun(24, S.f.heading + 120);
    },
    frame(S, dt) {
      const f = S.f;
      S.back -= 68 * dt;
      const pos = v3(f.x - f.ax * S.back, f.elev + S.back * Math.tan(3.5 * D) + 4, f.z - f.az * S.back);
      pose(G().player, pos, { hdg: f.heading, pitch: 5, roll: 2 * Math.sin(S.t * 2), aoa: 9, speed: 68, gear: 1, ab: 0 });
      look(rel(pos, f.heading, 5, 11, -44), rel(pos, f.heading, 0, -5, 70), 40);
    },
  };

  // ---- DOGFIGHT: on his tail in a hard turn
  const fightSky = () => v3(TR.sea[0], 2500, TR.sea[1]);
  shots.merge = {
    mission: { jet: 'F15EX', tod: 'dusk', weather: 'cloudy' },
    async init(S) {
      S.b = jet('SU35', 'red');
      S.c = fightSky();
      S.R = 1300;
      S.v = 250;
      S.th = 0;
      sun(9, 220);
    },
    frame(S, dt) {
      S.th += (S.v / S.R) * dt;
      const at = (th) => {
        const pos = v3(S.c.x + S.R * Math.cos(th), S.c.y, S.c.z + S.R * Math.sin(th));
        const vel = v3(-Math.sin(th), 0, Math.cos(th));
        return { pos, vel, h: hdgOf(vel.x, vel.z) };
      };
      const a = at(S.th);
      const b = at(S.th + 115 / S.R);
      b.pos.y += 6;
      const o = { pitch: 0, roll: 78, aoa: 11, speed: S.v, mach: 0.76, g: 4.7, ab: 1 };
      pose(G().player, a.pos, Object.assign({ hdg: a.h }, o));
      pose(S.b, b.pos, Object.assign({ hdg: b.h }, o));
      const from = a.pos.clone().addScaledVector(a.vel, -34).add(v3(0, 9, 0));
      look(from, a.pos.clone().lerp(b.pos, 0.45), 36);
    },
  };

  // ---- DOGFIGHT: the missile leaves the jet (slow motion), seen from under its tail
  shots.launch = {
    mission: { jet: 'F15EX', tod: 'dusk', weather: 'cloudy' },
    async init(S) {
      S.b = jet('SU35', 'red');
      S.h = 80;
      S.pos = fightSky();
      S.fired = false;
      sun(9, 220);
    },
    frame(S, dt) {
      const g = G();
      const p = g.player;
      const sdt = dt * 0.5;
      const d = dirOf(S.h);
      S.pos.addScaledVector(d, 250 * sdt);
      pose(p, S.pos, { hdg: S.h, pitch: 1, roll: 0, aoa: 3, speed: 250, mach: 0.76, g: 1, ab: 1 });
      const bp = rel(S.pos, S.h, 25, 30, 520);
      pose(S.b, bp, { hdg: S.h + 12, pitch: 0, roll: 40, aoa: 6, speed: 250, mach: 0.76, g: 2, ab: 1 });
      if (!S.fired && S.t >= 0.12) {
        S.fired = true;
        p.missileCooldown = 0;
        // (the heat-seeker: it lights on the rail and goes; a radar missile drops clear first)
        let m = p.fireMissile(g.sim, p.irMissile, S.b);
        if (!m) {
          p.missileCooldown = 0;
          m = p.fireMissile(g.sim, p.radarMissile, S.b);
        }
        console.log('[TR] launch: missile ' + (m ? 'away' : 'NOT fired'));
      }
      simStep(sdt);
      look(rel(S.pos, S.h, 6, 8, -27), rel(S.pos, S.h, 1, 1, 42), 42);
    },
  };

  // ---- DOGFIGHT: the bandit breaks and throws flares
  shots.flares = {
    mission: { jet: 'F15EX', tod: 'dusk', weather: 'cloudy' },
    async init(S) {
      S.b = jet('SU35', 'red');
      S.c = fightSky();
      S.R = 760;
      S.v = 230;
      S.th = 1;
      S.next = 0;
      S.st = 0;
      sun(9, 220);
    },
    frame(S, dt) {
      const g = G();
      const sdt = dt * 0.6;
      S.st += sdt;
      S.th += (S.v / S.R) * sdt;
      const pos = v3(S.c.x + S.R * Math.cos(S.th), S.c.y, S.c.z + S.R * Math.sin(S.th));
      const vel = v3(-Math.sin(S.th), 0, Math.cos(S.th));
      pose(S.b, pos, { hdg: hdgOf(vel.x, vel.z), pitch: 0, roll: 82, aoa: 16, speed: S.v, mach: 0.7, g: 7.5, ab: 1 });
      while (S.st >= S.next) {
        S.next += 0.09;
        try {
          g.sim.cms.deploy(S.b, 'flare');
        } catch (e) {
          /* no flares: the break alone */
        }
      }
      simStep(sdt);
      const out = v3(Math.cos(S.th), 0, Math.sin(S.th));
      look(pos.clone().addScaledVector(vel, 34).addScaledVector(out, 9).add(v3(0, 10, 0)), pos, 38);
    },
  };

  // ---- DOGFIGHT: the missile arrives (the camera beside the bandit; slow motion from the hit)
  shots.kill = {
    mission: { jet: 'F15EX', tod: 'dusk', weather: 'cloudy' },
    async init(S) {
      const g = G();
      const p = g.player;
      S.b = jet('SU35', 'red');
      S.h = 100;
      S.bp = fightSky();
      S.dead = false;
      S.off = null;
      sun(9, 220);
      // the shot is fired from a mile behind; the film starts when the missile is nearly there
      const d = dirOf(S.h);
      const move = (dt) => {
        S.bp.addScaledVector(d, 240 * dt);
        pose(S.b, S.bp, { hdg: S.h, pitch: 0, roll: 0, aoa: 3, speed: 240, mach: 0.73, g: 1, ab: 0.4 });
        pose(p, rel(S.bp, S.h, 0, -30, -1500), { hdg: S.h, pitch: 0, roll: 0, aoa: 3, speed: 260, mach: 0.78, g: 1, ab: 1 });
      };
      move(0);
      p.missileCooldown = 0;
      S.m = p.fireMissile(g.sim, p.radarMissile, S.b);
      console.log('[TR] kill: missile ' + (S.m ? 'away' : 'NOT fired'));
      for (let i = 0; i < 12 * 30 && S.m && S.m.alive && S.b.alive; i++) {
        move(1 / 30);
        simStep(1 / 30);
        if (S.m.pos.distanceTo(S.b.fm.pos) < 430) break;
        if (i % 30 === 0) draw(1 / 30, false);
      }
      S.move = move;
    },
    frame(S, dt) {
      const g = G();
      const b = S.b;
      const hit = !b.alive || !S.m || !S.m.alive || S.t > 1.3;
      if (hit && !S.dead) {
        // (whatever the fuse did: this one goes down)
        S.dead = true;
        if (b.alive) b.destroy(g.sim, 'MISSILE', g.player);
        b.scripted = false;
      }
      const sdt = dt * (S.dead ? 0.32 : 1);
      if (!S.dead) S.move(sdt);
      else hide(g.player);
      simStep(sdt);
      const at = b.fm.pos.clone();
      if (!S.off) S.off = rel(at, S.h, 74, 14, 44).sub(at);
      look(at.clone().add(S.off), at, 30);
    },
  };

  // ---- TEAM: five different jets in echelon over the mountains, seen from behind and above
  shots.team = {
    mission: { jet: 'F15EX', tod: 'morning', weather: 'clear' },
    async init(S) {
      const pk = TR.peak;
      let ux = pk[0] - TR.start[0];
      let uz = pk[1] - TR.start[1];
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul;
      uz /= ul;
      const x = pk[0] - ux * 7000;
      const z = pk[1] - uz * 7000;
      S.h = hdgOf(ux, uz) + 18; // (past the peak, not into it)
      S.alt = highAlong(x, z, S.h, 6000) + 260;
      S.pos = v3(x, S.alt, z);
      S.jets = ['TYPHOON', 'GRIPEN', 'F16C', 'SU35', 'F35A'].map((t) => jet(t));
      TR.shared.ridge = { x, z, h: S.h };
      sun(26, S.h + 150);
    },
    frame(S, dt) {
      const d = dirOf(S.h);
      const r = rightOf(S.h);
      const L = S.pos.addScaledVector(d, 230 * dt);
      S.jets.forEach((a, i) => {
        const wp = L.clone().addScaledVector(r, 7 * i).addScaledVector(d, -19 * i);
        wp.y += -1.4 * i + 0.8 * Math.sin(S.t * 1.1 + i);
        pose(a, wp, { hdg: S.h, pitch: 0, roll: 2.5 * Math.sin(S.t * 0.8 + i), aoa: 3, speed: 230, mach: 0.7, g: 1, ab: 0.5 });
      });
      const mid = rel(L, S.h, 14, -3, -38);
      const u = sm(0, S.dur, S.t);
      look(rel(mid, S.h, mix(9, 7, u), mix(36, 30, u), mix(-112, -98, u)), rel(mid, S.h, 0, 0, 6), 34);
    },
  };

  // ---- THEATER: low over the ridges, following the ground
  shots.canyon = {
    mission: { jet: 'F15EX', tod: 'morning', weather: 'clear' },
    async init(S) {
      const rg = TR.shared.ridge || { x: TR.peak[0] - 6000, z: TR.peak[1], h: 90 };
      S.h = rg.h - 30;
      const d = dirOf(S.h);
      S.pos = v3(rg.x + d.x * 1500, 0, rg.z + d.z * 1500);
      S.pos.y = highAlong(S.pos.x, S.pos.z, S.h, 700) + 90;
      S.a = jet('GRIPEN');
      S.pitch = 0;
      sun(26, S.h + 150);
    },
    frame(S, dt) {
      const d = dirOf(S.h);
      const v = 200;
      S.pos.addScaledVector(d, v * dt);
      // the height follows the ground ahead, smoothly
      const want = highAlong(S.pos.x, S.pos.z, S.h, 700) + 80;
      const y0 = S.pos.y;
      S.pos.y += (want - S.pos.y) * (1 - Math.exp(-dt * 1.6));
      const climb = dt > 0 ? Math.atan2(S.pos.y - y0, v * dt) / D : 0;
      S.pitch += (climb - S.pitch) * (1 - Math.exp(-dt * 4));
      pose(S.a, S.pos, { hdg: S.h, pitch: S.pitch, roll: 6 * Math.sin(S.t * 0.9), aoa: 4, speed: v, mach: 0.62, g: 1.5, ab: 0.6 });
      const from = rel(S.pos, S.h, 7, 8, -34);
      const gh = ground(from.x, from.z) + 6;
      if (from.y < gh) from.y = gh;
      look(from, rel(S.pos, S.h, 0, 0, 40), 46);
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
      S.units = all;
      const tp = all[0].pos;
      S.h = 90;
      const d = dirOf(S.h);
      const x = tp.x - d.x * 2700;
      const z = tp.z - d.z * 2700;
      S.pos = v3(x, Math.max(tp.y + 1000, highAlong(x, z, S.h, 2700) + 350), z);
      S.n = 0;
      S.st = 0;
      S.bombs = [];
      TR.shared.strike = S;
      sun(28, S.h + 150);
      if (!p.bombType) throw new Error('this jet has no bombs');
    },
    frame(S, dt) {
      const g = G();
      const p = g.player;
      const sdt = dt * 0.5;
      S.st += sdt;
      S.pos.addScaledVector(dirOf(S.h), 240 * sdt);
      pose(p, S.pos, { hdg: S.h, pitch: 0, roll: 0, aoa: 3, speed: 240, mach: 0.72, g: 1, ab: 0 });
      if (S.n < 4 && S.st >= 0.2 + S.n * 0.22) {
        const u = S.units[S.n % S.units.length];
        p.missileCooldown = 0;
        const b = p.releaseBomb(g.sim, u, u.pos);
        if (b) S.bombs.push(b);
        S.n++;
      }
      simStep(sdt);
      look(rel(S.pos, S.h, 4.5, -6.5, -19), rel(S.pos, S.h, 0, -2.5, 4), 44);
    },
  };

  // ---- AIRSTRIKE: the target, as they arrive
  shots.impact = {
    mission: { jet: 'F15EX', mode: 'strike', tod: 'morning', weather: 'clear' },
    async init(S) {
      const B = TR.shared.strike;
      if (!B || !B.bombs.length) throw new Error('no bombs in the air');
      S.B = B;
      const g = G();
      const tp = B.units[0].pos;
      S.tp = tp.clone();
      const d = dirOf(B.h);
      const fly = (dt) => {
        B.pos.addScaledVector(d, 240 * dt);
        pose(g.player, B.pos, { hdg: B.h, pitch: 0, roll: 0, aoa: 3, speed: 240, mach: 0.72, g: 1, ab: 0 });
      };
      S.fly = fly;
      // the fall is not filmed: on until the first bomb is a second from the ground
      for (let i = 0; i < 40 * 30; i++) {
        const live = B.bombs.filter((b) => b.alive);
        if (!live.length) break;
        let near = 1e9;
        for (const b of live) near = Math.min(near, b.st.pos.distanceTo(b.target));
        if (near < 260) break;
        fly(1 / 30);
        simStep(1 / 30);
        if (i % 30 === 0) draw(1 / 30, false);
      }
      // the camera: off to one side of the run, a little above the target
      const r = rightOf(B.h);
      S.side = r;
      sun(28, B.h + 60);
    },
    frame(S, dt) {
      S.fly(dt);
      simStep(dt);
      const u = sm(0, S.dur, S.t);
      const dist = mix(210, 180, u);
      const from = S.tp.clone().addScaledVector(S.side, dist).addScaledVector(dirOf(S.B.h), -40);
      from.y = Math.max(S.tp.y + 60, ground(from.x, from.z) + 8);
      look(from, S.tp.clone().add(v3(0, 6, 0)), 42);
    },
  };

  // ---- TANKER: on the boom of the KC-46, seen from behind and below
  shots.tanker = {
    mission: { jet: 'F15EX', tod: 'afternoon', weather: 'clear' },
    async init(S) {
      const g = G();
      const p = g.player;
      const tk = g.tanker;
      if (!tk) throw new Error('no tanker in this flight');
      S.tk = tk;
      p.fm.fuelInternal = p.spec.internalFuel * 0.4; // (room to take fuel, so the boom stays in)
      tk.update(0.001, null, () => {});
      // straight to the contact position, then a few seconds for the boom to come down and latch
      const kind = TR.mods.aarKind(p.spec.type);
      p.fm.quat.copy(tk.orientation);
      const want = tk.toWorld(TR.mods.contactTarget(kind)).sub(TR.mods.receiverPoint(p, kind).applyQuaternion(p.fm.quat));
      p.fm.pos.copy(want);
      p.fm.vel.copy(tk.vel);
      S.step = (dt) => {
        tk.update(dt, p, () => {});
        p.fm.pos.addScaledVector(p.fm.vel, dt);
        p.fm.updateAxes();
        p.fm.gearPos = 0;
        p.fm.onGround = false;
        for (let i = 0; i < p.fm.rpm.length; i++) p.fm.rpm[i] = 0.8;
      };
      for (let i = 0; i < 8 * 30; i++) {
        S.step(1 / 30);
        if (tk.state === 'contact' && i > 60) break;
      }
      const hd = hdgOf(tk.vel.x, tk.vel.z);
      sun(34, hd + 150);
    },
    frame(S, dt) {
      const p = G().player;
      const tk = S.tk;
      S.step(dt);
      tk.drawAt(1);
      const h = hdgOf(tk.vel.x, tk.vel.z);
      const u = sm(0, S.dur, S.t);
      look(rel(p.fm.pos, h, mix(13, 9, u), -7, mix(-36, -30, u)), p.fm.pos.clone().lerp(tk.pos, 0.45), 44);
    },
  };

  // ---- RECON: the SR-71 at 80,000 ft
  shots.recon = {
    mission: { jet: 'F15EX', tod: 'afternoon', weather: 'clear' },
    async init(S) {
      S.a = jet('SR71');
      S.h = 60;
      S.pos = v3(TR.sea[0], 24400, TR.sea[1]);
      sun(30, S.h + 130);
    },
    frame(S, dt) {
      S.pos.addScaledVector(dirOf(S.h), 950 * dt);
      pose(S.a, S.pos, { hdg: S.h, pitch: 4, roll: 0, aoa: 5, speed: 950, mach: 3.2, g: 1, ab: 1 });
      const u = sm(0, S.dur, S.t);
      look(rel(S.pos, S.h, mix(16, 6, u), mix(15, 9, u), mix(-62, -44, u)), rel(S.pos, S.h, 0, 0, 30), 40);
    },
  };

  // ---- WEATHER: low over the sea in a storm, coming at the camera
  shots.storm = {
    mission: { jet: 'FA18EF', tod: 'morning', weather: 'storm' },
    async init(S) {
      S.h = 40;
      S.pos = v3(TR.sea[0] + 3000, 45, TR.sea[1] + 3000);
    },
    frame(S, dt) {
      S.pos.addScaledVector(dirOf(S.h), 200 * dt);
      S.pos.y = 45 + 3 * Math.sin(S.t * 1.3);
      pose(G().player, S.pos, { hdg: S.h, pitch: 2, roll: 8 * Math.sin(S.t * 1.1), aoa: 5, speed: 200, mach: 0.6, g: 1.2, ab: 1 });
      const u = sm(0, S.dur, S.t);
      look(rel(S.pos, S.h, mix(7, 4, u), mix(4.5, 3, u), mix(-30, -22, u)), rel(S.pos, S.h, 0, 0.5, 8), 40);
    },
  };

  // ---- AIRSHOW: the cobra over the runway, side on (the jet stands on its tail)
  shots.cobra = {
    mission: { jet: 'F22', tod: 'afternoon', weather: 'clear' },
    async init(S) {
      const f = TR.mods.ROLES.duelBlue;
      S.h = hdgOf(f.ax, f.az);
      S.pos = v3(f.x - f.ax * 160, f.elev + 60, f.z - f.az * 160);
      S.a = jet('SU57');
      sun(34, S.h + 60);
    },
    frame(S, dt) {
      // nose up past the vertical and back, the jet still going straight on, slowing
      const t = S.t;
      const pitch = t < 0.25 ? 4 : t < 1.05 ? mix(4, 108, sm(0.25, 1.05, t)) : t < 1.45 ? 108 : mix(108, 8, sm(1.45, 2.4, t));
      const v = mix(118, 62, sm(0.25, 1.5, t)) + 20 * sm(1.6, 2.5, t);
      S.pos.addScaledVector(dirOf(S.h), v * dt);
      pose(S.a, S.pos, { hdg: S.h, pitch, roll: 0, aoa: Math.max(4, pitch), speed: v, mach: v / 340, g: pitch > 20 ? 3 : 1, ab: 1 });
      look(rel(S.pos, S.h, 30, 1.5, 24), S.pos, 34);
    },
  };

  // ---- THE END: two jets low over the sea into the setting sun, the camera easing back and up
  shots.end = {
    mission: { jet: 'FA18EF', tod: 'dusk', weather: 'clear' },
    async init(S) {
      S.h = 100;
      S.pos = v3(TR.sea[0], 70, TR.sea[1]);
      S.a = jet('TYPHOON');
      S.b = jet('RAFALE');
      sun(6, S.h + 8);
    },
    frame(S, dt) {
      const d = dirOf(S.h);
      const L = S.pos.addScaledVector(d, 200 * dt);
      L.y = 70 + 1.5 * Math.sin(S.t * 0.8);
      pose(S.a, L, { hdg: S.h, pitch: 1, roll: 3 * Math.sin(S.t * 0.6), aoa: 3, speed: 200, mach: 0.6, g: 1, ab: 0.6 });
      pose(S.b, rel(L, S.h, 11, -1 + Math.sin(S.t), -14), { hdg: S.h, pitch: 1, roll: 3 * Math.sin(S.t * 0.7 + 2), aoa: 3, speed: 200, mach: 0.6, g: 1, ab: 0.6 });
      const u = sm(0, S.dur, S.t);
      look(rel(L, S.h, 5.5, mix(9, 18, u), mix(-52, -84, u)), rel(L, S.h, 5.5, 2, 40), mix(38, 42, u));
    },
  };

  // ====================================================================================
  // RUNNING A SHOT
  // ====================================================================================
  let cur = null;
  let S = null;

  TR.setup = async (o) => {
    TR.gfx = o.gfx || null;
    const [mi, ac, wx, te, cr, is, tk] = await Promise.all([
      import('/src/game/mission.ts'),
      import('/src/aircraft/aircraft.ts'),
      import('/src/world/weather.ts'),
      import('/src/world/terrain.ts'),
      import('/src/world/carriers.ts'),
      import('/src/world/islands.ts'),
      import('/src/game/tanker.ts'),
    ]);
    TR.mods = {
      defaultMission: mi.defaultMission, Aircraft: ac.Aircraft, WEATHER_PRESETS: wx.WEATHER_PRESETS, surfaceHeight: te.surfaceHeight,
      CARRIERS: cr.CARRIERS, ROLES: is.ROLES, aarKind: tk.aarKind, contactTarget: tk.contactTarget, receiverPoint: tk.receiverPoint,
    };
  };

  /** get a shot ready: its flight, its first pose and camera (drawn once, time standing still) */
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
    cur.frame(S, 0, true);
    if (!cur.ownDraw) draw(0, true);
  };

  /** the terrain round the camera streams in (the picture does not move on) */
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

  /** one frame: move on by dt and (with render) draw it */
  TR.step = (dt, render) => {
    S.t += dt;
    cur.frame(S, dt, render);
    if (!cur.ownDraw) draw(dt, render);
  };

  /** n frames moved on without drawing (for a quick look at single frames of a shot) */
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
