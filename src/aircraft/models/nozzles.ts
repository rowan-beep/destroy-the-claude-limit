// Every jet's own exhaust nozzles, each modelled on photographs of the real thing (the note on each
// builder says what the photos show). Built in the body frame (x right, y up, z aft), fully closed
// with a morph target to fully open, like parts.ts's generic nozzle():
//
// - the outside in its own metal (nozzleSkin): the vertex colours carry each flap's tone, heat tint
//   and soot; the shader adds what is too fine for the mesh -- rows of fasteners, soot streaks running
//   aft, fine ribs -- and drops them again far off (the distance LOD has no detail coordinates)
// - the inside -- divergent flaps, burner can, flame holders, turbine -- in the burner material, which
//   lights up with the afterburner (parts.ts burnerMaterial)

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dense, lathe, P2 } from './kit';
import { NOZZLE_CLOSED, nozzleOpenK, withMorph, type NozzleSpec } from './parts';

export type RGB = [number, number, number];

/** Where a nozzle sits: its axis, where it leaves the nacelle (z0, r0), its exit (z1, r1) and the can's floor. */
export type NozzlePlace = Omit<NozzleSpec, 'petals' | 'saw' | 'bare'>;

export interface BuiltNozzle {
  outer: THREE.BufferGeometry;
  inner: THREE.BufferGeometry;
  /** exit size fully closed and fully open, relative to the place's r1 */
  area: [number, number];
  /** the outside's own material (shared by every jet of the type) */
  mat: THREE.MeshStandardMaterial;
}

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const sst = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const grey = (k: number): RGB => [k, k, k];

// ---------------------------------------------------------------------------
// The outside's metal
// ---------------------------------------------------------------------------

/** A grid of fasteners (or pads) on the flaps, drawn in the shader. */
export interface DotLayer {
  /** span along the nozzle (m from its root; past the length is inside the lip) */
  v0: number;
  v1: number;
  /** rows every `pitch` m, `cols` across each flap (a flap `w` m wide), dot radius `r` m */
  pitch: number;
  cols: number;
  w: number;
  r: number;
  /** > 0: a light dot of that grey; < 0: darkened by that much */
  k: number;
  square?: boolean;
}

export interface SkinLook {
  metal: number;
  rough: number;
  env?: number;
  /** nozzle length (m): the soot streaks thicken toward the exit */
  len: number;
  /** soot streaks running aft (0..1) */
  streak?: number;
  /** fine lengthwise ribs: count per flap, depth (0..1), only from v0 to v1 along (default everywhere) */
  ribs?: [number, number];
  ribSpan?: [number, number];
  dots?: DotLayer[];
}

const SKIN_FRAG = `
varying vec3 vNzd;
uniform float nzLen;
uniform float nzStreak;
uniform vec2 nzRibs;
uniform vec2 nzRibSpan;
uniform vec4 nzDotA;
uniform vec4 nzSpanA;
uniform vec4 nzDotB;
uniform vec4 nzSpanB;
float nzHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float nzNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( nzHash( i ), nzHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( nzHash( i + vec2( 0.0, 1.0 ) ), nzHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// a grid of dots: D = ( pitch, columns per flap, radius, k ), S = ( v0, v1, flap width, square )
vec3 nzDots( vec3 col, float f, float v, vec4 D, vec4 S ) {
  if ( D.w == 0.0 || v < S.x || v > S.y ) return col;
  float dv = ( fract( ( v - S.x ) / D.x ) - 0.5 ) * D.x;
  float df = ( fract( f * D.y ) - 0.5 ) / D.y * S.z;
  float d = S.w > 0.5 ? max( abs( dv ) * 0.55, abs( df ) ) : length( vec2( dv, df ) );
  float aa = fwidth( d ) + 1e-5;
  // (sharp near, fading out once a dot is smaller than a pixel or two: no shimmer far off)
  float m = ( 1.0 - smoothstep( D.z - aa, D.z + aa, d ) ) * ( 1.0 - smoothstep( D.z * 0.5, D.z * 1.5, aa ) );
  return D.w > 0.0 ? mix( col, vec3( D.w ), m ) : col * ( 1.0 + D.w * m );
}`;

const SKIN_COLOR = `#include <color_fragment>
  if ( vNzd.z > 0.5 ) {
    float nzF = fract( vNzd.x );
    // soot streaks: the exhaust's eddies comb the soot aft in streaks, heavier toward the exit
    float sn = nzNoise( vec2( vNzd.x * 6.0, vNzd.y * 1.6 ) ) * 0.6 + nzNoise( vec2( vNzd.x * 21.0, vNzd.y * 5.0 ) ) * 0.4;
    diffuseColor.rgb *= 1.0 - nzStreak * smoothstep( 0.45, 0.9, sn ) * ( 0.3 + 0.7 * clamp( vNzd.y / nzLen, 0.0, 1.0 ) );
    if ( nzRibs.x > 0.0 && vNzd.y >= nzRibSpan.x && vNzd.y <= nzRibSpan.y ) {
      float rf = nzF * nzRibs.x;
      float rb = abs( fract( rf ) - 0.5 ) * 2.0;
      diffuseColor.rgb *= 1.0 + nzRibs.y * ( rb * 2.0 - 1.0 ) * ( 1.0 - smoothstep( 0.15, 0.5, fwidth( rf ) ) );
    }
    diffuseColor.rgb = nzDots( diffuseColor.rgb, nzF, vNzd.y, nzDotA, nzSpanA );
    diffuseColor.rgb = nzDots( diffuseColor.rgb, nzF, vNzd.y, nzDotB, nzSpanB );
  }`;

function dotUniforms(d: DotLayer | undefined): [THREE.Vector4, THREE.Vector4] {
  if (!d) return [new THREE.Vector4(1, 1, 0, 0), new THREE.Vector4(1e6, -1e6, 1, 0)];
  return [new THREE.Vector4(d.pitch, d.cols, d.r, d.k), new THREE.Vector4(d.v0, d.v1, d.w, d.square ? 1 : 0)];
}

/** The outside of a nozzle: vertex-coloured metal with the fine detail drawn in the shader. One program for every jet. */
export function nozzleSkin(look: SkinLook): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: look.rough, metalness: look.metal, envMapIntensity: look.env ?? 1 });
  const [a, sa] = dotUniforms(look.dots?.[0]);
  const [b, sb] = dotUniforms(look.dots?.[1]);
  const u = {
    nzLen: { value: look.len },
    nzStreak: { value: look.streak ?? 0 },
    nzRibs: { value: new THREE.Vector2(...(look.ribs ?? [0, 0])) },
    nzRibSpan: { value: new THREE.Vector2(...(look.ribSpan ?? [-1e6, 1e6])) },
    nzDotA: { value: a },
    nzSpanA: { value: sa },
    nzDotB: { value: b },
    nzSpanB: { value: sb },
  };
  m.userData.nozzleSkin = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 nzd;\nvarying vec3 vNzd;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNzd = nzd;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SKIN_FRAG).replace('#include <color_fragment>', SKIN_COLOR);
  };
  m.customProgramCacheKey = () => 'nozzle-skin-v1';
  return m;
}

const skins = new Map<string, THREE.MeshStandardMaterial>();
function skin(name: string, look: SkinLook): THREE.MeshStandardMaterial {
  let m = skins.get(name);
  if (!m) skins.set(name, (m = nozzleSkin(look)));
  return m;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/**
 * Points round the nozzle axis ring by ring (every ring the same count), skinned in order. Rings
 * walking aft with the points counter-clockwise (seen from behind) face outward; walking forward
 * (into the nozzle), inward.
 */
class Shell {
  private pos: number[] = [];
  private col: number[] = [];
  private det: number[] = [];
  private count = 0;
  constructor(
    readonly cx: number,
    readonly cy: number,
    readonly n: number,
    readonly detail = true,
  ) {}
  /** a point: angle, radius, z, colour, and its detail coordinate (a: across the flaps, v: m along, w: detail on) */
  at(ang: number, r: number, z: number, c: RGB, a = 0, v = 0, w = 1): void {
    this.pos.push(this.cx + Math.cos(ang) * r, this.cy + Math.sin(ang) * r, z);
    this.col.push(c[0], c[1], c[2]);
    this.det.push(a, v, w);
    this.count++;
  }
  geometry(): THREE.BufferGeometry {
    const n = this.n;
    const rows = this.count / n;
    if (!Number.isInteger(rows)) throw new Error('nozzle shell: ragged ring');
    const idx: number[] = [];
    for (let i = 0; i < rows - 1; i++)
      for (let j = 0; j < n; j++) {
        const a = i * n + j, b = i * n + ((j + 1) % n), c = a + n, d = b + n;
        idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.detail) g.setAttribute('nzd', new THREE.Float32BufferAttribute(this.det, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
}

/** A small solid part in one colour, carrying the attributes the shells carry. */
function solid(g: THREE.BufferGeometry, c: RGB, detail = true): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (detail) g.setAttribute('nzd', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  return g;
}

/** A box on the nozzle at angle `ang`: `w` across, `h` radially (its base at radius r), `l` along, centred on z. */
function boxAt(s: NozzleSpec, ang: number, r: number, z: number, w: number, h: number, l: number, c: RGB, detail = true, tilt = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(0, h / 2, 0);
  if (tilt) g.rotateX(tilt);
  g.rotateZ(ang - Math.PI / 2);
  g.translate(s.cx + Math.cos(ang) * r, s.cy + Math.sin(ang) * r, z);
  return solid(g, c, detail);
}

/** Radius factor across a flat plate spanning one of `n` flaps (1 at its edges, cos(pi/n) mid-plate), mixed with round by `flat`. */
function plate(f: number, n: number, flat: number): number {
  const half = Math.PI / n;
  return lerp(1, Math.cos(half) / Math.cos((f - 0.5) * 2 * half), flat);
}

/**
 * Cutting a flap's trailing edge back by d (m, up to D at most) at u: spread over the last D of the
 * length, so however close the rings are (the hero build has many) none is pushed behind the one
 * before it -- the deepest-cut points close up to one ring there instead.
 */
function tipCut(d: number, D: number, L: number, u: number): number {
  const ua = 1 - D / L;
  return -d * clamp01((u - ua) / (1 - ua));
}

interface Point {
  ang: number;
  r: number;
  z: number;
  a: number;
}

interface FlapRun {
  /** flaps round, points across each */
  n: number;
  per: number;
  /** from u0 to u1 (fractions of the nozzle's length) in `rows` steps (or at the listed u) */
  u0: number;
  u1: number;
  rows: number | number[];
  /** radius at u */
  r: (u: number) => number;
  /** 0 round .. 1 flat plates */
  flat?: number;
  /** where point k sits across its flap (default k / per) */
  fpos?: (k: number, u: number) => number;
  /** added radius (m) and z (m) at fraction f across flap i */
  dr?: (f: number, u: number, i: number) => number;
  dz?: (f: number, u: number, i: number) => number;
  /** the whole pattern turned by this many flaps at u (a jog in the seams) */
  turn?: (u: number) => number;
  col: (u: number, f: number, i: number) => RGB;
  /** detail on (1) or off (0) */
  w?: number;
}

/** Rings of flaps (or a plain band laid out on the same points); returns the last ring's points. */
function flaps(sh: Shell, s: NozzleSpec, o: FlapRun): Point[] {
  const L = s.z1 - s.z0;
  const us = Array.isArray(o.rows) ? o.rows : Array.from({ length: o.rows + 1 }, (_, q) => lerp(o.u0, o.u1, q / (o.rows as number)));
  let last: Point[] = [];
  for (const u of us) {
    const r = o.r(u);
    const turn = o.turn?.(u) ?? 0;
    last = [];
    for (let i = 0; i < o.n; i++)
      for (let k = 0; k < o.per; k++) {
        const f = o.fpos ? o.fpos(k, u) : k / o.per;
        const ang = ((i + f + turn) / o.n) * TAU;
        const rr = r * plate(f, o.n, o.flat ?? 0) + (o.dr?.(f, u, i) ?? 0);
        const z = s.z0 + L * u + (o.dz?.(f, u, i) ?? 0);
        sh.at(ang, rr, z, o.col(u, f, i), i + f, L * u, o.w ?? 1);
        last.push({ ang, r: rr, z, a: i + f });
      }
  }
  return last;
}

/** The lip rolling in from the exit ring: [radius factor, dz, colour] per ring after it. */
function lipRoll(sh: Shell, s: NozzleSpec, ex: Point[], steps: [number, number, RGB][]): void {
  const L = s.z1 - s.z0;
  for (const [kr, dz, c] of steps) for (const p of ex) sh.at(p.ang, (p.r - 0) * kr, p.z + dz, c, p.a, L + Math.max(0, -dz), 1);
}

/** Inside the lip: the divergent flaps from just inside the exit to the throat, `depth` m in, in the burner material. */
interface Interior {
  n: number;
  per: number;
  /** radius just inside the lip and at the throat */
  rLip: number;
  rThroat: number;
  depth: number;
  rows: number;
  /** z where the flaps start (just inside the lip) */
  zLip: number;
  /** colour at fraction f across segment i, t 0 (lip) .. 1 (throat) */
  col: (f: number, i: number, t: number) => RGB;
  flat?: number;
  /** the rows' radius between lip and throat (t 0..1 -> 0..1) */
  shape?: (t: number) => number;
}
function interior(s: NozzleSpec, o: Interior): { geo: THREE.BufferGeometry; z: number } {
  const sh = new Shell(s.cx, s.cy, o.n * o.per, false);
  for (let q = 0; q <= o.rows; q++) {
    const t = q / o.rows;
    const r = lerp(o.rLip, o.rThroat, o.shape ? o.shape(t) : t);
    const z = o.zLip - o.depth * t;
    for (let i = 0; i < o.n; i++)
      for (let k = 0; k < o.per; k++) {
        const f = k / o.per;
        sh.at(((i + f) / o.n) * TAU, r * plate(f, o.n, o.flat ?? 0), z, o.col(f, i, t));
      }
  }
  return { geo: sh.geometry(), z: o.zLip - o.depth };
}

/** The burner can's look: flame holders, liner, turbine. */
interface CanLook {
  /** radial flame-holder gutters and their (linear) grey */
  spokes: number;
  spokeCol?: number;
  spokeR?: number;
  /** concentric V-gutter rings (fractions of the can radius) and their grey */
  rings?: number[];
  ringCol?: number;
  /** liner rings (count) and their grey: a corrugated liner */
  liner?: number;
  linerCol?: number;
  /** the turbine's exit cone: grey, and a lighter ring round it */
  cone?: number;
  coneRing?: number;
  /** flame holder depth: fraction of the can from the floor */
  holderAt?: number;
}

/**
 * The burner can behind the divergent flaps: the liner from (rA, zA) back to the floor, the flame
 * holders, the turbine exit cone and the dark face behind it. (Burner material: the flame holders
 * are told apart from the liner by their lighter colour, so keep the liner below 0.035 red deep in.)
 */
function burnerCan(s: NozzleSpec, rA: number, zA: number, o: CanLook): THREE.BufferGeometry[] {
  const seg = 48;
  const zF = s.floor ?? s.z0 - 1.6;
  const capped = s.floor !== undefined;
  const deep = s.z1 - zF;
  const rC = s.r0 * (capped ? 0.84 : 0.9);
  const prof: P2[] = capped
    ? [
        [rA, zA],
        [lerp(rA, rC, 0.45), lerp(zA, zF, 0.5)],
        [rC, zF + 0.01],
      ]
    : [
        [rA, zA],
        [lerp(rA, rC, 0.6), lerp(zA, s.z0, 0.6)],
        [rC, s.z0 - 0.05],
        [rC, s.z0 - 1.1],
        [s.r0 * 0.86, s.z0 - 1.6],
      ];
  const liner = lathe(prof, seg, s.cx, s.cy);
  const lc = new Float32Array(liner.attributes.position.count * 3);
  const lp = liner.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const d = (s.z1 - lp.getZ(i)) / deep;
    const k = 0.012 + 0.05 * Math.exp(-d * 4);
    lc.set([k, k * 0.94, k * 0.86], i * 3);
  }
  liner.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  const parts: THREE.BufferGeometry[] = [solid(liner, [0, 0, 0], false)];
  // (solid() recoloured it: put the liner's own colours back)
  parts[0].setAttribute('color', new THREE.BufferAttribute(lc, 3));
  const zCan = capped ? zF : s.z0 - 1.6;
  // liner rings: a corrugated liner's bands
  for (let k = 0; k < (o.liner ?? 0); k++) {
    const t = (k + 0.5) / (o.liner ?? 1);
    const z = lerp(zA - 0.02, zCan + 0.08, t);
    const r = lerp(rA, rC, Math.min(1, (zA - z) / Math.max(0.01, zA - zCan) * 1.6)) * 0.985;
    const g = new THREE.TorusGeometry(r, 0.008, 4, seg);
    g.translate(s.cx, s.cy, z);
    parts.push(solid(g, grey(o.linerCol ?? 0.025), false));
  }
  // flame holders: concentric V-gutters and radial gutters
  const zH = capped ? zF + Math.max(0.08, (o.holderAt ?? 0.12) * deep) : s.z0 - 1.25;
  const hc = o.ringCol ?? 0.05;
  for (const rr of o.rings ?? [0.35, 0.62]) {
    const g = new THREE.TorusGeometry(rC * rr, 0.02, 5, seg);
    g.translate(s.cx, s.cy, zH);
    parts.push(solid(g, [hc, hc * 0.94, hc * 0.88], false));
  }
  const sc = o.spokeCol ?? 0.045;
  for (let k = 0; k < o.spokes; k++) {
    const a = (k / o.spokes) * TAU;
    const r0 = rC * 0.14, r1 = rC * (o.spokeR ?? 0.9);
    const g = new THREE.BoxGeometry(0.03, r1 - r0, 0.05);
    g.translate(0, (r0 + r1) / 2, 0);
    g.rotateZ(a - Math.PI / 2);
    g.translate(s.cx, s.cy, zH);
    parts.push(solid(g, [sc, sc * 0.95, sc * 0.9], false));
  }
  // the turbine's exit cone (with a lighter ring round its base) and the dark face behind
  const cz = capped ? zF : s.z0 - 1.55;
  const cone = lathe(
    [
      [0.001, cz + 0.3],
      [rC * 0.17, cz + 0.15],
      [rC * 0.24, cz + 0.02],
    ],
    24,
    s.cx,
    s.cy,
  );
  parts.push(solid(cone, grey(o.cone ?? 0.025), false));
  if (o.coneRing) {
    const g = new THREE.TorusGeometry(rC * 0.25, 0.012, 4, 32);
    g.translate(s.cx, s.cy, cz + 0.04);
    parts.push(solid(g, grey(o.coneRing), false));
  }
  const disc = new THREE.CircleGeometry(rC * 1.01, seg);
  disc.translate(s.cx, s.cy, cz + 0.005);
  parts.push(solid(disc, grey(0.008), false));
  return parts;
}

function merge(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(gs, false);
  if (!g) throw new Error('nozzle: parts do not merge');
  return g;
}

type Shape = (s: NozzleSpec, open: number) => { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry };

/** Build the nozzle closed and open (same topology) and morph between them. */
function morphing(p: NozzlePlace, shape: Shape, mat: THREE.MeshStandardMaterial, area?: [number, number]): BuiltNozzle {
  const s: NozzleSpec = { ...p, petals: 0, saw: 0 };
  const [kc, ko] = area ?? [NOZZLE_CLOSED, nozzleOpenK(s)];
  const a = shape({ ...s, r1: s.r1 * kc }, 0);
  const b = shape({ ...s, r1: s.r1 * ko }, 1);
  for (const [x, y] of [
    [a.outer, b.outer],
    [a.inner, b.inner],
  ])
    if (x.attributes.position.count !== y.attributes.position.count) throw new Error('nozzle: closed and open shapes differ');
  return { outer: withMorph(a.outer, b.outer), inner: withMorph(a.inner, b.inner), area: [kc, ko], mat };
}

// ---------------------------------------------------------------------------
// F-15EX Eagle II: General Electric F110-GE-129
// ---------------------------------------------------------------------------

/**
 * From the photos (the F-15EX's first flight from astern, F110-GE-129 nozzle sets for the F-15K / SG /
 * QA / EX, GE's own rear view of the F110, an F110 close-up): where the nozzle leaves the body a
 * black sync-ring band with a row of fasteners; then fourteen wide, flat outer flaps of dull grey
 * metal, each lapping over the next with a small step and ending in a stepped notch, the divergent
 * flaps' hinge blocks showing in the gaps at the exit; inside the lip a ring of pale heat-stained
 * seal tiles, then the dark can with the F110's many radial flame-holder gutters.
 */
export function nozzleF15EX(p: NozzlePlace): BuiltNozzle {
  const L = p.z1 - p.z0;
  const vis = (p.floor ?? p.z0) - p.z0; // where it comes out of the body (m from the root)
  const band = vis + 0.12;
  const mat = skin('F15EX', {
    metal: 0.5,
    rough: 0.56,
    len: L,
    streak: 0.4,
    dots: [{ v0: vis + 0.03, v1: band - 0.03, pitch: 0.06, cols: 5, w: 0.27, r: 0.0065, k: 0.13 }],
  });
  return morphing(
    p,
    (s) =>
      f110Shape(s, {
        band,
        flapCol: [0.17, 0.172, 0.18],
        bandCol: grey(0.028),
        tile: [0.27, 0.255, 0.23],
        hinge: grey(0.04),
        notch: 0.045,
        can: { spokes: 24, spokeR: 0.88, rings: [0.55], cone: 0.03 },
      }),
    mat,
  );
}

// ---------------------------------------------------------------------------
// F-16C Block 50: General Electric F110-GE-129
// ---------------------------------------------------------------------------

/**
 * From the photos (a Viper walkaround's close-up of the F110 from the side and behind, an F-16 dead
 * astern, the F110 close-up): the same engine as the F-15EX but dressed differently -- only a thin
 * dark joint band at the end of the fuselage, then long outer flaps of POLISHED metal that mirror
 * the ramp and the sky, with the F110's stepped tips; inside the lip a ring of golden-tan,
 * heat-stained seal tiles; deep in, a lattice of two flame-holder rings and radial gutters round the
 * turbine cone, which has a light ring round it.
 */
export function nozzleF16(p: NozzlePlace): BuiltNozzle {
  const L = p.z1 - p.z0;
  const vis = (p.floor ?? p.z0) - p.z0;
  const mat = skin('F16C', { metal: 0.9, rough: 0.24, len: L, streak: 0.22 });
  return morphing(
    p,
    (s) =>
      f110Shape(s, {
        band: vis + 0.045,
        flapCol: [0.56, 0.555, 0.54],
        bandCol: grey(0.05),
        tile: [0.44, 0.34, 0.19],
        hinge: grey(0.05),
        notch: 0.05,
        vary: 0.1,
        can: { spokes: 20, spokeR: 0.92, rings: [0.38, 0.7], cone: 0.03, coneRing: 0.16 },
      }),
    mat,
  );
}

interface F110Look {
  /** where the black band ends (m from the root) */
  band: number;
  bandCol: RGB;
  flapCol: RGB;
  /** the seal tiles inside the lip */
  tile: RGB;
  hinge: RGB;
  /** how far back each flap's stepped corner is cut (m) */
  notch: number;
  /** flap tone variation */
  vary?: number;
  can: CanLook;
}

/** The F110's nozzle (F-15EX and F-16C): see nozzleF15EX and nozzleF16. */
function f110Shape(s: NozzleSpec, o: F110Look): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const L = s.z1 - s.z0;
  const N = 14, per = dense(8);
  const out = new Shell(s.cx, s.cy, N * per);
  const uB = o.band / L;
  const vary = o.vary ?? 0.2;
  // the band: black, standing a hair proud, its trailing edge stepping down onto the flaps
  flaps(out, s, {
    n: N,
    per,
    u0: 0,
    u1: uB,
    rows: [0, 0.02, uB * 0.5, uB - 0.012, uB - 0.003, uB],
    r: (u) => s.r0 * (u >= uB - 0.001 ? 0.968 : u > uB - 0.005 ? 0.99 : 1.003),
    col: (u) => mul(o.bandCol, u > uB - 0.005 ? 0.6 : 1),
  });
  // the flaps: flat plates converging to the exit, each a little proud of the next (the lap step and
  // its shadow line), the trailing corner cut back in a step
  const rF = s.r0 * 0.965;
  const rows = dense(10);
  const uS = uB + 0.004;
  const notchF = (f: number) => sst(0.68, 0.74, f);
  const ex = flaps(out, s, {
    n: N,
    per,
    u0: uS,
    u1: 1,
    rows,
    r: (u) => {
      const t = (u - uS) / (1 - uS);
      return lerp(rF, s.r1, t * 0.55 + t * t * 0.45);
    },
    flat: 0.85,
    dr: (f, u) => (u > uS ? 0.006 * f : 0),
    dz: (f, u) => tipCut(o.notch * notchF(f), o.notch, L, u),
    col: (u, f, i) => {
      const k = 1 - vary / 2 + vary * hash(i + 31);
      const lap = f < 0.035 ? 0.4 : 1;
      const soot = 1 - 0.35 * sst(0.75, 1, u);
      return mul(o.flapCol, k * lap * soot);
    },
  });
  // the lip rolls in, sooty
  lipRoll(out, s, ex, [
    [0.988, 0.008, grey(0.05)],
    [0.962, -0.004, grey(0.035)],
  ]);
  const parts = [out.geometry()];
  // the divergent flaps' hinge blocks, showing in the notches between the flap tips (under the flaps'
  // line, not standing proud of it)
  for (let i = 0; i < N; i++) {
    const a = ((i - 0.12) / N) * TAU;
    parts.push(boxAt(s, a, s.r1 * 0.93, s.z1 - 0.03, 0.03, s.r1 * 0.06, 0.05, o.hinge));
  }
  // inside: the divergent flaps and their seals (pale, heat-stained tiles with dark seams), darkening in
  const zl = s.z1 - 0.004;
  const div = interior(s, {
    n: N * 2,
    per: dense(4),
    rLip: s.r1 * 0.962,
    rThroat: s.r1 * 0.9,
    depth: 0.3,
    rows: dense(4),
    zLip: zl,
    flat: 0.6,
    col: (f, i, t) => {
      const seam = f < 0.08 ? 0.25 : 1;
      const k = (0.85 + 0.3 * hash(i * 7 + 3)) * seam * (1 - 0.75 * t);
      return mul(o.tile, k);
    },
  });
  const can = burnerCan(s, s.r1 * 0.9, div.z, o.can);
  return { outer: merge(parts), inner: merge([div.geo, ...can]) };
}

// ---------------------------------------------------------------------------
// F/A-18E/F Super Hornet: General Electric F414-GE-400
// ---------------------------------------------------------------------------

/**
 * From the photos (a VFA-31 Super Hornet walkaround: the nozzles from behind, from the side and into
 * the exit; F414 nozzle sets): a narrow dark seal where the nacelle ends, then a big smooth BOAT-TAIL
 * of twelve wide outer flaps, each a slightly pillowed plate of satin gunmetal lapping over the next
 * like a scale, curving in harder toward the exit; a thick dark rim; inside, near-black flat
 * divergent flaps each carrying three small white pads in a row (the Super Hornet's give-away), a
 * liner of tight bright cooling rings, and the radial flame holders deep in.
 */
export function nozzleFA18(p: NozzlePlace): BuiltNozzle {
  const L = p.z1 - p.z0;
  const mat = skin('FA18EF', { metal: 0.75, rough: 0.38, len: L, streak: 0.3 });
  return morphing(p, (s) => f414HornetShape(s), mat);
}

function f414HornetShape(s: NozzleSpec): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const L = s.z1 - s.z0;
  const N = 12, per = dense(9);
  const out = new Shell(s.cx, s.cy, N * per);
  const vis = (s.floor ?? s.z0) - s.z0;
  const uSeal = (vis + 0.035) / L;
  const seal: RGB = grey(0.035);
  // the seal band where the nacelle ends
  flaps(out, s, {
    n: N,
    per,
    u0: 0,
    u1: uSeal,
    rows: [0, uSeal * 0.5, uSeal - 0.004, uSeal],
    r: (u) => s.r0 * (u >= uSeal - 0.001 ? 0.975 : 1.002),
    col: () => seal,
  });
  // the boat-tail: wide pillowed plates, each lapping the next, curving in harder toward the exit
  const rF = s.r0 * 0.985;
  const uS = uSeal + 0.004;
  const metal: RGB = [0.3, 0.31, 0.33];
  const ex = flaps(out, s, {
    n: N,
    per,
    u0: uS,
    u1: 1,
    rows: dense(12),
    r: (u) => {
      const t = (u - uS) / (1 - uS);
      return lerp(rF, s.r1, Math.pow(t, 1.6));
    },
    flat: 0.7,
    dr: (f, u) => (u > uS ? 0.011 * Math.sin(Math.PI * f) * sst(uS, uS + 0.12, u) + 0.006 * f : 0),
    col: (u, f, i) => {
      const k = 0.9 + 0.2 * hash(i + 77);
      const lap = f < 0.03 ? 0.35 : 1;
      const soot = 1 - 0.4 * sst(0.7, 1, u);
      // (a faint warm tint on the lower flaps, which run hotter in the photos)
      const warm = mix(metal, [0.33, 0.31, 0.29], hash(i + 5) * 0.6);
      return mul(warm, k * lap * soot);
    },
  });
  // the thick dark rim
  lipRoll(out, s, ex, [
    [1.012, 0.008, grey(0.04)],
    [1.0, 0.02, grey(0.03)],
    [0.97, 0.014, grey(0.03)],
    [0.955, 0.0, grey(0.025)],
  ]);
  // inside: near-black flat divergent flaps and seals, the flaps with three white pads each
  const zl = s.z1 - 0.002;
  const depth = 0.3;
  const rLip = s.r1 * 0.955, rTh = s.r1 * 0.88;
  const div = interior(s, {
    n: N * 2,
    per: dense(3),
    rLip,
    rThroat: rTh,
    depth,
    rows: dense(4),
    zLip: zl,
    flat: 0.9,
    col: (f, i, t) => {
      const sealSeg = i % 2 === 1;
      const k = (sealSeg ? 0.022 : 0.032) * (f < 0.06 ? 0.5 : 1) * (1 - 0.4 * t);
      return grey(k);
    },
  });
  const inner: THREE.BufferGeometry[] = [div.geo];
  for (let i = 0; i < N; i++) {
    const a = ((2 * i + 0.5) / (2 * N)) * TAU;
    for (const d of [0.06, 0.14, 0.22]) {
      const r = lerp(rLip, rTh, d / depth) * Math.cos(Math.PI / (2 * N)) * 0.985;
      inner.push(boxAt(s, a, r, zl - d, 0.04, 0.003, 0.032, [0.6, 0.6, 0.58], false));
    }
  }
  inner.push(...burnerCan(s, rTh, div.z, { spokes: 18, spokeR: 0.9, rings: [0.6], liner: 14, linerCol: 0.07, cone: 0.03 }));
  return { outer: out.geometry(), inner: merge(inner) };
}

// ---------------------------------------------------------------------------
// Eurofighter Typhoon: Eurojet EJ200
// ---------------------------------------------------------------------------

/**
 * From the photos (a parked Typhoon from the side and dead astern, Eurofighter's own EJ200 pictures):
 * a plain light ring where the nacelle ends, then fourteen narrow light-grey outer flaps. Parked (open)
 * the nozzle flares out like a trumpet, wider at the exit than the nacelle, and between the flaps
 * open big dark TRIANGULAR GAPS -- nothing at the root, wide at the exit -- through which the dark
 * divergent flaps show; closed (in flight, at military power) the gaps close up to seams. A small
 * hinge lug at each flap tip beads the rim. Inside: a dark sooty funnel with light streaks, a thin
 * lighter ring at the throat, and deep in sixteen LIGHT radial flame-holder vanes round a dark cone.
 */
export function nozzleTyphoon(p: NozzlePlace): BuiltNozzle {
  const L = p.z1 - p.z0;
  const mat = skin('TYPHOON', { metal: 0.6, rough: 0.45, len: L, streak: 0.25 });
  // open, the exit is a good tenth wider than the nacelle (the flare in the photos)
  const open = (p.r0 * 1.1) / p.r1;
  return morphing(p, (s, o) => ej200Shape(s, o), mat, [NOZZLE_CLOSED, open]);
}

function ej200Shape(s: NozzleSpec, open: number): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const L = s.z1 - s.z0;
  const N = 14, per = Math.max(8, dense(9));
  const out = new Shell(s.cx, s.cy, N * per);
  const vis = (s.floor ?? s.z0) - s.z0;
  const uR = (vis + 0.05) / L;
  const ring: RGB = [0.3, 0.3, 0.31];
  // the plain ring where the nacelle ends (its own points laid out as the flaps' are)
  const rF = s.r0 * 0.965;
  const uS = uR + 0.004;
  const gap = (u: number) => {
    const t = clamp01((u - uS) / (1 - uS));
    return 0.02 + (open ? 0.38 * Math.pow(t, 1.15) : 0.03 * t);
  };
  const E = 0.006;
  const fpos = (k: number, u: number) => {
    const g = gap(u);
    if (k === 0) return 0;
    if (k === 1) return g / 2;
    if (k === per - 1) return 1 - g / 2;
    if (k === 2) return g / 2 + E;
    if (k === per - 2) return 1 - g / 2 - E;
    return lerp(g / 2 + E, 1 - g / 2 - E, (k - 2) / (per - 4));
  };
  const sunk = (f: number, u: number) => {
    const g = gap(u);
    return f <= g / 2 + 1e-6 || f >= 1 - g / 2 - 1e-6;
  };
  flaps(out, s, {
    n: N,
    per,
    u0: 0,
    u1: uR,
    rows: [0, uR * 0.5, uR - 0.004, uR],
    fpos,
    r: (u) => s.r0 * (u >= uR - 0.001 ? 0.975 : 1.0),
    col: (u) => mul(ring, u >= uR - 0.001 ? 0.45 : 1),
  });
  const rAt = (u: number) => {
    const t = (u - uS) / (1 - uS);
    return lerp(rF, s.r1, t * 0.7 + t * t * 0.3);
  };
  const flapCol: RGB = [0.36, 0.36, 0.37];
  const ex = flaps(out, s, {
    n: N,
    per,
    u0: uS,
    u1: 1,
    rows: dense(10),
    fpos,
    r: rAt,
    flat: 0.6,
    dr: (f, u) => (sunk(f, u) ? -rAt(u) * 0.09 * sst(uS, uS + 0.15, u) : 0),
    col: (u, f, i) => {
      if (sunk(f, u)) return grey(0.03);
      const k = 0.9 + 0.2 * hash(i + 13);
      return mul(flapCol, k * (1 - 0.35 * sst(0.8, 1, u)));
    },
  });
  lipRoll(out, s, ex, [
    [0.99, 0.006, grey(0.06)],
    [0.965, -0.004, grey(0.04)],
  ]);
  const parts = [out.geometry()];
  // the hinge lugs beading the rim, one on each flap tip
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * TAU;
    parts.push(boxAt(s, a, s.r1 * Math.cos(Math.PI / N) * 0.99, s.z1 - 0.012, 0.04, 0.024, 0.032, grey(0.09)));
  }
  // inside: the dark sooty funnel with light streaks, a lighter ring at the throat
  const zl = s.z1 - 0.004;
  const rTh = Math.min(s.r1 * 0.86, s.r0 * 0.8);
  const div = interior(s, {
    n: N * 2,
    per: dense(3),
    rLip: s.r1 * 0.965,
    rThroat: rTh,
    depth: 0.34,
    rows: dense(5),
    zLip: zl,
    flat: 0.5,
    col: (f, i, t) => {
      const streak = hash(i * 3.7 + Math.floor(f * 3)) > 0.6 ? 2.2 : 1;
      const throat = t > 0.86 ? 3.5 : 1;
      return grey(Math.min(0.12, 0.03 * streak * throat * (1 - 0.3 * t)));
    },
  });
  const can = burnerCan(s, rTh, div.z, { spokes: 16, spokeCol: 0.3, spokeR: 0.92, rings: [0.27], ringCol: 0.03, cone: 0.02 });
  return { outer: merge(parts), inner: merge([div.geo, ...can]) };
}

// ---------------------------------------------------------------------------
// Su-35S: Saturn AL-41F1S (izdeliye 117S), axisymmetric thrust vectoring
// ---------------------------------------------------------------------------

/** Heat tints of bare titanium, as on the Flankers' nozzles. */
const TI_BLUE: RGB = [0.16, 0.22, 0.37];
const TI_VIOLET: RGB = [0.29, 0.18, 0.34];
const TI_BRONZE: RGB = [0.43, 0.28, 0.13];
const TI_STRAW: RGB = [0.43, 0.37, 0.23];
const TI_GREY: RGB = [0.3, 0.3, 0.31];

/** A heat tint for flap i at u: a colour per flap drifting into a neighbour's along the length. */
function tint(pal: RGB[], i: number, u: number, seed: number): RGB {
  const a = pal[Math.floor(hash(i * 1.7 + seed) * pal.length) % pal.length];
  const b = pal[Math.floor(hash(i * 2.3 + seed + 9) * pal.length) % pal.length];
  const t = 0.5 + 0.5 * Math.sin(u * (5 + 4 * hash(i + seed)) + hash(i * 3.1 + seed) * 6.28);
  return mix(a, b, t);
}

/**
 * From the photos (a Su-35S at Paris 2013, side-on close-up at 3400 px, and the same jet whole): LONG
 * nozzles, nearly straight tubes standing well out behind the nacelles, of bare titanium burnt in
 * strong patchy heat tints -- steel blue, violet, bronze and straw, changing flap to flap and along
 * each. The front third is the gimbal housing: rings of panels with rows of fasteners and a raised
 * riveted joint band; then eighteen long narrow outer flaps side by side, converging only a little;
 * a thin dark lip, and inside it the divergent flaps PALE as ceramic with dark seams -- a bright tube
 * inside a dark rim from the side and behind.
 */
export function nozzleSu35(p: NozzlePlace): BuiltNozzle {
  const L = p.z1 - p.z0;
  const N = 18;
  const w = (TAU * p.r0) / N;
  const mat = skin('SU35', {
    metal: 0.78,
    rough: 0.34,
    len: L,
    streak: 0.18,
    dots: [{ v0: 0.06, v1: L * 0.33, pitch: 0.105, cols: 3, w, r: 0.006, k: -0.55 }],
  });
  return morphing(p, (s) => al41Shape(s, { n: N, uA: 0.36, pal: [TI_BLUE, TI_VIOLET, TI_BRONZE, TI_STRAW, TI_GREY], seed: 1, lipIn: [0.5, 0.5, 0.47] }), mat);
}

interface Al41Look {
  /** outer flaps */
  n: number;
  /** where the gimbal housing ends (fraction of the length) */
  uA: number;
  pal: RGB[];
  seed: number;
  /** the divergent flaps' pale colour */
  lipIn: RGB;
  /** palette for the flaps after the housing (default the same) */
  palB?: RGB[];
  /** raised bands round the flaps (fractions of the length) */
  bands?: number[];
  bandCol?: RGB;
  /** gimbal housing's joint band position */
  joint?: number;
  jointCol?: RGB;
}

/** The AL-41F1 family's long thrust-vectoring nozzle (Su-35S and Su-57). */
function al41Shape(s: NozzleSpec, o: Al41Look): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const L = s.z1 - s.z0;
  const N = o.n, per = dense(5);
  const out = new Shell(s.cx, s.cy, N * per);
  const uA = o.uA;
  const uJ = o.joint ?? uA - 0.05;
  // the gimbal housing: a straight tube of panels, a raised riveted joint band near its end
  const jointCol = o.jointCol ?? mix(TI_VIOLET, TI_BLUE, 0.4);
  flaps(out, s, {
    n: N,
    per,
    u0: 0,
    u1: uA,
    rows: [0, 0.04, 0.12, 0.2, uJ - 0.03, uJ - 0.026, uJ, uJ + 0.026, uJ + 0.03, uA - 0.006, uA],
    r: (u) => {
      const band = u > uJ - 0.028 && u < uJ + 0.028 ? 1.016 : 1;
      return s.r0 * band * (u >= uA - 0.001 ? 0.975 : 1);
    },
    col: (u, f, i) => {
      if (u > uJ - 0.028 && u < uJ + 0.028) return mul(jointCol, 0.85 + 0.2 * hash(i + 4));
      const seam = f < 0.06 ? 0.55 : 1;
      return mul(tint(o.pal, i, u, o.seed + 40), seam * (u >= uA - 0.001 ? 0.4 : 1));
    },
  });
  // the long outer flaps, side by side, converging a little, darker at their seams
  const uS = uA + 0.004;
  const bands = o.bands ?? [];
  const inBand = (u: number) => bands.some((b) => Math.abs(u - b) < 0.018);
  const rows = [...Array.from({ length: dense(10) + 1 }, (_, q) => lerp(uS, 1, q / dense(10)))];
  for (const b of bands) rows.push(b - 0.022, b - 0.018, b + 0.018, b + 0.022);
  rows.sort((a, b) => a - b);
  const ex = flaps(out, s, {
    n: N,
    per,
    u0: uS,
    u1: 1,
    rows,
    r: (u) => {
      const t = (u - uS) / (1 - uS);
      return lerp(s.r0 * 0.975, s.r1, t * t * 0.6 + t * 0.4) * (inBand(u) ? 1.012 : 1);
    },
    flat: 0.3,
    dr: (f) => 0.003 * f,
    col: (u, f, i) => {
      if (inBand(u)) return mul(o.bandCol ?? TI_GREY, 0.9 + 0.2 * hash(i));
      const seam = f < 0.07 ? 0.45 : 1;
      const soot = 1 - 0.35 * sst(0.85, 1, u);
      return mul(tint(o.palB ?? o.pal, i, u, o.seed), seam * soot);
    },
  });
  lipRoll(out, s, ex, [
    [0.99, 0.006, grey(0.045)],
    [0.965, -0.004, grey(0.035)],
  ]);
  // inside: the pale divergent flaps and seals, dark seams between, greying going in
  const zl = s.z1 - 0.004;
  const rTh = s.r1 * 0.88;
  const div = interior(s, {
    n: N * 2,
    per: dense(3),
    rLip: s.r1 * 0.965,
    rThroat: rTh,
    depth: 0.45,
    rows: dense(5),
    zLip: zl,
    flat: 0.5,
    col: (f, i, t) => {
      const seam = f < 0.1 ? 0.18 : 1;
      const k = (0.85 + 0.25 * hash(i * 5 + 1)) * seam * (1 - 0.65 * t * t);
      return mul(o.lipIn, k);
    },
  });
  const can = burnerCan(s, rTh, div.z, { spokes: 18, spokeR: 0.9, rings: [0.4, 0.68], cone: 0.03 });
  return { outer: out.geometry(), inner: merge([div.geo, ...can]) };
}

// ---------------------------------------------------------------------------
// Rafale: Safran M88-2
// ---------------------------------------------------------------------------

/**
 * From the photos (a Rafale dead astern, Safran's M88 on an Indian Rafale three-quarters from behind):
 * SHORT, STUBBY, nearly straight nozzles, very DARK -- ten wide charcoal outer flaps dotted with rows
 * of small light fasteners, a thin bright ring where the nacelle ends, a thick rounded dark rim, and
 * just inside it a ring of many small brackets and links (the divergent flaps' hinges and their
 * synchronising links), a bumpy beaded ring that gives the Rafale's nozzles away from behind; inside,
 * dark flaps with their brackets and a dark can with twelve radial flame-holder spokes round a hub.
 */
export function nozzleRafale(p: NozzlePlace): BuiltNozzle {
  const L = p.z1 - p.z0;
  const vis = (p.floor ?? p.z0) - p.z0;
  const N = 10;
  const mat = skin('RAFALE', {
    metal: 0.35,
    rough: 0.55,
    len: L,
    streak: 0.15,
    dots: [{ v0: vis + 0.03, v1: L - 0.03, pitch: 0.06, cols: 3, w: (TAU * p.r0) / N, r: 0.0055, k: 0.2 }],
  });
  return morphing(p, (s) => m88Shape(s, N), mat);
}

function m88Shape(s: NozzleSpec, N: number): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const L = s.z1 - s.z0;
  const per = dense(8);
  const out = new Shell(s.cx, s.cy, N * per);
  const vis = (s.floor ?? s.z0) - s.z0;
  const uR = (vis + 0.02) / L;
  // the thin bright ring at the nacelle's end
  flaps(out, s, {
    n: N,
    per,
    u0: 0,
    u1: uR,
    rows: [0, uR - 0.012, uR - 0.004, uR],
    r: (u) => s.r0 * (u >= uR - 0.001 ? 0.975 : 1.004),
    col: (u) => grey(u >= uR - 0.001 ? 0.08 : 0.34),
  });
  const uS = uR + 0.005;
  const charcoal: RGB = [0.055, 0.055, 0.06];
  const ex = flaps(out, s, {
    n: N,
    per,
    u0: uS,
    u1: 1,
    rows: dense(6),
    r: (u) => {
      const t = (u - uS) / (1 - uS);
      return lerp(s.r0 * 0.975, s.r1, t);
    },
    flat: 0.8,
    dr: (f) => 0.004 * f,
    col: (u, f, i) => mul(charcoal, (0.9 + 0.2 * hash(i + 21)) * (f < 0.03 ? 0.4 : 1)),
  });
  // the thick, rounded dark rim
  lipRoll(out, s, ex, [
    [1.016, 0.009, grey(0.045)],
    [1.002, 0.02, grey(0.04)],
    [0.965, 0.015, grey(0.035)],
    [0.945, 0.0, grey(0.03)],
  ]);
  // inside: the beaded ring of hinge brackets and links just inside the rim, dark flaps with their
  // brackets deeper in, the dark can
  const zl = s.z1 - 0.003;
  const rLip = s.r1 * 0.945, rTh = s.r1 * 0.86, depth = Math.min(0.24, (s.z1 - (s.floor ?? s.z0)) * 0.6);
  const div = interior(s, {
    n: N * 2,
    per: dense(3),
    rLip,
    rThroat: rTh,
    depth,
    rows: dense(4),
    zLip: zl,
    flat: 0.7,
    col: (f, i, t) => grey((i % 2 ? 0.024 : 0.032) * (f < 0.08 ? 0.5 : 1) * (1 - 0.3 * t)),
  });
  const inner: THREE.BufferGeometry[] = [div.geo];
  const beads = 30;
  for (let k = 0; k < beads; k++) {
    const a = ((k + 0.5) / beads) * TAU;
    const big = k % 3 === 0;
    inner.push(boxAt(s, a, rLip * 0.95, zl - 0.03, big ? 0.04 : 0.026, big ? 0.03 : 0.02, big ? 0.045 : 0.03, grey(big ? 0.08 : 0.06), false));
  }
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * TAU;
    inner.push(boxAt(s, a, lerp(rLip, rTh, 0.55) * 0.95, zl - depth * 0.55, 0.05, 0.025, 0.06, grey(0.045), false));
  }
  inner.push(...burnerCan(s, rTh, div.z, { spokes: 12, spokeCol: 0.05, spokeR: 0.9, rings: [0.3], cone: 0.025 }));
  return { outer: out.geometry(), inner: merge(inner) };
}

// ---------------------------------------------------------------------------
// MiG-31BM: Aviadvigatel D-30F6
// ---------------------------------------------------------------------------

/**
 * From the photos (a MiG-31 dead astern on the ramp, the tail from the side at a show, a MiG-31E's
 * nozzles close up with their red covers on, an engine-nozzle kit's parts): HUGE round nozzles whose
 * outside is a plain STRAIGHT fixed SHROUD -- no outer flaps to see -- cut square at the end with a
 * heavy rounded rim, of burnt dark steel (brown-grey to charcoal, soot streaked aft, a couple of
 * circumferential joints and lengthwise seams), dark against the light grey nacelles. The variable
 * flaps live INSIDE it: a ring of many narrow ribbed flaps set back behind the rim, then the can with
 * a ring flame holder and radial gutters.
 */
export function nozzleMig31(p: NozzlePlace): BuiltNozzle {
  const L = p.z1 - p.z0;
  const mat = skin('MIG31', { metal: 0.45, rough: 0.68, len: L, streak: 0.5 });
  // open, the inner flaps just fill the shroud's bore
  return morphing(p, (s) => d30Shape(s), mat, [NOZZLE_CLOSED, (p.r0 * 0.9) / p.r1]);
}

function d30Shape(s: NozzleSpec): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const L = s.z1 - s.z0;
  const N = 12, per = dense(8);
  const out = new Shell(s.cx, s.cy, N * per);
  const steel: RGB = [0.115, 0.094, 0.078];
  const joint = (u: number) => [0.3, 0.62].some((j) => Math.abs(u - j) < 0.006);
  const rows = [0, 0.04, 0.294, 0.296, 0.304, 0.306, 0.614, 0.616, 0.624, 0.626, 0.8, 0.97, 1];
  // the fixed shroud: a straight tube, a hair narrower aft, burnt steel with joints and seams
  const ex = flaps(out, s, {
    n: N,
    per,
    u0: 0,
    u1: 1,
    rows,
    r: (u) => s.r0 * (1 - 0.015 * u) * (joint(u) ? 0.994 : 1),
    col: (u, f, i) => {
      const seam = f < 0.03 ? 0.6 : 1;
      const k = (0.85 + 0.3 * hash(i * 3 + Math.floor(u * 4))) * seam * (joint(u) ? 0.45 : 1);
      // browner toward the root, charcoal toward the exit
      return mul(mix(steel, [0.08, 0.075, 0.072], sst(0.4, 1, u)), k);
    },
  });
  // the heavy rounded rim, then the shroud's bore running in
  lipRoll(out, s, ex, [
    [1.008, 0.012, grey(0.07)],
    [0.985, 0.026, grey(0.06)],
    [0.95, 0.018, grey(0.045)],
    [0.93, 0.0, grey(0.035)],
    [0.925, -0.25, grey(0.02)],
  ]);
  // inside: the ring of narrow ribbed flaps set back from the rim, converging to the exit
  const NF = 32, perF = 4;
  const rBore = s.r0 * 0.985 * 0.925;
  const inr = new Shell(s.cx, s.cy, NF * perF, false);
  const zT = s.z1 - 0.08;
  const ring = (z: number, r: number, k: number) => {
    for (let i = 0; i < NF; i++)
      for (let q = 0; q < perF; q++) {
        const f = q / perF;
        const rib = q === 2 ? 1.5 : q === 0 ? 0.35 : 1;
        inr.at(((i + f) / NF) * TAU, r * (q === 0 ? 0.992 : 1), z, mul([0.085, 0.078, 0.07], rib * k * (0.85 + 0.3 * hash(i))));
      }
  };
  ring(s.z1 - 0.32, rBore * 0.995, 0.5);
  ring(lerp(s.z1 - 0.32, zT, 0.5), lerp(rBore * 0.995, s.r1, 0.5), 0.8);
  ring(zT, s.r1, 1);
  ring(zT - 0.004, s.r1 * 0.965, 0.5);
  ring(zT - 0.3, s.r1 * 0.9, 0.25);
  const can = burnerCan(s, s.r1 * 0.9, zT - 0.3, { spokes: 20, spokeR: 0.9, rings: [0.55], cone: 0.03 });
  return { outer: out.geometry(), inner: merge([inr.geometry(), ...can]) };
}

// ---------------------------------------------------------------------------
// SR-71A: Pratt & Whitney J58, ejector nozzle
// ---------------------------------------------------------------------------

/**
 * From the photos (an SR-71 dead astern at the Air Force Museum, a nacelle opened up to show the
 * ejector, its port engine exhaust): each black nacelle ends in a BIG round EJECTOR -- a ring of
 * thirty-odd narrow free-floating trailing-edge flaps, finely CORRUGATED lengthwise, of burnt
 * bronze-brown metal (not the black paint), closing a little toward a softly scalloped rim. Inside
 * is a big dark annulus, and deep in it the much smaller PRIMARY nozzle of the engine itself, its
 * afterburner liner showing as a target of tight concentric tan RINGS.
 */
export function nozzleSr71(p: NozzlePlace): BuiltNozzle {
  const L = p.z1 - p.z0;
  const mat = skin('SR71', { metal: 0.6, rough: 0.5, len: L, streak: 0.3, ribs: [4, 0.28] });
  return morphing(p, (s) => j58Shape(s), mat);
}

function j58Shape(s: NozzleSpec): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const L = s.z1 - s.z0;
  const N = 32, per = dense(6);
  const out = new Shell(s.cx, s.cy, N * per);
  const bronze: RGB = [0.24, 0.19, 0.14];
  // where the black nacelle ends, a narrow dark band
  flaps(out, s, {
    n: N,
    per,
    u0: 0,
    u1: 0.08,
    rows: [0, 0.07, 0.076, 0.08],
    r: (u) => s.r0 * (u >= 0.079 ? 0.985 : 1.002),
    col: () => grey(0.03),
  });
  // the ejector flaps: narrow, corrugated, closing a little, their ends softly scalloped
  const ex = flaps(out, s, {
    n: N,
    per,
    u0: 0.084,
    u1: 1,
    rows: dense(8),
    r: (u) => {
      const t = (u - 0.084) / (1 - 0.084);
      return lerp(s.r0 * 0.985, s.r1, t * 0.6 + t * t * 0.4);
    },
    flat: 0.5,
    dr: (f) => (f < 0.04 ? -0.006 : 0.0025 * Math.sin(f * Math.PI * 6)),
    dz: (f, u) => tipCut(0.03 * (1 - Math.sin(Math.PI * f)), 0.03, L, u),
    col: (u, f, i) => {
      const k = (0.85 + 0.3 * hash(i * 7 + 2)) * (f < 0.04 ? 0.4 : 1) * (1 - 0.25 * sst(0.75, 1, u));
      return mul(mix(bronze, [0.2, 0.18, 0.17], hash(i + 50) * 0.5), k);
    },
  });
  lipRoll(out, s, ex, [
    [0.992, 0.004, grey(0.08)],
    [0.978, -0.004, grey(0.05)],
  ]);
  // inside: the ejector's dark bore, the annulus, the primary nozzle's lip and its ringed liner
  const inner: THREE.BufferGeometry[] = [];
  const zB = s.z1 - 0.004;
  const rB = s.r1 * 0.978;
  const zP = s.z1 - 0.45;
  const rP = s.r0 * 0.56;
  const bore = lathe(
    [
      [rB, zB],
      [lerp(rB, s.r0 * 0.93, 0.6), zB - 0.2],
      [s.r0 * 0.93, zP - 0.02],
    ],
    48,
    s.cx,
    s.cy,
  );
  inner.push(solid(bore, grey(0.022), false));
  // the annulus' floor (facing aft) between the bore and the primary nozzle
  const ann = new THREE.RingGeometry(rP * 1.02, s.r0 * 0.935, 48, 1);
  ann.translate(s.cx, s.cy, zP - 0.02);
  inner.push(solid(ann, grey(0.012), false));
  // the primary nozzle: a short tube standing out of it, its lip catching a little light
  inner.push(solid(lathe([[rP * 1.02, zP - 0.03], [rP * 1.03, zP - 0.005], [rP * 1.0, zP], [rP * 0.97, zP - 0.01]], 48, s.cx, s.cy), [0.11, 0.09, 0.07], false));
  // its liner: a target of tight concentric rings, tan going dark
  const zF = s.floor ?? s.z0;
  for (let k = 0; k < 9; k++) {
    const z = lerp(zP - 0.02, zF + 0.03, k / 8);
    const g = new THREE.TorusGeometry(rP * (0.965 - k * 0.005), 0.009, 4, 48);
    g.translate(s.cx, s.cy, z);
    const t = 1 - k / 9;
    inner.push(solid(g, [0.3 * t + 0.04, 0.21 * t + 0.03, 0.13 * t + 0.02], false));
  }
  inner.push(...burnerCan({ ...s, r0: rP / 0.84 }, rP * 0.97, zP - 0.01, { spokes: 8, spokeCol: 0.03, spokeR: 0.8, rings: [0.45], ringCol: 0.035, cone: 0.03 }));
  return { outer: out.geometry(), inner: merge(inner) };
}

// ---------------------------------------------------------------------------
// X-15: Thiokol (Reaction Motors) XLR99 rocket
// ---------------------------------------------------------------------------

/**
 * From the photos (the X-15 at the National Air and Space Museum dead astern, the XLR99 on display):
 * no flaps and nothing that moves -- the blunt base's black rim, then a flat annular base plate of
 * bare silver aluminium with rings of rivets and a few small fittings, and in the middle the rocket's
 * BELL, its lip marked by a thin copper-red ring, its inside built of hundreds of fine tubes (the
 * regeneratively cooled wall) running in as silver-grey striations to the dark throat.
 *
 * The place here is the bell's: z0 / r0 its throat, z1 / r1 its exit; `plate` the base plate's
 * outer radius and `base` the z of the fuselage's base.
 */
export function nozzleX15(p: NozzlePlace & { plate: number; base: number }): BuiltNozzle {
  const mat = skin('X15', {
    metal: 0.72,
    rough: 0.4,
    len: p.z1 - p.z0,
    streak: 0.12,
    ribs: [5, 0.45],
    ribSpan: [0, 5],
    dots: [{ v0: 10 + p.r1 + 0.03, v1: 10 + p.plate - 0.01, pitch: 0.045, cols: 6, w: (TAU * p.plate) / 48, r: 0.0045, k: -0.55 }],
  });
  // (fixed: closed and open are the same bell)
  return morphing(p, (s) => xlr99Shape(s, p.plate, p.base), mat, [1, 1]);
}

function xlr99Shape(s: NozzleSpec, plate: number, base: number): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const N = 48, per = dense(4);
  const out = new Shell(s.cx, s.cy, N * per);
  const ring = (r: number, z: number, c: (i: number, f: number) => RGB, v: number) => {
    for (let i = 0; i < N; i++)
      for (let k = 0; k < per; k++) {
        const f = k / per;
        out.at(((i + f) / N) * TAU, r, z, c(i, f), i + f, v, 1);
      }
  };
  const alu = (i: number) => mul([0.42, 0.42, 0.43], 0.92 + 0.16 * hash(Math.floor(i / 6)));
  const copper: RGB = [0.5, 0.2, 0.09];
  const zp = base + 0.003;
  // the base plate, from its edge in to the bell (faces aft)
  for (const r of [plate, lerp(plate, s.r1 * 1.035, 0.5), s.r1 * 1.035]) ring(r, zp, (i) => alu(i), 10 + r);
  // the lip: up the outside of the bell's rim, the copper ring over the top, and in
  ring(s.r1 * 1.03, zp + 0.002, () => grey(0.12), 0);
  ring(s.r1 * 1.025, s.z1 - 0.006, () => copper, 0);
  ring(s.r1 * 1.01, s.z1, () => copper, 0);
  ring(s.r1 * 0.995, s.z1 - 0.004, () => mul(copper, 0.7), 0);
  // the bell's inside: fine tubes running in to the throat, parallel near the exit, flaring hard near the throat
  const D = s.z1 - s.z0;
  const bellR = (t: number) => s.r1 - (s.r1 - s.r0) * Math.pow(t, 1.8);
  const rows = dense(14);
  for (let q = 1; q <= rows; q++) {
    const t = (q / rows) * 0.8;
    const r = bellR(t);
    ring(r, s.z1 - 0.004 - D * t, (i, f) => mul([0.33, 0.33, 0.34], (1 - 0.8 * t) * (0.94 + 0.12 * hash(i * 9 + Math.floor(f * per)))), D * t);
  }
  // deep in: the last of the bell and the throat, in the burner material (it lights up with the rocket)
  const inn = new Shell(s.cx, s.cy, 48, false);
  for (let q = 0; q <= 6; q++) {
    const t = 0.8 + (q / 6) * 0.2;
    const r = bellR(t) * (q === 0 ? 1.002 : 1);
    for (let j = 0; j < 48; j++) inn.at((j / 48) * TAU, r, s.z1 - 0.004 - D * t, grey(0.02 * (1 - (q / 6) * 0.6)));
  }
  // the combustion chamber beyond the throat: dark, and the injector face at its end
  const zF = s.floor ?? s.z0 - 0.3;
  const chamber = lathe(
    [
      [s.r0, s.z0],
      [s.r0 * 1.5, lerp(s.z0, zF, 0.5)],
      [s.r0 * 1.5, zF],
    ],
    32,
    s.cx,
    s.cy,
  );
  const face = new THREE.CircleGeometry(s.r0 * 1.5, 32);
  face.translate(s.cx, s.cy, zF + 0.002);
  return { outer: out.geometry(), inner: merge([inn.geometry(), solid(chamber, grey(0.01), false), solid(face, grey(0.006), false)]) };
}

// ---------------------------------------------------------------------------
// Su-57: Saturn AL-41F1 (izdeliye 117), axisymmetric thrust vectoring
// ---------------------------------------------------------------------------

/**
 * From the photos (a T-50 in flight side-on, two in afterburner from astern, a nozzle kit's render,
 * MAKS 2017): the same family as the Su-35's, shorter out of the widely spaced nacelles. The front
 * part -- the gimbal housing with its raised riveted band -- is warm BRONZE and GOLD titanium,
 * streaky; the flaps aft of it are darker GUNMETAL, crossed by two lighter circumferential bands; a
 * thick dark lip, and the divergent flaps inside pale grey, a light ring inside the dark rim from
 * behind. (Not the flat 2D nozzle tested on a few jets from 2024: the game's Su-57 has the AL-41F1.)
 */
export function nozzleSu57(p: NozzlePlace): BuiltNozzle {
  const L = p.z1 - p.z0;
  const N = 16;
  const w = (TAU * p.r0) / N;
  const mat = skin('SU57', {
    metal: 0.78,
    rough: 0.36,
    len: L,
    streak: 0.25,
    dots: [{ v0: 0.05, v1: L * 0.38, pitch: 0.12, cols: 3, w, r: 0.006, k: -0.5 }],
  });
  const gun: RGB[] = [
    [0.16, 0.16, 0.17],
    [0.19, 0.18, 0.18],
    [0.14, 0.14, 0.155],
  ];
  return morphing(p, (s) =>
    al41Shape(s, {
      n: N,
      uA: 0.42,
      pal: [TI_BRONZE, TI_STRAW, [0.38, 0.27, 0.15], [0.45, 0.34, 0.18]],
      palB: gun,
      seed: 7,
      lipIn: [0.44, 0.44, 0.42],
      bands: [0.64, 0.84],
      bandCol: [0.3, 0.3, 0.31],
      jointCol: [0.3, 0.23, 0.15],
    }),
    mat,
  );
}

// ---------------------------------------------------------------------------
// Gripen E: General Electric F414G
// ---------------------------------------------------------------------------

/**
 * From the photos (a Gripen dead astern, sharp; its tail from the side; a Super Hornet's F414 close up
 * for the family's inside): a bright metal COLLAR at the end of the fuselage edged with a row of
 * fasteners, then twelve metallic grey outer flaps closing to the exit whose seams JOG sideways
 * halfway along (each flap's overlap steps over in a Z) -- the Gripen's nozzle at a glance -- a ring
 * of small dark brackets round the lip, and just inside it a thin bronze band of divergent flaps
 * before the dark.
 */
export function nozzleGripen(p: NozzlePlace): BuiltNozzle {
  const L = p.z1 - p.z0;
  const vis = (p.floor ?? p.z0) - p.z0;
  const N = 12;
  const mat = skin('GRIPEN', {
    metal: 0.7,
    rough: 0.4,
    len: L,
    streak: 0.25,
    dots: [{ v0: vis + 0.012, v1: vis + 0.05, pitch: 0.038, cols: 5, w: (TAU * p.r0) / N, r: 0.0055, k: -0.55 }],
  });
  return morphing(p, (s) => f414GripenShape(s, N, vis), mat);
}

function f414GripenShape(s: NozzleSpec, N: number, vis: number): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const L = s.z1 - s.z0;
  const per = dense(8);
  const out = new Shell(s.cx, s.cy, N * per);
  const uC = (vis + 0.065) / L;
  // the bright collar, a hair proud, stepping down onto the flaps
  flaps(out, s, {
    n: N,
    per,
    u0: 0,
    u1: uC,
    rows: [0, (vis - 0.01) / L, uC - 0.006, uC - 0.002, uC],
    r: (u) => s.r0 * (u >= uC - 0.0005 ? 0.97 : u > uC - 0.003 ? 0.99 : 1.004),
    col: (u) => (u >= uC - 0.003 ? grey(0.1) : [0.46, 0.46, 0.47]),
  });
  // the flaps: their seams jog over halfway along
  const uS = uC + 0.004;
  const jog = (u: number) => 0.24 * sst(0.5, 0.56, u);
  const ex = flaps(out, s, {
    n: N,
    per,
    u0: uS,
    u1: 1,
    rows: [...Array.from({ length: dense(10) + 1 }, (_, q) => lerp(uS, 1, q / dense(10))), 0.5, 0.53, 0.56].sort((a, b) => a - b),
    r: (u) => {
      const t = (u - uS) / (1 - uS);
      return lerp(s.r0 * 0.97, s.r1, t * 0.6 + t * t * 0.4);
    },
    turn: jog,
    flat: 0.75,
    dr: (f) => 0.005 * f,
    col: (u, f, i) => {
      const k = (0.9 + 0.2 * hash(i + 3)) * (f < 0.035 ? 0.4 : 1) * (1 - 0.35 * sst(0.8, 1, u));
      return mul([0.3, 0.3, 0.31], k);
    },
  });
  lipRoll(out, s, ex, [
    [0.99, 0.006, grey(0.05)],
    [0.962, -0.004, grey(0.035)],
  ]);
  // inside: the ring of small dark brackets round the lip, a thin bronze band, then dark
  const zl = s.z1 - 0.004;
  const rLip = s.r1 * 0.962, rTh = s.r1 * 0.88;
  const div = interior(s, {
    n: N * 2,
    per: dense(3),
    rLip,
    rThroat: rTh,
    depth: 0.32,
    rows: dense(5),
    zLip: zl,
    flat: 0.6,
    col: (f, i, t) => (t < 0.2 ? mul([0.32, 0.24, 0.15], (f < 0.08 ? 0.4 : 1) * (0.9 + 0.2 * hash(i))) : grey(0.028 * (1 - 0.3 * t))),
  });
  const inner: THREE.BufferGeometry[] = [div.geo];
  for (let k = 0; k < 24; k++) {
    const a = ((k + 0.5) / 24) * TAU;
    inner.push(boxAt(s, a, rLip * 0.955, zl - 0.018, 0.028, 0.022, 0.03, grey(0.05), false));
  }
  inner.push(...burnerCan(s, rTh, div.z, { spokes: 18, spokeR: 0.9, rings: [0.6], cone: 0.03 }));
  return { outer: out.geometry(), inner: merge(inner) };
}

// ---------------------------------------------------------------------------
// J-20B: Shenyang WS-10C, axisymmetric thrust vectoring (the J-20B update builds the jet)
// ---------------------------------------------------------------------------

/**
 * From the photos (J-20s with WS-10Cs at Zhuhai 2021, magnified; a WS-10C kit's parts): where the
 * body's round engine shroud ends round each nozzle its edge is SAW-TOOTHED; the nozzle itself is
 * DARK charcoal, sixteen narrow outer flaps each dotted with a grid of LIGHT FASTENERS, closing a
 * little, and its EXIT is SERRATED: every flap ends in a rounded tooth, a crown of teeth round the
 * rim. Inside, dark, a ring flame holder with radial gutters round the cone. `shroud` is the radius
 * of the body's engine shroud there (the saw-toothed band is laid over it).
 */
export function nozzleJ20B(p: NozzlePlace & { shroud: number }): BuiltNozzle {
  const L = p.z1 - p.z0;
  const N = 16;
  const mat = skin('J20B', {
    metal: 0.35,
    rough: 0.58,
    len: L,
    streak: 0.2,
    dots: [{ v0: 0.2, v1: L - 0.08, pitch: 0.055, cols: 2, w: (TAU * p.r0) / N, r: 0.005, k: 0.22 }],
  });
  return morphing(p, (s) => ws10Shape(s, N, p.shroud), mat);
}

function ws10Shape(s: NozzleSpec, N: number, shroud: number): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const L = s.z1 - s.z0;
  const per = dense(8);
  const out = new Shell(s.cx, s.cy, N * per);
  // (the body's own grey, lighter than the nozzle: the teeth stand out against the flaps as in the photos)
  const paint: RGB = [0.2, 0.21, 0.22];
  // the body shroud's saw-toothed edge: a band at the shroud's radius, its end cut in teeth (one per
  // flap, points aft), then stepping down onto the flaps along the same zig-zag
  const zB = 0.14, tooth = 0.07;
  const uB = zB / L;
  // (0 at a tooth's point, mid-flap; -tooth at the notches between)
  const zig = (f: number) => -tooth * Math.abs(2 * f - 1);
  const rowsB = [0, uB * 0.4, uB];
  for (const u of rowsB)
    for (let i = 0; i < N; i++)
      for (let k = 0; k < per; k++) {
        const f = k / per;
        out.at(((i + f) / N) * TAU, shroud, s.z0 + L * u + (u === uB ? zig(f) : 0), paint, i + f, L * u, 0);
      }
  // the step down onto the flaps, along the teeth
  for (const kr of [0.995, 0.955])
    for (let i = 0; i < N; i++)
      for (let k = 0; k < per; k++) {
        const f = k / per;
        out.at(((i + f) / N) * TAU, shroud * kr, s.z0 + zB + zig(f) - (kr < 0.97 ? 0.004 : 0), kr < 0.97 ? grey(0.03) : mul(paint, 0.6), i + f, zB, 0);
      }
  // the flaps: from just inside the teeth, dark charcoal, converging a little, ending in rounded teeth
  const charcoal: RGB = [0.06, 0.06, 0.065];
  const u0 = (zB + 0.01) / L;
  const ex = flaps(out, s, {
    n: N,
    per,
    u0,
    u1: 1,
    rows: dense(9),
    r: (u) => {
      const t = (u - u0) / (1 - u0);
      return lerp(s.r0 * 0.985, s.r1, t * 0.7 + t * t * 0.3);
    },
    flat: 0.55,
    dr: (f) => (f < 0.04 ? -0.004 : 0.003 * f),
    dz: (f, u) => (u < u0 + 0.001 ? zig(f) + 0.004 : tipCut(0.065 * Math.pow(1 - Math.sin(Math.PI * f), 1.3), 0.065, L, u)),
    col: (u, f, i) => mul(charcoal, (0.9 + 0.2 * hash(i + 41)) * (f < 0.04 ? 0.45 : 1) * (1 - 0.3 * sst(0.85, 1, u))),
  });
  lipRoll(out, s, ex, [
    [0.99, 0.005, grey(0.05)],
    [0.965, -0.004, grey(0.035)],
  ]);
  // inside: dark flaps and seals, the can with a ring holder and radial gutters
  const zl = s.z1 - 0.07;
  const rLip = s.r1 * 0.95, rTh = s.r1 * 0.87;
  const div = interior(s, {
    n: N * 2,
    per: dense(3),
    rLip,
    rThroat: rTh,
    depth: 0.32,
    rows: dense(4),
    zLip: zl,
    flat: 0.6,
    col: (f, i, t) => grey((i % 2 ? 0.024 : 0.034) * (f < 0.08 ? 0.5 : 1) * (1 - 0.35 * t)),
  });
  const can = burnerCan(s, rTh, div.z, { spokes: 20, spokeR: 0.9, rings: [0.5], cone: 0.03 });
  return { outer: out.geometry(), inner: merge([div.geo, ...can]) };
}
