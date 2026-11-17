// Weather: what the sky is doing (clear, cloudy, overcast, rain, storm, snow, and on
// the Dune Sea a sandstorm),
// the player's saved choice, and the precipitation and lightning effects.
// Weather is visual and local to this player (it never changes the flight model).

import * as THREE from 'three';
import { smoothstep, clamp01 } from '../core/math';
import { getSoftDotTexture } from '../render/textures';
import { activeMap } from './islands';

export type WeatherKind = 'clear' | 'cloudy' | 'overcast' | 'rain' | 'storm' | 'snow' | 'sand';

export interface Weather {
  kind: WeatherKind;
  /** cloud cover 0..1 */
  cover: number;
  /** rain / snow intensity 0..1 (a sandstorm: how hard the sand blows) */
  precip: number;
  /** visibility 0 (thick murk) .. 1 (crystal clear) */
  vis: number;
  /** PITCH BLACK: a moonless night (works with any weather) */
  dark?: boolean;
}

export const WEATHER_KINDS: [WeatherKind, string][] = [
  ['clear', 'CLEAR'],
  ['cloudy', 'CLOUDY'],
  ['overcast', 'OVERCAST'],
  ['rain', 'RAIN'],
  ['storm', 'STORM'],
  ['snow', 'SNOW'],
  ['sand', 'SANDSTORM'],
];

/** The weather in force now, for the sound: how hard the sand is blowing (0..1). Set by World.setWeather. */
export const WEATHER_NOW = { dust: 0 };

/** The kinds the active map offers (a sandstorm only over the Dune Sea). */
export function weatherKindsHere(): [WeatherKind, string][] {
  return WEATHER_KINDS.filter(([k]) => k !== 'sand' || activeMap.id === 'dune');
}

/** A weather the active map can have: a sandstorm away from the desert turns clear. */
export function weatherHere(w: Weather): Weather {
  return w.kind === 'sand' && activeMap.id !== 'dune' ? { ...WEATHER_PRESETS.clear, dark: w.dark } : w;
}

export const WEATHER_PRESETS: Record<WeatherKind, Weather> = {
  clear: { kind: 'clear', cover: 0.12, precip: 0, vis: 1 },
  cloudy: { kind: 'cloudy', cover: 0.62, precip: 0, vis: 0.9 },
  overcast: { kind: 'overcast', cover: 1, precip: 0, vis: 0.72 },
  rain: { kind: 'rain', cover: 0.95, precip: 0.65, vis: 0.5 },
  storm: { kind: 'storm', cover: 1, precip: 1, vis: 0.35 },
  snow: { kind: 'snow', cover: 0.95, precip: 0.65, vis: 0.42 },
  // a thin high veil over a wall of blowing sand near the ground
  sand: { kind: 'sand', cover: 0.15, precip: 0.8, vis: 0.3 },
};

/** The layer of cloud for a weather: base and top (m), and how solid it is 0..1. */
export interface CloudDeck {
  base: number;
  top: number;
  solid: number;
}

export function deckFor(w: Weather): CloudDeck {
  const solid = smoothstep(0.68, 0.96, w.cover);
  switch (w.kind) {
    case 'rain':
      return { base: 1100, top: 3300, solid };
    case 'storm':
      return { base: 900, top: 3600, solid };
    case 'snow':
      return { base: 1000, top: 2900, solid };
    case 'overcast':
      return { base: 1500, top: 2900, solid };
    default:
      return { base: 2000, top: 2600, solid };
  }
}

const KEY = 'triad.weather.v1';

export function loadWeather(): Weather {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Weather> | null;
    if (j && j.kind && j.kind in WEATHER_PRESETS) {
      const p = WEATHER_PRESETS[j.kind];
      return { kind: j.kind, cover: clamp01(j.cover ?? p.cover), precip: clamp01(j.precip ?? p.precip), vis: clamp01(j.vis ?? p.vis), dark: j.dark === true };
    }
  } catch {
    /* storage unavailable */
  }
  // (the desert starts on a clear afternoon sky, the other theaters with fair-weather cumulus)
  return { ...(activeMap.id === 'dune' ? WEATHER_PRESETS.clear : WEATHER_PRESETS.cloudy) };
}

export function saveWeather(w: Weather): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------------------
// Rain and snow: particles in a box that travels with the camera. Every
// particle is fixed in the world and falls; the box wraps around the camera on
// the GPU, and each drop is drawn as a streak along its motion relative to the
// camera, so at 500 knots the rain comes at you in long lines.
// ---------------------------------------------------------------------------

const PRECIP_VERT = /* glsl */ `
attribute vec4 iSeed; // xyz = position in the box (0..1), w = random
uniform vec3 uCam;
uniform vec3 uCamVel;
uniform vec3 uFall;
uniform float uTime;
uniform float uBox;
uniform float uLen;
uniform float uMaxLen;
uniform float uWidth;
uniform float uSnow;
varying vec2 vUv;
varying float vAlpha;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vec3 fall = uFall * ( 0.8 + 0.4 * iSeed.w );
  vec3 p = iSeed.xyz * uBox + fall * uTime;
  // snow flutters as it falls
  p.x += uSnow * sin( uTime * ( 0.7 + iSeed.w ) + iSeed.w * 40.0 ) * 0.8;
  p.z += uSnow * cos( uTime * ( 0.6 + iSeed.w * 0.8 ) + iSeed.w * 23.0 ) * 0.8;
  vec3 rel = mod( p - uCam, uBox ) - uBox * 0.5;
  vec3 world = uCam + rel;
  // streak along the motion relative to the camera (a camera-exposure blur)
  vec3 mv = fall - uCamVel;
  float sp = length( mv );
  vec3 dir = sp > 1e-3 ? mv / sp : vec3( 0.0, -1.0, 0.0 );
  float len = clamp( uLen * sp, uWidth * 2.0, uMaxLen );
  vec3 toCam = normalize( cameraPosition - world );
  vec3 side = normalize( cross( dir, toCam ) + vec3( 1e-4 ) );
  vec3 pos = world + dir * position.y * len + side * position.x * uWidth;
  float d = length( rel );
  // nothing inside the cockpit, fading out toward the edge of the box
  vAlpha = smoothstep( 2.5, 6.0, d ) * ( 1.0 - smoothstep( uBox * 0.3, uBox * 0.5, d ) );
  vec4 mvPosition = viewMatrix * vec4( pos, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const PRECIP_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSnow;
varying vec2 vUv;
varying float vAlpha;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float a;
  if ( uSnow > 0.5 ) a = texture2D( map, vUv ).a;
  else a = ( 1.0 - abs( vUv.x * 2.0 - 1.0 ) ) * smoothstep( 0.0, 0.25, vUv.y ) * smoothstep( 1.0, 0.6, vUv.y );
  a *= vAlpha * uOpacity;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uColor, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

class Precip {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  readonly mat: THREE.ShaderMaterial;
  constructor(
    scene: THREE.Scene,
    readonly max: number,
    snow: boolean,
    sand = false,
  ) {
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0, 0);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    const seeds = new Float32Array(max * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    this.geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    this.geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PRECIP_VERT,
      fragmentShader: PRECIP_FRAG,
      uniforms: {
        map: { value: getSoftDotTexture() },
        uCam: { value: new THREE.Vector3() },
        uCamVel: { value: new THREE.Vector3() },
        // (sand is blown nearly flat along the ground, fast, with the wind: toward the east-south-east)
        uFall: { value: sand ? new THREE.Vector3(15.5, -0.9, 2.7) : snow ? new THREE.Vector3(0.6, -1.4, 0.3) : new THREE.Vector3(1.5, -9.5, 0.6) },
        uTime: { value: 0 },
        uBox: { value: sand ? 70 : snow ? 60 : 80 },
        uLen: { value: sand ? 0.05 : snow ? 0.012 : 0.07 },
        uMaxLen: { value: sand ? 1.4 : snow ? 1.2 : 1.6 },
        uWidth: { value: sand ? 0.05 : snow ? 0.08 : 0.028 },
        uSnow: { value: snow ? 1 : 0 },
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.name = sand ? 'sand' : snow ? 'snow' : 'rain';
    scene.add(this.mesh);
  }

  set count(n: number) {
    this.geo.instanceCount = Math.max(0, Math.min(this.max, Math.round(n)));
    this.mesh.visible = this.geo.instanceCount > 0;
  }
}

/**
 * Rain, snow and lightning around the camera for the current weather.
 * `flash` (0..1) is read by the environment to light up the sky.
 */
export class PrecipitationFx {
  private rain: Precip;
  private snow: Precip;
  private sand: Precip;
  private time = 0;
  private lastCam = new THREE.Vector3();
  private camVel = new THREE.Vector3();
  private haveCam = false;
  private boltT = 6;
  private flashT = 0;
  flash = 0;
  /** how hard rain is falling on the camera 0..1, and the camera speed (m/s) */
  rainOnCamera = 0;
  camSpeed = 0;
  /** called when a lightning bolt strikes, with its distance (m) */
  onThunder: ((distance: number) => void) | null = null;
  private w: Weather = { ...WEATHER_PRESETS.clear };
  private deck: CloudDeck = deckFor(this.w);

  constructor(scene: THREE.Scene) {
    this.rain = new Precip(scene, 14000, false);
    this.snow = new Precip(scene, 9000, true);
    this.sand = new Precip(scene, 12000, true, true);
  }

  set(w: Weather): void {
    this.w = w;
    this.deck = deckFor(w);
  }

  update(dt: number, camera: THREE.Camera, light: number): void {
    const cam = camera.position;
    if (this.haveCam && dt > 0) {
      const v = cam.clone().sub(this.lastCam).divideScalar(Math.max(dt, 1e-3));
      // a camera cut (view change) is not motion
      if (v.length() < 1500) this.camVel.lerp(v, Math.min(1, dt * 10));
    }
    this.haveCam = true;
    this.lastCam.copy(cam);
    this.time += dt;
    const w = this.w;
    // rain and snow fall from the cloud base down
    const under = 1 - smoothstep(this.deck.base - 150, this.deck.base + 250, cam.y);
    const amount = w.precip * under;
    const snowy = w.kind === 'snow';
    const sandy = w.kind === 'sand';
    const speed = this.camVel.length();
    this.camSpeed = speed;
    this.rainOnCamera = snowy || sandy ? 0 : amount;
    // at speed the drops are on the canopy, not streaking past: thin the falling rain
    this.rain.count = snowy || sandy ? 0 : (amount * this.rain.max) / (1 + speed / 45);
    this.snow.count = snowy ? amount * this.snow.max : 0;
    // blowing sand: a layer hugging the dunes, thinning out above about 2,000 m
    this.sand.count = sandy ? w.precip * (1 - smoothstep(1200, 2600, cam.y)) * this.sand.max : 0;
    for (const p of [this.rain, this.snow, this.sand]) {
      const u = p.mat.uniforms;
      (u.uCam.value as THREE.Vector3).copy(cam);
      (u.uCamVel.value as THREE.Vector3).copy(this.camVel);
      // wrap the clock so the float stays precise on long sessions
      u.uTime.value = this.time % 3600;
      if (p === this.sand) (u.uColor.value as THREE.Color).setRGB(0.8 * light + 0.12, 0.64 * light + 0.1, 0.44 * light + 0.07);
      else (u.uColor.value as THREE.Color).setScalar(snowy ? 0.9 * light + 0.1 : 0.75 * light + 0.18);
      u.uOpacity.value = p === this.sand ? 0.55 : snowy ? 0.95 : 0.4 + 0.3 * w.precip;
    }
    // lightning in a storm (and now and then in heavy rain)
    const stormy = w.kind === 'storm' ? 1 : w.kind === 'rain' && w.precip > 0.8 ? 0.3 : 0;
    if (stormy > 0) {
      this.boltT -= dt * stormy;
      if (this.boltT <= 0) {
        this.boltT = 4 + Math.random() * 10;
        this.flashT = 0.45;
        const dist = 1500 + Math.random() * 9000;
        this.onThunder?.(dist);
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const t = 0.45 - this.flashT;
      // a bright strike, a dip, a second flicker
      this.flash = t < 0.08 ? 1 : t < 0.16 ? 0.25 : t < 0.24 ? 0.8 : Math.max(0, 1 - (t - 0.24) / 0.2) * 0.5;
    } else this.flash = 0;
  }
}
