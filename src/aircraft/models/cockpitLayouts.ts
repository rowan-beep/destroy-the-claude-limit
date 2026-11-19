// Cockpit layouts for the four jets, relative to the design eye point.
//
// Panel coordinates: px across (m, + right), py down the tilted panel face
// from its top edge (m). Displays are mounted on that plane.
//
//  F-15EX Eagle II   one 10x19 in touch-screen Large Area Display (two
//                    portals) under the up-front controller, standby
//                    display left, caution panel right.
//  F/A-18E/F Blk II  two 5x5 in DDIs, the up-front controller display,
//                    an 8x8 in centre MFD, engine/fuel display, standby.
//  F-16C Block 50    two 4x4 in colour MFDs either side of the ICP and its
//                    DED, standby instruments between them, ACES II seat
//                    tilted back 30 degrees.
//  Typhoon           three 6.25 in colour MHDDs, dedicated warning panel
//                    to the right, get-u-home standby display to the left.
//  Su-35S            two 15 in MFI-35 wide-screen displays side by side
//                    with the PUI-35 control display between and below them,
//                    wide-angle IKSh-1M HUD, K-36D-3.5 seat.
//                    HUD at all: the helmet visor carries the symbology.
//  Su-57             two 15 in MFI displays and two small ones below,
//                    wide-angle HUD, K-36D-5 seat.
//  Gripen E          a 19x8 in wide-area touch display (two portals),
//                    wide-angle HUD, Martin-Baker Mk 16 seat.

import type { AircraftType } from '../specs';
import type { DisplayDef } from '../../avionics/avionics';

/** 'hood': a deep box standing out round the screen (the Rafale's head-level display) */
export type BezelKind = 'osb' | 'touch' | 'plain' | 'hood';

export interface DisplayMount {
  def: DisplayDef;
  /** centre on the panel plane */
  px: number;
  py: number;
  /** visible screen size (m) */
  sw: number;
  sh: number;
  bezel: BezelKind;
  /** extra rotation about the vertical axis (angled toward the pilot) */
  yaw?: number;
  /** mount on the glare-shield face instead of the panel */
  onGlare?: boolean;
}

export interface CockpitLayout {
  /** panel top edge distance ahead of / below the eye */
  panelDist: number;
  panelDrop: number;
  panelTilt: number;
  panelHalfWidth: number;
  panelHeight: number;
  /** glare shield top below the eye */
  glareDrop: number;
  /** how far the glare shield lip overhangs toward the pilot */
  glareLip: number;
  hud: { dist: number; halfW: number; top: number; bottom: number; style: 'single' | 'wide' | 'dual' | 'none' | 'hmd' };
  consoleDrop: number;
  displays: DisplayMount[];
  /** colours */
  tub: number;
  panel: number;
  console: number;
  frame: number;
  seat: number;
  /** ejection seat family: ACES II (side handles), Martin-Baker Mk16 / SJU-17 (loop between the knees),
   *  Zvezda K-36 (two-handed loop, red and white), Lockheed SR-1 (D-ring), the X-15's own seat (arm rests) */
  seatKind: 'aces' | 'mk16' | 'sju17' | 'k36' | 'sr1' | 'x15';
  /** name shown on panel placards */
  label: string;
  lockShoot: boolean;
  /** the control stick: between the knees, or a side-stick on the right console (F-16, F-22, Rafale) */
  stick?: 'center' | 'side';
  /** the stick grip: US (B-8 style), Russian (RUS), European, the F-16's side grip, or the 1960s grips */
  grip?: 'us' | 'ru' | 'euro' | 'side' | 'classic';
  /** the colour of the stick and throttle grips (the Rafale's are light grey) */
  gripColor?: number;
  /** how the HUD is built: plain posts, a low-profile HUD's slim posts leaning in, the Typhoon's round
   *  combiner, or a heavy dark Russian frame */
  hudLook?: 'std' | 'lphud' | 'round' | 'heavy';
  /** the panel's outline: the usual one with the knee notch, or the X-15's arched top */
  panelShape?: 'std' | 'arch';
  /** language of the lit legends (master caution, fire) */
  lang?: 'en' | 'ru';
  /** display bezel colour (default near black; the Typhoon's are light grey) */
  bezel?: number;
  /** glare-shield colour (default black rubber) */
  glare?: number;
  /** seat back recline (rad; default 0.14, the F-16's is 30 degrees) */
  seatRecline?: number;
  /** panels of square lit keys on the glare shield either side of the HUD (the Typhoon's) */
  glareKeys?: boolean;
}

const CANVAS_MFD = 512;

export const COCKPIT_LAYOUTS: Record<AircraftType, CockpitLayout> = {
  // one wide touch screen across the panel, a small display over it, a wide-angle HUD
  J20: {
    // From the photos (a J-20-style cockpit shown by AVIC at Zhuhai; J-20 cockpit pages): one big
    // panoramic display across the middle of a dark panel, a narrow portrait display either side of
    // it, a row of keys under it; the up-front panel under a wide HUD; dark grey consoles; centre stick.
    panelDist: 0.63,
    panelDrop: 0.27,
    panelTilt: 0.3,
    panelHalfWidth: 0.41,
    panelHeight: 0.39,
    glareDrop: 0.21,
    glareLip: 0.08,
    hud: { dist: 0.6, halfW: 0.14, top: 0.09, bottom: -0.19, style: 'wide' },
    consoleDrop: 0.5,
    tub: 0x41474c,
    panel: 0x24282b,
    console: 0x2a2f33,
    frame: 0x2c3236,
    seat: 0x3a3c36,
    glare: 0x16181a,
    seatKind: 'k36',
    label: 'J-20B',
    lockShoot: false,
    stick: 'center',
    grip: 'us',
    displays: [
      {
        def: {
          id: 'wad',
          kind: 'lad',
          w: 1024,
          h: 430,
          hz: 8,
          portals: [
            { x: 0, y: 0, w: 512, h: 430, page: 'TSD' },
            { x: 512, y: 0, w: 512, h: 430, page: 'RDR' },
          ],
          slots: [0, 2],
        },
        px: 0,
        py: 0.17,
        sw: 0.46,
        sh: 0.19,
        bezel: 'touch',
      },
      // the narrow portrait displays either side of it
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 512, hz: 15 }, px: -0.33, py: 0.17, sw: 0.06, sh: 0.15, bezel: 'touch', yaw: 0.2 },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 512, hz: 4 }, px: 0.33, py: 0.17, sw: 0.06, sh: 0.15, bezel: 'touch', yaw: -0.2 },
      { def: { id: 'ufc', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.0, sw: 0.1, sh: 0.034, bezel: 'plain', onGlare: true },
    ],
  },
  SU57: {
    // From the photos (a Su-57 cockpit trainer; a layout render): TURQUOISE like the Flankers but
    // cleaner -- two big wide MFIs in black button bezels side by side filling the panel, a smaller
    // display under them in the middle; over them, under the wide HUD, a control panel with a little
    // screen and rows of keys; the standby display top right; Russian legends; short centre stick (RUS
    // grip), twin throttles, the K-36D-5 seat.
    panelDist: 0.64,
    panelDrop: 0.27,
    panelTilt: 0.3,
    panelHalfWidth: 0.42,
    panelHeight: 0.4,
    glareDrop: 0.215,
    glareLip: 0.08,
    hud: { dist: 0.6, halfW: 0.15, top: 0.1, bottom: -0.2, style: 'wide' },
    hudLook: 'heavy',
    consoleDrop: 0.5,
    tub: 0x3f8c90,
    panel: 0x3b8387,
    console: 0x367a7e,
    frame: 0x4d5a5e,
    seat: 0x3a3834,
    glare: 0x2a3033,
    seatKind: 'k36',
    label: 'СУ-57',
    lang: 'ru',
    lockShoot: false,
    stick: 'center',
    grip: 'ru',
    displays: [
      {
        def: { id: 'mfi-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [0] },
        px: -0.16,
        py: 0.16,
        sw: 0.25,
        sh: 0.21,
        bezel: 'osb',
        yaw: 0.06,
      },
      {
        def: { id: 'mfi-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [1] },
        px: 0.16,
        py: 0.16,
        sw: 0.25,
        sh: 0.21,
        bezel: 'osb',
        yaw: -0.06,
      },
      {
        def: { id: 'mfi-c', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'ENG' }], slots: [2] },
        px: 0,
        py: 0.335,
        sw: 0.1,
        sh: 0.1,
        bezel: 'osb',
      },
      // the control panel under the HUD
      { def: { id: 'pui', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.0, sw: 0.1, sh: 0.034, bezel: 'plain', onGlare: true },
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 256, hz: 15 }, px: 0.37, py: 0.07, sw: 0.06, sh: 0.06, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: -0.37, py: 0.32, sw: 0.05, sh: 0.075, bezel: 'plain' },
    ],
  },
  // From the photos (Saab's Gripen E front cockpit): a low-profile HUD -- a thin combiner between two
  // tall slim posts -- standing on the UFC box (keypad and little screen) on the glare shield; under it
  // ONE wide-area display (19x8 in) in a hood with keys round its frame, filling the panel; a small
  // display low on each side panel; grey-blue consoles; centre stick, the single throttle, the Mk16.
  GRIPEN: {
    panelDist: 0.6,
    panelDrop: 0.26,
    panelTilt: 0.3,
    panelHalfWidth: 0.38,
    panelHeight: 0.37,
    glareDrop: 0.205,
    glareLip: 0.08,
    hud: { dist: 0.58, halfW: 0.12, top: 0.09, bottom: -0.15, style: 'single' },
    hudLook: 'lphud',
    consoleDrop: 0.48,
    tub: 0x5d6670,
    panel: 0x2c3036,
    console: 0x4a5560,
    frame: 0x2e3236,
    seat: 0x3d4238,
    seatKind: 'mk16',
    label: 'GRIPEN E',
    lockShoot: false,
    stick: 'center',
    grip: 'euro',
    displays: [
      {
        def: {
          id: 'wad',
          kind: 'lad',
          w: 1024,
          h: 430,
          hz: 8,
          portals: [
            { x: 0, y: 0, w: 512, h: 430, page: 'TSD' },
            { x: 512, y: 0, w: 512, h: 430, page: 'RDR' },
          ],
          slots: [0, 2],
        },
        px: 0,
        py: 0.16,
        sw: 0.48,
        sh: 0.2,
        bezel: 'osb',
      },
      // the UFC on the glare shield under the HUD
      { def: { id: 'ufc', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.0, sw: 0.075, sh: 0.034, bezel: 'plain', onGlare: true },
      // the small side-panel displays, low left and right
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 256, hz: 15 }, px: 0.31, py: 0.32, sw: 0.065, sh: 0.065, bezel: 'plain', yaw: -0.15 },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: -0.31, py: 0.32, sw: 0.055, sh: 0.075, bezel: 'plain', yaw: 0.15 },
    ],
  },
  // From the photos (Boeing's F-15EX front cockpit at dusk, an advanced-cockpit F-15 in flight): a
  // low-profile HUD -- a tall combiner between two slim posts leaning in -- standing on the up-front
  // controller; under it the one big 10x19 in touch LAD across a black panel; the standby display low
  // on the left, a narrow engine / fuel display on the right; dark gull grey tub; centre stick.
  F15EX: {
    panelDist: 0.64,
    panelDrop: 0.27,
    panelTilt: 0.32,
    panelHalfWidth: 0.4,
    panelHeight: 0.4,
    glareDrop: 0.215,
    glareLip: 0.09,
    hud: { dist: 0.62, halfW: 0.12, top: 0.075, bottom: -0.14, style: 'single' },
    hudLook: 'lphud',
    consoleDrop: 0.5,
    tub: 0x4c5156,
    panel: 0x1d1f22,
    console: 0x2b2e31,
    frame: 0x34383c,
    seat: 0x3d4238,
    seatKind: 'aces',
    label: 'F-15EX',
    lockShoot: true,
    stick: 'center',
    grip: 'us',
    displays: [
      {
        def: {
          id: 'lad',
          kind: 'lad',
          w: 1024,
          h: 540,
          hz: 8,
          portals: [
            { x: 0, y: 0, w: 512, h: 540, page: 'TSD' },
            { x: 512, y: 0, w: 512, h: 540, page: 'RDR' },
          ],
          slots: [0, 2],
        },
        px: 0,
        py: 0.2,
        sw: 0.48,
        sh: 0.253,
        bezel: 'touch',
      },
      // the up-front controller: on the glare shield under the HUD, its keypad either side
      { def: { id: 'ufc', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.0, sw: 0.1, sh: 0.034, bezel: 'plain', onGlare: true },
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 256, hz: 15 }, px: -0.335, py: 0.3, sw: 0.07, sh: 0.07, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 512, hz: 4 }, px: 0.335, py: 0.24, sw: 0.055, sh: 0.11, bezel: 'plain' },
    ],
  },
  // From the photos (a Block II Super Hornet front cockpit): under a big black glare-shield hood the
  // left and right DDIs (5x5 in, heavy bezels with buttons all round) with the square touch UFCD
  // between them right under the HUD; below the UFCD the big 8x8 in MPCD; the engine / fuel display
  // low on the left and the round standby instruments (attitude, airspeed, altimeter, climb) low on the
  // right; black panels in a dark gull grey tub; centre stick, twin throttles, the SJU-17 seat.
  FA18EF: {
    panelDist: 0.62,
    panelDrop: 0.27,
    panelTilt: 0.3,
    panelHalfWidth: 0.39,
    panelHeight: 0.42,
    glareDrop: 0.22,
    glareLip: 0.08,
    hud: { dist: 0.58, halfW: 0.12, top: 0.085, bottom: -0.18, style: 'single' },
    consoleDrop: 0.5,
    tub: 0x5c6166,
    panel: 0x1e2023,
    console: 0x232528,
    frame: 0x33373b,
    seat: 0x3a3f36,
    seatKind: 'sju17',
    label: 'F/A-18E/F',
    lockShoot: true,
    stick: 'center',
    grip: 'us',
    displays: [
      {
        def: { id: 'lddi', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [0] },
        px: -0.2,
        py: 0.1,
        sw: 0.127,
        sh: 0.127,
        bezel: 'osb',
        yaw: 0.12,
      },
      {
        def: { id: 'rddi', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'SMS' }], slots: [2] },
        px: 0.2,
        py: 0.1,
        sw: 0.127,
        sh: 0.127,
        bezel: 'osb',
        yaw: -0.12,
      },
      // the UFCD: a square touch display between the DDIs
      { def: { id: 'ufcd', kind: 'ufc', w: 512, h: 384, hz: 4 }, px: 0, py: 0.085, sw: 0.1, sh: 0.075, bezel: 'touch' },
      {
        def: { id: 'amlcd', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [1] },
        px: 0,
        py: 0.27,
        sw: 0.19,
        sh: 0.19,
        bezel: 'osb',
      },
      { def: { id: 'efd', kind: 'efd', w: 256, h: 256, hz: 6 }, px: -0.3, py: 0.285, sw: 0.085, sh: 0.085, bezel: 'plain' },
      // the round standby instruments, low right
      { def: { id: 'adi', kind: 'gauge', gauge: 'adi', w: 256, h: 256, hz: 20 }, px: 0.3, py: 0.25, sw: 0.06, sh: 0.06, bezel: 'plain' },
      { def: { id: 'kias', kind: 'gauge', gauge: 'kias', w: 256, h: 256, hz: 12 }, px: 0.235, py: 0.33, sw: 0.045, sh: 0.045, bezel: 'plain' },
      { def: { id: 'alt', kind: 'gauge', gauge: 'alt', w: 256, h: 256, hz: 12 }, px: 0.3, py: 0.33, sw: 0.045, sh: 0.045, bezel: 'plain' },
      { def: { id: 'vvi', kind: 'gauge', gauge: 'vvi', w: 256, h: 256, hz: 12 }, px: 0.365, py: 0.33, sw: 0.045, sh: 0.045, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: 0.34, py: 0.12, sw: 0.055, sh: 0.085, bezel: 'plain' },
    ],
  },
  // From the photos (an F-16C Block 50 cockpit from above at a show): a narrow centre column -- the
  // HUD on top, the ICP keypad and its DED under it on the glare shield, then the round standby
  // instruments (airspeed, attitude, altimeter, the HSI) stacked down toward the knees -- with the two
  // 4x4 in MFDs set in angled side panels left and right of it. No centre stick: the side-stick on the
  // right console and the throttle on the left; the ACES II seat tilted back 30 degrees; grey tub.
  F16C: {
    panelDist: 0.58,
    panelDrop: 0.25,
    panelTilt: 0.3,
    panelHalfWidth: 0.37,
    panelHeight: 0.36,
    glareDrop: 0.19,
    glareLip: 0.07,
    hud: { dist: 0.52, halfW: 0.095, top: 0.06, bottom: -0.15, style: 'single' },
    consoleDrop: 0.46,
    tub: 0x585d62,
    panel: 0x2b2e32,
    console: 0x2a2d30,
    frame: 0x2b2f32,
    seat: 0x3b3f3a,
    seatKind: 'aces',
    seatRecline: 0.52,
    label: 'F-16C',
    lockShoot: false,
    stick: 'side',
    grip: 'side',
    displays: [
      {
        def: { id: 'mfd-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [0] },
        px: -0.205,
        py: 0.17,
        sw: 0.11,
        sh: 0.11,
        bezel: 'osb',
        yaw: 0.22,
      },
      {
        def: { id: 'mfd-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [1] },
        px: 0.205,
        py: 0.17,
        sw: 0.11,
        sh: 0.11,
        bezel: 'osb',
        yaw: -0.22,
      },
      // the ICP with the DED in it, on the glare shield right under the HUD
      { def: { id: 'ded', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.0, sw: 0.085, sh: 0.03, bezel: 'plain', onGlare: true },
      // the centre column's round standby instruments
      { def: { id: 'kias', kind: 'gauge', gauge: 'kias', w: 256, h: 256, hz: 12 }, px: -0.068, py: 0.075, sw: 0.058, sh: 0.058, bezel: 'plain' },
      { def: { id: 'adi', kind: 'gauge', gauge: 'adi', w: 256, h: 256, hz: 20 }, px: 0, py: 0.08, sw: 0.068, sh: 0.068, bezel: 'plain' },
      { def: { id: 'alt', kind: 'gauge', gauge: 'alt', w: 256, h: 256, hz: 12 }, px: 0.068, py: 0.075, sw: 0.058, sh: 0.058, bezel: 'plain' },
      { def: { id: 'hsi', kind: 'gauge', gauge: 'hdg', w: 256, h: 256, hz: 12 }, px: 0, py: 0.18, sw: 0.075, sh: 0.075, bezel: 'plain' },
      { def: { id: 'vvi', kind: 'gauge', gauge: 'vvi', w: 256, h: 256, hz: 12 }, px: 0.07, py: 0.18, sw: 0.05, sh: 0.05, bezel: 'plain' },
      { def: { id: 'stby', kind: 'standby', w: 256, h: 256, hz: 15 }, px: -0.07, py: 0.18, sw: 0.05, sh: 0.05, bezel: 'plain' },
      { def: { id: 'cwp', kind: 'dwp', w: 256, h: 512, hz: 4 }, px: 0.33, py: 0.17, sw: 0.055, sh: 0.11, bezel: 'plain' },
    ],
  },
  // From the photos (an RAF Typhoon's instrument panel and HUD; the Ninetalis cockpit set): a big ROUND
  // HUD combiner held in a ring; under it the HUD panel; either side on the glare shield a block of
  // square green-lit keys; below, three MHDDs side by side in LIGHT GREY bezels with their keys, on a
  // light grey panel; the dedicated warning panel right, the get-u-home display left; centre stick,
  // twin throttles, the Mk16A seat.
  TYPHOON: {
    panelDist: 0.62,
    panelDrop: 0.265,
    panelTilt: 0.28,
    panelHalfWidth: 0.4,
    panelHeight: 0.38,
    glareDrop: 0.21,
    glareLip: 0.08,
    hud: { dist: 0.58, halfW: 0.13, top: 0.07, bottom: -0.2, style: 'single' },
    hudLook: 'round',
    glareKeys: true,
    consoleDrop: 0.5,
    tub: 0x6b7075,
    panel: 0x8a8f93,
    console: 0x3a3e42,
    frame: 0x3a3e41,
    seat: 0x3f433d,
    bezel: 0x9a9fa3,
    glare: 0x26282b,
    seatKind: 'mk16',
    label: 'EUROFIGHTER',
    lockShoot: false,
    stick: 'center',
    grip: 'euro',
    displays: [
      {
        def: { id: 'mhdd-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [0] },
        px: -0.215,
        py: 0.15,
        sw: 0.15,
        sh: 0.15,
        bezel: 'osb',
        yaw: 0.14,
      },
      {
        def: { id: 'mhdd-c', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [1] },
        px: 0,
        py: 0.165,
        sw: 0.15,
        sh: 0.15,
        bezel: 'osb',
      },
      {
        def: { id: 'mhdd-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'ENG' }], slots: [2] },
        px: 0.215,
        py: 0.15,
        sw: 0.15,
        sh: 0.15,
        bezel: 'osb',
        yaw: -0.14,
      },
      { def: { id: 'dwp', kind: 'dwp', w: 256, h: 512, hz: 4 }, px: 0.36, py: 0.16, sw: 0.055, sh: 0.11, bezel: 'plain' },
      { def: { id: 'guh', kind: 'standby', w: 256, h: 256, hz: 15 }, px: -0.36, py: 0.13, sw: 0.06, sh: 0.06, bezel: 'plain' },
      // the HUD panel under the combiner
      { def: { id: 'ufc', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.0, sw: 0.09, sh: 0.03, bezel: 'plain', onGlare: true },
    ],
  },
  // From the photos (Dassault's Rafale cockpit photo, Omnirole Rafale pages): a wide trapezoid HUD; right
  // under it, in the middle, the HLD -- the head-level collimated display, a tall deep hood standing out
  // of the panel with the picture deep inside it; a lateral touch display either side of it; small
  // control displays outboard left, the standby display outboard right; medium grey panels; NO centre
  // stick: the side-stick on the right console and the throttle on the left, both with chunky light grey
  // grips; the Mk16F seat reclined about 29 degrees.
  RAFALE: {
    panelDist: 0.62,
    panelDrop: 0.27,
    panelTilt: 0.3,
    panelHalfWidth: 0.4,
    panelHeight: 0.38,
    glareDrop: 0.21,
    glareLip: 0.08,
    hud: { dist: 0.6, halfW: 0.13, top: 0.09, bottom: -0.17, style: 'single' },
    hudLook: 'lphud',
    consoleDrop: 0.47,
    tub: 0x5d6266,
    panel: 0x4e5357,
    console: 0x44494d,
    frame: 0x3a3e42,
    seat: 0x3b3f3a,
    seatKind: 'mk16',
    seatRecline: 0.5,
    label: 'RAFALE',
    lockShoot: false,
    stick: 'side',
    grip: 'side',
    gripColor: 0xb9b5aa,
    displays: [
      // the head-level display: deep in its hood in the middle
      {
        def: { id: 'hld', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [1] },
        px: 0,
        py: 0.11,
        sw: 0.15,
        sh: 0.13,
        bezel: 'hood',
      },
      {
        def: { id: 'lat-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [0] },
        px: -0.2,
        py: 0.18,
        sw: 0.13,
        sh: 0.12,
        bezel: 'touch',
        yaw: 0.12,
      },
      {
        def: { id: 'lat-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'ENG' }], slots: [2] },
        px: 0.2,
        py: 0.18,
        sw: 0.13,
        sh: 0.12,
        bezel: 'touch',
        yaw: -0.12,
      },
      { def: { id: 'ufc', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: -0.335, py: 0.21, sw: 0.075, sh: 0.05, bezel: 'plain', yaw: 0.2 },
      { def: { id: 'guh', kind: 'standby', w: 256, h: 256, hz: 15 }, px: 0.34, py: 0.19, sw: 0.065, sh: 0.065, bezel: 'plain', yaw: -0.2 },
      { def: { id: 'dwp', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: 0.34, py: 0.3, sw: 0.05, sh: 0.07, bezel: 'plain', yaw: -0.2 },
    ],
  },
  // From the photos (an F-22 cockpit lit at night from the front; the Air Force Museum's F-22): the
  // ICP -- a block of lit square keys -- right under the HUD on the glare shield with a small up-front
  // display either side of it; below, the 8x8 in PMFD in the middle with a 6.25 in SMFD each side of
  // it, canted in, and a fourth SMFD under the PMFD; dark panels; the side-stick on the right console,
  // twin throttles left; ACES II seat.
  F22: {
    panelDist: 0.62,
    panelDrop: 0.27,
    panelTilt: 0.3,
    panelHalfWidth: 0.4,
    panelHeight: 0.42,
    glareDrop: 0.21,
    glareLip: 0.08,
    hud: { dist: 0.58, halfW: 0.12, top: 0.085, bottom: -0.17, style: 'single' },
    consoleDrop: 0.48,
    tub: 0x484c51,
    panel: 0x1f2124,
    console: 0x26292c,
    frame: 0x30343a,
    seat: 0x3a3e38,
    seatKind: 'aces',
    seatRecline: 0.3,
    label: 'F-22A',
    lockShoot: false,
    stick: 'side',
    grip: 'side',
    displays: [
      {
        def: { id: 'pmfd', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [1] },
        px: 0,
        py: 0.14,
        sw: 0.2,
        sh: 0.2,
        bezel: 'osb',
      },
      {
        def: { id: 'smfd-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [0] },
        px: -0.245,
        py: 0.15,
        sw: 0.155,
        sh: 0.155,
        bezel: 'osb',
        yaw: 0.16,
      },
      {
        def: { id: 'smfd-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'ENG' }], slots: [2] },
        px: 0.245,
        py: 0.15,
        sw: 0.155,
        sh: 0.155,
        bezel: 'osb',
        yaw: -0.16,
      },
      {
        def: { id: 'smfd-c', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'SMS' }], slots: [3] },
        px: 0,
        py: 0.335,
        sw: 0.14,
        sh: 0.14,
        bezel: 'osb',
      },
      // the ICP on the glare shield, its keypad either side; the two UFDs outboard of it
      { def: { id: 'icp', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.0, sw: 0.085, sh: 0.03, bezel: 'plain', onGlare: true },
      { def: { id: 'ufd-l', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: -0.22, py: 0.0, sw: 0.065, sh: 0.05, bezel: 'plain', onGlare: true },
      { def: { id: 'ufd-r', kind: 'standby', w: 256, h: 256, hz: 15 }, px: 0.22, py: 0.0, sw: 0.065, sh: 0.05, bezel: 'plain', onGlare: true },
    ],
  },
  // From the photos (the X-15's instrument panel, 1966; the Air Force Museum's X-15A-2): a PALE
  // powder-blue panel with an ARCHED top; the attitude ball in the middle, flight instruments either
  // side of it, the heading dial under it; the master caution and fire lights over the ball; a column
  // of warning legends on the left; on the right a grid of round black engine and propellant dials.
  // No HUD; the centre stick (and a side controller); the X-15's own seat with arm rests and handgrips.
  X15: {
    panelDist: 0.66,
    panelDrop: 0.3,
    panelTilt: 0.32,
    panelHalfWidth: 0.34,
    panelHeight: 0.42,
    glareDrop: 0.24,
    glareLip: 0.1,
    // no head-up display in 1959: the pilot flew on the round dials
    hud: { dist: 0.6, halfW: 0.12, top: 0.08, bottom: -0.15, style: 'none' },
    consoleDrop: 0.5,
    tub: 0x30343a,
    panel: 0x8fa3ad,
    console: 0x2a2e33,
    frame: 0x1c1e20,
    seat: 0x3a3631,
    glare: 0x1a1c1e,
    seatKind: 'x15',
    panelShape: 'arch',
    label: 'X-15',
    lockShoot: false,
    stick: 'center',
    grip: 'classic',
    displays: [
      { def: { id: 'adi', kind: 'gauge', gauge: 'adi', w: 256, h: 256, hz: 20, bg: '#8fa3ad' }, px: 0, py: 0.115, sw: 0.12, sh: 0.12, bezel: 'plain' },
      { def: { id: 'mach', kind: 'gauge', gauge: 'mach', w: 256, h: 256, hz: 12, bg: '#8fa3ad' }, px: -0.13, py: 0.12, sw: 0.075, sh: 0.075, bezel: 'plain' },
      { def: { id: 'alt', kind: 'gauge', gauge: 'alt', w: 256, h: 256, hz: 12, bg: '#8fa3ad' }, px: 0.13, py: 0.12, sw: 0.075, sh: 0.075, bezel: 'plain' },
      { def: { id: 'hdg', kind: 'gauge', gauge: 'hdg', w: 256, h: 256, hz: 12, bg: '#8fa3ad' }, px: 0, py: 0.26, sw: 0.085, sh: 0.085, bezel: 'plain' },
      { def: { id: 'alpha', kind: 'gauge', gauge: 'alpha', w: 256, h: 256, hz: 12, bg: '#8fa3ad' }, px: -0.24, py: 0.2, sw: 0.065, sh: 0.065, bezel: 'plain' },
      { def: { id: 'vvi', kind: 'gauge', gauge: 'vvi', w: 256, h: 256, hz: 12, bg: '#8fa3ad' }, px: -0.15, py: 0.22, sw: 0.06, sh: 0.06, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 512, hz: 4 }, px: -0.26, py: 0.31, sw: 0.045, sh: 0.09, bezel: 'plain' },
      // the engine and propellant dials, a grid on the right
      { def: { id: 'pc', kind: 'gauge', gauge: 'pc', w: 256, h: 256, hz: 12, bg: '#8fa3ad' }, px: 0.14, py: 0.23, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'prop', kind: 'gauge', gauge: 'prop', w: 256, h: 256, hz: 6, bg: '#8fa3ad' }, px: 0.205, py: 0.23, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'g', kind: 'gauge', gauge: 'g', w: 256, h: 256, hz: 12, bg: '#8fa3ad' }, px: 0.27, py: 0.23, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'kias', kind: 'gauge', gauge: 'kias', w: 256, h: 256, hz: 12, bg: '#8fa3ad' }, px: 0.14, py: 0.3, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'fuel', kind: 'gauge', gauge: 'fuel', w: 256, h: 256, hz: 6, bg: '#8fa3ad' }, px: 0.205, py: 0.3, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'clock', kind: 'gauge', gauge: 'clock', w: 256, h: 256, hz: 1, bg: '#8fa3ad' }, px: 0.27, py: 0.3, sw: 0.055, sh: 0.055, bezel: 'plain' },
    ],
  },
  // From the photos (the front cockpit of 61-7968; the Air Force Museum's SR-71A): ALL ANALOG -- no HUD,
  // no screens -- a black panel packed with round gauges: the big flight-director ADI in the middle with
  // the HSI under it; left of it the triple display indicator (KEAS, Mach, altitude in counters), the
  // airspeed and the altimeter; right of it angle of attack, climb and g; down the right side the two
  // J58s' gauges in pairs (RPM, EGT, nozzle, fuel flow); centre stick, the Lockheed SR-1 seat.
  SR71: {
    panelDist: 0.66,
    panelDrop: 0.3,
    panelTilt: 0.32,
    panelHalfWidth: 0.4,
    panelHeight: 0.42,
    glareDrop: 0.24,
    glareLip: 0.1,
    hud: { dist: 0.6, halfW: 0.12, top: 0.08, bottom: -0.15, style: 'none' },
    consoleDrop: 0.5,
    tub: 0x2a2c2e,
    panel: 0x161819,
    console: 0x1d1f21,
    frame: 0x1c1e20,
    seat: 0x3a3631,
    seatKind: 'sr1',
    label: 'SR-71A',
    lockShoot: false,
    stick: 'center',
    grip: 'classic',
    displays: [
      { def: { id: 'adi', kind: 'gauge', gauge: 'adi', w: 256, h: 256, hz: 20 }, px: 0, py: 0.12, sw: 0.11, sh: 0.11, bezel: 'plain' },
      { def: { id: 'hsi', kind: 'gauge', gauge: 'hdg', w: 256, h: 256, hz: 12 }, px: 0, py: 0.27, sw: 0.1, sh: 0.1, bezel: 'plain' },
      { def: { id: 'tdi', kind: 'gauge', gauge: 'tdi', w: 256, h: 256, hz: 8 }, px: -0.14, py: 0.1, sw: 0.085, sh: 0.085, bezel: 'plain' },
      { def: { id: 'kias', kind: 'gauge', gauge: 'kias', w: 256, h: 256, hz: 12 }, px: -0.14, py: 0.205, sw: 0.065, sh: 0.065, bezel: 'plain' },
      { def: { id: 'alt', kind: 'gauge', gauge: 'alt', w: 256, h: 256, hz: 12 }, px: -0.14, py: 0.295, sw: 0.065, sh: 0.065, bezel: 'plain' },
      { def: { id: 'mach', kind: 'gauge', gauge: 'mach', w: 256, h: 256, hz: 12 }, px: -0.25, py: 0.15, sw: 0.06, sh: 0.06, bezel: 'plain' },
      { def: { id: 'fuel', kind: 'gauge', gauge: 'fuel', w: 256, h: 256, hz: 4 }, px: -0.33, py: 0.15, sw: 0.06, sh: 0.06, bezel: 'plain' },
      { def: { id: 'clock', kind: 'gauge', gauge: 'clock', w: 256, h: 256, hz: 1 }, px: -0.29, py: 0.26, sw: 0.05, sh: 0.05, bezel: 'plain' },
      { def: { id: 'alpha', kind: 'gauge', gauge: 'alpha', w: 256, h: 256, hz: 12 }, px: 0.13, py: 0.09, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'vvi', kind: 'gauge', gauge: 'vvi', w: 256, h: 256, hz: 12 }, px: 0.13, py: 0.175, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'g', kind: 'gauge', gauge: 'g', w: 256, h: 256, hz: 12 }, px: 0.13, py: 0.26, sw: 0.05, sh: 0.05, bezel: 'plain' },
      // the J58s, in pairs down the right side
      { def: { id: 'rpm1', kind: 'gauge', gauge: 'rpm1', w: 256, h: 256, hz: 8 }, px: 0.24, py: 0.09, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'rpm2', kind: 'gauge', gauge: 'rpm2', w: 256, h: 256, hz: 8 }, px: 0.32, py: 0.09, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'egt1', kind: 'gauge', gauge: 'egt1', w: 256, h: 256, hz: 8 }, px: 0.24, py: 0.165, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'egt2', kind: 'gauge', gauge: 'egt2', w: 256, h: 256, hz: 8 }, px: 0.32, py: 0.165, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'noz1', kind: 'gauge', gauge: 'noz1', w: 256, h: 256, hz: 8 }, px: 0.24, py: 0.24, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'noz2', kind: 'gauge', gauge: 'noz2', w: 256, h: 256, hz: 8 }, px: 0.32, py: 0.24, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'ff1', kind: 'gauge', gauge: 'ff1', w: 256, h: 256, hz: 8 }, px: 0.24, py: 0.315, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'ff2', kind: 'gauge', gauge: 'ff2', w: 256, h: 256, hz: 8 }, px: 0.32, py: 0.315, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: -0.33, py: 0.35, sw: 0.045, sh: 0.065, bezel: 'plain' },
    ],
  },
  // From the photos (MiG-31BM front cockpits): TURQUOISE panels, tub and consoles; most of the panel
  // still round black-faced dials -- airspeed, Mach, altitude, the attitude ball and the HSI across
  // the top and down the left, the engine gauges in pairs on the right -- with the BM's two square
  // colour MFIs side by side low in the middle in green-lit button bezels; a small HUD in a heavy dark
  // mount; Russian legends; a tall centre stick (RUS grip), twin throttles, the K-36DM seat.
  MIG31: {
    panelDist: 0.64,
    panelDrop: 0.28,
    panelTilt: 0.3,
    panelHalfWidth: 0.42,
    panelHeight: 0.42,
    glareDrop: 0.22,
    glareLip: 0.09,
    hud: { dist: 0.6, halfW: 0.1, top: 0.06, bottom: -0.15, style: 'single' },
    hudLook: 'heavy',
    consoleDrop: 0.5,
    tub: 0x3f8c90,
    panel: 0x3b8387,
    console: 0x367a7e,
    frame: 0x4d5a5e,
    seat: 0x3b3833,
    glare: 0x23292b,
    seatKind: 'k36',
    label: 'МИГ-31БМ',
    lang: 'ru',
    lockShoot: false,
    stick: 'center',
    grip: 'ru',
    displays: [
      // the BM's two colour MFIs, low in the middle
      {
        def: { id: 'mfi-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [0] },
        px: -0.105,
        py: 0.28,
        sw: 0.135,
        sh: 0.135,
        bezel: 'osb',
      },
      {
        def: { id: 'mfi-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [1] },
        px: 0.105,
        py: 0.28,
        sw: 0.135,
        sh: 0.135,
        bezel: 'osb',
      },
      // flight instruments: across the top and down the left
      { def: { id: 'adi', kind: 'gauge', gauge: 'adi', w: 256, h: 256, hz: 20 }, px: -0.08, py: 0.1, sw: 0.08, sh: 0.08, bezel: 'plain' },
      { def: { id: 'hsi', kind: 'gauge', gauge: 'hdg', w: 256, h: 256, hz: 12 }, px: 0.08, py: 0.1, sw: 0.075, sh: 0.075, bezel: 'plain' },
      { def: { id: 'alt', kind: 'gauge', gauge: 'alt', w: 256, h: 256, hz: 12 }, px: -0.215, py: 0.09, sw: 0.06, sh: 0.06, bezel: 'plain' },
      { def: { id: 'vvi', kind: 'gauge', gauge: 'vvi', w: 256, h: 256, hz: 12 }, px: 0.185, py: 0.09, sw: 0.05, sh: 0.05, bezel: 'plain' },
      { def: { id: 'kias', kind: 'gauge', gauge: 'kias', w: 256, h: 256, hz: 12 }, px: -0.33, py: 0.1, sw: 0.06, sh: 0.06, bezel: 'plain' },
      { def: { id: 'mach', kind: 'gauge', gauge: 'mach', w: 256, h: 256, hz: 12 }, px: -0.33, py: 0.2, sw: 0.06, sh: 0.06, bezel: 'plain' },
      { def: { id: 'g', kind: 'gauge', gauge: 'g', w: 256, h: 256, hz: 12 }, px: -0.33, py: 0.3, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'alpha', kind: 'gauge', gauge: 'alpha', w: 256, h: 256, hz: 12 }, px: -0.235, py: 0.2, sw: 0.05, sh: 0.05, bezel: 'plain' },
      // engines in pairs on the right, fuel under them
      { def: { id: 'rpm1', kind: 'gauge', gauge: 'rpm1', w: 256, h: 256, hz: 8 }, px: 0.275, py: 0.1, sw: 0.05, sh: 0.05, bezel: 'plain' },
      { def: { id: 'rpm2', kind: 'gauge', gauge: 'rpm2', w: 256, h: 256, hz: 8 }, px: 0.345, py: 0.1, sw: 0.05, sh: 0.05, bezel: 'plain' },
      { def: { id: 'egt1', kind: 'gauge', gauge: 'egt1', w: 256, h: 256, hz: 8 }, px: 0.275, py: 0.17, sw: 0.05, sh: 0.05, bezel: 'plain' },
      { def: { id: 'egt2', kind: 'gauge', gauge: 'egt2', w: 256, h: 256, hz: 8 }, px: 0.345, py: 0.17, sw: 0.05, sh: 0.05, bezel: 'plain' },
      { def: { id: 'fuel', kind: 'gauge', gauge: 'fuel', w: 256, h: 256, hz: 4 }, px: 0.31, py: 0.25, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: 0.31, py: 0.34, sw: 0.05, sh: 0.07, bezel: 'plain' },
    ],
  },
  // From the photos (a Su-35S front cockpit close up): the classic Sukhoi TURQUOISE everywhere; two big
  // MFI-35 screens in black bezels with buttons all round, side by side, with a narrow column of small
  // round standby instruments between them; a big HUD in a heavy dark frame with the PUI-35 control
  // panel (keypad and little screen) to its right on the glare shield; light grey glare-shield hood;
  // Russian legends; centre stick with the RUS grip, the K-36D-3.5 seat's red-white loop.
  SU35: {
    panelDist: 0.64,
    panelDrop: 0.27,
    panelTilt: 0.3,
    panelHalfWidth: 0.42,
    panelHeight: 0.4,
    glareDrop: 0.215,
    glareLip: 0.08,
    hud: { dist: 0.6, halfW: 0.13, top: 0.08, bottom: -0.18, style: 'single' },
    hudLook: 'heavy',
    consoleDrop: 0.5,
    tub: 0x3f8c90,
    panel: 0x3b8387,
    console: 0x367a7e,
    frame: 0x5d6a6e,
    seat: 0x3c3a36,
    glare: 0x8d9497,
    seatKind: 'k36',
    label: 'СУ-35С',
    lang: 'ru',
    lockShoot: false,
    stick: 'center',
    grip: 'ru',
    displays: [
      {
        def: { id: 'mfi-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [0] },
        px: -0.19,
        py: 0.17,
        sw: 0.22,
        sh: 0.22,
        bezel: 'osb',
        yaw: 0.08,
      },
      {
        def: { id: 'mfi-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [1] },
        px: 0.19,
        py: 0.17,
        sw: 0.22,
        sh: 0.22,
        bezel: 'osb',
        yaw: -0.08,
      },
      // the PUI-35 to the right of the HUD on the glare shield
      { def: { id: 'pui', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0.27, py: 0.0, sw: 0.08, sh: 0.03, bezel: 'plain', onGlare: true },
      // the standby column between the MFIs
      { def: { id: 'adi', kind: 'gauge', gauge: 'adi', w: 256, h: 256, hz: 20 }, px: 0, py: 0.12, sw: 0.055, sh: 0.055, bezel: 'plain' },
      { def: { id: 'kias', kind: 'gauge', gauge: 'kias', w: 256, h: 256, hz: 12 }, px: 0, py: 0.2, sw: 0.046, sh: 0.046, bezel: 'plain' },
      { def: { id: 'alt', kind: 'gauge', gauge: 'alt', w: 256, h: 256, hz: 12 }, px: 0, py: 0.27, sw: 0.046, sh: 0.046, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: 0.37, py: 0.33, sw: 0.05, sh: 0.075, bezel: 'plain' },
    ],
  },
};

// round gauges are drawn on the panel's own colour, so the corners round each dial disappear into it
for (const L of Object.values(COCKPIT_LAYOUTS))
  for (const d of L.displays) if (d.def.kind === 'gauge' && !d.def.bg) d.def.bg = '#' + L.panel.toString(16).padStart(6, '0');
