// BLACKBIRD: strategic reconnaissance in the SR-71A, written fresh for every
// sortie.
//
// Each mission is a small spy story. A crisis is drawn (a missile brigade gone
// to ground, a new radar, a hidden strike wing, a defector's tip, a captured
// agent, a fuel convoy), and the thing that matters is hidden at ONE of
// several candidate sites on enemy ground; the others are decoys. The jet
// carries no weapons, only sensors:
//
//   OBC camera     overfly a site wings-level: nets, tracks, fuel, guards, masts
//   IR line-scan   the same, but below 25,000 ft: are the engines warm?
//   ASARS-1 radar  fly past a site with it off your wing: metal under the trees?
//   EMR recorder   loiter in reach of a command post while its radio net is
//                  up: the decoded intercept names what to look for
//
// Put the clues together, make the call, and the order goes out: a friendly
// strike package (or a special-forces raid) hits the site you chose. Check
// the damage, then get home. Enemy radars build up a track on you all the
// while: high and fast (above 70,000 ft, past Mach 2.8) or down in the
// valleys they lose you; caught, the MiG-31s scramble, the SA-2s wake up and
// the target starts to move. And something always goes wrong: an inlet
// unstart, a fuel leak, an overheating recorder, a pop-up SAM site, a
// re-tasking from home.

import * as THREE from 'three';
import { GameMode, ModeStatus, ResultButton, braa } from './mode';
import { Aircraft } from '../../aircraft/aircraft';
import { AIPilot } from '../../ai/pilot';
import { duelSkill } from '../../ai/skill';
import { AIRFIELDS, airfieldsOf, AirfieldDef, ROLES, activeMap, mapScale } from '../../world/islands';
import { spawnOnRunway, spawnInAir, aiStores } from '../spawn';
import { NM, FT, MAP_HALF } from '../../core/constants';
import { AircraftType, COMBAT_TYPES, SPECS } from '../../aircraft/specs';
import { setMissionObjective } from '../../avionics/nav';
import { GroundUnit, GroundKind, AirDefense, DEFENSES, UNIT_DEFS } from '../ground';
import { bearingXZ } from '../../core/math';

// ---------------------------------------------------------------------------
// Random helpers
// ---------------------------------------------------------------------------

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const irnd = (a: number, b: number) => Math.floor(rnd(a, b + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function mmss(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const brg3 = (b: number) => String(Math.round(b) % 360).padStart(3, '0');

// ---------------------------------------------------------------------------
// The intel puzzle: what a site can show, and how a clue talks about it
// ---------------------------------------------------------------------------

type AttrKey = 'nets' | 'tracks' | 'fuel' | 'guards' | 'masts' | 'heat' | 'metal';
type Sensor = 'photo' | 'ir' | 'radar';

const ATTR: Record<AttrKey, { sensor: Sensor; name: string; yes: string; no: string; clue: string[] }> = {
  nets: { sensor: 'photo', name: 'NEW NETS', yes: 'fresh camouflage nets', no: 'no new camouflage', clue: ['UNDER NEW NETS', 'WHERE THE NETS ARE FRESH', 'UNDER THE NEW GREEN'] },
  tracks: { sensor: 'photo', name: 'HEAVY TRACKS', yes: 'heavy tracks churned into the ground', no: 'no heavy tracks', clue: ['WHERE THE HEAVY WHEELS WENT IN LAST NIGHT', 'WHERE THE GROUND IS CHURNED', 'AT THE END OF THE DEEP RUTS'] },
  fuel: { sensor: 'photo', name: 'FUEL', yes: 'fuel bowsers parked inside', no: 'no fuel vehicles', clue: ['WHERE THE FUEL IS WAITING', 'NEXT TO THE TANKERS', 'WHERE THE DRINKS ARE SERVED'] },
  guards: { sensor: 'photo', name: 'GUN GUARD', yes: 'a new guard post and an anti-aircraft gun', no: 'a sleepy guard post, no guns', clue: ['WHERE THE GUARD IS DOUBLED', 'BEHIND THE NEW GUNS', 'WHERE THE SENTRIES NEVER SLEEP'] },
  masts: { sensor: 'photo', name: 'RADIO MAST', yes: 'a field radio mast with its antennas up', no: 'no antennas', clue: ['WHERE THE MASTS ARE UP', 'UNDER THE TALL AERIAL', 'WHERE THE WIRES REACH THE SKY'] },
  heat: { sensor: 'ir', name: 'WARM ENGINES', yes: 'engines still warm on the IR film', no: 'everything cold on the IR film', clue: ['WHERE THE ENGINES ARE STILL WARM', 'WHERE THE MOTORS NEVER COOL', 'WHERE THE STOVES ARE LIT'] },
  metal: { sensor: 'radar', name: 'STEEL UNDER COVER', yes: 'big metal shapes under the trees on radar', no: 'no metal returns on radar', clue: ['WHERE THE STEEL HIDES UNDER THE TREES', 'WHERE THE IRON SLEEPS UNDER COVER', 'UNDER THE BRANCHES, IN STEEL'] },
};
const PHOTO_KEYS: AttrKey[] = ['nets', 'tracks', 'fuel', 'guards', 'masts'];
const ALL_KEYS: AttrKey[] = ['nets', 'tracks', 'fuel', 'guards', 'masts', 'heat', 'metal'];

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

type Ending = 'strike' | 'raid';

interface Theme {
  id: string;
  title: string;
  ending: Ending;
  /** what hides at the real site */
  asset: string;
  assetShort: string;
  siteNoun: string;
  /** units that make up the asset (also faked at the decoys) */
  units: { kind: GroundKind; n: [number, number]; label: string }[];
  story: (c: Ctx) => string;
  win: (c: Ctx) => string;
  lose: (c: Ctx) => string;
}

interface Ctx {
  op: string;
  code: string;
  enemy: string;
  person: string;
  unit: string;
  hq: string;
  n: number;
  hours: number;
  sites: string;
  real: string;
}

const OP_A = ['GIANT', 'SENIOR', 'OLYMPIC', 'GLASS', 'SILVER', 'NIGHT', 'POLAR', 'QUIET', 'HIGH', 'BLACK', 'COLD', 'SILENT', 'DARK', 'IRON'];
const OP_B = ['CROWN', 'NEEDLE', 'MIRROR', 'LANTERN', 'ORACLE', 'WINDOW', 'KEYHOLE', 'HORIZON', 'VIGIL', 'COMPASS', 'SCALE', 'GLIMPSE', 'SPECTRE', 'HALO'];
const CODE = ['SPARROW', 'NEST', 'ORCHARD', 'LULLABY', 'CANDLE', 'TEAPOT', 'HARP', 'CHAPEL', 'MAGPIE', 'LANTERN', 'THIMBLE', 'WILLOW', 'COPPER', 'GOSLING'];
const PLACES = ['KORVIN', 'ZELENY', 'VOLKOV', 'DRAVA', 'OSTRA', 'BELOGOR', 'KAMEN', 'TORVAL', 'SKALA', 'MIRNY', 'VARGA', 'ZORYA', 'KRAJ', 'LESNOY', 'BORAN', 'PETRA', 'RUDNIK', 'SOKOL', 'TISHINA', 'GRAD'];
const PEOPLE = ['COLONEL ANDREI VESNIN', 'MAJOR IRINA SOKOLOVA', 'ENGINEER PAVEL DROZD', 'CAPTAIN LEV MARKOV', 'DR. NADIA KOVAL', 'LIEUTENANT OLEG BRANKO', 'SERGEANT TOMAS HALEK'];
const AGENTS = ['CARDINAL', 'WREN', 'NIGHTJAR', 'SEXTANT', 'BISHOP', 'LOOKING GLASS', 'PILGRIM'];
const ENEMY = ['the Northern Pact', 'the Republic', 'the Coalition', 'the Federation'];
const PLACE_KIND: Record<string, string[]> = {
  scud: ['QUARRY', 'FOREST HIDE', 'TUNNEL MOUTH', 'FARM COMPOUND', 'LUMBER YARD'],
  radar: ['RIDGE', 'SUMMIT', 'HILL', 'HEIGHTS', 'LOOKOUT'],
  wing: ['ROAD STRIP', 'DISPERSAL FIELD', 'HIGHWAY STRIP', 'GRASS STRIP', 'FOREST APRON'],
  chem: ['BUNKERS', 'DEPOT', 'MINE WORKS', 'STORES', 'FACTORY'],
  agent: ['COMPOUND', 'BARRACKS', 'FARMHOUSE', 'PRISON CAMP', 'LODGE'],
  convoy: ['LAYBY', 'JUNCTION', 'MARSHALLING YARD', 'RAIL SIDING', 'FUEL DUMP'],
};

const THEMES: Theme[] = [
  {
    id: 'scud',
    title: 'MISSILE HUNT',
    ending: 'strike',
    asset: 'a brigade of SS-21 SCARAB mobile missile launchers',
    assetShort: 'THE LAUNCHERS',
    siteNoun: 'hide site',
    units: [{ kind: 'truck', n: [3, 4], label: 'MISSILE LAUNCHER' }],
    story: (c) =>
      `Two nights ago ${c.unit} drove its launchers out of garrison and vanished. Satellites lost them under cloud. Analysts say they are dug in at one of ${c.n} hide sites (${c.sites}), ${c.hours} hours from being able to fire on our airfields. The brigade talks to ${c.hq} on a command net we can break. Find out which hide is real before they are ready. Code word for the launchers: ${c.code}.`,
    win: (c) => `${c.real} burned before dawn. ${c.unit} will not be firing at anyone. Nobody outside this room will ever know how close it came.`,
    lose: (c) => `The strike hit an empty hide. At first light the launchers rolled out of ${c.real}. The generals are not happy, and the next mission just got much harder.`,
  },
  {
    id: 'radar',
    title: 'THE DARK RADAR',
    ending: 'strike',
    asset: 'a new BIG BIRD long-range early-warning radar',
    assetShort: 'THE RADAR',
    siteNoun: 'hilltop site',
    units: [
      { kind: 'ewr', n: [1, 1], label: 'BIG BIRD RADAR' },
      { kind: 'truck', n: [1, 2], label: 'POWER VAN' },
    ],
    story: (c) =>
      `${c.enemy} has built a new long-range radar, BIG BIRD, that can see our bombers three hundred miles out. They have built ${c.n} identical hilltop sites (${c.sites}) and only one of them is real: the rest are decoys made of wood and wire. Its crews report to ${c.hq}. Find the real one so the bombers can take it down. Code word: ${c.code}.`,
    win: (c) => `The radar on ${c.real} went dark in a ball of fire. The bomber stream will go in blind to them.`,
    lose: (c) => `We hit plywood. The real radar on ${c.real} is still turning, and now they know we were looking.`,
  },
  {
    id: 'wing',
    title: 'THE QUIET BUILD-UP',
    ending: 'strike',
    asset: 'a squadron of strike jets dispersed for a surprise raid',
    assetShort: 'THE STRIKE JETS',
    siteNoun: 'dispersal strip',
    units: [{ kind: 'jet', n: [3, 3], label: 'PARKED JET' }],
    story: (c) =>
      `A strike squadron of ${c.enemy} slipped out of its home base three days ago. It is hiding at one of ${c.n} dispersal strips (${c.sites}), fuelling and arming for a raid on our ports, perhaps within ${c.hours} hours. Its orders come from ${c.hq}. Find the real strip and we will catch them on the ground. Code word: ${c.code}.`,
    win: (c) => `The jets at ${c.real} never left the ground. The raid is off.`,
    lose: (c) => `The strikers hit a strip full of painted canvas. The real squadron at ${c.real} took off an hour later.`,
  },
  {
    id: 'chem',
    title: 'THE DEFECTOR',
    ending: 'strike',
    asset: 'a store of chemical shells',
    assetShort: 'THE SHELLS',
    siteNoun: 'bunker complex',
    units: [
      { kind: 'bunker', n: [2, 2], label: 'STORAGE BUNKER' },
      { kind: 'ammo', n: [1, 2], label: 'SHELL STACK' },
    ],
    story: (c) =>
      `${c.person} walked into our embassy last night with a terrible story: ${c.enemy} has moved chemical shells to the front, to one of ${c.n} bunker complexes (${c.sites}). The defector does not know which. Their message traffic goes through ${c.hq}. Find the shells and they will never be fired. Code word: ${c.code}.`,
    win: (c) => `The bunkers at ${c.real} are rubble, and the shells inside were destroyed before they could be used. ${c.person} has been told.`,
    lose: (c) => `We hit the wrong bunkers. The shells at ${c.real} were moved again by morning.`,
  },
  {
    id: 'agent',
    title: 'LOST AGENT',
    ending: 'raid',
    asset: `our agent`,
    assetShort: 'THE AGENT',
    siteNoun: 'compound',
    units: [
      { kind: 'hq', n: [1, 1], label: 'HOLDING BUILDING' },
      { kind: 'barracks', n: [1, 2], label: 'BARRACKS' },
    ],
    story: (c) =>
      `Our agent ${c.code} was taken by the security police two days ago. A special-forces team is waiting to go in, but it can only go once, to one of ${c.n} places the police use (${c.sites}). Their radio traffic runs through ${c.hq}. Find the right compound, then watch over the raid. Code word for the agent: ${c.code}.`,
    win: (c) => `The team went into ${c.real} and came out with ${c.code}, alive. The helicopters were over the border before the alarm was raised.`,
    lose: (c) => `The raid found an empty building. ${c.code} was at ${c.real} all along, and now they will move again.`,
  },
  {
    id: 'convoy',
    title: 'THE CONVOY',
    ending: 'strike',
    asset: 'a fuel convoy for the spring offensive',
    assetShort: 'THE CONVOY',
    siteNoun: 'laager',
    units: [
      { kind: 'truck', n: [4, 5], label: 'FUEL TRUCK' },
      { kind: 'fuel', n: [1, 1], label: 'FUEL TANK' },
    ],
    story: (c) =>
      `${c.enemy}'s spring offensive needs fuel, and a great convoy is moving it to the front by night, stopping by day at one of ${c.n} laagers (${c.sites}). Cut it, and the offensive stalls. The convoy reports to ${c.hq} each evening. Find where it is hiding today. Code word: ${c.code}.`,
    win: (c) => `The fuel at ${c.real} burned for a day and a night. The offensive will not start this spring.`,
    lose: (c) => `The strike missed the convoy. It reached the front from ${c.real} the next night.`,
  },
];

// ---------------------------------------------------------------------------
// Mission data
// ---------------------------------------------------------------------------

interface Site {
  letter: string;
  name: string;
  x: number;
  z: number;
  real: boolean;
  attrs: Record<AttrKey, boolean>;
  known: Partial<Record<AttrKey, boolean>>;
  /** sensor passes done */
  photo: boolean;
  ir: boolean;
  radar: boolean;
  /** passes in progress (s) */
  photoT: number;
  irT: number;
  radarT: number;
  /** cloud over it: cameras only work underneath (below 10,000 ft) */
  cloud: boolean;
  units: GroundUnit[];
  struck: boolean;
}

interface Emitter {
  name: string;
  x: number;
  z: number;
  /** recording 0..1 */
  progress: number;
  done: boolean;
  /** the radio net is up for `on` s of every `period` s */
  period: number;
  on: number;
  phase: number;
  /** the clue keys this net gives away */
  keys: AttrKey[];
  units: GroundUnit[];
}

interface Radar {
  name: string;
  pos: THREE.Vector3;
  range: number;
  unit: GroundUnit | null;
}

interface Retask {
  name: string;
  x: number;
  z: number;
  deadline: number;
  done: boolean;
  failed: boolean;
  t: number;
  units: GroundUnit[];
}

type Phase = 'collect' | 'execute' | 'bda' | 'overwatch' | 'egress' | 'done';
type Problem = 'unstart' | 'leak' | 'recorder' | 'sa2' | 'retask';

export class ReconMode extends GameMode {
  private theme!: Theme;
  private ctx!: Ctx;
  private sites: Site[] = [];
  private keys: AttrKey[] = [];
  /** keys known from the start (the defector's tip) */
  private tipKeys: AttrKey[] = [];
  private emitters: Emitter[] = [];
  private radars: Radar[] = [];
  private samSites: { def: AirDefense[]; active: boolean; x: number; z: number; name: string }[] = [];
  private phase: Phase = 'collect';
  private choice: Site | null = null;
  private detection = 0;
  private maxMach = 0;
  private maxAlt = 0;
  private peakDetection = 0;
  private level = 0;
  private compromised = false;
  private moveDeadline = -1;
  private problems: { kind: Problem; at: number; fired: boolean }[] = [];
  private unstart = { t: 0, engine: -1 };
  private leak = false;
  private recorderHeat = -1;
  private recorderOver = 0;
  private retask: Retask | null = null;
  private strikers: Aircraft[] = [];
  private strikeImpact = -1;
  private strikeLaunched = false;
  private eyesOn = false;
  private overwatchT = 0;
  private interceptors: Aircraft[] = [];
  private scrambled = false;
  private deadTimer = 0;
  private endTimer = -1;
  private assessAsked = false;
  private assessCooldown = 0;
  private home!: AirfieldDef;
  private intelLog: string[] = [];
  private seenMsgT = 0;
  private outOfArea = 0;

  start(): void {
    this.setup();
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  private enemySide(x: number, z: number): boolean {
    const b = ROLES.blueHome, r = ROLES.redHome;
    return Math.hypot(x - r.cx, z - r.cz) < Math.hypot(x - b.cx, z - b.cz) * 1.05;
  }

  /** Spots on enemy land, flat enough to build on, spread apart. */
  private findSpots(n: number, minSep: number, avoid: { x: number; z: number }[], hill = false): { x: number; z: number }[] {
    const grid = this.host.sim.grid;
    const lim = MAP_HALF * 0.86;
    const out: { x: number; z: number }[] = [];
    const blue = airfieldsOf('blue');
    for (let tries = 0; tries < 6000 && out.length < n; tries++) {
      const x = rnd(-lim, lim), z = rnd(-lim, lim);
      if (!this.enemySide(x, z)) continue;
      const h = grid.height(x, z);
      if (h < 8 || h > activeMap.maxTerrain * (hill ? 0.75 : 0.5)) continue;
      if (AIRFIELDS.some((f) => Math.hypot(f.x - x, f.z - z) < 6000)) continue;
      if (blue.some((f) => Math.hypot(f.x - x, f.z - z) < 30 * NM * mapScale())) continue;
      if ([...out, ...avoid].some((p) => Math.hypot(p.x - x, p.z - z) < minSep)) continue;
      // build on level-ish ground (hills for radars)
      let lo = h, hi = h, water = false;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const hh = grid.height(x + Math.cos(a) * 260, z + Math.sin(a) * 260);
        if (hh < 3) water = true;
        lo = Math.min(lo, hh);
        hi = Math.max(hi, hh);
      }
      if (water || (!hill && hi - lo > 45)) continue;
      out.push({ x, z });
    }
    // a small map may run out of room: relax the spacing
    if (out.length < n && minSep > 3000) return out.concat(this.findSpots(n - out.length, minSep * 0.6, [...avoid, ...out], hill));
    while (out.length < n) {
      const f = pick(airfieldsOf('red'));
      out.push({ x: f.x + rnd(-9000, 9000), z: f.z + rnd(-9000, 9000) });
    }
    return out;
  }

  private place(kind: GroundKind, x: number, z: number, label?: string, rot = rnd(0, 6.28)): GroundUnit {
    const y = Math.max(0, this.host.sim.grid.height(x, z));
    const u = new GroundUnit(kind, new THREE.Vector3(x, y, z), rot, false, label ?? UNIT_DEFS[kind].name);
    this.host.sim.ground.push(u);
    return u;
  }

  /** A little camp at (x, z): units in a loose cluster, the layout turned at random. */
  private cluster(x: number, z: number, list: { kind: GroundKind; label?: string }[], spread = 70): GroundUnit[] {
    const rot = rnd(0, Math.PI * 2);
    const c = Math.cos(rot), s = Math.sin(rot);
    return list.map((it, i) => {
      const a = (i / list.length) * Math.PI * 2 + rnd(-0.3, 0.3);
      const r = spread * (0.35 + 0.65 * ((i * 0.618) % 1));
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      return this.place(it.kind, x + lx * c - lz * s, z + lx * s + lz * c, it.label, rot + rnd(-0.4, 0.4));
    });
  }

  private skill(): number {
    return { EASY: 0.25, MEDIUM: 0.45, HARD: 0.7, EXTREME: 0.92 }[this.host.config.difficulty];
  }

  private setup(): void {
    this.maxMach = 0;
    this.maxAlt = 0;
    const h = this.host;
    const sim = h.sim;
    sim.ground.length = 0;
    sim.defenses.length = 0;
    sim.groundSites.length = 0;
    sim.groundGen++;
    this.sites = [];
    this.emitters = [];
    this.radars = [];
    this.samSites = [];
    this.problems = [];
    this.strikers = [];
    this.interceptors = [];
    this.intelLog = [];
    this.phase = 'collect';
    this.choice = null;
    this.detection = 0;
    this.peakDetection = 0;
    this.level = 0;
    this.compromised = false;
    this.moveDeadline = -1;
    this.unstart = { t: 0, engine: -1 };
    this.leak = false;
    this.recorderHeat = -1;
    this.recorderOver = 0;
    this.retask = null;
    this.strikeImpact = -1;
    this.strikeLaunched = false;
    this.eyesOn = false;
    this.overwatchT = 0;
    this.scrambled = false;
    this.deadTimer = 0;
    this.endTimer = -1;
    this.assessAsked = false;
    this.assessCooldown = 0;
    this.elapsed = 0;
    this.over = false;
    this.outOfArea = 0;
    const diff = h.config.difficulty;
    const lvl = { EASY: 0, MEDIUM: 1, HARD: 2, EXTREME: 3 }[diff];

    // --- the story ---
    this.theme = pick(THEMES);
    const T = this.theme;
    const n = Math.random() < 0.25 ? 4 : Math.random() < 0.15 ? 2 : 3;
    const kinds = shuffle([...PLACE_KIND[T.id]]);
    const places = shuffle([...PLACES]);
    const letters = ['A', 'B', 'C', 'D'];
    const k = mapScale();
    const spots = this.findSpots(n + 1, 34000 * k, []);
    const hqSpot = spots.pop()!;
    // the clue: two features only the real site has; each decoy shows one of them
    const sensorsAvail: AttrKey[] = shuffle([...PHOTO_KEYS]);
    // sometimes the clue needs the IR scanner or the radar
    if (Math.random() < 0.45) sensorsAvail.unshift(pick(['heat', 'metal'] as AttrKey[]));
    this.keys = sensorsAvail.slice(0, 2);
    const realIdx = Math.floor(Math.random() * n);
    for (let i = 0; i < n; i++) {
      const attrs = {} as Record<AttrKey, boolean>;
      for (const a of ALL_KEYS) attrs[a] = Math.random() < 0.45;
      if (i === realIdx) {
        attrs[this.keys[0]] = true;
        attrs[this.keys[1]] = true;
      } else {
        // a decoy matches one key, never both (so you need both clues)
        const one = Math.random() < 0.5 ? 0 : 1;
        attrs[this.keys[one]] = Math.random() < 0.8;
        attrs[this.keys[1 - one]] = false;
      }
      const sp = spots[i];
      this.sites.push({
        letter: letters[i],
        name: `${places[i]} ${kinds[i % kinds.length]}`,
        x: sp.x,
        z: sp.z,
        real: i === realIdx,
        attrs,
        known: {},
        photo: false,
        ir: false,
        radar: false,
        photoT: 0,
        irT: 0,
        radarT: 0,
        cloud: false,
        units: [],
        struck: false,
      });
    }
    const real = this.sites[realIdx];
    const hqName = `${places[n]} ${pick(['SIGNALS POST', 'COMMAND POST', 'REGIONAL HQ', 'RELAY STATION'])}`;
    this.ctx = {
      op: `OPERATION ${pick(OP_A)} ${pick(OP_B)}`,
      code: pick(T.id === 'agent' ? AGENTS : CODE),
      enemy: pick(ENEMY),
      person: pick(PEOPLE),
      unit: `the ${irnd(11, 98)}th Missile Brigade`,
      hq: hqName,
      n,
      hours: irnd(18, 60),
      sites: this.sites.map((s) => s.name).join(', '),
      real: real.name,
    };

    // --- build the sites: the asset (real or faked) plus what each shows ---
    for (const s of this.sites) {
      const list: { kind: GroundKind; label?: string }[] = [];
      for (const u of T.units) for (let i = 0; i < irnd(u.n[0], u.n[1]); i++) list.push({ kind: u.kind, label: s.real ? u.label : `${u.label} (?)` });
      if (s.attrs.nets) for (let i = 0; i < irnd(3, 4); i++) list.push({ kind: 'tent', label: 'CAMOUFLAGE NET' });
      if (s.attrs.tracks) for (let i = 0; i < 2; i++) list.push({ kind: Math.random() < 0.5 ? 'apc' : 'tank' });
      if (s.attrs.fuel) list.push({ kind: 'fuel', label: 'FUEL BOWSER' });
      if (s.attrs.masts) list.push({ kind: 'mast', label: 'RADIO MAST' });
      if (s.attrs.guards) list.push({ kind: 'barracks', label: 'GUARD POST' });
      list.push({ kind: 'truck' });
      s.units = this.cluster(s.x, s.z, list);
      if (s.attrs.guards) {
        // a light AA gun: dangerous only to a jet that comes down low
        const u = this.place('aaa', s.x + rnd(-120, 120), s.z + rnd(-120, 120), 'ZSU-23-4');
        const d = new AirDefense(DEFENSES.ZSU, u, this.skill());
        u.defense = d;
        sim.defenses.push(d);
        s.units.push(u);
      }
      for (const u of s.units) if (u.kind === 'jet') u.jetType = pick(['SU35', 'MIG31'] as AircraftType[]);
      sim.groundSites.push({ x: s.x, z: s.z, r: 200 });
    }
    // weather: one site may sit under cloud (cameras only below the deck)
    if (Math.random() < 0.5) pick(this.sites).cloud = true;

    // --- the command post whose radio net gives the clue ---
    const hqUnits = this.cluster(hqSpot.x, hqSpot.z, [{ kind: 'hq', label: hqName }, { kind: 'mast', label: 'ANTENNA FARM' }, { kind: 'mast' }, { kind: 'bunker' }, { kind: 'barracks' }, { kind: 'truck' }], 90);
    sim.groundSites.push({ x: hqSpot.x, z: hqSpot.z, r: 220 });
    // sometimes a defector already gave one half of the clue
    if (T.id === 'chem' || Math.random() < 0.25) this.tipKeys = [this.keys[0]];
    else this.tipKeys = [];
    const netKeys = this.keys.filter((x) => !this.tipKeys.includes(x));
    if (netKeys.length === 2 && Math.random() < 0.5) {
      // two nets, each giving half the clue
      const spot2 = this.findSpots(1, 30000 * k, [...this.sites, hqSpot])[0];
      const n2 = `${places[n + 1]} ${pick(['RADIO RELAY', 'SIGNALS STATION', 'MOUNTAIN RELAY'])}`;
      const u2 = this.cluster(spot2.x, spot2.z, [{ kind: 'mast', label: n2 }, { kind: 'mast' }, { kind: 'bunker' }, { kind: 'truck' }], 60);
      this.emitters.push(this.makeEmitter(hqName, hqSpot, [netKeys[0]], hqUnits));
      this.emitters.push(this.makeEmitter(n2, spot2, [netKeys[1]], u2));
    } else this.emitters.push(this.makeEmitter(hqName, hqSpot, netKeys, hqUnits));

    // --- the radars watching for you ---
    const ewrN = 2 + (lvl >= 2 ? 1 : 0);
    const ewrSpots = this.findSpots(ewrN, 40000 * k, [...this.sites, hqSpot], true);
    ewrSpots.forEach((sp, i) => {
      const u = this.cluster(sp.x, sp.z, [{ kind: 'ewr', label: `EW RADAR ${i + 1}` }, { kind: 'barracks' }, { kind: 'truck' }], 50)[0];
      this.radars.push({ name: `${places[(n + 2 + i) % places.length]} EW RADAR`, pos: u.pos.clone().setY(u.pos.y + 30), range: 260000 * Math.max(0.6, k), unit: u });
    });
    for (const f of airfieldsOf('red')) this.radars.push({ name: `${f.name} GCI`, pos: new THREE.Vector3(f.x, f.elev + 260, f.z), range: 220000 * Math.max(0.6, k), unit: null });
    // SA-2 batteries: one covers the real site's area, more on harder settings; asleep until you are tracked
    const samN = 1 + (lvl >= 1 ? 1 : 0) + (lvl >= 3 ? 1 : 0);
    const near = [real, ...shuffle(this.sites.filter((s) => !s.real))];
    for (let i = 0; i < samN; i++) {
      const c = near[i % near.length];
      const a = rnd(0, Math.PI * 2), r = rnd(9000, 16000) * Math.max(0.6, k);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (this.host.sim.grid.height(x, z) < 3) continue;
      const radar = this.place('samRadar', x, z, 'FAN SONG RADAR');
      const defs: AirDefense[] = [];
      for (let j = 0; j < irnd(3, 4); j++) {
        const aa = (j / 4) * Math.PI * 2;
        const u = this.place('sam', x + Math.cos(aa) * 140, z + Math.sin(aa) * 140, `SA-2 LAUNCHER ${j + 1}`, -aa);
        const d = new AirDefense(DEFENSES.SA2, u, this.skill());
        d.radar = radar;
        u.defense = d;
        defs.push(d);
      }
      sim.groundSites.push({ x, z, r: 200 });
      this.samSites.push({ def: defs, active: false, x, z, name: `SA-2 SITE NEAR ${c.name}` });
      this.radars.push({ name: 'FAN SONG', pos: radar.pos.clone().setY(radar.pos.y + 10), range: 70000, unit: radar });
    }

    // --- the trouble ahead (2 or 3 problems, at random times) ---
    const pool: Problem[] = shuffle(['unstart', 'leak', 'recorder', 'sa2', 'retask']);
    const np = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < np; i++) this.problems.push({ kind: pool[i], at: rnd(70, 260) + i * 60, fired: false });

    // --- the jet and where it starts ---
    const blue = airfieldsOf('blue');
    this.home = blue.reduce((a, b) => (Math.hypot(a.x - real.x, a.z - real.z) > Math.hypot(b.x - real.x, b.z - real.z) ? b : a));
    const p = h.createPlayer();
    const center = this.sites.reduce((acc, s) => acc.add(new THREE.Vector3(s.x, 0, s.z)), new THREE.Vector3()).multiplyScalar(1 / n);
    if (Math.random() < 0.18) {
      spawnOnRunway(p, this.home);
    } else {
      // coming in high and fast from the friendly side, after the tanker
      const b = ROLES.blueHome;
      const ang = Math.atan2(b.cz - center.z, b.cx - center.x) + rnd(-0.5, 0.5);
      const d = rnd(0.55, 0.75) * MAP_HALF;
      let x = center.x + Math.cos(ang) * d, z = center.z + Math.sin(ang) * d;
      x = THREE.MathUtils.clamp(x, -MAP_HALF * 0.95, MAP_HALF * 0.95);
      z = THREE.MathUtils.clamp(z, -MAP_HALF * 0.95, MAP_HALF * 0.95);
      const alt = rnd(68000, 76000) * FT;
      spawnInAir(p, new THREE.Vector3(x, alt, z), bearingXZ(x, z, center.x, center.z), 1650);
      // already in the burner, cruising
      p.controls.throttle = 1.1;
    }
    h.sim.add(p);
    h.refreshStores(p);
    h.picture.gciEnabled.blue = true;
    h.picture.gciEnabled.red = false;
    this.steer();
    this.brief(p);
  }

  private makeEmitter(name: string, at: { x: number; z: number }, keys: AttrKey[], units: GroundUnit[]): Emitter {
    return { name, x: at.x, z: at.z, progress: 0, done: false, period: rnd(45, 80), on: rnd(0.45, 0.7), phase: rnd(0, 100), keys, units };
  }

  private brief(p: Aircraft): void {
    const h = this.host;
    const T = this.theme, C = this.ctx;
    const d = (x: number, z: number) => `${Math.round(Math.hypot(p.fm.pos.x - x, p.fm.pos.z - z) / NM)} NM / ${brg3(bearingXZ(p.fm.pos.x, p.fm.pos.z, x, z))}`;
    const sites = this.sites.map((s) => `${s.letter}: ${s.name} (${d(s.x, s.z)})${s.cloud ? ' — under cloud' : ''}`).join(' · ');
    const tip = this.tipKeys.length
      ? ` ${T.id === 'chem' ? C.person : 'A source inside the ministry'} has already told us one thing: ${T.assetShort.toLowerCase()} will be ${ATTR[this.tipKeys[0]].clue[0].toLowerCase()}.`
      : '';
    const nets = this.emitters.map((e) => `${e.name} (${d(e.x, e.z)})`).join(' and ');
    const start = p.fm.onGround ? `You launch from ${this.home.name}: a long take-off roll, then climb and accelerate past Mach 2.5 before you cross the line.` : `You are already in the air, ${Math.round(p.fm.pos.y / FT / 1000)},000 ft, Mach ${(p.fm.vel.length() / 295).toFixed(1)}, coming off the tanker.`;
    h.brief?.({
      kicker: `BLACKBIRD · ${C.op} · ${T.title}`,
      title: `FIND ${T.assetShort}`,
      story: `${T.story(C)}${tip} ${start}`,
      heading: 'YOUR ORDERS',
      tasks: [
        `Candidate ${T.siteNoun}s — ${sites}.`,
        `Intercept the radio net at ${nets}: fly within reach while the net is up (above 30,000 ft) and the recorder fills. The decoded traffic tells you what to look for.`,
        'Photograph each site: pass over it wings-level (the camera sees a wide strip below you, wider the higher you are). Fly below 25,000 ft over a site and the IR film shows warm engines. Fly past a site with it off your wingtip, 5 to 60 km away, wings level, and the ASARS radar finds metal under the trees. Cloud blinds the cameras, never the radar.',
        `When you have enough, you make the call: which site is real. Then ${T.ending === 'strike' ? 'a strike package goes in on it; photograph the damage afterwards.' : 'the raid team goes in; watch over it from above.'}`,
        `Get home: back to the recovery area at ${this.home.name}.`,
        'Stay unseen: enemy radars build a track on you (DETECTION, top of the screen). Above 70,000 ft and past Mach 2.8 they can barely hold you; down low the mountains hide you. Get caught and the MiG-31s scramble, the SA-2s wake up and the target starts to move.',
      ],
      footer: `The SR-71 is unarmed. Every mission is different: new story, sites, clues, right answer and trouble. Difficulty: ${h.config.difficulty}.`,
      onOk: () => {
        h.order(`${C.op} — ${p.fm.onGround ? 'CLEARED FOR TAKEOFF' : 'PRESS ON'}`, `Find ${T.assetShort.toLowerCase()}: ${this.sites.length} candidate ${T.siteNoun}s. Steerpoint 1 shows the next site.`, 10);
        h.voice(p.fm.onGround ? 'Cleared for takeoff' : 'Press on');
      },
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private log(text: string, kind: 'info' | 'good' | 'warn' | 'bad' | 'order' | 'gci' = 'info', sec = 7): void {
    this.intelLog.push(text);
    this.host.message(text, kind, sec);
  }

  /** What a site has shown so far, for the given keys. */
  private knownText(s: Site, keys: AttrKey[]): string {
    return keys.map((k) => `${ATTR[k].name} ${s.known[k] === undefined ? '?' : s.known[k] ? 'YES' : 'NO'}`).join(' · ');
  }

  private clueKnown(): AttrKey[] {
    return [...this.tipKeys, ...this.emitters.filter((e) => e.done).flatMap((e) => e.keys)];
  }

  /** Steer to whatever is next. */
  private steer(): void {
    const p = this.host.player;
    let tgt: { name: string; x: number; z: number } | null = null;
    if (this.phase === 'collect') {
      const want: { name: string; x: number; z: number }[] = [];
      for (const e of this.emitters) if (!e.done) want.push({ name: e.name, x: e.x, z: e.z });
      for (const s of this.sites) if (!s.photo || this.needs(s)) want.push({ name: s.name, x: s.x, z: s.z });
      if (this.retask && !this.retask.done && !this.retask.failed) want.unshift({ name: this.retask.name, x: this.retask.x, z: this.retask.z });
      if (p && want.length) tgt = want.reduce((a, b) => (Math.hypot(a.x - p.fm.pos.x, a.z - p.fm.pos.z) < Math.hypot(b.x - p.fm.pos.x, b.z - p.fm.pos.z) ? a : b));
    } else if ((this.phase === 'execute' || this.phase === 'bda' || this.phase === 'overwatch') && this.choice) tgt = this.choice;
    else if (this.phase === 'egress') tgt = { name: this.home.name, x: this.home.x, z: this.home.z };
    setMissionObjective(tgt ? { name: tgt.name, short: this.phase === 'egress' ? 'HOME' : 'RECON', x: tgt.x, z: tgt.z } : null);
  }

  /** Does this site still need a sensor the clue calls for? */
  private needs(s: Site): boolean {
    for (const k of this.clueKnown()) {
      const sen = ATTR[k].sensor;
      if (s.known[k] === undefined && ((sen === 'ir' && !s.ir) || (sen === 'radar' && !s.radar) || (sen === 'photo' && !s.photo))) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // The sensors
  // -------------------------------------------------------------------------

  private sensors(dt: number, p: Aircraft): void {
    const fm = p.fm;
    const level = Math.abs(fm.bank) < 15 && Math.abs(fm.pitchAngle) < 25;
    const agl = fm.pos.y - Math.max(0, this.host.sim.grid.height(fm.pos.x, fm.pos.z));
    const swath = THREE.MathUtils.clamp(agl * 0.9, 2500, 26000);
    const hdg = Math.atan2(fm.fwd.x, -fm.fwd.z);
    const scan = (s: { x: number; z: number }) => {
      const dx = s.x - fm.pos.x, dz = s.z - fm.pos.z;
      const d = Math.hypot(dx, dz);
      const b = Math.atan2(dx, -dz);
      let rel = Math.abs(((b - hdg + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (rel > Math.PI) rel = Math.PI * 2 - rel;
      return { d, rel };
    };
    const sites: (Site | Retask)[] = [...this.sites];
    for (const s of this.sites) {
      const { d, rel } = scan(s);
      const underCloud = s.cloud && agl > 3000;
      // the camera: wings level, the site in the strip below
      if (level && d < swath && !underCloud) {
        if (!s.photo) {
          s.photoT += dt;
          if (s.photoT > 1.2) {
            s.photo = true;
            for (const k of PHOTO_KEYS) s.known[k] = s.attrs[k];
            const seen = PHOTO_KEYS.filter((k) => s.attrs[k]).map((k) => ATTR[k].yes);
            this.log(`PHOTO — ${s.letter} ${s.name}: ${seen.length ? seen.join(', ') : 'nothing out of the ordinary'}.`, 'good', 9);
            this.host.voice('Photo run complete');
          }
        }
        // IR line-scan works low
        if (!s.ir && agl < 7600) {
          s.irT += dt;
          if (s.irT > 1.0) {
            s.ir = true;
            s.known.heat = s.attrs.heat;
            this.log(`IR — ${s.letter} ${s.name}: ${s.attrs.heat ? ATTR.heat.yes : ATTR.heat.no}.`, 'good', 8);
          }
        }
      } else if (level && d < swath && underCloud && !s.photo && this.elapsed - this.seenMsgT > 12) {
        this.seenMsgT = this.elapsed;
        this.host.message(`${s.letter} ${s.name} IS UNDER CLOUD: THE CAMERAS SEE NOTHING. GO BELOW 10,000 FT, OR USE THE RADAR.`, 'warn', 6);
      }
      // the side-looking radar: the site off a wingtip, 5 to 60 km out
      if (!s.radar && level && d > 5000 && d < 60000 * Math.max(0.7, mapScale()) && rel > (50 * Math.PI) / 180 && rel < (130 * Math.PI) / 180) {
        s.radarT += dt;
        if (s.radarT > 5) {
          s.radar = true;
          s.known.metal = s.attrs.metal;
          this.log(`ASARS — ${s.letter} ${s.name}: ${s.attrs.metal ? ATTR.metal.yes : ATTR.metal.no}.`, 'good', 8);
        }
      }
    }
    // the re-tasked target: a camera pass before the deadline
    const r = this.retask;
    if (r && !r.done && !r.failed) {
      const { d } = scan(r);
      if (level && d < swath) {
        r.t += dt;
        if (r.t > 1.2) {
          r.done = true;
          this.log(`PHOTO — ${r.name}: got it, ${mmss(r.deadline - this.elapsed)} to spare. HQ is pleased.`, 'good', 8);
          this.host.voice('Photo run complete');
        }
      } else if (this.elapsed > r.deadline) {
        r.failed = true;
        this.log(`TOO LATE: ${r.name} HAS MOVED ON.`, 'bad', 7);
      }
    }
    void sites;
    // the radio nets
    for (const e of this.emitters) {
      if (e.done) continue;
      const up = ((this.elapsed + e.phase) % e.period) / e.period < e.on;
      const d = Math.hypot(e.x - fm.pos.x, e.z - fm.pos.z);
      const reach = 95000 * Math.max(0.6, mapScale());
      if (up && d < reach && fm.pos.y > 30000 * FT) {
        const before = e.progress;
        e.progress = Math.min(1, e.progress + dt / 30);
        if (before < 0.5 && e.progress >= 0.5) this.host.message(`EMR: ${e.name} NET 50% RECORDED.`, 'info', 4);
        if (e.progress >= 1) {
          e.done = true;
          const text = e.keys.map((k) => pick(ATTR[k].clue)).join(' AND ');
          this.log(`INTERCEPT DECODED (${e.name}): "${this.ctx.code} IS ${text}." — Look for ${e.keys.map((k) => ATTR[k].name).join(' + ')}.`, 'order', 14);
          this.host.voice('Intercept decoded');
          const needIr = e.keys.includes('heat'), needRadar = e.keys.includes('metal');
          if (needIr) this.host.message('ANALYST: WARM ENGINES ONLY SHOW ON IR FILM. PASS OVER THE SITES BELOW 25,000 FT.', 'info', 10);
          if (needRadar) this.host.message('ANALYST: STEEL UNDER COVER NEEDS THE ASARS RADAR. PASS THE SITES OFF YOUR WINGTIP.', 'info', 10);
          if (this.problems.some((p) => p.kind === 'recorder' && !p.fired)) {
            // the recorder overheats with the tapes in it
            const pr = this.problems.find((p) => p.kind === 'recorder')!;
            pr.at = this.elapsed + 2;
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Detection
  // -------------------------------------------------------------------------

  private detect(dt: number, p: Aircraft): number {
    const fm = p.fm;
    const sim = this.host.sim;
    const agl = fm.pos.y - Math.max(0, sim.grid.height(fm.pos.x, fm.pos.z));
    const altFt = fm.pos.y / FT;
    let band = 1;
    if (altFt > 70000 && fm.mach > 2.8) band = 0.15;
    else if (altFt > 60000 && fm.mach > 2.2) band = 0.4;
    else if (agl < 450) band = 0.3;
    let rate = 0;
    let seenBy = '';
    for (const r of this.radars) {
      if (r.unit && !r.unit.alive) continue;
      const d = r.pos.distanceTo(fm.pos);
      if (d > r.range) continue;
      if (!sim.lineOfSight(r.pos, fm.pos)) continue;
      const k = Math.pow(1 - d / r.range, 0.6);
      const add = 2.2 * k * band * (p.spec.rcs / 1.0);
      if (add > rate * 0.5) seenBy = r.name;
      rate += add;
    }
    // troops see and hear a low jet; a sonic boom over a site gives you away
    for (const s of [...this.sites, ...this.emitters]) {
      const d = Math.hypot(s.x - fm.pos.x, s.z - fm.pos.z);
      if (agl < 900 && d < 3500) {
        rate += 6;
        seenBy = 'TROOPS ON THE GROUND';
      }
      if (fm.mach > 1.05 && agl < 12000 && d < 6000) {
        rate += 10 * (1 - agl / 12000);
        seenBy = 'YOUR SONIC BOOM';
      }
    }
    // the operators lose interest in a faint, fleeting contact
    const fade = this.detection > 50 ? 0.6 : 1.2;
    this.detection = THREE.MathUtils.clamp(this.detection + (rate - fade) * dt, this.compromised ? 55 : 0, 100);
    this.peakDetection = Math.max(this.peakDetection, this.detection);
    // levels: CLEAN, SUSPECTED, TRACKED, COMPROMISED
    const lvl = this.detection >= 85 ? 3 : this.detection >= 55 ? 2 : this.detection >= 25 ? 1 : 0;
    if (lvl > this.level) {
      if (lvl === 1) this.host.message(`DEF: ${seenBy || 'A RADAR'} HAS A SNIFF OF YOU. THEIR RADIOS ARE BUSY.`, 'warn', 7);
      if (lvl === 2) {
        this.host.message(`DEF: TRACKED BY ${seenBy || 'ENEMY RADAR'}. INTERCEPTORS AND SAMS WILL BE COMING.`, 'bad', 8);
        this.host.voice('You are being tracked');
        this.wakeDefences(p);
      }
      if (lvl === 3 && !this.compromised) {
        this.compromised = true;
        this.wakeDefences(p);
        if (this.phase === 'collect') {
          this.moveDeadline = this.elapsed + 270 * Math.max(0.7, Math.sqrt(mapScale()));
          this.log(`COMPROMISED: THEY KNOW WE ARE LOOKING. ${this.theme.assetShort} WILL MOVE IN ${mmss(this.moveDeadline - this.elapsed)}: MAKE THE CALL BEFORE THEN.`, 'bad', 12);
          this.host.voice('Compromised');
        }
      }
    }
    this.level = lvl;
    return rate;
  }

  /** Caught: the SA-2s wake up and the interceptors scramble. */
  private wakeDefences(p: Aircraft): void {
    const h = this.host;
    for (const s of this.samSites) {
      if (s.active) continue;
      s.active = true;
      for (const d of s.def) h.sim.defenses.push(d);
    }
    if (this.scrambled) return;
    const fields = airfieldsOf('red');
    if (!fields.length) return;
    this.scrambled = true;
    const lvl = { EASY: 0, MEDIUM: 1, HARD: 2, EXTREME: 3 }[h.config.difficulty];
    const n = lvl >= 2 ? 2 : 1 + (Math.random() < 0.5 ? 1 : 0);
    const f = fields.reduce((a, b) => (Math.hypot(a.x - p.fm.pos.x, a.z - p.fm.pos.z) < Math.hypot(b.x - p.fm.pos.x, b.z - p.fm.pos.z) ? a : b));
    h.picture.gciEnabled.red = true;
    for (let i = 0; i < n; i++) {
      // the Foxhound was built for exactly this
      const e = new Aircraft('MIG31', 'red', `FOXHOUND ${i + 1}`);
      e.setStores(aiStores(e, 4, 2));
      spawnOnRunway(e, f);
      e.fm.pos.addScaledVector(new THREE.Vector3(f.ax, 0, f.az), i * 320);
      e.ai = new AIPilot(e, duelSkill(h.config.difficulty), h.picture);
      h.sim.add(e);
      this.interceptors.push(e);
    }
    h.message(`DEF: ${n} MIG-31 FOXHOUND${n > 1 ? 'S' : ''} SCRAMBLING FROM ${f.name}. THEY CANNOT CATCH YOU ABOVE MACH 3.`, 'gci', 9);
    h.voice('Interceptors scrambling');
  }

  // -------------------------------------------------------------------------
  // Problems
  // -------------------------------------------------------------------------

  private troubles(dt: number, p: Aircraft): void {
    const h = this.host;
    const fm = p.fm;
    for (const pr of this.problems) {
      if (pr.fired || this.elapsed < pr.at || this.phase === 'done') continue;
      switch (pr.kind) {
        case 'unstart':
          // only at speed: the shock wave pops out of the inlet
          if (fm.mach < 2.2 || fm.onGround) continue;
          pr.fired = true;
          this.unstart = { t: rnd(5, 8), engine: Math.random() < 0.5 ? 0 : 1 };
          fm.engineOut[this.unstart.engine] = true;
          fm.rRate += (this.unstart.engine === 0 ? 1 : -1) * 0.22;
          h.message(`UNSTART — ${this.unstart.engine === 0 ? 'LEFT' : 'RIGHT'} INLET! THE NOSE SLAMS SIDEWAYS. AUTO-RESTART IN PROGRESS: COME OUT OF BURNER, WINGS LEVEL, TO HELP IT.`, 'bad', 9);
          h.voice('Unstart');
          break;
        case 'leak':
          if (fm.onGround) continue;
          pr.fired = true;
          this.leak = true;
          h.message('FUEL: JP-7 IS LEAKING FASTER THAN PLANNED. YOUR RANGE IS SHRINKING: KEEP THE MISSION SHORT.', 'warn', 9);
          break;
        case 'recorder':
          // fires once the tapes are in (moved up when an intercept completes)
          if (!this.emitters.some((e) => e.done)) {
            pr.at = this.elapsed + 30;
            continue;
          }
          pr.fired = true;
          this.recorderHeat = 50;
          this.recorderOver = 0;
          h.message('EMR: THE RECORDER BAY IS OVERHEATING WITH THE TAPES IN IT. STAY BELOW MACH 2.8 FOR 50 SECONDS OR THE TAPES MELT.', 'warn', 10);
          break;
        case 'sa2': {
          // a battery nobody knew about switches on near your track
          pr.fired = true;
          const a = Math.atan2(fm.vel.z, fm.vel.x);
          const ahead = 26000 * Math.max(0.7, mapScale());
          const x = fm.pos.x + Math.cos(a) * ahead + rnd(-6000, 6000), z = fm.pos.z + Math.sin(a) * ahead + rnd(-6000, 6000);
          if (h.sim.grid.height(x, z) < 3) {
            pr.at = this.elapsed + 20;
            pr.fired = false;
            continue;
          }
          const radar = this.place('samRadar', x, z, 'FAN SONG RADAR');
          const defs: AirDefense[] = [];
          for (let j = 0; j < 3; j++) {
            const aa = (j / 3) * Math.PI * 2;
            const u = this.place('sam', x + Math.cos(aa) * 130, z + Math.sin(aa) * 130, `SA-2 LAUNCHER ${j + 1}`, -aa);
            const d = new AirDefense(DEFENSES.SA2, u, this.skill());
            d.radar = radar;
            u.defense = d;
            defs.push(d);
            h.sim.defenses.push(d);
          }
          this.samSites.push({ def: defs, active: true, x, z, name: 'POP-UP SA-2' });
          this.radars.push({ name: 'FAN SONG', pos: radar.pos.clone().setY(radar.pos.y + 10), range: 70000, unit: radar });
          h.message(`DEF: FAN SONG RADAR, ${brg3(bearingXZ(fm.pos.x, fm.pos.z, x, z))}, ${Math.round(Math.hypot(x - fm.pos.x, z - fm.pos.z) / NM)} NM: A POP-UP SA-2 SITE! IF IT LAUNCHES, ACCELERATE AND TURN AWAY.`, 'bad', 9);
          h.voice('SAM site, pop up');
          break;
        }
        case 'retask': {
          if (this.phase !== 'collect') {
            pr.fired = true;
            continue;
          }
          pr.fired = true;
          const sp = this.findSpots(1, 20000 * mapScale(), [...this.sites, ...this.emitters])[0];
          const nm = `${pick(PLACES)} ${pick(['CONVOY', 'NEW SAM SITE', 'TRUCK PARK', 'BRIDGE WORKS', 'HELICOPTER PAD'])}`;
          const units = this.cluster(sp.x, sp.z, [{ kind: 'truck' }, { kind: 'truck' }, { kind: 'apc' }, { kind: 'tent' }], 50);
          const dist = Math.hypot(sp.x - fm.pos.x, sp.z - fm.pos.z);
          const time = Math.max(150, (dist / Math.max(400, fm.tas)) * 2.6 + 90);
          this.retask = { name: nm, x: sp.x, z: sp.z, deadline: this.elapsed + time, done: false, failed: false, t: 0, units };
          h.order('RE-TASKING FROM HOME', `Priority photo: ${nm}, ${Math.round(dist / NM)} NM, bearing ${brg3(bearingXZ(fm.pos.x, fm.pos.z, sp.x, sp.z))}. You have ${mmss(time)}. Bonus intel, if you can make it.`, 11);
          h.voice('New tasking');
          break;
        }
      }
    }
    // an unstart clears itself; out of burner and wings level, faster
    if (this.unstart.t > 0) {
      const help = h.throttle?.() !== undefined && (h.throttle?.() ?? 1.1) <= 1.0 && Math.abs(fm.bank) < 20 ? 2 : 1;
      this.unstart.t -= dt * help;
      if (this.unstart.t <= 0 && this.unstart.engine >= 0) {
        fm.engineOut[this.unstart.engine] = false;
        h.message(`${this.unstart.engine === 0 ? 'LEFT' : 'RIGHT'} INLET RESTARTED. BOTH J58s RUNNING.`, 'good', 5);
        this.unstart.engine = -1;
      }
    }
    if (this.leak && !fm.onGround) fm.fuelInternal = Math.max(0, fm.fuelInternal - fm.fuelFlow * 0.3 * dt);
    if (this.recorderHeat > 0) {
      if (fm.mach > 2.8) {
        this.recorderOver += dt;
        if (this.recorderOver > 18) {
          // the tapes are gone: record the net again
          this.recorderHeat = -1;
          const e = this.emitters.filter((x) => x.done).pop();
          if (e) {
            e.done = false;
            e.progress = 0;
          }
          h.message('EMR: THE TAPES MELTED. THE INTERCEPT IS LOST: RECORD THE NET AGAIN.', 'bad', 9);
          h.voice('Tapes lost');
          return;
        }
      } else this.recorderHeat -= dt;
      if (this.recorderHeat <= 0 && this.recorderHeat > -1) {
        this.recorderHeat = -1;
        h.message('EMR: RECORDER BAY COOL AGAIN. THE TAPES ARE SAFE.', 'good', 5);
      }
    }
  }

  // -------------------------------------------------------------------------
  // The decision
  // -------------------------------------------------------------------------

  private readyToDecide(): boolean {
    const clue = this.clueKnown();
    if (clue.length < this.keys.length) return false;
    // every site checked for every key the clue names
    return this.sites.every((s) => clue.every((k) => s.known[k] !== undefined));
  }

  private assess(forced: boolean): void {
    const h = this.host;
    const T = this.theme;
    const clue = this.clueKnown();
    const rows = this.sites.map((s) => `${s.letter} — ${s.name}: ${this.knownText(s, clue.length ? clue : PHOTO_KEYS.slice(0, 2))}`);
    const clueText = clue.length ? `${this.ctx.code} is ${clue.map((k) => ATTR[k].clue[0].toLowerCase()).join(' and ')}.` : 'We have no clue yet: this is a guess.';
    const choices = this.sites.map((s) => ({
      label: `${s.letter} · ${s.name}`,
      detail: this.knownText(s, clue.length ? clue : PHOTO_KEYS.slice(0, 2)),
      pick: () => this.decide(s),
    }));
    if (!forced) choices.push({ label: 'NOT YET — KEEP LOOKING', detail: 'Go back for more intel. You will be asked again.', pick: () => this.keepLooking() });
    h.brief?.({
      kicker: `INTEL ASSESSMENT · ${this.ctx.op}`,
      title: forced ? 'DECIDE NOW' : 'MAKE THE CALL',
      story: `${forced ? `Out of time: ${T.assetShort.toLowerCase()} is about to move. ` : ''}What we know: ${clueText} Which ${T.siteNoun} is it? ${T.ending === 'strike' ? 'The strike package goes where you say.' : 'The raid team goes where you say, once.'}`,
      heading: 'WHAT EACH SITE SHOWED',
      tasks: rows,
      footer: 'Only one site is real; each decoy shows at most one of the clues.',
      choices,
    });
  }

  private keepLooking(): void {
    this.assessCooldown = 40;
    this.host.message('PRESS ON: GET THE MISSING INTEL. THE ASSESSMENT COMES BACK WHEN YOU HAVE MORE.', 'info', 6);
  }

  private decide(s: Site): void {
    const h = this.host;
    const p = h.player;
    this.choice = s;
    this.moveDeadline = -1;
    if (this.theme.ending === 'strike') {
      this.phase = 'execute';
      this.launchStrike(s);
      h.order(`STRIKE ORDERED: ${s.letter} ${s.name}`, `The package is on its way. Stay within reach of ${s.name} (inside 60 NM) so they have your live pictures when the weapons arrive. Then photograph the damage.`, 12);
    } else {
      this.phase = 'overwatch';
      this.overwatchT = 0;
      h.order(`RAID ORDERED: ${s.letter} ${s.name}`, `The team is going in. Hold within 25 NM of ${s.name} for 60 seconds of overwatch, and keep the detection down.`, 12);
    }
    h.voice('Decision made');
    if (p) this.steer();
  }

  /** Friendly jets fly in and fire stand-off missiles at the chosen site. */
  private launchStrike(s: Site): void {
    const h = this.host;
    const n = 2 + (Math.random() < 0.4 ? 1 : 0);
    const type: AircraftType = pick(COMBAT_TYPES.filter((t) => t !== 'SU35' && t !== 'MIG31'));
    const b = this.home;
    const dir = new THREE.Vector3(s.x - b.x, 0, s.z - b.z).normalize();
    for (let i = 0; i < n; i++) {
      const e = new Aircraft(type, 'blue', `HAMMER ${i + 1}`);
      e.setStores(aiStores(e, 2, 2));
      const pos = new THREE.Vector3(b.x, 7600 + i * 150, b.z).addScaledVector(dir, 8000 - i * 600).add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((i - 1) * 900));
      spawnInAir(e, pos, bearingXZ(pos.x, pos.z, s.x, s.z), 480);
      e.controls.throttle = 1.0;
      const ai = new AIPilot(e, duelSkill('HARD'), h.picture);
      ai.passive = true;
      ai.setRoute([new THREE.Vector3(s.x, pos.y, s.z)], pos.y);
      e.ai = ai;
      h.sim.add(e);
      this.strikers.push(e);
    }
    this.strikeLaunched = false;
    h.message(`HAMMER FLIGHT: ${n} ${SPECS[type].shortName}s OFF ${b.name}, INBOUND ${s.name}.`, 'gci', 8);
  }

  private stepStrike(dt: number, p: Aircraft): void {
    const h = this.host;
    const s = this.choice;
    if (!s) return;
    const alive = this.strikers.filter((e) => e.alive);
    if (!this.strikeLaunched) {
      const lead = alive[0];
      if (!lead) {
        h.message('HAMMER FLIGHT IS LOST. NOBODY LEFT TO DELIVER THE STRIKE.', 'bad', 8);
        this.phase = 'egress';
        this.steer();
        return;
      }
      const d = Math.hypot(lead.fm.pos.x - s.x, lead.fm.pos.z - s.z);
      if (d < 32 * NM * Math.max(0.55, mapScale())) {
        this.strikeLaunched = true;
        const tof = d / 260;
        this.strikeImpact = this.elapsed + tof;
        h.message(`HAMMER: WEAPONS AWAY, ${alive.length * 2} STAND-OFF MISSILES, TIME OF FLIGHT ${Math.round(tof)} SECONDS.`, 'gci', 8);
        h.voice('Weapons away');
        // the strikers turn for home
        for (const e of alive) (e.ai as AIPilot).setRoute([new THREE.Vector3(this.home.x, e.fm.pos.y, this.home.z)], e.fm.pos.y);
      }
      return;
    }
    if (this.strikeImpact > 0 && this.elapsed >= this.strikeImpact) {
      this.strikeImpact = -1;
      this.eyesOn = Math.hypot(p.fm.pos.x - s.x, p.fm.pos.z - s.z) < 60 * NM * Math.max(0.6, mapScale());
      s.struck = true;
      for (const u of s.units) u.damage(99999, h.sim, null, 'STAND-OFF MISSILE');
      h.message(`IMPACT AT ${s.name}.${this.eyesOn ? ' YOUR LIVE PICTURES PUT EVERY WEAPON ON THE AIM POINT.' : ' NO LIVE PICTURES FROM YOU: THEY AIMED BLIND.'} NOW PHOTOGRAPH THE DAMAGE.`, 'good', 9);
      this.phase = 'bda';
      s.photoT = 0;
      this.steer();
    }
  }

  // -------------------------------------------------------------------------
  // Running the mission
  // -------------------------------------------------------------------------

  update(dt: number): void {
    this.elapsed += dt;
    const h = this.host;
    const p = h.player;
    if (!p || this.over) return;
    for (const e of [...h.sim.aircraft]) {
      if (e !== p && !e.alive && e.fm.crashed && h.sim.time - e.destroyedAt > 25) h.sim.remove(e);
    }
    if (!p.alive) {
      this.deadTimer += dt;
      if (this.deadTimer > 3.5) this.finish(false, `The Blackbird was lost: ${p.damage.destroyCause || p.fm.crashCause || 'shot down'}.`);
      return;
    }
    if (p.fm.fuelTotal <= 0 && !p.fm.onGround && this.endTimer < 0) {
      this.endTimer = 6;
      h.message('FLAMEOUT: BOTH TANKS DRY.', 'bad', 6);
    }

    this.maxMach = Math.max(this.maxMach, p.fm.mach);
    this.maxAlt = Math.max(this.maxAlt, p.fm.pos.y);
    this.sensors(dt, p);
    this.detect(dt, p);
    this.troubles(dt, p);

    // the interceptors keep hunting
    for (const e of this.interceptors) {
      const ai = e.ai as AIPilot | null;
      if (ai && e.alive && !e.fm.onGround && this.elapsed % 5 < dt) ai.setRoute([p.fm.pos.clone()], Math.max(e.fm.pos.y, 16000));
    }
    // far out of the area of operations: a reminder
    if (Math.abs(p.fm.pos.x) > MAP_HALF * 1.15 || Math.abs(p.fm.pos.z) > MAP_HALF * 1.15) {
      this.outOfArea += dt;
      if (this.outOfArea > 1 && this.outOfArea < 1 + dt * 1.5) h.message('LEAVING THE AREA OF OPERATIONS: TURN BACK.', 'warn', 6);
      if (this.outOfArea > 40) this.outOfArea = 0;
    } else this.outOfArea = 0;

    if (this.phase === 'collect') {
      this.assessCooldown -= dt;
      if (this.moveDeadline > 0 && this.elapsed > this.moveDeadline) {
        this.moveDeadline = -1;
        this.assess(true);
      } else if (this.assessCooldown <= 0 && this.readyToDecide()) {
        this.assessCooldown = 1e9;
        this.assessAsked = true;
        this.assess(false);
      } else if (this.assessCooldown <= 0 && this.assessAsked && this.clueKnown().length >= this.keys.length) {
        // asked before, nothing new: offer it again now and then
        this.assessCooldown = 1e9;
        this.assess(false);
      }
    } else if (this.phase === 'execute') this.stepStrike(dt, p);
    else if (this.phase === 'bda' && this.choice) {
      const s = this.choice;
      const fm = p.fm;
      const agl = fm.pos.y - Math.max(0, h.sim.grid.height(fm.pos.x, fm.pos.z));
      const swath = THREE.MathUtils.clamp(agl * 0.9, 2500, 26000);
      if (Math.abs(fm.bank) < 15 && Math.hypot(s.x - fm.pos.x, s.z - fm.pos.z) < swath && !(s.cloud && agl > 3000)) {
        s.photoT += dt;
        if (s.photoT > 1.2) this.bdaDone(s);
      }
    } else if (this.phase === 'overwatch' && this.choice) {
      const s = this.choice;
      const d = Math.hypot(s.x - p.fm.pos.x, s.z - p.fm.pos.z);
      if (d < 25 * NM * Math.max(0.6, mapScale())) this.overwatchT += dt;
      if (this.overwatchT >= 60) {
        s.struck = true;
        for (const u of s.units) if (u.kind === 'barracks' || u.kind === 'aaa') u.damage(99999, h.sim, null, 'RAID');
        this.log(s.real ? `RAID: "${this.ctx.code} IS WITH US. ALL TEAMS OUT." The helicopters are heading home.` : `RAID: "${s.name} IS EMPTY. NO SIGN OF ${this.ctx.code}." The team is pulling out.`, s.real ? 'good' : 'bad', 12);
        h.voice(s.real ? 'Package secured' : 'Dry hole');
        this.phase = 'egress';
        this.steer();
      }
    } else if (this.phase === 'egress') {
      const d = Math.hypot(this.home.x - p.fm.pos.x, this.home.z - p.fm.pos.z);
      if (d < 20 * NM * Math.max(0.5, mapScale()) || (p.fm.onGround && p.onRunwayStopped)) {
        this.phase = 'done';
        this.endTimer = 3;
        h.message(`RECOVERY: ${this.home.name} HAS YOU. MISSION COMPLETE.`, 'good', 6);
        h.voice('Mission complete');
        setMissionObjective(null);
      }
    }
    if (this.elapsed % 3 < dt) this.steer();
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish(this.phase === 'done', this.phase === 'done' ? 'home safe.' : 'the jet ran out of fuel.');
    }
  }

  private bdaDone(s: Site): void {
    const h = this.host;
    this.phase = 'egress';
    this.log(
      s.real
        ? `BDA — ${s.name}: SECONDARY EXPLOSIONS. IT WAS THE REAL ONE. ${this.theme.assetShort} DESTROYED.`
        : `BDA — ${s.name}: NO SECONDARIES, JUST BURNING CANVAS AND PLYWOOD. IT WAS A DECOY.`,
      s.real ? 'good' : 'bad',
      12,
    );
    h.voice(s.real ? 'Good hits, good hits' : 'Decoy');
    h.order('EGRESS', `Head for home: ${this.home.name}. Stay high and fast; the Foxhounds may still be out.`, 9);
    this.steer();
  }

  // -------------------------------------------------------------------------
  // The end
  // -------------------------------------------------------------------------

  private finish(survived: boolean, subtitle: string): void {
    const h = this.host;
    this.over = true;
    setMissionObjective(null);
    const s = this.choice;
    const right = !!s && s.real && s.struck;
    const photos = this.sites.filter((x) => x.photo).length;
    const ir = this.sites.filter((x) => x.ir).length;
    const radar = this.sites.filter((x) => x.radar).length;
    const nets = this.emitters.filter((e) => e.done).length;
    // the grade
    let score = 0;
    if (right) score += 45;
    score += Math.round(15 * ((photos + ir * 0.5 + radar * 0.5) / (this.sites.length * 2)));
    score += Math.round(10 * (nets / Math.max(1, this.emitters.length)));
    score += Math.round(20 * (1 - this.peakDetection / 100));
    if (this.retask?.done) score += 5;
    if (this.eyesOn) score += 5;
    if (survived) score += 10;
    score = Math.min(100, score);
    const grade = score >= 90 ? 'S' : score >= 78 ? 'A' : score >= 62 ? 'B' : score >= 45 ? 'C' : 'D';
    const good = survived && right;
    const epilogue = right ? this.theme.win(this.ctx) : this.theme.lose(this.ctx);
    h.showResults({
      title: good ? 'MISSION COMPLETE' : survived ? (s ? 'WRONG TARGET' : 'MISSION INCOMPLETE') : 'BLACKBIRD LOST',
      subtitle: `${this.ctx.op}: ${subtitle} ${s ? epilogue : ''}`.trim(),
      good,
      stats: [
        ['AIRCRAFT', 'Lockheed SR-71A Blackbird'],
        ['STORY', this.theme.title],
        ['THE REAL SITE', this.sites.find((x) => x.real)!.name],
        ['YOUR CALL', s ? `${s.name}${s.real ? ' ✓' : ' ✗'}` : 'none'],
        ['PHOTOS / IR / RADAR', `${photos} / ${ir} / ${radar} of ${this.sites.length}`],
        ['RADIO NETS RECORDED', `${nets} / ${this.emitters.length}`],
        ['PEAK DETECTION', `${Math.round(this.peakDetection)}%${this.compromised ? ' (compromised)' : this.peakDetection < 25 ? ' (never seen)' : ''}`],
        ['RE-TASKING', this.retask ? (this.retask.done ? 'photographed' : 'missed') : 'none'],
        ['TOP SPEED / ALTITUDE', `Mach ${this.maxMach.toFixed(2)} / ${Math.round(this.maxAlt / FT).toLocaleString('en-US')} ft`],
        ['MISSION TIME', mmss(this.elapsed)],
        ['GRADE', `${grade} (${score})`],
      ],
      buttons: [
        { label: 'NEW MISSION', action: 'retry' },
        { label: 'MAIN MENU', action: 'menu' },
      ],
    });
  }

  status(): ModeStatus {
    const p = this.host.player;
    let objective = '';
    let warning: string | undefined;
    const d = (x: number, z: number) => (p ? `${Math.round(Math.hypot(p.fm.pos.x - x, p.fm.pos.z - z) / NM)} NM` : '');
    if (this.phase === 'collect') {
      const parts: string[] = [];
      for (const e of this.emitters) if (!e.done) parts.push(`NET ${e.name.split(' ')[0]} ${Math.round(e.progress * 100)}% ${d(e.x, e.z)}`);
      for (const s of this.sites) parts.push(`${s.letter}:${s.photo ? 'P' : '-'}${s.ir ? 'I' : '-'}${s.radar ? 'R' : '-'}${s.cloud ? '☁' : ''}`);
      if (this.retask && !this.retask.done && !this.retask.failed) parts.push(`RE-TASK ${d(this.retask.x, this.retask.z)} ${mmss(this.retask.deadline - this.elapsed)}`);
      objective = parts.join(' · ');
      if (this.moveDeadline > 0) warning = `${this.theme.assetShort} MOVES IN ${mmss(this.moveDeadline - this.elapsed)}`;
    } else if (this.phase === 'execute') objective = this.strikeLaunched ? `WEAPONS IN THE AIR · IMPACT ${Math.max(0, Math.round(this.strikeImpact - this.elapsed))} S · STAY WITHIN 60 NM` : `HAMMER FLIGHT INBOUND ${this.choice?.name ?? ''}`;
    else if (this.phase === 'bda') objective = `PHOTOGRAPH THE DAMAGE: ${this.choice?.name ?? ''} ${this.choice ? d(this.choice.x, this.choice.z) : ''}`;
    else if (this.phase === 'overwatch') objective = `OVERWATCH ${this.choice?.name ?? ''}: ${Math.round(this.overwatchT)}/60 S · STAY WITHIN 25 NM`;
    else if (this.phase === 'egress') objective = `RETURN TO ${this.home.name}: ${d(this.home.x, this.home.z)}`;
    else objective = 'MISSION COMPLETE';
    if (this.unstart.engine >= 0) warning = 'UNSTART — RESTARTING';
    else if (this.recorderHeat > 0) warning = `RECORDER HOT: BELOW MACH 2.8 ${Math.ceil(this.recorderHeat)} S`;
    const lv = ['CLEAN', 'SUSPECTED', 'TRACKED', 'COMPROMISED'][this.level];
    return {
      title: `BLACKBIRD · ${this.theme.title}`,
      blue: p && p.alive ? 1 : 0,
      red: 0,
      blueText: `INTEL ${this.sites.filter((s) => s.photo).length + this.emitters.filter((e) => e.done).length}/${this.sites.length + this.emitters.length}`,
      redText: `DETECTION ${Math.round(this.detection)}% ${lv}`,
      timer: this.elapsed,
      objective,
      warning,
    };
  }

  handle(action: ResultButton['action']): void {
    if (action === 'retry') {
      const h = this.host;
      for (const a of [...h.sim.aircraft]) h.sim.remove(a);
      h.sim.missiles.length = 0;
      h.sim.bombs.length = 0;
      h.sim.bullets.clear();
      h.sim.cms.clear();
      h.picture.clear();
      this.setup();
    }
  }

  dispose(): void {
    setMissionObjective(null);
  }

  /** for the GCI calls on the radio */
  braaTo(p: Aircraft, e: Aircraft): string {
    return braa(p.fm.pos, e);
  }
}
