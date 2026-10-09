// The RANKED tab of the air menu: your rank card (emblem, RP, the division bar, the
// demotion shield, placements, this week's numbers, last week's finish and the countdown
// to Monday's reset) and, beside it, the ladder, your match history, the leaderboard and
// how it all works.

import { el, clearEl, button } from '../dom';
import {
  loadRanked, visibleRank, placing, divisionRp, rankOf, nextReset, untilText, cooldownLeft, championEligible, weekId,
  RANKS, PLACEMENTS, CHAMPION_RP, CHAMPION_MIN_MATCHES, DIV_RP, TIER_COLORS, KILL_RP, KILL_RP_CAP,
  type RankedState, type MatchRecord, type Rank,
} from '../../game/ranked';
import { rankEmblemSvg, rankColor } from '../rankEmblem';
import { loadBoard, championPlace, boardAvailable } from '../../net/rankBoard';

type RankTab = 'ladder' | 'matches' | 'board' | 'how';
let tab: RankTab = 'ladder';
let ticker = 0;

function emblem(parent: HTMLElement, rank: Rank | null, size: number, cls = '', glow = false): HTMLElement {
  const e = el('div', 'rk-emblem ' + cls, parent);
  // (built from our own numbers only: no outside text goes into the markup)
  e.innerHTML = rankEmblemSvg(rank, size, { glow });
  return e;
}

const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

/** Monday 8:00 a.m. Pacific, and the same moment in the player's own clock */
function resetText(): { left: string; local: string } {
  const t = nextReset();
  const local = new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return { left: untilText(t - Date.now()), local };
}

/** The rank card (left panel). */
export function renderRankCard(p: HTMLElement, onPlay: () => void): void {
  const s = loadRanked();
  const r = visibleRank(s);
  el('div', 'mm-h', p, 'YOUR RANK');
  const card = el('div', 'rk-card', p);
  card.style.setProperty('--rk', rankColor(r));
  const top = el('div', 'rk-top', card);
  emblem(top, r, 112, 'rk-big', r?.tier === 'CHAMPION');
  const id = el('div', 'rk-id', top);
  if (!r) {
    el('div', 'rk-name', id, 'UNRANKED');
    el('div', 'rk-sub', id, `PLACEMENT ${Math.min(s.placed + 1, PLACEMENTS)} OF ${PLACEMENTS}`);
    const dots = el('div', 'rk-dots', id);
    const wkid = weekId(s.week);
    const placements = s.history.filter((h) => h.placement > 0 && h.week === wkid).slice(0, s.placed).reverse();
    for (let i = 0; i < PLACEMENTS; i++) {
      const h = placements[i];
      el('span', 'rk-dot' + (h ? (h.result === 'win' ? ' w' : h.result === 'loss' ? ' l' : ' d') : ''), dots, h ? (h.result === 'win' ? 'W' : h.result === 'loss' ? 'L' : 'D') : '');
    }
    el('div', 'rk-note', id, 'Your rank stays hidden until the fifth placement match.');
  } else {
    el('div', 'rk-name', id, r.name);
    el('div', 'rk-rp', id, `${s.rp.toLocaleString()} RP`);
    if (r.tier === 'CHAMPION') {
      const place = el('div', 'rk-place', id, '#…');
      void championPlace(s).then((n) => {
        place.textContent = n ? `#${n} ON THIS WEEK'S LEADERBOARD` : 'LEADERBOARD OFFLINE';
      });
    } else {
      const into = divisionRp(s);
      const bar = el('div', 'rk-bar', id);
      el('div', 'rk-fill', bar).style.width = `${(into / DIV_RP) * 100}%`;
      const nextRank = RANKS[r.index + 1];
      const short = s.rp >= CHAMPION_RP && !championEligible(s);
      el(
        'div',
        'rk-barlbl',
        id,
        short ? `CHAMPION AT ${CHAMPION_MIN_MATCHES} MATCHES THIS WEEK (${s.matches}/${CHAMPION_MIN_MATCHES})` : `${into} / ${DIV_RP} RP · ${DIV_RP - into} TO ${nextRank.name}`,
      );
    }
    const atLine = r.tier !== 'CHAMPION' ? divisionRp(s) === 0 : s.rp === CHAMPION_RP;
    el('div', 'rk-shield' + (atLine ? ' spent' : ''), id, atLine ? '⛉ ON THE LINE: THE NEXT LOSS DROPS YOU' : '⛉ DEMOTION SHIELD READY');
  }

  // this week
  const wk = el('div', 'rk-stats', card);
  const stat = (v: string, k: string) => {
    const b = el('div', 'rk-stat', wk);
    el('div', 'rk-stat-v', b, v);
    el('div', 'rk-stat-k', b, k);
  };
  const games = s.wins + s.losses + s.draws;
  stat(String(s.matches), 'MATCHES');
  stat(`${s.wins}-${s.losses}${s.draws ? `-${s.draws}` : ''}`, 'W-L');
  stat(games ? `${Math.round((s.wins / games) * 100)}%` : '—', 'WIN');
  stat(String(s.kills), 'KILLS');
  stat(s.matches ? (s.kills / Math.max(1, s.deaths)).toFixed(2) : '—', 'K/D');
  const peak = el('div', 'rk-peak', card);
  const pk = s.maxRp ? rankOf(s.maxRp) : null;
  const peakRank = pk && pk.tier === 'CHAMPION' && !championEligible(s) ? RANKS[RANKS.length - 2] : pk;
  const pkb = el('div', 'rk-mini', peak);
  emblem(pkb, peakRank, 34);
  const pkt = el('div', '', pkb);
  el('div', 'rk-mini-k', pkt, 'PEAK THIS WEEK');
  el('div', 'rk-mini-v', pkt, peakRank ? peakRank.name : '—');
  const last = s.weeks[0];
  const lw = el('div', 'rk-mini', peak);
  const lastRank = last && last.rp !== null ? rankOf(last.rp) : null;
  emblem(lw, lastRank, 34);
  const lwt = el('div', '', lw);
  el('div', 'rk-mini-k', lwt, 'LAST WEEK');
  el('div', 'rk-mini-v', lwt, last ? (lastRank ? `${lastRank.name}${last.place ? ` · #${last.place}` : ''}` : 'UNPLACED') : '—');

  // the reset
  const rs = el('div', 'rk-reset', card);
  const rt = resetText();
  el('span', 'rk-reset-k', rs, 'RANKS RESET IN');
  const left = el('span', 'rk-reset-v', rs, rt.left);
  el('div', 'rk-reset-s', rs, `Monday 8:00 a.m. Pacific · ${rt.local} your time`);
  clearInterval(ticker);
  ticker = window.setInterval(() => {
    if (!document.body.contains(left)) {
      clearInterval(ticker);
      return;
    }
    left.textContent = resetText().left;
  }, 20000);

  // play
  const cd = cooldownLeft(s);
  const go = button(cd > 0 ? `RANKED LOCKED · ${untilText(cd)}` : placing(s) ? `PLAY PLACEMENT ${s.placed + 1}/${PLACEMENTS}` : 'PLAY RANKED', 'rk-play' + (cd > 0 ? ' locked' : ''), p, () => {
    if (cooldownLeft(loadRanked()) > 0) return;
    onPlay();
  });
  go.type = 'button';
  el(
    'div',
    'mm-note',
    p,
    cd > 0
      ? 'You left a ranked match early: ranked stays closed for a while (5, 15, 45, then 120 minutes; forgiven after a week).'
      : '5v5 · first to 4 rounds (overtime at 3-3) · every AI pilot, wingmen and bandits, flies at your skill. Your jet and loadout from the HANGAR.',
  );
}

/** The ladder / matches / leaderboard / how-it-works panel (right). */
export function renderRankTabs(p: HTMLElement, rerender: () => void): void {
  const s = loadRanked();
  const tabs = el('div', 'rk-tabs', p);
  const t = (id: RankTab, label: string) => {
    const b = button(label, 'rk-tab' + (tab === id ? ' on' : ''), tabs, () => {
      tab = id;
      rerender();
    });
    b.type = 'button';
  };
  t('ladder', 'LADDER');
  t('matches', 'MATCHES');
  t('board', 'LEADERBOARD');
  t('how', 'HOW IT WORKS');
  const body = el('div', 'rk-body', p);
  if (tab === 'ladder') ladder(body, s);
  else if (tab === 'matches') matches(body, s);
  else if (tab === 'board') board(body, s);
  else how(body);
}

function ladder(p: HTMLElement, s: RankedState): void {
  const me = visibleRank(s);
  const peak = s.maxRp ? rankOf(s.maxRp).index : -1;
  for (let ti = 7; ti >= 0; ti--) {
    const tier = ti === 7 ? [RANKS[35]] : RANKS.slice(ti * 5, ti * 5 + 5).reverse();
    const g = el('div', 'rk-tier', p);
    g.style.setProperty('--rk', TIER_COLORS[tier[0].tier].main);
    for (const r of tier) {
      const row = el('div', 'rk-lrow' + (me && me.index === r.index ? ' me' : ''), g);
      emblem(row, r, 30);
      el('div', 'rk-lname', row, r.name);
      el('div', 'rk-lrp', row, r.tier === 'CHAMPION' ? `${CHAMPION_RP.toLocaleString()}+ RP · ${CHAMPION_MIN_MATCHES}+ MATCHES` : `${r.start.toLocaleString()} RP`);
      if (me && me.index === r.index) el('div', 'rk-ltag', row, 'YOU');
      else if (peak === r.index) el('div', 'rk-ltag peak', row, 'PEAK');
    }
  }
}

function matchLine(p: HTMLElement, m: MatchRecord): void {
  const row = el('div', 'rk-mrow ' + m.result, p);
  const d = new Date(m.t);
  const res = el('div', 'rk-mres', row, m.abandon ? 'LEFT' : m.result === 'win' ? 'WIN' : m.result === 'loss' ? 'LOSS' : 'DRAW');
  res.title = m.reason;
  const mid = el('div', 'rk-mmid', row);
  el('div', 'rk-mtop', mid, `${m.playlist === 'online' ? 'ONLINE' : 'RANKED'} · ${m.score}${m.placement ? ` · PLACEMENT ${m.placement}/${PLACEMENTS}` : ''}`);
  const parts = [`${sign(m.resultRp)} ${m.placement ? 'placement' : m.reason}`];
  if (m.killRp) parts.push(`${sign(m.killRp)} for ${m.kills} kill${m.kills === 1 ? '' : 's'}`);
  if (m.shield) parts.push('shield held');
  el('div', 'rk-msub', mid, `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · ${m.kills}/${m.deaths} K/D · ${parts.join(' · ')}`);
  const dr = m.rpAfter - m.rpBefore;
  el('div', 'rk-mrp' + (dr > 0 ? ' up' : dr < 0 ? ' down' : ''), row, m.placement ? (dr ? sign(dr) : '±0') : sign(dr));
}

function matches(p: HTMLElement, s: RankedState): void {
  if (!s.history.length) {
    el('div', 'mm-note', p, 'No ranked matches yet. Play RANKED (or an online free-for-all with 4 or more pilots) and every match shows up here with what it did to your RP.');
    return;
  }
  let week = '';
  for (const m of s.history) {
    if (m.week !== week) {
      week = m.week;
      el('div', 'rk-week', p, `WEEK OF ${new Date(m.week + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }).toUpperCase()}`);
    }
    matchLine(p, m);
  }
}

function board(p: HTMLElement, s: RankedState): void {
  const status = el('div', 'mm-note', p, 'Loading this week’s leaderboard…');
  void boardAvailable().then(async (ok) => {
    if (!ok) {
      status.textContent =
        'The shared leaderboard lives in the claude.ai version of the game, where every pilot’s rank for the week is saved to the artifact. Here your rank is kept on this device only.';
      return;
    }
    const rows = await loadBoard(s, 100);
    if (!rows || !rows.length) {
      status.textContent = 'Nobody has finished their placements this week yet. Be the first on the board.';
      return;
    }
    status.textContent = `This week · ${rows.length} pilot${rows.length === 1 ? '' : 's'} placed · Champions are numbered.`;
    const tbl = el('div', 'rk-board', p);
    let champ = 0;
    rows.forEach((r, i) => {
      const rank = rankOf(r.rp);
      const row = el('div', 'rk-brow' + (r.me ? ' me' : ''), tbl);
      el('div', 'rk-bpos', row, String(i + 1));
      emblem(row, rank, 26);
      // (callsigns come from other players: text only)
      const nm = el('div', 'rk-bname', row);
      nm.textContent = r.callsign + (r.me ? ' (YOU)' : '');
      el('div', 'rk-brank', row, rank.tier === 'CHAMPION' ? `CHAMPION #${++champ}` : rank.name);
      el('div', 'rk-brp', row, `${r.rp.toLocaleString()} RP`);
      el('div', 'rk-bwl', row, `${r.wins}-${r.losses}`);
    });
  });
}

function how(p: HTMLElement): void {
  const sec = (h: string, txt: string) => {
    el('div', 'rk-howh', p, h);
    el('div', 'mm-note', p, txt);
  };
  sec('THE LADDER', '36 ranks, like Rainbow Six Siege: Copper, Bronze, Silver, Gold, Platinum, Emerald and Diamond, five divisions each (V is the lowest, I the highest), then Champion. Every division is 100 RP: Copper V starts at 1,000, each tier spans 500, Diamond I starts at 4,400. Champion starts at 4,500 RP, needs 8 matches in the week and shows your place on the leaderboard instead of a division.');
  sec('WINNING AND LOSING RP', `A win or a loss is worth about 30 RP against an even side; beating a stronger one pays more, losing to a weaker one costs more. A hidden skill rating, kept from week to week, also leans on it: while you are ranked below your real skill you climb faster (up to +80 a win, as little as −9 a loss), and above it you slip back. A win is always worth at least 10.`);
  sec('KILLS', `Every kill is worth ${KILL_RP} RP, up to ${KILL_RP_CAP} a match. On a loss, kills can win back at most half of what you lost: winning the match still matters most.`);
  sec('PLACEMENTS', 'Every week starts with 5 placement matches. Your rank is hidden until the fifth, and each one is worth more: about +100 for a win and −50 for a loss. You start at least 300 RP below your hidden skill, more while the game is still unsure of it (at most Diamond V); a brand-new pilot starts at 1,667 (Bronze IV). Placements never put you straight into Champion.');
  sec('THE DEMOTION SHIELD', 'A loss that would drop you a division stops at that division’s 0 RP instead, as long as you had more than 0 RP going in. The next loss from 0 drops you. Champion is held at 4,500 the same way.');
  sec('THE WEEKLY RESET', 'Ranks reset every Monday at 8:00 a.m. Pacific time. Last week’s final rank and peak are kept, and you place again.');
  sec('MATCHES', 'RANKED is a 5v5 team battle: first to 4 rounds, overtime at 3-3 (first to 5). A round that runs out of time goes to the team with more jets left. Every AI pilot in it flies at your skill, from about Easy in Copper to Extreme in Diamond and APEX for Champions. Online free-for-all matches with 4 or more pilots count too: your place counts as a win against every pilot below you and a loss against every one above, and the lobby is scored as an even one. Your RP is settled the moment you are out (or win).');
  sec('LEAVING', 'Leaving a ranked match early counts as a loss (no kill RP, no shield) and keeps you out of ranked for 5 minutes, then 15, 45 and 120 for repeat exits; a week later they are forgiven. Online, leaving while you are still flying counts as last place; once you are out you can go. A dropped connection counts as being the next one out, with no cooldown.');
}
