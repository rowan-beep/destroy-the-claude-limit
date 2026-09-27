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
//  Typhoon           three 6.25 in colour MHDDs, dedicated warning panel
//                    to the right, get-u-home standby display to the left.
//  Su-35S            two 15 in MFI-35 wide-screen displays side by side
//                    with the PUI-35 control display between and below them,
//                    wide-angle IKSh-1M HUD, K-36D-3.5 seat.

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
  hud: { dist: number; halfW: number; top: number; bottom: number; style: 'single' | 'wide' | 'dual' };
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
    tub: 0x4a5057,
    panel: 0x24272a,
    console: 0x292c2f,
    frame: 0x33373b,
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
    tub: 0x4c5258,
    panel: 0x222527,
    console: 0x272a2d,
    frame: 0x32363a,
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
    tub: 0x3d4247,
    panel: 0x1f2224,
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
    tub: 0x3d4247,
    panel: 0x1f2224,
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
    tub: 0x3d4247,
    panel: 0x1f2224,
    console: 0x232628,
    frame: 0x2d3134,
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
    tub: 0x3f5a63,
    panel: 0x1d2224,
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
