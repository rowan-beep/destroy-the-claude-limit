// the ocean program's cinematic shots: each puts PETREL somewhere, frames the
// chase camera and lets the light settle (the dive's debugging hooks). The shots
// run inside the page: `setup` is put there as window.dive first (runocean.cjs).
const dive = async (o) => {
  const d = window.__dive, oc = window.__ocean;
  localStorage.setItem('triad.ocean.settings.v1', JSON.stringify({ preset: 'cinematic', weather: o.weather, guidance: 'instruments', relaxed: true, reduceMotion: true, largeHud: false, visibilityAid: false, lookSpeed: 1 }));
  if (!d.active) oc.start('free', false);
  await wait(1500);
  const s = d.sub;
  s.x = o.x; s.y = o.y; s.z = o.z; s.heading = o.h;
  s.vx = s.vy = s.vz = 0; s.yawRate = 0;
  s.ballast = o.y < -2 ? 0.9 : 0;
  s.holdDepth = o.y < -2 ? -o.y : null;
  s.holdPos = { x: o.x, z: o.z, heading: o.h };
  s.lights = o.lamps !== false;
  d.world.sub.setLights(s.lights);
  d.stepper.prev = { x: o.x, y: o.y, z: o.z, heading: o.h, pitch: 0, roll: 0 };
  d.cam = o.dome ? 'dome' : 'chase';
  d.world.sub.setInterior(!!o.dome);
  d.camYaw = o.yaw ?? 0; d.camPitch = o.pitch ?? 0.2; d.camDist = o.dist ?? 11;
  d.lookYaw = o.lookYaw ?? 0; d.lookPitch = o.lookPitch ?? 0;
  d.lastDrag = performance.now() + 1e9;
  d.camInit = false;
  oc.world.fill(o.x, o.z);
  d.hud.show(false);
  await wait(1200);
  d.exposure = oc.world.exposureFor(s.lights);
};
module.exports = { setup: dive.toString(), list: {
  // the hero: PETREL alongside at first light
  '01': async () => {
    await dive({ weather: 'dawn', x: -12, y: -0.75, z: -150, h: 180, yaw: 2.5, pitch: 0.12, dist: 13 });
    await wait(3000);
    return 'SV-1 PETREL · KESTREL HARBOR AT FIRST LIGHT';
  },
  '02': async () => {
    await dive({ weather: 'calm', x: 150, y: -0.6, z: 430, h: 200, yaw: 2.9, pitch: 0.02, dist: 9 });
    await wait(3000);
    return 'PETREL · AT THE WATERLINE';
  },
  '03': async () => {
    await dive({ weather: 'calm', x: 560, y: -9, z: 500, h: 30, yaw: 2.4, pitch: 0.25, dist: 12, lamps: false });
    await wait(3000);
    return 'LANTERN REEF · 15 M';
  },
  '04': async () => {
    await dive({ weather: 'calm', x: 150, y: -14, z: 430, h: 90, yaw: 0.4, pitch: -0.9, dist: 12, lamps: false });
    await wait(3000);
    return "SNELL'S WINDOW · LOOKING UP FROM 14 M";
  },
  '05': async () => {
    // the stern of the wreck in the lamps
    // (the plate faces astern, 208°: PETREL lies off it heading 028°)
    await dive({ weather: 'dawn', x: -290.5, y: -76, z: 1237.4, h: 28, yaw: 0.45, pitch: 0.3, dist: 8 });
    await wait(3500);
    return 'MV ORIEL BAY · 84 M DOWN';
  },


  '08': async () => {
    // (PETREL heads north into the stand, the camera behind her: the clumps fill the view 15-35 m off)
    await dive({ weather: 'dawn', x: -516, y: -7, z: 324, h: 180, yaw: 0.3, pitch: 0.08, dist: 9, lamps: false });
    await wait(3000);
    return 'THE KELP STAND · 6 M';
  },
  '09': async () => {
    await dive({ weather: 'overcast', x: 120, y: -0.75, z: 520, h: 230, yaw: 2.2, pitch: 0.18, dist: 15 });
    await wait(3000);
    return 'OVERCAST, ROUGH · SURFACED';
  },
} };
