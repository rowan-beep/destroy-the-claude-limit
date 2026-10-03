// PITCH BLACK nights and night-vision goggles. A moonless, starless night
// on any map, in any mode: the sun, the sky and the haze go out, and the
// naked eye sees only real light sources (engine glow, afterburners, deck
// and runway lights, explosions). Night vision amplifies the faint
// starlight into a dark green, grainy picture; in the cockpit it is the
// round view of the goggle tube, outside the jet it fills the screen.

import * as THREE from 'three';

export const NIGHT = {
  /** the PITCH BLACK weather option */
  dark: false,
  /** night-vision goggles on */
  nvg: false,
  /** looking through the goggles from the cockpit (the round tube view) */
  tube: false,
};

/** Shared by every light-point material: the smallest a light may shrink to on screen (px). */
export const LIGHT_MIN_PX = { value: 1.2 };
const LIGHT_MATS = new Set<THREE.PointsMaterial>();

/** Per frame: in a pitch-black night the lights are what the eye adapts to, so they burn brighter. */
export function updateLights(): void {
  LIGHT_MIN_PX.value = NIGHT.dark ? 3 : 0;
  const k = NIGHT.dark ? 3 : 1;
  for (const m of LIGHT_MATS) m.color.setScalar(k);
}

/**
 * Runway, deck and ship lights are points sized in metres, so far off they shrink below
 * a pixel and vanish; real lights stay a bright dot however far away they are. This
 * keeps them at least LIGHT_MIN_PX across (larger in a pitch-black night).
 */
export function keepLightsVisible(mat: THREE.PointsMaterial): THREE.PointsMaterial {
  LIGHT_MATS.add(mat);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.lightMinPx = LIGHT_MIN_PX;
    sh.vertexShader = 'uniform float lightMinPx;\n' + sh.vertexShader.replace('#include <fog_vertex>', 'gl_PointSize = max( gl_PointSize, lightMinPx );\n#include <fog_vertex>');
  };
  mat.customProgramCacheKey = () => 'lightMinPx';
  return mat;
}

export const NightShader = {
  name: 'NightShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    dark: { value: 0 },
    nvg: { value: 0 },
    tube: { value: 0 },
    time: { value: 0 },
    res: { value: new THREE.Vector2(1, 1) },
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
    uniform float dark;
    uniform float nvg;
    uniform float tube;
    uniform float time;
    uniform vec2 res;
    varying vec2 vUv;
    float hash( vec2 p ) {
      p = fract( p * vec2( 123.34, 456.21 ) );
      p += dot( p, p + 45.32 );
      return fract( p.x * p.y );
    }
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      if ( nvg > 0.5 ) {
        // the tube's slightly soft picture
        vec2 px = 1.0 / res;
        vec3 s = c.rgb * 0.5;
        s += texture2D( tDiffuse, vUv + vec2( px.x, 0.0 ) ).rgb * 0.125;
        s += texture2D( tDiffuse, vUv - vec2( px.x, 0.0 ) ).rgb * 0.125;
        s += texture2D( tDiffuse, vUv + vec2( 0.0, px.y ) ).rgb * 0.125;
        s += texture2D( tDiffuse, vUv - vec2( 0.0, px.y ) ).rgb * 0.125;
        float lum = dot( s, vec3( 0.3, 0.59, 0.11 ) );
        // light amplification: a moonless night needs a lot of gain, daylight floods the tube
        float L = lum * mix( 2.2, 26.0, dark );
        L = L / ( 1.0 + 0.55 * L );
        // grain: fresh every frame, strongest in the dark parts
        float g = hash( floor( vUv * res / 1.6 ) + fract( time * 7.13 ) * 311.0 ) - 0.5;
        float g2 = hash( floor( vUv * res / 3.2 ) + fract( time * 3.71 ) * 173.0 ) - 0.5;
        L += ( g * 0.2 + g2 * 0.1 ) * ( 0.35 + 0.65 * ( 1.0 - clamp( L, 0.0, 1.0 ) ) );
        L = max( L, 0.0 );
        // dark green phosphor, washing toward pale green where it saturates
        vec3 col = vec3( 0.16, 0.38, 0.17 ) * L * 1.25;
        col = mix( col, vec3( 0.55, 0.78, 0.52 ), smoothstep( 0.75, 1.3, L ) * 0.6 );
        // scan of the tube: faint horizontal banding
        col *= 0.96 + 0.04 * sin( vUv.y * res.y * 1.4 + time * 30.0 );
        vec2 d = ( vUv - 0.5 ) * vec2( res.x / res.y, 1.0 );
        float r = length( d );
        if ( tube > 0.5 ) {
          // through the goggles: one round field of view, black around it
          col *= 1.0 - smoothstep( 0.4, 0.49, r );
          col *= 1.0 - 0.35 * smoothstep( 0.2, 0.45, r );
        } else {
          col *= 1.0 - 0.45 * smoothstep( 0.35, 0.95, r );
        }
        c.rgb = col;
      } else if ( dark > 0.5 ) {
        // the naked eye in a moonless night: only light sources show
        // (the lit scene is near black already; anything brighter than that is a light)
        c.rgb = c.rgb * 0.03 + max( c.rgb - 0.22, 0.0 ) * 1.3;
      }
      gl_FragColor = c;
    }
  `,
};
