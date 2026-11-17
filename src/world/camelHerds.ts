// Dune Sea: camel herds. Herds of two to seven dromedaries wander out from the
// oases along the valley floors and back, stopping now and then to stand; a few
// caravans walk the old north-south caravan track in single file. Each camel is
// an instance of one mesh (camel.ts animates the legs), placed on the sand every
// frame, drawn only within a few kilometres of the camera.

import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { buildCamel, camelMaterial, CAMEL_WALK_SPEED } from './camel';
import { duneHeight, OASES, pondRadius, ROADS, WIND_X, WIND_Z } from './desert';

interface P {
  x: number;
  z: number;
}

/** A closed route with its running length, for walking along it by distance. */
class Route {
  readonly cum: number[] = [0];
  readonly length: number;
  constructor(readonly pts: P[]) {
    for (let i = 1; i <= pts.length; i++) {
      const a = pts[i - 1], b = pts[i % pts.length];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.cum[this.cum.length - 1];
  }
  /** the point and the direction of travel at distance s along the route */
  at(s: number, out: { x: number; z: number; dx: number; dz: number }): void {
    s = ((s % this.length) + this.length) % this.length;
    let lo = 0, hi = this.pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    const a = this.pts[lo], b = this.pts[(lo + 1) % this.pts.length];
    const seg = this.cum[lo + 1] - this.cum[lo] || 1;
    const u = (s - this.cum[lo]) / seg;
    out.x = a.x + (b.x - a.x) * u;
    out.z = a.z + (b.z - a.z) * u;
    out.dx = (b.x - a.x) / seg;
    out.dz = (b.z - a.z) / seg;
  }
}

interface Member {
  /** metres behind the herd's leader along the route, and to its side */
  back: number;
  side: number;
  phase: number;
  scale: number;
  tint: THREE.Color;
  /** this camel's own stop-and-go, so a standing herd does not move as one */
  lag: number;
}

interface Herd {
  route: Route;
  s: number;
  speed: number;
  members: Member[];
  /** walking (1) or standing (0), eased between, and the time left in the current spell */
  walk: number;
  goal: number;
  spell: number;
  caravan: boolean;
}

/** Step out along the valley the herd is in: from each point try a few sideways offsets and keep the lowest sand. */
function valleyWalk(x: number, z: number, dirX: number, dirZ: number, steps: number, stepLen: number, rnd: () => number): P[] {
  const pts: P[] = [];
  for (let i = 0; i < steps; i++) {
    x += dirX * stepLen;
    z += dirZ * stepLen;
    let best = Infinity, bx = x, bz = z;
    for (let k = -3; k <= 3; k++) {
      const ox = x - dirZ * k * 120, oz = z + dirX * k * 120;
      const h = duneHeight(ox, oz) + Math.abs(k) * 6;
      if (h < best) {
        best = h;
        bx = ox;
        bz = oz;
      }
    }
    x = bx + (rnd() - 0.5) * 60;
    z = bz + (rnd() - 0.5) * 60;
    pts.push({ x, z });
  }
  return pts;
}

function buildHerds(): Herd[] {
  const rnd = mulberry32(0xca3e1);
  const herds: Herd[] = [];
  const members = (n: number, caravan: boolean): Member[] => {
    const out: Member[] = [];
    for (let i = 0; i < n; i++) {
      out.push({
        // a caravan walks nose to tail; a herd ambles in a loose bunch
        back: caravan ? i * (4.2 + rnd() * 0.8) : rnd() * 14 + (i === 0 ? 0 : 3),
        side: caravan ? (rnd() - 0.5) * 0.6 : (rnd() - 0.5) * 16,
        phase: rnd() * Math.PI * 2,
        scale: (i > 0 && !caravan && rnd() < 0.2 ? 0.72 : 0.92) + rnd() * 0.12,
        tint: new THREE.Color().setScalar(0.82 + rnd() * 0.3).multiply(new THREE.Color(1, 0.96 + rnd() * 0.06, 0.9 + rnd() * 0.12)),
        lag: rnd() * 3,
      });
    }
    return out;
  };
  // the herds: out from most of the oases along the valley (north-south, across the wind) and back
  const crestX = -WIND_Z, crestZ = WIND_X;
  for (const o of OASES) {
    const herdsHere = rnd() < 0.25 ? 2 : rnd() < 0.85 ? 1 : 0;
    for (let h = 0; h < herdsHere; h++) {
      const sd = rnd() < 0.5 ? 1 : -1;
      const a0 = rnd() * Math.PI * 2;
      const r0 = pondRadius(o, a0) * 1.4;
      const sx = o.x + Math.cos(a0) * r0, sz = o.z + Math.sin(a0) * r0;
      const steps = 6 + Math.floor(rnd() * 6);
      const out = valleyWalk(sx, sz, crestX * sd, crestZ * sd, steps, 550, rnd);
      // back by a line a little to one side, so the loop is not a single track
      const back = out.slice(0, -1).reverse().map((p) => ({ x: p.x + crestZ * sd * 180, z: p.z - crestX * sd * 180 }));
      const route = new Route([{ x: sx, z: sz }, ...out, ...back]);
      herds.push({ route, s: rnd() * route.length, speed: CAMEL_WALK_SPEED, members: members(2 + Math.floor(rnd() * 6), false), walk: 1, goal: 1, spell: 20 + rnd() * 60, caravan: false });
    }
  }
  // caravans on the old caravan track, there and back
  const track = ROADS[1];
  const there: P[] = [];
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i], b = track[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 400));
    for (let k = 0; k < n; k++) there.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  there.push(track[track.length - 1]);
  const loop = new Route([...there.map((p) => ({ x: p.x + 14, z: p.z })), ...there.slice().reverse().map((p) => ({ x: p.x - 14, z: p.z }))]);
  for (let c = 0; c < 5; c++) {
    herds.push({ route: loop, s: (c / 5 + rnd() * 0.05) * loop.length, speed: CAMEL_WALK_SPEED, members: members(5 + Math.floor(rnd() * 3), true), walk: 1, goal: 1, spell: 1e9, caravan: true });
  }
  return herds;
}

/** camels nearer than this get the full model; beyond it the light one (m) */
const NEAR = 450;
/** no camels drawn beyond this (m): at 2 m tall they are under a pixel by then */
const FAR = 6500;
const CAP = 160;

export class CamelHerds {
  private herds = buildHerds();
  private near: THREE.InstancedMesh;
  private far: THREE.InstancedMesh;
  private mat = camelMaterial();
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly p = { x: 0, z: 0, dx: 0, dz: 1 };
  /** how many camels there are in all (for the test pages) */
  readonly count: number;

  constructor(scene: THREE.Scene) {
    this.count = this.herds.reduce((n, h) => n + h.members.length, 0);
    const mk = (far: boolean) => {
      const geo = buildCamel(far);
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aWalk', new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1).setUsage(THREE.DynamicDrawUsage));
      const im = new THREE.InstancedMesh(geo, this.mat, CAP);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      im.name = far ? 'camels-far' : 'camels';
      scene.add(im);
      return im;
    };
    this.near = mk(false);
    this.far = mk(true);
  }

  update(dt: number, cam: THREE.Vector3): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.mat.setTime(this.time);
    let nn = 0, nf = 0;
    const far2 = FAR * FAR, near2 = NEAR * NEAR;
    for (const h of this.herds) {
      // a herd stops now and then to stand (a caravan never does)
      if (!h.caravan) {
        h.spell -= dt;
        if (h.spell <= 0) {
          h.goal = h.goal > 0.5 ? 0 : 1;
          h.spell = h.goal ? 40 + Math.random() * 90 : 8 + Math.random() * 25;
        }
      }
      h.walk += (h.goal - h.walk) * Math.min(1, dt * 0.8);
      h.s += h.speed * h.walk * dt;
      // (the herd is only worked out near the camera)
      h.route.at(h.s, this.p);
      const hx = this.p.x - cam.x, hz = this.p.z - cam.z;
      if (hx * hx + hz * hz > (FAR + 200) * (FAR + 200)) continue;
      for (const c of h.members) {
        h.route.at(h.s - c.back, this.p);
        const x = this.p.x - this.p.dz * c.side, z = this.p.z + this.p.dx * c.side;
        const dx = x - cam.x, dz = z - cam.z;
        const d2 = dx * dx + dz * dz + (duneHeight(x, z) - cam.y) ** 2;
        if (d2 > far2) continue;
        const isNear = d2 < near2;
        const im = isNear ? this.near : this.far;
        const i = isNear ? nn++ : nf++;
        if (i >= CAP) continue;
        // nose (-z) along the way it walks
        this.q.setFromAxisAngle(this.up, Math.atan2(-this.p.dx, -this.p.dz));
        this.v.set(x, duneHeight(x, z), z);
        this.sc.setScalar(c.scale);
        this.m.compose(this.v, this.q, this.sc);
        im.setMatrixAt(i, this.m);
        im.setColorAt(i, c.tint);
        (im.geometry.attributes.aPhase as THREE.InstancedBufferAttribute).setX(i, c.phase);
        // each camel starts and stops a moment after the one ahead of it
        const w = h.caravan ? 1 : Math.min(1, Math.max(0, h.walk * 1.4 - c.lag * 0.12));
        (im.geometry.attributes.aWalk as THREE.InstancedBufferAttribute).setX(i, w);
      }
    }
    for (const [im, n] of [[this.near, nn], [this.far, nf]] as const) {
      im.count = Math.min(n, CAP);
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.geometry.attributes.aPhase.needsUpdate = true;
      im.geometry.attributes.aWalk.needsUpdate = true;
    }
  }
}
