module.exports = { map: 'frost', list: {
  '18': async (c, g) => {
    await c.start({ jet: 'GRIPEN', tod: 'morning', weather: 'clear' });
    const p = g.player;
    const [hx, hz, hh] = await c.findHigh(p.fm.pos.x, p.fm.pos.z, 40000);
    const [sx, sz] = await c.findSea(hx, hz, 1500);
    const h = 300;
    const x = (hx + sx) / 2, z = (hz + sz) / 2;
    const y = Math.max(await c.h(x, z), 0) + 90;
    c.pose(p, { pos: [x, y, z], hdg: h, pitch: 3, roll: 48, aoa: 7, speed: 220, g: 3, ab: 0.4 });
    const look = c.orbit(c.at(p), h - 50, 6, 30, 36, 0, [0, -2, 0]);
    c.sun(10, look + 150);
    await c.settle(6000);
    return 'GRIPEN E · NORTHERN FJORD';
  },
}};
