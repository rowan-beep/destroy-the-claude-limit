// Detailed shared components: engine nozzles, intakes with real ducts,
// wheels, landing-gear legs, ejection seats with pilots, antennas, probes.
// All built in the body frame (x right, y up, z aft).

import * as THREE from 'three';
import { dense, lathe, rod, tube, skinRings, offsetLoop, resample, colorize, join, P2, P3, roundBox, strip, stamp } from './kit';

// ---------------------------------------------------------------------------
// Materials shared by every airframe (non-livery parts)
// ---------------------------------------------------------------------------

export interface PartMaterials {
  nozzle: THREE.MeshStandardMaterial;
  /** inside of the nozzle and burner can: sooty, and blind to the sky it cannot see */
  nozzleIn: THREE.MeshStandardMaterial;
  duct: THREE.MeshStandardMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  strut: THREE.MeshStandardMaterial;
  tire: THREE.MeshStandardMaterial;
  hub: THREE.MeshStandardMaterial;
  seat: THREE.MeshStandardMaterial;
  flight: THREE.MeshStandardMaterial;
  helmet: THREE.MeshStandardMaterial;
  visor: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  frame: THREE.MeshStandardMaterial;
  antenna: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  lens: THREE.MeshBasicMaterial;
  formation: THREE.MeshBasicMaterial;
}

let PM: PartMaterials | null = null;

/**
 * The inside of a nozzle is a deep tube the sun barely reaches: most direct
 * light is dropped so the liner reads as a dark, sooty hole rather than a
 * sunlit pipe (the shadow map is far too coarse to catch it).
 */
function nozzleInterior(): THREE.MeshStandardMaterial {
  return burnerMaterial();
}

/**
 * Nozzle interior: sooty liner that lights up from the flame. Each jet gets its
 * own copy (same shader program) so its afterburner can drive it: a faint
 * orange at the lip, yellow down the liner and a white-hot flame zone at the
 * flame holders, whose gutters stand out darker against it.
 */
export function burnerMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.3, envMapIntensity: 0.35 });
  const u = {
    burn: { value: 0 },
    dry: { value: 0 },
    burnTime: { value: 0 },
    zExit: { value: 0 },
    zDeep: { value: -1 },
    /** nozzle axis (x, y) and radius, in the mesh's frame */
    axisR: { value: new THREE.Vector3(0, 0, 1) },
  };
  m.userData.burner = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBurnP;\nvarying float vBurnZ;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvBurnZ = transformed.z;\nvBurnP = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float burn;\nuniform float dry;\nuniform float burnTime;\nuniform float zExit;\nuniform float zDeep;\nuniform vec3 axisR;\nvarying vec3 vBurnP;\nvarying float vBurnZ;')
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n  reflectedLight.directDiffuse *= 0.14;\n  reflectedLight.directSpecular *= 0.14;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  {
    float h = clamp( ( zExit - vBurnZ ) / max( 0.01, zExit - zDeep ), 0.0, 1.0 );
    // flame holder gutters and spokes (lighter soot colour, deep in the can) block the flame behind them
    #ifdef USE_COLOR
      float holder = step( 0.035, vColor.r ) * smoothstep( 0.55, 0.75, h );
    #else
      float holder = 0.0;
    #endif
    float fl = 0.9 + 0.06 * sin( burnTime * 53.0 + vBurnZ * 23.0 ) + 0.04 * sin( burnTime * 31.0 );
    float b = clamp( burn, 0.0, 1.2 );
    vec3 lip = vec3( 1.0, 0.24, 0.035 );
    vec3 mid = vec3( 1.0, 0.5, 0.1 );
    vec3 core = vec3( 1.0, 0.82, 0.5 );
    // radial: the flame zone is white-hot on the axis, deep yellow-orange out at the liner
    float r = clamp( length( vBurnP.xy - axisR.xy ) / max( 0.01, axisR.z ), 0.0, 1.2 );
    float centre = 1.0 - smoothstep( 0.05, 0.85, r );
    vec3 col = mix( lip, mid, smoothstep( 0.0, 0.5, h ) );
    col = mix( col, core, smoothstep( 0.45, 0.95, h ) * min( b, 1.0 ) * ( 0.35 + 0.65 * centre ) );
    col = mix( col, vec3( 1.0, 0.97, 0.9 ), smoothstep( 0.7, 1.0, h ) * centre * centre * min( b, 1.0 ) );
    float I = b * ( 0.35 + 2.2 * pow( h, 1.6 ) * ( 0.55 + 0.9 * centre ) ) + dry * ( 0.01 + 0.12 * h * h );
    I *= 1.0 - 0.6 * holder;
    totalEmissiveRadiance += col * I * fl;
  }`,
      );
  };
  m.customProgramCacheKey = () => 'nozzle-burner-v4';
  return m;
}

/**
 * Canopy glass the way it looks on a real jet: almost clear looking straight
 * through it (you see the seats and the pilot), turning into a mirror of the
 * sky and hangar toward the edges, where you look across the curve (Fresnel).
 * Works on clones too: call it again on a copied material.
 */
export function glassify<T extends THREE.MeshStandardMaterial>(m: T, edge = 0.88): T {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
        float glassCos = clamp( abs( dot( normalize( vViewPosition ), normal ) ), 0.0, 1.0 );
        float glassFr = pow( 1.0 - glassCos, 3.0 );
        diffuseColor.a = mix( diffuseColor.a, ${edge.toFixed(3)}, glassFr );
      }
      #include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => `glass-fresnel-${edge.toFixed(3)}`;
  return m;
}

export function partMaterials(): PartMaterials {
  if (PM) return PM;
  PM = {
    nozzle: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.62 }),
    nozzleIn: nozzleInterior(),
    duct: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.5, metalness: 0.8 }),
    strut: new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.35, metalness: 0.55 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x1c1c1d, roughness: 0.92, metalness: 0 }),
    hub: new THREE.MeshStandardMaterial({ color: 0xc8cbce, roughness: 0.4, metalness: 0.6 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.75, metalness: 0.15 }),
    flight: new THREE.MeshStandardMaterial({ color: 0x5e6247, roughness: 0.9, metalness: 0 }),
    helmet: new THREE.MeshStandardMaterial({ color: 0x6f7263, roughness: 0.55, metalness: 0.05 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x1a1a14, roughness: 0.08, metalness: 0.9 }),
    // (a dielectric, not a metal: clear head-on, reflective at a glancing angle)
    glass: glassify(new THREE.MeshStandardMaterial({ color: 0xa9bcc8, roughness: 0.025, metalness: 0.0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 2.4 })),
    frame: new THREE.MeshStandardMaterial({ color: 0x2f3337, roughness: 0.6, metalness: 0.3 }),
    antenna: new THREE.MeshStandardMaterial({ color: 0x4b5054, roughness: 0.6, metalness: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.85, metalness: 0 }),
    lens: new THREE.MeshBasicMaterial({ color: 0xfff4d6 }),
    formation: new THREE.MeshBasicMaterial({ color: 0x7fcf5a, transparent: true, opacity: 0.55 }),
  };
  return PM;
}

// ---------------------------------------------------------------------------
// Engine nozzle: convergent-divergent petals, sawtooth exit, burner can,
// flame holders and the turbine face deep inside.
// ---------------------------------------------------------------------------

export interface NozzleSpec {
  cx: number;
  cy: number;
  /** z where the nozzle leaves the nacelle, and its exit */
  z0: number;
  z1: number;
  /** radius at the nacelle and at the exit */
  r0: number;
  r1: number;
  petals: number;
  /** sawtooth depth of the exit (m) */
  saw: number;
  /**
   * z of a closed bulkhead just ahead of the nozzle (a fuselage loft capped at
   * the nacelle end): the burner can is then built short, aft of it
   */
  floor?: number;
}

/**
 * Exit radius of the variable nozzle, as a fraction of the spec's `r1`: fully
 * closed (military power: the petals converge hard) and fully open (idle, a
 * stopped engine, full afterburner: the petals swing out almost straight).
 */
export const NOZZLE_CLOSED = 0.87;
export function nozzleOpenK(s: { r0: number; r1: number }): number {
  return Math.min((s.r0 * 0.99) / s.r1, 1.17);
}

/**
 * The nozzle built fully closed, with a morph target to fully open (same
 * topology, so the petals, actuator rods and liner move together when the
 * mesh's morph influence changes).
 */
export function nozzle(s: NozzleSpec): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry; area: [number, number] } {
  const k = nozzleOpenK(s);
  const closed = nozzleShape({ ...s, r1: s.r1 * NOZZLE_CLOSED });
  const open = nozzleShape({ ...s, r1: s.r1 * k });
  return { outer: withMorph(closed.outer, open.outer), inner: withMorph(closed.inner, open.inner), area: [NOZZLE_CLOSED, k] };
}

/** Give `base` one absolute morph target: `target`'s positions (and normals). */
export function withMorph(base: THREE.BufferGeometry, target: THREE.BufferGeometry): THREE.BufferGeometry {
  const a = base.attributes.position;
  const b = target.attributes.position;
  if (!a || !b || a.count !== b.count) return base;
  base.morphAttributes.position = [b];
  if (base.attributes.normal && target.attributes.normal) base.morphAttributes.normal = [target.attributes.normal];
  base.morphTargetsRelative = false;
  return base;
}

function nozzleShape(s: NozzleSpec): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const per = dense(6);
  const seg = s.petals * per;
  const rings: P3[][] = [];
  const N = dense(18);
  const L = s.z1 - s.z0;
  // outer: actuator ring at the root, then overlapping petal plates that
  // shingle over each other (a small ledge at every plate edge, growing aft)
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    let r = s.r0 + (s.r1 - s.r0) * (u * u * 0.4 + u * 0.6);
    // actuator / sync ring: a raised band just behind the nacelle joint
    r *= 1 + 0.035 * Math.exp(-Math.pow((u - 0.07) / 0.05, 2));
    const ring: P3[] = [];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const k = j % per;
      // plate ledge: each plate rises across its width and drops at the next plate's edge
      const ledge = u > 0.14 ? 1 + (0.004 + 0.016 * u) * (k / (per - 1)) : 1;
      // alternate plates are narrower seals sitting slightly lower
      const seal = u > 0.14 && Math.floor(j / per) % 2 === 1 ? 0.994 : 1;
      const tri = Math.abs((k / per) * 2 - 1); // 1 at seams, 0 mid-plate
      const z = s.z0 + L * u - (u > 0.999 ? s.saw * tri : s.saw * tri * Math.pow(u, 8));
      ring.push([s.cx + Math.cos(a) * r * ledge * seal, s.cy + Math.sin(a) * r * ledge * seal, z]);
    }
    rings.push(ring);
  }
  // lip: roll inward, then back up the inside (divergent flaps)
  const last = rings[rings.length - 1];
  const inset = (k: number, dz: number) =>
    last.map(([x, y, z]) => {
      const dx = x - s.cx;
      const dy = y - s.cy;
      return [s.cx + dx * k, s.cy + dy * k, z + dz] as P3;
    });
  rings.push(inset(0.985, 0.012));
  rings.push(inset(0.955, 0.0));
  const outerRings = rings.slice();
  const hash = (n: number) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const outer = colorize(skinRings(outerRings), (p, c) => {
    const u = Math.min(1, Math.max(0, (p.z - s.z0) / L));
    const a = Math.atan2(p.y - s.cy, p.x - s.cx);
    const plate = Math.floor((((a / (Math.PI * 2)) + 1) % 1) * s.petals);
    const v = 0.9 + 0.2 * hash(plate + s.petals * 7);
    // heat-stained titanium: pale bronze at the root, straw, then blue-violet toward the exit
    const straw = Math.exp(-Math.pow((u - 0.35) / 0.25, 2));
    const blue = Math.max(0, Math.min(1, (u - 0.45) / 0.4));
    let rr = 0.3 + 0.06 * straw - 0.085 * blue;
    let gg = 0.29 + 0.03 * straw - 0.075 * blue;
    let bb = 0.28 - 0.04 * straw - 0.015 * blue;
    // soot at the lip, the ring a little darker
    const soot = Math.max(0, (u - 0.9) / 0.1);
    const ringDark = Math.exp(-Math.pow((u - 0.07) / 0.05, 2)) * 0.12;
    const k2 = v * (1 - 0.45 * soot - ringDark);
    rr *= k2;
    gg *= k2;
    bb *= k2;
    c.setRGB(rr, gg, bb);
  });
  // actuator rods: from the ring onto the petals
  const acts: THREE.BufferGeometry[] = [];
  const nAct = s.petals >= 14 ? 8 : 6;
  for (let k = 0; k < nAct; k++) {
    const a = ((k + 0.5) / nAct) * Math.PI * 2;
    const rA = s.r0 * 1.03;
    const uB = 0.55;
    const rB = (s.r0 + (s.r1 - s.r0) * (uB * uB * 0.4 + uB * 0.6)) * 1.012;
    const g = rod(
      new THREE.Vector3(s.cx + Math.cos(a) * rA, s.cy + Math.sin(a) * rA, s.z0 + L * 0.08),
      new THREE.Vector3(s.cx + Math.cos(a) * rB, s.cy + Math.sin(a) * rB, s.z0 + L * uB),
      0.016,
      0.012,
      6,
    );
    acts.push(colorize(g, (_p, c) => c.setRGB(0.22, 0.21, 0.2)));
  }
  const outerAll = join([outer, ...acts]);
  // inside: divergent flaps, throat, liner with rings, flame holders, turbine
  const capped = s.floor !== undefined;
  const zF = s.floor ?? s.z0 - 1.6;
  const deep = s.z1 - zF;
  const prof: P2[] = capped
    ? [
        [s.r1 * 0.95, s.z1],
        [s.r1 * 0.86, s.z1 - deep * 0.45],
        [s.r1 * 0.8, s.z1 - deep * 0.72],
        [s.r0 * 0.84, zF + 0.01],
      ]
    : [
        [s.r1 * 0.95, s.z1],
        [s.r1 * 0.86, s.z1 - L * 0.45],
        [s.r1 * 0.8, s.z1 - L * 0.7],
        [s.r0 * 0.9, s.z0 - 0.05],
        [s.r0 * 0.9, s.z0 - 1.1],
        [s.r0 * 0.86, s.z0 - 1.6],
      ];
  const liner = colorize(lathe(prof, seg, s.cx, s.cy), (p, c) => {
    // heat-stained flaps at the exit, sooting over quickly toward the burner can
    // (linear values: 0.08 is a mid grey on screen, 0.012 near black)
    const d = (s.z1 - p.z) / deep;
    const k = 0.012 + 0.07 * Math.exp(-d * 4);
    c.setRGB(k, k * 0.94, k * 0.86);
  });
  const parts: THREE.BufferGeometry[] = [liner];
  // liner rings (only where the can runs deep)
  if (!capped) {
    for (let k = 0; k < 4; k++) {
      const z = s.z0 - 0.15 - k * 0.28;
      const t = new THREE.TorusGeometry(s.r0 * 0.88, 0.012, 5, seg);
      t.translate(s.cx, s.cy, z);
      parts.push(colorize(strip(t), (_p, c) => c.setRGB(0.03, 0.03, 0.03)));
    }
  }
  // flame holders (concentric V-gutters) and radial spokes
  const zH = capped ? zF + 0.1 : s.z0 - 1.25;
  for (const rr of [0.35, 0.62]) {
    const t = new THREE.TorusGeometry(s.r0 * rr, 0.02, 5, seg);
    t.translate(s.cx, s.cy, zH);
    parts.push(colorize(strip(t), (_p, c) => c.setRGB(0.05, 0.047, 0.044)));
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const g = rod(
      new THREE.Vector3(s.cx + Math.cos(a) * s.r0 * 0.12, s.cy + Math.sin(a) * s.r0 * 0.12, zH),
      new THREE.Vector3(s.cx + Math.cos(a) * s.r0 * 0.8, s.cy + Math.sin(a) * s.r0 * 0.8, zH),
      0.012,
      0.012,
      4,
    );
    parts.push(colorize(g, (_p, c) => c.setRGB(0.045, 0.042, 0.04)));
  }
  // turbine exit cone and the dark face behind it (facing aft, out of the nozzle)
  const cone = lathe(
    capped
      ? [
          [0.001, zF + 0.3],
          [s.r0 * 0.16, zF + 0.14],
          [s.r0 * 0.22, zF + 0.02],
        ]
      : [
          [0.001, s.z0 - 0.95],
          [s.r0 * 0.18, s.z0 - 1.2],
          [s.r0 * 0.24, s.z0 - 1.55],
        ],
    24,
    s.cx,
    s.cy,
  );
  parts.push(colorize(cone, (_p, c) => c.setRGB(0.025, 0.025, 0.025)));
  const disc = new THREE.CircleGeometry(capped ? s.r0 * 0.85 : s.r0 * 0.86, seg);
  disc.translate(s.cx, s.cy, capped ? zF + 0.005 : s.z0 - 1.58);
  parts.push(colorize(strip(disc), (_p, c) => c.setRGB(0.008, 0.008, 0.008)));
  return { outer: outerAll, inner: join(parts.map((g) => g)) };
}

// ---------------------------------------------------------------------------
// Intake: outer cowl + rounded lip + duct fading to the compressor face.
// ---------------------------------------------------------------------------

export interface IntakeSpec {
  /** outer control loop (CCW, full) at station z and a list of stations */
  loop: (z: number) => P2[];
  /** stations from the lip back along the outside */
  outer: number[];
  /** lip thickness */
  lip: number;
  /** duct depth behind the lip */
  depth: number;
  /** points around the loop */
  n?: number;
  /** tilt of the mouth: z offset per metre of y (raked mouths) */
  rake?: (x: number, y: number) => number;
  /** compressor face / fan radius and centre (in the duct end plane) */
  fan?: { cx: number; cy: number; r: number };
}

export function intake(s: IntakeSpec): { skin: THREE.BufferGeometry; duct: THREE.BufferGeometry } {
  const n = dense(s.n ?? 64);
  const rake = s.rake ?? (() => 0);
  const zl = s.outer[0];
  const at = (z: number) => resample(s.loop(z), n);
  const mouth = at(zl);
  const toP3 = (loop: P2[], z: number, raked = true): P3[] => loop.map(([x, y]) => [x, y, z + (raked ? rake(x, y) : 0)]);
  // lip roll: from the outside at the mouth over the lip into the duct
  const lipRings: P3[][] = [];
  const LIP = 6;
  for (let k = LIP; k >= 1; k--) {
    const th = (k / LIP) * Math.PI; // pi = inner side, 0 = outer side
    const off = -s.lip * (1 - Math.cos(th)) * 0.5;
    const dz = -Math.sin(th) * s.lip * 0.55;
    lipRings.push(toP3(offsetLoop(mouth, off), zl + dz));
  }
  // duct: inner loop shrinks slightly and fades toward the fan
  const inner0 = offsetLoop(mouth, -s.lip);
  const ductRings: P3[][] = [];
  const DN = 10;
  const fan = s.fan;
  for (let k = 0; k <= DN; k++) {
    const u = k / DN;
    const z = zl + 0.02 + u * s.depth;
    let loop = inner0;
    if (fan) {
      // morph toward a circle round the fan
      const circ: P2[] = inner0.map((_p, i) => {
        const a = Math.atan2(inner0[i][1] - fan.cy, inner0[i][0] - fan.cx);
        return [fan.cx + Math.cos(a) * fan.r, fan.cy + Math.sin(a) * fan.r];
      });
      const m = u * u * (3 - 2 * u);
      loop = inner0.map((p, i) => [p[0] + (circ[i][0] - p[0]) * m, p[1] + (circ[i][1] - p[1]) * m] as P2);
    }
    ductRings.push(toP3(loop, z, k < 2));
  }
  // outer skin rings (start at the mouth)
  const outerRings: P3[][] = s.outer.map((z, i) => toP3(at(z), z, i === 0 || z - zl < 0.6).map(([x, y, zz]) => {
    // the rake fades out over the first 0.6 m
    const f = Math.max(0, 1 - (z - zl) / 0.6);
    return [x, y, z + (zz - z) * f] as P3;
  }));
  // one continuous sheet: deep duct -> lip -> outside
  const ductRev = ductRings.slice().reverse();
  const skinSheet = skinRings([ductRev[ductRev.length - 2], ductRev[ductRev.length - 1], ...lipRings, ...outerRings]);
  const duct = colorize(skinRings(ductRev.slice(0, ductRev.length - 1), true, true, false), (p, c) => {
    const d = Math.min(1, Math.max(0, (p.z - zl) / s.depth));
    const k = 0.42 * Math.pow(1 - d, 1.8) + 0.03;
    c.setRGB(k, k, k * 1.02);
  });
  if (fan) {
    const hub = lathe(
      [
        [0.001, zl + s.depth - 0.25],
        [fan.r * 0.3, zl + s.depth - 0.05],
        [fan.r * 0.32, zl + s.depth],
      ],
      20,
      fan.cx,
      fan.cy,
    );
    const blades: THREE.BufferGeometry[] = [colorize(hub, (_p, c) => c.setRGB(0.18, 0.18, 0.2))];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const b = new THREE.BoxGeometry(fan.r * 0.66, 0.012, 0.09);
      b.rotateX(0.5);
      b.translate(fan.r * 0.64, 0, 0);
      b.rotateZ(a);
      b.translate(fan.cx, fan.cy, zl + s.depth - 0.03);
      blades.push(colorize(strip(b), (_p, c) => c.setRGB(0.12, 0.12, 0.13)));
    }
    return { skin: skinSheet, duct: join([duct, ...blades]) };
  }
  return { skin: skinSheet, duct };
}

// ---------------------------------------------------------------------------
// Wheels and landing gear
// ---------------------------------------------------------------------------

/** Tyre + hub, axle along x, centred at the origin. */
export function wheel(r: number, w: number): { tire: THREE.BufferGeometry; hub: THREE.BufferGeometry } {
  const hw = w / 2;
  // tyre cross-section (radius, x) revolved about the axle
  const prof: P2[] = [];
  const rim = r * 0.62;
  for (let k = 0; k <= 12; k++) {
    const a = -Math.PI / 2 + (k / 12) * Math.PI;
    const x = Math.sin(a) * hw;
    const rr = r - hw * 0.35 + Math.cos(a) * hw * 0.35;
    prof.push([rr, x]);
  }
  prof.unshift([rim, -hw * 0.92]);
  prof.push([rim, hw * 0.92]);
  const tire = lathe(prof, 40);
  tire.rotateY(Math.PI / 2);
  const hubProf: P2[] = [
    [0.001, -hw * 0.95],
    [r * 0.22, -hw * 0.95],
    [r * 0.26, -hw * 0.8],
    [rim * 0.98, -hw * 0.7],
    [rim * 0.98, hw * 0.7],
    [r * 0.26, hw * 0.8],
    [r * 0.22, hw * 0.95],
    [0.001, hw * 0.95],
  ];
  const hub = lathe(hubProf, 28);
  hub.rotateY(Math.PI / 2);
  // brake/hub bolt pattern
  const bolts: THREE.BufferGeometry[] = [hub];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (const sx of [-1, 1]) {
      const b = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6);
      b.rotateZ(Math.PI / 2);
      b.translate(sx * hw * 0.97, Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16);
      bolts.push(strip(b));
    }
  }
  return { tire, hub: join(bolts) };
}

export interface GearLegParts {
  meshes: THREE.Mesh[];
}

/**
 * A detailed gear leg in body coordinates: oleo strut from the top pivot down
 * to the axle, polished piston, torque links, drag brace and axle.
 */
export function strutLeg(top: THREE.Vector3, axle: THREE.Vector3, rOuter: number, braceTo: THREE.Vector3 | null, forkSide = 0): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const dir = axle.clone().sub(top);
  const L = dir.length();
  dir.normalize();
  const mid = top.clone().addScaledVector(dir, L * 0.58);
  // outer cylinder with a collar, polished piston below
  parts.push(rod(top, mid, rOuter, rOuter, 14));
  parts.push(rod(mid.clone().addScaledVector(dir, -0.04), mid.clone().addScaledVector(dir, 0.03), rOuter * 1.25, rOuter * 1.25, 14));
  const pistonEnd = axle.clone().addScaledVector(dir, -rOuter * 0.5);
  parts.push(rod(mid, pistonEnd, rOuter * 0.72, rOuter * 0.72, 14));
  // torque links (scissor) on the front
  const fwd = new THREE.Vector3(0, 0, -1);
  const kneeA = mid.clone().addScaledVector(dir, -0.12).addScaledVector(fwd, rOuter * 1.6);
  const knee = mid.clone().addScaledVector(dir, (pistonEnd.distanceTo(mid)) * 0.5).addScaledVector(fwd, rOuter * 3.2);
  const kneeB = pistonEnd.clone().addScaledVector(dir, -0.05).addScaledVector(fwd, rOuter * 1.6);
  parts.push(rod(kneeA, knee, rOuter * 0.28, rOuter * 0.28, 6));
  parts.push(rod(knee, kneeB, rOuter * 0.28, rOuter * 0.28, 6));
  // drag brace
  if (braceTo) {
    const b0 = top.clone().addScaledVector(dir, L * 0.4);
    parts.push(rod(b0, braceTo, rOuter * 0.42, rOuter * 0.42, 8));
  }
  // axle / fork
  if (forkSide !== 0) {
    parts.push(rod(pistonEnd, axle.clone().setX(axle.x + forkSide * 0.02), rOuter * 0.6, rOuter * 0.6, 10));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Ejection seat and pilot (seen through the canopy)
// ---------------------------------------------------------------------------

/** Seat + seated pilot. `eye` = pilot's eye point; `recline` in radians. */
export function seatAndPilot(eye: THREE.Vector3, recline = 0.23, martinBaker = false): { seat: THREE.BufferGeometry; flight: THREE.BufferGeometry; helmet: THREE.BufferGeometry; visor: THREE.BufferGeometry } {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), recline);
  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number) => {
    g.applyQuaternion(q);
    const o = new THREE.Vector3(x, y, z).applyQuaternion(q);
    g.translate(eye.x + o.x, eye.y + o.y, eye.z + o.z);
    return strip(g);
  };
  const seat: THREE.BufferGeometry[] = [];
  // back, headbox, pan, side rails, pack
  seat.push(place(roundBox(0.5, 0.78, 0.12, 0.03), 0, -0.52, 0.3));
  seat.push(place(roundBox(martinBaker ? 0.34 : 0.3, martinBaker ? 0.34 : 0.26, 0.18, 0.05), 0, martinBaker ? 0.02 : -0.04, 0.3));
  seat.push(place(roundBox(0.5, 0.12, 0.46, 0.03), 0, -0.93, 0.08));
  for (const sx of [-1, 1]) seat.push(place(roundBox(0.05, 0.9, 0.14, 0.015), sx * 0.26, -0.5, 0.3));
  if (martinBaker) {
    // firing handle loop between the knees
    seat.push(place(strip(new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI)), 0, -0.9, -0.16));
  }
  // pilot: torso, harness, shoulders, arms, legs, helmet with visor and mask
  const flight: THREE.BufferGeometry[] = [];
  flight.push(place(roundBox(0.42, 0.56, 0.26, 0.1), 0, -0.44, 0.13));
  for (const sx of [-1, 1]) {
    flight.push(place(roundBox(0.14, 0.14, 0.16, 0.06), sx * 0.22, -0.22, 0.12));
    flight.push(place(roundBox(0.1, 0.34, 0.12, 0.045), sx * 0.26, -0.44, 0.02));
    flight.push(place(roundBox(0.11, 0.1, 0.36, 0.045), sx * 0.2, -0.62, -0.14));
    flight.push(place(roundBox(0.15, 0.14, 0.48, 0.06), sx * 0.11, -0.86, -0.2));
    flight.push(place(roundBox(0.12, 0.44, 0.13, 0.05), sx * 0.11, -1.1, -0.44));
  }
  flight.push(place(roundBox(0.1, 0.1, 0.1, 0.04), 0, -0.14, 0.08)); // neck
  const helmet: THREE.BufferGeometry[] = [];
  const shell = new THREE.SphereGeometry(0.135, 20, 14);
  shell.scale(1, 1.08, 1.12);
  helmet.push(place(shell, 0, 0.03, 0.06));
  const visorG = new THREE.SphereGeometry(0.14, 20, 10, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.36, Math.PI * 0.28);
  visorG.rotateY(Math.PI);
  visorG.scale(1, 1.05, 1.1);
  const mask = new THREE.SphereGeometry(0.06, 12, 8);
  mask.scale(1, 1.1, 1.2);
  helmet.push(place(mask, 0, -0.07, -0.06));
  return { seat: join(seat), flight: join(flight), helmet: join(helmet), visor: place(visorG, 0, 0.03, 0.06) };
}

// ---------------------------------------------------------------------------
// Small external details
// ---------------------------------------------------------------------------

/** Blade antenna standing on a surface point, swept back. */
export function blade(base: THREE.Vector3, h: number, chord: number, up = new THREE.Vector3(0, 1, 0)): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(chord, 0);
  s.lineTo(chord * 0.95, h);
  s.lineTo(chord * 0.55, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
  g.translate(0, 0, -0.009);
  g.rotateY(-Math.PI / 2); // chord along +z, thickness along x
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up.clone().normalize()));
  g.translate(base.x, base.y, base.z);
  return strip(g);
}

/** Pitot / AoA probe: tapered tube with a base fairing, pointing forward. */
export function probe(base: THREE.Vector3, len: number, r: number, dir = new THREE.Vector3(0, 0, -1)): THREE.BufferGeometry {
  const tip = base.clone().addScaledVector(dir, len);
  const parts = [rod(base, tip, r * 1.6, r * 0.7, 10), rod(tip, tip.clone().addScaledVector(dir, len * 0.12), r * 0.7, r * 0.5, 8)];
  const f = new THREE.SphereGeometry(r * 3, 10, 8);
  f.scale(1, 1, 1.8);
  f.translate(base.x, base.y, base.z);
  parts.push(strip(f));
  return join(parts);
}

/** Flat formation-light strip lying on a surface. */
export function formationStrip(center: THREE.Vector3, normal: THREE.Vector3, along: THREE.Vector3, len: number, w = 0.06): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(len, w);
  const n = normal.clone().normalize();
  const a = along.clone().normalize();
  const b = new THREE.Vector3().crossVectors(n, a).normalize();
  const m = new THREE.Matrix4().makeBasis(a, b, n);
  g.applyMatrix4(m);
  g.translate(center.x + n.x * 0.006, center.y + n.y * 0.006, center.z + n.z * 0.006);
  return strip(g);
}

/** Body-frame geometry for the livery shader. */
export function skinned(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return stamp(g);
}

export { tube };
