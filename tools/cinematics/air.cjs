// the air program's cinematic shots on the main theater (each composes one frame)
module.exports = { map: 'triad', list: {
  '01': async (c, g) => {
    await c.start({ jet: 'F22', tod: 'dusk', weather: 'clear' });
    const p = g.player;
    const [sx, sz] = await c.findSea(p.fm.pos.x, p.fm.pos.z, 3000);
    const h = 70;
    c.pose(p, { pos: [sx, 180, sz], hdg: h, pitch: 72, roll: 32, aoa: 40, speed: 70, g: 1.4, ab: 1 });
    const look = c.orbit(c.at(p), h - 70, -10, 52, 30, 2, [0, 2, 0]);
    c.sun(5, look + 26);
    await c.settle(5000);
    return 'F-22A RAPTOR · THE COBRA';
  },
  '02': async (c, g) => {
    await c.start({ jet: 'F15EX', tod: 'morning', weather: 'cloudy' });
    const p = g.player;
    const P = p.fm.pos;
    c.pose(p, { pos: [P.x, 2600, P.z], hdg: 20, pitch: 86, roll: 40, speed: 260, g: 1.2, ab: 1 });
    const look = c.orbit(c.at(p), 200, -50, 30, 44, 0, [0, 5, 0]);
    c.sun(35, look + 40);
    await c.settle(5000);
    return 'F-15EX EAGLE II · STRAIGHT UP';
  },
  '03': async (c, g) => {
    await c.start({ jet: 'SU57', tod: 'dusk', weather: 'clear' });
    const p = g.player;
    const [sx, sz] = await c.findSea(p.fm.pos.x + 20000, p.fm.pos.z, 3000);
    const h = 250;
    c.pose(p, { pos: [sx, 32, sz], hdg: h, pitch: 4, roll: -62, aoa: 9, speed: 240, g: 4.5, ab: 0.6 });
    const look = c.orbit(c.at(p), h + 35, 1, 34, 34, -3, [0, -1, 0]);
    c.sun(4, look - 18);
    await c.settle(5000);
    return 'SU-57 FELON · WAVE-TOP TURN';
  },
  '04': async (c, g) => {
    await c.start({ jet: 'RAFALE', tod: 'afternoon', weather: 'clear' });
    const p = g.player;
    const [sx, sz] = await c.findSea(p.fm.pos.x, p.fm.pos.z + 15000, 3000);
    const h = 100;
    c.pose(p, { pos: [sx, 45, sz], hdg: h, pitch: 1, roll: 0, aoa: 2, speed: 325, mach: 0.965, g: 1.1, ab: 1 });
    const look = c.orbit(c.at(p), h - 100, 2, 30, 38, 0, [0, 0, 0]);
    c.sun(28, look + 150);
    await c.settle(5000);
    return 'RAFALE · THROUGH THE VAPOUR';
  },
  '05': async (c, g) => {
    await c.start({ jet: 'FA18EF', tod: 'afternoon', weather: 'cloudy' });
    const p = g.player;
    const P = p.fm.pos;
    const h = 310;
    c.pose(p, { pos: [P.x, 1400, P.z], hdg: h, pitch: 12, roll: -78, aoa: 14, speed: 170, g: 7.2, ab: 0 });
    const look = c.orbit(c.at(p), h + 150, 18, 30, 40, 0, [0, 0, 0]);
    c.sun(30, look + 120);
    await c.settle(5000);
    return 'SUPER HORNET · SEVEN G';
  },
  '06': async (c, g) => {
    await c.start({ jet: 'TYPHOON', tod: 'dusk', weather: 'clear' });
    const p = g.player;
    const [hx, hz, hh] = await c.findHigh(p.fm.pos.x, p.fm.pos.z, 50000);
    const h = 40;
    // (level with the ridges, so the hills and the sky are behind it, not the valley floor)
    c.pose(p, { pos: [hx - 1400, hh + 40, hz + 1400], hdg: h, pitch: 2, roll: 90, aoa: 3, speed: 230, g: 1, ab: 0.3 });
    const look = c.orbit(c.at(p), h + 75, 3, 30, 34, 0, [0, 0, 0]);
    c.sun(9, look + 150);
    await c.settle(6000);
    return 'TYPHOON · KNIFE EDGE IN THE HILLS';
  },
  '07': async (c, g) => {
    await c.start({ jet: 'MIG31', tod: 'dusk', weather: 'cloudy' });
    const p = g.player;
    const P = p.fm.pos;
    const h = 260;
    c.pose(p, { pos: [P.x, 20500, P.z], hdg: h, pitch: 6, roll: -12, aoa: 4, speed: 760, mach: 2.6, ab: 1 });
    const look = c.orbit(c.at(p), h + 130, 6, 42, 34, -2, [0, 0, 0]);
    c.sun(6, look - 25);
    await c.settle(5000);
    return 'MIG-31 FOXHOUND · MACH 2.6 AT 67,000 FT';
  },
  '08': async (c, g) => {
    await c.start({ jet: 'SR71', tod: 'dawn', weather: 'cloudy' });
    const p = g.player;
    const P = p.fm.pos;
    const h = 90;
    c.pose(p, { pos: [P.x, 24500, P.z], hdg: h, pitch: 2, roll: 0, aoa: 4, speed: 950, mach: 3.2, ab: 1 });
    const look = c.orbit(c.at(p), h - 75, -4, 70, 30, 0, [0, 0, 0]);
    c.sun(2, look + 30);
    await c.settle(5000);
    return 'SR-71 BLACKBIRD · 80,000 FT AT DAWN';
  },
  '09': async (c, g) => {
    await c.start({ jet: 'X15', tod: 'noon', weather: 'cloudy' });
    const p = g.player;
    const P = p.fm.pos;
    const h = 0;
    c.pose(p, { pos: [P.x, 62000, P.z], hdg: h, pitch: 38, roll: 0, aoa: 2, speed: 1500, mach: 5, ab: 1 });
    const look = c.orbit(c.at(p), h + 160, -22, 26, 40, 0, [0, 0, 0]);
    c.sun(40, look + 100);
    await c.settle(5000);
    return 'X-15 · CLIMBING OUT OF THE ATMOSPHERE';
  },
  '10': async (c, g) => {
    await c.start({ jet: 'F16C', tod: 'dusk', weather: 'cloudy' });
    const lead = g.player;
    const P = lead.fm.pos;
    const h = 120;
    const base = [P.x, 3400, P.z];
    c.pose(lead, { pos: base, hdg: h, pitch: 0, roll: 0, aoa: 4, speed: 220 });
    const offs = [[-14, -2, 12], [14, -2, 12], [0, -4, 24]];
    for (const o of offs) {
      const a = await c.add('F16C');
      const w = c.rel(lead, o[0], o[1], o[2]);
      c.pose(a, { pos: w, hdg: h, pitch: 0, roll: 0, aoa: 4, speed: 220 });
    }
    const look = c.orbit(c.rel(lead, 0, -2, 12), h + 205, 9, 75, 30, 0, [0, 0, 0]);
    c.sun(5, look + 15);
    await c.settle(5000);
    return 'F-16C · DIAMOND AT GOLDEN HOUR';
  },
  '11': async (c, g) => {
    await c.start({ jet: 'F15EX', tod: 'dawn', weather: 'clear' });
    const p = g.player;
    const f = (await c.fields()).find((x) => !x.carrier) ;
    const { surfaceHeight } = await import('/src/world/terrain.ts');
    const x = f.x - f.ax * f.length * 0.25, z = f.z - f.az * f.length * 0.25;
    const y = surfaceHeight(x, z) + p.spec.gear.height;
    c.pose(p, { pos: [x, y, z], hdg: f.heading, pitch: 0, roll: 0, aoa: 0, speed: 0, gear: 1, ab: 0, rpm: 0.7 });
    p.fm.onGround = true;
    // (held at idle on the brakes: at full power it would be half a mile down the runway by the time the picture is taken)
    if (p.controls) { p.controls.throttle = 0; p.controls.wheelBrake = 1; p.controls.gearDown = true; }
    const look = c.orbit(c.rel(p, 0, 1, -2), f.heading + 35, 1.5, 34, 32, 0, [0, 0, 0]);
    c.sun(3, look - 10);
    await c.settle(6000);
    return 'F-15EX · ON THE RUNWAY AT FIRST LIGHT';
  },
  '12': async (c, g) => {
    await c.start({ jet: 'F15EX', tod: 'afternoon', weather: 'storm' });
    const p = g.player;
    const P = p.fm.pos;
    const h = 200;
    c.pose(p, { pos: [P.x, 900, P.z], hdg: h, pitch: -3, roll: 25, aoa: 6, speed: 230, g: 2.5, ab: 0 });
    const look = c.orbit(c.at(p), h - 140, 6, 36, 36, 0, [0, 0, 0]);
    await c.settle(6000);
    return 'F-15EX · UNDER THE STORM';
  },
  '13': async (c, g) => {
    await c.start({ jet: 'F22', tod: 'afternoon', weather: 'cloudy' });
    const p = g.player;
    const P = p.fm.pos;
    const h = 30;
    c.pose(p, { pos: [P.x, 3600, P.z], hdg: h, pitch: 10, roll: -70, aoa: 16, speed: 150, g: 6, ab: 1 });
    const e = await c.add('SU35');
    c.pose(e, { pos: c.rel(p, 26, 14, -40), hdg: h + 140, pitch: -5, roll: 75, aoa: 16, speed: 150, g: 6.5, ab: 1 });
    const look = c.orbit(c.rel(p, 13, 7, -20), h - 120, 6, 120, 30, 0, [0, 0, 0]);
    c.sun(32, look + 140);
    await c.settle(5000);
    return 'F-22 VS SU-35S · THE MERGE';
  },
  '14': async (c, g) => {
    await c.start({ jet: 'SU35', tod: 'dusk', weather: 'cloudy' });
    const p = g.player;
    const P = p.fm.pos;
    const h = 150;
    c.pose(p, { pos: [P.x, 3200, P.z], hdg: h, pitch: 50, roll: 0, aoa: 35, speed: 75, g: 1.8, ab: 1 });
    const look = c.orbit(c.at(p), h + 95, -6, 40, 32, 0, [0, 3, 0]);
    c.sun(4, look + 12);
    await c.settle(5000);
    return 'SU-35S · VECTORED THRUST';
  },
  '15': async (c, g) => {
    await c.start({ jet: 'F15EX', tod: 'dusk', weather: 'cloudy' });
    const lead = g.player;
    const P = lead.fm.pos;
    const h = 260;
    c.pose(lead, { pos: [P.x, 2800, P.z], hdg: h, pitch: 3, roll: 0, aoa: 4, speed: 230, ab: 1 });
    const t = await c.add('TYPHOON');
    c.pose(t, { pos: c.rel(lead, 16, -3, 14), hdg: h, pitch: 3, roll: 0, aoa: 4, speed: 230, ab: 1 });
    const r = await c.add('RAFALE');
    c.pose(r, { pos: c.rel(lead, 32, -6, 28), hdg: h, pitch: 3, roll: 0, aoa: 4, speed: 230, ab: 1 });
    const look = c.orbit(c.rel(lead, 16, -3, 14), h + 160, 3, 85, 30, 0, [0, 0, 0]);
    c.sun(3, look + 8);
    await c.settle(5000);
    return 'EAGLE, TYPHOON, RAFALE · ECHELON AT SUNSET';
  },
  '16': async (c, g) => {
    // the airshow: the crowd at the barrier, a jet ripping past in front of them
    const { defaultMission } = await import('/src/game/mission.ts');
    document.querySelector('.menu-root')?.classList.add('hidden');
    Object.assign(g.settings.graphics, { quality: 'ultra', resolution: 'native', antialias: 4, shadows: 'ultra', terrainLighting: true, bloom: 0.65, lightScattering: true, cloudQuality: 'ultra', cloudShadows: true, autoRes: false });
    await g.startMission(Object.assign(defaultMission(), { mode: 'spotter', aircraft: 'F22', timeOfDay: 'afternoon' }), () => {});
    g.running = false;
    g.applySettings();
    const m = g.mode;
    m.transition = null;
    m.host.rollStage?.end?.();
    const jet = m.jet.ac;
    const f = m.field;
    const { fromRunwayLocal } = await import('/src/world/islands.ts');
    // the crowd line: the camera behind the spectators, low, looking out over their heads
    const along = -150, across = 0;
    const jp = fromRunwayLocal(f, along + 40, -40);
    const h0 = f.elev;
    c.pose(jet, { pos: [jp.x, h0 + 28, jp.z], hdg: (f.heading + 180) % 360, pitch: 4, roll: -70, aoa: 12, speed: 160, g: 6.4, ab: 1 });
    const { BARRIER_Z } = await import('/src/game/airshowScene.ts');
    const eye = fromRunwayLocal(f, along - 18, BARRIER_Z - 22);
    const look = fromRunwayLocal(f, along + 30, -10);
    c.view([eye.x, h0 + 4.2, eye.z], [look.x, h0 + 18, look.z], 46, 0);
    c.sun(32, ((f.heading + 200) % 360));
    c.custom = (dt) => {
      m.grounds?.animate(performance.now() / 1000, jet.fm.pos);
      const R = g.renderer;
      const cam = R.camera;
      cam.updateMatrixWorld();
      g.world.update(dt, cam, jet.fm.pos);
      g.combat.update(dt, cam);
      R.setHaze(g.combat.haze);
      R.setCameraLook?.(null);
      R.setDof?.(null);
      R.render();
    };
    await c.settle(6000);
    return 'AIRSHOW · THE CROWD LINE';
  },
  '17': async (c, g) => {
    // the F-35A pulling up off the sea into the first light, low sun behind the camera
    await c.start({ jet: 'F35A', tod: 'dawn', weather: 'clear' });
    const p = g.player;
    const [sx, sz] = await c.findSea(p.fm.pos.x - 15000, p.fm.pos.z, 3000);
    const h = 320;
    c.pose(p, { pos: [sx, 260, sz], hdg: h, pitch: 28, roll: -18, aoa: 12, speed: 210, g: 5, ab: 1 });
    const look = c.orbit(c.at(p), h + 140, -6, 28, 36, 2, [0, 1, 0]);
    c.sun(6, look + 165);
    await c.settle(5000);
    return 'F-35A LIGHTNING II · PULLING UP AT DAWN';
  },
}};
