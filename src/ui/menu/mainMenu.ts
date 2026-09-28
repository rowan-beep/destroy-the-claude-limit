// Main menu: aircraft selection (3D hangar), exact specs, loadouts, game
// mode grid and the per-mode setup (1v1 customizer, wave options...).

import { activeMap, MAPS, ROLES } from '../../world/islands';
import { switchMap } from '../../world/maps';
import { WhatsNewModal } from './whatsNew';
import { VERSION } from '../../version';
import { el, clearEl, button } from '../dom';
import { AIRCRAFT_TYPES, AircraftType, SPECS, enemyTypesFor, getSpec } from '../../aircraft/specs';
import { MissionConfig, MODE_INFO, ModeId } from '../../game/mission';
import { FFA_JETS } from '../../game/modes/ffa';
import { DIFFICULTIES, Difficulty } from '../../ai/skill';
import { airfieldsOf } from '../../world/islands';
import { MISSILES } from '../../weapons/weaponSpecs';

const DIFF_TEXT: Record<Difficulty, string> = {
  EASY: 'Conservative, rarely uses afterburner, flies predictable straight lines and gentle arcs. Only shoots with a perfect sustained lock. Never hides behind terrain.',
  MEDIUM: 'Breaks away from missile locks, manages speed near corner velocity, uses afterburner to recover energy in climbs, pulls up to ~6 G.',
  HARD: 'Fights for your six with high yo-yos and scissors, flares and chaff defensively, aggressive afterburner, dives behind mountain ridges to break your radar lock.',
  EXTREME: 'Operates at the absolute limits of the airframe: max-G snapshots, instant switching between gun and AIM-9X, perfect intercept geometry, and it punishes fuel or G-LOC mistakes.',
};

export interface MainMenuCallbacks {
  onFly: (cfg: MissionConfig) => void;
  onSettings: () => void;
  onControls: () => void;
  onLogbook: () => void;
  onSelectJet: (t: AircraftType, loadoutId: string) => void;
  onCustomize: (t: AircraftType) => void;
  onMultiplayer: () => void;
}

export class MainMenu {
  readonly root: HTMLDivElement;
  private jetList!: HTMLElement;
  private specCard!: HTMLElement;
  private caption!: HTMLElement;
  private setup!: HTMLElement;
  private modeGrid!: HTMLElement;
  private loadoutSel!: HTMLSelectElement;
  private hovered: AircraftType | null = null;

  constructor(
    parent: HTMLElement,
    public cfg: MissionConfig,
    private cb: MainMenuCallbacks,
  ) {
    this.root = el('div', 'screen menu-root', parent);
    const header = el('div', 'menu-header', this.root);
    const brand = el('div', 'brand', header);
    el('h1', '', brand, 'TRIAD');
    el('div', 'sub', brand, `AIR COMBAT SIMULATOR · ${activeMap.name} · ${activeMap.sizeNm} × ${activeMap.sizeNm} NM THEATER`);
    const hb = el('div', 'header-buttons', header);
    button('MULTIPLAYER ▸', 'primary', hb, () => cb.onMultiplayer());
    const wn = new WhatsNewModal(document.body);
    button(`v${VERSION} · NOTES`, '', hb, () => wn.show(true));
    button('LOGBOOK', '', hb, () => cb.onLogbook());
    // only pop the notes up if the menu is still on screen (not after FLY was pressed)
    setTimeout(() => {
      if (!this.root.classList.contains('hidden')) wn.showIfNew();
    }, 1200);
    button('CONTROLS', '', hb, () => cb.onControls());
    button('SETTINGS', '', hb, () => cb.onSettings());

    const body = el('div', 'menu-body', this.root);
    // left: aircraft + loadout
    const left = el('div', 'col scroll', body);
    const jc = el('div', 'card', left);
    el('h2', '', jc, 'SELECT AIRCRAFT');
    this.jetList = el('div', 'jet-list', jc);
    const lc = el('div', 'card', left);
    el('h2', '', lc, 'LOADOUT');
    this.loadoutSel = el('select', '', lc);
    this.loadoutSel.addEventListener('change', () => {
      this.cfg.loadoutId = this.loadoutSel.value;
      this.cb.onSelectJet(this.cfg.aircraft, this.cfg.loadoutId);
    });
    el('div', 'note', lc, 'Radar missiles (AIM-120D, R-77M, Meteor) are for long range; heat-seekers (AIM-9X, R-74M, MICA IR) for the dogfight. Tanks add fuel and drag. The F-22A carries everything in internal bays.');
    const pc = el('div', 'card', left);
    el('h2', '', pc, 'PAINT & WRAPS');
    button('CUSTOMIZE JET ▸', 'primary', pc, () => this.cb.onCustomize(this.cfg.aircraft));
    el('div', 'note', pc, 'Solid colours, wrap patterns, finish and brightness for each jet.');

    // centre: hangar caption & fly button
    const centre = el('div', 'hangar-center', body);
    el('div', 'hangar-hint', centre, 'DRAG TO LOOK AROUND · SCROLL TO ZOOM · DOUBLE-CLICK TO RESET');
    this.caption = el('div', 'hangar-caption', centre);
    const fly = el('div', 'fly-row', centre);
    button('FLY ▸', 'primary big', fly, () => this.cb.onFly({ ...this.cfg }));

    // right: specs + mode + setup
    const right = el('div', 'col scroll', body);
    this.renderTheater(el('div', 'card', right));
    this.specCard = el('div', 'card', right);
    const mc = el('div', 'card', right);
    el('h2', '', mc, 'GAME MODE');
    this.modeGrid = el('div', 'mode-grid', mc);
    this.setup = el('div', 'card', right);

    this.renderJets();
    this.renderModes();
    this.selectJet(cfg.aircraft);
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  private renderJets(): void {
    clearEl(this.jetList);
    for (const t of AIRCRAFT_TYPES) {
      const s = SPECS[t];
      const c = el('div', 'jet-card' + (t === this.cfg.aircraft ? ' sel' : ''), this.jetList);
      el('div', 'jn', c, s.shortName.toUpperCase());
      el('div', 'jr', c, s.name);
      const q = el('div', 'jq', c);
      el('span', '', q, `M${s.maxMach.toFixed(1)}`);
      el('span', '', q, `${(s.ceilingFt / 1000).toFixed(0)}K FT`);
      el('span', '', q, `${s.combatRangeNm} NM`);
      el('span', '', q, `${s.crew} CREW`);
      c.addEventListener('mouseenter', () => {
        this.hovered = t;
        this.renderSpecs(t);
      });
      c.addEventListener('mouseleave', () => {
        this.hovered = null;
        this.renderSpecs(this.cfg.aircraft);
      });
      c.addEventListener('click', () => this.selectJet(t));
    }
  }

  selectJet(t: AircraftType): void {
    this.cfg.aircraft = t;
    const s = getSpec(t);
    if (!s.loadouts.find((l) => l.id === this.cfg.loadoutId)) this.cfg.loadoutId = s.loadouts[0].id;
    // the duel opponent can never be the same type as the player
    const enemies = enemyTypesFor(t);
    if (!enemies.includes(this.cfg.enemyType)) this.cfg.enemyType = enemies[0];
    clearEl(this.loadoutSel);
    for (const l of s.loadouts) {
      const o = el('option', '', this.loadoutSel, l.name);
      o.value = l.id;
    }
    this.loadoutSel.value = this.cfg.loadoutId;
    this.renderJets();
    this.renderSpecs(t);
    this.renderCaption(t);
    this.renderSetup();
    this.cb.onSelectJet(t, this.cfg.loadoutId);
  }

  private renderCaption(t: AircraftType): void {
    const s = SPECS[t];
    clearEl(this.caption);
    el('div', 'hn', this.caption, s.name.toUpperCase());
    el('div', 'hd', this.caption, s.description);
  }

  private renderSpecs(t: AircraftType): void {
    const s = SPECS[t];
    clearEl(this.specCard);
    el('h2', '', this.specCard, `${s.shortName.toUpperCase()} — SPECIFICATIONS${this.hovered && this.hovered !== this.cfg.aircraft ? ' (PREVIEW)' : ''}`);
    const tbl = el('table', 'specs', this.specCard);
    const rows: [string, string][] = [
      ['Crew', String(s.crew)],
      ['Length', `${s.lengthFt} ft`],
      ['Wingspan', `${s.wingspanFt} ft`],
      ['Height', `${s.heightFt} ft`],
      ['Max takeoff weight', `${s.maxTakeoffLb.toLocaleString('en-US')} lb`],
      ['Powerplant', s.engineName],
      ['Thrust (each, AB)', `${s.thrustAbLbf.toLocaleString('en-US')} lbf`],
      ['Top speed', `Mach ${s.maxMach}`],
      ['Service ceiling', `${s.ceilingFt.toLocaleString('en-US')} ft`],
      ['Combat range', `${s.combatRangeNm.toLocaleString('en-US')} NM`],
      ['G limit (FBW / override)', `${s.gLimit} / ${s.gOverride} G`],
      ['Hardpoints', `${s.hardpoints}${t === 'F15EX' ? ' (29,000 lb ordnance)' : ''}`],
      ['Max air-to-air missiles', String(s.maxAAM)],
      ['Missiles', `${MISSILES[s.missiles.radar].short}, ${MISSILES[s.missiles.ir].short}${t === 'SU35' ? ' (Su-35S only)' : t === 'RAFALE' ? ' (Rafale only)' : t === 'F22' ? ' (internal bays)' : ''}`],
      ['Cannon', `${s.gun.name} (${s.gun.rounds} rds)`],
      ['Radar', s.radar.name],
      ['Sensors / EW', `${s.irst ? s.irst.name + ' · ' : ''}${s.ew.name}`],
      ['Flight control', s.flightControl],
    ];
    for (const [k, v] of rows) {
      const tr = el('tr', '', tbl);
      el('td', '', tr, k);
      el('td', '', tr, v);
    }
  }

  private renderModes(): void {
    clearEl(this.modeGrid);
    for (const m of ['free', 'waves', 'duel', 'team', 'ffa'] as ModeId[]) {
      const info = MODE_INFO[m];
      const c = el('div', 'mode-card' + (m === this.cfg.mode ? ' sel' : ''), this.modeGrid);
      el('div', 'mt', c, info.title);
      el('div', 'ms', c, info.subtitle.toUpperCase());
      c.addEventListener('click', () => {
        this.cfg.mode = m;
        this.renderModes();
        this.renderSetup();
      });
    }
  }

  private seg<T extends string>(parent: HTMLElement, label: string, options: [T, string][], value: T, onChange: (v: T) => void): void {
    const f = el('div', 'field', parent);
    el('label', '', f, label);
    const row = el('div', 'seg', f);
    for (const [v, text] of options) {
      button(text, 'small' + (v === value ? ' active' : ''), row, () => {
        onChange(v);
        this.renderSetup();
      });
    }
  }

  private difficultySlider(c: HTMLElement): void {
    const cfg = this.cfg;
    const f = el('div', 'field', c);
    el('label', '', f, `AI DIFFICULTY: ${cfg.difficulty}`);
    const r = el('input', '', f);
    r.type = 'range';
    r.min = '0';
    r.max = '3';
    r.step = '1';
    r.value = String(DIFFICULTIES.indexOf(cfg.difficulty));
    const desc = el('div', 'diff-desc', c, DIFF_TEXT[cfg.difficulty]);
    r.addEventListener('input', () => {
      cfg.difficulty = DIFFICULTIES[+r.value];
      (f.firstChild as HTMLElement).textContent = `AI DIFFICULTY: ${cfg.difficulty}`;
      desc.textContent = DIFF_TEXT[cfg.difficulty];
    });
    const labels = el('div', 'diff-row', c);
    for (const d of DIFFICULTIES) el('div', 'note', labels, d);
  }

  /** Map picker: switching saves the choice and reloads with the new theater. */
  private renderTheater(c: HTMLElement): void {
    el('h2', '', c, 'THEATER');
    const grid = el('div', 'map-grid', c);
    for (const m of MAPS) {
      const cur = m.id === activeMap.id;
      const b = el('div', 'map-card' + (cur ? ' sel' : ''), grid);
      el('div', 'mn', b, m.name);
      el('div', 'mp', b, `${m.sizeNm} × ${m.sizeNm} NM · ${m.places}`);
      el('div', 'md', b, m.description);
      if (cur) el('div', 'mc', b, 'CURRENT THEATER');
      else
        b.addEventListener('click', () => {
          b.classList.add('loading');
          (b.querySelector('.mp') as HTMLElement).textContent = 'LOADING THEATER…';
          switchMap(m.id);
        });
    }
  }

  private renderSetup(): void {
    const c = this.setup;
    clearEl(c);
    const cfg = this.cfg;
    const info = MODE_INFO[cfg.mode];
    el('h2', '', c, `${info.title} — SETUP`);
    el('div', 'note', c, info.description);
    el('h3', '', c, 'MISSION');
    const blue = airfieldsOf('blue');
    if (!blue.some((f) => f.id === cfg.freeBase)) cfg.freeBase = blue[0].id;
    if (cfg.mode === 'free' || cfg.mode === 'waves') {
      this.seg(c, 'HOME BASE (BLUE)', blue.map((f) => [f.id, f.name.replace(' AB', '')] as [string, string]), cfg.freeBase, (v) => (cfg.freeBase = v));
    }
    if (cfg.mode === 'free') {
      this.seg(c, 'START', [['runway', 'ON RUNWAY'], ['air', 'IN THE AIR']], cfg.freeStart, (v) => (cfg.freeStart = v));
    } else if (cfg.mode === 'waves') {
      this.seg(c, 'START', [['air', 'IN THE AIR'], ['runway', 'ON RUNWAY']], cfg.waveStart, (v) => (cfg.waveStart = v));
      const f = el('div', 'field', c);
      el('label', '', f, `STARTING WAVE: ${cfg.startWave}`);
      const r = el('input', '', f);
      r.type = 'range';
      r.min = '1';
      r.max = '10';
      r.value = String(cfg.startWave);
      r.addEventListener('input', () => {
        cfg.startWave = +r.value;
        (f.firstChild as HTMLElement).textContent = `STARTING WAVE: ${cfg.startWave}`;
      });
      this.seg(c, 'BETWEEN WAVES', [['on', 'AUTO REARM & REFUEL'], ['off', 'LAND TO REARM']], cfg.autoRearm ? 'on' : 'off', (v) => (cfg.autoRearm = v === 'on'));
      el('div', 'note', c, 'Enemies fly the jets you did not pick. BLUE ground radars (GCI) call bandits, unless they hide low behind terrain.');
    } else if (cfg.mode === 'team') {
      this.seg(c, 'YOUR WINGMEN', [['mixed', 'MIXED JETS'], ['same', `ALL ${SPECS[cfg.aircraft].shortName.toUpperCase()}`]], cfg.teamAllies, (v) => (cfg.teamAllies = v));
      this.difficultySlider(c);
      this.seg(c, 'FIRST TO', [['2', '2 ROUNDS'], ['3', '3 ROUNDS'], ['4', '4 ROUNDS']], String(cfg.teamWins) as '2' | '3' | '4', (v) => (cfg.teamWins = +v));
      this.seg(c, 'WEAPONS', [['all', 'ALL'], ['ir', 'AIM-9X + GUN'], ['guns', 'GUNS ONLY']], cfg.duelRules, (v) => (cfg.duelRules = v));
      el('div', 'note', c, `Bandits fly only the jets you did not pick (${enemyTypesFor(cfg.aircraft).map((t) => SPECS[t].shortName).join(' / ')}). Both teams use the same AI at the chosen difficulty. Shot down? Watch any jet or fly a free camera until the round ends.`);
    } else if (cfg.mode === 'ffa') {
      this.difficultySlider(c);
      this.seg(c, 'OPPONENT JETS', [['mixed', 'MIXED TYPES'], ['same', `ALL ${SPECS[cfg.aircraft].shortName.toUpperCase()}`]], cfg.ffaJets, (v) => (cfg.ffaJets = v));
      this.seg(c, 'MATCH PACE (ZONE SPEED)', [['quick', 'QUICK ~6 MIN'], ['standard', 'STANDARD ~9 MIN'], ['long', 'LONG ~13 MIN']], cfg.ffaPace, (v) => (cfg.ffaPace = v));
      this.seg(c, 'WEAPONS', [['all', 'ALL'], ['ir', 'HEATERS + GUN'], ['guns', 'GUNS ONLY']], cfg.duelRules, (v) => (cfg.duelRules = v));
      el(
        'div',
        'note',
        c,
        `12 jets, you included: ${FFA_JETS - 1} AI pilots with random jets and paint jobs, every one hostile to everyone. No respawns. Stay inside the shrinking zone. Kills refill a missile of each type; the top scorer carries a bounty that everyone can see. Your placing out of 12 is on the scoreboard.`,
      );
    } else {
      const enemies = enemyTypesFor(cfg.aircraft);
      this.seg(c, 'OPPONENT AIRCRAFT', enemies.map((t) => [t, SPECS[t].shortName.toUpperCase()] as [AircraftType, string]), cfg.enemyType, (v) => (cfg.enemyType = v));
      this.difficultySlider(c);
      this.seg(c, 'START', [['air', 'HEAD-ON, 22 NM'], ['samos', `${ROLES.arena.name} RUNWAYS`]], cfg.duelStart, (v) => (cfg.duelStart = v));
      this.seg(c, 'WEAPONS', [['all', 'ALL'], ['ir', 'AIM-9X + GUN'], ['guns', 'GUNS ONLY']], cfg.duelRules, (v) => (cfg.duelRules = v));
    }
    this.seg(
      c,
      'TIME OF DAY',
      [
        ['dawn', 'DAWN'],
        ['morning', 'MORNING'],
        ['noon', 'NOON'],
        ['afternoon', 'AFTERNOON'],
        ['dusk', 'DUSK'],
      ],
      cfg.timeOfDay,
      (v) => (cfg.timeOfDay = v),
    );
  }
}
