// Engagement rules shared by the simulation, sensors, AI and HUD.
// Normally BLUE and RED fight each other; in a free-for-all every jet is
// hostile to every other jet (the BLUE / RED team then only picks colours
// and insignia). The optional battle zone is where the AI keeps itself.

export const RULES = {
  /** every aircraft is hostile to every other aircraft */
  ffa: false,
  /** the shrinking free-for-all battle zone (AI stays inside it) */
  zone: {
    active: false,
    /** current edge */
    x: 0,
    z: 0,
    r: 0,
    /** where it goes next (nr = 0: nowhere) */
    nx: 0,
    nz: 0,
    nr: 0,
    /** the circle the AI should keep inside: the next one while shrinking or about to */
    sx: 0,
    sz: 0,
    sr: 0,
  },
  /** free-for-all: id of the jet carrying the bounty (most kills), or -1 */
  bountyId: -1,
  /** free-for-all final circles: every jet's position is broadcast to everyone */
  revealAll: false,
};

/** Are these two aircraft enemies under the current rules? */
export function hostile(a: { team: string }, b: { team: string }): boolean {
  return a !== b && (RULES.ffa || a.team !== b.team);
}

/** Same side (or the same jet) under the current rules. */
export function friendly(a: { team: string }, b: { team: string }): boolean {
  return !hostile(a, b);
}

export function resetRules(): void {
  RULES.ffa = false;
  RULES.zone.active = false;
  RULES.bountyId = -1;
  RULES.revealAll = false;
}
