// The real night sky, for every view in space: 40,000 stars at their true
// positions, brightnesses and colours (from the Tycho catalogue map), over the
// glow of the Milky Way. Drawn at infinity round the camera; `frame` turns the
// ecliptic sky into a scene's own axes (the Earth-orbit view has Y north).

import * as THREE from 'three';
import { STARS_B64 } from './stars';
import { eqToEcl } from './bodies';
import milkyUrl from './assets/milkyway.jpg';

let starGeo: THREE.BufferGeometry | null = null;

function buildStars(): THREE.BufferGeometry {
  if (starGeo) return starGeo;
  const bin = atob(STARS_B64);
  const n = Math.floor(bin.length / 8);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const u8 = (i: number) => bin.charCodeAt(i);
  for (let i = 0; i < n; i++) {
    const o = i * 8;
    const ra = ((u8(o) | (u8(o + 1) << 8)) / 65535) * 360;
    let dec = u8(o + 2) | (u8(o + 3) << 8);
    if (dec > 32767) dec -= 65536;
    const decD = (dec / 32767) * 90;
    const lf = u8(o + 4) / 255; // log10(flux) + 3, over 4
    const flux = Math.pow(10, lf * 4 - 3);
    const d = eqToEcl(ra, decD);
    pos.set([d[0] * 1000, d[1] * 1000, d[2] * 1000], i * 3);
    // the colour, pushed a little apart from white (the map desaturates it)
    const r = u8(o + 5) / 255, g = u8(o + 6) / 255, b = u8(o + 7) / 255;
    const m = (r + g + b) / 3;
    const k = Math.min(3, 0.25 + Math.pow(flux / 3, 0.75));
    col.set([(m + (r - m) * 1.8) * k, (m + (g - m) * 1.8) * k, (m + (b - m) * 1.8) * k], i * 3);
    size[i] = Math.min(4.5, 1.1 + Math.sqrt(flux) * 0.55);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  starGeo = g;
  return g;
}

let milky: THREE.Texture | null = null;

export class StarSky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private mwMat: THREE.ShaderMaterial;
  /** 1 in deep space; less where a lit planet or a bright sky washes the stars out */
  brightness = 1;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { k: { value: 1 }, px: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float size;
        varying vec3 vC;
        uniform float px;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w * 0.99999;
          gl_PointSize = size * px;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC;
        uniform float k;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c) * 4.0;
          float a = exp(-d * 4.0) + 0.25 * exp(-d * 1.2);
          gl_FragColor = vec4(vC * a * k, 1.0);
        }`,
      vertexColors: true,
      transparent: false,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const pts = new THREE.Points(buildStars(), this.mat);
    pts.frustumCulled = false;
    pts.renderOrder = -10;
    if (!milky) {
      milky = new THREE.TextureLoader().load(milkyUrl);
      milky.colorSpace = THREE.SRGBColorSpace;
    }
    // the Milky Way: an equatorial map on a sphere, turned into the ecliptic frame
    this.mwMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: milky }, k: { value: 1 }, toEq: { value: new THREE.Matrix3() } },
      vertexShader: /* glsl */ `
        varying vec3 vD;
        void main() {
          vD = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p;
          gl_Position.z = p.w * 0.99999;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float k;
        uniform mat3 toEq;
        varying vec3 vD;
        void main() {
          vec3 d = normalize(toEq * vD);
          float ra = atan(d.y, d.x);
          float dec = asin(clamp(d.z, -1.0, 1.0));
          // the map: RA 0 at the middle, increasing to the left
          vec2 uv = vec2(fract(0.5 - ra / 6.2831853), 0.5 + dec / 3.1415927);
          vec3 c = texture2D(map, uv).rgb;
          gl_FragColor = vec4(c * 0.085 * k, 1.0);
        }`,
      side: THREE.BackSide,
      transparent: false,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    // ecliptic -> equatorial: rotate about X by +obliquity
    const e = (23.43928 * Math.PI) / 180;
    (this.mwMat.uniforms.toEq.value as THREE.Matrix3).set(1, 0, 0, 0, Math.cos(e), -Math.sin(e), 0, Math.sin(e), Math.cos(e));
    const mw = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.mwMat);
    mw.frustumCulled = false;
    mw.renderOrder = -11;
    this.group.add(mw, pts);
  }

  /**
   * Put the sky round the camera. `frame` maps ecliptic directions into the
   * scene's axes (identity for heliocentric scenes).
   */
  update(camera: THREE.Camera, frame?: THREE.Quaternion): void {
    this.group.position.copy(camera.getWorldPosition(_v));
    if (frame) this.group.quaternion.copy(frame);
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    this.mat.uniforms.px.value = dpr;
    this.mat.uniforms.k.value = this.brightness;
    this.mwMat.uniforms.k.value = this.brightness;
    // the sky is 1000 units out: keep it inside the camera's far plane
    const pc = camera as THREE.PerspectiveCamera;
    const s = pc.far ? Math.min(1, (pc.far * 0.5) / 1000) : 1;
    this.group.scale.setScalar(s);
  }
}
const _v = new THREE.Vector3();
