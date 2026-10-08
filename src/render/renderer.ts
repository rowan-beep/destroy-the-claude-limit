// WebGL renderer, camera and the post-processing chain (MSAA scene render,
// G-force vision effects, tone mapping / output).

import * as THREE from 'three';
import './curvature';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { GraphicsOptions } from '../core/settings';
import { installAltitudeFog } from './fog';
import { VisionShader, VisionState } from './vision';
import { NightShader, NIGHT, updateLights } from './night';
import { DropletShader, ScreenDroplets } from './droplets';
import { HeatHazeShader, HazeSource, writeHaze } from './heatHaze';
import { SunShaftPass } from './cinematic';
import { FinalPass } from './finalPass';
import { DofPass } from './dofPass';
import { BAD_TEXEL_GLSL, SCRUB_GLSL } from './scrub';

/** the airshow camera's look on the picture (see FinalPass) */
export interface CameraLook {
  exposure: number;
  wb: [number, number, number];
  contrast: number;
  saturation: number;
  lift: number;
  warm: number;
  mono: number;
  noise: number;
  /** lens vignetting and colour fringes (lens corrections off) */
  vignette: number;
  aberration: number;
}
import { SUN_VIEW, SUN_VIEW_COLOR } from './environment';

export type GraphicsSettings = Pick<
  GraphicsOptions,
  'resolution' | 'resolutionScale' | 'antialias' | 'shadows' | 'bloom' | 'toneMapping' | 'exposure' | 'contrast' | 'saturation' | 'vignette' | 'fov' | 'quality' | 'autoRes'
>;

/** highest device-pixel ratio each world-quality tier renders at on 'native' */
const DPR_CAP: Record<string, number> = { low: 1, medium: 1.25, high: 2, ultra: 2 };

// (ultra was 8192: four times the pixels of high to clear and draw every frame, for
// edges the PCF filter softens anyway)
const SHADOW_SIZE: Record<string, number> = { low: 1024, medium: 2048, high: 4096, ultra: 4096 };

/**
 * The 3D scene, drawn into its own multisampled buffer and resolved once into the
 * post-processing chain. (The chain's own buffers used to be multisampled too, so
 * every full-screen pass after it wrote all its samples and resolved them again.)
 * The cockpit is drawn over the world in the same buffer; with heat haze on, the
 * haze bends the world first and the cockpit goes over that.
 */
class ScenePass extends Pass {
  readonly msaa: THREE.WebGLRenderTarget;
  overlayScene: THREE.Scene | null = null;
  overlayCamera: THREE.Camera | null = null;
  // (the copy into the chain fills in broken pixels, so no blur downstream spreads them)
  private copy = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null as THREE.Texture | null }, px: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 px; varying vec2 vUv;\n${SCRUB_GLSL}\nvoid main(){ gl_FragColor = sceneTexel(tDiffuse, vUv, px); }`,
    depthTest: false,
    depthWrite: false,
  });
  private quad = new FullScreenQuad(this.copy);
  constructor(
    public scene: THREE.Scene,
    public camera: THREE.Camera,
    private haze: ShaderPass,
  ) {
    super();
    this.needsSwap = false;
    this.msaa = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, resolveDepthBuffer: false });
    // a reversed depth buffer needs floating-point depth to keep its precision
    if (REVERSED_Z) this.msaa.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
  }
  setSize(w: number, h: number): void {
    this.msaa.setSize(w, h);
    this.copy.uniforms.px.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
    (this.haze.uniforms as unknown as typeof HeatHazeShader.uniforms).px.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
  }
  render(r: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    const auto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.msaa);
    r.clear();
    r.render(this.scene, this.camera);
    const ov = this.overlayScene && this.overlayCamera;
    if (this.haze.enabled) {
      this.haze.render(r, read, this.msaa, 0, false);
      if (ov) {
        r.setRenderTarget(read);
        r.clearDepth();
        r.render(this.overlayScene!, this.overlayCamera!);
      }
    } else {
      if (ov) {
        r.clearDepth();
        r.render(this.overlayScene!, this.overlayCamera!);
      }
      this.copy.uniforms.tDiffuse.value = this.msaa.texture;
      r.setRenderTarget(read);
      this.quad.render(r);
    }
    r.autoClear = auto;
  }
  dispose(): void {
    this.msaa.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}

/**
 * Depth: a reversed floating-point depth buffer where the browser has it
 * (EXT_clip_control). It keeps the precision a 0.3 m .. 1700 km view needs, as the
 * logarithmic depth buffer did, without writing the depth from every pixel's
 * shader: that turned off the GPU's early depth test, so every hidden pixel of
 * terrain, trees and airframes was fully shaded before being thrown away.
 */
export let REVERSED_Z = false;
function clipControl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ok = !!gl?.getExtension('EXT_clip_control');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

// Screen positions worked out in the game (HUD markers, labels) read the depth
// as before: in front of the camera -1..1, behind it past 1.
const _project = THREE.Vector3.prototype.project;
THREE.Vector3.prototype.project = function (this: THREE.Vector3, camera: THREE.Camera) {
  _project.call(this, camera);
  const c = camera as THREE.PerspectiveCamera;
  if (c.reversedDepth && c.isPerspectiveCamera) {
    const n = c.near, f = c.far;
    const zv = (f * n) / (f - n) / (-this.z - n / (f - n));
    this.z = (-((f + n) / (f - n)) * zv - (2 * f * n) / (f - n)) / -zv;
  }
  return this;
};

/**
 * The WebGL renderer, asking for the fast GPU first, then for any GPU, then
 * for anything at all (some browsers refuse a context with particular
 * attributes, e.g. on a laptop's second GPU or after a driver reset).
 */
function createWebGL(): THREE.WebGLRenderer {
  const rev = clipControl();
  const depth: THREE.WebGLRendererParameters = rev ? { reversedDepthBuffer: true } : { logarithmicDepthBuffer: true };
  const tries: THREE.WebGLRendererParameters[] = [
    { antialias: false, ...depth, powerPreference: 'high-performance', stencil: false },
    { antialias: false, ...depth, stencil: false },
    { antialias: false, logarithmicDepthBuffer: true, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false },
  ];
  let last: unknown = null;
  for (const t of tries) {
    try {
      const r = new THREE.WebGLRenderer(t);
      REVERSED_Z = r.capabilities.reversedDepthBuffer;
      return r;
    } catch (e) {
      last = e;
      console.warn('WebGL context failed with', t, e);
    }
  }
  // ask the browser why: it says so in the context-creation error event
  const why: string[] = [];
  try {
    const c = document.createElement('canvas');
    c.addEventListener('webglcontextcreationerror', (e) => why.push((e as WebGLContextEvent).statusMessage || 'no reason given'), false);
    const g2 = c.getContext('webgl2');
    const c1 = document.createElement('canvas');
    c1.addEventListener('webglcontextcreationerror', (e) => why.push('webgl1: ' + ((e as WebGLContextEvent).statusMessage || 'no reason given')), false);
    const g1 = c1.getContext('webgl');
    why.push(`webgl2 ${g2 ? 'available' : 'refused'}, webgl1 ${g1 ? 'available' : 'refused'}`);
  } catch (e) {
    why.push(String(e));
  }
  const err = new Error('WEBGL_UNAVAILABLE: ' + String((last as Error)?.message ?? last) + '\nBrowser says: ' + why.join(' | '));
  err.name = 'WebGLUnavailable';
  throw err;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  private composer: EffectComposer;
  /** rain beads on the canopy / lens */
  readonly droplets = new ScreenDroplets();
  private dropletPass: ShaderPass;
  /** shimmer behind hot engines */
  private hazePass: ShaderPass;
  private scenePass: ScenePass;
  private visionPass: ShaderPass;
  private nightPass: ShaderPass;
  private bloomPass: UnrealBloomPass;
  /** tone mapping, grade and the camera's finish, in one pass */
  private finalPass: FinalPass;
  /** the sun light whose shadow map follows the shadow setting */
  shadowLight: THREE.DirectionalLight | null = null;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  settings: GraphicsSettings = {
    resolution: 'native',
    resolutionScale: 1,
    antialias: 4,
    shadows: 'high',
    bloom: 0.55,
    toneMapping: 'neutral',
    exposure: 1,
    contrast: 1,
    saturation: 1,
    vignette: true,
    fov: 70,
    quality: 'high',
    autoRes: true,
  };
  /** automatic resolution: multiplier on the render scale, and its frame-time bookkeeping */
  private adaptive = 1;
  private adaptT = 0;
  private adaptFrames = 0;
  private adaptSlow = 0;
  private adaptFast = 0;
  /** depth of field (the airshow camera) */
  private dofPass: DofPass;
  private look: CameraLook | null = null;
  /** god rays and lens ghosts from the sun (HDR) */
  private sunPass: SunShaftPass;
  private sunK = 0;
  /** the speed of the camera's aircraft (m/s), for the speed blur */
  private speed = 0;

  constructor(container: HTMLElement) {
    installAltitudeFog();
    this.renderer = createWebGL();
    // reading every shader's compile log forces the driver to finish each
    // compile on the spot (long stalls when a new jet or effect first shows)
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.3, 1700000);
    this.camera.rotation.order = 'YXZ';

    // (the chain's buffers: one sample, no depth needed but for the cockpit over heat haze)
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, rt);
    this.visionPass = new ShaderPass(VisionShader);
    this.nightPass = new ShaderPass(NightShader);
    this.nightPass.enabled = false;
    // HDR bloom: only light far brighter than sunlit paint or snow glows
    // (sun disc, afterburners, flares, explosions, runway lights)
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 2.6);
    // an overflowed pixel must not reach the blur (it would smear black across the screen)
    this.bloomPass.materialHighPassFilter.fragmentShader = this.bloomPass.materialHighPassFilter.fragmentShader
      .replace('void main() {', BAD_TEXEL_GLSL + '\nvoid main() {')
      .replace(
        'vec4 texel = texture2D( tDiffuse, vUv );',
        'vec4 texel = texture2D( tDiffuse, vUv ); if ( badTexel( texel ) ) texel = vec4( 0.0 ); texel = clamp( texel, 0.0, 256.0 );',
      );
    // haze bends the world only: the cockpit is drawn over it afterwards
    this.hazePass = new ShaderPass(HeatHazeShader);
    this.hazePass.enabled = false;
    this.scenePass = new ScenePass(this.scene, this.camera, this.hazePass);
    this.composer.addPass(this.scenePass);
    this.dofPass = new DofPass();
    this.dofPass.enabled = false;
    this.composer.addPass(this.dofPass);
    this.dropletPass = new ShaderPass(DropletShader);
    this.dropletPass.uniforms.tDrops.value = this.droplets.texture;
    this.dropletPass.enabled = false;
    this.composer.addPass(this.dropletPass);
    this.composer.addPass(this.bloomPass);
    // the sun's rays go on after the bloom, so the bloom never blooms them again
    this.sunPass = new SunShaftPass();
    this.sunPass.enabled = false;
    this.composer.addPass(this.sunPass);
    this.composer.addPass(this.nightPass);
    this.composer.addPass(this.visionPass);
    this.finalPass = new FinalPass();
    this.composer.addPass(this.finalPass);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applySettings(s: Partial<GraphicsSettings>): void {
    Object.assign(this.settings, s);
    const g = this.settings;
    const r = this.renderer;
    // shadows
    const shadowsOn = g.shadows !== 'off';
    if (r.shadowMap.enabled !== shadowsOn) {
      r.shadowMap.enabled = shadowsOn;
      this.recompileAll();
    }
    const light = this.shadowLight;
    if (light && shadowsOn) {
      const size = Math.min(SHADOW_SIZE[g.shadows] ?? 2048, r.capabilities.maxTextureSize);
      if (light.shadow.mapSize.x !== size) {
        light.shadow.mapSize.set(size, size);
        light.shadow.map?.dispose();
        light.shadow.map = null;
      }
      // PCF filter radius: softer edges on the higher tiers
      light.shadow.radius = g.shadows === 'ultra' ? 4 : g.shadows === 'high' ? 3 : g.shadows === 'medium' ? 2 : 1;
      light.shadow.blurSamples = g.shadows === 'ultra' ? 16 : 8;
    }
    // tone mapping and brightness
    const tm = g.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping : g.toneMapping === 'agx' ? THREE.AgXToneMapping : THREE.NeutralToneMapping;
    r.toneMapping = tm;
    r.toneMappingExposure = g.exposure;
    // bloom
    this.bloomPass.enabled = g.bloom > 0.001;
    this.bloomPass.strength = g.bloom;
    this.applyGrade();
    // the camera's look: sharpening on every tier; grain, lens fringes and sun shafts from medium up
    const fu = this.finalPass.uniforms;
    const q = g.quality;
    fu.sharpen.value = q === 'low' ? 0.3 : 0.45;
    fu.grain.value = q === 'low' ? 0 : 0.01;
    fu.aberration.value = q === 'low' ? 0 : 0.0014;
    this.applyGrade();
    this.camera.fov = g.fov;
    this.resize();
  }

  /** the picture's grade: the settings, and the airshow camera's look on top */
  private applyGrade(): void {
    const g = this.settings;
    const fu = this.finalPass.uniforms;
    const l = this.look;
    fu.contrast.value = g.contrast * (l?.contrast ?? 1);
    fu.saturation.value = g.saturation * (l?.saturation ?? 1);
    fu.vignette.value = l ? l.vignette : g.vignette ? 0.28 : 0;
    if (l) fu.aberration.value = l.aberration;
    else fu.aberration.value = g.quality === 'low' ? 0 : 0.0014;
    this.finalPass.grade = !!l || Math.abs(g.contrast - 1) > 0.001 || Math.abs(g.saturation - 1) > 0.001 || g.vignette;
    this.finalPass.camera = !!l;
    if (l) {
      fu.camExposure.value = l.exposure;
      fu.camWb.value.set(l.wb[0], l.wb[1], l.wb[2]);
      fu.camLift.value = l.lift;
      fu.camWarm.value = l.warm;
      fu.camMono.value = l.mono;
      fu.camNoise.value = l.noise;
    }
  }

  /** the airshow camera's look (null: the game's own picture) */
  setCameraLook(l: CameraLook | null): void {
    if (!l && !this.look) return;
    this.look = l;
    this.applyGrade();
  }

  /** depth of field for the airshow camera (null: off); only with the reversed depth buffer */
  setDof(o: { focal: number; fNumber: number; focusM: number } | null): void {
    const msaa = this.scenePass.msaa;
    const on = !!o && REVERSED_Z && !!msaa.depthTexture;
    this.dofPass.enabled = on;
    msaa.resolveDepthBuffer = on;
    if (on && o) {
      this.dofPass.depth = msaa.depthTexture;
      this.dofPass.setLens(o.focal, o.fNumber, o.focusM, this.height * this.pixelRatio, this.camera);
    }
  }

  /** the aircraft the camera rides with, for the speed blur (m/s) */
  setSpeed(v: number): void {
    this.speed = Number.isFinite(v) ? v : 0;
  }

  /** aim the sun's lens effects for this frame's camera (the game's own scene only) */
  private aimSun(on: boolean): void {
    const u = this.sunPass.uniforms;
    let k = on && this.settings.quality !== 'low' ? SUN_VIEW[3] : 0;
    if (k > 0.01) {
      const cam = this.camera;
      const p = new THREE.Vector3(SUN_VIEW[0], SUN_VIEW[1], SUN_VIEW[2]).multiplyScalar(1e5).add(cam.position).project(cam);
      // behind the camera (or far off screen) there is nothing to see
      const off = Math.max(Math.abs(p.x), Math.abs(p.y));
      if (p.z > 1 || off > 2.2) k = 0;
      else k *= 1 - THREE.MathUtils.smoothstep(off, 1.1, 2.2);
      u.sunUv.value = [p.x * 0.5 + 0.5, p.y * 0.5 + 0.5];
      u.sunColor.value = [SUN_VIEW_COLOR[0], SUN_VIEW_COLOR[1], SUN_VIEW_COLOR[2]];
    }
    // eased, so a jolt of the camera or a cloud edge doesn't make the rays flicker
    this.sunK += (k - this.sunK) * 0.12;
    if (this.sunK < 0.005) this.sunK = 0;
    u.strength.value = this.sunK * 0.45;
    this.sunPass.enabled = this.sunK > 0.01;
    // speed: noticeable from ~500 kt, strongest very fast and low
    const fu = this.finalPass.uniforms;
    fu.speedBlur.value = on && this.settings.quality !== 'low' ? THREE.MathUtils.smoothstep(this.speed, 240, 560) * 0.7 : 0;
    fu.time.value = (performance.now() / 1000) % 1000;
  }

  /** Materials must rebuild their shaders after a shadow type change. */
  private recompileAll(): void {
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
  }

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const g = this.settings;
    let pr: number;
    if (g.resolution === 'native') pr = Math.min(window.devicePixelRatio || 1, DPR_CAP[g.quality] ?? 2);
    else pr = +g.resolution / Math.max(1, this.height); // e.g. 2160 rows = 4K
    pr *= g.resolutionScale * (g.autoRes ? this.adaptive : 1);
    // stay inside what the GPU can allocate
    const maxDim = Math.min(this.renderer.capabilities.maxTextureSize, 8192);
    pr = Math.max(0.35, Math.min(pr, 4, maxDim / Math.max(1, this.width), maxDim / Math.max(1, this.height)));
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);
    // bloom from a quarter-size picture up (not half): the glow is just as soft, at a quarter of the work
    this.bloomPass.setSize(Math.round((this.width * this.pixelRatio) / 2), Math.round((this.height * this.pixelRatio) / 2));
    this.updateSamples();
    const fu = this.finalPass.uniforms;
    fu.texel.value = [1 / Math.max(1, this.width * this.pixelRatio), 1 / Math.max(1, this.height * this.pixelRatio)];
    fu.aspect.value = this.width / Math.max(1, this.height);
    this.sunPass.uniforms.aspect.value = this.width / Math.max(1, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * MSAA on the scene buffer. Above about 1440p the pixels are small enough that
   * 8 samples look no different from 4, and cost twice the memory traffic.
   */
  private updateSamples(): void {
    const px = this.width * this.pixelRatio * this.height * this.pixelRatio;
    const samples = Math.min(this.settings.antialias, this.renderer.capabilities.maxSamples, px > 4.2e6 ? 4 : 8);
    const rt = this.scenePass.msaa;
    if (rt.samples !== samples) {
      rt.samples = samples;
      rt.dispose();
    }
  }

  /** The actual number of pixels rendered (for the settings readout). */
  get renderSize(): { w: number; h: number } {
    return { w: Math.round(this.width * this.pixelRatio), h: Math.round(this.height * this.pixelRatio) };
  }

  get size(): { w: number; h: number } {
    return { w: this.width, h: this.height };
  }

  /** Draw another scene over the world with its own camera (null = off). */
  setOverlay(scene: THREE.Scene | null, camera: THREE.Camera | null): void {
    this.scenePass.overlayScene = scene && camera ? scene : null;
    this.scenePass.overlayCamera = scene && camera ? camera : null;
  }

  setVision(v: VisionState): void {
    const u = this.visionPass.uniforms;
    u.greyout.value = v.greyout;
    u.tunnel.value = v.tunnel;
    u.mono.value = v.mono;
    u.redout.value = v.redout;
    u.blackout.value = v.blackout;
    u.flash.value = v.flash;
    u.damage.value = v.damage;
    u.blur.value = v.blur;
    u.pinhole.value = v.pinhole;
    u.heart.value = v.heart;
    // nothing to show: skip the full-screen pass entirely
    this.visionPass.enabled = v.greyout + v.tunnel + v.mono + v.redout + v.blackout + v.flash + v.damage + v.blur + v.pinhole + v.heart > 1e-3;
    u.time.value = performance.now() / 1000;
  }

  /** Rain on the screen: how hard it rains on us (0..1) and our airspeed (m/s). */
  updateDroplets(dt: number, rain: number, speed: number): void {
    const on = this.droplets.update(dt, rain, speed);
    this.dropletPass.enabled = on;
    this.dropletPass.uniforms.amount.value = this.droplets.amount;
    (this.dropletPass.uniforms.texel.value as THREE.Vector2).set(1 / Math.max(1, this.width), 1 / Math.max(1, this.height));
  }

  /**
   * Automatic resolution (in flight): if the frame rate stays under ~48 fps the
   * render resolution steps down (to 60 % at most); with steady headroom it
   * climbs back. Resizing is cheap, but it only ever moves once a second.
   */
  adaptFrame(dt: number): void {
    if (!this.settings.autoRes) {
      if (this.adaptive !== 1) {
        this.adaptive = 1;
        this.resize();
      }
      return;
    }
    this.adaptT += dt;
    this.adaptFrames++;
    if (this.adaptT < 1) return;
    const fps = this.adaptFrames / this.adaptT;
    this.adaptT = 0;
    this.adaptFrames = 0;
    this.adaptSlow = fps < 48 ? this.adaptSlow + 1 : 0;
    this.adaptFast = fps > 58 ? this.adaptFast + 1 : 0;
    let next = this.adaptive;
    if (this.adaptSlow >= 2) next = Math.max(0.6, this.adaptive - (fps < 35 ? 0.15 : 0.08));
    else if (this.adaptFast >= 4) next = Math.min(1, this.adaptive + 0.05);
    if (next !== this.adaptive) {
      this.adaptive = next;
      this.adaptSlow = 0;
      this.adaptFast = 0;
      this.resize();
    }
  }

  /** Heat haze behind the engines near the camera (call after the camera moved). */
  setHaze(sources: HazeSource[]): void {
    if (this.settings.quality === 'low') {
      this.hazePass.enabled = false;
      return;
    }
    const u = this.hazePass.uniforms as unknown as typeof HeatHazeShader.uniforms;
    u.time.value = performance.now() / 1000;
    u.aspect.value = this.width / Math.max(1, this.height);
    this.hazePass.enabled = writeHaze(sources, this.camera, u) > 0;
  }

  render(): void {
    // pitch black night and the night-vision goggles
    const nu = this.nightPass.uniforms;
    this.nightPass.enabled = NIGHT.dark || NIGHT.nvg;
    updateLights();
    nu.dark.value = NIGHT.dark ? 1 : 0;
    nu.nvg.value = NIGHT.nvg ? 1 : 0;
    nu.tube.value = NIGHT.tube ? 1 : 0;
    nu.time.value = performance.now() / 1000;
    (nu.res.value as THREE.Vector2).set(this.width * this.pixelRatio, this.height * this.pixelRatio);
    this.aimSun(true);
    this.composer.render();
  }

  /**
   * Compile the shaders `obj` needs to be drawn in `scene` through this
   * pipeline, in the background where the browser supports it. Resolves once
   * drawing it will no longer stall on a compile.
   */
  compileFor(obj: THREE.Object3D, scene: THREE.Scene, camera: THREE.Camera): Promise<unknown> {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    // the programs depend on the target (HDR buffer: no tone mapping, linear output)
    r.setRenderTarget(this.scenePass.msaa);
    try {
      // never wait on it for long: the worst case is the old blocking compile
      return Promise.race([r.compileAsync(obj, camera, scene), new Promise((res) => setTimeout(res, 5000))]);
    } finally {
      r.setRenderTarget(prev);
    }
  }

  /**
   * Draw another scene (the hangar) through the same pipeline, so the menu
   * gets anti-aliasing, bloom and the picture settings too.
   */
  renderScene(scene: THREE.Scene, camera: THREE.Camera, toneMapping?: THREE.ToneMapping): void {
    const sp = this.scenePass;
    const s = sp.scene, c = sp.camera, os = sp.overlayScene, oc = sp.overlayCamera;
    const vis = this.visionPass.enabled, drp = this.dropletPass.enabled, hz = this.hazePass.enabled;
    // (the airshow camera's look and depth of field belong to the game's own scene)
    const dof = this.dofPass.enabled, look = this.look;
    this.dofPass.enabled = false;
    if (look) this.setCameraLook(null);
    this.nightPass.enabled = false;
    this.dropletPass.enabled = false;
    this.hazePass.enabled = false;
    const tm = this.renderer.toneMapping;
    sp.scene = scene;
    sp.camera = camera;
    sp.overlayScene = sp.overlayCamera = null;
    this.visionPass.enabled = false;
    if (toneMapping !== undefined && this.settings.toneMapping === 'neutral') this.renderer.toneMapping = toneMapping;
    // (other scenes keep their own suns: no shafts or speed blur, but the sharpening and grain)
    this.aimSun(false);
    this.composer.render();
    this.renderer.toneMapping = tm;
    sp.scene = s;
    sp.camera = c;
    sp.overlayScene = os;
    sp.overlayCamera = oc;
    this.visionPass.enabled = vis;
    this.dropletPass.enabled = drp;
    this.hazePass.enabled = hz;
    this.dofPass.enabled = dof;
    if (look) this.setCameraLook(look);
  }
}
