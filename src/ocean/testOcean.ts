// Developer harness: the ocean world from a scripted camera
// (?test=ocean&x=..&y=..&z=..&h=..&p=..&wx=dawn|calm|overcast&q=balanced&lamps=1&sub=x,y,z,h).
import * as THREE from 'three';
import { GameRenderer } from '../render/renderer';
import { emptyVision } from '../render/vision';
import { OceanWorld } from './render/oceanWorld';
import type { Weather } from './world/waves';
import type { OceanPreset } from './perf/presets';

export async function runOceanTest(container: HTMLElement): Promise<void> {
  const q = new URLSearchParams(location.search);
  const gr = new GameRenderer(container);
  const world = new OceanWorld(gr.renderer, (q.get('q') ?? 'balanced') as OceanPreset, (q.get('wx') ?? 'dawn') as Weather);
  const cam = world.camera;
  Object.assign(window, { __ow: world, __gr: gr });
  const pos = new THREE.Vector3(+(q.get('x') ?? 0), +(q.get('y') ?? 10), +(q.get('z') ?? -100));
  const hdg = (+(q.get('h') ?? 0) * Math.PI) / 180, pitch = (+(q.get('p') ?? -10) * Math.PI) / 180;
  cam.position.copy(pos);
  cam.lookAt(pos.x + Math.sin(hdg) * Math.cos(pitch), pos.y + Math.sin(pitch), pos.z - Math.cos(hdg) * Math.cos(pitch));
  const sub = (q.get('sub') ?? '').split(',').map(Number);
  if (sub.length === 4) world.sub.place(sub[0], sub[1], sub[2], sub[3], 0, 0);
  else world.sub.place(-12, 0.3, -150, 180, 0, 0);
  const lamps = q.get('lamps') !== '0';
  world.sub.setLights(lamps);
  if (q.get('arm')) world.sub.poseArm(+q.get('arm')!, 0.8);
  const t0 = performance.now();
  world.fill(pos.x, pos.z);
  const tFill = performance.now() - t0;
  let frames = 0;
  const loop = () => {
    const sz = gr.size;
    world.resize(sz.w, sz.h);
    world.update(1 / 60, sz.h, { x: pos.x, z: pos.z }, { lamps, overlay: false, boat: null });
    gr.setVision(emptyVision());
    const r = gr.renderer;
    const e = r.toneMappingExposure;
    r.toneMappingExposure = e * (q.get('ev') ? +q.get('ev')! : world.exposureFor(lamps));
    world.draw((sc, c) => gr.renderScene(sc, c, THREE.ACESFilmicToneMapping));
    r.toneMappingExposure = e;
    frames++;
    (window as unknown as { __frame: () => void }).__frame = loop;
    if (frames < 8) requestAnimationFrame(loop);
    else (window as unknown as { __ready: unknown }).__ready = { tFill, under: world.under, ambient: world.ambient, stats: world.stats() };
  };
  loop();
}
