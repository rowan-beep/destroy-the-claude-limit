// AIRSTRIKE: bomb a defended ground target and bring the jet home.
//
// Every sortie is generated fresh:
//  - the target: an ammunition depot, a command post, a SAM site, an army
//    camp, an early-warning radar station or an enemy airbase, built at a
//    new spot on enemy ground each time (or at a random enemy airfield),
//    with its own layout, size and mix of primary targets;
//  - the defences: none, a few AAA guns, heat-seeking or radar SAMs, more of
//    them the harder the difficulty;
//  - the enemy air: nothing, a combat air patrol over the target, or alert
//    fighters that scramble from the nearest enemy airbase once you are seen;
//  - where you start: on a random friendly runway, or already airborne at a
//    random point 60-110 NM out.
//
// The jet carries its own strike loadout (JDAM, SDB, Paveway IV, Hammer or
// KAB-500S). The bombing computer designates targets and counts down to the
// release point. Destroy every primary target, then land at a friendly field.

import * as THREE from 'three';
import { GameMode, ModeStatus, ResultButton, statsFor, braa } from './mode';
import { Aircraft } from '../../aircraft/aircraft';
import { AIPilot } from '../../ai/pilot';
import { duelSkill } from '../../ai/skill';
import { AIRFIELDS, airfieldsOf, AirfieldDef, fromRunwayLocal, ROLES, mapAlt, activeMap, mapScale } from '../../world/islands';
import { spawnOnRunway, spawnInAir, aiStores, pickEnemyType } from '../spawn';
import { NM, DEG, MAP_HALF } from '../../core/constants';
import { SPECS, strikeLoadout, AircraftType } from '../../aircraft/specs';
import { setMissionObjective } from '../../avionics/nav';
import { GroundUnit, GroundKind, AirDefense, DEFENSES, UNIT_DEFS } from '../ground';
import { BOMBS } from '../../weapons/weaponSpecs';
import { bearingXZ } from '../../core/math';

export type SiteType = 'depot' | 'command' | 'sam' | 'camp' | 'radar' | 'airbase';
type Phase = 'ingress' | 'attack' | 'rtb' | 'done';
type AirThreat = 'none' | 'cap' | 'scramble';

const RTB_NM = 10;

const SITE_TITLE: Record<SiteType, string> = {
  depot: 'AMMUNITION DEPOT',
  command: 'COMMAND POST',
  sam: 'SAM SITE',
  camp: 'ARMY CAMP',
  radar: 'EARLY WARNING RADAR',
  airbase: 'AIRBASE',
};

const OP_A = ['IRON', 'SILENT', 'BROKEN', 'RED', 'NIGHT', 'COLD', 'DESERT', 'THUNDER', 'GRANITE', 'BLACK', 'SWIFT', 'STEEL', 'HOLLOW', 'NORTHERN', 'FALLING', 'BURNING'];
const OP_B = ['LANTERN', 'HAMMER', 'ANVIL', 'SPEAR', 'TALON', 'HARVEST', 'SENTRY', 'FORGE', 'ARROW', 'CITADEL', 'TEMPEST', 'GAUNTLET', 'RAVEN', 'MERIDIAN', 'BASTION', 'EMBER'];
const PLACE = ['KORVIN', 'ZELENY', 'VOLKOV', 'DRAVA', 'OSTRA', 'BELOGOR', 'KAMEN', 'TORVAL', 'SKALA', 'MIRNY', 'VARGA', 'ZORYA', 'KRAJ', 'LESNOY', 'BORAN', 'PETRA'];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const irnd = (a: number, b: number) => Math.floor(rnd(a, b + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

function mmss(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

interface Plan {
  op: string;
  site: SiteType;
  name: string;
  x: number;
  z: number;
  /** layout rotation (rad) */
  rot: number;
  field: AirfieldDef | null;
  defenses: string[];
  air: AirThreat;
  airType: AircraftType;
  airCount: number;
  start: { kind: 'runway'; field: AirfieldDef } | { kind: 'air'; pos: THREE.Vector3; hdg: number };
}

function enemySide(x: number, z: number): boolean {
  const b = ROLES.blueHome, r = ROLES.redHome;
  return Math.hypot(x - r.cx, z - r.cz) < Math.hypot(x - b.cx, z - b.cz);
}

/** A spot on enemy land, flat enough to build on (hilltops for radars). */
export function findEnemySite(grid: { height(x: number, z: number): number }, type: SiteType): { x: number; z: number } {
  const lim = MAP_HALF * 0.85;
  let best: { x: number; z: number; score: number } | null = null;
  for (let i = 0; i < 1400; i++) {
    const x = rnd(-lim, lim), z = rnd(-lim, lim);
    if (!enemySide(x, z)) continue;
    const h = grid.height(x, z);
    if (h < 25 || h > activeMap.maxTerrain * 0.55) continue;
    if (AIRFIELDS.some((f) => Math.hypot(f.x - x, f.z - z) < 7000)) continue;
    if (airfieldsOf('blue').some((f) => Math.hypot(f.x - x, f.z - z) < 45 * NM * mapScale())) continue;
    let lo = h, hi = h, water = false;
    for (const r of [250, 520]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const hh = grid.height(x + Math.cos(a) * r, z + Math.sin(a) * r);
        if (hh < 4) water = true;
        lo = Math.min(lo, hh);
        hi = Math.max(hi, hh);
      }
    }
    if (water) continue;
    const rough = hi - lo;
    // radar stations want the high ground, everything else flat ground
    const score = type === 'radar' ? rough * 0.3 - (h - lo) : rough;
    if (!best || score < best.score) best = { x, z, score };
    if (i > 250 && best.score < (type === 'radar' ? -20 : 18)) break;
  }
  if (best) return best;
  // fallback: beside an enemy airfield
  const f = pick(airfieldsOf('red'));
  return fromRunwayLocal(f, 0, 1800);
}


export class StrikeMode extends GameMode {
  /** testing: force the next target type */
  static forceSite: SiteType | null = null;
  private plan!: Plan;
  private phase: Phase = 'ingress';
  private primaries: GroundUnit[] = [];
  private secondaries: GroundUnit[] = [];
  private defenseUnits: GroundUnit[] = [];
  private enemies: Aircraft[] = [];
  private scrambled = false;
  private capAwake = false;
  private deadTimer = 0;
  private endTimer = -1;
  private gciTimer = 0;
  private attackStart = 0;
  private unsub: (() => void)[] = [];
  private landedAt: AirfieldDef | null = null;

  start(): void {
    const ev = this.host.sim.events;
    this.unsub.push(
      ev.on('groundDestroyed', (e) => this.onGroundDestroyed(e.unit, e.by)),
      ev.on('bombImpact', (e) => {
        if (e.bomb.shooter === this.host.player) this.alert();
      }),
    );
    this.setup();
  }

  // -------------------------------------------------------------------------
  // Scenario generation
  // -------------------------------------------------------------------------

  private findSite(type: SiteType): { x: number; z: number } {
    return findEnemySite(this.host.sim.grid, type);
  }

  private makePlan(): Plan {
    const cfg = this.host.config;
    const diff = cfg.difficulty;
    const types: SiteType[] = ['depot', 'command', 'sam', 'camp', 'radar', 'airbase'];
    const site = StrikeMode.forceSite ?? pick(types);
    let x: number, z: number, field: AirfieldDef | null = null;
    if (site === 'airbase') {
      field = pick(airfieldsOf('red'));
      x = field.x;
      z = field.z;
    } else ({ x, z } = this.findSite(site));
    const place = pick(PLACE);
    const name = site === 'airbase' ? `${field!.name}` : `${place} ${SITE_TITLE[site]}`;

    // defences, scaled by the difficulty
    const lvl = { EASY: 0, MEDIUM: 1, HARD: 2, EXTREME: 3 }[diff];
    const defenses: string[] = [];
    const aaa = [irnd(0, 1), irnd(1, 2), irnd(2, 3), irnd(3, 4)][lvl];
    for (let i = 0; i < aaa; i++) defenses.push(lvl >= 2 && Math.random() < 0.35 ? 'TUNGUSKA' : 'ZSU');
    if (Math.random() < [0.2, 0.5, 0.7, 1][lvl]) defenses.push('SA13');
    if (site !== 'sam' && Math.random() < [0, 0.15, 0.4, 0.75][lvl]) defenses.push(lvl >= 3 && Math.random() < 0.4 ? 'SA11' : 'SA15');

    // enemy fighters
    const r = Math.random();
    const noneP = [0.55, 0.35, 0.25, 0.15][lvl];
    const air: AirThreat = site === 'airbase' ? (r < noneP * 0.6 ? 'none' : 'scramble') : r < noneP ? 'none' : r < noneP + (1 - noneP) / 2 ? 'cap' : 'scramble';
    const airType = pickEnemyType(cfg.aircraft);
    const airCount = air === 'none' ? 0 : lvl >= 2 && Math.random() < 0.5 ? 3 : 2;

    // where the player starts
    const blue = airfieldsOf('blue');
    let start: Plan['start'];
    const far = blue.filter((f) => Math.hypot(f.x - x, f.z - z) > 45 * NM * mapScale());
    if (Math.random() < 0.55 && (far.length || blue.length)) start = { kind: 'runway', field: pick(far.length ? far : blue) };
    else {
      // airborne, 60-110 NM out on the friendly side of the target (closer on a small map)
      const b = ROLES.blueHome;
      const base = Math.atan2(b.cz - z, b.cx - x);
      const a = base + rnd(-0.6, 0.6);
      const d = rnd(60, 110) * NM * mapScale();
      const px = THREE.MathUtils.clamp(x + Math.cos(a) * d, -MAP_HALF * 0.9, MAP_HALF * 0.9);
      const pz = THREE.MathUtils.clamp(z + Math.sin(a) * d, -MAP_HALF * 0.9, MAP_HALF * 0.9);
      const alt = Math.max(mapAlt(rnd(5500, 8500)), this.host.sim.grid.height(px, pz) + 1800);
      start = { kind: 'air', pos: new THREE.Vector3(px, alt, pz), hdg: bearingXZ(px, pz, x, z) };
    }
    return { op: `OPERATION ${pick(OP_A)} ${pick(OP_B)}`, site, name, x, z, rot: rnd(0, Math.PI * 2), field, defenses, air, airType, airCount, start };
  }

  // -------------------------------------------------------------------------
  // Building the target
  // -------------------------------------------------------------------------

  private unit(kind: GroundKind, lx: number, lz: number, rot: number, primary: boolean, label?: string): GroundUnit {
    const P = this.plan;
    let x: number, z: number, hdg: number;
    if (P.field) {
      // airbase: runway-local (across = lx, along = lz)
      const p = fromRunwayLocal(P.field, lz, lx);
      x = p.x;
      z = p.z;
      hdg = P.field.heading * DEG + rot;
    } else {
      const c = Math.cos(P.rot), s = Math.sin(P.rot);
      x = P.x + lx * c - lz * s;
      z = P.z + lx * s + lz * c;
      hdg = P.rot + rot;
    }
    const y = P.field ? P.field.elev : Math.max(0, this.host.sim.grid.height(x, z));
    const u = new GroundUnit(kind, new THREE.Vector3(x, y, z), hdg, primary, label ?? UNIT_DEFS[kind].name);
    this.host.sim.ground.push(u);
    (primary ? this.primaries : this.secondaries).push(u);
    return u;
  }

  private numbered(kind: GroundKind, list: GroundUnit[]): void {
    const same = list.filter((u) => u.kind === kind);
    if (same.length > 1) same.forEach((u, i) => (u.label = `${UNIT_DEFS[kind].name} ${i + 1}`));
  }

  private buildSite(): void {
    const P = this.plan;
    const j = () => rnd(-6, 6);
    switch (P.site) {
      case 'depot': {
        const n = irnd(4, 6);
        for (let i = 0; i < n; i++) this.unit('ammo', ((i % 3) - 1) * 48 + j(), (i < 3 ? -40 : 40) + j(), 0, true);
        for (let i = 0; i < irnd(1, 2); i++) this.unit('fuel', 150 + i * 30, -120 + j(), 0, false);
        for (let i = 0; i < irnd(3, 5); i++) this.unit('truck', -130 + i * 11, 110 + j() * 0.3, Math.PI / 2, false);
        this.unit('barracks', 150, 90, 0.1, false);
        break;
      }
      case 'command': {
        this.unit('bunker', 0, 0, 0, true);
        this.unit('hq', 90 + j(), -30 + j(), Math.PI / 2, true);
        this.unit('mast', -80 + j(), 60 + j(), 0, true);
        if (Math.random() < 0.6) this.unit('ewr', -110, -70, 0.4, true);
        for (let i = 0; i < 2; i++) this.unit('barracks', 60 + i * 20, 120, 0, false);
        for (let i = 0; i < 2; i++) this.unit('apc', -40 + i * 9, -70, 0, false);
        for (let i = 0; i < irnd(2, 4); i++) this.unit('truck', 20 + i * 10, 70, Math.PI / 2, false);
        break;
      }
      case 'sam': {
        // a medium-range battery: search radar, fire-control radar, three to four launchers around them
        const heavy = this.host.config.difficulty === 'HARD' || this.host.config.difficulty === 'EXTREME';
        const kind = heavy && Math.random() < 0.6 ? 'SA11' : 'SA15';
        const radar = this.unit('samRadar', 0, 0, 0, true, `${DEFENSES[kind].short} RADAR`);
        this.unit('ewr', -90 + j(), 50 + j(), 0.5, true, 'SEARCH RADAR');
        const n = irnd(3, 4);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + 0.3;
          const u = this.unit('sam', Math.cos(a) * 160, Math.sin(a) * 160, -a, true, `${DEFENSES[kind].short} LAUNCHER ${i + 1}`);
          const d = new AirDefense(DEFENSES[kind], u, this.skill());
          d.radar = radar;
          this.host.sim.defenses.push(d);
        }
        for (let i = 0; i < 2; i++) this.unit('truck', 60 + i * 10, -90, 0, false);
        this.unit('apc', -30, -60, 0.8, false, 'COMMAND VEHICLE');
        break;
      }
      case 'camp': {
        for (let i = 0; i < irnd(3, 4); i++) this.unit('tank', -60 + i * 16 + j() * 0.3, -50, 0, true);
        for (let i = 0; i < 2; i++) this.unit('apc', 40 + i * 12, -50, 0, true);
        for (let i = 0; i < irnd(6, 9); i++) this.unit('tent', ((i % 3) - 1) * 16, 40 + Math.floor(i / 3) * 16, 0, false);
        for (let i = 0; i < 2; i++) this.unit('barracks', 110, 20 + i * 24, Math.PI / 2, false);
        for (let i = 0; i < irnd(3, 5); i++) this.unit('truck', -120, -20 + i * 10, Math.PI / 2, false);
        this.unit('fuel', -140, 90, 0, false);
        break;
      }
      case 'radar': {
        this.unit('ewr', 0, 0, 0, true, 'RADAR 1');
        this.unit('ewr', 70 + j(), 30 + j(), 1.2, true, 'RADAR 2');
        this.unit('mast', -60, 40, 0, true);
        this.unit('bunker', 20, -80, 0, Math.random() < 0.5);
        this.unit('barracks', -90, -60, 0.4, false);
        for (let i = 0; i < 2; i++) this.unit('truck', 40 + i * 10, 90, 0, false);
        break;
      }
      case 'airbase': {
        // parked jets on the apron, ammunition and fuel on the far side of the shelters
        const n = irnd(3, 4);
        const t = this.plan.airType;
        for (let i = 0; i < n; i++) {
          const u = this.unit('jet', 330 + j(), -380 + i * 110 + j() * 3, -Math.PI / 2, true, `PARKED ${SPECS[t].shortName} ${i + 1}`);
          u.jetType = t;
        }
        for (let i = 0; i < 2; i++) this.unit('ammo', 575, -420 + i * 380 + j() * 4, Math.PI / 2, true);
        for (let i = 0; i < 2; i++) this.unit('fuel', 590, 150 + i * 40, 0, false);
        for (let i = 0; i < 3; i++) this.unit('truck', 250, -600 + i * 12, 0, false);
        break;
      }
    }
    this.numbered('ammo', this.primaries);
    this.numbered('tank', this.primaries);
    this.numbered('apc', this.primaries);
    this.numbered('mast', this.primaries);
    // air defences ring the site
    const spread = P.site === 'airbase' ? 1.0 : 0.55;
    P.defenses.forEach((k, i) => {
      const spec = DEFENSES[k];
      const a = (i / Math.max(1, P.defenses.length)) * Math.PI * 2 + rnd(-0.4, 0.4);
      const r = (spec.kind === 'AAA' ? rnd(300, 650) : spec.kind === 'SAM_IR' ? rnd(450, 900) : rnd(900, 1600)) * (P.site === 'airbase' ? 1.6 : 1) * (spread + 0.45);
      const kind: GroundKind = spec.kind === 'AAA' ? 'aaa' : 'sam';
      const u = this.unit(kind, Math.cos(a) * r, Math.sin(a) * r, rnd(0, 6.28), false, spec.name);
      this.defenseUnits.push(u);
      const d = new AirDefense(spec, u, this.skill());
      if (spec.kind === 'SAM_RADAR') {
        // its own tracking radar beside it
        const rr = this.unit('samRadar', Math.cos(a) * r + 30, Math.sin(a) * r + 20, 0, false, `${spec.short} RADAR`);
        d.radar = rr;
      }
      this.host.sim.defenses.push(d);
    });
    // the SAM site's own launchers count as defences too
    for (const u of this.primaries) if (u.defense) this.defenseUnits.push(u);
  }

  private skill(): number {
    return { EASY: 0.2, MEDIUM: 0.45, HARD: 0.7, EXTREME: 0.92 }[this.host.config.difficulty];
  }

  // -------------------------------------------------------------------------
  // Mission start
  // -------------------------------------------------------------------------

  private setup(): void {
    const h = this.host;
    this.plan = this.makePlan();
    const P = this.plan;
    this.phase = 'ingress';
    this.primaries = [];
    this.secondaries = [];
    this.defenseUnits = [];
    this.enemies = [];
    this.scrambled = false;
    this.capAwake = false;
    this.deadTimer = 0;
    this.endTimer = -1;
    this.gciTimer = 30;
    this.attackStart = 0;
    this.elapsed = 0;
    this.over = false;
    this.landedAt = null;
    h.sim.ground.length = 0;
    h.sim.defenses.length = 0;
    h.sim.groundSites.length = 0;
    h.sim.groundGen++;

    this.buildSite();
    if (!P.field) h.sim.groundSites.push({ x: P.x, z: P.z, r: P.site === 'sam' ? 260 : 230 });
    setMissionObjective({ name: P.name, short: 'TGT', x: P.x, z: P.z });

    // the player, with the jet's strike loadout
    const p = h.createPlayer();
    p.applyLoadout(strikeLoadout(p.spec));
    // never more bomb-only targets (the gun can't hurt them) than bombs on the jet
    const bombs = p.bombType ? p.countOf(p.bombType) : 0;
    const hard = this.primaries.filter((u) => u.def.gun < 0.3);
    for (const u of hard.slice(Math.max(1, bombs))) {
      u.primary = false;
      this.primaries.splice(this.primaries.indexOf(u), 1);
      this.secondaries.push(u);
    }
    if (P.start.kind === 'runway') spawnOnRunway(p, P.start.field);
    else spawnInAir(p, P.start.pos, P.start.hdg, 450);
    h.sim.add(p);
    h.refreshStores(p);
    const bt = p.bombType;
    if (bt) p.selectWeapon(bt);

    // combat air patrol over the target (the scramble flight comes later)
    if (P.air === 'cap') {
      const alt = mapAlt(rnd(5500, 7500));
      for (let i = 0; i < P.airCount; i++) {
        const a0 = (i / P.airCount) * Math.PI * 2;
        const R = 18000;
        const pos = new THREE.Vector3(P.x + Math.sin(a0) * R, alt + i * 300, P.z - Math.cos(a0) * R);
        const e = new Aircraft(P.airType, 'red', `CAP ${i + 1}`);
        e.setStores(aiStores(e, 2, 2));
        spawnInAir(e, pos, ((a0 * 180) / Math.PI + 90) % 360, 430);
        const ai = new AIPilot(e, duelSkill(h.config.difficulty), h.picture);
        ai.passive = true;
        const route: THREE.Vector3[] = [];
        for (let k = 1; k <= 6; k++) {
          const a = a0 + (k / 6) * Math.PI * 2;
          route.push(new THREE.Vector3(P.x + Math.sin(a) * R, pos.y, P.z - Math.cos(a) * R));
        }
        ai.setRoute(route, pos.y);
        e.ai = ai;
        h.sim.add(e);
        this.enemies.push(e);
      }
    }
    h.picture.gciEnabled.blue = true;
    h.picture.gciEnabled.red = false;
    this.brief(p);
  }

  private brief(p: Aircraft): void {
    const h = this.host;
    const P = this.plan;
    const n = this.primaries.length;
    const bt = p.bombType;
    const bombs = bt ? `${p.countOf(bt)} × ${BOMBS[bt].name}` : 'no bombs';
    const d = Math.round(Math.hypot(p.fm.pos.x - P.x, p.fm.pos.z - P.z) / NM);
    const brg = String(Math.round(bearingXZ(p.fm.pos.x, p.fm.pos.z, P.x, P.z))).padStart(3, '0');
    const kinds = [...new Set(this.primaries.map((u) => u.def.name.toLowerCase()))];
    const defNames = P.defenses.map((k) => DEFENSES[k].name);
    const defTxt = P.site === 'sam'
      ? `The site itself is the threat: its launchers will fire on you as you come in${defNames.length ? `, backed by ${defNames.join(', ')}` : ''}.`
      : defNames.length
        ? `Defended by ${defNames.join(', ')}.`
        : 'No air defences have been seen there.';
    const airTxt =
      P.air === 'cap'
        ? `${P.airCount} ${SPECS[P.airType].shortName}s fly a combat air patrol over the target.`
        : P.air === 'scramble'
          ? `${P.airCount} ${SPECS[P.airType].shortName}s sit on alert at a nearby enemy airbase and will scramble once you are spotted.`
          : 'No enemy fighters are expected.';
    const startTxt = P.start.kind === 'runway' ? `You launch from ${P.start.field.name}.` : `You are already airborne, ${d} NM out.`;
    h.brief?.({
      kicker: `AIRSTRIKE · ${P.op}`,
      title: P.name,
      story: `Target: ${P.name}, ${d} NM on a bearing of ${brg}. Intelligence counts ${n} primary targets there (${kinds.join(', ')}). ${defTxt} ${airTxt} ${startTxt} You carry ${bombs}.`,
      tasks: [
        `Fly to the target: steerpoint 1 (TGT), ${d} NM, bearing ${brg}. [U] auto-fly can take you there.`,
        'Bombs are selected [4]. The computer boxes a target ([R] picks another) and counts down, just below the middle of the screen, to the release point. Press [SPACE] when it says RELEASE.',
        `Destroy all ${n} primary targets (amber diamonds). The gun works on vehicles too.`,
        'Then fly home and land at any friendly airfield (auto-fly can land for you). Out of bombs? Land, stop and rearm [K].',
      ],
      footer: `Every airstrike is different: a new target, defences, fighters and start each time. Difficulty: ${h.config.difficulty}.`,
      onOk: () => {
        h.order(`${P.op} — ${P.start.kind === 'runway' ? 'CLEARED FOR TAKEOFF' : 'PRESS ON'}`, `Target ${P.name}: ${d} NM, bearing ${brg}. Steerpoint 1 (TGT). ${n} primary targets.`, 10);
        h.voice(P.start.kind === 'runway' ? 'Cleared for takeoff' : 'Press on to the target');
      },
    });
  }

  // -------------------------------------------------------------------------
  // Running the mission
  // -------------------------------------------------------------------------

  /** The enemy knows you are coming: CAP turns hot, the alert jets scramble. */
  private alert(): void {
    const h = this.host;
    const p = h.player;
    if (!p) return;
    if (this.plan.air === 'cap' && !this.capAwake) {
      this.capAwake = true;
      h.picture.gciEnabled.red = true;
      for (const e of this.enemies) {
        const ai = e.ai as AIPilot | null;
        if (!ai || !e.alive) continue;
        ai.passive = false;
        ai.setRoute([p.fm.pos.clone()], e.fm.pos.y);
      }
      const lead = this.enemies.find((e) => e.alive);
      if (lead) h.message(`OVERLORD: BANDITS OFF THE CAP, ${braa(p.fm.pos, lead)}, HOT.`, 'gci', 9);
      h.voice('Bandits hot');
    }
    if (this.plan.air === 'scramble' && !this.scrambled) {
      this.scrambled = true;
      const P = this.plan;
      const fields = airfieldsOf('red');
      const f = P.field ?? fields.reduce((a, b) => (Math.hypot(a.x - P.x, a.z - P.z) < Math.hypot(b.x - P.x, b.z - P.z) ? a : b));
      h.picture.gciEnabled.red = true;
      for (let i = 0; i < P.airCount; i++) {
        const e = new Aircraft(P.airType, 'red', `ALERT ${i + 1}`);
        e.setStores(aiStores(e, 2, 2));
        spawnOnRunway(e, f);
        // lined up one behind the other, 300 m apart, all rolling the same way
        e.fm.pos.addScaledVector(new THREE.Vector3(f.ax, 0, f.az), i * 300);
        const ai = new AIPilot(e, duelSkill(h.config.difficulty), h.picture);
        e.ai = ai;
        h.sim.add(e);
        this.enemies.push(e);
      }
      h.message(`OVERLORD: ${P.airCount} FIGHTERS SCRAMBLING FROM ${f.name}.`, 'gci', 9);
      h.voice('Enemy fighters scrambling');
    }
  }

  private onGroundDestroyed(u: GroundUnit, by: Aircraft | null): void {
    const h = this.host;
    const p = h.player;
    if (!p) return;
    const mine = by === p;
    if (u.primary) {
      const left = this.primaries.filter((x) => x.alive).length;
      h.message(`${u.label} DESTROYED — ${left ? `${left} PRIMARY TARGET${left > 1 ? 'S' : ''} LEFT` : 'ALL PRIMARY TARGETS DESTROYED'}`, 'good', 4);
      if (mine) h.voice(left ? 'Target destroyed' : 'Shack');
    } else if (u.defense) h.message(`${u.label} DESTROYED`, 'good', 3);
    this.alert();
    if (p.groundTarget === u) p.groundTarget = null;
  }

  update(dt: number): void {
    this.elapsed += dt;
    const h = this.host;
    const p = h.player;
    if (!p || this.over) return;
    const P = this.plan;

    for (const e of [...h.sim.aircraft]) {
      if (e !== p && !e.alive && e.fm.crashed && h.sim.time - e.destroyedAt > 25) h.sim.remove(e);
    }
    if (!p.alive) {
      this.deadTimer += dt;
      if (this.deadTimer > 3.5) this.finish(false, `You were lost: ${p.damage.destroyCause || p.fm.crashCause || 'shot down'}.`);
      return;
    }
    const d = Math.hypot(p.fm.pos.x - P.x, p.fm.pos.z - P.z);
    if (this.phase === 'ingress' && d < 28 * NM) {
      this.phase = 'attack';
      this.attackStart = this.elapsed;
      h.order('IP INBOUND', `${P.name} is ${Math.round(d / NM)} NM ahead. Follow the release countdown below the middle of the screen; press [SPACE] on RELEASE.`, 8);
      h.voice('I P inbound');
    }
    // seen: inside 30 NM of the target at any height, or 45 NM up high
    if (!this.capAwake || !this.scrambled) {
      const high = p.fm.pos.y > mapAlt(3500);
      if (d < (high ? 45 : 30) * NM) this.alert();
    }
    // GCI picture calls for enemy fighters
    this.gciTimer -= dt;
    const alive = this.enemies.filter((e) => e.alive && !e.fm.onGround);
    if (this.gciTimer <= 0 && alive.length && (this.capAwake || this.scrambled)) {
      this.gciTimer = 45;
      h.message(`OVERLORD: ${alive.length} BANDIT${alive.length > 1 ? 'S' : ''}, ${braa(p.fm.pos, alive[0])}.`, 'gci', 8);
    }
    // alert fighters that took off go hunting
    for (const e of this.enemies) {
      const ai = e.ai as AIPilot | null;
      if (ai && !e.fm.onGround && e.alive && !ai.passive && this.elapsed % 5 < dt) ai.setRoute([p.fm.pos.clone()], Math.max(e.fm.pos.y, mapAlt(4500)));
    }

    if ((this.phase === 'ingress' || this.phase === 'attack') && this.primaries.every((u) => !u.alive)) {
      this.phase = 'rtb';
      h.order('TARGETS DESTROYED — RETURN TO BASE', `All ${this.primaries.length} primary targets are down. Bring the jet home: land at any friendly airfield ([U] auto-fly can fly the approach and land for you).`, 12);
      h.voice('All targets destroyed, return to base');
    }
    if (this.phase === 'rtb') {
      const home = airfieldsOf('blue').find((f) => Math.hypot(p.fm.pos.x - f.x, p.fm.pos.z - f.z) < 4000);
      if (p.fm.onGround && p.onRunwayStopped && home) {
        this.landedAt = home;
        this.phase = 'done';
        this.endTimer = 3;
        h.message(`WELCOME HOME TO ${home.name}. MISSION COMPLETE.`, 'good', 6);
        h.voice('Mission complete');
      }
    }
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish(true, `${P.name} destroyed and the jet home safe at ${this.landedAt?.name ?? 'base'}.`);
    }
  }

  private finish(good: boolean, subtitle: string): void {
    const h = this.host;
    this.over = true;
    const P = this.plan;
    const p = h.player;
    const prim = this.primaries.filter((u) => !u.alive).length;
    const sec = this.secondaries.filter((u) => !u.alive && !this.defenseUnits.includes(u)).length;
    const defs = this.defenseUnits.filter((u) => !u.alive).length;
    h.showResults({
      title: good ? 'MISSION COMPLETE' : 'MISSION FAILED',
      subtitle: `${P.op}: ${subtitle}`,
      good,
      stats: statsFor(p, [
        ['TARGET', P.name],
        ['PRIMARY TARGETS', `${prim} / ${this.primaries.length}`],
        ['OTHER TARGETS', String(sec)],
        ['AIR DEFENCES KILLED', `${defs} / ${this.defenseUnits.length}`],
        ['BOMBS DROPPED', String(p?.bombsDropped ?? 0)],
        ['MISSION TIME', mmss(this.elapsed)],
      ]),
      buttons: [
        { label: 'NEW AIRSTRIKE', action: 'retry' },
        { label: 'MAIN MENU', action: 'menu' },
      ],
    });
  }

  status(): ModeStatus {
    const p = this.host.player;
    const P = this.plan;
    const left = this.primaries.filter((u) => u.alive).length;
    let objective = '';
    if (p) {
      const d = Math.round(Math.hypot(p.fm.pos.x - P.x, p.fm.pos.z - P.z) / NM);
      const bt = p.bombType;
      const bombs = bt ? p.countOf(bt) : 0;
      if (this.phase === 'ingress') objective = `STRIKE ${P.name}: ${d} NM · ${left} TARGETS · ${bombs} BOMBS`;
      else if (this.phase === 'attack') objective = `DESTROY THE PRIMARY TARGETS: ${left} LEFT · ${bombs} BOMBS${bombs === 0 && left ? ' · GUN OR REARM' : ''}`;
      else if (this.phase === 'rtb') objective = 'RETURN TO BASE AND LAND';
      else objective = 'MISSION COMPLETE';
    }
    return {
      title: `AIRSTRIKE · ${P.op}`,
      blue: p && p.alive ? 1 : 0,
      red: left,
      blueText: `TARGETS ${this.primaries.length - left}/${this.primaries.length}`,
      redText: `DEFENCES ${this.defenseUnits.filter((u) => u.alive).length}`,
      timer: this.elapsed,
      objective,
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
    for (const f of this.unsub) f();
    this.unsub = [];
    setMissionObjective(null);
  }
}


// test hook (headless renders of each target type)
if (typeof window !== 'undefined') (window as unknown as { __StrikeMode?: typeof StrikeMode }).__StrikeMode = StrikeMode;
