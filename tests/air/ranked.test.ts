import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RANKS, rankOf, weekStart, nextReset, weekId, newRankedState, settleMatch, placing, visibleRank, rollWeek, seedFor,
  cooldownLeft, championEligible, skillLevelFor, aiRating, divisionRp, expected, beginMatch, loadRanked, saveRanked,
  CHAMPION_RP, PLACEMENTS, MMR_START, SIGMA_START, type RankedState,
} from '../../src/game/ranked';

const utc = (s: string) => Date.parse(s);

/** a pilot who has finished this week's placements at `rp`, hidden skill `mmr` */
function placed(rp: number, mmr = rp, now = utc('2026-10-07T20:00:00Z')): RankedState {
  const s = newRankedState(now);
  s.placed = PLACEMENTS;
  s.matches = 10;
  s.rp = rp;
  s.mmr = mmr;
  s.sigma = 350;
  return s;
}

test('36 ranks: Copper V at 1000, 100 RP a division, Diamond I at 4400, Champion at 4500', () => {
  assert.equal(RANKS.length, 36);
  assert.equal(RANKS[0].name, 'COPPER V');
  assert.equal(RANKS[0].start, 1000);
  assert.equal(RANKS[4].name, 'COPPER I');
  assert.equal(RANKS[5].name, 'BRONZE V');
  assert.equal(RANKS[5].start, 1500);
  assert.equal(RANKS[25].name, 'EMERALD V');
  assert.equal(RANKS[25].start, 3500);
  assert.equal(RANKS[34].name, 'DIAMOND I');
  assert.equal(RANKS[34].start, 4400);
  assert.equal(RANKS[35].name, 'CHAMPION');
  assert.equal(RANKS[35].start, 4500);
  for (let i = 0; i < 35; i++) assert.equal(RANKS[i].next, RANKS[i].start + 100);
  assert.equal(rankOf(999).name, 'COPPER V');
  assert.equal(rankOf(2599).name, 'GOLD V');
  assert.equal(rankOf(2600).name, 'GOLD IV');
  assert.equal(rankOf(4499).name, 'DIAMOND I');
  assert.equal(rankOf(6000).name, 'CHAMPION');
});

test('weekly reset: Monday 8:00 a.m. Pacific, daylight saving included', () => {
  // the report's next three resets: 15:00 UTC in daylight time, 16:00 UTC in standard time
  assert.equal(nextReset(utc('2026-10-09T12:00:00Z')), utc('2026-10-12T15:00:00Z'));
  assert.equal(nextReset(utc('2026-10-28T12:00:00Z')), utc('2026-11-02T16:00:00Z'));
  assert.equal(nextReset(utc('2027-03-10T12:00:00Z')), utc('2027-03-15T15:00:00Z'));
  // Monday 7:59 Pacific is still last week; 8:00 is the new one
  assert.equal(weekStart(utc('2026-10-12T14:59:00Z')), utc('2026-10-05T15:00:00Z'));
  assert.equal(weekStart(utc('2026-10-12T15:00:00Z')), utc('2026-10-12T15:00:00Z'));
  assert.equal(weekId(weekStart(utc('2026-10-09T12:00:00Z'))), '2026-10-05');
});

test('a first-time pilot seeds at 1667 (Bronze IV) and places over 5 hidden matches: +100 a win, -50 a loss at par', () => {
  const s = newRankedState(utc('2026-10-07T20:00:00Z'));
  assert.equal(s.mmr, MMR_START);
  assert.equal(s.sigma, SIGMA_START);
  assert.equal(s.rp, 1667);
  assert.equal(rankOf(s.rp).name, 'BRONZE IV');
  assert.equal(visibleRank(s), null);
  // even sides: score against the AI at your own rating
  const r1 = settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'win', kills: 0, deaths: 0, oppRating: s.mmr, score: '4 : 1' }, utc('2026-10-07T21:00:00Z'));
  assert.equal(r1.record.resultRp, 100);
  assert.equal(r1.record.placement, 1);
  const before = s.rp;
  const mmr = s.mmr;
  const r2 = settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 0, deaths: 3, oppRating: mmr, score: '2 : 4' }, utc('2026-10-07T22:00:00Z'));
  assert.equal(r2.record.resultRp, -50);
  assert.equal(s.rp, before - 50);
  for (let i = 0; i < 2; i++) settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'win', kills: 2, deaths: 1, oppRating: s.mmr, score: '4 : 2' }, utc('2026-10-07T23:00:00Z'));
  assert.ok(placing(s));
  const r5 = settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'win', kills: 1, deaths: 0, oppRating: s.mmr, score: '4 : 0' }, utc('2026-10-08T00:00:00Z'));
  assert.ok(r5.revealed);
  assert.ok(!placing(s));
  assert.ok(visibleRank(s));
});

test('placements never reach Champion', () => {
  const s = newRankedState(utc('2026-10-07T20:00:00Z'));
  s.rp = 4300;
  for (let i = 0; i < 5; i++) settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'win', kills: 5, deaths: 0, oppRating: s.mmr, score: '4 : 0' });
  assert.equal(s.rp, CHAMPION_RP - 1);
  assert.equal(visibleRank(s)!.name, 'DIAMOND I');
});

test('at par a win is +30, a loss -30; kills add 5 each, at most 15, and never more than half a loss back', () => {
  const s = placed(2550);
  const w = settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'win', kills: 0, deaths: 0, oppRating: 2550, score: '4 : 3' });
  assert.equal(w.record.resultRp, 30);
  const s2 = placed(2550);
  const w2 = settleMatch(s2, { playlist: 'ranked', kind: 'team', result: 'win', kills: 9, deaths: 0, oppRating: 2550, score: '4 : 3' });
  assert.equal(w2.record.killRp, 15);
  assert.equal(s2.rp, 2550 + 30 + 15);
  const s3 = placed(2550);
  const l = settleMatch(s3, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 9, deaths: 4, oppRating: 2550, score: '3 : 4' });
  assert.equal(l.record.resultRp, -30);
  assert.equal(l.record.killRp, 15);
  assert.equal(s3.rp, 2550 - 30 + 15);
});

test('the gap rule: far below your skill, up to +80 a win and -9 a loss', () => {
  const lo = placed(1100, 4600);
  const w = settleMatch(lo, { playlist: 'ranked', kind: 'team', result: 'win', kills: 0, deaths: 0, oppRating: 4600, score: '4 : 2' });
  assert.equal(w.record.resultRp, 80);
  const lo2 = placed(1100, 4600);
  const l = settleMatch(lo2, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 0, deaths: 0, oppRating: 4600, score: '2 : 4' });
  assert.equal(l.record.resultRp, -9);
  // a win is always worth at least 10, even against a much weaker side
  const hi = placed(3000, 3000);
  const w2 = settleMatch(hi, { playlist: 'ranked', kind: 'team', result: 'win', kills: 0, deaths: 0, oppRating: 1000, score: '4 : 0' });
  assert.ok(w2.record.resultRp >= 10);
});

test('demotion shield: held at the division line once, dropped on the next loss', () => {
  const s = placed(2610, 2610); // Gold IV, 10 RP in
  const l1 = settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 0, deaths: 3, oppRating: 2610, score: '1 : 4' });
  assert.ok(l1.record.shield);
  assert.equal(s.rp, 2600);
  assert.equal(visibleRank(s)!.name, 'GOLD IV');
  const l2 = settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 0, deaths: 3, oppRating: s.mmr, score: '1 : 4' });
  assert.ok(!l2.record.shield);
  assert.ok(s.rp < 2600);
  assert.ok(l2.demoted);
  assert.equal(visibleRank(s)!.name, 'GOLD V');
  // the floor: never below Copper V
  const c = placed(1005, 1000);
  for (let i = 0; i < 4; i++) settleMatch(c, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 0, deaths: 3, oppRating: c.mmr, score: '0 : 4' });
  assert.equal(c.rp, 1000);
});

test('Champion: 4500 RP and 8 matches this week; held at 4500 by the shield', () => {
  const s = placed(4505, 4800);
  s.matches = 7;
  assert.ok(!championEligible(s));
  assert.equal(visibleRank(s)!.name, 'DIAMOND I');
  s.matches = 8;
  assert.equal(visibleRank(s)!.name, 'CHAMPION');
  assert.equal(divisionRp(s), 5);
  const l = settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 0, deaths: 2, oppRating: aiRating(s.mmr), score: '3 : 4' });
  assert.ok(l.record.shield);
  assert.equal(s.rp, CHAMPION_RP);
});

test('leaving a match: a loss, no kill RP, no shield, and 5 / 15 / 45 / 120 minute cooldowns', () => {
  const t0 = utc('2026-10-07T20:00:00Z');
  const s = placed(2610, 2610, t0);
  const r = settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 6, deaths: 1, oppRating: 2610, abandon: true, score: 'LEFT' }, t0);
  assert.equal(r.record.killRp, 0);
  assert.ok(!r.record.shield);
  assert.ok(s.rp < 2600);
  assert.equal(cooldownLeft(s, t0), 5 * 60000);
  settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 0, deaths: 1, abandon: true, score: 'LEFT' }, t0 + 3600000);
  assert.equal(cooldownLeft(s, t0 + 3600000), 15 * 60000);
  settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 0, deaths: 1, abandon: true, score: 'LEFT' }, t0 + 7200000);
  assert.equal(cooldownLeft(s, t0 + 7200000), 45 * 60000);
  settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 0, deaths: 1, abandon: true, score: 'LEFT' }, t0 + 3 * 3600000);
  assert.equal(cooldownLeft(s, t0 + 3 * 3600000), 120 * 60000);
});

test('online free-for-all: scored on placing against every pilot; under 4 pilots it does not count', () => {
  const s = placed(2550);
  const first = settleMatch(s, { playlist: 'online', kind: 'ffa', place: 1, of: 12, kills: 3, deaths: 0, oppRating: 2550, score: '1st of 12' });
  assert.equal(first.record.result, 'win');
  assert.equal(first.record.resultRp, 60);
  const s2 = placed(2580, 2580);
  const last = settleMatch(s2, { playlist: 'online', kind: 'ffa', place: 12, of: 12, kills: 0, deaths: 1, oppRating: 2580, score: '12th of 12' });
  assert.equal(last.record.result, 'loss');
  assert.equal(last.record.resultRp, -60);
  const s3 = placed(2550);
  const tiny = settleMatch(s3, { playlist: 'online', kind: 'ffa', place: 1, of: 3, kills: 2, deaths: 0, score: '1st of 3' });
  assert.ok(tiny.uncounted);
  assert.equal(s3.rp, 2550);
});

test('the week rolls over: filed, seeded 300 below hidden skill (at most Diamond V), back to placements', () => {
  const s = placed(3900, 4200, utc('2026-10-07T20:00:00Z'));
  rollWeek(s, utc('2026-10-12T15:00:01Z'));
  assert.equal(s.weeks[0].week, '2026-10-05');
  assert.equal(s.weeks[0].rp, 3900);
  // one uncertainty (350) below hidden skill, since that is more than 300
  assert.equal(seedFor(4200, 350), 3850);
  assert.equal(s.rp, 3850);
  assert.equal(seedFor(4200, 200), 3900);
  assert.equal(s.placed, 0);
  assert.equal(s.matches, 0);
  assert.equal(visibleRank(s), null);
  const top = placed(5200, 5400, utc('2026-10-07T20:00:00Z'));
  rollWeek(top, utc('2026-10-13T00:00:00Z'));
  assert.equal(top.rp, 4000);
});

test('matchmaking: Easy 1500, Medium 2500, Hard 3300, Extreme 4000, APEX at Champion', () => {
  assert.equal(skillLevelFor(1500), 0.05);
  assert.equal(skillLevelFor(2500), 0.35);
  assert.equal(skillLevelFor(3300), 0.65);
  assert.equal(skillLevelFor(4000), 1);
  assert.equal(aiRating(4700), 4700);
  assert.ok(Math.abs(expected(3000, 3500) - 0.24) < 0.01);
});

test('the reason is judged before the hidden skill moves: a win or a loss at par is an even match', () => {
  const s = placed(3000, 3000);
  const w = settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'win', kills: 0, deaths: 0, oppRating: 3000, score: '4 : 2' });
  assert.equal(w.record.reason, 'even match');
  const s2 = placed(3000, 3000);
  const l = settleMatch(s2, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 0, deaths: 0, oppRating: 3000, score: '2 : 4' });
  assert.equal(l.record.reason, 'even match');
  const s3 = placed(3000, 3000);
  assert.equal(settleMatch(s3, { playlist: 'ranked', kind: 'team', result: 'win', kills: 0, deaths: 0, oppRating: 3400, score: '4 : 3' }).record.reason, 'vs a stronger side');
});

test('kills never win back more than half a loss (a 9 RP loss keeps at least 5 of it)', () => {
  // far above hidden skill: the smallest loss
  const s = placed(3000, 2000);
  const l = settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'loss', kills: 3, deaths: 2, oppRating: 4000, score: '3 : 4' });
  assert.equal(l.record.resultRp, -9);
  assert.equal(l.record.killRp, 4);
  assert.equal(s.rp, 2995);
});

test('loading the rank mid-match leaves this page\'s match alone; a match from a closed page counts as left', () => {
  const s = placed(2500, 2500);
  saveRanked(s);
  beginMatch(s, 'ranked', 'team');
  const mid = loadRanked();
  assert.ok(mid.live, 'still live');
  assert.equal(mid.abandons, 0);
  const done = settleMatch(s, { playlist: 'ranked', kind: 'team', result: 'win', kills: 1, deaths: 0, oppRating: 2500, score: '4 : 1' });
  assert.equal(done.record.result, 'win');
  saveRanked(s);
  // a match some other page began (not this one): settled as left on load
  s.live = { started: 12345, playlist: 'ranked', opp: 2500, kind: 'team' };
  saveRanked(s);
  const after = loadRanked();
  assert.equal(after.live, null);
  assert.equal(after.history[0].abandon, true);
});
