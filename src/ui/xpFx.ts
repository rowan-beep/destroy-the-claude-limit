// In-flight progression effects: XP / money toasts as you earn them, a slim
// XP bar with your level above the weapon bar, and the full-screen LEVEL UP
// burst (rings, rays, sparks, the new level slamming in, the cash bonus).

import { el } from './dom';
import { levelInfo, rankFor, fmtMoney, groupAwards, Award, LevelUp, ProgressData, MissionSummary } from '../game/progression';
import { audio } from '../audio/audio';

interface Toast {
  root: HTMLElement;
  label: HTMLElement;
  xp: HTMLElement;
  money: HTMLElement;
  key: string;
  count: number;
  totalXp: number;
  totalMoney: number;
  born: number;
  timer: number;
}

export class XpFx {
  readonly root: HTMLDivElement;
  private toasts: HTMLElement;
  private live: Toast[] = [];
  private bar: HTMLElement;
  private fill: HTMLElement;
  private gain: HTMLElement;
  private lvl: HTMLElement;
  private txt: HTMLElement;
  private levelQueue: LevelUp[] = [];
  private levelBusy = false;
  private shownLevel = 1;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'xpfx hidden', parent);
    this.toasts = el('div', 'xp-toasts', this.root);
    this.bar = el('div', 'xp-bar', this.root);
    this.lvl = el('div', 'xp-lvl', this.bar, 'LV 1');
    const track = el('div', 'xp-track', this.bar);
    this.gain = el('div', 'xp-gain', track);
    this.fill = el('div', 'xp-fill', track);
    this.txt = el('div', 'xp-txt', this.bar, '');
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  /** Snap the bar to the saved progress (mission start). */
  reset(p: ProgressData): void {
    for (const t of this.live) t.root.remove();
    this.live = [];
    this.levelQueue = [];
    const li = levelInfo(p.xp);
    this.shownLevel = li.level;
    this.setBar(p.xp, false);
  }

  private setBar(xp: number, animate: boolean): void {
    const li = levelInfo(xp);
    // a level-up empties the bar and refills it (the burst covers the jump)
    this.fill.style.transition = animate && li.level === this.shownLevel ? '' : 'none';
    this.gain.style.transition = this.fill.style.transition;
    this.fill.style.width = `${(li.frac * 100).toFixed(2)}%`;
    if (animate) {
      this.gain.style.width = `${(li.frac * 100).toFixed(2)}%`;
    } else {
      this.gain.style.width = this.fill.style.width;
    }
    this.lvl.textContent = `LV ${li.level}`;
    this.txt.textContent = li.need ? `${Math.floor(li.into).toLocaleString('en-US')} / ${li.need.toLocaleString('en-US')} XP` : 'MAX LEVEL';
    this.shownLevel = li.level;
    void this.fill.offsetWidth;
    this.fill.style.transition = '';
    this.gain.style.transition = '';
  }

  /** An award came in: toast it and grow the bar. */
  award(a: Award, p: ProgressData): void {
    if (a.kind !== 'level') this.toast(a);
    this.setBar(p.xp, true);
    this.bar.classList.remove('pulse');
    void this.bar.offsetWidth;
    this.bar.classList.add('pulse');
    if (a.kind === 'kill') audio.xpKill();
    else if (a.xp >= 25) audio.xpTick();
  }

  private toast(a: Award): void {
    const now = performance.now();
    // merge repeats of the same thing arriving together
    const same = this.live.find((t) => t.key === a.label && now - t.born < 2500);
    if (same) {
      same.count++;
      same.totalXp += a.xp;
      same.totalMoney += a.money;
      same.label.textContent = `${a.label} ×${same.count}`;
      same.xp.textContent = `+${same.totalXp} XP`;
      same.money.textContent = same.totalMoney ? `+${fmtMoney(same.totalMoney)}` : '';
      same.root.classList.remove('bump');
      void same.root.offsetWidth;
      same.root.classList.add('bump');
      clearTimeout(same.timer);
      same.timer = window.setTimeout(() => this.drop(same), 3200);
      return;
    }
    const root = el('div', `xp-toast k-${a.kind}`, this.toasts);
    const label = el('div', 'xt-label', root, a.label);
    const row = el('div', 'xt-row', root);
    const xp = el('span', 'xt-xp', row, a.xp ? `+${a.xp} XP` : '');
    const money = el('span', 'xt-money', row, a.money ? `+${fmtMoney(a.money)}` : '');
    el('div', 'xt-shine', root);
    const t: Toast = { root, label, xp, money, key: a.label, count: 1, totalXp: a.xp, totalMoney: a.money, born: now, timer: 0 };
    t.timer = window.setTimeout(() => this.drop(t), 3200);
    this.live.push(t);
    // keep the stack short
    while (this.live.length > 6) this.drop(this.live[0]);
  }

  private drop(t: Toast): void {
    const i = this.live.indexOf(t);
    if (i < 0) return;
    this.live.splice(i, 1);
    t.root.classList.add('out');
    window.setTimeout(() => t.root.remove(), 450);
  }

  /** Big level-up celebration (queued if several arrive at once). */
  levelUp(l: LevelUp): void {
    this.levelQueue.push(l);
    if (!this.levelBusy) this.nextLevel();
  }

  private nextLevel(): void {
    const l = this.levelQueue.shift();
    if (!l) {
      this.levelBusy = false;
      return;
    }
    this.levelBusy = true;
    audio.levelUp();
    const o = el('div', 'lvlup', this.root);
    el('div', 'lu-flash', o);
    el('div', 'lu-rays', o);
    el('div', 'lu-ring r1', o);
    el('div', 'lu-ring r2', o);
    el('div', 'lu-ring r3', o);
    const sparks = el('div', 'lu-sparks', o);
    for (let i = 0; i < 40; i++) {
      const s = el('i', '', sparks);
      const a = (i / 40) * Math.PI * 2 + Math.random() * 0.2;
      const d = 180 + Math.random() * 260;
      s.style.setProperty('--x', `${Math.cos(a) * d}px`);
      s.style.setProperty('--y', `${Math.sin(a) * d}px`);
      s.style.setProperty('--dl', `${(Math.random() * 0.25).toFixed(2)}s`);
      s.style.setProperty('--sz', `${3 + Math.random() * 5}px`);
    }
    const card = el('div', 'lu-card', o);
    const title = el('div', 'lu-title', card);
    'LEVEL UP'.split('').forEach((ch, i) => {
      const s = el('span', '', title, ch === ' ' ? ' ' : ch);
      s.style.animationDelay = `${0.15 + i * 0.05}s`;
    });
    const badge = el('div', 'lu-badge', card);
    el('div', 'lu-hex', badge);
    el('div', 'lu-num', badge, String(l.level));
    el('div', 'lu-rank' + (l.newRank ? ' new' : ''), card, l.newRank ? `PROMOTED: ${l.rank}` : l.rank);
    el('div', 'lu-bonus', card, `+${fmtMoney(l.bonus)} LEVEL BONUS`);
    window.setTimeout(() => o.classList.add('out'), 3300);
    window.setTimeout(() => {
      o.remove();
      this.nextLevel();
    }, 3900);
  }
}

/** Main-menu pilot card: badge, rank, XP bar and money, counting up to the saved values. */
export class PilotCard {
  readonly root: HTMLDivElement;
  private badge: HTMLElement;
  private rank: HTMLElement;
  private fill: HTMLElement;
  private xpTxt: HTMLElement;
  private money: HTMLElement;
  private raf = 0;

  constructor(parent: HTMLElement, before?: HTMLElement | null) {
    this.root = el('div', 'pilot-card', parent);
    if (before) parent.insertBefore(this.root, before);
    const b = el('div', 'pc-badge', this.root);
    el('div', 'pc-hex', b);
    this.badge = el('div', 'pc-num', b, '1');
    const mid = el('div', 'pc-mid', this.root);
    this.rank = el('div', 'pc-rank', mid, 'CADET');
    const track = el('div', 'pc-track', mid);
    this.fill = el('div', 'pc-fill', track);
    this.xpTxt = el('div', 'pc-xp', mid, '');
    this.money = el('div', 'pc-money', this.root, '$0');
  }

  private draw(xp: number, money: number): void {
    const li = levelInfo(xp);
    this.badge.textContent = String(li.level);
    this.rank.textContent = rankFor(li.level);
    this.fill.style.width = `${(li.frac * 100).toFixed(2)}%`;
    this.xpTxt.textContent = li.need ? `${Math.floor(li.into).toLocaleString('en-US')} / ${li.need.toLocaleString('en-US')} XP TO LEVEL ${li.level + 1}` : 'MAX LEVEL';
    this.money.textContent = fmtMoney(money);
  }

  /** Show the progress, counting up from what was last shown. */
  update(p: ProgressData, onShown: () => void): void {
    cancelAnimationFrame(this.raf);
    const x0 = Math.min(p.shownXp, p.xp), m0 = Math.min(p.shownMoney, p.money);
    const x1 = p.xp, m1 = p.money;
    if (x0 === x1 && m0 === m1) {
      this.draw(x1, m1);
      return;
    }
    const lv0 = levelInfo(x0).level;
    const dur = Math.min(3200, 900 + (x1 - x0) * 0.6);
    const t0 = performance.now();
    this.root.classList.add('gaining');
    let lastLevel = lv0;
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - u, 3);
      const x = x0 + (x1 - x0) * e;
      this.draw(x, m0 + (m1 - m0) * e);
      const lv = levelInfo(x).level;
      if (lv !== lastLevel) {
        lastLevel = lv;
        this.root.classList.remove('levelled');
        void this.root.offsetWidth;
        this.root.classList.add('levelled');
        audio.xpKill();
      }
      if (u < 1) this.raf = requestAnimationFrame(step);
      else {
        this.root.classList.remove('gaining');
        onShown();
      }
    };
    this.raf = requestAnimationFrame(step);
  }
}

/** Debrief block: the mission's awards, totals counting up and the XP bar filling through any level-ups. */
export function renderXpDebrief(parent: HTMLElement, s: MissionSummary): void {
  const box = el('div', 'xp-debrief', parent);
  const head = el('div', 'xd-head', box);
  el('div', 'xd-title', head, 'PILOT EXPERIENCE');
  const total = el('div', 'xd-total', head, '+0 XP');
  const money = el('div', 'xd-money', head, '+$0');
  const list = el('div', 'xd-list', box);
  const groups = groupAwards(s.awards);
  if (!groups.length) {
    const e = el('div', 'xd-l', list, 'No XP this sortie.');
    e.style.gridColumn = '1 / -1';
  }
  groups.forEach((g, i) => {
    const d = `${0.15 + i * 0.07}s`;
    const l = el('div', 'xd-l', list, g.count > 1 ? `${g.label} ×${g.count}` : g.label);
    const x = el('div', 'xd-x', list, g.xp ? `+${g.xp}` : '');
    const m = el('div', 'xd-m', list, g.money ? `+${fmtMoney(g.money)}` : '');
    for (const c of [l, x, m]) c.style.animationDelay = d;
  });
  const bar = el('div', 'xd-bar', box);
  const lvl = el('div', 'xd-lvl', bar, `LV ${s.levelStart}`);
  const track = el('div', 'xd-track', bar);
  const fill = el('div', 'xd-fill', track);
  const rank = el('div', 'xd-rank', bar, rankFor(s.levelStart));
  const dXp = s.xpEnd - s.xpStart;
  const dMoney = s.moneyEnd - s.moneyStart;
  const start = performance.now() + 400;
  const dur = Math.min(3500, 1000 + dXp * 0.5);
  let shownLevel = s.levelStart;
  const frame = () => {
    if (!box.isConnected) return;
    const u = Math.max(0, Math.min(1, (performance.now() - start) / dur));
    const e = 1 - Math.pow(1 - u, 3);
    const xp = s.xpStart + dXp * e;
    total.textContent = `+${Math.round(dXp * e).toLocaleString('en-US')} XP`;
    money.textContent = `+${fmtMoney(dMoney * e)}`;
    const li = levelInfo(xp);
    fill.style.width = `${(li.frac * 100).toFixed(2)}%`;
    if (li.level !== shownLevel) {
      shownLevel = li.level;
      lvl.textContent = `LV ${li.level}`;
      rank.textContent = rankFor(li.level);
      lvl.classList.remove('pop');
      void lvl.offsetWidth;
      lvl.classList.add('pop');
      audio.xpKill();
    }
    if (u < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
