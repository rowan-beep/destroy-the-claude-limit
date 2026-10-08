// The keys of each space mission: shown in the mission's own help (H / ?) and,
// all together, on the space menu's CONTROLS page.

export type KeyRow = [string, string];

export const SATURN_KEYS: KeyRow[] = [
  ['SPACE', 'Do the highlighted goal: LAUNCH, GO TO THE MOON, LAND ON THE MOON…'],
  ['2 · 3 · 4', 'The other goal buttons'],
  ['AUTO · F', 'Fast forward: skips the waiting and slows down by itself for every burn'],
  ['WARP SLIDER', 'Drag it to any speed from 1× to 10,000×: the clock runs at exactly the speed you set (burns and the air hold it back)'],
  ['W A S D', 'Steer yourself (this switches the autopilot off)'],
  ['Mouse', 'Drag to look around, scroll to zoom'],
  ['M · C', 'Map of your orbit · change camera'],
  ['B B', 'ABORT during the climb: the escape tower saves the crew'],
  ['P', 'Pro controls: every switch of the real rocket'],
  ['ESC', 'Pause'],
];

export const MOONWALK_KEYS: KeyRow[] = [
  ['W A S D', 'walk'],
  ['SHIFT', 'lope (the Apollo bunny hop)'],
  ['SPACE', 'jump'],
  ['E', 'plant the flag · climb aboard'],
  ['V', 'change spacesuit'],
  ['MOUSE', 'drag to look round · scroll to zoom'],
];

export const LAUNCH_KEYS: KeyRow[] = [
  ['SPACE', 'the next step (launch, burns…)'],
  ['F', 'fast forward to the next event'],
  ['1 … 0 · , .', 'time warp (or drag the slider)'],
  ['C', 'camera: follow the rocket or the boosters'],
  ['M', 'the map: the Earth, your track and the orbit ahead (drag to turn it, wheel to zoom)'],
  ['DRAG · WHEEL', 'look around · zoom'],
  ['ESC', 'pause'],
];

export const MARS_KEYS: KeyRow[] = [
  ['SPACE', 'the next step (launch, refuel, injection burn…)'],
  ['F', 'fast forward to the next event'],
  ['1 … 0  ,  .', 'time warp: a speed, or the next mark (or drag the slider)'],
  ['T', 'autopilot on / off'],
  ['W S / A D', 'pitch / yaw (autopilot off)'],
  ['SHIFT / CTRL', 'throttle up / down (autopilot off)'],
  ['M', 'map'],
  ['DRAG · WHEEL', 'look around · zoom'],
  ['ESC', 'pause'],
];

export const ROVER_KEYS: KeyRow[] = [
  ['W / S', 'drive forward / back'],
  ['A / D', 'steer (alone: turn on the spot)'],
  ['SPACE', 'the job at a target (drill, laser, helicopter)'],
  ['1 … 6 · , .', 'time warp (or drag the slider)'],
  ['C', 'camera: chase, orbit, Mastcam'],
  ['DRAG · WHEEL', 'look around · zoom'],
  ['ESC', 'pause'],
];

export const EXPLORER_KEYS: KeyRow[] = [
  ['[ / ]', 'the previous / next world'],
  ['SPACE · 1', 'stop / start the clock'],
  ['2 … 7 · , .', 'time warp (or drag the slider)'],
  ['DRAG · WHEEL', 'turn the view · zoom'],
  ['ESC', 'back to the menu'],
];

/** every mission's keys, for the space menu's CONTROLS page */
export const SPACE_KEY_SECTIONS: [string, KeyRow[]][] = [
  ['SATURN V · APOLLO', SATURN_KEYS],
  ['WALKING ON THE MOON', MOONWALK_KEYS],
  ['CREW DRAGON · ARTEMIS II · FALCON HEAVY', LAUNCH_KEYS],
  ['STARSHIP TO MARS', MARS_KEYS],
  ['MARS LANDING · THE ROVERS', ROVER_KEYS],
  ['SOLAR SYSTEM EXPLORER', EXPLORER_KEYS],
];
