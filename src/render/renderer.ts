// WebGL renderer, camera and the post-processing chain (MSAA scene render,
// G-force vision effects, tone mapping / output).

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { GraphicsOptions } from '../core/settings';
import { installAltitudeFog } from './fog';
import { VisionShader, VisionState } from './vision';

export type GraphicsSettings = Pick<
  GraphicsOptions,
  'resolution' | 'resolutionScale' | 'antialias' | 'shadows' | 'bloom' | 'toneMapping' | 'exposure' | 'contrast' | 'saturation' | 'vignette' | 'fov'
>;

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

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  /** second scene pass drawn over the world (the cockpit) */
  private overlayPass: RenderPass;
  private visionPass: ShaderPass;
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
  };

  constructor(container: HTMLElement) {
    installAltitudeFog();
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.3, 1200000);
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
    this.outputPass = new OutputPass();
    // HDR bloom: only light far brighter than sunlit paint or snow glows
    // (sun disc, afterburners, flares, explosions, runway lights)
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 2.6);
    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.overlayPass);
    this.composer.addPass(new ShaderPass(SanitizeShader));
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.visionPass);
    this.composer.addPass(this.outputPass);
    this.composer.addPass(this.gradePass);

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
    this.camera.fov = g.fov;
    this.resize();
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
    if (g.resolution === 'native') pr = Math.min(window.devicePixelRatio || 1, 2);
    else pr = +g.resolution / Math.max(1, this.height); // e.g. 2160 rows = 4K
    pr *= g.resolutionScale;
    // stay inside what the GPU can allocate
    const maxDim = Math.min(this.renderer.capabilities.maxTextureSize, 8192);
    pr = Math.max(0.35, Math.min(pr, 4, maxDim / Math.max(1, this.width), maxDim / Math.max(1, this.height)));
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);
    this.gradePass.uniforms.aspect.value = this.width / Math.max(1, this.height);
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
    u.time.value = performance.now() / 1000;
  }

  render(): void {
    this.composer.render();
  }

  /**
   * Draw another scene (the hangar) through the same pipeline, so the menu
   * gets anti-aliasing, bloom and the picture settings too.
   */
  renderScene(scene: THREE.Scene, camera: THREE.Camera, toneMapping?: THREE.ToneMapping): void {
    const s = this.renderPass.scene, c = this.renderPass.camera;
    const ov = this.overlayPass.enabled, vis = this.visionPass.enabled;
    const tm = this.renderer.toneMapping;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.overlayPass.enabled = false;
    this.visionPass.enabled = false;
    if (toneMapping !== undefined && this.settings.toneMapping === 'neutral') this.renderer.toneMapping = toneMapping;
    this.composer.render();
    this.renderer.toneMapping = tm;
    this.renderPass.scene = s;
    this.renderPass.camera = c;
    this.overlayPass.enabled = ov;
    this.visionPass.enabled = vis;
  }
}
