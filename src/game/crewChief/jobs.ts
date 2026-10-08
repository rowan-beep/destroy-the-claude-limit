// CREW CHIEF: the work. A jet comes back from a sortie with the pilot's write-ups
// on its forms; each is a job of hands-on steps: find the part, open it up, take
// things off in the right order, torque them back to spec, service the fluids,
// isolate the fault with the tech data, and an engine run to prove it. The numbers
// in the "tech data" here are made for the game (training values), in the units and
// shapes the real books use.

import type { AircraftType, AircraftSpec } from '../../aircraft/specs';
import { SPECS } from '../../aircraft/specs';

/** where on the jet: a point in its own frame (x right, y up from the ground under the gear, z back), and the view in */
export interface Spot {
  x: number;
  y: number;
  z: number;
  /** the camera's direction from the point (x, y, z) and distance */
  dir: [number, number, number];
  dist: number;
  label: string;
}

export type Step =
  | { k: 'pick'; text: string; at: Spot; decoys?: Spot[] }
  | { k: 'fasteners'; text: string; n: number; pattern: 'star' | 'any' | 'row'; remove: boolean; what: string }
  | { k: 'torque'; text: string; lo: number; hi: number; max: number; unit: string; count: number; what: string }
  | { k: 'fill'; text: string; lo: number; hi: number; max: number; unit: string; what: string; start: number }
  | { k: 'search'; text: string; scene: 'leak' | 'nick' | 'crack' | 'tool' | 'chafe'; what: string }
  | { k: 'choose'; text: string; data: string[]; options: string[]; correct: number; why: string }
  | { k: 'measure'; text: string; value: number; unit: string; lo: number; hi: number; gauge: string; ok: string; bad: string }
  | { k: 'wait'; text: string; secs: number }
  | { k: 'run'; text: string; leakCheck: boolean }
  | { k: 'pins'; text: string; spots: Spot[] };

export interface Job {
  id: string;
  /** the pilot's write-up, as written in the forms */
  writeUp: string;
  /** the system (for the forms) */
  system: string;
  /** the corrective action the crew chief signs for */
  action: string;
  steps: Step[];
  /** minutes a good crew takes (for the stars) */
  par: number;
  /** needs an engine run to sign off */
  run?: boolean;
}

const r = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (a: number, b: number) => Math.floor(r(a, b + 1));
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** the jet's geometry, for placing the work */
function geo(t: AircraftType) {
  const s: AircraftSpec = SPECS[t];
  const L = s.length, W = s.span, g = s.gear;
  const twin = s.engines >= 2;
  return {
    s, L, W, g, twin,
    nose: { x: 0, y: g.height + 0.35, z: -L * 0.47 },
    cockpit: { x: 0, y: g.height + 1.15, z: -L * 0.28 },
    intakeR: { x: twin ? W * 0.09 : 0.0, y: g.height + 0.25, z: -L * 0.16 },
    mainL: { x: -g.track, y: 0.55, z: g.main },
    mainR: { x: g.track, y: 0.55, z: g.main },
    noseGear: { x: 0, y: 0.5, z: g.nose },
    engine: { x: twin ? -0.6 : 0, y: g.height + 0.2, z: L * 0.3 },
    nozzle: { x: twin ? -0.6 : 0, y: g.height + 0.2, z: L * 0.47 },
    wingL: { x: -W * 0.32, y: g.height + 0.4, z: L * 0.08 },
    bayL: { x: -0.5, y: g.height - 0.2, z: 0 },
  };
}

const spot = (p: { x: number; y: number; z: number }, label: string, dir: [number, number, number], dist: number): Spot => ({ ...p, label, dir, dist });

// ------------------------------------------------------------------ the jobs

function tyre(t: AircraftType): Job {
  const G = geo(t);
  const side = Math.random() < 0.5 ? 'LEFT' : 'RIGHT';
  const w = side === 'LEFT' ? G.mainL : G.mainR;
  const sx = side === 'LEFT' ? -1 : 1;
  const psi = ri(190, 320);
  return {
    id: 'tyre',
    writeUp: `${side} MAIN TIRE WORN, CORDS SHOWING ON THE TREAD AFTER LANDING.`,
    system: 'LANDING GEAR · WHEEL & TIRE',
    action: `Removed and replaced ${side.toLowerCase()} main wheel and tire assembly. Inflated to ${psi} PSI, axle nut torqued and safetied. Ops checked good.`,
    par: 26,
    steps: [
      { k: 'pick', text: `Find the ${side.toLowerCase()} main wheel and look at the tread.`, at: spot(w, `${side} MAIN WHEEL`, [sx * 0.9, 0.25, -0.4], 3.2), decoys: [spot(side === 'LEFT' ? G.mainR : G.mainL, 'MAIN WHEEL', [0, 0, 0], 3), spot(G.noseGear, 'NOSE WHEEL', [0, 0, 0], 3)] },
      { k: 'choose', text: 'The tread is worn through to the cords. What does the tech data say?', data: ['WHEEL & TIRE · WEAR LIMITS (TRAINING)', 'Tread worn to the bottom of the wear groove: replace at next opportunity.', 'Cords or fabric showing anywhere on the tread: REPLACE before flight.', 'Cuts deeper than 1/4 in. or bulges: replace before flight.'], options: ['Fly it once more: it is within limits', 'Replace the wheel and tire assembly before flight', 'Let some pressure out to flatten the tread'], correct: 1, why: 'Cords showing means the tire is past limits: it is replaced before the jet flies again.' },
      { k: 'pick', text: `Jack the ${side.toLowerCase()} side: place the axle jack under the jack pad.`, at: spot({ x: w.x, y: 0.25, z: w.z + 0.35 }, 'AXLE JACK PAD', [sx * 0.7, 0.2, 0.6], 2.6) },
      { k: 'fill', text: 'Deflate the tire before you touch the axle nut (a tire can burst). Bleed it down to 0 PSI.', lo: 0, hi: 5, max: 320, unit: 'PSI', what: 'TIRE PRESSURE', start: psi },
      { k: 'fasteners', text: 'Remove the hub cap screws.', n: 6, pattern: 'any', remove: true, what: 'HUB CAP SCREWS' },
      { k: 'fasteners', text: 'Remove the cotter pin, then the axle nut. Slide the old wheel off.', n: 1, pattern: 'any', remove: true, what: 'AXLE NUT' },
      { k: 'fasteners', text: 'Fit the new wheel and tire. Run the axle nut on by hand.', n: 1, pattern: 'any', remove: false, what: 'AXLE NUT' },
      { k: 'torque', text: 'Seat the bearing: torque the axle nut while turning the wheel, then back it off.', lo: 140, hi: 160, max: 220, unit: 'FT-LB', count: 1, what: 'AXLE NUT (SEATING)' },
      { k: 'torque', text: 'Final torque, then line up the cotter pin hole.', lo: 40, hi: 50, max: 90, unit: 'FT-LB', count: 1, what: 'AXLE NUT (FINAL)' },
      { k: 'fasteners', text: 'Refit the hub cap: tighten the screws in a cross pattern.', n: 6, pattern: 'star', remove: false, what: 'HUB CAP SCREWS' },
      { k: 'fill', text: `Inflate with nitrogen to ${psi} PSI (±5).`, lo: psi - 5, hi: psi + 5, max: 400, unit: 'PSI', what: 'TIRE PRESSURE · NITROGEN', start: 0 },
    ],
  };
}

function brakes(t: AircraftType): Job {
  const G = geo(t);
  const side = Math.random() < 0.5 ? 'LEFT' : 'RIGHT';
  const w = side === 'LEFT' ? G.mainL : G.mainR;
  const sx = side === 'LEFT' ? -1 : 1;
  const worn = Math.random() < 0.6;
  const pin = worn ? +r(0.0, 0.04).toFixed(3) : +r(0.09, 0.22).toFixed(3);
  return {
    id: 'brakes',
    writeUp: `${side} BRAKE GRABS ON TAXI IN, PEDAL FEELS SOFT.`,
    system: 'LANDING GEAR · BRAKES',
    action: worn ? `Wear pin below limit: replaced ${side.toLowerCase()} brake assembly, bled brakes, ops checked good.` : `Wear pin within limits (${pin} in.). Bled ${side.toLowerCase()} brake for air in the line, ops checked good.`,
    par: worn ? 34 : 14,
    steps: [
      { k: 'pick', text: `Find the ${side.toLowerCase()} brake and its wear indicator pin.`, at: spot({ x: w.x - sx * 0.25, y: 0.5, z: w.z }, 'BRAKE WEAR PIN', [-sx * 0.7, 0.3, 0.5], 2.4) },
      { k: 'measure', text: 'Set the parking brake and measure how far the wear pin stands out of its housing.', value: pin, unit: 'IN', lo: 0.05, hi: 1, gauge: 'WEAR PIN', ok: 'Within limits: the brake stays. (The soft pedal is air in the line.)', bad: 'Below 0.05 in.: the brake is worn out and is replaced.' },
      ...(worn
        ? ([
            { k: 'fasteners', text: 'Remove the brake housing bolts (wheel off first, as for a tire change).', n: 8, pattern: 'any', remove: true, what: 'BRAKE HOUSING BOLTS' },
            { k: 'fasteners', text: 'Fit the new brake stack. Run the bolts in, in a cross pattern.', n: 8, pattern: 'star', remove: false, what: 'BRAKE HOUSING BOLTS' },
            { k: 'torque', text: 'Torque the housing bolts.', lo: 270, hi: 300, max: 400, unit: 'IN-LB', count: 4, what: 'BRAKE HOUSING BOLTS' },
          ] as Step[])
        : []),
      { k: 'fill', text: 'Bleed the brake: open the bleeder and pump until the fluid runs with no bubbles. Stop when the reservoir reads in the green.', lo: 62, hi: 70, max: 100, unit: '%', what: 'HYDRAULIC RESERVOIR', start: 48 },
      { k: 'search', text: 'Check the bleeder valve and lines for leaks after bleeding.', scene: 'leak', what: 'a drip at the bleeder' },
    ],
  };
}

function hydLeak(t: AircraftType): Job {
  const G = geo(t);
  const side = Math.random() < 0.5 ? 'LEFT' : 'RIGHT';
  const w = side === 'LEFT' ? G.mainL : G.mainR;
  const sx = side === 'LEFT' ? -1 : 1;
  const cause = pick(['B-nut', 'O-ring']);
  return {
    id: 'hyd',
    writeUp: `HYDRAULIC FLUID STREAKING ON ${side} MAIN GEAR STRUT AND DOOR AFTER FLIGHT.`,
    system: 'HYDRAULICS',
    action: cause === 'B-nut' ? 'Found loose B-nut at the brake line union: torqued to spec, serviced reservoir, leak checked under pressure. No leaks.' : 'Found a nicked O-ring at the strut fitting: replaced, serviced reservoir, leak checked under pressure. No leaks.',
    par: 30,
    steps: [
      { k: 'pick', text: `Go to the ${side.toLowerCase()} main gear well.`, at: spot({ x: w.x * 0.8, y: 1.0, z: w.z - 0.3 }, 'MAIN GEAR WELL', [sx * 0.6, -0.35, -0.7], 2.6) },
      { k: 'search', text: 'Wipe it down and find where the fluid is coming from: torch along the lines.', scene: 'leak', what: 'the wet fitting' },
      { k: 'choose', text: 'Clean, then pressurise and watch the fitting. What do you see?', data: ['HYDRAULICS · LEAK ISOLATION (TRAINING)', 'Fluid seeps round the threads of the union: check the B-nut torque.', 'Fluid weeps from the joint itself with the nut at torque: replace the O-ring.', 'Any leak under pressure is fixed before flight.'], options: cause === 'B-nut' ? ['Fluid round the threads: the B-nut is loose', 'The fitting is cracked: replace the strut'] : ['Weep from the joint with the nut tight: the O-ring', 'The line is chafed through: replace the whole line'], correct: 0, why: cause === 'B-nut' ? 'A loose B-nut leaks round its threads.' : 'With the nut at torque, a weep from the joint is the O-ring.' },
      ...(cause === 'O-ring' ? ([{ k: 'fasteners', text: 'Back off the B-nut and swap the O-ring (lubricate it with clean fluid).', n: 1, pattern: 'any', remove: true, what: 'B-NUT' }] as Step[]) : []),
      { k: 'torque', text: 'Torque the B-nut.', lo: 135, hi: 150, max: 220, unit: 'IN-LB', count: 1, what: 'B-NUT, 3/8 IN. LINE' },
      { k: 'fill', text: 'Service the hydraulic reservoir to the FULL band.', lo: 88, hi: 96, max: 100, unit: '%', what: 'HYDRAULIC RESERVOIR', start: 61 },
      { k: 'search', text: 'Pressurise the system (3000 PSI) and check the fitting again.', scene: 'leak', what: 'any fresh fluid' },
    ],
  };
}

function oil(t: AircraftType): Job {
  const G = geo(t);
  const eng = G.twin ? pick(['#1', '#2']) : '';
  return {
    id: 'oil',
    writeUp: `ENGINE ${eng} OIL PRESSURE FLUCTUATING IN CRUISE. OIL LEVEL LOW ON POST-FLIGHT.`.replace('  ', ' '),
    system: 'POWERPLANT · LUBRICATION',
    action: `Checked oil level within the window after shutdown, found low. Serviced engine ${eng} oil to full, checked chip detector clean, ops checked on engine run.`.replace('  ', ' '),
    par: 18,
    run: true,
    steps: [
      { k: 'pick', text: `Open the engine ${eng} oil servicing door.`.replace('  ', ' '), at: spot({ x: G.engine.x * 1.6 - 0.4, y: G.engine.y - 0.4, z: G.engine.z - 0.6 }, 'OIL SERVICE DOOR', [-0.8, -0.15, 0.4], 2.4) },
      { k: 'choose', text: 'The engine shut down 25 minutes ago. Can you read the oil level now?', data: ['ENGINE OIL · SERVICING (TRAINING)', 'Check the level within 30 minutes of shutdown: after that, oil drains back into the gearbox and the tank reads falsely low.', 'If over 30 minutes: motor the engine, then check.'], options: ['Yes: it is within 30 minutes', 'No: wait a day for it to settle'], correct: 0, why: 'Within 30 minutes of shutdown the sight gauge reads true.' },
      { k: 'search', text: 'Pull the magnetic chip detector and look for metal.', scene: 'nick', what: 'the chip detector (clean, or fuzz?)' },
      { k: 'fill', text: 'Service the oil to the FULL mark. Do not overfill: it foams.', lo: 92, hi: 100, max: 120, unit: '%', what: 'OIL TANK SIGHT GAUGE', start: 58 },
    ],
  };
}

function birdStrike(t: AircraftType): Job {
  const G = geo(t);
  const nick = +r(0.01, 0.09).toFixed(3);
  const ok = nick <= 0.05;
  return {
    id: 'bird',
    writeUp: 'BIRD STRIKE ON FINAL, RIGHT SIDE. HEARD A THUMP, NO ENGINE INDICATIONS.',
    system: 'POWERPLANT · FOREIGN OBJECT DAMAGE',
    action: ok ? `Inspected intake and borescoped the fan: one nick ${nick} in. on a first-stage blade, within blend limits. Blended, re-inspected, engine run good.` : `Inspected intake and borescoped the fan: nick ${nick} in. on a first-stage blade, beyond blend limits. Engine removed for the shop; spare installed. (Engine change.)`,
    par: ok ? 40 : 75,
    run: true,
    steps: [
      { k: 'pick', text: 'Find the strike: look into the right intake.', at: spot(G.intakeR, 'RIGHT INTAKE', [0.35, 0.15, -0.95], 2.4) },
      { k: 'search', text: 'Torch the intake walls and the fan face for blood, feathers and damage.', scene: 'nick', what: 'the damaged blade' },
      { k: 'measure', text: 'Borescope the blade and measure the nick.', value: nick, unit: 'IN', lo: 0, hi: 0.05, gauge: 'NICK DEPTH', ok: 'Within blend limits: blend it smooth.', bad: 'Beyond limits: the engine comes out.' },
      ...(ok
        ? ([
            { k: 'search', text: 'Blend the nick: stone it to a smooth, wide scallop (no sharp edges left).', scene: 'crack', what: 'any remaining sharp edge' },
          ] as Step[])
        : ([
            { k: 'fasteners', text: 'Disconnect the engine: fuel, hydraulic, electrical, then the mount bolts.', n: 10, pattern: 'row', remove: true, what: 'ENGINE CONNECTIONS & MOUNTS' },
            { k: 'wait', text: 'Roll the engine out on the trailer and the spare in. (Time to brew coffee.)', secs: 6 },
            { k: 'fasteners', text: 'Connect the spare: mounts first, then everything else.', n: 10, pattern: 'row', remove: false, what: 'ENGINE MOUNTS & CONNECTIONS' },
            { k: 'torque', text: 'Torque the engine mount bolts.', lo: 590, hi: 650, max: 900, unit: 'IN-LB', count: 4, what: 'ENGINE MOUNT BOLTS' },
          ] as Step[])),
    ],
  };
}

function radar(t: AircraftType): Job {
  const G = geo(t);
  const code = pick([
    { code: '2A41', fix: 1, txt: 'RF cable or connector at the antenna' },
    { code: '3C07', fix: 2, txt: 'transmitter LRU' },
    { code: '1F12', fix: 0, txt: 'cooling air (ECS) to the radar' },
  ]);
  const options = ['Check the cooling air: the ECS duct and its valve', 'Reseat and inspect the RF connector at the antenna', 'Replace the transmitter LRU'];
  return {
    id: 'radar',
    writeUp: 'RADAR FAILED BIT ON CLIMB OUT, TRACK FILES DROPPED, MSG "RDR DEGD".',
    system: 'AVIONICS · RADAR',
    action: `Ran the radar BIT: fault code ${code.code}. Isolated to the ${code.txt} per fault isolation. ${code.fix === 2 ? 'Replaced the transmitter' : code.fix === 1 ? 'Reseated and cleaned the connector' : 'Found the cooling duct clamp loose, secured it'}. BIT passed.`,
    par: 22,
    steps: [
      { k: 'pick', text: 'Open the nose radome (the radar is behind it).', at: spot(G.nose, 'RADOME', [0.5, 0.2, -0.85], 3.2) },
      { k: 'choose', text: `Run the radar built-in test. It fails with code ${code.code}. Isolate the fault.`, data: ['RADAR · FAULT ISOLATION (TRAINING)', '1F12 · overtemperature: check the cooling air supply first.', '2A41 · loss of RF return: inspect and reseat the antenna RF connector.', '3C07 · low transmitter power: replace the transmitter LRU.'], options, correct: code.fix, why: `${code.code} is the ${code.txt}.` },
      ...(code.fix === 2 ? ([{ k: 'fasteners', text: 'Unlatch the transmitter LRU (the quick-release fasteners) and swap it.', n: 4, pattern: 'any', remove: true, what: 'LRU FASTENERS' }] as Step[]) : []),
      ...(code.fix === 1 ? ([{ k: 'search', text: 'Inspect the connector pins before reseating: find the bent pin.', scene: 'crack', what: 'the bent pin' }] as Step[]) : []),
      ...(code.fix === 0 ? ([{ k: 'search', text: 'Follow the cooling duct back from the radar: find the loose clamp.', scene: 'chafe', what: 'the loose clamp' }] as Step[]) : []),
      { k: 'wait', text: 'Run BIT again.', secs: 3 },
    ],
  };
}

function canopy(t: AircraftType): Job {
  const G = geo(t);
  return {
    id: 'canopy',
    writeUp: 'CANOPY SEAL WOULD NOT INFLATE, CABIN PRESSURE LOW AT ALTITUDE, LOUD WIND NOISE.',
    system: 'ENVIRONMENTAL · CANOPY SEAL',
    action: 'Found the canopy seal chafed through at the aft corner. Replaced the seal, ops checked seal inflation and cabin pressurization good.',
    par: 28,
    steps: [
      { k: 'pick', text: 'Open the canopy (install the canopy strut!) and look at the seal.', at: spot(G.cockpit, 'CANOPY', [0.7, 0.55, 0.2], 2.6) },
      { k: 'search', text: 'Run your hand and torch round the seal: find the damage.', scene: 'chafe', what: 'the chafed spot' },
      { k: 'fasteners', text: 'Remove the seal retainer screws.', n: 12, pattern: 'row', remove: true, what: 'SEAL RETAINER SCREWS' },
      { k: 'fasteners', text: 'Fit the new seal and retainer.', n: 12, pattern: 'row', remove: false, what: 'SEAL RETAINER SCREWS' },
      { k: 'torque', text: 'Torque the retainer screws (lightly: it is a seal).', lo: 18, hi: 22, max: 40, unit: 'IN-LB', count: 3, what: 'RETAINER SCREWS' },
      { k: 'fill', text: 'Ops check: inflate the seal to its pressure.', lo: 17, hi: 21, max: 30, unit: 'PSI', what: 'CANOPY SEAL PRESSURE', start: 0 },
    ],
  };
}

function loCoating(t: AircraftType): Job {
  const G = geo(t);
  return {
    id: 'lo',
    writeUp: 'LO COATING DAMAGE: PEELED STRIP AT THE LEFT WEAPON BAY DOOR EDGE (FOUND ON WALKAROUND).',
    system: 'LOW OBSERVABLES',
    action: 'Removed damaged coating, applied LO tape and caulk to the gap, cured and verified with the reflectance tool. Within signature limits.',
    par: 45,
    steps: [
      { k: 'pick', text: 'Find the damage at the left weapon bay door.', at: spot(G.bayL, 'LEFT WEAPON BAY DOOR', [-0.5, -0.6, 0.4], 2.4) },
      { k: 'search', text: 'Find every edge of the damage (peeled edges trap radar energy).', scene: 'crack', what: 'the lifted edge' },
      { k: 'choose', text: 'How is a gap at a door edge repaired?', data: ['LOW OBSERVABLES · REPAIR (TRAINING)', 'Gaps and seams: fill with conductive caulk, then cover with LO tape.', 'Paint alone does not restore conductivity across a gap.', 'Cure before flight; verify with the reflectance tool.'], options: ['Spray paint over it', 'Conductive caulk, then LO tape over the seam', 'Speed tape'], correct: 1, why: 'The gap needs a conductive fill and the tape over it to keep the surface continuous.' },
      { k: 'wait', text: 'Let the caulk cure (heat lamps on).', secs: 6 },
      { k: 'measure', text: 'Verify with the reflectance tool.', value: +r(-34, -22).toFixed(1), unit: 'DB', lo: -100, hi: -25, gauge: 'REFLECTANCE', ok: 'Within limits.', bad: 'Out of limits: re-do the tape edge.' },
    ],
  };
}

function fuelLeak(t: AircraftType): Job {
  const G = geo(t);
  const sr = t === 'SR71';
  const rate = sr ? ri(25, 60) : pick([ri(3, 8), ri(12, 25), ri(40, 70)]);
  const cls = rate < 10 ? 0 : rate < 30 ? 1 : 2;
  const classes = ['SEEP (under 10 drops/min)', 'HEAVY SEEP (10-30 drops/min)', 'RUNNING LEAK (over 30, or it runs)'];
  return {
    id: 'fuel',
    writeUp: sr ? 'FUEL DRIPPING FROM WING AND FUSELAGE TANKS ON THE RAMP BEFORE ENGINE START.' : 'FUEL DRIPPING FROM LOWER WING SURFACE NEAR THE MAIN GEAR AFTER REFUEL.',
    system: 'FUEL',
    action: sr ? `Measured ${rate} drops/min: normal for the SR-71 on the ground. Its tanks only seal when the airframe heats and expands in flight; the JP-7 is hard to ignite. No action, cleared for flight with drip pans in place.` : cls === 2 ? `Running leak (${rate} drops/min): defueled the tank, replaced the access panel seal, refueled, leak check good.` : `${classes[cls]} (${rate} drops/min) at an access panel: within flight limits away from hot areas, entered in the forms for monitoring.`,
    par: sr ? 10 : cls === 2 ? 50 : 12,
    steps: [
      { k: 'pick', text: 'Find the leak under the wing.', at: spot({ ...G.wingL, y: G.g.height - 0.1 }, 'LOWER WING', [-0.55, -0.35, 0.75], 3.4) },
      { k: 'measure', text: 'Wipe it dry and count the drops for a minute.', value: rate, unit: 'DROPS/MIN', lo: 0, hi: sr ? 999 : 29, gauge: 'LEAK RATE', ok: sr ? 'For an SR-71 that is just how it is on the ground.' : 'Within flight limits.', bad: 'A running leak: grounded until fixed.' },
      { k: 'choose', text: 'Classify the leak.', data: ['FUEL LEAKS · CLASSES (TRAINING)', 'SEEP: under 10 drops a minute.', 'HEAVY SEEP: 10 to 30 drops a minute.', 'RUNNING LEAK: over 30, or it drips continuously: no flight until repaired.', sr ? 'SR-71: tank sealant only seals at operating temperature: ground leakage is normal.' : ''].filter(Boolean), options: classes, correct: cls, why: `${rate} drops a minute is a ${classes[cls].split(' (')[0].toLowerCase()}.` },
      ...(!sr && cls === 2
        ? ([
            { k: 'fill', text: 'Defuel the tank before opening it.', lo: 0, hi: 4, max: 100, unit: '%', what: 'TANK QUANTITY', start: 82 },
            { k: 'fasteners', text: 'Remove the fuel access panel.', n: 14, pattern: 'row', remove: true, what: 'ACCESS PANEL SCREWS' },
            { k: 'fasteners', text: 'New seal, refit the panel.', n: 14, pattern: 'star', remove: false, what: 'ACCESS PANEL SCREWS' },
            { k: 'torque', text: 'Torque the panel screws.', lo: 45, hi: 55, max: 90, unit: 'IN-LB', count: 4, what: 'ACCESS PANEL SCREWS' },
          ] as Step[])
        : []),
    ],
  };
}

function loadMissile(t: AircraftType): Job {
  const G = geo(t);
  return {
    id: 'load',
    writeUp: 'LOAD: CONFIGURE FOR NEXT SORTIE, AIR-TO-AIR LOAD ON THE LEFT WING STATION.',
    system: 'ARMAMENT · WEAPONS LOAD',
    action: 'Loaded the missile on the left wing station, latches checked, stray voltage checked zero, safety pins in place until arming.',
    par: 20,
    steps: [
      { k: 'pick', text: 'Go to the left wing station.', at: spot({ ...G.wingL, y: G.g.height - 0.2 }, 'LEFT WING STATION', [-0.6, -0.2, -0.7], 3.2) },
      { k: 'measure', text: 'Stray voltage check on the station before anything is plugged in.', value: 0, unit: 'V', lo: 0, hi: 0.01, gauge: 'STRAY VOLTAGE', ok: 'Zero: safe to load.', bad: 'Voltage present: stop.' },
      { k: 'fill', text: 'Lift the missile on the jammer (lift truck) until it lines up with the launcher rail.', lo: 96, hi: 100, max: 120, unit: '%', what: 'LIFT HEIGHT', start: 20 },
      { k: 'fasteners', text: 'Slide it on and engage the latches.', n: 2, pattern: 'any', remove: false, what: 'LAUNCHER LATCHES' },
      { k: 'choose', text: 'Before the jet taxis, what stays in the missile?', data: ['ARMAMENT · SAFETY (TRAINING)', 'Safety pins with red streamers stay in every station until the arming crew pulls them at the end of the runway.'], options: ['Nothing: pull everything now', 'The safety pins, until the arming area'], correct: 1, why: 'The pins come out at the arming area, just before takeoff.' },
    ],
  };
}

/** the pre-flight walkaround: every REMOVE BEFORE FLIGHT pin, cover and plug off */
function preflight(t: AircraftType): Job {
  const G = geo(t);
  const all: Spot[] = [
    spot(G.nose, 'PITOT COVER', [0.4, 0.2, -0.9], 3),
    spot(G.intakeR, 'INTAKE COVER', [0.3, 0.1, -0.95], 3),
    spot(G.noseGear, 'NOSE GEAR PIN', [0.6, 0.3, -0.6], 3),
    spot(G.mainL, 'LEFT MAIN GEAR PIN', [-0.7, 0.3, -0.4], 3),
    spot(G.mainR, 'RIGHT MAIN GEAR PIN', [0.7, 0.3, -0.4], 3),
    spot(G.cockpit, 'SEAT SAFETY PIN', [0.6, 0.7, 0.2], 2.6),
    spot(G.nozzle, 'EXHAUST PLUG', [0.4, 0.2, 0.9], 3.2),
  ];
  return {
    id: 'preflight',
    writeUp: 'BEFORE FLIGHT INSPECTION DUE. JET LAUNCHES IN 30 MINUTES.',
    system: 'INSPECTION · BEFORE FLIGHT',
    action: 'Before-flight inspection complete: all covers, plugs and ground safety pins removed and counted, forms reviewed, jet ready.',
    par: 12,
    steps: [
      { k: 'pins', text: 'Walk round the jet and pull every REMOVE BEFORE FLIGHT pin, cover and plug (red streamers). Count them all.', spots: all },
      { k: 'choose', text: `Your count: ${all.length} items pulled. The pin bag tag says ${all.length}. Sign off?`, data: ['BEFORE FLIGHT · GROUND SAFETY (TRAINING)', 'Every streamer item is counted out and counted back into the bag. A missing one is found before the jet moves.'], options: ['Counts match: sign it off', 'Close enough, launch it'], correct: 0, why: 'The count matches: nothing is left on the jet.' },
    ],
  };
}

const ALL: ((t: AircraftType) => Job)[] = [tyre, brakes, hydLeak, oil, birdStrike, radar, canopy, fuelLeak, loadMissile];

/** a jet's write-ups for one visit to the hangar (stealth jets can need coating work; the SR-71 leaks) */
export function makeWorkOrder(t: AircraftType, n: number, allowed?: string[]): Job[] {
  const pool = ALL.slice();
  if (t === 'F22' || t === 'F35A' || t === 'SU57') pool.push(loCoating, loCoating);
  if (t === 'SR71' || t === 'X15') {
    // (no missiles to load on these)
    pool.splice(pool.indexOf(loadMissile), 1);
    if (t === 'SR71') pool.push(fuelLeak, fuelLeak);
  }
  const out: Job[] = [];
  const used = new Set<string>();
  while (out.length < n && pool.length) {
    const f = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const j = f(t);
    if (used.has(j.id) || (allowed && !allowed.includes(j.id))) continue;
    used.add(j.id);
    out.push(j);
  }
  // the walkaround always closes the work order
  out.push(preflight(t));
  return out;
}
