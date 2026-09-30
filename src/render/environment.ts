// Sun, sky dome, lights and the altitude-aware haze colours. One place that
// knows what time of day it is and how the air looks at the camera altitude.

import * as THREE from 'three';
import { updateAirLight } from './airLight';
import { clamp01, lerp, smoothstep } from '../core/math';
import { FOG_SUN, FOG_SUN_COLOR } from './fog';

const SRGB = THREE.SRGBColorSpace;

export type TimeOfDay = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk';

interface TodPreset {
  sunElev: number; // degrees
  sunAzim: number; // degrees (0 = north)
  sunColor: [number, number, number];
  sunIntensity: number;
  zenith: [number, number, number];
  horizon: [number, number, number];
  hemiSky: [number, number, number];
  hemiGround: [number, number, number];
  hemiIntensity: number;
  haze: number;
}

const PRESETS: Record<TimeOfDay, TodPreset> = {
  dawn: {
    sunElev: 6,
    sunAzim: 95,
    sunColor: [1.0, 0.72, 0.5],
    sunIntensity: 2.2,
    zenith: [0.16, 0.26, 0.5],
    horizon: [0.85, 0.66, 0.55],
    hemiSky: [0.55, 0.6, 0.8],
    hemiGround: [0.35, 0.28, 0.25],
    hemiIntensity: 0.9,
    haze: 1.3,
  },
  morning: {
    sunElev: 28,
    sunAzim: 120,
    sunColor: [1.0, 0.94, 0.84],
    sunIntensity: 3.0,
    zenith: [0.17, 0.38, 0.78],
    horizon: [0.66, 0.78, 0.9],
    hemiSky: [0.62, 0.74, 0.95],
    hemiGround: [0.42, 0.35, 0.3],
    hemiIntensity: 1.1,
    haze: 1.0,
  },
  noon: {
    sunElev: 62,
    sunAzim: 170,
    sunColor: [1.0, 0.98, 0.94],
    sunIntensity: 3.3,
    zenith: [0.14, 0.36, 0.8],
    horizon: [0.68, 0.8, 0.93],
    hemiSky: [0.65, 0.77, 0.97],
    hemiGround: [0.45, 0.38, 0.32],
    hemiIntensity: 1.15,
    haze: 0.9,
  },
  afternoon: {
    sunElev: 34,
    sunAzim: 235,
    sunColor: [1.0, 0.9, 0.78],
    sunIntensity: 3.0,
    zenith: [0.16, 0.36, 0.76],
    horizon: [0.7, 0.78, 0.88],
    hemiSky: [0.62, 0.72, 0.92],
    hemiGround: [0.44, 0.36, 0.3],
    hemiIntensity: 1.1,
    haze: 1.05,
  },
  dusk: {
    sunElev: 5,
    sunAzim: 272,
    sunColor: [1.0, 0.58, 0.34],
    sunIntensity: 2.0,
    zenith: [0.13, 0.2, 0.42],
    horizon: [0.9, 0.58, 0.42],
    hemiSky: [0.5, 0.52, 0.72],
    hemiGround: [0.3, 0.24, 0.22],
    hemiIntensity: 0.8,
    haze: 1.4,
  },
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vDir = normalize( ( modelMatrix * vec4( position, 0.0 ) ).xyz );
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform vec3 groundHaze;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float horizonDip;
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize( vDir );
  float y = d.y + horizonDip;
  vec3 col;
  if ( y >= 0.0 ) {
    float t = pow( clamp( y, 0.0, 1.0 ), 0.42 );
    col = mix( horizonColor, zenithColor, t );
  } else {
    col = mix( horizonColor, groundHaze, smoothstep( 0.0, 0.12, -y ) );
  }
  float sd = max( dot( d, sunDir ), 0.0 );
  col += sunColor * ( pow( sd, 6.0 ) * 0.22 + pow( sd, 64.0 ) * 0.35 );
  col += sunColor * smoothstep( 0.99965, 0.99985, sd ) * 18.0;
  // a low sun paints the horizon around it warm (sunrise / sunset band)
  float lowSun = 1.0 - smoothstep( 0.04, 0.45, sunDir.y );
  vec2 hd = normalize( d.xz + vec2( 1e-5 ) );
  float toward = pow( max( dot( hd, normalize( sunDir.xz + vec2( 1e-5 ) ) ), 0.0 ), 3.0 );
  col += sunColor * toward * lowSun * ( 1.0 - smoothstep( 0.0, 0.3, abs( y ) ) ) * 0.35;
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Environment {
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xaaccff, 0x554433, 1);
  readonly sky: THREE.Mesh;
  readonly fog: THREE.FogExp2;
  readonly sunDir = new THREE.Vector3();
  readonly horizonColor = new THREE.Color();
  readonly zenithColor = new THREE.Color();
  private skyMat: THREE.ShaderMaterial;
  private preset: TodPreset;
  private baseHaze = 1;
  tod: TimeOfDay = 'morning';

  constructor(private scene: THREE.Scene) {
    this.preset = PRESETS.morning;
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        zenithColor: { value: new THREE.Color() },
        horizonColor: { value: new THREE.Color() },
        groundHaze: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3() },
        sunColor: { value: new THREE.Color() },
        horizonDip: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.skyMat);
    this.sky.scale.setScalar(800000);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.sky.name = 'sky';
    scene.add(this.sky);

    this.fog = new THREE.FogExp2(0xaabbcc, 1 / 30000);
    scene.fog = this.fog;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 1;
    sc.far = 3000;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.add(this.hemi);
    this.setTimeOfDay('morning');
  }

  setShadowExtent(size: number): void {
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -size;
    sc.right = size;
    sc.top = size;
    sc.bottom = -size;
    sc.updateProjectionMatrix();
  }

  setTimeOfDay(tod: TimeOfDay): void {
    this.tod = tod;
    const p = (this.preset = PRESETS[tod]);
    const el = (p.sunElev * Math.PI) / 180;
    const az = (p.sunAzim * Math.PI) / 180;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    this.sun.color.setRGB(...p.sunColor, SRGB);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.setRGB(...p.hemiSky, SRGB);
    this.hemi.groundColor.setRGB(...p.hemiGround, SRGB);
    this.hemi.intensity = p.hemiIntensity;
    this.baseHaze = p.haze;
    const u = this.skyMat.uniforms;
    (u.sunDir.value as THREE.Vector3).copy(this.sunDir);
    (u.sunColor.value as THREE.Color).setRGB(...p.sunColor, SRGB);
  }

  /** Visibility multiplier from the weather setting (1 = default). */
  hazeScale = 1;
  /**
   * Weather: how grey the day is under the clouds (0..1), the cloud deck the
   * camera may be under, in or above, visibility (0 murk .. 1 clear) and a
   * lightning flash (0..1).
   */
  weather = { gloom: 0, deckBase: 2000, deckTop: 2600, deckSolid: 0, vis: 1, flash: 0 };
  /** 0 above the deck .. 1 below it (for rain, sound, etc.) */
  underDeck = 0;
  /** 0..1 while the camera is inside the cloud deck */
  inCloud = 0;
  /** sun glow through the haze (light scattering setting) */
  scattering = true;

  /** Update per frame: move sky/sun with the camera, adapt colours to altitude. */
  update(camPos: THREE.Vector3, focus: THREE.Vector3): void {
    const p = this.preset;
    const wx = this.weather;
    // under the deck the sun is hidden and the day goes grey; above it the
    // sky is clear and bright; inside it everything whites out
    const under = (1 - smoothstep(wx.deckBase, wx.deckTop, camPos.y)) * wx.deckSolid;
    this.underDeck = under;
    this.inCloud = wx.deckSolid * smoothstep(wx.deckBase - 60, wx.deckBase + 150, camPos.y) * (1 - smoothstep(wx.deckTop - 150, wx.deckTop + 60, camPos.y));
    const grey = Math.max(under * (0.55 + 0.45 * wx.gloom), wx.gloom * 0.25);
    const flash = wx.flash;
    this.sun.intensity = p.sunIntensity * (1 - 0.72 * under);
    updateAirLight(this.sun.color, this.sun.intensity, Math.asin(Math.max(-1, Math.min(1, this.sunDir.y))));
    this.hemi.intensity = p.hemiIntensity * (1 - 0.12 * under - 0.2 * wx.gloom * under) + flash * 2.5;
    const alt = Math.max(0, camPos.y);
    // Sky darkens toward deep blue with altitude (thin air at 50,000 ft).
    const a = smoothstep(0, 16000, alt);
    this.zenithColor.setRGB(lerp(p.zenith[0], 0.03, a), lerp(p.zenith[1], 0.1, a), lerp(p.zenith[2], 0.36, a), SRGB);
    this.horizonColor.setRGB(...p.horizon, SRGB);
    const hz = smoothstep(4000, 18000, alt);
    this.horizonColor.lerp(new THREE.Color().setRGB(0.5, 0.64, 0.86, SRGB), hz * 0.6);
    if (grey > 0 || flash > 0) {
      // overcast sky: flat grey, darker the heavier the weather
      const g = 0.62 - 0.3 * wx.gloom;
      const cloudGrey = new THREE.Color().setRGB(g, g * 1.02, g * 1.07, SRGB);
      this.zenithColor.lerp(cloudGrey.clone().multiplyScalar(0.85), grey);
      this.horizonColor.lerp(cloudGrey, grey);
      if (flash > 0) {
        this.zenithColor.addScalar(flash * 0.5);
        this.horizonColor.addScalar(flash * 0.4);
      }
    }
    const u = this.skyMat.uniforms;
    (u.zenithColor.value as THREE.Color).copy(this.zenithColor);
    (u.horizonColor.value as THREE.Color).copy(this.horizonColor);
    // no sun disc or glow through the cloud
    (u.sunColor.value as THREE.Color).setRGB(...p.sunColor, SRGB).multiplyScalar(1 - 0.97 * under);
    (u.groundHaze.value as THREE.Color).copy(this.horizonColor).multiplyScalar(0.82);
    // Horizon dips below the horizontal as altitude increases (geometric dip).
    u.horizonDip.value = Math.sqrt((2 * alt) / 6371000) * 0.9;

    this.fog.color.copy(this.horizonColor);
    // sunlit haze: stronger forward scattering when the sun is low
    FOG_SUN[0] = this.sunDir.x;
    FOG_SUN[1] = this.sunDir.y;
    FOG_SUN[2] = this.sunDir.z;
    FOG_SUN[3] = this.scattering ? (1 + 0.8 * (1 - smoothstep(4, 30, p.sunElev))) * (1 - under) : 0;
    const sc = this.skyMat.uniforms.sunColor.value as THREE.Color;
    FOG_SUN_COLOR[0] = sc.r;
    FOG_SUN_COLOR[1] = sc.g;
    FOG_SUN_COLOR[2] = sc.b;
    // visibility: rain, snow and mist thicken the haze; inside cloud it is a whiteout
    const murk = 1 + Math.pow(1 - wx.vis, 1.6) * 40 * (0.35 + 0.65 * under);
    this.fog.density = (1 / 85000) * this.baseHaze * this.hazeScale * murk + this.inCloud * (1 / 260);
    if (this.inCloud > 0) this.fog.color.lerp(new THREE.Color().setRGB(0.78, 0.8, 0.84, SRGB).multiplyScalar(1 - 0.4 * wx.gloom), this.inCloud);

    this.sky.position.copy(camPos);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 1500);
    this.sun.target.updateMatrixWorld();
  }

  /** Sky colour in a direction (used by the water shader and clouds). */
  get uniformsForWater(): { horizon: THREE.Color; zenith: THREE.Color; sunDir: THREE.Vector3; sunColor: THREE.Color } {
    return {
      horizon: this.horizonColor,
      zenith: this.zenithColor,
      sunDir: this.sunDir,
      sunColor: this.skyMat.uniforms.sunColor.value as THREE.Color,
    };
  }

  private envTarget: THREE.WebGLRenderTarget | null = null;

  /** Image-based lighting from the current sky so metal and paint reflect it. */
  buildEnvMap(renderer: THREE.WebGLRenderer): void {
    const p = this.preset;
    // under a cloud deck the sky that paint and glass reflect is flat grey
    const wx = this.weather;
    const grey = Math.max(wx.deckSolid * (0.55 + 0.45 * wx.gloom), wx.gloom * 0.25);
    const g = 0.62 - 0.3 * wx.gloom;
    const cloud = new THREE.Color().setRGB(g, g * 1.02, g * 1.07, THREE.SRGBColorSpace);
    const top = new THREE.Color().setRGB(...p.zenith, THREE.SRGBColorSpace).lerp(cloud.clone().multiplyScalar(0.85), grey);
    const mid = new THREE.Color().setRGB(...p.horizon, THREE.SRGBColorSpace).lerp(cloud, grey);
    const sunCol = new THREE.Color().setRGB(...p.sunColor, THREE.SRGBColorSpace).multiplyScalar(1 - 0.95 * wx.deckSolid);
    const scene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: top },
        mid: { value: mid },
        bot: { value: new THREE.Color().setRGB(0.36, 0.3, 0.26, THREE.SRGBColorSpace) },
        sunDir: { value: this.sunDir.clone() },
        sunCol: { value: sunCol },
      },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vD;' +
        'void main(){ vec3 d = normalize(vD); vec3 c = d.y > 0.0 ? mix(mid, top, pow(d.y, 0.5)) : mix(mid * 0.8, bot, clamp(-d.y * 4.0, 0.0, 1.0));' +
        ' c += sunCol * pow(max(dot(d, sunDir), 0.0), 64.0) * 6.0; gl_FragColor = vec4(c, 1.0); }',
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(scene, 0);
    pmrem.dispose();
    this.envTarget?.dispose();
    this.envTarget = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.55;
    mat.dispose();
  }

  /** How bright the ambient scene is (used for cloud shading). */
  get daylight(): number {
    return clamp01(this.preset.sunElev / 30) * 0.6 + 0.4;
  }
}
