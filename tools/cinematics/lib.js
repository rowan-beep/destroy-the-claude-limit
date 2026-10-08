// page-side helpers for composing in-engine cinematic shots (air program)
window.cine = (() => {
  const T = () => window.__THREE;
  const D = Math.PI / 180;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const api = {};
  api.extra = [];
  api.start = async (o) => {
    // (a shot may set this: put its subject back just before the picture, for anything that moves)
    api.before = null;
    const g = window.game;
    const { defaultMission } = await import('/src/game/mission.ts');
    const { WEATHER_PRESETS } = await import('/src/world/weather.ts');
    document.querySelector('.menu-root')?.classList.add('hidden');
    Object.assign(g.settings.graphics, { quality: 'ultra', resolution: o.res || 'native', resolutionScale: 1, antialias: 4, shadows: 'ultra', terrainLighting: true, bloom: o.bloom ?? 0.65, lightScattering: true, cloudQuality: 'ultra', cloudShadows: true, autoRes: false, vignette: true });
    const cfg = Object.assign(defaultMission(), { mode: 'free', aircraft: o.jet || 'F22', freeStart: 'air', timeOfDay: o.tod || 'dusk' });
    await g.startMission(cfg, () => {});
    if (g.state === 'briefing') g.acceptBriefing();
    g.running = false;
    g.applySettings();
    if (o.weather) g.world.setWeather({ ...WEATHER_PRESETS[o.weather], ...(o.wx || {}) });
    for (const a of api.extra) g.sim.remove(a);
    api.extra = [];
    api.custom = null;
    const p = g.player;
    p.scripted = true;
    p.script = null;
    for (const a of g.sim.aircraft) if (a !== p && !a.scripted) { a.scripted = true; a.script = null; a.fm.pos.y = -50000; }
    return true;
  };
  api.sun = (elev, az) => {
    const env = window.game.world.env;
    const el = elev * D, a = az * D;
    env.sunDir.set(Math.sin(a) * Math.cos(el), Math.sin(el), -Math.cos(a) * Math.cos(el)).normalize();
    env.skyMat.uniforms.sunDir.value.copy(env.sunDir);
  };
  api.add = async (type) => {
    const { Aircraft } = await import('/src/aircraft/aircraft.ts');
    const a = new Aircraft(type, 'blue', 'CINE');
    a.scripted = true;
    a.script = null;
    window.game.sim.add(a);
    api.extra.push(a);
    return a;
  };
  // pose: hdg/pitch/roll in degrees; aoa degrees (nose above the flight path); speed m/s
  api.pose = (a, o) => {
    const THREE = T();
    const fm = a.fm;
    fm.pos.set(o.pos[0], o.pos[1], o.pos[2]);
    fm.quat.setFromEuler(new THREE.Euler((o.pitch || 0) * D, -(o.hdg || 0) * D, -(o.roll || 0) * D, 'YXZ'));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(fm.quat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(fm.quat);
    const aoa = (o.aoa || 0) * D;
    const spd = o.speed ?? 200;
    fm.vel.copy(fwd).multiplyScalar(Math.cos(aoa)).addScaledVector(up, -Math.sin(aoa)).multiplyScalar(spd);
    fm.alpha = aoa;
    fm.tas = spd;
    fm.mach = o.mach ?? spd / 330;
    fm.nz = o.g ?? 1;
    fm.gearPos = o.gear ?? 0;
    fm.onGround = false;
    const ab = o.ab ?? 0;
    for (let i = 0; i < fm.ab.length; i++) fm.ab[i] = ab;
    for (let i = 0; i < fm.rpm.length; i++) fm.rpm[i] = o.rpm ?? (ab > 0 ? 1 : 0.85);
    if (a.controls) a.controls.throttle = ab > 0 ? 1.1 : 0.9;
    return fwd;
  };
  // the camera: from (world), looking at (world); fov degrees; roll degrees
  api.view = (from, at, fov = 30, roll = 0) => {
    const THREE = T();
    const cam = window.game.renderer.camera;
    cam.position.set(from[0], from[1], from[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(at[0], at[1], at[2]);
    if (roll) cam.rotateZ(roll * D);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    api.focus = new THREE.Vector3(at[0], at[1], at[2]);
  };
  // a point in a jet's own frame (x right, y up, z back), in world space
  api.rel = (a, x, y, z) => {
    const THREE = T();
    const v = new THREE.Vector3(x, y, z).applyQuaternion(a.fm.quat).add(a.fm.pos);
    return [v.x, v.y, v.z];
  };
  api.custom = null;
  api.frame = (dt = 1 / 60) => {
    if (api.custom) return api.custom(dt);
    const g = window.game;
    const R = g.renderer;
    const cam = R.camera;
    R.setOverlay(null, null);
    const pv = g.combat.aircraftVis.get(g.player);
    pv?.setCockpitView(false);
    cam.updateMatrixWorld();
    g.world.update(dt, cam, api.focus || g.player.fm.pos);
    g.combat.update(dt, cam);
    R.setHaze(g.combat.haze);
    R.setSpeed(0);
    R.setVision({ greyout: 0, tunnel: 0, mono: 0, redout: 0, blackout: 0, flash: 0, damage: 0, blur: 0, pinhole: 0, heart: 0 });
    R.render();
  };
  // run frames for a while (terrain tiles stream in, vapour and clouds settle)
  api.settle = async (ms = 4000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      api.frame();
      await sleep(30);
    }
  };
  api.capture = async (q = 0.9) => {
    if (api.before) api.before();
    api.frame();
    const c = window.game.renderer.canvas;
    // (the size of the picture actually taken)
    const w = c.width, h = c.height;
    const blob = await new Promise((r) => c.toBlob(r, 'image/webp', q));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { w, h, b64: btoa(s) };
  };
  api.setRes = (rows) => {
    const g = window.game;
    g.settings.graphics.resolution = rows;
    g.applySettings();
  };
  // the camera around a point: compass bearing FROM the point to the camera (deg), elevation (deg), distance;
  // returns the compass bearing the camera looks along (for placing the sun)
  api.orbit = (at, brg, el, dist, fov = 30, roll = 0, look = [0, 0, 0]) => {
    const b = brg * D, e = el * D;
    const from = [at[0] + Math.sin(b) * Math.cos(e) * dist, at[1] + Math.sin(e) * dist, at[2] - Math.cos(b) * Math.cos(e) * dist];
    api.view(from, [at[0] + look[0], at[1] + look[1], at[2] + look[2]], fov, roll);
    return (brg + 180) % 360;
  };
  api.at = (a) => [a.fm.pos.x, a.fm.pos.y, a.fm.pos.z];
  // the highest ground found in a search around a point (x, z, h)
  api.findHigh = async (x0, z0, radius = 40000) => {
    const { surfaceHeight } = await import('/src/world/terrain.ts');
    let best = [x0, z0, -1e9];
    for (let x = -radius; x <= radius; x += 1200) for (let z = -radius; z <= radius; z += 1200) {
      const h = surfaceHeight(x0 + x, z0 + z);
      if (h > best[2]) best = [x0 + x, z0 + z, h];
    }
    return best;
  };
  api.fields = async () => (await import('/src/world/islands.ts')).AIRFIELDS;
  api.h = async (x, z) => (await import('/src/world/terrain.ts')).surfaceHeight(x, z);
  // the nearest open water (a spiral search) from a point
  api.findSea = async (x0, z0, minDepthRing = 1500) => {
    const { surfaceHeight } = await import('/src/world/terrain.ts');
    for (let r = 0; r < 120000; r += 1500)
      for (let k = 0; k < Math.max(1, Math.floor(r / 1500) * 6); k++) {
        const a = (k / Math.max(1, Math.floor(r / 1500) * 6)) * Math.PI * 2;
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        let ok = true;
        for (let j = 0; j < 8 && ok; j++) if (surfaceHeight(x + Math.cos(j) * minDepthRing, z + Math.sin(j) * minDepthRing) > 0.5) ok = false;
        if (ok && surfaceHeight(x, z) <= 0.5) return [x, z];
      }
    return [x0, z0];
  };
  return api;
})();
