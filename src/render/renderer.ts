// WebGL renderer, camera and the post-processing chain (MSAA scene render,
// G-force vision effects, tone mapping / output).

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { installAltitudeFog } from './fog';
import { VisionShader, VisionState } from './vision';

export interface GraphicsSettings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  resolutionScale: number;
  shadows: boolean;
  fov: number;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private visionPass: ShaderPass;
  private outputPass: OutputPass;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  settings: GraphicsSettings = { quality: 'high', resolutionScale: 1, shadows: true, fov: 70 };

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
    this.visionPass = new ShaderPass(VisionShader);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.visionPass);
    this.composer.addPass(this.outputPass);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applySettings(s: Partial<GraphicsSettings>): void {
    Object.assign(this.settings, s);
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.camera.fov = this.settings.fov;
    this.resize();
  }

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const base = Math.min(window.devicePixelRatio || 1, 2);
    const q = this.settings.quality;
    const qScale = q === 'low' ? 0.7 : q === 'medium' ? 0.85 : 1;
    this.pixelRatio = base * qScale * this.settings.resolutionScale;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  get size(): { w: number; h: number } {
    return { w: this.width, h: this.height };
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
}
