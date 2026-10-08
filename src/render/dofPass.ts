// Depth of field for the airshow camera: everything nearer or farther than the
// focus distance blurs by the thin-lens circle of confusion,
//   CoC (px) = f² / (N · sensor height) · |1/s − 1/z| · image height,
// from the scene's depth buffer (reversed float depth). A long lens wide open
// melts the hills behind a jet; a jet the lens isn't focused on comes out soft.
// Each pixel gathers a disc of samples, taking only those whose own blur reaches
// it, so a sharp jet doesn't smear into the blurred sky behind it.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float focusInv;
uniform float cocScale;
uniform float maxCoc;
uniform float nearZ;
uniform float farZ;
varying vec2 vUv;
float viewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float k = nearZ / (farZ - nearZ);
  return (farZ * k) / max(d + k, 1e-9);
}
void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  float z0 = viewZ(vUv);
  float c0 = min(maxCoc, cocScale * abs(focusInv - 1.0 / max(z0, 0.01)));
  // (the gather reaches as far as a blurred foreground could spill over this pixel)
  float reach = max(c0, maxCoc * 0.5);
  if (reach < 0.6) { gl_FragColor = base; return; }
  vec3 acc = base.rgb;
  float wsum = 1.0;
  const int N = 32;
  const float GA = 2.39996323;
  for (int i = 1; i <= N; i++) {
    float r = sqrt(float(i) / float(N)) * reach;
    float a = float(i) * GA;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * r * texel;
    float zs = viewZ(uv);
    float cs = min(maxCoc, cocScale * abs(focusInv - 1.0 / max(zs, 0.01)));
    // something in front spills its blur over this pixel; something behind only
    // counts as far as this pixel is blurred itself (a sharp jet stays sharp)
    float w = zs < z0 ? smoothstep(r - 1.0, r + 0.5, cs) : smoothstep(r - 1.0, r + 0.5, min(cs, c0));
    acc += texture2D(tDiffuse, uv).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, base.a);
}`;

export class DofPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    texel: { value: new THREE.Vector2(1, 1) },
    focusInv: { value: 0 },
    cocScale: { value: 0 },
    maxCoc: { value: 0 },
    nearZ: { value: 0.3 },
    farZ: { value: 1700000 },
  };
  private mat = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });
  private quad = new FullScreenQuad(this.mat);
  /** where the depth comes from */
  depth: THREE.DepthTexture | null = null;

  /**
   * Set the lens: focal length (mm), f-number, focus distance (m), the image height
   * (px), the camera's near and far planes.
   */
  setLens(focal: number, fNumber: number, focusM: number, heightPx: number, cam: THREE.PerspectiveCamera): void {
    const u = this.uniforms;
    u.focusInv.value = 1 / Math.max(0.5, focusM);
    u.cocScale.value = ((focal * focal) / (fNumber * 1000 * 24)) * heightPx * 0.5;
    u.maxCoc.value = Math.min(48, heightPx / 45);
    u.nearZ.value = cam.near;
    u.farZ.value = cam.far;
  }

  setSize(w: number, h: number): void {
    this.uniforms.texel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = this.depth;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.mat.dispose();
    this.quad.dispose();
  }
}
