// The loading screen's pictures: twenty cinematic shots of each program, taken in
// the game itself at 2560 × 1440 and kept as separate files next to the page
// (cinematics/<program>/NN.webp), so the page itself stays small and each one is
// only downloaded when it is about to be shown. The first of each is the picker's.

import type { Program } from '../menu/program';

export interface Shot {
  file: string;
  caption: string;
}

export const SHOTS: Record<Program, Shot[]> = {
  air: [
    { file: '01.webp', caption: "F-22A RAPTOR · THE COBRA" },
    { file: '02.webp', caption: "F-15EX EAGLE II · STRAIGHT UP" },
    { file: '03.webp', caption: "SU-57 FELON · WAVE-TOP TURN" },
    { file: '04.webp', caption: "RAFALE · THROUGH THE VAPOUR" },
    { file: '05.webp', caption: "SUPER HORNET · SEVEN G" },
    { file: '06.webp', caption: "TYPHOON · KNIFE EDGE IN THE HILLS" },
    { file: '07.webp', caption: "MIG-31 FOXHOUND · MACH 2.6 AT 67,000 FT" },
    { file: '08.webp', caption: "SR-71 BLACKBIRD · 80,000 FT AT DAWN" },
    { file: '09.webp', caption: "X-15 · CLIMBING OUT OF THE ATMOSPHERE" },
    { file: '10.webp', caption: "F-16C · DIAMOND AT GOLDEN HOUR" },
    { file: '11.webp', caption: "F-15EX · ON THE RUNWAY AT FIRST LIGHT" },
    { file: '12.webp', caption: "F-15EX · UNDER THE STORM" },
    { file: '13.webp', caption: "F-22 VS SU-35S · THE MERGE" },
    { file: '14.webp', caption: "SU-35S · VECTORED THRUST" },
    { file: '15.webp', caption: "EAGLE, TYPHOON, RAFALE · ECHELON AT SUNSET" },
    { file: '16.webp', caption: "AIRSHOW · THE CROWD LINE" },
    { file: '17.webp', caption: "F-35A LIGHTNING II · PULLING UP AT DAWN" },
    { file: '18.webp', caption: "GRIPEN E · NORTHERN FJORD" },
    { file: '19.webp', caption: "SUPER HORNET · ON THE CATAPULT AT SUNSET" },
    { file: '20.webp', caption: "F-35A · IN THE GROOVE" },
  ],
  space: [
    { file: '01.webp', caption: "SATURN V · PAD 39A AT SUNSET" },
    { file: '02.webp', caption: "SATURN V · LIFTOFF" },
    { file: '03.webp', caption: "SATURN V · CLIMBING OUT OF THE AIR" },
    { file: '04.webp', caption: "APOLLO · PARKING ORBIT, 185 KM" },
    { file: '05.webp', caption: "APOLLO · LUNAR ORBIT" },
    { file: '06.webp', caption: "FALCON 9 · CREW DRAGON LIFTOFF" },
    { file: '07.webp', caption: "CREW DRAGON · CLOSING ON THE ISS" },
    { file: '08.webp', caption: "THE ISS · CREW DRAGON DOCKED" },
    { file: '09.webp', caption: "FALCON HEAVY · 27 ENGINES" },
    { file: '10.webp', caption: "FALCON HEAVY · TWIN BOOSTERS COMING HOME" },
    { file: '11.webp', caption: "SLS · ARTEMIS II LIFTOFF" },
    { file: '12.webp', caption: "SLS · BOOSTERS AWAY" },
    { file: '13.webp', caption: "STARSHIP · ON THE TOWER" },
    { file: '14.webp', caption: "STARSHIP · 33 RAPTORS" },
    { file: '15.webp', caption: "MARS 2020 · ENTRY" },
    { file: '16.webp', caption: "MARS 2020 · THE SKY CRANE" },
    { file: '17.webp', caption: "PERSEVERANCE · JEZERO CRATER" },
    { file: '18.webp', caption: "CURIOSITY · BELOW MOUNT SHARP" },
    { file: '19.webp', caption: "SATURN · THE RINGS" },
    { file: '20.webp', caption: "JUPITER · THE GIANT" },
  ],
  // (taken in the game, like the others; none yet: the picker and the loading screen use their gradient)
  ocean: [],
};

export function shotUrl(p: Program, s: Shot): string {
  return `${import.meta.env.BASE_URL}cinematics/${p}/${s.file}`;
}
