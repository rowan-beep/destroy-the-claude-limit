// Full-screen pilot-vision shader: G-force grey-out, tunnel vision,
// monochrome, red-out, G-LOC blackout, explosion flash and damage shake tint.

import * as THREE from 'three';

export interface VisionState {
  /** 0..1 desaturation / dimming (4.0G - 7.9G grey-out) */
  greyout: number;
  /** 0..1 peripheral tunnel closing */
  tunnel: number;
  /** 0..1 fully black & white (8.0G - 10.4G) */
  mono: number;
  /** 0..1 red tint (0.5 = 50% partial red-out, 1 = full) */
  redout: number;
  /** 0..1 black (G-LOC) */
  blackout: number;
  /** 0..1 white flash */
  flash: number;
  /** 0..1 damage vignette */
  damage: number;
}

export function emptyVision(): VisionState {
  return { greyout: 0, tunnel: 0, mono: 0, redout: 0, blackout: 0, flash: 0, damage: 0 };
}

export const VisionShader = {
  name: 'VisionShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    greyout: { value: 0 },
    tunnel: { value: 0 },
    mono: { value: 0 },
    redout: { value: 0 },
    blackout: { value: 0 },
    flash: { value: 0 },
    damage: { value: 0 },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float greyout;
    uniform float tunnel;
    uniform float mono;
    uniform float redout;
    uniform float blackout;
    uniform float flash;
    uniform float damage;
    uniform float time;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec4 c = texture2D( tDiffuse, uv );
      float lum = dot( c.rgb, vec3( 0.299, 0.587, 0.114 ) );
      // grey-out: colour drains and the image dims and blurs slightly at edges
      vec2 d = uv - 0.5;
      float r = length( d * vec2( 1.6, 1.0 ) );
      if ( greyout > 0.0 ) {
        vec3 blur = ( texture2D( tDiffuse, uv + d * 0.012 * greyout ).rgb + texture2D( tDiffuse, uv - d * 0.012 * greyout ).rgb ) * 0.5;
        float edge = smoothstep( 0.25, 0.8, r );
        c.rgb = mix( c.rgb, blur, edge * greyout );
        c.rgb = mix( c.rgb, vec3( lum ), greyout * ( 0.45 + 0.55 * edge ) );
        c.rgb *= 1.0 - 0.35 * greyout * edge;
      }
      if ( mono > 0.0 ) {
        c.rgb = mix( c.rgb, vec3( lum ), mono );
      }
      // tunnel vision: dark periphery closing in
      if ( tunnel > 0.0 ) {
        float inner = mix( 0.95, 0.12, tunnel );
        float v = smoothstep( inner, inner + 0.35, r );
        c.rgb *= 1.0 - v * min( 1.0, tunnel * 1.3 );
      }
      // red-out: 0.5 => 50 % crimson wash with vignette, 1 => solid red
      if ( redout > 0.0 ) {
        vec3 red = vec3( 0.55, 0.0, 0.0 );
        float edge = smoothstep( 0.1, 0.75, r );
        float a = redout <= 0.5 ? redout * ( 0.7 + 0.6 * edge ) : mix( 0.5 * ( 0.7 + 0.6 * edge ), 1.0, ( redout - 0.5 ) * 2.0 );
        c.rgb = mix( c.rgb, red * ( 0.6 + 0.4 * lum ), clamp( a, 0.0, 1.0 ) );
      }
      if ( damage > 0.0 ) {
        float edge = smoothstep( 0.35, 0.9, r );
        c.rgb = mix( c.rgb, vec3( 0.35, 0.02, 0.0 ), edge * damage * 0.6 );
      }
      c.rgb += vec3( 1.0, 0.95, 0.85 ) * flash;
      c.rgb *= 1.0 - blackout;
      gl_FragColor = c;
    }
  `,
};
