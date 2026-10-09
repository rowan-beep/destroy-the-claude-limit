// After a ranked match: what it did to your rank. A banner (placement n of 5, RANK
// REVEALED, PROMOTED, DEMOTED, SHIELD HELD), the emblem, the RP counting from where you
// were to where you are and the bar filling, and the change split three ways: the result
// (and why it was worth that), the kills, the shield.

import { el } from '../dom';
import { rankOf, DIV_RP, PLACEMENTS, CHAMPION_RP, type MatchOutcome } from '../../game/ranked';
import { rankEmblemSvg, rankColor } from '../rankEmblem';

const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

export function renderRankedResult(parent: HTMLElement, o: MatchOutcome): void {
  if (o.uncounted || !o.record) {
    el('div', 'rk-res-note', parent, 'Unranked: an online match counts for rank with 4 or more pilots.');
    return;
  }
  const m = o.record;
  const after = o.after;
  const box = el('div', 'rk-res' + (o.revealed ? ' reveal' : o.promoted ? ' up' : o.demoted ? ' down' : ''), parent);
  box.style.setProperty('--rk', rankColor(after));
  const banner = o.revealed
    ? 'RANK REVEALED'
    : m.placement
      ? `PLACEMENT ${m.placement} OF ${PLACEMENTS}`
      : o.promoted
        ? after && o.before && after.tierIndex > o.before.tierIndex
          ? `NEW TIER · ${after.tier}`
          : 'PROMOTED'
        : o.demoted
          ? 'DEMOTED'
          : m.shield
            ? 'DEMOTION SHIELD HELD'
            : m.abandon
              ? 'LEFT THE MATCH'
              : 'RANKED';
  el('div', 'rk-res-banner', box, banner);
  const row = el('div', 'rk-res-row', box);
  const em = el('div', 'rk-emblem rk-res-em', row);
  em.innerHTML = rankEmblemSvg(after, 92, { glow: after?.tier === 'CHAMPION' });
  const mid = el('div', 'rk-res-mid', row);
  el('div', 'rk-res-name', mid, after ? after.name : 'UNRANKED');
  const rpLine = el('div', 'rk-res-rp', mid, after ? `${m.rpBefore.toLocaleString()} RP` : `${o.placementsLeft} placement match${o.placementsLeft === 1 ? '' : 'es'} to go`);
  const bar = after && after.tier !== 'CHAMPION' ? el('div', 'rk-bar rk-res-bar', mid) : null;
  const fill = bar ? el('div', 'rk-fill', bar) : null;
  const into = (rp: number) => Math.max(0, Math.min(1, (rp - (after ? after.start : 0)) / DIV_RP));
  if (fill) {
    // from where you were in this division (empty if you came from another one) to where you are
    const fromSame = rankOf(m.rpBefore).index === after!.index;
    fill.style.width = `${(fromSame ? into(m.rpBefore) : o.promoted ? 0 : 1) * 100}%`;
    requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${into(m.rpAfter) * 100}%`)));
  }
  const total = el('div', 'rk-res-total' + (m.rpAfter > m.rpBefore ? ' up' : m.rpAfter < m.rpBefore ? ' down' : ''), row, after ? sign(m.rpAfter - m.rpBefore) : '');
  // count the RP up (or down)
  if (after) {
    const t0 = performance.now();
    const a = m.rpBefore;
    const b = m.rpAfter;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 1100);
      const e = 1 - Math.pow(1 - k, 3);
      rpLine.textContent = `${Math.round(a + (b - a) * e).toLocaleString()} RP${after.tier === 'CHAMPION' ? '' : ` · ${Math.round(into(a + (b - a) * e) * DIV_RP)}/${DIV_RP}`}`;
      if (k < 1 && document.body.contains(rpLine)) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  } else total.remove();
  const parts = el('div', 'rk-res-parts', box);
  const part = (k: string, v: string, cls = '') => {
    const p = el('div', 'rk-res-part ' + cls, parts);
    el('span', 'k', p, k);
    el('span', 'v', p, v);
  };
  if (m.placement) {
    part(`PLACEMENT ${m.result === 'win' ? 'WIN' : m.result === 'loss' ? 'LOSS' : 'DRAW'}`, sign(m.resultRp), m.resultRp >= 0 ? 'up' : 'down');
    if (m.killRp) part(`${m.kills} KILL${m.kills === 1 ? '' : 'S'}`, sign(m.killRp), 'up');
    part(o.revealed ? 'PLACED AT' : 'RANK', o.revealed && after ? `${after.name} · ${m.rpAfter.toLocaleString()} RP` : 'HIDDEN UNTIL THE FIFTH MATCH');
  } else {
    part(`${m.abandon ? 'LEFT THE MATCH' : m.result === 'win' ? 'WIN' : m.result === 'loss' ? 'LOSS' : 'DRAW'} · ${m.reason.toUpperCase()}`, sign(m.resultRp), m.resultRp >= 0 ? 'up' : 'down');
    if (m.killRp || m.kills) part(`${m.kills} KILL${m.kills === 1 ? '' : 'S'}${m.shield ? ' (INTO THE SHIELD)' : ''}`, sign(m.killRp), m.killRp > 0 ? 'up' : '');
    if (m.shield) part('DEMOTION SHIELD', `HELD AT ${m.rpAfter.toLocaleString()} RP`, 'shield');
    if (after && after.tier === 'CHAMPION') part('CHAMPION', m.rpAfter >= CHAMPION_RP ? 'SEE YOUR PLACE IN THE RANKED TAB' : '');
  }
}
