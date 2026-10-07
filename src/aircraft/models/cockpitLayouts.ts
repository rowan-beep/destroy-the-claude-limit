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
//  F-35A             one 20x8 in panoramic touch-screen (two portals), no
//                    HUD at all: the helmet visor carries the symbology.
//  Su-57             two 15 in MFI displays and two small ones below,
//                    wide-angle HUD, K-36D-5 seat.
//  Gripen E          a 19x8 in wide-area touch display (two portals),
//                    wide-angle HUD, Martin-Baker Mk 16 seat.

import type { AircraftType } from '../specs';
import type { DisplayDef } from '../../avionics/avionics';

export type BezelKind = 'osb' | 'touch' | 'plain';

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
  /** ejection seat family */
  seatKind: 'aces' | 'mk16' | 'sju17';
  /** name shown on panel placards */
  label: string;
  lockShoot: boolean;
}

const CANVAS_MFD = 512;

export const COCKPIT_LAYOUTS: Record<AircraftType, CockpitLayout> = {
  F35A: {
    panelDist: 0.6,
    panelDrop: 0.26,
    panelTilt: 0.3,
    panelHalfWidth: 0.4,
    panelHeight: 0.38,
    glareDrop: 0.2,
    glareLip: 0.07,
    // no head-up display: the Gen III helmet projects the symbology on the visor
    hud: { dist: 0.58, halfW: 0.14, top: 0.1, bottom: -0.19, style: 'hmd' },
    consoleDrop: 0.5,
    tub: 0x4c5156,
    panel: 0x2c3034,
    console: 0x222528,
    frame: 0x2a2e32,
    seat: 0x3a3e40,
    seatKind: 'mk16',
    label: 'F-35A',
    lockShoot: false,
    displays: [
      {
        def: {
          id: 'pcd',
          kind: 'lad',
          w: 1024,
          h: 410,
          hz: 8,
          portals: [
            { x: 0, y: 0, w: 512, h: 410, page: 'TSD' },
            { x: 512, y: 0, w: 512, h: 410, page: 'RDR' },
          ],
          slots: [0, 2],
        },
        px: 0,
        py: 0.17,
        sw: 0.508,
        sh: 0.203,
        bezel: 'touch',
      },
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 256, hz: 15 }, px: 0, py: 0.33, sw: 0.06, sh: 0.06, bezel: 'plain' },
    ],
  },
  SU57: {
    panelDist: 0.64,
    panelDrop: 0.27,
    panelTilt: 0.3,
    panelHalfWidth: 0.42,
    panelHeight: 0.4,
    glareDrop: 0.215,
    glareLip: 0.08,
    hud: { dist: 0.6, halfW: 0.15, top: 0.1, bottom: -0.2, style: 'wide' },
    consoleDrop: 0.5,
    tub: 0x3a5f6a,
    panel: 0x283034,
    console: 0x24323a,
    frame: 0x2c383e,
    seat: 0x3a3834,
    seatKind: 'mk16',
    label: 'SU-57',
    lockShoot: false,
    displays: [
      {
        def: { id: 'mfi-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [0] },
        px: -0.16,
        py: 0.15,
        sw: 0.25,
        sh: 0.25,
        bezel: 'osb',
        yaw: 0.08,
      },
      {
        def: { id: 'mfi-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [1] },
        px: 0.16,
        py: 0.15,
        sw: 0.25,
        sh: 0.25,
        bezel: 'osb',
        yaw: -0.08,
      },
      {
        def: { id: 'mfi-c', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'ENG' }], slots: [2] },
        px: 0,
        py: 0.33,
        sw: 0.11,
        sh: 0.11,
        bezel: 'osb',
      },
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 256, hz: 15 }, px: -0.36, py: 0.1, sw: 0.065, sh: 0.065, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: 0.37, py: 0.1, sw: 0.055, sh: 0.085, bezel: 'plain' },
    ],
  },
  GRIPEN: {
    panelDist: 0.6,
    panelDrop: 0.26,
    panelTilt: 0.3,
    panelHalfWidth: 0.38,
    panelHeight: 0.37,
    glareDrop: 0.205,
    glareLip: 0.08,
    hud: { dist: 0.57, halfW: 0.14, top: 0.1, bottom: -0.19, style: 'wide' },
    consoleDrop: 0.48,
    tub: 0x585d62,
    panel: 0x303438,
    console: 0x26292c,
    frame: 0x2e3236,
    seat: 0x3d4238,
    seatKind: 'mk16',
    label: 'GRIPEN E',
    lockShoot: false,
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
        py: 0.19,
        sw: 0.48,
        sh: 0.2,
        bezel: 'touch',
      },
      { def: { id: 'ufc', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.045, sw: 0.14, sh: 0.044, bezel: 'plain' },
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 256, hz: 15 }, px: 0.31, py: 0.33, sw: 0.06, sh: 0.06, bezel: 'plain' },
    ],
  },
  F15EX: {
    panelDist: 0.64,
    panelDrop: 0.27,
    panelTilt: 0.32,
    panelHalfWidth: 0.4,
    panelHeight: 0.4,
    glareDrop: 0.215,
    glareLip: 0.09,
    hud: { dist: 0.6, halfW: 0.13, top: 0.095, bottom: -0.19, style: 'wide' },
    consoleDrop: 0.5,
    tub: 0x5f6469,
    panel: 0x4a4e53,
    console: 0x292c2f,
    frame: 0x34383c,
    seat: 0x3d4238,
    seatKind: 'aces',
    label: 'F-15EX',
    lockShoot: true,
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
        py: 0.235,
        sw: 0.46,
        sh: 0.243,
        bezel: 'touch',
      },
      { def: { id: 'ufc', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.055, sw: 0.15, sh: 0.047, bezel: 'plain' },
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 256, hz: 15 }, px: -0.3, py: 0.07, sw: 0.075, sh: 0.075, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: 0.31, py: 0.075, sw: 0.07, sh: 0.105, bezel: 'plain' },
    ],
  },
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
    tub: 0x60656a,
    panel: 0x484c51,
    console: 0x272a2d,
    frame: 0x33373b,
    seat: 0x3a3f36,
    seatKind: 'sju17',
    label: 'F/A-18E/F',
    lockShoot: true,
    displays: [
      {
        def: { id: 'lddi', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [0] },
        px: -0.205,
        py: 0.105,
        sw: 0.127,
        sh: 0.127,
        bezel: 'osb',
        yaw: 0.12,
      },
      {
        def: { id: 'rddi', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'SMS' }], slots: [2] },
        px: 0.205,
        py: 0.105,
        sw: 0.127,
        sh: 0.127,
        bezel: 'osb',
        yaw: -0.12,
      },
      { def: { id: 'ufcd', kind: 'ufc', w: 512, h: 256, hz: 4 }, px: 0, py: 0.075, sw: 0.13, sh: 0.065, bezel: 'plain' },
      {
        def: { id: 'amlcd', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [1] },
        px: 0,
        py: 0.27,
        sw: 0.19,
        sh: 0.19,
        bezel: 'osb',
      },
      { def: { id: 'efd', kind: 'efd', w: 256, h: 256, hz: 6 }, px: -0.3, py: 0.285, sw: 0.085, sh: 0.085, bezel: 'plain' },
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 256, hz: 15 }, px: 0.3, py: 0.285, sw: 0.075, sh: 0.075, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: 0.34, py: 0.1, sw: 0.055, sh: 0.085, bezel: 'plain' },
    ],
  },
  F16C: {
    panelDist: 0.58,
    panelDrop: 0.25,
    panelTilt: 0.3,
    panelHalfWidth: 0.37,
    panelHeight: 0.36,
    glareDrop: 0.19,
    glareLip: 0.07,
    hud: { dist: 0.52, halfW: 0.095, top: 0.06, bottom: -0.15, style: 'single' },
    consoleDrop: 0.48,
    tub: 0x4f5459,
    panel: 0x2f3337,
    console: 0x24272a,
    frame: 0x2b2f32,
    seat: 0x3b3f3a,
    seatKind: 'aces',
    label: 'F-16C',
    lockShoot: false,
    displays: [
      {
        def: { id: 'mfd-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [0] },
        px: -0.2,
        py: 0.16,
        sw: 0.12,
        sh: 0.12,
        bezel: 'osb',
        yaw: 0.12,
      },
      {
        def: { id: 'mfd-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [1] },
        px: 0.2,
        py: 0.16,
        sw: 0.12,
        sh: 0.12,
        bezel: 'osb',
        yaw: -0.12,
      },
      { def: { id: 'ded', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.07, sw: 0.13, sh: 0.04, bezel: 'plain' },
      { def: { id: 'stby', kind: 'standby', w: 256, h: 256, hz: 15 }, px: 0, py: 0.2, sw: 0.075, sh: 0.075, bezel: 'plain' },
      { def: { id: 'cwp', kind: 'dwp', w: 256, h: 512, hz: 4 }, px: 0.33, py: 0.17, sw: 0.055, sh: 0.11, bezel: 'plain' },
    ],
  },
  TYPHOON: {
    panelDist: 0.62,
    panelDrop: 0.265,
    panelTilt: 0.28,
    panelHalfWidth: 0.4,
    panelHeight: 0.38,
    glareDrop: 0.21,
    glareLip: 0.08,
    hud: { dist: 0.58, halfW: 0.14, top: 0.1, bottom: -0.19, style: 'dual' },
    consoleDrop: 0.5,
    tub: 0x52575c,
    panel: 0x33373a,
    console: 0x232628,
    frame: 0x2d3134,
    seat: 0x3f433d,
    seatKind: 'mk16',
    label: 'EUROFIGHTER',
    lockShoot: false,
    displays: [
      {
        def: { id: 'mhdd-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [0] },
        px: -0.215,
        py: 0.14,
        sw: 0.159,
        sh: 0.159,
        bezel: 'osb',
        yaw: 0.14,
      },
      {
        def: { id: 'mhdd-c', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [1] },
        px: 0,
        py: 0.155,
        sw: 0.159,
        sh: 0.159,
        bezel: 'osb',
      },
      {
        def: { id: 'mhdd-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'ENG' }], slots: [2] },
        px: 0.215,
        py: 0.14,
        sw: 0.159,
        sh: 0.159,
        bezel: 'osb',
        yaw: -0.14,
      },
      { def: { id: 'dwp', kind: 'dwp', w: 256, h: 512, hz: 4 }, px: 0.355, py: 0.15, sw: 0.06, sh: 0.12, bezel: 'plain' },
      { def: { id: 'guh', kind: 'standby', w: 256, h: 256, hz: 15 }, px: -0.355, py: 0.12, sw: 0.065, sh: 0.065, bezel: 'plain' },
      { def: { id: 'ufc', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.3, sw: 0.14, sh: 0.044, bezel: 'plain' },
    ],
  },
  RAFALE: {
    panelDist: 0.62,
    panelDrop: 0.265,
    panelTilt: 0.28,
    panelHalfWidth: 0.4,
    panelHeight: 0.38,
    glareDrop: 0.21,
    glareLip: 0.08,
    hud: { dist: 0.58, halfW: 0.14, top: 0.1, bottom: -0.19, style: 'wide' },
    consoleDrop: 0.5,
    tub: 0x52575c,
    panel: 0x323639,
    console: 0x232628,
    frame: 0x2d3134,
    seat: 0x3f433d,
    seatKind: 'mk16',
    label: 'RAFALE',
    lockShoot: false,
    displays: [
      {
        def: { id: 'lat-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [0] },
        px: -0.215,
        py: 0.14,
        sw: 0.159,
        sh: 0.159,
        bezel: 'osb',
        yaw: 0.14,
      },
      {
        def: { id: 'hld', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [1] },
        px: 0,
        py: 0.155,
        sw: 0.159,
        sh: 0.159,
        bezel: 'osb',
      },
      {
        def: { id: 'lat-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'ENG' }], slots: [2] },
        px: 0.215,
        py: 0.14,
        sw: 0.159,
        sh: 0.159,
        bezel: 'osb',
        yaw: -0.14,
      },
      { def: { id: 'dwp', kind: 'dwp', w: 256, h: 512, hz: 4 }, px: 0.355, py: 0.15, sw: 0.06, sh: 0.12, bezel: 'plain' },
      { def: { id: 'guh', kind: 'standby', w: 256, h: 256, hz: 15 }, px: -0.355, py: 0.12, sw: 0.065, sh: 0.065, bezel: 'plain' },
      { def: { id: 'ufc', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.3, sw: 0.14, sh: 0.044, bezel: 'plain' },
    ],
  },  F22: {
    panelDist: 0.62,
    panelDrop: 0.265,
    panelTilt: 0.28,
    panelHalfWidth: 0.4,
    panelHeight: 0.38,
    glareDrop: 0.21,
    glareLip: 0.08,
    hud: { dist: 0.58, halfW: 0.14, top: 0.1, bottom: -0.19, style: 'wide' },
    consoleDrop: 0.5,
    tub: 0x565b60,
    panel: 0x363a3e,
    console: 0x232628,
    frame: 0x2e3236,
    seat: 0x3f433d,
    seatKind: 'mk16',
    label: 'F-22A',
    lockShoot: false,
    displays: [
      {
        def: { id: 'lat-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [0] },
        px: -0.215,
        py: 0.14,
        sw: 0.159,
        sh: 0.159,
        bezel: 'osb',
        yaw: 0.14,
      },
      {
        def: { id: 'hld', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [1] },
        px: 0,
        py: 0.155,
        sw: 0.159,
        sh: 0.159,
        bezel: 'osb',
      },
      {
        def: { id: 'lat-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'ENG' }], slots: [2] },
        px: 0.215,
        py: 0.14,
        sw: 0.159,
        sh: 0.159,
        bezel: 'osb',
        yaw: -0.14,
      },
      { def: { id: 'dwp', kind: 'dwp', w: 256, h: 512, hz: 4 }, px: 0.355, py: 0.15, sw: 0.06, sh: 0.12, bezel: 'plain' },
      { def: { id: 'guh', kind: 'standby', w: 256, h: 256, hz: 15 }, px: -0.355, py: 0.12, sw: 0.065, sh: 0.065, bezel: 'plain' },
      { def: { id: 'ufc', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.3, sw: 0.14, sh: 0.044, bezel: 'plain' },
    ],
  },
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
    panel: 0x1f2225,
    console: 0x24272a,
    frame: 0x1c1e20,
    seat: 0x3a3631,
    seatKind: 'aces',
    label: 'X-15',
    lockShoot: false,
    // 1960s round dials: the attitude ball in the middle, flight instruments around it,
    // the rocket's chamber pressure and propellant on the outboard columns
    displays: [
      { def: { id: 'adi', kind: 'gauge', gauge: 'adi', w: 256, h: 256, hz: 20 }, px: 0, py: 0.125, sw: 0.135, sh: 0.135, bezel: 'plain' },
      { def: { id: 'mach', kind: 'gauge', gauge: 'mach', w: 256, h: 256, hz: 12 }, px: -0.155, py: 0.085, sw: 0.085, sh: 0.085, bezel: 'plain' },
      { def: { id: 'alt', kind: 'gauge', gauge: 'alt', w: 256, h: 256, hz: 12 }, px: 0.155, py: 0.085, sw: 0.085, sh: 0.085, bezel: 'plain' },
      { def: { id: 'alpha', kind: 'gauge', gauge: 'alpha', w: 256, h: 256, hz: 12 }, px: -0.155, py: 0.19, sw: 0.085, sh: 0.085, bezel: 'plain' },
      { def: { id: 'vvi', kind: 'gauge', gauge: 'vvi', w: 256, h: 256, hz: 12 }, px: 0.155, py: 0.19, sw: 0.085, sh: 0.085, bezel: 'plain' },
      { def: { id: 'hdg', kind: 'gauge', gauge: 'hdg', w: 256, h: 256, hz: 12 }, px: 0, py: 0.265, sw: 0.08, sh: 0.08, bezel: 'plain' },
      { def: { id: 'g', kind: 'gauge', gauge: 'g', w: 256, h: 256, hz: 12 }, px: -0.265, py: 0.085, sw: 0.07, sh: 0.07, bezel: 'plain' },
      { def: { id: 'pc', kind: 'gauge', gauge: 'pc', w: 256, h: 256, hz: 12 }, px: -0.265, py: 0.18, sw: 0.07, sh: 0.07, bezel: 'plain' },
      { def: { id: 'prop', kind: 'gauge', gauge: 'prop', w: 256, h: 256, hz: 6 }, px: 0.265, py: 0.085, sw: 0.07, sh: 0.07, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: 0.27, py: 0.19, sw: 0.05, sh: 0.075, bezel: 'plain' },
    ],
  },
  SR71: {
    panelDist: 0.66,
    panelDrop: 0.3,
    panelTilt: 0.32,
    panelHalfWidth: 0.4,
    panelHeight: 0.42,
    glareDrop: 0.24,
    glareLip: 0.1,
    hud: { dist: 0.6, halfW: 0.12, top: 0.08, bottom: -0.15, style: 'single' },
    consoleDrop: 0.5,
    tub: 0x2a2d30,
    panel: 0x1f2225,
    console: 0x24272a,
    frame: 0x1c1e20,
    seat: 0x3a3631,
    seatKind: 'aces',
    label: 'SR-71A',
    lockShoot: false,
    displays: [
      {
        def: { id: 'mfd-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [0] },
        px: -0.21,
        py: 0.15,
        sw: 0.14,
        sh: 0.14,
        bezel: 'osb',
        yaw: 0.12,
      },
      {
        def: { id: 'mfd-c', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'FUEL' }], slots: [1] },
        px: 0,
        py: 0.16,
        sw: 0.14,
        sh: 0.14,
        bezel: 'osb',
      },
      {
        def: { id: 'mfd-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'ENG' }], slots: [2] },
        px: 0.21,
        py: 0.15,
        sw: 0.14,
        sh: 0.14,
        bezel: 'osb',
        yaw: -0.12,
      },
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 256, hz: 15 }, px: -0.36, py: 0.1, sw: 0.065, sh: 0.065, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: 0.36, py: 0.1, sw: 0.055, sh: 0.085, bezel: 'plain' },
    ],
  },
  MIG31: {
    panelDist: 0.64,
    panelDrop: 0.28,
    panelTilt: 0.3,
    panelHalfWidth: 0.42,
    panelHeight: 0.42,
    glareDrop: 0.22,
    glareLip: 0.09,
    hud: { dist: 0.6, halfW: 0.13, top: 0.09, bottom: -0.17, style: 'single' },
    consoleDrop: 0.5,
    tub: 0x3d6b76,
    panel: 0x28393e,
    console: 0x24363c,
    frame: 0x2c3a3f,
    seat: 0x3b3833,
    seatKind: 'mk16',
    label: 'MIG-31BM',
    lockShoot: false,
    displays: [
      {
        def: { id: 'mfi-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [0] },
        px: -0.22,
        py: 0.15,
        sw: 0.15,
        sh: 0.15,
        bezel: 'osb',
        yaw: 0.12,
      },
      {
        def: { id: 'mfi-c', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [1] },
        px: 0,
        py: 0.16,
        sw: 0.15,
        sh: 0.15,
        bezel: 'osb',
      },
      {
        def: { id: 'mfi-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'ENG' }], slots: [2] },
        px: 0.22,
        py: 0.15,
        sw: 0.15,
        sh: 0.15,
        bezel: 'osb',
        yaw: -0.12,
      },
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 256, hz: 15 }, px: -0.37, py: 0.1, sw: 0.065, sh: 0.065, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: 0.37, py: 0.1, sw: 0.055, sh: 0.085, bezel: 'plain' },
      { def: { id: 'pui', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.33, sw: 0.14, sh: 0.044, bezel: 'plain' },
    ],
  },
  SU35: {
    panelDist: 0.64,
    panelDrop: 0.27,
    panelTilt: 0.3,
    panelHalfWidth: 0.42,
    panelHeight: 0.4,
    glareDrop: 0.215,
    glareLip: 0.08,
    hud: { dist: 0.6, halfW: 0.14, top: 0.1, bottom: -0.19, style: 'wide' },
    consoleDrop: 0.5,
    tub: 0x3f6a73,
    panel: 0x2a3336,
    console: 0x26343a,
    frame: 0x2e3a3f,
    seat: 0x3c3a36,
    seatKind: 'mk16',
    label: 'SU-35S',
    lockShoot: false,
    displays: [
      {
        def: { id: 'mfi-l', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'TSD' }], slots: [0] },
        px: -0.16,
        py: 0.16,
        sw: 0.25,
        sh: 0.25,
        bezel: 'osb',
        yaw: 0.08,
      },
      {
        def: { id: 'mfi-r', kind: 'mfd', w: CANVAS_MFD, h: CANVAS_MFD, hz: 8, portals: [{ x: 0, y: 0, w: CANVAS_MFD, h: CANVAS_MFD, page: 'RDR' }], slots: [1] },
        px: 0.16,
        py: 0.16,
        sw: 0.25,
        sh: 0.25,
        bezel: 'osb',
        yaw: -0.08,
      },
      { def: { id: 'pui', kind: 'ufc', w: 512, h: 160, hz: 4 }, px: 0, py: 0.33, sw: 0.14, sh: 0.044, bezel: 'plain' },
      { def: { id: 'sfd', kind: 'standby', w: 256, h: 256, hz: 15 }, px: -0.36, py: 0.1, sw: 0.065, sh: 0.065, bezel: 'plain' },
      { def: { id: 'cau', kind: 'dwp', w: 256, h: 384, hz: 4 }, px: 0.37, py: 0.1, sw: 0.055, sh: 0.085, bezel: 'plain' },
    ],
  },
};
