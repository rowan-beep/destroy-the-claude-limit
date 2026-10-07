// The solar system on screen, at its real scale. Every planet and the major
// moons sit where the ephemerides put them, turned on their real poles and
// spinning at their real rates, lit by the Sun at the centre: day and night
// sides, a soft terminator, limb darkening on the gas giants, a glowing rim
// where there is air. Saturn's rings throw their shadow on the planet and the
// planet throws its shadow across the rings. From far off, each world is the
// point of light it really is, so Jupiter shines in the black and Neptune is
// a faint blue star.
//
// Everything is placed relative to the camera (a floating origin), so a probe
// a metre long and a planet 140,000 km across share one scene. A second,
// shrunken copy (the map) shows the whole system from above with the orbits.

import * as THREE from 'three';
import { BODIES, BodyId, ALL_BODIES, PLANETS, bodyPos, equatorOf, spinAngle, planetState } from './bodies';
import { planetTexture, ringTexture } from './planetTex';
import { StarSky } from './sky';
import { AU, Vec, vlen, vsub } from '../mars/marsPhysics';

const PLANET_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
varying vec2 vUv;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

const PLANET_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 sunDir;
uniform float sunI;
uniform vec3 atmo;
uniform float atmoK;
uniform float limb;
uniform float emissive;
uniform vec3 tint;
// Saturn: the rings' plane and extent, to shade the planet under them
uniform vec3 ringN;
uniform vec3 center;
uniform vec2 ringR;
uniform sampler2D ringTex;
uniform float hasRing;
varying vec3 vN;
varying vec3 vP;
varying vec2 vUv;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 alb = texture2D(map, vUv).rgb * tint;
  if (emissive > 0.0) {
    // the Sun: limb-darkened, and far brighter than anything it lights
    vec3 vv = normalize(cameraPosition - vP);
    float mu = max(0.0, dot(normalize(vN), vv));
    float ld = 0.35 + 0.65 * pow(mu, 0.6);
    gl_FragColor = vec4(alb * emissive * ld * vec3(1.0, 0.9, 0.75), 1.0);
    return;
  }
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vP);
  float ndl = dot(n, sunDir);
  // a soft terminator (light wraps a little round the curve in an atmosphere)
  float wrap = atmoK > 0.5 ? 0.12 : 0.03;
  float lit = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  lit = lit * lit * (3.0 - 2.0 * lit) * 0.35 + lit * 0.65;
  // gas giants darken toward the limb
  float mu = max(0.0, dot(n, v));
  float ld = mix(1.0, pow(mu, 0.35), limb);
  // the rings' shadow on the planet
  float sh = 1.0;
  if (hasRing > 0.5) {
    float dn = dot(sunDir, ringN);
    if (abs(dn) > 1e-4) {
      float t = dot(center - vP, ringN) / dn;
      if (t > 0.0) {
        float r = length(vP + sunDir * t - center);
        if (r > ringR.x && r < ringR.y) {
          float a = texture2D(ringTex, vec2((r - ringR.x) / (ringR.y - ringR.x), 0.5)).a;
          sh = 1.0 - a * 0.9;
        }
      }
    }
  }
  vec3 col = alb * sunI * lit * ld * sh;
  // the air: a glowing rim on the day side, a thin bright line round the night side's edge
  float rim = pow(1.0 - mu, 3.0);
  float day = smoothstep(-0.25, 0.35, ndl);
  col += atmo * atmoK * rim * day * sunI * 0.9;
  // a faint earthshine-like floor so the night side is not a hole
  col += alb * 0.004;
  gl_FragColor = vec4(col, 1.0);
}`;

const RING_VERT = /* glsl */ `
varying vec3 vP;
varying float vR;
uniform vec2 ringR;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vR = (length(position.xy) - ringR.x) / (ringR.y - ringR.x);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const RING_FRAG = /* glsl */ `
uniform sampler2D ringTex;
uniform vec3 sunDir;
uniform vec3 ringN;
uniform vec3 center;
uniform float planetR;
uniform float sunI;
uniform vec2 ringR;
varying vec3 vP;
varying float vR;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(ringTex, vec2(clamp(vR, 0.0, 1.0), 0.5));
  if (t.a < 0.01) discard;
  // the planet's shadow across the rings
  vec3 oc = vP - center;
  float b = dot(oc, sunDir);
  float c = dot(oc, oc) - planetR * planetR;
  float sh = (b < 0.0 && b * b - c > 0.0) ? 0.04 : 1.0;
  // lit face or seen from the unlit side (light diffusing through the ring)
  vec3 v = normalize(cameraPosition - vP);
  float same = sign(dot(v, ringN)) * sign(dot(sunDir, ringN));
  // (ring particles scatter brightly at any angle; seen from the unlit side, light leaks through the thinner parts)
  float k = same > 0.0 ? 1.0 : 0.55 * (1.0 - t.a) + 0.18;
  float inc = 0.7 + 0.3 * abs(dot(sunDir, ringN));
  gl_FragColor = vec4(t.rgb * sunI * sh * k * inc, t.a);
}`;

interface BodyVis {
  id: BodyId;
  /** the planet's axes, as a rotation (with its spin added each frame) */
  root: THREE.Group;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  ring?: THREE.Mesh;
  ringMat?: THREE.ShaderMaterial;
  dot: THREE.Sprite;
  /** last position (heliocentric) */
  pos: Vec;
}

export interface SolarFrame {
  jd: number;
  /** camera, heliocentric metres */
  cam: Vec;
  look: Vec;
  up: Vec;
  fov?: number;
  /** override where a body is drawn (the Mars mission's Earth and Mars stay in its own plane) */
  at?: Partial<Record<BodyId, Vec>>;
}

function dotTex(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function glowTex(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.08, 'rgba(255,250,235,0.9)');
  gr.addColorStop(0.2, 'rgba(255,225,180,0.3)');
  gr.addColorStop(0.5, 'rgba(255,200,150,0.06)');
  gr.addColorStop(1, 'rgba(255,190,140,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  // faint diffraction spikes
  g.globalCompositeOperation = 'lighter';
  for (const a of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
    g.save();
    g.translate(128, 128);
    g.rotate(a);
    const lg = g.createLinearGradient(-128, 0, 128, 0);
    lg.addColorStop(0, 'rgba(255,240,220,0)');
    lg.addColorStop(0.5, a % (Math.PI / 2) === 0 ? 'rgba(255,240,220,0.35)' : 'rgba(255,240,220,0.15)');
    lg.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = lg;
    g.fillRect(-128, -1, 256, 2);
    g.restore();
  }
  return new THREE.CanvasTexture(c);
}

export class SolarView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 1, 1e14);
  /** a group at the scene's origin for the spacecraft (the camera looks at it) */
  readonly local = new THREE.Group();
  /** light for the spacecraft: from the Sun */
  readonly sunLight = new THREE.DirectionalLight(0xfff6ea, 3.2);
  readonly sky = new StarSky();
  private vis = new Map<BodyId, BodyVis>();
  private sunGlow: THREE.Sprite;
  private sunHalo: THREE.Sprite;
  private hemi = new THREE.HemisphereLight(0x8090a0, 0x101010, 0.12);
  /** the origin of the scene, heliocentric (the spacecraft, or the camera) */
  origin: Vec = [0, 0, 0];
  /** which bodies to draw (all by default) */
  show: Set<BodyId> | null = null;
  /** a light from the nearest planet for the craft (its day side lighting the ship) */
  private bounce = new THREE.PointLight(0xffffff, 0, 0, 2);

  constructor() {
    this.scene.background = new THREE.Color(0x000000);
    this.scene.add(this.sky.group, this.local, this.sunLight, this.sunLight.target, this.hemi, this.bounce);
    const dt = dotTex();
    for (const id of ALL_BODIES) {
      const b = BODIES[id];
      const root = new THREE.Group();
      const flat = b.flat ?? 0;
      const geo = new THREE.SphereGeometry(1, id === 'sun' ? 64 : 128, id === 'sun' ? 32 : 64);
      const tex = planetTexture(b.tex);
      const gas = id === 'jupiter' || id === 'saturn' || id === 'uranus' || id === 'neptune';
      const mat = new THREE.ShaderMaterial({
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
        uniforms: {
          map: { value: tex },
          sunDir: { value: new THREE.Vector3(1, 0, 0) },
          sunI: { value: 1 },
          atmo: { value: new THREE.Color(...(b.atmo ?? [0, 0, 0])) },
          atmoK: { value: b.atmoK ?? 0 },
          limb: { value: gas ? 0.75 : id === 'venus' || id === 'titan' ? 0.4 : 0.0 },
          emissive: { value: id === 'sun' ? 30 : 0 },
          tint: { value: id === 'jupiter' ? new THREE.Color(1.15, 1.08, 1.0) : new THREE.Color(1, 1, 1) },
          ringN: { value: new THREE.Vector3(0, 0, 1) },
          center: { value: new THREE.Vector3() },
          ringR: { value: new THREE.Vector2(1, 2) },
          ringTex: { value: b.rings ? ringTexture(id as 'saturn' | 'uranus') : null },
          hasRing: { value: b.rings && id === 'saturn' ? 1 : 0 },
        },
      });
      // the sphere's own axes: prime meridian +X, north +Y (three's sphere UV), flattened at the poles
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(b.R, b.R * (1 - flat), b.R);
      mesh.frustumCulled = false;
      root.add(mesh);
      const v: BodyVis = { id, root, mesh, mat, dot: new THREE.Sprite(), pos: [0, 0, 0] };
      if (b.rings) {
        const rg = new THREE.RingGeometry(b.rings.inner, b.rings.outer, 256, 1);
        const rm = new THREE.ShaderMaterial({
          vertexShader: RING_VERT,
          fragmentShader: RING_FRAG,
          uniforms: {
            ringTex: { value: ringTexture(id as 'saturn' | 'uranus') },
            sunDir: { value: new THREE.Vector3(1, 0, 0) },
            ringN: { value: new THREE.Vector3(0, 0, 1) },
            center: { value: new THREE.Vector3() },
            planetR: { value: b.R },
            sunI: { value: 1 },
            ringR: { value: new THREE.Vector2(b.rings.inner, b.rings.outer) },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(rg, rm);
        // the ring lies in the equator: RingGeometry is in XY, the equator is the sphere's XZ
        ring.rotation.x = -Math.PI / 2;
        ring.frustumCulled = false;
        root.add(ring);
        v.ring = ring;
        v.ringMat = rm;
      }
      // the point of light it shows as from far away
      const dm = new THREE.SpriteMaterial({ map: dt, color: new THREE.Color(...b.color), sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      v.dot = new THREE.Sprite(dm);
      v.dot.renderOrder = 5;
      this.scene.add(root, v.dot);
      this.vis.set(id, v);
    }
    const gt = glowTex();
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: new THREE.Color(6, 5.4, 4.6), transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: new THREE.Color(0.9, 0.75, 0.6), sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sunGlow.renderOrder = 6;
    this.sunHalo.renderOrder = 6;
    this.scene.add(this.sunGlow, this.sunHalo);
  }

  /** heliocentric position of a body at a date (honouring overrides) */
  where(id: BodyId, f: SolarFrame): Vec {
    return f.at?.[id] ?? bodyPos(id, f.jd);
  }

  /** draw the frame: place every world round the camera */
  update(f: SolarFrame, w: number, h: number): void {
    const cam = this.camera;
    cam.aspect = w / Math.max(1, h);
    cam.fov = f.fov ?? 50;
    const o = this.origin;
    // the camera in scene coordinates (relative to the origin)
    const cr = vsub(f.cam, o);
    cam.position.set(cr[0], cr[1], cr[2]);
    cam.up.set(f.up[0], f.up[1], f.up[2]);
    const lk = vsub(f.look, o);
    cam.lookAt(lk[0], lk[1], lk[2]);
    // near/far from the nearest surface: keep depth precision where it matters
    let nearest = Infinity;
    for (const v of this.vis.values()) {
      const p = this.where(v.id, f);
      v.pos = p;
      const d = vlen(vsub(p, f.cam)) - BODIES[v.id].R;
      nearest = Math.min(nearest, d);
    }
    // (and never past whatever the camera is looking at: the spacecraft, a few hundred metres off)
    cam.near = Math.max(0.05, Math.min(1000, nearest * 0.1, vlen(vsub(f.look, f.cam)) * 0.05));
    cam.far = 1e14;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const pxPerRad = h / 2 / Math.tan((cam.fov * Math.PI) / 360);
    // sunlight: from the Sun at the heliocentric origin
    const sunRel = vsub([0, 0, 0], o);
    const sd = new THREE.Vector3(-o[0], -o[1], -o[2]).normalize();
    this.sunLight.position.copy(sd).multiplyScalar(1000);
    this.sunLight.target.position.set(0, 0, 0);
    const rAU = Math.max(0.05, vlen(o) / AU);
    // what reaches the craft: inverse square, softened so the outer planets aren't black
    this.sunLight.intensity = 3.2 * Math.min(4, Math.pow(1 / rAU, 0.8));
    let near: { id: BodyId; d: number } | null = null;
    for (const v of this.vis.values()) {
      const b = BODIES[v.id];
      const show = !this.show || this.show.has(v.id);
      const p = v.pos;
      const rel = vsub(p, o);
      const camD = vlen(vsub(p, f.cam));
      v.root.visible = show;
      v.dot.visible = false;
      if (!show) continue;
      v.root.position.set(rel[0], rel[1], rel[2]);
      // pole and spin
      const ax = equatorOf(v.id);
      const s = spinAngle(v.id, f.jd);
      const c = Math.cos(s), sn = Math.sin(s);
      // the prime meridian in the equator, turned by the spin
      const pm: Vec = [ax.x[0] * c + ax.y[0] * sn, ax.x[1] * c + ax.y[1] * sn, ax.x[2] * c + ax.y[2] * sn];
      const l90: Vec = [-ax.x[0] * sn + ax.y[0] * c, -ax.x[1] * sn + ax.y[1] * c, -ax.x[2] * sn + ax.y[2] * c];
      // sphere axes: X = prime meridian, Y = north, Z = -(longitude 90 E)
      const m4 = new THREE.Matrix4().makeBasis(new THREE.Vector3(...pm), new THREE.Vector3(...ax.z), new THREE.Vector3(-l90[0], -l90[1], -l90[2]));
      v.root.quaternion.setFromRotationMatrix(m4);
      const toSun = new THREE.Vector3(-p[0], -p[1], -p[2]);
      const dSun = toSun.length();
      toSun.normalize();
      const pr = Math.max(0.05, dSun / AU);
      // irradiance, compressed: true inverse-square would leave Neptune 900x darker than Earth
      const sunI = v.id === 'sun' ? 1 : 1.6 * Math.pow(1 / pr, 0.55);
      const u = v.mat.uniforms;
      u.sunDir.value.copy(toSun);
      u.sunI.value = sunI;
      u.center.value.set(rel[0], rel[1], rel[2]);
      const rn = new THREE.Vector3(...ax.z);
      u.ringN.value.copy(rn);
      if (b.rings) u.ringR.value.set(b.rings.inner, b.rings.outer);
      if (v.ringMat) {
        const ru = v.ringMat.uniforms;
        ru.sunDir.value.copy(toSun);
        ru.ringN.value.copy(rn);
        ru.center.value.set(rel[0], rel[1], rel[2]);
        ru.sunI.value = sunI;
      }
      // seen from far off: a point of light, fading out as the disc grows past a few pixels
      const apparent = (b.R / Math.max(1, camD)) * pxPerRad;
      if (v.id !== 'sun' && apparent < 3) {
        v.dot.visible = true;
        // the direction from the camera, put at a fixed distance in front of it (the dot sits at infinity)
        const dir = new THREE.Vector3(rel[0] - cr[0], rel[1] - cr[1], rel[2] - cr[2]).normalize();
        const at = cam.position.clone().addScaledVector(dir, Math.max(cam.near * 4, Math.min(camD * 0.5, 1e6)));
        v.dot.position.copy(at);
        // brightness: reflected light falls with the distance from the Sun and from the camera
        const mag = (b.R / 6.4e6) ** 2 * (1 / (pr * pr)) * (AU / Math.max(1e7, camD)) ** 2;
        const k = Math.max(0.12, Math.min(1.6, 0.35 + 0.22 * Math.log10(mag * 1e4 + 1)));
        const sz = (2.2 + 4 * Math.min(1, k)) / h;
        v.dot.scale.set(sz * 2, sz * 2, 1);
        (v.dot.material as THREE.SpriteMaterial).opacity = Math.min(1, k) * THREE.MathUtils.smoothstep(apparent, 3, 0.6);
      }
      if (v.id !== 'sun' && (!near || camD - b.R < near.d)) near = { id: v.id, d: camD - b.R };
    }
    // the Sun: the disc, a bloom of light, and a halo that keeps a few pixels even from Neptune
    const sv = this.vis.get('sun')!;
    const sunCam = vlen(vsub([0, 0, 0], f.cam));
    const sunApp = (BODIES.sun.R / sunCam) * pxPerRad;
    this.sunGlow.position.set(sunRel[0], sunRel[1], sunRel[2]);
    this.sunGlow.scale.setScalar(BODIES.sun.R * 9);
    this.sunGlow.visible = sv.root.visible;
    this.sunHalo.position.copy(cam.position).add(new THREE.Vector3(sunRel[0] - cr[0], sunRel[1] - cr[1], sunRel[2] - cr[2]).normalize().multiplyScalar(Math.max(cam.near * 4, 1e6)));
    const hs = Math.max(0.02, Math.min(0.5, (sunApp * 14) / h));
    this.sunHalo.scale.set(hs, hs, 1);
    (this.sunHalo.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.4 + 1.5 / Math.max(1, rAU));
    // the craft lit faintly by the nearest planet's day side
    if (near && near.d < BODIES[near.id].R * 4) {
      const p = this.vis.get(near.id)!.pos;
      const rel = vsub(p, o);
      this.bounce.position.set(rel[0], rel[1], rel[2]);
      this.bounce.intensity = 0;
      const b = BODIES[near.id];
      const col = new THREE.Color(...b.color);
      this.bounce.color.copy(col);
      // as an ambient term rather than a true point light (the distances overflow a physical light)
      this.hemi.color.copy(col).multiplyScalar(0.6);
      this.hemi.intensity = 0.25 * Math.max(0, 1 - near.d / (b.R * 4));
    } else this.hemi.intensity = 0.12;
    // stars: washed out when a bright planet fills the view or the Sun is close
    this.sky.brightness = 1;
    this.sky.update(cam);
  }

  /** screen positions of the bodies (for labels), null when behind the camera */
  project(id: BodyId, w: number, h: number): { x: number; y: number; r: number } | null {
    const v = this.vis.get(id);
    if (!v || !v.root.visible) return null;
    const p = v.root.position.clone();
    const d = p.distanceTo(this.camera.position);
    const q = p.project(this.camera);
    if (q.z > 1 || q.z < -1) return null;
    const pxPerRad = h / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    return { x: (q.x * 0.5 + 0.5) * w, y: (-q.y * 0.5 + 0.5) * h, r: (BODIES[id].R / Math.max(1, d)) * pxPerRad };
  }
}

// ---------------------------------------------------------------- the map
/** map units: one per billion metres (a million km) */
export const SOLAR_MAP = 1e-9;

/** the orbits of the planets as lines (map scale), one each */
export function orbitLines(jd: number, scale = SOLAR_MAP): THREE.Group {
  const g = new THREE.Group();
  for (const id of PLANETS) {
    const b = BODIES[id];
    const period = 365.25 * Math.pow(b.el!.a, 1.5);
    const pts: THREE.Vector3[] = [];
    const n = 360;
    for (let i = 0; i <= n; i++) {
      const r = planetState(id, jd + (period * i) / n).r;
      pts.push(new THREE.Vector3(r[0] * scale, r[1] * scale, r[2] * scale));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(...b.color).multiplyScalar(0.5), transparent: true, opacity: 0.55, depthWrite: false }));
    line.frustumCulled = false;
    g.add(line);
  }
  return g;
}
