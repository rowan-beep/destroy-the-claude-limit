// Each jet's own cockpit warnings: the voice its warning system speaks (in its own language), the
// phrases it uses, its warning tones and its pilot's launch calls. Researched online (November 2026);
// what each entry rests on is in its `sources` line, and anything not confirmed by a source says so.
//
// The voice is the browser's speech synthesis: a phrase is spoken in the jet's language when the device
// has a voice for it, otherwise in English (the `en` line of the jet's set), so a missing language never
// leaves the pilot without the warning.

import type { AircraftType } from '../aircraft/specs';

/** what a warning system can call out */
export type WarnEvent =
  | 'pullUp' // ground collision ahead
  | 'altitude' // low and descending
  | 'rollLeft' // ground ahead while inverted / steeply banked: roll this way first
  | 'rollRight'
  | 'missile' // RWR: missile guiding on us
  | 'rwrLock' // RWR: a radar has locked us
  | 'rwrSearch' // RWR: a radar is searching
  | 'lock' // our own radar has locked a target
  | 'bingo' // fuel for the trip home
  | 'fuelOut' // tanks dry
  | 'overG' // over the G limit
  | 'aoa' // angle of attack / stall limit
  | 'gear' // low and slow with the gear up
  | 'fire' // engine fire (one engine, or which one is not known)
  | 'fireL'
  | 'fireR'
  | 'caution'; // master caution

/** a repeating warning tone: ticks at `rate` per second; tick k sounds when pattern[k % length] is '1', at f[k % f.length] Hz (rate 0: steady at f[0]) */
export interface TonePattern {
  f: number[];
  rate: number;
  pattern: string;
}

export interface ToneSet {
  /** RWR: a radar has locked us */
  lock: TonePattern;
  /** RWR: a missile is guiding on us */
  missile: TonePattern;
  /** stall / angle-of-attack warning */
  stall: TonePattern;
  /** RWR: a new radar searching, one blip [Hz, s] */
  search: [number, number];
  /** RWR: a new lock, a run of chirps [Hz, start s] (each 0.05 s) */
  newThreat: [number, number][];
  /** master caution: notes [Hz, duration s, start s] */
  caution: [number, number, number][];
  /** an attention-getter played before each voice warning: notes [Hz, duration s, start s] (none: the voice alone) */
  attention?: [number, number, number][];
  /** the oscillator shape for all of them */
  wave: OscillatorType;
}

export interface WarningSet {
  /** the warning system and voice, for the notes and the settings */
  system: string;
  /** the jet's nation, and the language its warning voice speaks (BCP-47) */
  nation: string;
  lang: string;
  /** device voice names to prefer for this voice (regex source), e.g. a female voice of the language */
  voiceHint: string;
  /** what the voice says, in its own language (missing = this system does not call it out) */
  say: Partial<Record<WarnEvent, string>>;
  /** the same in English, used when the device has no voice for `lang` */
  en: Partial<Record<WarnEvent, string>>;
  /** the pilot's own launch calls: radar missile, IR missile, bomb release (in the pilot's language) */
  launch: { radar: string; ir: string; bomb: string; enRadar: string; enIr: string; enBomb: string };
  /** speech rate (1 = normal) */
  rate: number;
  tones: ToneSet;
  /** what this entry rests on */
  sources: string;
}

// --- tone sets by family ---
// Only the US set is the game's own (its tones until this update, unchanged). No published tone specifications
// were found for the others: they are approximations in the character of each family, listed in COULD NOT VERIFY.
const US_TONES: ToneSet = {
  lock: { f: [1020], rate: 3.5, pattern: '1110' },
  missile: { f: [1650, 1250], rate: 12, pattern: '1' },
  stall: { f: [560], rate: 5, pattern: '10' },
  search: [1200, 0.05],
  newThreat: [[1150, 0], [1450, 0.07], [1150, 0.16], [1450, 0.23]],
  caution: [[880, 0.12, 0], [880, 0.12, 0.2]],
  wave: 'square',
};
const EU_TONES: ToneSet = {
  // a falling two-note lock, a fast two-tone siren for a missile, a rising chime for a caution
  lock: { f: [1300, 1000, 1000], rate: 6, pattern: '110' },
  missile: { f: [1750, 950], rate: 8, pattern: '1' },
  stall: { f: [640], rate: 8, pattern: '10' },
  search: [1500, 0.04],
  newThreat: [[1300, 0], [1000, 0.09], [1300, 0.18]],
  caution: [[1046, 0.1, 0], [1318, 0.1, 0.12], [1568, 0.16, 0.24]],
  wave: 'triangle',
};
/** the Typhoon: the EU tones, and its attention-getter before the voice (SAE "Eurofighter ergonomics") */
const TYPHOON_TONES: ToneSet = { ...EU_TONES, attention: [[1568, 0.08, 0], [1568, 0.08, 0.12]] };
const RU_TONES: ToneSet = {
  // a low, nearly steady tone for a lock, rapid high pulses for a missile, a slow low pulse at the AoA limit
  lock: { f: [900], rate: 4, pattern: '1110' },
  missile: { f: [1600], rate: 16, pattern: '10' },
  stall: { f: [480], rate: 3, pattern: '110' },
  search: [700, 0.06],
  newThreat: [[900, 0], [900, 0.12]],
  caution: [[1000, 0.25, 0]],
  wave: 'square',
};
const CN_TONES: ToneSet = {
  lock: { f: [1200], rate: 5, pattern: '1100' },
  missile: { f: [1900, 1400], rate: 20, pattern: '1' },
  stall: { f: [600], rate: 10, pattern: '10' },
  search: [1100, 0.05],
  newThreat: [[1200, 0], [1600, 0.08]],
  caution: [[1000, 0.12, 0], [800, 0.16, 0.14]],
  wave: 'square',
};
const OLD_TONES: ToneSet = {
  // 1960s jets: no RWR voice, no chirps; a warning horn and a low stall buzz
  lock: { f: [750], rate: 2, pattern: '10' },
  missile: { f: [750], rate: 6, pattern: '10' },
  stall: { f: [220], rate: 0, pattern: '1' },
  search: [750, 0.03],
  newThreat: [[750, 0]],
  caution: [[440, 0.5, 0]],
  wave: 'sawtooth',
};

// --- voices ---
const FEMALE_EN_US = 'female|zira|samantha|aria|jenny|ava|allison|susan';
const US_LAUNCH = { radar: 'Fox three', ir: 'Fox two', bomb: 'Pickle', enRadar: 'Fox three', enIr: 'Fox two', enBomb: 'Pickle' };
const EN_US = {
  pullUp: 'Pull up, pull up',
  altitude: 'Altitude, altitude',
  rollLeft: 'Roll left, roll left',
  rollRight: 'Roll right, roll right',
  missile: 'Missile, missile',
  lock: 'Lock',
  bingo: 'Bingo, bingo',
  fuelOut: 'Fuel low, fuel low',
  overG: 'Over G',
  aoa: 'Angle of attack',
  gear: 'Check gear',
  fire: 'Engine fire',
  fireL: 'Engine fire left',
  fireR: 'Engine fire right',
  caution: 'Caution',
  rwrLock: 'Spike',
  rwrSearch: 'Search',
} satisfies Record<WarnEvent, string>;

/** a US jet: the same words in and out of English */
function us(system: string, say: Partial<Record<WarnEvent, string>>, sources: string): WarningSet {
  return { system, nation: 'United States', lang: 'en-US', voiceHint: FEMALE_EN_US, say, en: say, launch: US_LAUNCH, rate: 1.1, tones: US_TONES, sources };
}

const RU = (system: string, sources: string): WarningSet => ({
  system,
  nation: 'Russia',
  lang: 'ru-RU',
  voiceHint: 'irina|svetlana|dariya|female|milena',
  say: {
    // (confirmed: "Переведи в набор" is Rita's pull-up; "предельный угол атаки", "предельная перегрузка" in a
    // Su-27 crew transcript; "опасная высота" and "пожар" in RI-65 descriptions; "выпусти шасси" and "атака"
    // in Rita phrase lists. The missile and fuel wordings are not confirmed by a source.)
    pullUp: 'Переведи в набор',
    altitude: 'Опасная высота',
    missile: 'Ракета, ракета',
    bingo: 'Остаток топлива на возврат',
    fuelOut: 'Аварийный остаток топлива',
    overG: 'Предельная перегрузка',
    aoa: 'Предельный угол атаки',
    gear: 'Выпусти шасси',
    fire: 'Пожар двигателя',
    fireL: 'Пожар левого двигателя',
    fireR: 'Пожар правого двигателя',
  },
  en: { pullUp: 'Climb, climb', altitude: 'Dangerous altitude', missile: 'Missile, missile', bingo: 'Fuel for return', fuelOut: 'Emergency fuel', overG: 'G limit', aoa: 'Angle of attack limit', gear: 'Lower the gear', fire: 'Engine fire', fireL: 'Fire, left engine', fireR: 'Fire, right engine' },
  launch: { radar: 'Пуск!', ir: 'Пуск!', bomb: 'Сброс!', enRadar: 'Pusk!', enIr: 'Pusk!', enBomb: 'Sbros' },
  rate: 1.05,
  tones: RU_TONES,
  sources,
});

const RU_SOURCES =
  'Rita (RI-65 "rechevoy informator"), a female voice: Wikipedia "MiG-29" and "Voice warning system"; ED Forums threads on "Perevodi v nabor" and Su-27 Rita; flb.ru Su-27 crew transcript ("скорость предельная", "предельный угол атаки, предельная перегрузка"); studfile / studopedia RI-65B descriptions ("Пожар", "Опасная высота", at most 16 messages); War Thunder forum list of Rita phrases. The Su-35S and Su-57 systems are not documented: Rita\'s phrases assumed.';

/** every jet's warnings */
export const WARNING_SETS: Record<AircraftType, WarningSet> = {
  F15EX: us(
    'Voice warning system ("Bitchin\' Betty"; the F-15\'s first voice was Kim Crow)',
    { pullUp: EN_US.pullUp, altitude: EN_US.altitude, missile: EN_US.missile, bingo: 'Bingo', fuelOut: EN_US.fuelOut, overG: EN_US.overG, fire: EN_US.fire, fireL: 'Warning, engine fire left', fireR: 'Warning, engine fire right', caution: EN_US.caution },
    'Hushkit, "F-15 pilot shares the history of Bitchin\' Betty" (Kim Crow; few messages at first, more added); Wikipedia "Voice warning system". The F-15EX\'s exact phrase list is not published: the common US phrases assumed.',
  ),
  FA18EF: us(
    'Voice alert system ("Bitchin\' Betty"; Leslie Shook\'s voice on the Super Hornet)',
    { pullUp: 'Pull up', altitude: EN_US.altitude, rollLeft: EN_US.rollLeft, rollRight: EN_US.rollRight, missile: EN_US.missile, bingo: EN_US.bingo, fuelOut: EN_US.fuelOut, overG: 'Flight controls, flight controls', fire: EN_US.fire, fireL: EN_US.fireL, fireR: EN_US.fireR },
    'NATOPS F/A-18A-D and E/F manuals (voice alert sections 2.17.3 / 2.15.3, "FIRE warning voice alerts"); ED Forums on the NATOPS pocket checklist ("Flight Controls, Flight Controls", "Bingo, Bingo"); Bloomberg 2016 "The world\'s top fighter pilots fear this woman\'s voice" (Bingo); speechtechmag ("Engine fire left"); cockpit recordings: Altitude, Pull up, Roll left/right, Flight controls, Fuel low, Bingo, Engine fire left/right.',
  ),
  F16C: us(
    'Voice message system (VMS)',
    { pullUp: EN_US.pullUp, altitude: EN_US.altitude, missile: EN_US.missile, lock: 'Lock', bingo: EN_US.bingo, fuelOut: 'Warning, warning', fire: 'Warning, warning', caution: 'Caution, caution' },
    'Falcon BMS flight manual (TO 1F-16CM-1 BMS) and Falconpedia "Voice Message System": "Warning warning" for warning-light failures (fire, etc.), "Caution caution", "Pull up", "Altitude" (below CARA A-LOW, not with the gear down), "Bingo", "Lock" (own radar lock). No over-G call (the F-16 flight controls limit the G). These are simulator manuals modelled on the real jet.',
  ),
  F22: us(
    'ICAWS voice warnings',
    { pullUp: EN_US.pullUp, altitude: EN_US.altitude, missile: EN_US.missile, bingo: EN_US.bingo, fuelOut: EN_US.fuelOut, overG: EN_US.overG, fire: EN_US.fire, fireL: EN_US.fireL, fireR: EN_US.fireR, caution: EN_US.caution },
    'No F-22 phrase list found (Wikipedia "Voice warning system" and "Bitching Betty" give the US convention: a female voice, "Pull up", missile warnings). The common US phrases assumed.',
  ),
  TYPHOON: {
    system: 'Voice warnings ("Nagging Nora", Sue Milne\'s voice, the same in all four nations\' fleets) after an attention-getter',
    nation: 'United Kingdom, Germany, Italy, Spain',
    lang: 'en-GB',
    voiceHint: 'hazel|susan|libby|sonia|maisie|female',
    say: { pullUp: 'Pull up, pull up', altitude: 'Altitude, altitude', missile: 'Missile, missile', bingo: 'Bingo fuel', fuelOut: 'Fuel low', overG: 'Over G', aoa: 'Angle of attack', fire: 'Fire', fireL: 'Left engine fire', fireR: 'Right engine fire', caution: 'Caution' },
    en: { pullUp: 'Pull up, pull up', altitude: 'Altitude, altitude', missile: 'Missile, missile', bingo: 'Bingo fuel', fuelOut: 'Fuel low', overG: 'Over G', aoa: 'Angle of attack', fire: 'Fire', fireL: 'Left engine fire', fireR: 'Right engine fire', caution: 'Caution' },
    launch: { radar: 'Fox three', ir: 'Fox two', bomb: 'Bombs gone', enRadar: 'Fox three', enIr: 'Fox two', enBomb: 'Bombs gone' },
    rate: 1.05,
    tones: TYPHOON_TONES,
    sources: 'Kathryn\'s Report 2012 ("Nagging Nora", Sue Milne, all Typhoon fleets); SAE Aerospace Engineering "Eurofighter ergonomics" (attention-getters, then the voice; a separate warning panel); Wikipedia "Voice warning system". English is the Typhoon\'s cockpit language in every fleet. Exact phrases not published.',
  },
  SU35: RU('Rita, the RI-65 family\'s speech informer', RU_SOURCES),
  MIG31: RU('Rita, the RI-65 speech informer', RU_SOURCES),
  SU57: RU('Rita-style speech informer', RU_SOURCES),
  RAFALE: {
    system: 'Alarmes vocales (in French, as asked for this game; see sources)',
    nation: 'France',
    lang: 'fr-FR',
    voiceHint: 'julie|hortense|denise|amelie|female|marie',
    say: { pullUp: 'Remontez, remontez', altitude: 'Altitude, altitude', missile: 'Missile, missile', bingo: 'Bingo, bingo', fuelOut: 'Carburant bas', overG: 'Facteur de charge', aoa: 'Incidence', fire: 'Feu moteur', fireL: 'Feu moteur gauche', fireR: 'Feu moteur droit', caution: 'Panne' },
    en: { pullUp: 'Pull up, pull up', altitude: 'Altitude, altitude', missile: 'Missile, missile', bingo: 'Bingo, bingo', fuelOut: 'Fuel low', overG: 'Over G', aoa: 'Angle of attack', fire: 'Engine fire', fireL: 'Engine fire left', fireR: 'Engine fire right', caution: 'Caution' },
    launch: { radar: 'Fox trois', ir: 'Fox deux', bomb: 'Largage', enRadar: 'Fox three', enIr: 'Fox two', enBomb: 'Pickle' },
    rate: 1.05,
    tones: EU_TONES,
    sources: 'Forum reports (War Thunder forum "Rafale warning system not having a French voice") say the REAL Rafale\'s voice warnings are in ENGLISH (NATO and export). French is used here because the player asked for each jet\'s national language. French aviation wording: "Remontez" (pull up), "Feu moteur gauche / droit", "Facteur de charge" (G), "Incidence" (AoA).',
  },
  GRIPEN: {
    system: 'Röstvarning (in Swedish, as asked for this game; see sources)',
    nation: 'Sweden',
    lang: 'sv-SE',
    voiceHint: 'hedvig|sofie|female|alva',
    say: { pullUp: 'Dra upp, dra upp', altitude: 'Höjd, höjd', missile: 'Robot, robot', bingo: 'Bingo, bingo', fuelOut: 'Bränsle lågt', overG: 'Överlast', aoa: 'Anfallsvinkel', fire: 'Brand i motor', caution: 'Varning' },
    en: { pullUp: 'Pull up, pull up', altitude: 'Altitude, altitude', missile: 'Missile, missile', bingo: 'Bingo, bingo', fuelOut: 'Fuel low', overG: 'Over G', aoa: 'Angle of attack', fire: 'Engine fire', caution: 'Warning' },
    launch: { radar: 'Fox tre', ir: 'Fox två', bomb: 'Fällning', enRadar: 'Fox three', enIr: 'Fox two', enBomb: 'Pickle' },
    rate: 1.05,
    tones: EU_TONES,
    sources: 'No source found for the Gripen\'s voice language or phrases (export Gripens and NATO interoperability suggest English). Swedish is used here because the player asked for each jet\'s national language; Swedish military words: "robot" (missile), "dra upp" (pull up), "anfallsvinkel" (AoA), "överlast" (over-G). One engine: one fire call.',
  },
  J20: {
    system: '语音告警 (voice warning), a female mid-alto voice chosen by the PLA Air Force\'s aviation medicine institute',
    nation: 'China',
    lang: 'zh-CN',
    voiceHint: 'xiaoxiao|huihui|yaoyao|xiaoyi|female|ting',
    say: {
      // (confirmed: "敌搜索", "敌跟踪" (CCTV, 2020); "拉起" (a J-10 bird-strike recording, per Zhihu); "迎角过大" in a
      // historical voice pack. The others are standard Chinese aviation terms, not confirmed for the J-20.)
      pullUp: '拉起，拉起',
      altitude: '高度，高度',
      missile: '敌导弹，敌导弹',
      rwrLock: '敌跟踪',
      rwrSearch: '敌搜索',
      bingo: '返航油量',
      fuelOut: '燃油不足',
      overG: '过载过大',
      aoa: '迎角过大',
      fire: '发动机起火',
      fireL: '左发起火',
      fireR: '右发起火',
    },
    en: { pullUp: 'Pull up, pull up', altitude: 'Altitude, altitude', missile: 'Enemy missile', rwrLock: 'Enemy tracking', rwrSearch: 'Enemy search', bingo: 'Return fuel', fuelOut: 'Fuel low', overG: 'Over G', aoa: 'Angle of attack too high', fire: 'Engine fire', fireL: 'Left engine fire', fireR: 'Right engine fire' },
    launch: { radar: '发射', ir: '发射', bomb: '投弹', enRadar: 'Launch', enIr: 'Launch', enBomb: 'Bombs away' },
    rate: 1.0,
    tones: CN_TONES,
    sources: 'CCTV (v.cctv.cn, 2020-03-31) "解放军战斗机告警语音曝光：中文女声播报「敌搜索」「敌跟踪」"; Sina Military 2019-05-24 "歼10歼20机载语音告警如何调教而成" (female mid-alto chosen after tests with hundreds of pilots); Zhihu answer on fighter warning voices ("拉起" in a J-10 bird-strike recording; four warning levels, voice from the warning level up); wtliker historical voice pack ("迎角过大").',
  },
  SR71: {
    system: 'No voice warning system: annunciator lights, a master warning light and a horn',
    nation: 'United States',
    lang: 'en-US',
    voiceHint: FEMALE_EN_US,
    say: {},
    en: {},
    launch: US_LAUNCH,
    rate: 1,
    tones: OLD_TONES,
    sources: 'The SR-71 flight manual\'s index (sr-71.org) lists the annunciator panel; no voice warning system on the 1960s Blackbird. Its warnings here are tones only.',
  },
  X15: {
    system: 'No voice warning system: warning lights and tones only',
    nation: 'United States',
    lang: 'en-US',
    voiceHint: FEMALE_EN_US,
    say: {},
    en: {},
    launch: US_LAUNCH,
    rate: 1,
    tones: OLD_TONES,
    sources: 'A 1959 research aircraft, long before cockpit voice warnings (which came with the F-15 and F/A-18 era, per Wikipedia "Voice warning system"). Tones only.',
  },
};

/** the jet's warning set (the US set for anything unknown) */
export function warningSetFor(type: string | undefined): WarningSet {
  return (type && WARNING_SETS[type as AircraftType]) || WARNING_SETS.F15EX;
}

/** the phrase for an event: native when the device can speak the jet's language, English otherwise; null when the jet's system has no such call */
export function warningPhrase(set: WarningSet, ev: WarnEvent, native: boolean): string | null {
  const s = native ? set.say[ev] : set.en[ev];
  return s ?? (native ? null : set.say[ev] ?? null);
}

/** the tone pattern's state at time t (s): on or off, and its frequency */
export function toneAt(p: TonePattern, t: number): { on: boolean; f: number } {
  if (p.rate <= 0) return { on: true, f: p.f[0] };
  const k = Math.floor(t * p.rate);
  return { on: p.pattern[k % p.pattern.length] === '1', f: p.f[k % p.f.length] };
}
