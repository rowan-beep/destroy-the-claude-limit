// RANKED: the Siege-style ranked playlist (see ../ranked.ts), flown as a 5v5 team
// battle. First to 4 rounds; at 3-3 it goes to overtime, first to 5. A round that runs
// out of time goes to the team with more jets left (level: it is replayed). Every AI
// pilot in the match, wingmen and bandits alike, flies at your rating -- the hidden
// estimate while you place, your RP after -- and APEX once you are Champion. RP is
// settled when the match ends; leaving early counts as a loss.

import { TeamBattleMode } from './team';
import type { AISkill } from '../../ai/skill';
import type { Team } from '../../core/constants';
import {
  loadRanked, saveRanked, settleMatch, beginMatch, ratingOf, placing, rankedSkill, difficultyFor, aiRating, visibleRank,
  cooldownLeft, untilText, PLACEMENTS, type RankedState,
} from '../ranked';
import { publishRank } from '../../net/rankBoard';
import { statsFor } from './mode';

/** rounds to win, and in overtime (from 3-3) */
export const RANKED_WINS = 4;
export const RANKED_OVERTIME_WINS = 5;
/** combat time before a ranked round is called (s) */
export const RANKED_ROUND_LIMIT = 4 * 60;

export class RankedMode extends TeamBattleMode {
  private rs: RankedState = loadRanked();
  private rating = ratingOf(this.rs);
  /** the match has been settled (or not started) */
  private settled = true;
  /** this match counts for rank (not during a leave cooldown) */
  private counted = true;

  override get winsNeeded(): number {
    const ot = RANKED_WINS - 1;
    return this.score.blue >= ot && this.score.red >= ot ? RANKED_OVERTIME_WINS : RANKED_WINS;
  }

  protected override skillFor(): AISkill {
    return rankedSkill(this.rating);
  }

  protected override skillLabel(): string {
    return placing(this.rs) ? `RANKED · PLACEMENT ${this.rs.placed + 1}/${PLACEMENTS}` : `RANKED · ${difficultyFor(this.rating)}-CLASS PILOTS`;
  }

  override start(): void {
    // the ranked rules: all weapons, mixed wingmen, whatever the team-battle settings say
    this.host.config.duelRules = 'all';
    this.host.config.teamAllies = 'mixed';
    this.rs = loadRanked();
    this.rating = ratingOf(this.rs);
    this.roundLimit = RANKED_ROUND_LIMIT;
    // the queue is closed after leaving a match: this one is flown for nothing
    this.counted = cooldownLeft(this.rs) <= 0;
    if (this.counted) beginMatch(this.rs, 'ranked', 'team');
    this.settled = !this.counted;
    super.start();
    this.host.message(
      !this.counted
        ? `RANKED COOLDOWN — ${untilText(cooldownLeft(this.rs))} LEFT · THIS MATCH DOESN'T COUNT`
        : placing(this.rs)
          ? `RANKED — PLACEMENT MATCH ${this.rs.placed + 1} OF ${PLACEMENTS}`
          : `RANKED — ${visibleRank(this.rs)?.name ?? ''} · ${this.rs.rp} RP`,
      this.counted ? 'order' : 'warn',
      8,
    );
  }

  protected override timeoutWinner(blue: number, red: number): Team | 'draw' | 'both' {
    return blue > red ? 'blue' : red > blue ? 'red' : 'draw';
  }

  protected override finish(): void {
    const h = this.host;
    this.phase = 'over';
    this.over = true;
    const won = this.score.blue > this.score.red;
    const p = h.player;
    if (!this.counted) {
      h.showResults({
        title: won ? 'MATCH WON' : 'MATCH LOST',
        subtitle: `Ranked cooldown — this match didn't count. BLUE ${this.score.blue} : ${this.score.red} RED.`,
        good: won,
        stats: [
          ['FINAL SCORE', `${this.score.blue} : ${this.score.red}`],
          ['YOUR KILLS (MATCH)', String(this.matchKills)],
          ['RANKED OPENS IN', untilText(cooldownLeft(this.rs))],
        ],
        buttons: [{ label: 'MAIN MENU', action: 'menu' }],
      });
      return;
    }
    const res = this.settle(won ? 'win' : 'loss', false);
    h.showResults({
      title: won ? 'MATCH WON' : 'MATCH LOST',
      subtitle: `Ranked — BLUE ${this.score.blue} : ${this.score.red} RED over ${this.round} round${this.round === 1 ? '' : 's'}.`,
      good: won,
      stats: [
        ['FINAL SCORE', `${this.score.blue} : ${this.score.red}`],
        ['YOUR KILLS (MATCH)', String(this.matchKills)],
        ['AI PILOTS', `${difficultyFor(this.rating)}-CLASS`],
        ...statsFor(p, []).slice(0, 1),
        ['MATCH TIME', `${Math.floor(this.elapsed / 60)}:${String(Math.floor(this.elapsed % 60)).padStart(2, '0')}`],
      ],
      buttons: [
        { label: 'NEXT MATCH', action: 'retry' },
        { label: 'MAIN MENU', action: 'menu' },
      ],
      ranked: res,
    });
  }

  /** settle this match once (a finish, or leaving early) */
  private settle(result: 'win' | 'loss', abandon: boolean) {
    this.settled = true;
    const res = settleMatch(this.rs, {
      playlist: 'ranked',
      kind: 'team',
      result,
      kills: this.matchKills,
      deaths: this.matchDeaths,
      oppRating: aiRating(this.rating),
      abandon,
      score: abandon ? 'LEFT THE MATCH' : `${this.score.blue} : ${this.score.red}`,
    });
    saveRanked(this.rs);
    void publishRank(this.rs);
    return res;
  }

  override dispose(): void {
    // leaving a ranked match before it ends counts as a loss (kills from finished rounds don't count)
    if (!this.settled) this.settle('loss', true);
  }
}
