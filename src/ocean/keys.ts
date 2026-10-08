// The ocean's controls, for the in-dive help and the menu's Controls page.
// ('#' rows are section headings.)

export const OCEAN_KEY_SECTIONS: [string, string][][] = [
  [
    ['#', 'DRIVING'],
    ['W / S', 'Thrust ahead / astern'],
    ['A / D', 'Turn left / right'],
    ['← / →', 'Side thrusters'],
    ['R / F', 'Vertical thrusters up / down'],
    ['Z', 'Flood the ballast tanks (heavier: dive)'],
    ['X', 'Blow the tanks (lighter: rise)'],
    ['B', 'Emergency blow: straight to the surface'],
    ['T', 'Hold this depth'],
    ['G', 'Hold this position'],
    [', / .', 'Transit time ×1 / ×2 / ×4 (open water only)'],
  ],
  [
    ['#', 'SURVEY'],
    ['Q', 'Quiet Survey: thrusters quiet, hydrophones listen'],
    ['P', 'Active sonar ping (masks faint sounds for 6 s)'],
    ['O', 'Sonar overlay on / off'],
    ['L', 'Lamps on / off'],
    ['E', 'Use: scan, recover with the arm, dock'],
  ],
  [
    ['#', 'VIEW'],
    ['C', 'Camera: chase / pilot\'s dome'],
    ['Drag', 'Look around · wheel zooms'],
    ['M', 'Chart and Echo Atlas'],
    ['H or ?', 'This help'],
    ['Esc', 'Pause'],
  ],
];
