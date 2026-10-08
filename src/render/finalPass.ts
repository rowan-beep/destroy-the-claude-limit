// The last pass: everything that turns the HDR picture into what is shown, in one
// full-screen pass instead of four (each of which read and wrote every pixel of a
// half-float buffer: at 4K that bandwidth was a real share of the frame).
//
//  - scrub: an overflowed or NaN pixel (a sun glint off glossy paint can exceed the
//    half-float range) comes out black instead of poisoning its neighbours
//  - tone mapping and the sRGB transfer (what three's OutputPass did)
//  - the grade: contrast, saturation, vignette
//  - the camera's finish: contrast-adaptive sharpening, lens fringes toward the
//    corners, film grain, and the radial speed blur
// The sharpening and the fringes read their neighbours through the same tone
// mapping and grade, so the result matches the old chain of passes.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VERT = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float contrast;
uniform float saturation;
uniform float vignette;
uniform float aspect;
uniform vec2 texel;
uniform float sharpen;
uniform float aberration;
uniform float grain;
uniform float speedBlur;
uniform float time;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
in vec2 vUv;
out vec4 fragColor;

// one pixel of the HDR picture as it will be shown
vec3 shown(vec2 uv) {
  vec3 c = texture(tDiffuse, uv).rgb;
  if (any(isnan(c)) || any(notEqual(c, c))) c = vec3(0.0);
  c = min(max(c, vec3(0.0)), vec3(256.0));
  #if defined( LINEAR_TONE_MAPPING )
    c = LinearToneMapping(c);
  #elif defined( REINHARD_TONE_MAPPING )
    c = ReinhardToneMapping(c);
  #elif defined( CINEON_TONE_MAPPING )
    c = CineonToneMapping(c);
  #elif defined( ACES_FILMIC_TONE_MAPPING )
    c = ACESFilmicToneMapping(c);
  #elif defined( AGX_TONE_MAPPING )
    c = AgXToneMapping(c);
  #elif defined( NEUTRAL_TONE_MAPPING )
    c = NeutralToneMapping(c);
  #endif
  #ifdef SRGB_TRANSFER
    c = sRGBTransferOETF(vec4(c, 1.0)).rgb;
  #endif
  #ifdef GRADE
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, saturation);
    c = clamp(c, 0.0, 1.0);
    vec3 s = c * c * (3.0 - 2.0 * c);
    c = contrast >= 1.0 ? mix(c, s, (contrast - 1.0) * 1.6) : mix(vec3(0.5), c, 0.5 + 0.5 * contrast);
  #endif
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec2 cc = vUv - 0.5;
  float r2 = dot(cc * vec2(aspect, 1.0), cc * vec2(aspect, 1.0));
  vec3 col;
  #ifdef FINISH
    // chromatic aberration: red out, blue in, growing toward the corners
    vec2 ca = cc * aberration * r2 * 4.0;
    vec3 mid = shown(vUv);
    col = aberration > 0.0 ? vec3(shown(vUv + ca).r, mid.g, shown(vUv - ca).b) : mid;
    // contrast-adaptive sharpening (AMD CAS): sharpen less where there is already contrast
    if (sharpen > 0.0) {
      vec3 n = shown(vUv + vec2(0.0, texel.y)), s = shown(vUv - vec2(0.0, texel.y));
      vec3 e = shown(vUv + vec2(texel.x, 0.0)), w = shown(vUv - vec2(texel.x, 0.0));
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
      for (int i = 1; i <= 6; i++) acc += shown(vUv - cc * speedBlur * edge * float(i) * 0.012);
      col = acc / 7.0;
    }
  #else
    col = shown(vUv);
  #endif
  #ifdef GRADE
    vec2 p = cc * vec2(aspect, 1.0);
    col *= 1.0 - vignette * smoothstep(0.45, 1.25, length(p));
  #endif
  #ifdef FINISH
    // film grain, strongest in the mid-tones
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float gn = fract(sin(dot(vUv * vec2(1931.7, 1153.3) + time * 17.31, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    col += gn * grain * (1.0 - abs(lum * 2.0 - 1.0));
  #endif
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class FinalPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    toneMappingExposure: { value: 1 },
    contrast: { value: 1 },
    saturation: { value: 1 },
    vignette: { value: 0 },
    aspect: { value: 1 },
    texel: { value: [1 / 1280, 1 / 720] as number[] },
    sharpen: { value: 0.45 },
    aberration: { value: 0.0014 },
    grain: { value: 0.01 },
    speedBlur: { value: 0 },
    time: { value: 0 },
  };
  readonly material: THREE.RawShaderMaterial;
  private quad: FullScreenQuad;
  private key = '';
  /** the grade (contrast, saturation, vignette) is on */
  grade = true;
  /** the camera's finish (sharpen, fringes, grain, speed blur) is on */
  finish = true;

  constructor() {
    super();
    this.material = new THREE.RawShaderMaterial({ name: 'FinalPass', glslVersion: THREE.GLSL3, uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG });
    this.quad = new FullScreenQuad(this.material);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    const tm = renderer.toneMapping, cs = renderer.outputColorSpace;
    const key = `${tm}|${cs}|${this.grade}|${this.finish}`;
    if (key !== this.key) {
      this.key = key;
      const d: Record<string, string> = {};
      if (THREE.ColorManagement.getTransfer(cs) === THREE.SRGBTransfer) d.SRGB_TRANSFER = '';
      if (tm === THREE.LinearToneMapping) d.LINEAR_TONE_MAPPING = '';
      else if (tm === THREE.ReinhardToneMapping) d.REINHARD_TONE_MAPPING = '';
      else if (tm === THREE.CineonToneMapping) d.CINEON_TONE_MAPPING = '';
      else if (tm === THREE.ACESFilmicToneMapping) d.ACES_FILMIC_TONE_MAPPING = '';
      else if (tm === THREE.AgXToneMapping) d.AGX_TONE_MAPPING = '';
      else if (tm === THREE.NeutralToneMapping) d.NEUTRAL_TONE_MAPPING = '';
      if (this.grade) d.GRADE = '';
      if (this.finish) d.FINISH = '';
      this.material.defines = d;
      this.material.needsUpdate = true;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (!this.renderToScreen && this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
