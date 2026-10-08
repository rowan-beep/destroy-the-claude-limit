// Pilot logbook screen: career totals, per-aircraft record, duel record by
// difficulty, waves, personal records, kills by weapon and victim, missile
// defences, decorations and the most recent sorties.

import { el, clearEl, button } from '../dom';
import { LogbookData, MEDALS, emptyLogbook, fmtHours, saveLogbook } from '../../game/logbook';
import { AIRCRAFT_TYPES, SPECS } from '../../aircraft/specs';
import { DIFFICULTIES } from '../../ai/skill';
import { fmtTime } from '../../core/math';

export class LogbookModal {
  readonly root: HTMLDivElement;
  private body: HTMLElement;
  private book: LogbookData | null = null;
  private resetArmed = false;

  constructor(
    parent: HTMLElement,
    private onReset: (fresh: LogbookData) => void,
  ) {
    this.root = el('div', 'modal-back hidden', parent);
    const m = el('div', 'modal logbook', this.root);
    const head = el('div', 'modal-head', m);
    el('h2', '', head, 'PILOT LOGBOOK');
    button('CLOSE', '', head, () => this.show(null));
    this.body = el('div', 'modal-body', m);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.show(null);
    });
  }

  show(book: LogbookData | null): void {
    this.root.classList.toggle('hidden', !book);
    this.book = book;
    this.resetArmed = false;
    if (book) this.render();
  }

  private render(): void {
    const b = this.book!;
    clearEl(this.body);
    const t = b.totals;
    const kd = t.losses > 0 ? (t.kills / t.losses).toFixed(2) : t.kills > 0 ? `${t.kills}.00` : '—';
    const acc = t.shots > 0 ? `${Math.round((t.kills / t.shots) * 100)} %` : '—';

    // headline tiles
    const tiles = el('div', 'lb-tiles', this.body);
    const tile = (k: string, v: string) => {
      const d = el('div', 'lb-tile', tiles);
      el('b', '', d, v);
      el('small', '', d, k);
    };
    tile('SORTIES', String(t.sorties));
    tile('FLIGHT HOURS', fmtHours(t.flightSec));
    tile('AERIAL VICTORIES', String(t.kills));
    tile('KILL / LOSS', kd);
    tile('BEST WAVE', b.bestWave ? `${b.bestWave} / 10` : '—');
    tile('DECORATIONS', `${b.medals.length} / ${MEDALS.length}`);

    const grid = el('div', 'lb-grid', this.body);

    // per aircraft: a row for each jet (a column each no longer fits), across the whole width
    const jets = el('div', 'card lb-wide', grid);
    el('h3', '', jets, 'BY AIRCRAFT');
    const jt = el('table', 'specs lb-jets', el('div', 'lb-scroll', jets));
    const cols: [string, (a: (typeof AIRCRAFT_TYPES)[number]) => string][] = [
      ['SORTIES', (a) => String(b.byJet[a].sorties)],
      ['HOURS', (a) => fmtHours(b.byJet[a].flightSec)],
      ['KILLS', (a) => String(b.byJet[a].kills)],
      ['LOSSES', (a) => String(b.byJet[a].losses)],
      ['EJECTIONS', (a) => String(b.byJet[a].ejections)],
      ['LANDINGS', (a) => `${b.byJet[a].landings}${b.byJet[a].greasers ? ` (${b.byJet[a].greasers}★)` : ''}`],
      ['BEST WAVE', (a) => (b.bestWaveByJet[a] ? String(b.bestWaveByJet[a]) : '—')],
      ['SHOT DOWN', (a) => String(b.killsOf[a] ?? 0)],
    ];
    const hr = el('tr', '', jt);
    el('td', '', hr, '');
    for (const [label] of cols) el('td', '', hr, label);
    for (const a of AIRCRAFT_TYPES) {
      const tr = el('tr', '', jt);
      el('td', '', tr, SPECS[a].shortName.toUpperCase());
      for (const [, f] of cols) el('td', '', tr, f(a));
    }

    // duel / records
    const dr = el('div', 'card', grid);
    el('h3', '', dr, '1v1 DUEL RECORD');
    const dt = el('table', 'specs', dr);
    for (const d of DIFFICULTIES) {
      const r = b.duel[d];
      const tr = el('tr', '', dt);
      el('td', '', tr, d);
      el('td', '', tr, `${r.wins} W · ${r.losses} L${r.draws ? ` · ${r.draws} D` : ''}`);
    }
    el('h3', '', dr, '5v5 TEAM BATTLE');
    const teamTbl = el('table', 'specs', dr);
    for (const [k, v] of [
      ['MATCHES', `${b.team.wins} W · ${b.team.losses} L`],
      ['ROUNDS', `${b.team.roundsWon} W · ${b.team.roundsLost} L`],
    ]) {
      const tr = el('tr', '', teamTbl);
      el('td', '', tr, k);
      el('td', '', tr, v);
    }
    el('h3', '', dr, 'FREE-FOR-ALL');
    const ffaTbl = el('table', 'specs', dr);
    for (const [k, v] of [
      ['MATCHES', `${b.ffa.matches} · ${b.ffa.wins} WON · ${b.ffa.podiums} TOP 3`],
      ['BEST PLACING', b.ffa.bestPlace ? `#${b.ffa.bestPlace} OF 12` : '—'],
    ]) {
      const tr = el('tr', '', ffaTbl);
      el('td', '', tr, k);
      el('td', '', tr, v);
    }
    el('h3', '', dr, 'PERSONAL RECORDS');
    const rt = el('table', 'specs', dr);
    const rec = b.records;
    const rrow = (k: string, v: string) => {
      const tr = el('tr', '', rt);
      el('td', '', tr, k);
      el('td', '', tr, v);
    };
    rrow('PEAK G', rec.maxG ? `${rec.maxG.toFixed(1)} G` : '—');
    rrow('TOP SPEED', rec.maxMach ? `MACH ${rec.maxMach.toFixed(2)}` : '—');
    rrow('ALTITUDE', rec.maxAltFt ? `${Math.round(rec.maxAltFt).toLocaleString('en-US')} FT` : '—');
    rrow('LONGEST KILL', rec.longestKillNm ? `${rec.longestKillNm.toFixed(1)} NM` : '—');
    rrow('CLOSEST GUN KILL', rec.closestGunKillM ? `${Math.round(rec.closestGunKillM)} M` : '—');
    rrow('MISSILE ACCURACY', acc);
    rrow('WAVES CLEARED', String(b.wavesCleared));

    // weapons & defences
    const wd = el('div', 'card', grid);
    el('h3', '', wd, 'KILLS BY WEAPON');
    const wt = el('table', 'specs', wd);
    const byW = Object.entries(b.killsBy).sort((x, y) => y[1] - x[1]);
    if (byW.length === 0) el('div', 'note', wd, 'No kills yet.');
    for (const [w, n] of byW) {
      const tr = el('tr', '', wt);
      el('td', '', tr, w);
      el('td', '', tr, String(n));
    }
    el('h3', '', wd, 'MISSILES DEFEATED');
    const md = el('table', 'specs', wd);
    const byD = Object.entries(b.missilesDefeated).sort((x, y) => y[1] - x[1]);
    if (byD.length === 0) el('div', 'note', wd, 'None yet — beam, notch, flare, chaff, or put a mountain in the way.');
    for (const [w, n] of byD) {
      const tr = el('tr', '', md);
      el('td', '', tr, w);
      el('td', '', tr, String(n));
    }

    // decorations
    const mc = el('div', 'card', this.body);
    el('h3', '', mc, 'DECORATIONS');
    const mg = el('div', 'medal-grid', mc);
    for (const m of MEDALS) {
      const got = b.medals.includes(m.id);
      const d = el('div', 'medal' + (got ? ' got' : ''), mg);
      el('b', '', d, m.name);
      el('small', '', d, m.desc);
    }

    // recent sorties
    const rc = el('div', 'card', this.body);
    el('h3', '', rc, 'RECENT SORTIES');
    if (b.recent.length === 0) el('div', 'note', rc, 'Fly a mission to start your logbook.');
    const tt = el('table', 'specs recent', rc);
    for (const s of b.recent.slice(0, 12)) {
      const tr = el('tr', '', tt);
      el('td', '', tr, s.date);
      el('td', '', tr, `${s.mode.toUpperCase()}${s.detail ? ' · ' + s.detail : ''}`);
      el('td', '', tr, SPECS[s.jet]?.shortName.toUpperCase() ?? s.jet);
      el('td', '', tr, s.result);
      el('td', '', tr, `${s.kills} K / ${s.shots} S`);
      el('td', '', tr, fmtTime(s.durationSec));
    }

    const foot = el('div', 'lb-foot', this.body);
    const reset = button(this.resetArmed ? 'CONFIRM: ERASE EVERYTHING' : 'RESET LOGBOOK', '', foot, () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        reset.textContent = 'CONFIRM: ERASE EVERYTHING';
        reset.classList.add('danger');
        return;
      }
      const fresh = emptyLogbook();
      saveLogbook(fresh);
      this.onReset(fresh);
      this.book = fresh;
      this.resetArmed = false;
      this.render();
    });
  }
}
