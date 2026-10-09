// The ocean scene: sea bed, sea surface and sky, the harbor and the wreck,
// the boat, and what hangs in the water. One instance serves the menu's
// harbor view and the dive. Each frame it is told where the camera is and
// sets the light in the water from the weather and the camera's depth.

import * as THREE from 'three';
import { SeabedStreamer } from './seabed';
import { OceanSurface, SKY, setSkyAtmosphere, hazeColor } from './water';
import { OceanProps } from './props';
import { OceanFx, LAMPS } from './fx';
import { SubModel } from './subModel';
import { FishSchools } from './fish';
import { SEABED_DETAIL } from './seabedDetail';
import { SeabedLife } from './seabedLife';
import { SiltClouds } from './silt';
import { Jellies } from './jellies';
import { Bioluminescence } from './biolum';
import { SweepDisc } from './sonarSweep';
import { buildLandscape, type Landscape } from './landscape';
import { OCEAN_FX, daylightAt } from './oceanMaterial';
import { WEATHERS, WeatherDef, surfaceHeight } from '../world/waves';
import { PRESETS, OceanPreset, PresetDef } from '../perf/presets';
import { FOG_SUN, FOG_SUN_COLOR } from '../../render/fog';

const DEG = Math.PI / 180;
/** the colour of light scattered in the water just under the surface, in full sun (linear) */
const SCATTER0 = new THREE.Color(0.006, 0.11, 0.16);

export interface WorldStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  chunksLoaded: number;
  chunksQueued: number;
  chunkBuilds: number;
  chunkDisposals: number;
  maxChunkMs: number;
  streamStalls: number;
  /** tiles built on the worker thread, and the slowest there (ms) */
  workerTiles: number;
  workerMaxMs: number;
  wreckDetail: boolean;
  wreckBuilds: number;
  wreckDisposals: number;
}

export class OceanWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.08, 14000);
  /** the small life and litter of the sea floor round the camera */
  readonly life: SeabedLife;
  /** sediment the boat stirs up */
  silt: SiltClouds;
  /** jellyfish drifting in open water */
  readonly jellies: Jellies;
  /** plankton that flash when disturbed in dark water */
  biolum: Bioluminescence;
  /** the scanning sonar's sweep in the open water (the overlay) */
  readonly sweep = new SweepDisc();
  /** the woods and the town on the land */
  land: Landscape;
  readonly seabed = new SeabedStreamer();
  readonly surface: OceanSurface;
  readonly props: OceanProps;
  readonly fx: OceanFx;
  readonly sub: SubModel;
  private fish: FishSchools | null = null;
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1);
  weather: WeatherDef = WEATHERS.dawn;
  preset: PresetDef = PRESETS.balanced;
  /** seconds of sea time (waves, caustics) */
  t = 0;
  /** is the camera under the water this frame? */
  under = false;
  /** the light level of the scene round the camera (for the eye's adaptation) */
  ambient = 1;
  private fogSave = new Float32Array(4);
  private fogColSave = new Float32Array(3);
  private sunDir = new THREE.Vector3(0, 1, 0);
  private sunRay = new THREE.Vector3(0, -1, 0);
  private lightK = 1;
  private tmpP = new THREE.Vector3();
  private tmpD = new THREE.Vector3();

  constructor(private renderer: THREE.WebGLRenderer, preset: OceanPreset, weather: WeatherDef) {
    this.preset = PRESETS[preset];
    this.surface = new OceanSurface(this.preset.waterRings, this.preset.waterSegs);
    this.props = new OceanProps(this.preset.decor);
    this.fx = new OceanFx({ snow: this.preset.snow, bubbles: this.preset.bubbles, shafts: this.preset.shafts });
    this.sub = new SubModel(this.preset.shadowMap > 0);
    this.life = new SeabedLife(this.preset.decor);
    this.scene.add(this.life.group);
    this.silt = new SiltClouds(this.preset.silt);
    this.scene.add(this.silt.mesh);
    this.jellies = new Jellies(this.preset.decor);
    this.scene.add(this.jellies.group);
    this.biolum = new Bioluminescence(this.preset.sparks, this.fx.dot);
    this.scene.add(this.biolum.points);
    this.scene.add(this.sweep.mesh);
    // the land's woods and the town (above the water only)
    this.land = buildLandscape(this.props.textures, Math.max(0.35, this.preset.decor));
    this.scene.add(this.land.group);
    // sea-bed tiles are built on a worker thread where there is one
    this.seabed.useWorker();
    this.scene.add(this.seabed.group, this.surface.mesh, this.surface.sky, this.props.group, this.fx.group, this.sub.root, this.sun, this.sun.target, this.hemi);
    for (const b of this.fx.beams) this.scene.add(b);
    this.scene.fog = new THREE.FogExp2(0xffffff, 1 / 4000);
    this.camera.position.set(0, 5, 0);
    this.setPreset(preset);
    this.setWeather(weather);
  }

  setWeather(d: WeatherDef): void {
    this.weather = d;
    const el = d.sunEl * DEG, az = d.sunAz * DEG;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    // under water the sun's rays bend toward the vertical (Snell: sin t = sin i / 1.333)
    const st = Math.cos(el) / 1.333;
    const h = new THREE.Vector2(-this.sunDir.x, -this.sunDir.z);
    if (h.lengthSq() > 1e-6) h.normalize();
    this.sunRay.set(h.x * st, -Math.sqrt(1 - st * st), h.y * st);
    setSkyAtmosphere(this.sunDir, d.air[0], d.air[1], d.air[2], 0.8);
    SKY.uSunColor.value.setRGB(...d.sun);
    // (the sun on the clouds in the picture's light units: full sun is 3)
    SKY.uSunI.value = d.sunI * 0.33;
    SKY.uCloud.value.x = d.clouds[0];
    SKY.uCloud.value.y = d.clouds[1];
    this.sun.color.setRGB(...d.sun);
    this.sun.intensity = d.sunI;
    this.hemi.color.setRGB(d.zenith[0] * 0.6 + 0.4, d.zenith[1] * 0.6 + 0.4, d.zenith[2] * 0.6 + 0.4);
    this.hemi.groundColor.setRGB(0.05, 0.09, 0.11);
    this.hemi.intensity = 0.55 + 0.35 * (d.sunI / 3);
    // how much light gets into the sea: less from a low sun (more is reflected and the path is longer)
    this.lightK = (d.sunI / 3) * (0.3 + 0.7 * Math.sin(Math.max(el, 2 * DEG)));
    // (the caustics and the shafts are the direct sun's share of it: weak from a low or hidden sun)
    const direct = this.lightK * (d.clouds[1] > 0.5 ? 0.35 : 1) * Math.sin(Math.max(el, 2 * DEG)) * 2;
    OCEAN_FX.uSunCol.value.setRGB(d.sun[0] * direct, d.sun[1] * direct, d.sun[2] * direct);
    OCEAN_FX.uScatter.value.copy(SCATTER0).multiplyScalar(this.lightK);
    // the haze over the land and the sea: the sky's colour just above the horizon
    const fog = this.scene.fog as THREE.FogExp2;
    hazeColor(fog.color);
    fog.density = 1 / d.haze;
    const u = this.surface.material.uniforms;
    u.waveAmp.value = d.amp;
    u.uChop.value = d.chop;
    u.uHaze.value = d.haze;
  }

  setPreset(p: OceanPreset): void {
    const d = PRESETS[p];
    const old = this.preset;
    this.preset = d;
    this.seabed.lod = d.lod;
    this.seabed.budgetMs = d.buildBudgetMs;
    if (old.waterRings !== d.waterRings || old.waterSegs !== d.waterSegs) this.surface.setDetail(d.waterRings, d.waterSegs);
    if (old.decor !== d.decor) {
      this.props.setDecor(d.decor);
      this.life.setDensity(d.decor);
      this.jellies?.setDensity(d.decor);
    }
    if (!this.fish || old.fish !== d.fish) {
      if (this.fish) {
        this.scene.remove(this.fish.mesh);
        this.fish.dispose();
      }
      this.fish = new FishSchools(d.fish);
      this.scene.add(this.fish.mesh);
    }
    this.fx.setCounts({ snow: d.snow, bubbles: d.bubbles, shafts: d.shafts });
    if (this.silt && old.silt !== d.silt) {
      this.scene.remove(this.silt.mesh);
      this.silt.dispose();
      this.silt = new SiltClouds(d.silt);
      this.scene.add(this.silt.mesh);
    }
    if (this.biolum && old.sparks !== d.sparks) {
      this.scene.remove(this.biolum.points);
      this.biolum.dispose();
      this.biolum = new Bioluminescence(d.sparks, this.fx.dot);
      this.scene.add(this.biolum.points);
    }
    this.surface.material.uniforms.uFoam.value = d.foam ? 1 : 0;
    OCEAN_FX.uCaust.value = d.caustics ? 1 : 0;
    SEABED_DETAIL.value = d.seabedDetail;
    const shadows = d.shadowMap > 0;
    this.sun.castShadow = shadows;
    if (shadows) {
      this.sun.shadow.mapSize.set(d.shadowMap, d.shadowMap);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -40;
      c.right = c.top = 40;
      c.near = 1;
      c.far = 400;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    for (const l of this.sub.lights) if (l.castShadow !== (shadows && l === this.sub.lights[1])) {
      l.castShadow = shadows && l === this.sub.lights[1];
      if (l.castShadow) l.shadow.mapSize.set(1024, 1024);
    }
  }

  /** the sea surface height at a point now */
  surfaceAt(x: number, z: number): number {
    return surfaceHeight(x, z, this.t, this.weather.amp);
  }

  /**
   * Per frame, once the camera and the boat are placed: stream the sea bed,
   * move the surface and the sky with the camera, and set the light in the water.
   */
  update(dt: number, viewH: number, ahead: { x: number; z: number }, opts: { lamps: boolean; floods?: boolean; overlay: boolean; boat: { x: number; z: number; speed: number; surfaced: boolean } | null; time?: number }): void {
    // (in a dive the sea keeps the simulation's time, so the hull rides the waves that are drawn)
    this.t = opts.time ?? this.t + dt;
    OCEAN_FX.uTime.value = this.t;
    // the clouds go by with the wind (km; the layer is 1.5 km up)
    const drift = this.t * (0.003 + 0.012 * this.weather.wind);
    SKY.uCloud.value.z = drift * 0.8;
    SKY.uCloud.value.w = drift * -0.6;
    const cam = this.camera;
    const cp = cam.position;
    const wl = this.surfaceAt(cp.x, cp.z);
    OCEAN_FX.uWaterY.value = wl;
    this.under = cp.y < wl;
    // (from below, the surface is the far side of everything in the water: drawn first, so the
    // snow, silt, jellies and beams in front of it, which do not write depth, are not painted over)
    this.surface.mesh.renderOrder = this.under ? -5 : 10;
    this.seabed.update(cp.x, cp.z, ahead.x, ahead.z);
    this.surface.update(cp, opts.boat, dt);
    this.props.update(cp.x, cp.z, this.t, dt);
    this.life.update(cp.x, cp.y, cp.z, this.t);
    // (daylight on the silt: the same sun and sky that light the sea bed)
    this.silt.dayK.value = (this.sun.intensity * 0.7 + this.hemi.intensity) / Math.PI;
    this.silt.update(dt);
    this.jellies.update(cp.x, cp.y, cp.z, this.t);
    this.biolum.update(this.t, viewH / (2 * Math.tan((cam.fov * Math.PI) / 360)), this.under);
    this.sweep.update();
    this.land.update(cp.y, performance.now() / 1000);
    this.fish?.update(cp);
    // the sun's shadow box follows the camera
    this.sun.position.set(cp.x + this.sunDir.x * 200, cp.y + this.sunDir.y * 200, cp.z + this.sunDir.z * 200);
    this.sun.target.position.copy(cp);
    // the sky is not seen from under the water (only through Snell's window, which the surface draws)
    this.surface.sky.visible = true;
    // the lamps as the snow and the beams see them
    LAMPS.uLampOn.value = opts.lamps ? 1 : 0;
    LAMPS.uFloodOn.value = opts.floods ? 1 : 0;
    this.sub.floodWorld(LAMPS.uFloodP.value);
    if (this.sub.lights.length >= 2) {
      this.sub.lampWorld(0, LAMPS.uLampP0.value, LAMPS.uLampD0.value);
      this.sub.lampWorld(1, LAMPS.uLampP1.value, LAMPS.uLampD1.value);
      for (let i = 0; i < 2; i++) {
        const b = this.fx.beams[i];
        this.sub.lampWorld(i, this.tmpP, this.tmpD);
        b.position.copy(this.tmpP);
        b.lookAt(this.tmpP.x - this.tmpD.x, this.tmpP.y - this.tmpD.y, this.tmpP.z - this.tmpD.z);
      }
    }
    this.fx.update(dt, cam, viewH, this.under, { now: this.t, sunRay: this.sunRay, waveAmp: this.weather.amp, surfaceAtCam: wl, overlay: opts.overlay });
    // the light round the camera: daylight at its depth (luminance)
    const day = daylightAt(Math.max(0, -cp.y), this.tmpP);
    // (above the water the picture is exposed for daylight as it is)
    this.ambient = this.under ? this.lightK * (0.2126 * day.x + 0.7152 * day.y + 0.0722 * day.z) : 1;
  }

  /**
   * The exposure a camera (or an eye) settles on for the light round it: none
   * at the surface, opening up in the dim blue of the deep. Lamps on keep it
   * from opening all the way (what they light would burn out).
   */
  exposureFor(lamps: boolean): number {
    const e = Math.sqrt(1 / Math.max(this.ambient, 0.0008));
    return Math.max(1, Math.min(lamps && this.under ? 24 : 35, e));
  }

  /** draw through the game's pipeline (the haze set up for this scene, then put back) */
  draw(drawWith: (sc: THREE.Scene, cam: THREE.Camera) => void): void {
    this.fogSave.set(FOG_SUN);
    this.fogColSave.set(FOG_SUN_COLOR);
    FOG_SUN.set([this.sunDir.x, this.sunDir.y, this.sunDir.z, 0.8]);
    FOG_SUN_COLOR.set([this.weather.sun[0], this.weather.sun[1], this.weather.sun[2]]);
    drawWith(this.scene, this.camera);
    FOG_SUN.set(this.fogSave);
    FOG_SUN_COLOR.set(this.fogColSave);
  }

  /** the camera's frustum for a canvas size */
  resize(w: number, h: number): void {
    const a = w / Math.max(1, h);
    if (Math.abs(this.camera.aspect - a) > 1e-4) {
      this.camera.aspect = a;
      this.camera.updateProjectionMatrix();
    }
  }

  /** load everything round a point now (behind a loading screen) */
  fill(x: number, z: number): void {
    this.seabed.fill(x, z);
    this.life.fill(x, z);
  }

  /** start the streaming counters again (each benchmark run reports its own) */
  resetStreamStats(): void {
    const s = this.seabed.stats;
    s.built = s.disposed = s.stalls = s.workerBuilt = 0;
    s.maxBuildMs = s.workerMaxMs = 0;
    this.props.stats.wreckBuilds = this.props.stats.wreckDisposals = 0;
  }

  stats(): WorldStats {
    const info = this.renderer.info;
    const s = this.seabed.stats;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      chunksLoaded: s.loaded,
      chunksQueued: s.queued,
      chunkBuilds: s.built,
      chunkDisposals: s.disposed,
      maxChunkMs: s.maxBuildMs,
      streamStalls: s.stalls,
      workerTiles: s.workerBuilt,
      workerMaxMs: s.workerMaxMs,
      wreckDetail: this.props.stats.wreckDetail,
      wreckBuilds: this.props.stats.wreckBuilds,
      wreckDisposals: this.props.stats.wreckDisposals,
    };
  }

  dispose(): void {
    this.seabed.dispose();
    this.surface.dispose();
    this.land.dispose();
    this.props.dispose();
    this.life.dispose();
    this.silt.dispose();
    this.jellies.dispose();
    this.biolum.dispose();
    this.sweep.dispose();
    this.fx.dispose();
    this.sub.dispose();
    this.fish?.dispose();
    this.sun.shadow.map?.dispose();
  }
}
