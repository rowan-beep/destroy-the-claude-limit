// the space program's cinematic shots: each sets a mission up and frames its camera
module.exports = { list: {
  // the hero: the Saturn V on the pad at sunset, the tower beside it
  '01': async () => {
    const s = window.__site;
    s.yaw = s.yawS = -0.55; s.pitch = s.pitchS = 0.02; s.zoom = s.zoomS = 0.72;
    await wait(4000);
    return 'SATURN V · PAD 39A AT SUNSET';
  },
  '02': async () => {
    const f = window.__flight;
    f.start('pad');
    await wait(1500);
    f.sim.ignite();
    const sim = f.sim;
    for (let i = 0; i < 4000 && sim.alt < 90; i++) sim.advance(0.02);
    f.camYaw = -2.0; f.camPitch = -0.12; f.camDist = 150;
    await wait(3000);
    return 'SATURN V · LIFTOFF';
  },
  '03': async () => {
    const f = window.__flight;
    f.start('pad');
    await wait(1500);
    f.sim.ignite();
    const sim = f.sim;
    for (let i = 0; i < 200000 && sim.alt < 62000; i++) sim.advance(0.05);
    f.camYaw = 2.4; f.camPitch = 0.05; f.camDist = 260;
    await wait(3500);
    return 'SATURN V · CLIMBING OUT OF THE AIR';
  },
  '04': async () => {
    const f = window.__flight;
    f.start('orbit');
    await wait(2000);
    f.camYaw = 1.9; f.camPitch = 0.4; f.camDist = 40;
    await wait(3500);
    return 'APOLLO · PARKING ORBIT, 185 KM';
  },
  '05': async () => {
    const f = window.__flight;
    f.start('lunar');
    await wait(2000);
    f.camYaw = 2.9; f.camPitch = 0.08; f.camDist = 38;
    await wait(3500);
    return 'APOLLO · LUNAR ORBIT';
  },
  '06': async () => {
    [...document.querySelectorAll('.sx2-card')].find((c) => c.textContent.includes('CREW DRAGON')).click();
    await wait(4000);
    const m = window.__launch;
    m.action();
    const f = m.flight;
    for (let i = 0; i < 20000 && f.alt < 160; i++) { f.advance(0.02); m.script(f); }
    m.camYaw = -2.4; m.camPitch = -0.06; m.camDist = 75;
    await wait(3500);
    return 'FALCON 9 · CREW DRAGON LIFTOFF';
  },
  '07': async () => {
    [...document.querySelectorAll('.sx2-card')].find((c) => c.textContent.includes('CREW DRAGON')).click();
    await wait(4000);
    const m = window.__launch;
    m.action();
    const f = m.flight;
    for (let i = 0; i < 400000 && !(m.rv && m.rv.phase === 'approach' && m.rv.seg >= 2); i++) { f.advance(m.rv ? 0.5 : 0.05); m.script(f); }
    // (the camera went with the first stage to the drone ship: back to Dragon)
    m.follow = 'stack';
    m.landedAtT = 1;
    m.camYaw = 2.2; m.camPitch = 0.18; m.camDist = 60;
    await wait(4000);
    return 'CREW DRAGON · CLOSING ON THE ISS';
  },
  '08': async () => {
    [...document.querySelectorAll('.sx2-card')].find((c) => c.textContent.includes('CREW DRAGON')).click();
    await wait(4000);
    const m = window.__launch;
    m.action();
    const f = m.flight;
    for (let i = 0; i < 600000 && !(m.rv && m.rv.phase === 'docked'); i++) { f.advance(m.rv ? 0.5 : 0.05); m.script(f); }
    // (the camera went with the first stage to the drone ship: back to Dragon)
    m.follow = 'stack';
    m.landedAtT = 1;
    m.camYaw = 0.9; m.camPitch = -0.3; m.camDist = 110;
    await wait(4000);
    return 'THE ISS · CREW DRAGON DOCKED';
  },
  '09': async () => {
    [...document.querySelectorAll('.sx2-card')].find((c) => c.textContent.includes('EUROPA CLIPPER')).click();
    await wait(4000);
    const m = window.__launch;
    m.action();
    const f = m.flight;
    for (let i = 0; i < 20000 && f.alt < 220; i++) { f.advance(0.02); m.script(f); }
    m.camYaw = -1.7; m.camPitch = -0.08; m.camDist = 170;
    await wait(3500);
    return 'FALCON HEAVY · 27 ENGINES';
  },
  '10': async () => {
    [...document.querySelectorAll('.sx2-card')].find((c) => c.textContent.includes('EUROPA CLIPPER')).click();
    await wait(4000);
    const m = window.__launch;
    m.action();
    const f = m.flight;
    for (let i = 0; i < 400000 && !f.free.some((s) => s.phase === 'landing' && Math.hypot(...s.r) - 6371000 < 900); i++) { f.advance(0.05); m.script(f); }
    m.camYaw = 0.6; m.camPitch = 0.02; m.camDist = 70;
    await wait(4000);
    return 'FALCON HEAVY · TWIN BOOSTERS COMING HOME';
  },
  '11': async () => {
    [...document.querySelectorAll('.sx2-card')].find((c) => c.textContent.includes('ARTEMIS')).click();
    await wait(4000);
    const m = window.__launch;
    m.action();
    const f = m.flight;
    for (let i = 0; i < 20000 && f.alt < 200; i++) { f.advance(0.02); m.script(f); }
    m.camYaw = 2.3; m.camPitch = -0.1; m.camDist = 200;
    await wait(3500);
    return 'SLS · ARTEMIS II LIFTOFF';
  },
  '12': async () => {
    [...document.querySelectorAll('.sx2-card')].find((c) => c.textContent.includes('ARTEMIS')).click();
    await wait(4000);
    const m = window.__launch;
    m.action();
    const f = m.flight;
    for (let i = 0; i < 400000 && f.alt < 120000; i++) { f.advance(0.05); m.script(f); }
    m.camYaw = 1.2; m.camPitch = -0.15; m.camDist = 90;
    await wait(3500);
    return 'SLS · BOOSTERS AWAY';
  },
  '13': async () => {
    window.__mars.start();
    await wait(4000);
    const m = window.__mars;
    m.camYaw = -0.6; m.camPitch = -0.02; m.camDist = 240;
    await wait(3500);
    return 'STARSHIP · ON THE TOWER';
  },
  '14': async () => {
    window.__mars.start();
    await wait(3000);
    const m = window.__mars;
    m.action?.();
    const f = m.flight;
    for (let i = 0; i < 20000 && f.alt < 300; i++) { f.advance(0.02); m.script?.(f); }
    m.camYaw = -2.0; m.camPitch = -0.1; m.camDist = 260;
    await wait(3500);
    return 'STARSHIP · 33 RAPTORS';
  },
  '15': async () => {
    [...document.querySelectorAll('.sx2-card')].find((c) => c.textContent.includes('SEVEN')).click();
    await wait(5000);
    const r = window.__rover;
    const e = r.edl;
    for (let i = 0; i < 40000 && !(e.phase === 'entry' && e.t > 90); i++) e.step(0.05);
    r.paused = true;
    await wait(4000);
    return 'MARS 2020 · ENTRY';
  },
  '16': async () => {
    [...document.querySelectorAll('.sx2-card')].find((c) => c.textContent.includes('SEVEN')).click();
    await wait(5000);
    const r = window.__rover;
    const e = r.edl;
    for (let i = 0; i < 40000 && !(e.phase === 'skycrane' && e.t > 316); i++) e.step(0.05);
    r.paused = true;
    // (the game's target beacons and the grit blowing past the lens: not for a still)
    for (const m of r.markers || []) m.visible = false;
    if (r.mars) r.mars.wind.motes.material.size = 0;
    await wait(4000);
    return 'MARS 2020 · THE SKY CRANE';
  },
  '17': async () => {
    [...document.querySelectorAll('.sx2-card')].find((c) => c.textContent.includes('JEZERO')).click();
    await wait(6000);
    const r = window.__rover;
    r.camYaw = 2.4; r.camPitch = 0.16; r.camDist = 7;
    await wait(4000);
    return 'PERSEVERANCE · JEZERO CRATER';
  },
  '18': async () => {
    [...document.querySelectorAll('.sx2-card')].find((c) => c.textContent.includes('GALE')).click();
    await wait(6000);
    const r = window.__rover;
    r.camYaw = -2.6; r.camPitch = 0.08; r.camDist = 8;
    await wait(4000);
    return 'CURIOSITY · BELOW MOUNT SHARP';
  },
  '19': async () => {
    window.__explorer.start();
    await wait(2000);
    const x = window.__explorer;
    x.focus = 'saturn';
    x.move = null;
    x.faceSun();
    x.yaw += 0.7;
    x.pitch = 0.32;
    x.zoom = 4.2;
    x.paused = true;
    await wait(4000);
    return 'SATURN · THE RINGS';
  },
  '20': async () => {
    window.__explorer.start();
    await wait(2000);
    const x = window.__explorer;
    x.focus = 'jupiter';
    x.move = null;
    x.faceSun();
    x.yaw += 0.9;
    x.pitch = 0.12;
    x.zoom = 3.2;
    x.paused = true;
    await wait(4000);
    return 'JUPITER · THE GIANT';
  },
}};
