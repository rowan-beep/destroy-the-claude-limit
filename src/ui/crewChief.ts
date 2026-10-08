// CREW CHIEF: the jet in the menu hangar is yours to fix. Its forms (the AFTO 781)
// list the pilot's write-ups; each one is a task card of hands-on steps worked in
// mini-games over the 3D jet: find the part (the camera closes in on it), take off
// and refit fasteners (in a cross pattern where it matters), torque them with a
// clicker wrench, service fluids and gases to the band, search with a torch for the
// leak or the nick, isolate faults from the tech data, read gauges against limits.
// Tool control: the kit is counted before the engines run; a tool left in an
// intake is foreign object damage. Then the engine run, the sign-off, and the next jet.

import * as THREE from 'three';
import { el, clearEl } from './dom';
import type { Hangar } from './menu/hangar';
import { AIRCRAFT_TYPES, AircraftType, SPECS } from '../aircraft/specs';
import { Job, Step, Spot, makeWorkOrder } from '../game/crewChief/jobs';
import { loadCc, saveCc, ccRank, jobsForRank, CcLog } from '../game/crewChief/career';
import { audio } from '../audio/audio';

const CSS = `
.cc{position:fixed;inset:0;z-index:30;pointer-events:none;font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;color:#eef2f7;letter-spacing:.04em}
.cc.hidden{display:none}
.cc button{font:inherit;cursor:pointer;pointer-events:auto}
.cc-top{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:14px;padding:10px 16px;background:linear-gradient(#05080cdd,#05080c00)}
.cc-top h1{margin:0;font-size:20px;letter-spacing:.3em}
.cc-rank{font-size:12px;letter-spacing:.16em;color:#ffd38a}
.cc-xp{width:180px;height:5px;border-radius:3px;background:#ffffff1c;overflow:hidden}
.cc-xp i{display:block;height:100%;background:linear-gradient(90deg,#ffb14a,#ffe2a6)}
.cc-sp{flex:1}
.cc-b{background:#121820e0;border:1px solid #ffffff2a;color:#eef2f7;border-radius:8px;padding:7px 13px;font-size:13px;font-weight:700;letter-spacing:.12em}
.cc-b:hover{background:#1c2430}
.cc-b.gold{background:linear-gradient(180deg,#fff2dc,#ffcf8a);color:#1a1206;border:0}
.cc-b.red{color:#ffb3b3;border-color:#ff6b6b66}
.cc-b:disabled{opacity:.4;cursor:default}
.cc-forms{position:absolute;left:14px;top:58px;width:330px;max-height:calc(100vh - 80px);overflow-y:auto;background:#f4efe2;color:#1e1b14;border-radius:4px;box-shadow:0 10px 40px #000a;pointer-events:auto;font-family:'Courier New',ui-monospace,monospace}
.cc-forms h2{margin:0;padding:8px 10px;font-size:13px;letter-spacing:.12em;background:#1e1b14;color:#f4efe2;display:flex;justify-content:space-between}
.cc-fh{padding:6px 10px;font-size:11px;border-bottom:1px solid #1e1b1433;display:flex;justify-content:space-between}
.cc-wu{display:grid;grid-template-columns:30px 1fr;gap:6px;padding:8px 10px;border-bottom:1px dashed #1e1b1440;cursor:pointer}
.cc-wu:hover{background:#e9e1cc}
.cc-wu.on{background:#ffe6a8}
.cc-sym{font-size:22px;font-weight:900;line-height:1;text-align:center}
.cc-sym.x{color:#c0261a}
.cc-sym.ok{color:#1e7a2f}
.cc-sym.w{color:#b8730c}
.cc-wt{font-size:12px;line-height:1.35}
.cc-ws{font-size:10px;letter-spacing:.1em;color:#5b5446;margin-top:2px}
.cc-card{position:absolute;right:14px;top:58px;width:min(560px,calc(100vw - 380px));background:#0b0f15f0;border:1px solid #ffffff22;border-radius:12px;padding:12px 14px;pointer-events:auto;box-shadow:0 16px 50px #000a}
.cc-k{font-size:11px;letter-spacing:.26em;color:#8fa0b5}
.cc-t{font-size:18px;font-weight:700;letter-spacing:.06em;margin:2px 0 6px}
.cc-steps{display:flex;gap:3px;margin-bottom:8px}
.cc-steps i{flex:1;height:4px;border-radius:2px;background:#ffffff18}
.cc-steps i.d{background:#5bd17a}
.cc-steps i.c{background:#ffb14a}
.cc-x{font-size:15px;line-height:1.45;color:#e3e9f0;margin-bottom:10px}
.cc-play{position:relative;min-height:60px}
.cc-msg{margin-top:8px;font-size:13px;min-height:1.3em;color:#ffd38a}
.cc-msg.bad{color:#ff9a8a}
.cc-msg.good{color:#8fe8a8}
.cc-data{background:#f4efe2;color:#1e1b14;font-family:'Courier New',ui-monospace,monospace;font-size:12px;line-height:1.45;padding:8px 10px;border-radius:4px;margin-bottom:8px}
.cc-data b{display:block;font-size:11px;letter-spacing:.12em;margin-bottom:3px}
.cc-opts{display:flex;flex-direction:column;gap:6px}
.cc-opts .cc-b{text-align:left}
.cc-mk{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;width:26px;height:26px;border-radius:50%;border:2px solid #ffd38a;background:#ffb14a44;box-shadow:0 0 0 4px #ffb14a22,0 0 16px #ffb14a;animation:ccPulse 1.4s infinite}
.cc-mk span{position:absolute;left:30px;top:2px;white-space:nowrap;font-size:12px;font-weight:700;letter-spacing:.12em;text-shadow:0 1px 3px #000;opacity:0;transition:opacity .2s}
.cc-mk:hover span{opacity:1}
.cc-mk.pin{border-color:#ff5a4a;background:#ff3a2a55;box-shadow:0 0 14px #ff3a2a}
.cc-mk.pin::after{content:'';position:absolute;left:10px;top:20px;width:5px;height:26px;background:#e0261a;transform:rotate(12deg);border-radius:2px}
@keyframes ccPulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.18)}}
.cc-tools{position:absolute;left:14px;bottom:14px;background:#0b0f15e0;border:1px solid #ffffff22;border-radius:10px;padding:8px 10px;font-size:12px;letter-spacing:.12em;pointer-events:auto}
.cc-tools b{color:#ffd38a}
.cc-dial{display:block;margin:0 auto}
.cc-row{display:flex;gap:8px;justify-content:center;margin-top:8px;flex-wrap:wrap}
.cc-sum{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));background:#0b0f15f4;border:1px solid #ffb14a66;border-radius:14px;padding:18px 20px;pointer-events:auto;text-align:center;box-shadow:0 20px 80px #000c}
.cc-sum h2{margin:0 0 4px;letter-spacing:.2em}
.cc-stars{font-size:30px;letter-spacing:4px;color:#ffc85a}
.cc-stars i{font-style:normal;color:#ffffff22}
.cc-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;margin-top:10px}
.cc-pick .cc-b{font-size:12px}
.cc-gauges{display:flex;gap:16px;justify-content:center}
.cc-g{text-align:center;font-size:11px;letter-spacing:.14em;color:#aab6c6}
.cc-g b{display:block;font-size:22px;color:#fff;font-variant-numeric:tabular-nums}
.cc-g.hot b{color:#ff8a6a}
@media (max-width:900px){.cc-forms{width:240px}.cc-card{width:calc(100vw - 280px)}}
`;

interface JobState {
  job: Job;
  step: number;
  done: boolean;
  mistakes: number;
}

const TOOLS = 24;

export class CrewChief {
  readonly root: HTMLDivElement;
  private top: HTMLElement;
  private forms: HTMLElement;
  private card: HTMLElement;
  private tools: HTMLElement;
  private markers: HTMLElement;
  private overlay: HTMLElement;
  private log: CcLog = loadCc();
  private jet: AircraftType = 'F15EX';
  private tail = '';
  private jobs: JobState[] = [];
  private cur = -1;
  private raf = 0;
  private marks: { el: HTMLElement; at: THREE.Vector3 }[] = [];
  private toolsOut = TOOLS;
  /** a tool left behind somewhere in the jet (found before the engine run, or FOD) */
  private toolLost = false;
  private needsRun = false;
  private ran = false;
  private shiftStart = 0;
  onExit: (() => void) | null = null;

  constructor(parent: HTMLElement, private hangar: Hangar) {
    if (!document.getElementById('cc-style')) {
      const st = el('style', '', document.head);
      st.id = 'cc-style';
      st.textContent = CSS;
    }
    this.root = el('div', 'cc hidden', parent);
    this.markers = el('div', '', this.root);
    this.top = el('div', 'cc-top', this.root);
    this.forms = el('div', 'cc-forms', this.root);
    this.card = el('div', 'cc-card', this.root);
    this.tools = el('div', 'cc-tools', this.root);
    this.overlay = el('div', '', this.root);
    for (const ev of ['pointerdown', 'wheel']) this.card.addEventListener(ev, (e) => e.stopPropagation());
    // (Escape leaves the hangar floor, unless a box is up)
    window.addEventListener('keydown', (e) => {
      if (!this.open || e.code !== 'Escape' || this.overlay.childElementCount) return;
      e.preventDefault();
      this.close();
    });
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  /** start a shift on a jet (the one on show in the hangar by default) */
  start(jet: AircraftType): void {
    this.root.classList.remove('hidden');
    this.newJet(jet);
    const tick = () => {
      if (!this.open) return;
      this.raf = requestAnimationFrame(tick);
      this.placeMarkers();
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  }

  close(): void {
    this.root.classList.add('hidden');
    cancelAnimationFrame(this.raf);
    this.clearMarkers();
    this.hangar.work(null);
    this.onExit?.();
  }

  private newJet(jet: AircraftType): void {
    this.jet = jet;
    this.hangar.setJet(jet);
    const r = ccRank(this.log.xp);
    const n = r.i >= 5 ? 4 : r.i >= 2 ? 3 : 2;
    this.jobs = makeWorkOrder(jet, n, jobsForRank(r.i)).map((job) => ({ job, step: 0, done: false, mistakes: 0 }));
    this.tail = `${['AF', 'NAVY', 'MARINES'][Math.floor(Math.random() * 3)]} ${String(Math.floor(Math.random() * 90 + 10))}-${String(Math.floor(Math.random() * 9000 + 1000))}`;
    this.cur = -1;
    this.toolsOut = TOOLS;
    this.toolLost = false;
    this.needsRun = this.jobs.some((j) => j.job.run);
    this.ran = false;
    this.shiftStart = performance.now();
    this.overlay.innerHTML = '';
    this.hangar.work(null);
    this.drawTop();
    this.drawForms();
    this.drawIdle();
    this.drawTools();
  }

  // ---------------------------------------------------------------- the frame

  private drawTop(): void {
    const t = this.top;
    clearEl(t);
    el('h1', '', t, 'CREW CHIEF');
    const r = ccRank(this.log.xp);
    const rk = el('div', '', t);
    el('div', 'cc-rank', rk, r.rank.name);
    const bar = el('div', 'cc-xp', rk);
    el('i', '', bar).style.width = `${r.next ? (((this.log.xp - r.rank.xp) / (r.next.xp - r.rank.xp)) * 100).toFixed(1) : 100}%`;
    el('div', 'cc-ws', rk, `${this.log.xp.toLocaleString('en-US')} XP${r.next ? ` · NEXT: ${r.next.name.split(' ·')[0]} AT ${r.next.xp.toLocaleString('en-US')}` : ''} · ${this.log.jets} JETS TURNED`).style.color = '#8fa0b5';
    el('div', 'cc-sp', t);
    const other = el('button', 'cc-b', t, 'ANOTHER JET') as HTMLButtonElement;
    other.addEventListener('click', () => this.chooseJet());
    const exit = el('button', 'cc-b red', t, 'BACK TO THE MENU') as HTMLButtonElement;
    exit.addEventListener('click', () => this.close());
  }

  private drawForms(): void {
    const f = this.forms;
    clearEl(f);
    const h = el('h2', '', f);
    el('span', '', h, 'AFTO FORM 781A');
    el('span', '', h, 'MAINTENANCE DISCREPANCY');
    const fh = el('div', 'cc-fh', f);
    el('span', '', fh, `${SPECS[this.jet].shortName.toUpperCase()} · S/N ${this.tail}`);
    const open = this.jobs.filter((j) => !j.done).length;
    el('span', '', fh, open ? `STATUS: RED X (${open})` : 'STATUS: CODE 1');
    this.jobs.forEach((j, i) => {
      const r = el('div', 'cc-wu' + (i === this.cur ? ' on' : ''), f);
      el('div', 'cc-sym ' + (j.done ? 'ok' : j.step > 0 ? 'w' : 'x'), r, j.done ? '✓' : j.step > 0 ? '/' : 'X');
      const b = el('div', '', r);
      el('div', 'cc-wt', b, j.job.writeUp);
      el('div', 'cc-ws', b, j.done ? `CORRECTED · ${j.job.action}` : `${j.job.system} · ${j.job.steps.length} STEPS`);
      r.addEventListener('click', () => {
        if (j.done) return;
        this.cur = i;
        this.drawForms();
        this.doStep();
      });
    });
  }

  private drawTools(): void {
    this.tools.innerHTML = `TOOL KIT <b>${this.toolsOut}/${TOOLS}</b> SIGNED OUT · CTK #${(this.tail.length * 37) % 900 + 100}`;
  }

  private drawIdle(): void {
    const c = this.card;
    clearEl(c);
    el('div', 'cc-k', c, 'THE FORMS');
    el('div', 'cc-t', c, this.jobs.every((j) => j.done) ? 'ALL WRITE-UPS CORRECTED' : 'PICK A WRITE-UP TO WORK');
    el('div', 'cc-x', c, this.jobs.every((j) => j.done) ? 'Close out: count the tool kit, then run the engines if the work needs it, and sign the jet off.' : 'Each line on the forms is a job. Click one to open its task card. The jet is on a RED X until every one is corrected and signed.');
    if (this.jobs.every((j) => j.done)) {
      const row = el('div', 'cc-row', c);
      const b = el('button', 'cc-b gold', row, this.needsRun && !this.ran ? 'COUNT THE TOOLS, THEN ENGINE RUN' : 'COUNT THE TOOLS AND SIGN OFF') as HTMLButtonElement;
      b.addEventListener('click', () => this.toolCheck());
    }
  }

  // ---------------------------------------------------------------- a job's steps

  private get js(): JobState | null {
    return this.jobs[this.cur] ?? null;
  }

  private doStep(): void {
    const j = this.js;
    if (!j) return this.drawIdle();
    const step = j.job.steps[j.step];
    if (!step) return this.finishJob();
    const c = this.card;
    clearEl(c);
    this.clearMarkers();
    el('div', 'cc-k', c, `${j.job.system} · STEP ${j.step + 1} OF ${j.job.steps.length}`);
    el('div', 'cc-t', c, j.job.writeUp.split('.')[0]);
    const bar = el('div', 'cc-steps', c);
    j.job.steps.forEach((_, i) => el('i', i < j.step ? 'd' : i === j.step ? 'c' : '', bar));
    el('div', 'cc-x', c, step.text);
    const play = el('div', 'cc-play', c);
    const msg = el('div', 'cc-msg', c);
    const say = (t: string, kind = '') => {
      msg.textContent = t;
      msg.className = 'cc-msg ' + kind;
    };
    const next = (delay = 650) => {
      setTimeout(() => {
        if (this.js !== j) return;
        j.step++;
        this.drawForms();
        this.doStep();
      }, delay);
    };
    const wrong = (t: string) => {
      j.mistakes++;
      audio.beep(220, 0.12, 0.08, 'square');
      say(t, 'bad');
    };
    const right = (t: string) => {
      audio.click();
      say(t, 'good');
    };
    switch (step.k) {
      case 'pick':
        return this.stepPick(step, say, wrong, right, next);
      case 'pins':
        return this.stepPins(step, play, say, right, next);
      case 'fasteners':
        return this.stepFasteners(step, play, wrong, right, next);
      case 'torque':
        return this.stepTorque(step, play, say, wrong, right, next);
      case 'fill':
        return this.stepFill(step, play, say, wrong, right, next);
      case 'search':
        return this.stepSearch(step, play, wrong, right, next);
      case 'choose':
        return this.stepChoose(step, play, wrong, right, next);
      case 'measure':
        return this.stepMeasure(step, play, wrong, right, next);
      case 'wait':
        return this.stepWait(step, play, right, next);
      case 'run':
        return;
    }
  }

  private finishJob(): void {
    const j = this.js;
    if (!j) return;
    j.done = true;
    this.cur = -1;
    this.hangar.work(null);
    this.clearMarkers();
    audio.beep(880, 0.08, 0.06, 'sine');
    setTimeout(() => audio.beep(1320, 0.1, 0.06, 'sine'), 110);
    this.drawForms();
    this.drawIdle();
  }

  // ---- the jet in 3D: markers over parts

  private world(s: Spot): THREE.Vector3 {
    return this.hangar.jetPoint(s.x, s.y, s.z);
  }

  private focus(s: Spot): void {
    this.hangar.work(this.world(s), s.dist, new THREE.Vector3(...s.dir));
  }

  private mark(s: Spot, cls: string, onClick: () => void): HTMLElement {
    const m = el('div', 'cc-mk ' + cls, this.markers);
    el('span', '', m, s.label);
    m.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onClick();
    });
    this.marks.push({ el: m, at: this.world(s) });
    return m;
  }

  private clearMarkers(): void {
    for (const m of this.marks) m.el.remove();
    this.marks = [];
  }

  private placeMarkers(): void {
    const cam = this.hangar.camera;
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    for (const m of this.marks) {
      v.copy(m.at).project(cam);
      const on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      m.el.style.display = on ? '' : 'none';
      m.el.style.left = `${((v.x * 0.5 + 0.5) * w).toFixed(0)}px`;
      m.el.style.top = `${((-v.y * 0.5 + 0.5) * h).toFixed(0)}px`;
    }
  }

  // ---- the mini-games

  private stepPick(step: Extract<Step, { k: 'pick' }>, say: (t: string, k?: string) => void, wrong: (t: string) => void, right: (t: string) => void, next: (delay?: number) => void): void {
    this.hangar.work(null);
    const all = [{ s: step.at, ok: true }, ...(step.decoys ?? []).map((s) => ({ s, ok: false }))].sort(() => Math.random() - 0.5);
    for (const a of all)
      this.mark(a.s, '', () => {
        if (!a.ok) return wrong(`That's the ${a.s.label.toLowerCase()}. Read the write-up again.`);
        right(`${a.s.label}.`);
        this.clearMarkers();
        this.focus(step.at);
        next(1100);
      });
    say('Click the right place on the jet (drag to walk round it).');
  }

  private stepPins(step: Extract<Step, { k: 'pins' }>, play: HTMLElement, say: (t: string, k?: string) => void, right: (t: string) => void, next: (delay?: number) => void): void {
    this.hangar.work(null);
    let left = step.spots.length;
    const count = el('div', 'cc-g', play);
    const upd = () => (count.innerHTML = `PULLED<b>${step.spots.length - left} / ${step.spots.length}</b>`);
    upd();
    for (const s of step.spots) {
      const m = this.mark(s, 'pin', () => {
        m.remove();
        this.marks = this.marks.filter((x) => x.el !== m);
        left--;
        upd();
        right(`${s.label}: pulled and in the bag.`);
        if (!left) next(900);
      });
    }
    say('Walk round: drag the view to find them all.');
  }

  private stepFasteners(step: Extract<Step, { k: 'fasteners' }>, play: HTMLElement, wrong: (t: string) => void, right: (t: string) => void, next: (delay?: number) => void): void {
    const n = step.n;
    const W = 300, H = step.pattern === 'row' ? 120 : 220;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.classList.add('cc-dial');
    play.appendChild(svg);
    const pts: [number, number][] = [];
    if (step.pattern === 'row' || n > 12) {
      const cols = Math.min(n, 7), rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) pts.push([30 + ((i % cols) * (W - 60)) / Math.max(1, cols - 1), H / 2 + (Math.floor(i / cols) - (rows - 1) / 2) * 34]);
      svg.innerHTML = `<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="10" fill="#2a313a" stroke="#56606c"/>`;
    } else if (n === 1) {
      pts.push([W / 2, H / 2]);
      svg.innerHTML = `<circle cx="${W / 2}" cy="${H / 2}" r="90" fill="#2a313a" stroke="#56606c" stroke-width="3"/><circle cx="${W / 2}" cy="${H / 2}" r="44" fill="#1d232a" stroke="#56606c"/>`;
    } else {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        pts.push([W / 2 + Math.cos(a) * 80, H / 2 + Math.sin(a) * 80]);
      }
      svg.innerHTML = `<circle cx="${W / 2}" cy="${H / 2}" r="100" fill="#2a313a" stroke="#56606c" stroke-width="3"/><circle cx="${W / 2}" cy="${H / 2}" r="40" fill="#1d232a" stroke="#56606c"/>`;
    }
    // the cross (star) order: each next bolt as far as can be from those already done
    const order: number[] = [];
    if (step.pattern === 'star') {
      const left = new Set(pts.map((_, i) => i));
      let cur = 0;
      while (left.size) {
        order.push(cur);
        left.delete(cur);
        let best = -1, bd = -1;
        for (const i of left) {
          const d = Math.min(...order.map((o) => Math.hypot(pts[i][0] - pts[o][0], pts[i][1] - pts[o][1]) + (o === order[order.length - 1] ? 0.0001 : 0)));
          const dl = Math.hypot(pts[i][0] - pts[order[order.length - 1]][0], pts[i][1] - pts[order[order.length - 1]][1]);
          const score = dl + d * 0.5;
          if (score > bd) {
            bd = score;
            best = i;
          }
        }
        if (best < 0) break;
        cur = best;
      }
    }
    let k = 0;
    let firstWrong = true;
    const ns = 'http://www.w3.org/2000/svg';
    const nodes = pts.map(([x, y], i) => {
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('transform', `translate(${x},${y})`);
      g.style.cursor = 'pointer';
      g.innerHTML = step.remove || n === 1 ? `<circle r="11" fill="#c9ced4" stroke="#6d757e" stroke-width="2"/><path d="M-6 0H6M0 -6V6" stroke="#4a5058" stroke-width="2.4"/>` : `<circle r="11" fill="none" stroke="#ffd38a" stroke-dasharray="3 3" stroke-width="2"/>`;
      svg.appendChild(g);
      g.addEventListener('click', () => {
        if (g.dataset.done) return;
        if (step.pattern === 'star' && order[k] !== i) {
          wrong(firstWrong ? 'Cross pattern: go to the bolt opposite, so it seats evenly.' : 'Opposite side!');
          firstWrong = false;
          // (after a slip, show the next one)
          const want = nodes[order[k]];
          want.querySelector('circle')?.setAttribute('stroke', '#5bd17a');
          return;
        }
        g.dataset.done = '1';
        audio.beep(step.remove ? 900 : 700, 0.03, 0.05, 'square');
        g.innerHTML = step.remove ? `<circle r="11" fill="#1d232a" stroke="#3a424b" stroke-width="2"/>` : `<circle r="11" fill="#c9ced4" stroke="#6d757e" stroke-width="2"/><path d="M-6 0H6M0 -6V6" stroke="#4a5058" stroke-width="2.4"/>`;
        k++;
        if (k >= n) {
          right(`${step.what}: ${step.remove ? 'removed' : 'installed'}.`);
          next();
        }
      });
      return g;
    });
  }

  /** a clicker torque wrench: hold to pull, let go in the band */
  private stepTorque(step: Extract<Step, { k: 'torque' }>, play: HTMLElement, say: (t: string, k?: string) => void, wrong: (t: string) => void, right: (t: string) => void, next: (delay?: number) => void): void {
    const cv = el('canvas', 'cc-dial', play) as HTMLCanvasElement;
    cv.width = 300;
    cv.height = 170;
    const g = cv.getContext('2d')!;
    const row = el('div', 'cc-row', play);
    const btn = el('button', 'cc-b gold', row, 'HOLD TO PULL THE WRENCH (or hold SPACE)') as HTMLButtonElement;
    let v = 0, holding = false, done = 0;
    let last = performance.now();
    const draw = () => {
      g.clearRect(0, 0, 300, 170);
      const cx = 150, cy = 150, R = 120;
      const ang = (x: number) => Math.PI + (x / step.max) * Math.PI;
      g.lineWidth = 16;
      g.strokeStyle = '#2a313a';
      g.beginPath();
      g.arc(cx, cy, R, Math.PI, 0);
      g.stroke();
      g.strokeStyle = '#3fae5c';
      g.beginPath();
      g.arc(cx, cy, R, ang(step.lo), ang(step.hi));
      g.stroke();
      g.strokeStyle = '#c0392b';
      g.beginPath();
      g.arc(cx, cy, R, ang(step.hi), 0);
      g.stroke();
      g.strokeStyle = '#fff';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(ang(v)) * (R - 4), cy + Math.sin(ang(v)) * (R - 4));
      g.stroke();
      g.fillStyle = '#fff';
      g.font = '700 20px Rajdhani, system-ui';
      g.textAlign = 'center';
      g.fillText(`${Math.round(v)} ${step.unit}`, cx, cy - 34);
      g.font = '600 11px Rajdhani, system-ui';
      g.fillStyle = '#aab6c6';
      g.fillText(`${step.what} · SPEC ${step.lo}-${step.hi} ${step.unit} · ${done}/${step.count}`, cx, cy - 12);
    };
    const tick = () => {
      if (!play.isConnected) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (holding) v = Math.min(step.max, v + dt * step.max * (0.18 + (v / step.max) * 0.45));
      draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const release = () => {
      if (!holding) return;
      holding = false;
      if (v >= step.lo && v <= step.hi) {
        audio.beep(1800, 0.02, 0.08, 'square');
        done++;
        right(`Click. ${Math.round(v)} ${step.unit}: in spec.`);
        v = 0;
        if (done >= step.count) next(800);
      } else if (v > step.hi) {
        wrong(`${Math.round(v)} ${step.unit}: OVER-TORQUED. The bolt is stretched: replace it and torque the new one.`);
        v = 0;
      } else {
        say(`${Math.round(v)} ${step.unit}: under spec. Pull again.`, 'bad');
      }
    };
    btn.addEventListener('pointerdown', () => {
      holding = true;
      v = Math.max(v, 0);
    });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    const kd = (e: KeyboardEvent) => {
      if (!play.isConnected) return window.removeEventListener('keydown', kd);
      if (e.code === 'Space') {
        e.preventDefault();
        holding = true;
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (!play.isConnected) return window.removeEventListener('keyup', ku);
      if (e.code === 'Space') release();
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
  }

  /** a tank or tire gauge: hold to fill (or bleed), stop in the band */
  private stepFill(step: Extract<Step, { k: 'fill' }>, play: HTMLElement, say: (t: string, k?: string) => void, wrong: (t: string) => void, right: (t: string) => void, next: (delay?: number) => void): void {
    const cv = el('canvas', 'cc-dial', play) as HTMLCanvasElement;
    cv.width = 300;
    cv.height = 160;
    const g = cv.getContext('2d')!;
    const down = step.hi < step.start;
    const row = el('div', 'cc-row', play);
    const go = el('button', 'cc-b gold', row, down ? 'HOLD TO BLEED / DRAIN' : 'HOLD TO SERVICE') as HTMLButtonElement;
    const back = el('button', 'cc-b', row, down ? 'TOP UP A LITTLE' : 'DRAIN A LITTLE') as HTMLButtonElement;
    const ok = el('button', 'cc-b', row, 'DONE: CHECK IT') as HTMLButtonElement;
    let v = step.start, holding = false;
    let last = performance.now();
    const draw = () => {
      g.clearRect(0, 0, 300, 160);
      const x0 = 120, y0 = 10, wd = 60, ht = 140;
      g.fillStyle = '#1d232a';
      g.fillRect(x0, y0, wd, ht);
      const y = (x: number) => y0 + ht - (x / step.max) * ht;
      g.fillStyle = '#3fae5c55';
      g.fillRect(x0 - 8, y(step.hi), wd + 16, y(step.lo) - y(step.hi));
      g.fillStyle = step.what.includes('OIL') ? '#c9a24a' : step.what.includes('HYD') ? '#c23a5a' : '#5aa8ff';
      g.fillRect(x0 + 4, y(v), wd - 8, y0 + ht - y(v));
      g.strokeStyle = '#56606c';
      g.strokeRect(x0, y0, wd, ht);
      g.fillStyle = '#fff';
      g.font = '700 20px Rajdhani, system-ui';
      g.textAlign = 'left';
      g.fillText(`${v.toFixed(step.max > 200 ? 0 : 1)} ${step.unit}`, x0 + wd + 16, y(v) + 7);
      g.font = '600 11px Rajdhani, system-ui';
      g.fillStyle = '#aab6c6';
      g.fillText(step.what, 8, 20);
      g.fillText(`BAND ${step.lo}-${step.hi}`, 8, 36);
    };
    const tick = () => {
      if (!play.isConnected) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (holding) v = Math.max(0, Math.min(step.max, v + (down ? -1 : 1) * dt * step.max * 0.22));
      draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    go.addEventListener('pointerdown', () => (holding = true));
    for (const ev of ['pointerup', 'pointerleave']) go.addEventListener(ev, () => (holding = false));
    back.addEventListener('click', () => (v = Math.max(0, Math.min(step.max, v + (down ? 1 : -1) * step.max * 0.03))));
    ok.addEventListener('click', () => {
      if (v >= step.lo && v <= step.hi) {
        right(`${v.toFixed(step.max > 200 ? 0 : 1)} ${step.unit}: in the band.`);
        next();
      } else if ((!down && v > step.hi) || (down && v < step.lo)) wrong(down ? 'Too far: top it back up into the band.' : 'Overserviced: drain it back into the band (too much is as bad as too little).');
      else say('Not there yet.', 'bad');
    });
  }

  /** a torch in the dark: find the defect */
  private stepSearch(step: Extract<Step, { k: 'search' }>, play: HTMLElement, wrong: (t: string) => void, right: (t: string) => void, next: (delay?: number) => void): void {
    const W = Math.min(520, this.card.clientWidth - 30), H = 260;
    const cv = el('canvas', 'cc-dial', play) as HTMLCanvasElement;
    cv.width = W;
    cv.height = H;
    cv.style.cursor = 'none';
    cv.style.borderRadius = '8px';
    const g = cv.getContext('2d')!;
    // the scene: panels, rivets, lines (or fan blades), drawn once
    const base = document.createElement('canvas');
    base.width = W;
    base.height = H;
    const b = base.getContext('2d')!;
    b.fillStyle = '#5b6168';
    b.fillRect(0, 0, W, H);
    const rnd = (a: number, c: number) => a + Math.random() * (c - a);
    const tx = rnd(60, W - 60), ty = rnd(50, H - 50);
    if (step.scene === 'nick') {
      // the fan face: blades radiating from a hub
      b.fillStyle = '#2d3238';
      b.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        b.strokeStyle = i % 2 ? '#9aa3ad' : '#868f99';
        b.lineWidth = 16;
        b.beginPath();
        b.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
        b.lineTo(cx + Math.cos(a + 0.25) * 220, cy + Math.sin(a + 0.25) * 220);
        b.stroke();
      }
      b.fillStyle = '#444b53';
      b.beginPath();
      b.arc(cx, cy, 34, 0, Math.PI * 2);
      b.fill();
    } else {
      for (let x = 0; x < W; x += 90) {
        b.strokeStyle = '#42474d';
        b.lineWidth = 2;
        b.beginPath();
        b.moveTo(x, 0);
        b.lineTo(x, H);
        b.stroke();
        for (let y = 8; y < H; y += 16) {
          b.fillStyle = '#7a8088';
          b.beginPath();
          b.arc(x + 6, y, 2, 0, Math.PI * 2);
          b.fill();
        }
      }
      // lines and fittings
      for (let i = 0; i < 4; i++) {
        b.strokeStyle = ['#8c6d3a', '#3a5a8c', '#6d6d6d', '#8c3a3a'][i];
        b.lineWidth = 6;
        b.beginPath();
        const y = 40 + i * 55 + rnd(-8, 8);
        b.moveTo(0, y);
        b.bezierCurveTo(W * 0.3, y + rnd(-30, 30), W * 0.6, y + rnd(-30, 30), W, y);
        b.stroke();
      }
    }
    // the defect
    b.save();
    b.translate(tx, ty);
    if (step.scene === 'leak') {
      const grd = b.createLinearGradient(0, 0, 0, 60);
      grd.addColorStop(0, '#c23a5ad0');
      grd.addColorStop(1, '#c23a5a00');
      b.fillStyle = grd;
      b.fillRect(-5, 0, 10, 60);
      b.fillStyle = '#e8506f';
      b.beginPath();
      b.arc(0, 62, 4, 0, Math.PI * 2);
      b.fill();
      b.fillStyle = '#b0b6bd';
      b.fillRect(-9, -6, 18, 10);
    } else if (step.scene === 'nick') {
      b.fillStyle = '#2d3238';
      b.beginPath();
      b.moveTo(-6, -2);
      b.lineTo(0, 8);
      b.lineTo(6, -2);
      b.fill();
    } else if (step.scene === 'crack') {
      b.strokeStyle = '#1a1c1f';
      b.lineWidth = 1.5;
      b.beginPath();
      b.moveTo(-14, -3);
      b.lineTo(-4, 2);
      b.lineTo(3, -2);
      b.lineTo(14, 4);
      b.stroke();
    } else if (step.scene === 'chafe') {
      b.fillStyle = '#c9a77a';
      b.beginPath();
      b.ellipse(0, 0, 14, 6, 0.3, 0, Math.PI * 2);
      b.fill();
    } else {
      b.fillStyle = '#c0392b';
      b.fillRect(-18, -3, 36, 6);
      b.fillRect(14, -7, 8, 14);
    }
    b.restore();
    let mx = -100, my = -100;
    const draw = () => {
      if (!play.isConnected) return;
      g.drawImage(base, 0, 0);
      // darkness, with the torch's pool of light
      g.save();
      const grd = g.createRadialGradient(mx, my, 10, mx, my, 70);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.94)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.restore();
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width) * W;
      my = ((e.clientY - r.top) / r.height) * H;
    });
    let found = false;
    cv.addEventListener('click', () => {
      if (found) return;
      if (Math.hypot(mx - tx, my - ty - (step.scene === 'leak' ? 25 : 0)) < 34) {
        found = true;
        right(`Found ${step.what}.`);
        next(900);
      } else wrong('Nothing there. Keep the torch moving.');
    });
  }

  private stepChoose(step: Extract<Step, { k: 'choose' }>, play: HTMLElement, wrong: (t: string) => void, right: (t: string) => void, next: (delay?: number) => void): void {
    const d = el('div', 'cc-data', play);
    el('b', '', d, step.data[0]);
    for (const line of step.data.slice(1)) el('div', '', d, line);
    const o = el('div', 'cc-opts', play);
    step.options.forEach((t, i) => {
      const b = el('button', 'cc-b', o, t) as HTMLButtonElement;
      b.addEventListener('click', () => {
        if (i === step.correct) {
          right(step.why);
          next(1400);
        } else {
          b.disabled = true;
          wrong(`No: ${step.why}`);
        }
      });
    });
  }

  private stepMeasure(step: Extract<Step, { k: 'measure' }>, play: HTMLElement, wrong: (t: string) => void, right: (t: string) => void, next: (delay?: number) => void): void {
    const ok = step.value >= step.lo && step.value <= step.hi;
    const gg = el('div', 'cc-gauges', play);
    const g = el('div', 'cc-g', gg);
    g.innerHTML = `${step.gauge}<b>${step.value} ${step.unit}</b>`;
    const lim = el('div', 'cc-g', gg);
    lim.innerHTML = `LIMIT<b>${step.hi >= 999 ? `≥ ${step.lo}` : step.lo <= -99 ? `≤ ${step.hi}` : `${step.lo} – ${step.hi}`} ${step.unit}</b>`;
    const row = el('div', 'cc-row', play);
    const a = el('button', 'cc-b', row, 'WITHIN LIMITS') as HTMLButtonElement;
    const b = el('button', 'cc-b', row, 'OUT OF LIMITS') as HTMLButtonElement;
    const answer = (sayOk: boolean) => {
      if (sayOk === ok) {
        right(ok ? step.ok : step.bad);
        next(1500);
      } else wrong(`Look again: ${step.value} ${step.unit} is ${ok ? 'within' : 'outside'} the limit.`);
    };
    a.addEventListener('click', () => answer(true));
    b.addEventListener('click', () => answer(false));
  }

  private stepWait(step: Extract<Step, { k: 'wait' }>, play: HTMLElement, right: (t: string) => void, next: (delay?: number) => void): void {
    const bar = el('div', 'cc-xp', play);
    bar.style.width = '100%';
    bar.style.height = '10px';
    const fill = el('i', '', bar);
    const row = el('div', 'cc-row', play);
    const ff = el('button', 'cc-b', row, 'FAST FORWARD ⏩') as HTMLButtonElement;
    let t = 0;
    let k = 1;
    ff.addEventListener('click', () => (k = 6));
    let last = performance.now();
    const tick = () => {
      if (!play.isConnected) return;
      const now = performance.now();
      t += ((now - last) / 1000) * k;
      last = now;
      fill.style.width = `${Math.min(100, (t / step.secs) * 100)}%`;
      if (t >= step.secs) {
        right('Done.');
        next(500);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- closing out

  /** the tool kit is counted before anything runs: a tool missing is in the jet somewhere */
  private toolCheck(): void {
    // (somewhere in a busy shift, a tool goes astray now and then)
    const totalSteps = this.jobs.reduce((s, j) => s + j.job.steps.length, 0);
    if (!this.toolLost && Math.random() < Math.min(0.45, totalSteps * 0.025)) {
      this.toolLost = true;
      this.toolsOut = TOOLS - 1;
    }
    this.drawTools();
    const c = this.card;
    clearEl(c);
    el('div', 'cc-k', c, 'TOOL CONTROL');
    el('div', 'cc-t', c, `KIT COUNT: ${this.toolsOut} OF ${TOOLS}`);
    const msg = el('div', 'cc-msg', c);
    if (!this.toolLost) {
      el('div', 'cc-x', c, 'Every tool is back in its shadow on the board.');
      const row = el('div', 'cc-row', c);
      const b = el('button', 'cc-b gold', row, this.needsRun && !this.ran ? 'ENGINE RUN' : 'SIGN THE JET OFF') as HTMLButtonElement;
      b.addEventListener('click', () => (this.needsRun && !this.ran ? this.engineRun() : this.signOff()));
      return;
    }
    el('div', 'cc-x', c, 'One shadow on the board is empty: a 3/8 in. ratchet. Somewhere you worked today. Nothing runs until it is found.');
    const row = el('div', 'cc-row', c);
    const find = el('button', 'cc-b gold', row, 'FIND THE TOOL') as HTMLButtonElement;
    const risk = el('button', 'cc-b red', row, this.needsRun ? 'RUN THE ENGINES ANYWAY' : 'SIGN IT OFF ANYWAY') as HTMLButtonElement;
    find.addEventListener('click', () => {
      clearEl(c);
      el('div', 'cc-k', c, 'TOOL CONTROL');
      el('div', 'cc-t', c, 'FIND THE MISSING RATCHET');
      el('div', 'cc-x', c, 'Torch the intake and the bays.');
      const play = el('div', 'cc-play', c);
      const m2 = el('div', 'cc-msg', c);
      this.hangar.work(this.hangar.jetPoint(SPECS[this.jet].span * 0.09, SPECS[this.jet].gear.height + 0.25, -SPECS[this.jet].length * 0.16), 2.6, new THREE.Vector3(0.3, 0.1, -0.95));
      this.stepSearch(
        { k: 'search', text: '', scene: 'tool', what: 'the ratchet, in the intake' },
        play,
        (t) => ((m2.textContent = t), (m2.className = 'cc-msg bad')),
        (t) => ((m2.textContent = t), (m2.className = 'cc-msg good')),
        () => {
          this.toolLost = false;
          this.toolsOut = TOOLS;
          this.hangar.work(null);
          this.toolCheck();
        },
      );
    });
    risk.addEventListener('click', () => {
      // foreign object damage: the engine eats the ratchet
      this.log.fod++;
      saveCc(this.log);
      msg.className = 'cc-msg bad';
      msg.textContent = 'The engine ingested the ratchet. Foreign object damage: the engine is scrapped, the jet is grounded, and you are in the commander\'s office.';
      audio.beep(140, 0.5, 0.2, 'sawtooth');
      risk.disabled = find.disabled = true;
      setTimeout(() => this.signOff(true), 3200);
    });
    void msg;
  }

  /** the engine run: up through the power settings, watching the gauges */
  private engineRun(): void {
    const c = this.card;
    clearEl(c);
    const s = SPECS[this.jet];
    el('div', 'cc-k', c, 'ENGINE RUN · OPS CHECK');
    el('div', 'cc-t', c, `${s.shortName.toUpperCase()} ON THE RUN PAD`);
    el('div', 'cc-x', c, 'Bring the throttle up a step at a time, letting each setting stabilise. Don\'t let the EGT spike past the red line. Then back to idle and shut down.');
    this.hangar.work(this.hangar.jetPoint(0, s.gear.height + 0.5, s.length * 0.55), s.length * 0.9, new THREE.Vector3(0.75, 0.25, 0.6));
    const gg = el('div', 'cc-gauges', c);
    const gR = el('div', 'cc-g', gg), gE = el('div', 'cc-g', gg), gO = el('div', 'cc-g', gg);
    const row = el('div', 'cc-row', c);
    const steps = ['IDLE', '70 %', '85 %', 'MIL', 'IDLE', 'SHUTDOWN'];
    const target = [0.68, 0.8, 0.9, 1.0, 0.68, 0];
    let st = 0;
    let rpm = 0.0, egt = 150, held = 0;
    const msg = el('div', 'cc-msg', c);
    const btn = el('button', 'cc-b gold', row, `THROTTLE TO ${steps[0]}`) as HTMLButtonElement;
    let mistakes = 0;
    btn.addEventListener('click', () => {
      if (held < 2.2 && st > 0) {
        mistakes++;
        msg.className = 'cc-msg bad';
        msg.textContent = 'Too quick: let it stabilise first (EGT spikes).';
        egt += 120;
        return;
      }
      st++;
      held = 0;
      btn.textContent = st < steps.length ? `THROTTLE TO ${steps[st]}` : 'DONE';
      if (st >= steps.length) btn.disabled = true;
    });
    let last = performance.now();
    const tick = () => {
      if (!c.isConnected) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const want = st === 0 ? 0.68 : target[Math.min(st, target.length) - 1] ?? 0;
      rpm += (want - rpm) * (1 - Math.exp(-dt * 1.1));
      const egtWant = rpm < 0.05 ? 120 : 380 + rpm * 420;
      egt += (egtWant - egt) * (1 - Math.exp(-dt * 0.8));
      if (Math.abs(rpm - want) < 0.02) held += dt;
      const oilP = rpm < 0.05 ? 0 : 25 + rpm * 35;
      gR.innerHTML = `RPM<b>${(rpm * 100).toFixed(0)}%</b>`;
      gE.className = 'cc-g' + (egt > 905 ? ' hot' : '');
      gE.innerHTML = `EGT<b>${egt.toFixed(0)}°C</b>`;
      gO.innerHTML = `OIL PRESS<b>${oilP.toFixed(0)} PSI</b>`;
      if (st >= steps.length && rpm < 0.03) {
        this.ran = true;
        if (this.jobs[0]) this.jobs[0].mistakes += mistakes;
        msg.className = 'cc-msg good';
        msg.textContent = egt > 905 ? 'Run complete (with an EGT spike written up).' : 'Good run: all indications normal, no leaks.';
        setTimeout(() => this.signOff(), 1500);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private signOff(fod = false): void {
    this.hangar.work(null);
    const mistakes = this.jobs.reduce((s, j) => s + j.mistakes, 0);
    const stars = fod ? 0 : mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    const par = this.jobs.reduce((s, j) => s + j.job.par, 0);
    const xp = fod ? 0 : Math.round(par * 6 * (0.5 + stars / 6));
    const before = ccRank(this.log.xp);
    if (!fod) {
      this.log.xp += xp;
      this.log.jets++;
      this.log.jobs += this.jobs.length;
      this.log.clean += this.jobs.filter((j) => j.mistakes === 0).length;
    }
    saveCc(this.log);
    const after = ccRank(this.log.xp);
    const mins = Math.round((performance.now() - this.shiftStart) / 60000);
    const box = el('div', 'cc-sum', this.overlay);
    el('h2', '', box, fod ? 'GROUNDED: FOREIGN OBJECT DAMAGE' : 'JET SIGNED OFF · CODE 1');
    el('div', 'cc-k', box, `${SPECS[this.jet].name.toUpperCase()} · S/N ${this.tail}`);
    el('div', 'cc-stars', box).innerHTML = '★'.repeat(stars) + `<i>${'★'.repeat(3 - stars)}</i>`;
    el('div', 'cc-x', box, fod ? 'A tool left in the jet destroyed an engine. Count the kit, every time.' : `${this.jobs.length} write-ups corrected in ${mins || 1} min · ${mistakes} mistake${mistakes === 1 ? '' : 's'} · +${xp} XP`);
    if (after.i > before.i) el('div', 'cc-msg good', box, `PROMOTED: ${after.rank.name} · ${after.rank.perk}`);
    el('div', 'cc-k', box, 'NEXT JET ON THE LINE');
    const grid = el('div', 'cc-pick', box);
    for (const t of AIRCRAFT_TYPES) {
      const b = el('button', 'cc-b', grid, SPECS[t].shortName.toUpperCase()) as HTMLButtonElement;
      b.addEventListener('click', () => {
        box.remove();
        this.newJet(t);
      });
    }
    const row = el('div', 'cc-row', box);
    const any = el('button', 'cc-b gold', row, 'WHATEVER LANDS NEXT') as HTMLButtonElement;
    any.addEventListener('click', () => {
      box.remove();
      this.newJet(AIRCRAFT_TYPES[Math.floor(Math.random() * AIRCRAFT_TYPES.length)]);
    });
    const done = el('button', 'cc-b', row, 'END OF SHIFT') as HTMLButtonElement;
    done.addEventListener('click', () => {
      box.remove();
      this.close();
    });
    this.drawTop();
  }

  private chooseJet(): void {
    const box = el('div', 'cc-sum', this.overlay);
    el('h2', '', box, 'WHICH JET?');
    el('div', 'cc-x', box, 'Its forms come with it: new write-ups for every jet.');
    const grid = el('div', 'cc-pick', box);
    for (const t of AIRCRAFT_TYPES) {
      const b = el('button', 'cc-b', grid, SPECS[t].shortName.toUpperCase()) as HTMLButtonElement;
      b.addEventListener('click', () => {
        box.remove();
        this.newJet(t);
      });
    }
    const row = el('div', 'cc-row', box);
    const x = el('button', 'cc-b', row, 'CANCEL') as HTMLButtonElement;
    x.addEventListener('click', () => box.remove());
  }
}
