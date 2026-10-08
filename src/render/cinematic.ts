// The camera's own look, on top of the rendered world.
//
// SunShafts (in HDR, before bloom): light streaming from the sun through gaps
// in cloud and past the airframe. The bright sky is blurred radially toward the
// sun's position on screen, so whatever stands in front of the sun (cloud, a
// wing, the canopy bow) casts dark rays through the glow; a few lens ghosts
// mirror the sun through the screen centre, tinted like coated glass.
//
// Finish (display space, last): contrast-adaptive sharpening, which restores the
// crispness the anti-aliasing and the resolution scaling take off; a touch of
// lens chromatic aberration toward the corners; a fine, animated film grain;
// and, at high speed, a radial blur toward the screen edges that sells it.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export const SunShaftShader = {
  uniforms: {
    tDiffuse: { value: null },
    sunUv: { value: [0.5, 0.5] as number[] },
    /** overall strength (0 = off: sun behind the camera, at night, in cloud) */
    strength: { value: 0 },
    aspect: { value: 1 },
    sunColor: { value: [1, 0.9, 0.75] as number[] },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 sunUv;
    uniform float strength;
    uniform float aspect;
    uniform vec3 sunColor;
    varying vec2 vUv;
    // what counts as "light behind": the bright sky and the sun itself
    vec3 bright(vec2 uv) {
      vec3 c = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
      if (any(isnan(c))) c = vec3(0.0);
      c = clamp(c, 0.0, 256.0);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // capped: the sun's disc alone must not flood the rays
      return min(c * smoothstep(1.2, 4.0, l), vec3(2.5));
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      if (strength <= 0.0) { gl_FragColor = vec4(0.0); return; }
      // rays: march from this pixel toward the sun, gathering the light behind
      vec2 d = (sunUv - vUv);
      float dist = length(d * vec2(aspect, 1.0));
      const int N = 28;
      vec2 st = d / float(N) * 0.92;
      vec2 uv = vUv + st * 0.5;
      float w = 1.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < N; i++) {
        acc += bright(uv) * w;
        w *= 0.955;
        uv += st;
      }
      acc /= float(N);
      // rays fade with distance from the sun across the screen
      float fall = exp(-dist * 3.2);
      vec3 rays = acc * sunColor * fall * 0.5;
      // lens ghosts: the sun mirrored through the centre, a few sizes and tints
      vec2 g = vec2(0.5) - sunUv;
      vec3 ghosts = vec3(0.0);
      float sunGlow = dot(bright(sunUv), vec3(0.33));
      if (sunGlow > 0.01) {
        for (int k = 1; k <= 4; k++) {
          float t = float(k) * 0.42 - 0.15;
          vec2 p = sunUv + g * 2.0 * t;
          float r = 0.012 + 0.021 * float(k);
          float q = length((vUv - p) * vec2(aspect, 1.0));
          float ring = smoothstep(r, r * 0.55, q) * (0.35 + 0.65 * smoothstep(r * 0.4, r, q));
          vec3 tint = k == 1 ? vec3(0.6, 0.9, 1.0) : k == 2 ? vec3(1.0, 0.7, 0.45) : k == 3 ? vec3(0.55, 1.0, 0.7) : vec3(0.85, 0.6, 1.0);
          ghosts += tint * ring * 0.018;
        }
        ghosts *= min(sunGlow, 2.0);
      }
      gl_FragColor = vec4((rays + ghosts) * strength, 1.0);
    }`,
};

/**
 * The sun's rays, worked out at half resolution (they are soft: nobody can tell,
 * and it is a quarter of the work) and added over the picture.
 */
export class SunShaftPass extends Pass {
  private rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private rayMat = new THREE.ShaderMaterial({ ...SunShaftShader, uniforms: THREE.UniformsUtils.clone(SunShaftShader.uniforms) });
  private addMat = new THREE.ShaderMaterial({
    uniforms: { tRays: { value: null as THREE.Texture | null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tRays; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tRays, vUv).rgb, 1.0); }',
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  private quad = new FullScreenQuad(this.rayMat);
  readonly uniforms = this.rayMat.uniforms as typeof SunShaftShader.uniforms;
  constructor() {
    super();
    this.needsSwap = false;
  }
  setSize(w: number, h: number): void {
    this.rt.setSize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)));
  }
  render(renderer: THREE.WebGLRenderer, _w: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture as unknown as null;
    this.quad.material = this.rayMat;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    this.quad.render(renderer);
    this.addMat.uniforms.tRays.value = this.rt.texture;
    this.quad.material = this.addMat;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }
  dispose(): void {
    this.rt.dispose();
    this.rayMat.dispose();
    this.addMat.dispose();
    this.quad.dispose();
  }
}

export const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    texel: { value: [1 / 1280, 1 / 720] as number[] },
    sharpen: { value: 0.55 },
    aberration: { value: 0.0016 },
    grain: { value: 0.025 },
    speedBlur: { value: 0 },
    time: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 texel;
    uniform float sharpen;
    uniform float aberration;
    uniform float grain;
    uniform float speedBlur;
    uniform float time;
    uniform float aspect;
    varying vec2 vUv;
    vec3 tap(vec2 uv) { return texture2D(tDiffuse, uv).rgb; }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(aspect, 1.0), c * vec2(aspect, 1.0));
      // chromatic aberration: red out, blue in, growing toward the corners
      vec2 ca = c * aberration * r2 * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
      // contrast-adaptive sharpening (AMD CAS): sharpen less where there is already contrast
      if (sharpen > 0.0) {
        vec3 n = tap(vUv + vec2(0.0, texel.y)), s = tap(vUv - vec2(0.0, texel.y));
        vec3 e = tap(vUv + vec2(texel.x, 0.0)), w = tap(vUv - vec2(texel.x, 0.0));
        vec3 mn = min(col, min(min(n, s), min(e, w)));
        vec3 mx = max(col, max(max(n, s), max(e, w)));
        vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
        vec3 wgt = -amp / mix(8.0, 5.0, sharpen);
        col = clamp((col + (n + s + e + w) * wgt) / (1.0 + 4.0 * wgt), 0.0, 1.0);
      }
      // speed: the edges of the picture streak toward the centre
      if (speedBlur > 0.001) {
        float edge = smoothstep(0.08, 0.5, r2);
        vec3 acc = col;
        for (int i = 1; i <= 6; i++) acc += tap(vUv - c * speedBlur * edge * float(i) * 0.012);
        col = acc / 7.0;
      }
      // film grain, finer than a pixel's worth of noise, strongest in the mid-tones
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      float n = fract(sin(dot(vUv * vec2(1931.7, 1153.3) + time * 17.31, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      col += n * grain * (1.0 - abs(l * 2.0 - 1.0));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};
