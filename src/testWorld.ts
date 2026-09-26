// Developer harness: renders the world from a scripted camera (?test=world&x=..&y=..&z=..&h=..&p=..).
import * as THREE from 'three';
import { GameRenderer } from './render/renderer';
import { World } from './world/world';
import { emptyVision } from './render/vision';
import { dirFromHeadingPitch } from './core/math';

export async function runWorldTest(container: HTMLElement): Promise<void> {
  const q = new URLSearchParams(location.search);
  const gr = new GameRenderer(container);
  const world = new World(gr.scene);
  const t0 = performance.now();
  await world.buildGrid(() => {});
  const tGrid = performance.now() - t0;
  world.init();
  const pos = new THREE.Vector3(+(q.get('x') ?? -290000), +(q.get('y') ?? 1500), +(q.get('z') ?? -190000));
  const hdg = +(q.get('h') ?? 90), pitch = +(q.get('p') ?? -8);
  gr.camera.position.copy(pos);
  const dir = dirFromHeadingPitch(hdg, pitch);
  gr.camera.lookAt(pos.clone().add(dir));
  if (q.get('tod')) world.env.setTimeOfDay(q.get('tod') as never);
  await world.prewarm(pos, gr.camera, 20000);
  let frames = 0;
  const loop = () => {
    world.update(1 / 60, gr.camera, pos);
    gr.setVision(emptyVision());
    gr.render();
    frames++;
    if (frames < 6) requestAnimationFrame(loop);
    else {
      (window as unknown as { __ready: unknown }).__ready = { tGrid, stats: world.terrain.stats, trees: world.trees.stats, fallback: world.pool.usingFallback, info: gr.renderer.info.render };
    }
  };
  loop();
}
