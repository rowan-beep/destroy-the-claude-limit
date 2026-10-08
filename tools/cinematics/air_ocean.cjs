module.exports = { map: 'ocean', list: {
  '19': async (c, g) => {
    await c.start({ jet: 'FA18EF', tod: 'dusk', weather: 'clear' });
    const p = g.player;
    const { CARRIERS } = await import('/src/world/carriers.ts');
    const cv = CARRIERS.find((x) => x.f.team === 'blue') || CARRIERS[0];
    const cat = cv.layout.cats[0];
    const w = cv.toWorld(cat.u - 6, cat.v, { x: 0, z: 0 });
    const y = cv.deckY(cat.u - 6, cat.v) + p.spec.gear.height;
    const hdg = (cv.heading + cat.off + 360) % 360;
    c.pose(p, { pos: [w.x, y, w.z], hdg, pitch: 0, roll: 0, aoa: 0, speed: 0, gear: 1, ab: 1 });
    p.fm.onGround = true;
    const look = c.orbit(c.rel(p, 0, 1.5, 0), hdg + 150, 4, 26, 40, 0, [0, 0, 0]);
    c.sun(3, look - 8);
    await c.settle(6000);
    return 'SUPER HORNET · ON THE CATAPULT AT SUNSET';
  },
  '20': async (c, g) => {
    await c.start({ jet: 'F35A', tod: 'afternoon', weather: 'cloudy' });
    const p = g.player;
    const { CARRIERS } = await import('/src/world/carriers.ts');
    const cv = CARRIERS.find((x) => x.f.team === 'blue') || CARRIERS[0];
    const f = cv.f;
    const back = 260;
    const x = f.x - f.ax * back, z = f.z - f.az * back;
    const y = f.elev + back * Math.tan(3.5 * Math.PI / 180) + 4;
    c.pose(p, { pos: [x, y, z], hdg: f.heading, pitch: 5, roll: -3, aoa: 9, speed: 72, gear: 1, ab: 0 });
    const look = c.orbit(c.rel(p, 0, 0, -60), f.heading + 205, 10, 110, 30, 0, [0, -6, 0]);
    c.sun(30, look + 70);
    await c.settle(7000);
    return 'F-35A · IN THE GROOVE';
  },
}};
