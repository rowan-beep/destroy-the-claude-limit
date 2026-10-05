// The Moon on screen. Far off it is a full-size globe whose shader paints the
// dark basalt maria and pale highlands, the big craters with their rims and the
// bright rays of young ones, shaded by the Sun with a faint earthshine on the
// night side. Close to the surface a ground mesh is built around the point
// below the vehicle from the very same crater function the simulation lands on:
// a polar grid whose rings are a metre apart under the lander and kilometres
// apart at the horizon, coloured and shaded from the terrain itself, so the
// footpads meet the ground the physics sees. It is rebuilt as the vehicle moves
// and the globe sinks a little beneath it so neither shows through the other.

import * as THREE from 'three';
import { CONTINENT_GLSL, MOON, MOON_GLSL, MOON_OCTAVES, V3, add, cross, fromMoonFixed, len, moonAxes, moonHeight, moonMare, moonPos, norm, scale, sub, toMoonFixed } from './universe';

const MOON_VERT = /* glsl */ `
varying vec3 vP;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const MOON_FRAG = /* glsl */ `
uniform vec3 sunM;
uniform vec3 earthM;
varying vec3 vP;
#include <common>
#include <logdepthbuf_pars_fragment>
${CONTINENT_GLSL}
${MOON_GLSL}
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vP);
  float fresh;
  float h = moonCraters(d, 0, 5, fresh);
  // the surface's slope from how height and position change across neighbouring pixels
  vec3 S = d * (${MOON.R.toFixed(1)} + h * 2.0);
  vec3 n = normalize(cross(dFdx(S), dFdy(S)));
  if (dot(n, d) < 0.0) n = -n;
  n = normalize(mix(d, n, 0.85));
  float mare = moonMare(d);
  float speck = vnoise3(d * 2400.0) * 0.5 + vnoise3(d * 9000.0) * 0.5;
  float albedo = mix(0.165, 0.075, mare) * (0.85 + 0.3 * speck) + 0.09 * clamp(fresh, 0.0, 1.0);
  float mu0 = dot(n, sunM);
  float lit = max(mu0, 0.0);
  // a touch of Lommel-Seeliger: the full Moon looks flat and bright to the limb
  float ls = lit / (lit + 0.25) * 1.25;
  vec3 col = vec3(1.0, 0.985, 0.95) * albedo * mix(lit, ls, 0.5) * 3.4;
  // earthshine on the night side
  col += vec3(0.55, 0.65, 0.9) * albedo * max(dot(d, earthM), 0.0) * 0.05 * smoothstep(0.1, -0.2, dot(d, sunM));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class MoonView {
  readonly group = new THREE.Group();
  private globe: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private patch: THREE.Mesh | null = null;
  private patchMat: THREE.MeshStandardMaterial;
  /** Moon-fixed unit vector and outer radius of the ground mesh now built */
  private patchAt: { c: V3; outer: number } | null = null;

  constructor(private sunDirEci: V3) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { sunM: { value: new THREE.Vector3() }, earthM: { value: new THREE.Vector3() } },
      vertexShader: MOON_VERT,
      fragmentShader: MOON_FRAG,
    });
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(MOON.R, 384, 192), this.mat);
    this.globe.frustumCulled = false;
    this.group.add(this.globe);
    // fine regolith: pebbles, small pits and grain, tiled every few metres (colour and relief)
    const reg = (() => {
      const N = 512;
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const g = c.getContext('2d')!;
      const img = g.createImageData(N, N);
      let s = 12345;
      const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      const h = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) h[i] = r() * 0.25;
      // pits and pebbles at a few sizes
      for (let k = 0; k < 900; k++) {
        const cx = r() * N, cy = r() * N, rad = 2 + Math.pow(r(), 3) * 26, pit = r() < 0.6;
        for (let y = -rad - 2; y <= rad + 2; y++) for (let x = -rad - 2; x <= rad + 2; x++) {
          const d = Math.hypot(x, y) / rad;
          if (d > 1.3) continue;
          const xi = (Math.floor(cx + x) + N) % N, yi = (Math.floor(cy + y) + N) % N;
          h[yi * N + xi] += pit ? (d < 1 ? -(1 - d * d) * 0.8 : 0) + 0.25 * Math.exp(-(((d - 1) / 0.15) ** 2)) : Math.max(0, 1 - d * d) * 0.6;
        }
      }
      for (let i = 0; i < N * N; i++) {
        const v = Math.max(0, Math.min(255, 128 + h[i] * 110));
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      return t;
    })();
    this.patchMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, bumpMap: reg, bumpScale: 2.2, map: reg });
  }

  /** place the Moon round the floating origin; `rel` is the vehicle relative to the Moon (null when far) */
  update(origin: V3, time: number, rel: V3 | null): void {
    const mp = moonPos(time);
    const A = moonAxes(time);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...A.X), new THREE.Vector3(...A.Y), new THREE.Vector3(...A.Z)));
    this.globe.position.set(mp[0] - origin[0], mp[1] - origin[1], mp[2] - origin[2]);
    this.globe.quaternion.copy(q);
    const sm = toMoonFixed(this.sunDirEci, time);
    (this.mat.uniforms.sunM.value as THREE.Vector3).set(...sm).normalize();
    const em = toMoonFixed(scale(norm(mp), -1), time);
    (this.mat.uniforms.earthM.value as THREE.Vector3).set(...em).normalize();
    // the ground mesh while low over the surface
    const alt = rel ? len(rel) - MOON.R : Infinity;
    if (alt < 90_000 && rel) {
      const c = norm(toMoonFixed(rel, time));
      const outer = Math.max(40_000, Math.min(600_000, alt * 25 + 30_000));
      const p = this.patchAt;
      const moved = p ? len(sub(c, p.c)) * MOON.R : Infinity;
      if (!p || moved > Math.max(150, Math.min(alt * 0.9, outer * 0.1)) || outer > p.outer * 1.8 || outer < p.outer * 0.4) this.build(c, outer);
      const P0 = fromMoonFixed(scale(this.patchAt!.c, MOON.R), time);
      this.patch!.position.set(mp[0] + P0[0] - origin[0], mp[1] + P0[1] - origin[1], mp[2] + P0[2] - origin[2]);
      this.patch!.quaternion.copy(q);
      this.patch!.visible = true;
      // the globe drops just below the detailed ground so it never pokes through
      this.globe.scale.setScalar((MOON.R - 3200) / MOON.R);
    } else {
      if (this.patch) this.patch.visible = false;
      this.globe.scale.setScalar(1);
    }
  }

  /** the ground mesh: rings from under the vehicle out to `outer` metres, in the Moon-fixed frame about c */
  private build(c: V3, outer: number): void {
    const RINGS = 140, SEG = 192;
    const t1 = norm(cross(Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], c));
    const t2 = cross(c, t1);
    const rho0 = 0.6;
    const k = Math.pow(outer / rho0, 1 / (RINGS - 1));
    const nV = 1 + RINGS * SEG;
    const pos = new Float32Array(nV * 3);
    const col = new Float32Array(nV * 3);
    const uv = new Float32Array(nV * 2);
    const put = (i: number, d: V3, spacing: number) => {
      // only craters bigger than the mesh can show
      let oct = MOON_OCTAVES;
      const cells = [260, 90, 30, 10, 3.2, 1.0, 0.32, 0.1, 0.032, 0.011];
      while (oct > 2 && cells[oct - 1] * 1000 < spacing * 0.9) oct--;
      const h = moonHeight(d, oct);
      const p = sub(scale(d, MOON.R + h), scale(c, MOON.R));
      pos.set(p, i * 3);
      // texture coordinates on the local level: the regolith tiles every 6 m
      uv[i * 2] = (p[0] * t1[0] + p[1] * t1[1] + p[2] * t1[2]) / 6;
      uv[i * 2 + 1] = (p[0] * t2[0] + p[1] * t2[1] + p[2] * t2[2]) / 6;
      const mare = moonMare(d);
      const fx = Math.sin(d[0] * 91731.7 + d[1] * 45123.1 + d[2] * 77811.3) * 0.5 + 0.5;
      // the detail map averages mid-grey: lift the colour to match
      // regolith reflects almost as brightly with the Sun low as high (no Lambert darkening): lift it
      const a = (0.165 - 0.07 * mare) * (0.9 + 0.2 * fx) * 3.2;
      col.set([a * 1.0, a * 0.96, a * 0.9], i * 3);
    };
    put(0, c, rho0);
    for (let r = 0; r < RINGS; r++) {
      const rho = rho0 * Math.pow(k, r);
      const spacing = rho * (k - 1) + 0.5;
      const ang = rho / MOON.R;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (let s = 0; s < SEG; s++) {
        const th = (s / SEG) * Math.PI * 2;
        const dir = add(scale(c, ca), scale(add(scale(t1, Math.cos(th)), scale(t2, Math.sin(th))), sa));
        put(1 + r * SEG + s, norm(dir), spacing);
      }
    }
    const idx: number[] = [];
    for (let s = 0; s < SEG; s++) idx.push(0, 1 + s, 1 + ((s + 1) % SEG));
    for (let r = 0; r < RINGS - 1; r++) {
      for (let s = 0; s < SEG; s++) {
        const a = 1 + r * SEG + s, b = 1 + r * SEG + ((s + 1) % SEG);
        const c2 = a + SEG, d2 = b + SEG;
        idx.push(a, c2, b, b, c2, d2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    if (!this.patch) {
      this.patch = new THREE.Mesh(geo, this.patchMat);
      this.patch.frustumCulled = false;
      this.patch.receiveShadow = true;
      this.group.add(this.patch);
    } else {
      this.patch.geometry.dispose();
      this.patch.geometry = geo;
    }
    this.patchAt = { c, outer };
    this.scatterRocks(c, t1, t2);
  }

  // ---- rocks and pebbles strewn round the landing area, sitting half buried, casting hard shadows
  private rocks: THREE.InstancedMesh[] = [];
  private scatterRocks(c: V3, t1: V3, t2: V3): void {
    if (!this.rocks.length) {
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.36, 0.34, 0.31), roughness: 1, metalness: 0, flatShading: true });
      for (let v = 0; v < 3; v++) {
        const g = new THREE.IcosahedronGeometry(1, 1);
        const p = g.attributes.position as THREE.BufferAttribute;
        let s = 99 + v * 17;
        const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
        const bumps = Array.from({ length: 5 }, () => [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, 0.15 + r() * 0.3]);
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          let k = 0.8 + r() * 0.15;
          for (const [bx, by, bz, a] of bumps) k += a * Math.max(0, x * bx + y * by + z * bz);
          p.setXYZ(i, x * k, y * k * 0.62, z * k);
        }
        g.computeVertexNormals();
        const m = new THREE.InstancedMesh(g, mat, 1400);
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        this.rocks.push(m);
      }
    }
    // the same rocks for the same spot: seed from where we are
    let s = (Math.floor(c[0] * 1e6) * 73856093) ^ (Math.floor(c[1] * 1e6) * 19349663) ^ (Math.floor(c[2] * 1e6) * 83492791);
    const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    const up = new THREE.Vector3();
    const counts = [0, 0, 0];
    for (let i = 0; i < 4200; i++) {
      // most rocks are pebbles near the lander; a few boulders further out
      const small = i < 3000;
      const rho = small ? 2 + Math.pow(r(), 0.7) * 90 : 8 + Math.pow(r(), 0.6) * 420;
      const th = r() * Math.PI * 2;
      const ang = rho / MOON.R;
      const d = norm(add(scale(c, Math.cos(ang)), scale(add(scale(t1, Math.cos(th)), scale(t2, Math.sin(th))), Math.sin(ang))));
      const size = small ? 0.04 + Math.pow(r(), 3) * 0.3 : 0.25 + Math.pow(r(), 4) * 2.2;
      const h = moonHeight(d);
      const p = sub(scale(d, MOON.R + h - size * 0.25), scale(c, MOON.R));
      up.set(d[0], d[1], d[2]);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28));
      sc.set(size * (0.8 + r() * 0.5), size, size * (0.8 + r() * 0.5));
      pv.set(p[0], p[1], p[2]);
      m4.compose(pv, q, sc);
      const v = i % 3;
      if (counts[v] < 1400) this.rocks[v].setMatrixAt(counts[v]++, m4);
    }
    this.rocks.forEach((m, v) => {
      m.count = counts[v];
      m.instanceMatrix.needsUpdate = true;
      if (m.parent !== this.patch) this.patch!.add(m);
    });
  }
}
