// Flight School: a guided tutorial, then a graded checkride.
//
// An instructor panel walks through flying the jet (views, pitch, turning,
// throttle and afterburner, pulling G) and fighting with it (radar lock,
// radar missile, heat-seeker, gun with the lead circle, flares and chaff),
// against target drones that fly steady and never shoot. Each step finishes
// by itself once you have done it (ENTER skips one). The checkride puts it all
// together: three drones and a manoeuvring bandit that defends but holds its
// fire, against the clock.

import * as THREE from 'three';
import { GameMode, ModeHost, ModeStatus, ResultButton, statsFor } from './mode';
import { Aircraft } from '../../aircraft/aircraft';
import { AIPilot } from '../../ai/pilot';
import { duelSkill } from '../../ai/skill';
import { ROLES, mapAlt } from '../../world/islands';
import { spawnInAir } from '../spawn';
import { enemyTypesFor } from '../../aircraft/specs';
import { MISSILES } from '../../weapons/weaponSpecs';
import { NM, DEG } from '../../core/constants';
import { bearingXZ } from '../../core/math';
import { loadSettings } from '../../core/settings';
import type { Action, InputSettings } from '../../core/input';
import { keyLabel } from '../../ui/menu/screens';

interface Step {
  title: string;
  /** instructor text (HTML: <kbd> for keys) */
  text: () => string;
  setup?: () => void;
  /** 0..1; the step completes at 1 */
  progress: () => number;
  /** complete by itself after this many seconds (reading steps) */
  auto?: number;
}

const CHECKRIDE_TIME = 300;

export class TutorialMode extends GameMode {
  private steps: Step[] = [];
  private idx = 0;
  private stepT = 0;
  private doneT = -1;
  private panel: HTMLDivElement;
  private drones: Aircraft[] = [];
  private deadTimer = 0;
  private phase: 'lessons' | 'checkride' | 'done' = 'lessons';
  private checkT = 0;
  private checkShots = 0;
  // per-step trackers
  private maxClimb = 0;
  private minClimb = 0;
  private lastHdg = 0;
  private turned = 0;
  private maxG = 0;
  private views = 0;
  private lastView = '';
  private abOn = false;
  private offT = 0;
  private cm0 = { flares: 0, chaff: 0 };
  private shots0 = 0;
  private input: InputSettings = loadSettings().input;
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Enter' && this.phase === 'lessons' && this.doneT < 0) this.complete(true);
  };

  constructor(host: ModeHost) {
    super(host);
    this.panel = document.createElement('div');
    this.panel.className = 'tut';
    document.body.appendChild(this.panel);
    window.addEventListener('keydown', this.onKey);
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private key(a: Action): string {
    const b = this.input.bindings[a] ?? [];
    const keys = b.filter((c) => !c.startsWith('GP_')).slice(0, 2).map(keyLabel);
    return keys.length ? keys.map((k) => `<kbd>${k}</kbd>`).join(' or ') : '<kbd>—</kbd>';
  }

  private get mouse(): 'keyboard' | 'joystick' | 'mouseaim' {
    return this.input.mouseMode;
  }

  private fireText(): string {
    return this.mouse === 'keyboard' ? this.key('fire') : `<kbd>LEFT CLICK</kbd> or ${this.key('fire')}`;
  }

  private climbDeg(p: Aircraft): number {
    return Math.asin(Math.max(-1, Math.min(1, p.fm.fwd.y))) / DEG;
  }

  private heading(p: Aircraft): number {
    return bearingXZ(0, 0, p.fm.fwd.x, p.fm.fwd.z);
  }

  /** A drone relative to the player: ahead (m), right (m), up (m), its heading relative to ours, speed. */
  private spawnDrone(ahead: number, right: number, up: number, relHdg: number, kts: number, orbit = 0, name = 'DRONE'): Aircraft {
    const h = this.host;
    const p = h.player!;
    const fwd = new THREE.Vector3(p.fm.fwd.x, 0, p.fm.fwd.z).normalize();
    const rt = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const pos = p.fm.pos.clone().addScaledVector(fwd, ahead).addScaledVector(rt, right);
    pos.y = Math.max(mapAlt(3500), p.fm.pos.y + up);
    const type = enemyTypesFor(p.type)[this.drones.length % 2] ?? enemyTypesFor(p.type)[0];
    const d = new Aircraft(type, 'red', `${name} ${this.drones.length + 1}`);
    d.setStores({});
    const hdg = (this.heading(p) + relHdg + 360) % 360;
    spawnInAir(d, pos, hdg, kts);
    const ai = new AIPilot(d, duelSkill('EASY'), h.picture);
    ai.passive = true;
    // a long straight leg, or a wide racetrack orbit
    const dir = new THREE.Vector3(Math.sin(hdg * DEG), 0, -Math.cos(hdg * DEG));
    const route: THREE.Vector3[] = [];
    if (orbit > 0) {
      // a wide circle starting where the drone is, turning right
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const c = pos.clone().addScaledVector(side, orbit);
      const lap: THREE.Vector3[] = [];
      for (let k = 1; k <= 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        lap.push(c.clone().addScaledVector(side, -Math.cos(a) * orbit).addScaledVector(dir, Math.sin(a) * orbit).setY(pos.y));
      }
      for (let k = 0; k < 30; k++) route.push(...lap);
    } else route.push(pos.clone().addScaledVector(dir, 400 * NM));
    ai.setRoute(route, pos.y);
    d.ai = ai;
    h.sim.add(d);
    this.drones.push(d);
    return d;
  }

  private clearDrones(): void {
    for (const d of this.drones) this.host.sim.remove(d);
    this.drones = [];
  }

  /** Top the jet up so a missed shot or a long lesson never strands you. */
  private topUp(): void {
    const p = this.host.player;
    if (!p || !p.alive) return;
    p.rearm(true);
    this.host.refreshStores(p);
  }

  private liveDrone(): Aircraft | null {
    return this.drones.find((d) => d.alive) ?? null;
  }

  // ---------------------------------------------------------------------------
  // lesson plan
  // ---------------------------------------------------------------------------

  private buildSteps(): void {
    const h = this.host;
    const P = () => h.player!;
    const ms = this.mouse;
    const irName = () => MISSILES[P().irMissile].short;
    const rdName = () => MISSILES[P().radarMissile].short;
    const killStep = (weapon: 'radar' | 'ir' | 'gun') => () => {
      const p = P();
      const d = this.drones[0];
      if (!d) return 0;
      if (!d.alive) return 1;
      const sel = weapon === 'gun' ? p.selectedWeapon === 'GUN' : weapon === 'ir' ? p.selectedWeapon === p.irMissile : p.selectedWeapon === p.radarMissile;
      const fired = weapon === 'gun' ? d.damage.integrity < 0.999 : p.shotsFired > this.shots0;
      return sel ? (fired ? 0.75 : 0.4) : 0.1;
    };
    this.steps = [
      {
        title: 'WELCOME TO FLIGHT SCHOOL',
        text: () =>
          `You are flying the <b>${P().spec.name}</b>. This course teaches you to fly and fight: follow the instructions in this panel. Each step completes by itself as soon as you have done it.<br><br>Press <kbd>ENTER</kbd> at any time to skip a step. The target drones fly steady and <b>never shoot back</b>.`,
        progress: () => this.stepT / 9,
        auto: 9,
      },
      {
        title: 'VIEWS',
        text: () => `Switch between the <b>cockpit</b> and the <b>chase camera</b> with ${this.key('camera')}. Try it twice now.<br><br>Other views: ${this.key('camFlyby')} fly-by, ${this.key('camTarget')} padlock the target. Hold the <kbd>RIGHT MOUSE</kbd> button and move the mouse to look around.`,
        setup: () => {
          this.views = 0;
          this.lastView = h.cameraMode?.() ?? '';
        },
        progress: () => {
          const v = h.cameraMode?.() ?? '';
          if (v !== this.lastView) {
            this.views++;
            this.lastView = v;
          }
          return this.views / 2;
        },
      },
      {
        title: 'PITCH: CLIMB AND DIVE',
        text: () =>
          (ms === 'mouseaim'
            ? `Click the screen to capture the mouse. Your jet <b>flies toward the mouse circle</b>: move the mouse <b>up</b> to climb and <b>down</b> to dive.`
            : ms === 'joystick'
              ? `Click the screen to capture the mouse: it works as the <b>stick</b>. Pull back (mouse down) to climb, push forward (mouse up) to dive.`
              : `${this.key('pitchUp')} pulls the nose up (climb), ${this.key('pitchDown')} pushes it down (dive).`) +
          `<br><br>Climb at least <b>15°</b> nose-up, then dive at least <b>10°</b> nose-down. The pitch ladder on the HUD shows your angle.`,
        setup: () => {
          this.maxClimb = -90;
          this.minClimb = 90;
        },
        progress: () => {
          const c = this.climbDeg(P());
          this.maxClimb = Math.max(this.maxClimb, c);
          this.minClimb = Math.min(this.minClimb, c);
          return Math.min(1, Math.max(0, this.maxClimb) / 15) * 0.5 + Math.min(1, Math.max(0, -this.minClimb) / 10) * 0.5;
        },
      },
      {
        title: 'TURNING',
        text: () =>
          (ms === 'mouseaim'
            ? `Move the mouse <b>left or right</b>: the jet banks and turns to follow the circle by itself.`
            : `Roll with ${this.key('rollLeft')} / ${this.key('rollRight')}, then pull back to turn: fighters turn by banking and pulling, not with the rudder.`) +
          ` The rudder is ${this.key('yawLeft')} / ${this.key('yawRight')}.<br><br>Turn through <b>90°</b> of heading (the compass along the top of the HUD).`,
        setup: () => {
          this.lastHdg = this.heading(P());
          this.turned = 0;
        },
        progress: () => {
          const hd = this.heading(P());
          let d = hd - this.lastHdg;
          if (d > 180) d -= 360;
          if (d < -180) d += 360;
          this.turned += Math.abs(d);
          this.lastHdg = hd;
          return this.turned / 90;
        },
      },
      {
        title: 'THROTTLE AND AFTERBURNER',
        text: () =>
          `${this.key('throttleUp')} throttles up, ${this.key('throttleDown')} throttles down. Keep holding throttle-up at 100% (or press ${this.key('afterburner')}) to light the <b>afterburner</b>: much more thrust, but it drinks fuel about four times as fast.<br><br><b>Light the afterburner now</b> and watch the flames.`,
        setup: () => (this.abOn = false),
        progress: () => (P().fm.afterburner > 0.3 ? 1 : Math.min(0.9, h.throttle?.() ?? 0) * 0.9),
      },
      {
        title: 'OUT OF BURNER',
        text: () => `Now bring the throttle back to <b>military power</b> (100% dry) or below with ${this.key('throttleDown')} or ${this.key('afterburner')}. Use the burner when you need speed or energy, not all the time.`,
        setup: () => (this.offT = 0),
        progress: () => {
          if (P().fm.afterburner < 0.01) this.offT += 1 / 60;
          else this.offT = 0;
          return this.offT / 1.2;
        },
      },
      {
        title: 'PULLING G',
        text: () =>
          `Turn hard: ${ms === 'mouseaim' ? 'swing the mouse far to one side and keep it there' : 'roll 80° and pull all the way back'}. Reach <b>6 G</b> on the G meter. Watch the edges of your vision grey out: that is the G on the pilot. Ease off before it goes black.<br><br>${this.key('gOverride')} overrides the G limiter in an emergency (it can overstress the jet).`,
        setup: () => (this.maxG = 1),
        progress: () => {
          this.maxG = Math.max(this.maxG, P().fm.nz);
          return (this.maxG - 1) / 5;
        },
      },
      {
        title: 'RADAR LOCK',
        text: () =>
          `A target drone is <b>8 NM ahead</b>. It shows on your radar scope and in the HUD as a box. Press ${this.key('lock')} to <b>lock</b> it (press again to cycle targets, ${this.key('unlock')} breaks the lock).<br><br>${this.key('radarMode')} changes the radar mode; ${this.key('scopeRange')} the scope range.`,
        setup: () => {
          this.clearDrones();
          this.topUp();
          this.spawnDrone(8 * NM, 0, 0, 0, 380, 7000);
        },
        progress: () => (!this.drones[0]?.alive || (P().radar.lock && this.drones.includes(P().radar.lock!)) ? 1 : 0),
      },
      {
        title: `FOX THREE: RADAR MISSILE`,
        text: () =>
          `Select the radar-guided <b>${rdName()}</b> with ${this.key('weapon120')}, keep the drone locked, and fire with ${this.fireText()}. It flies on its own radar: you can turn away once it goes <b>ACTIVE</b> (${this.key('camWeapon')} follows it with the missile camera).<br><br>Radar missiles are for long range: the numbers next to the target box are the launch ranges.`,
        setup: () => {
          this.shots0 = P().shotsFired;
          if (!this.liveDrone()) this.spawnDrone(8 * NM, 0, 0, 0, 380, 7000);
        },
        progress: killStep('radar'),
      },
      {
        title: 'FOX TWO: HEAT-SEEKER',
        text: () =>
          `A new drone is <b>2 NM ahead</b>. Select the heat-seeking <b>${irName()}</b> with ${this.key('weapon9x')}. Point your nose at it: when the seeker hears it you get a <b>growl</b> and the seeker circle sits on the target. Then fire with ${this.fireText()}.<br><br>Heat-seekers are for the dogfight: from behind is easiest.`,
        setup: () => {
          this.clearDrones();
          this.topUp();
          this.shots0 = P().shotsFired;
          this.spawnDrone(2 * NM, 0, 0, 0, 320, 6000);
        },
        progress: killStep('ir'),
      },
      {
        title: 'GUNS',
        text: () =>
          `Last drone. Select the gun with ${this.key('weaponGun')}. A small <b>lead circle</b> shows ahead of it from as far as 10 NM, with the range under it: it is dim while your rounds can't reach yet. Close in (under 1 NM hits best), put your gun cross <b>on the circle</b> and hold ${this.fireText()} in short bursts. The circle turns red when your rounds will hit.`,
        setup: () => {
          this.clearDrones();
          this.topUp();
          this.spawnDrone(0.9 * NM, 0, 0, 0, 300, 9000);
        },
        progress: killStep('gun'),
      },
      {
        title: 'COUNTERMEASURES',
        text: () =>
          `When a missile is coming, the warning sounds and the RWR shows where from. <b>Flares</b> (${this.key('flare')}) decoy heat-seekers; <b>chaff</b> (${this.key('chaff')}) decoys radar missiles. Drop both now.<br><br>Countermeasures work best with a hard turn: put the missile on your wing line and pull.`,
        setup: () => {
          this.clearDrones();
          this.cm0 = { flares: P().flares, chaff: P().chaff };
        },
        progress: () => (P().flares < this.cm0.flares ? 0.5 : 0) + (P().chaff < this.cm0.chaff ? 0.5 : 0),
      },
      {
        title: 'READY FOR YOUR CHECKRIDE',
        text: () =>
          `That's the basics. Useful keys: ${this.key('map')} theater map, ${this.key('pause')} pause, ${this.key('help')} the full controls list, ${this.key('autopilot')} auto-fly.<br><br><b>The checkride starts next</b>: 3 drones plus a <b>manoeuvring bandit</b> that dodges, turns and drops flares (it never shoots). Destroy all 4 within <b>5 minutes</b>. Your jet is rearmed.`,
        progress: () => this.stepT / 12,
        auto: 12,
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // mode lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    this.input = loadSettings().input;
    this.placePlayer();
    this.buildSteps();
    this.idx = 0;
    this.phase = 'lessons';
    this.enter();
    this.host.voice('Welcome to flight school');
  }

  private placePlayer(): void {
    const h = this.host;
    const p = h.createPlayer();
    const a = ROLES.arena;
    spawnInAir(p, new THREE.Vector3(a.cx - 16 * NM, mapAlt(6400), a.cz), 90, 420);
    h.sim.add(p);
    h.picture.gciEnabled.blue = true;
    h.picture.gciEnabled.red = false;
  }

  private enter(): void {
    const s = this.steps[this.idx];
    this.stepT = 0;
    this.doneT = -1;
    s.setup?.();
    this.render(0);
  }

  private complete(skipped = false): void {
    const reading = !!this.steps[this.idx]?.auto;
    this.doneT = skipped ? 0.35 : reading ? 0.2 : 1.4;
    this.render(1, skipped ? 'SKIPPED' : reading ? '' : 'DONE');
    if (!skipped && !reading) this.host.voice('Good');
  }

  private next(): void {
    this.idx++;
    if (this.idx >= this.steps.length) this.startCheckride();
    else this.enter();
  }

  private startCheckride(): void {
    const h = this.host;
    const p = h.player!;
    this.phase = 'checkride';
    this.clearDrones();
    this.topUp();
    this.checkT = 0;
    this.checkShots = p.shotsFired;
    this.spawnDrone(7 * NM, 0, 0, 180, 380, 6000);
    this.spawnDrone(9 * NM, -7 * NM, 600, 90, 360, 8000);
    this.spawnDrone(9 * NM, 7 * NM, -400, -90, 360, 8000);
    // the bandit: an easy AI that fights for real but holds its fire
    const e = new Aircraft(enemyTypesFor(p.type)[0], 'red', 'BANDIT 1-1');
    const fwd = new THREE.Vector3(p.fm.fwd.x, 0, p.fm.fwd.z).normalize();
    const pos = p.fm.pos.clone().addScaledVector(fwd, 14 * NM);
    spawnInAir(e, pos, (this.heading(p) + 180) % 360, 450);
    const ai = new AIPilot(e, duelSkill('EASY'), h.picture);
    ai.weaponsHold = true;
    ai.setRoute([p.fm.pos.clone()], pos.y);
    e.ai = ai;
    e.setStores({});
    h.sim.add(e);
    this.drones.push(e);
    h.order('CHECKRIDE', 'Destroy the 3 drones and the bandit within 5 minutes. The bandit manoeuvres and drops flares but never shoots. Use everything you learned. FIGHT\'S ON!', 10);
    h.voice("Fight's on");
    this.render(0);
  }

  update(dt: number): void {
    this.elapsed += dt;
    const h = this.host;
    const p = h.player;
    if (!p || this.over) return;
    // crashed: back in the air where you were (lessons), or the checkride is failed
    if (!p.alive) {
      this.deadTimer += dt;
      if (this.deadTimer > 3) {
        this.deadTimer = 0;
        if (this.phase === 'checkride') return this.finish(false, p.fm.crashCause || p.damage.destroyCause || 'Aircraft lost.');
        const pos = p.fm.pos.clone();
        const hdg = this.heading(p);
        h.sim.remove(p);
        const np = h.createPlayer();
        spawnInAir(np, new THREE.Vector3(pos.x, Math.max(mapAlt(5000), pos.y + 2500), pos.z), hdg, 420);
        h.sim.add(np);
        h.onPlayerRespawn?.();
        h.message('BACK IN THE AIR — CARRY ON WITH THE LESSON', 'info', 4);
        this.steps[this.idx]?.setup?.();
      }
      return;
    }
    if (this.phase === 'lessons') {
      this.stepT += dt;
      const s = this.steps[this.idx];
      if (this.doneT >= 0) {
        this.doneT -= dt;
        if (this.doneT < 0) this.next();
        return;
      }
      const prog = Math.min(1, s.progress());
      // out of the missile this lesson needs (a miss): reload
      if (this.stepT > 20 && this.stepT % 20 < dt && s.title.startsWith('FOX')) {
        const need = s.title.includes('RADAR') ? p.radarMissile : p.irMissile;
        if (p.countOf(need) === 0) {
          this.topUp();
          h.message('RELOADED — TRY AGAIN', 'info', 3);
        }
      }
      if (prog >= 1 || (s.auto && this.stepT >= s.auto)) this.complete();
      else this.render(prog);
      return;
    }
    if (this.phase === 'checkride') {
      this.checkT += dt;
      const alive = this.drones.filter((d) => d.alive).length;
      if (alive === 0) return this.finish(true, 'All four targets destroyed.');
      if (this.checkT >= CHECKRIDE_TIME) return this.finish(false, `Time up: ${alive} target${alive > 1 ? 's' : ''} left.`);
      // missiles never run out on the checkride's clock either
      if (p.countOf(p.irMissile) + p.countOf(p.radarMissile) === 0 && this.checkT % 10 < dt) this.topUp();
      this.render((4 - alive) / 4);
    }
  }

  private finish(passed: boolean, why: string): void {
    const h = this.host;
    const p = h.player;
    this.over = true;
    this.phase = 'done';
    this.panel.style.display = 'none';
    const t = this.checkT;
    const shots = p ? p.shotsFired - this.checkShots : 0;
    const grade = !passed ? 'U' : t < 120 && shots <= 6 ? 'A' : t < 200 ? 'B' : 'C';
    const gradeText: Record<string, string> = { A: 'EXCELLENT', B: 'GOOD', C: 'PASS', U: 'UNSATISFACTORY' };
    h.showResults({
      title: passed ? 'CHECKRIDE PASSED' : 'CHECKRIDE FAILED',
      subtitle: `${why} Grade ${grade} — ${gradeText[grade]}.${passed ? ' You are ready for combat: try WAVE COMBAT or a 1v1 DUEL.' : ' Retake it, or go back through the lessons.'}`,
      good: passed,
      stats: statsFor(p, [
        ['CHECKRIDE TIME', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`],
        ['MISSILES ON THE CHECKRIDE', String(shots)],
        ['GRADE', `${grade} (${gradeText[grade]})`],
      ]),
      buttons: [
        { label: 'RETAKE CHECKRIDE', action: 'retry' },
        { label: 'RESTART LESSONS', action: 'continue' },
        { label: 'MAIN MENU', action: 'menu' },
      ],
    });
  }

  private resetWorld(): void {
    const h = this.host;
    for (const a of [...h.sim.aircraft]) h.sim.remove(a);
    h.sim.missiles.length = 0;
    h.sim.bullets.clear();
    h.sim.cms.clear();
    h.picture.clear();
    this.drones = [];
    this.over = false;
    this.deadTimer = 0;
    this.panel.style.display = '';
  }

  handle(action: ResultButton['action']): void {
    // RESTART from the pause menu during the lessons starts the lessons again
    // (it used to jump straight into the checkride)
    if (action === 'retry' && this.phase !== 'lessons') {
      this.resetWorld();
      this.placePlayer();
      this.startCheckride();
    } else if (action === 'continue' || action === 'retry') {
      this.resetWorld();
      this.start();
    }
  }

  status(): ModeStatus {
    const alive = this.drones.filter((d) => d.alive).length;
    if (this.phase === 'checkride' || this.phase === 'done')
      return {
        title: 'FLIGHT SCHOOL · CHECKRIDE',
        blue: 1,
        red: alive,
        timer: Math.max(0, CHECKRIDE_TIME - this.checkT),
        objective: `DESTROY ALL TARGETS · ${alive} LEFT`,
      };
    return {
      title: 'FLIGHT SCHOOL',
      blue: 1,
      red: alive,
      timer: this.elapsed,
      objective: `LESSON ${this.idx + 1} / ${this.steps.length} · ${this.steps[this.idx]?.title ?? ''}`,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.panel.remove();
  }

  // ---------------------------------------------------------------------------
  // instructor panel
  // ---------------------------------------------------------------------------

  private lastHtml = '';
  private bar: HTMLDivElement | null = null;
  private render(prog: number, badge = ''): void {
    let head: string, title: string, body: string, foot: string;
    if (this.phase === 'checkride') {
      const left = Math.max(0, CHECKRIDE_TIME - this.checkT);
      const alive = this.drones.filter((d) => d.alive).length;
      head = 'CHECKRIDE';
      title = `${alive} TARGET${alive === 1 ? '' : 'S'} LEFT · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      body = `Find them on the radar scope, lock with ${this.key('lock')} and use any weapon. The bandit fights back with manoeuvres and flares only.`;
      foot = 'DESTROY ALL FOUR';
    } else {
      const s = this.steps[this.idx];
      head = `LESSON ${this.idx + 1} / ${this.steps.length}`;
      title = s.title;
      body = s.text();
      foot = badge ? '&nbsp;' : '<kbd>ENTER</kbd> SKIP THIS STEP';
    }
    const html = `<div class="tut-head"><span>${head}</span><span class="tut-badge${badge ? ' on' : ''}">${badge ? '✓ ' + badge : ''}</span></div><div class="tut-title">${title}</div><div class="tut-body">${body}</div><div class="tut-bar"><div></div></div><div class="tut-foot">${foot}</div>`;
    if (html !== this.lastHtml) {
      this.panel.innerHTML = html;
      this.lastHtml = html;
      this.panel.classList.toggle('done', !!badge);
      this.bar = this.panel.querySelector('.tut-bar > div');
    }
    if (this.bar) this.bar.style.width = `${Math.round(Math.max(0, Math.min(1, prog)) * 100)}%`;
  }
}
