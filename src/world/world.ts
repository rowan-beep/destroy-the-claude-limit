// Owns everything static in the theater: terrain, sea, sky, trees, clouds
// and airfields. Built once at start-up (height grid generation happens in
// background workers while the main menu is visible).

import * as THREE from 'three';
import { MAP_HALF } from '../core/constants';
import { WorkerPool } from './workerPool';
import { HeightGrid, GRID_N } from './heightGrid';
import { TerrainLOD } from './terrainLOD';
import { Ocean } from './ocean';
import { Environment } from '../render/environment';
import { TreeSystem } from './trees';
import { CloudSystem } from './clouds';
import { PrecipitationFx, Weather, loadWeather } from './weather';
import { AirfieldRenderer } from './airfieldMeshes';
import { CarrierRenderer } from '../render/carrierRenderer';
import { NIGHT } from '../render/night';
import type { GridResult } from './terrainGen';
import { MapData } from './mapData';
import { TerrainLightBaker } from '../render/terrainLight';

export interface WorldQuality {
  terrainSplitK: number;
  terrainMaxLevel: number;
  treeNear: number;
  treeFar: number;
  clouds: number;
}

export const WORLD_QUALITY: Record<string, WorldQuality> = {
  low: { terrainSplitK: 1.6, terrainMaxLevel: 9, treeNear: 1400, treeFar: 3500, clouds: 0.5 },
  medium: { terrainSplitK: 1.9, terrainMaxLevel: 10, treeNear: 2000, treeFar: 5000, clouds: 0.75 },
  high: { terrainSplitK: 2.7, terrainMaxLevel: 10, treeNear: 2600, treeFar: 7000, clouds: 1 },
  ultra: { terrainSplitK: 3.3, terrainMaxLevel: 11, treeNear: 3400, treeFar: 9000, clouds: 1.2 },
};

export class World {
  readonly pool: WorkerPool;
  grid!: HeightGrid;
  /** vector / raster map data for the cockpit moving maps */
  mapData!: MapData;
  terrain!: TerrainLOD;
  ocean!: Ocean;
  env!: Environment;
  trees!: TreeSystem;
  clouds!: CloudSystem;
  precip!: PrecipitationFx;
  weather: Weather = loadWeather();
  /** a lightning strike's thunder, with its distance (m) */
  onThunder: ((distance: number) => void) | null = null;
  airfields!: AirfieldRenderer;
  carriers!: CarrierRenderer;
  lightBaker!: TerrainLightBaker;
  ready = false;

  constructor(private scene: THREE.Scene) {
    const hc = navigator.hardwareConcurrency || 4;
    this.pool = new WorkerPool(Math.max(1, Math.min(4, hc - 1)));
  }

  /** Generate the theater height grid (slow part), reporting 0..1 progress. */
  async buildGrid(onProgress: (f: number) => void): Promise<void> {
    const rowsPerJob = 64;
    const reqs: { type: 'grid'; r0: number; r1: number }[] = [];
    for (let r = 0; r < GRID_N; r += rowsPerJob) reqs.push({ type: 'grid', r0: r, r1: Math.min(GRID_N, r + rowsPerJob) });
    const data = new Float32Array(GRID_N * GRID_N);
    await this.pool.runAll(
      reqs,
      (res) => {
        const g = res as GridResult;
        data.set(g.data, g.r0 * GRID_N);
      },
      onProgress,
    );
    this.grid = new HeightGrid(data);
    this.mapData = new MapData(this.grid);
  }

  /** Coastlines, contours and the moving-map raster (cockpit displays). */
  async buildMapData(onProgress: (f: number) => void): Promise<void> {
    await this.mapData.build(onProgress);
  }

  /** Create render objects once the grid exists. */
  init(): void {
    this.env = new Environment(this.scene);
    this.ocean = new Ocean(this.scene, this.env, this.grid);
    this.terrain = new TerrainLOD(this.pool, this.grid);
    this.scene.add(this.terrain.group);
    this.trees = new TreeSystem(this.pool, this.scene);
    this.clouds = new CloudSystem(this.scene, this.env);
    this.precip = new PrecipitationFx(this.scene);
    this.precip.onThunder = (d) => this.onThunder?.(d);
    this.setWeather(this.weather);
    this.airfields = new AirfieldRenderer(this.scene);
    this.carriers = new CarrierRenderer(this.scene, this.env);
    this.lightBaker = new TerrainLightBaker(this.grid, MAP_HALF);
    this.ready = true;
  }

  /** Change the weather (clouds, deck, rain / snow, light and visibility). */
  setWeather(w: Weather): void {
    this.weather = { ...w };
    NIGHT.dark = !!w.dark;
    if (!this.clouds) return; // applied when the world is built
    this.clouds.setWeather(w);
    this.precip.set(w);
    const d = this.clouds.deck;
    const gloom = w.kind === 'storm' ? 0.8 : w.kind === 'rain' ? 0.45 + 0.25 * w.precip : w.kind === 'snow' ? 0.25 : w.kind === 'overcast' ? 0.2 : 0;
    Object.assign(this.env.weather, { gloom, deckBase: d.base, deckTop: d.top, deckSolid: d.solid, vis: w.vis });
  }

  /** Re-bake mountain shadows and sky light for the current sun. */
  bakeLighting(renderer: THREE.WebGLRenderer): void {
    this.lightBaker.bake(renderer, this.env.sunDir);
  }

  setQuality(q: WorldQuality): void {
    this.terrain.setQuality({ splitK: q.terrainSplitK, maxLevel: q.terrainMaxLevel });
    this.trees.setRanges(q.treeNear, q.treeFar);
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3): void {
    const cp = camera.position;
    this.env.weather.flash = this.precip.flash;
    this.clouds.flash = this.precip.flash;
    this.env.update(cp, focus);
    this.precip.update(dt, camera, this.env.daylight * (1 - 0.45 * this.env.underDeck) + this.precip.flash);
    this.ocean.update(dt, cp);
    this.terrain.update(cp);
    this.trees.update(cp);
    this.clouds.update(dt, camera);
    this.airfields.update(cp);
    this.carriers.update(camera, this.ocean.time);
    this.pool.tick();
  }

  /** Pump terrain generation around a position until settled (loading screens). */
  async prewarm(pos: THREE.Vector3, camera: THREE.Camera, maxMs = 8000): Promise<void> {
    const t0 = performance.now();
    camera.position.copy(pos);
    while (performance.now() - t0 < maxMs) {
      this.terrain.update(pos);
      this.trees.update(pos);
      this.pool.tick(20);
      await new Promise((r) => setTimeout(r, 16));
      if (this.terrain.isSettled() && this.trees.isSettled()) {
        this.terrain.update(pos);
        this.trees.update(pos);
        if (this.terrain.isSettled()) break;
      }
    }
  }
}
