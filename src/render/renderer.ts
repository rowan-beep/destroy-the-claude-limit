// WebGL renderer, camera and the post-processing chain (MSAA scene render,
// G-force vision effects, tone mapping / output).

import * as THREE from 'three';
import './curvature';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { GraphicsOptions } from '../core/settings';
import { installAltitudeFog } from './fog';
import { VisionShader, VisionState } from './vision';
import { NightShader, NIGHT, updateLights } from './night';
import { DropletShader, ScreenDroplets } from './droplets';
import { HeatHazeShader, HazeSource, writeHaze } from './heatHaze';
import { FinishShader, SunShaftShader } from './cinematic';
import { SUN_VIEW, SUN_VIEW_COLOR } from './environment';

export type GraphicsSettings = Pick<
  GraphicsOptions,
  'resolution' | 'resolutionScale' | 'antialias' | 'shadows' | 'bloom' | 'toneMapping' | 'exposure' | 'contrast' | 'saturation' | 'vignette' | 'fov' | 'quality' | 'autoRes'
>;

/** highest device-pixel ratio each world-quality tier renders at on 'native' */
const DPR_CAP: Record<string, number> = { low: 1, medium: 1.25, high: 2, ultra: 2 };

/** Final picture grade in display space: contrast, saturation and a soft vignette. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1 },
    saturation: { value: 1 },
    vignette: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float contrast;
    uniform float saturation;
    uniform float vignette;
    uniform float aspect;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      vec3 col = c.rgb;
      float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      col = mix( vec3( l ), col, saturation );
      // S-curve style contrast around mid grey, keeps black and white anchored
      col = clamp( col, 0.0, 1.0 );
      vec3 s = col * col * ( 3.0 - 2.0 * col );
      col = contrast >= 1.0 ? mix( col, s, ( contrast - 1.0 ) * 1.6 ) : mix( vec3( 0.5 ), col, 0.5 + 0.5 * contrast );
      vec2 p = ( vUv - 0.5 ) * vec2( aspect, 1.0 );
      col *= 1.0 - vignette * smoothstep( 0.45, 1.25, length( p ) );
      gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), c.a );
    }`,
};

/**
 * Scrub the HDR scene buffer before bloom: half-float overflows (a sun glint
 * off glossy paint can exceed 65504) become Infinity, and bloom would smear
 * that -- and the NaNs it breeds -- across the whole screen as black.
 */
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      if ( any( isnan( c ) ) || any( notEqual( c, c ) ) ) c = vec4( 0.0, 0.0, 0.0, 1.0 );
      gl_FragColor = vec4( min( max( c.rgb, vec3( 0.0 ) ), vec3( 256.0 ) ), clamp( c.a, 0.0, 1.0 ) );
    }`,
};

const SHADOW_SIZE: Record<string, number> = { low: 1024, medium: 2048, high: 4096, ultra: 8192 };

/**
 * The WebGL renderer, asking for the fast GPU first, then for any GPU, then
 * for anything at all (some browsers refuse a context with particular
 * attributes, e.g. on a laptop's second GPU or after a driver reset).
 */
function createWebGL(): THREE.WebGLRenderer {
  const tries: THREE.WebGLRendererParameters[] = [
    { antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance', stencil: false },
    { antialias: false, logarithmicDepthBuffer: true, stencil: false },
    { antialias: false, logarithmicDepthBuffer: true, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false },
  ];
  let last: unknown = null;
  for (const t of tries) {
    try {
      return new THREE.WebGLRenderer(t);
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
  private renderPass: RenderPass;
  /** second scene pass drawn over the world (the cockpit) */
  private overlayPass: RenderPass;
  private visionPass: ShaderPass;
  private nightPass: ShaderPass;
  private outputPass: OutputPass;
  private bloomPass: UnrealBloomPass;
  private gradePass: ShaderPass;
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
  private sanitizePass!: ShaderPass;
  /** god rays and lens ghosts from the sun (HDR), and the final sharpen / grain / speed pass */
  private sunPass!: ShaderPass;
  private finishPass!: ShaderPass;
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

    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.overlayPass = new RenderPass(new THREE.Scene(), this.camera);
    this.overlayPass.clear = false;
    this.overlayPass.clearDepth = true;
    this.overlayPass.enabled = false;
    this.visionPass = new ShaderPass(VisionShader);
    this.nightPass = new ShaderPass(NightShader);
    this.nightPass.enabled = false;
    this.outputPass = new OutputPass();
    // HDR bloom: only light far brighter than sunlit paint or snow glows
    // (sun disc, afterburners, flares, explosions, runway lights)
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 2.6);
    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.renderPass);
    // haze bends the world only: the cockpit is drawn over it afterwards
    this.hazePass = new ShaderPass(HeatHazeShader);
    this.hazePass.enabled = false;
    this.composer.addPass(this.hazePass);
    this.composer.addPass(this.overlayPass);
    this.dropletPass = new ShaderPass(DropletShader);
    this.dropletPass.uniforms.tDrops.value = this.droplets.texture;
    this.dropletPass.enabled = false;
    this.composer.addPass(this.dropletPass);
    this.sanitizePass = new ShaderPass(SanitizeShader);
    this.composer.addPass(this.sanitizePass);
    this.sunPass = new ShaderPass(SunShaftShader);
    this.sunPass.enabled = false;
    this.composer.addPass(this.sunPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.nightPass);
    this.composer.addPass(this.visionPass);
    this.composer.addPass(this.outputPass);
    this.composer.addPass(this.gradePass);
    this.finishPass = new ShaderPass(FinishShader);
    this.composer.addPass(this.finishPass);

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
    // the scrub only protects the bloom from overflowed pixels
    this.sanitizePass.enabled = this.bloomPass.enabled;
    this.bloomPass.strength = g.bloom;
    // grade
    const gu = this.gradePass.uniforms;
    gu.contrast.value = g.contrast;
    gu.saturation.value = g.saturation;
    gu.vignette.value = g.vignette ? 0.28 : 0;
    this.gradePass.enabled = Math.abs(g.contrast - 1) > 0.001 || Math.abs(g.saturation - 1) > 0.001 || g.vignette;
    // anti-aliasing: MSAA on the scene buffers
    const samples = Math.min(g.antialias, r.capabilities.maxSamples);
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== samples) {
        rt.samples = samples;
        rt.dispose();
      }
    }
    // the camera's look: sharpening on every tier; grain, lens fringes and sun shafts from medium up
    const fu = this.finishPass.uniforms;
    const q = g.quality;
    fu.sharpen.value = q === 'low' ? 0.35 : 0.6;
    fu.grain.value = q === 'low' ? 0 : 0.022;
    fu.aberration.value = q === 'low' ? 0 : 0.0014;
    this.camera.fov = g.fov;
    this.resize();
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
    u.strength.value = k * 0.85;
    this.sunPass.enabled = k > 0.01;
    // speed: noticeable from ~500 kt, strongest very fast and low
    const fu = this.finishPass.uniforms;
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
    this.gradePass.uniforms.aspect.value = this.width / Math.max(1, this.height);
    const fu = this.finishPass.uniforms;
    fu.texel.value = [1 / Math.max(1, this.width * this.pixelRatio), 1 / Math.max(1, this.height * this.pixelRatio)];
    fu.aspect.value = this.width / Math.max(1, this.height);
    this.sunPass.uniforms.aspect.value = this.width / Math.max(1, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
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
    if (scene && camera) {
      this.overlayPass.scene = scene;
      this.overlayPass.camera = camera;
      this.overlayPass.enabled = true;
    } else this.overlayPass.enabled = false;
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
    r.setRenderTarget(this.composer.readBuffer);
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
    const s = this.renderPass.scene, c = this.renderPass.camera;
    const ov = this.overlayPass.enabled, vis = this.visionPass.enabled, drp = this.dropletPass.enabled, hz = this.hazePass.enabled;
    this.nightPass.enabled = false;
    this.dropletPass.enabled = false;
    this.hazePass.enabled = false;
    const tm = this.renderer.toneMapping;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.overlayPass.enabled = false;
    this.visionPass.enabled = false;
    if (toneMapping !== undefined && this.settings.toneMapping === 'neutral') this.renderer.toneMapping = toneMapping;
    // (other scenes keep their own suns: no shafts or speed blur, but the sharpening and grain)
    this.aimSun(false);
    this.composer.render();
    this.renderer.toneMapping = tm;
    this.renderPass.scene = s;
    this.renderPass.camera = c;
    this.overlayPass.enabled = ov;
    this.visionPass.enabled = vis;
    this.dropletPass.enabled = drp;
    this.hazePass.enabled = hz;
  }
}
