// Game version and release notes. Shown in the main menu ("What's new") and
// mirrored in CHANGELOG.md. Newest release first.

export interface Release {
  version: string;
  date: string;
  title: string;
  notes: string[];
}

export const RELEASES: Release[] = [
  {
    version: '1.7.1',
    date: '2026-09-26',
    title: 'Su-35S complete',
    notes: [
      "The Sukhoi Su-35S is now COMPLETE: physics, handling, looks, cockpit and weapons have all been checked against the real jet's numbers and against the other three jets.",
      "Performance now matches the published figures: top speed Mach 2.25 (measured 2.27), service ceiling 59,060 ft (measured 59,000), about 1,950 NM of range on internal fuel. Mach 0.9 to 1.6 at 30,000 ft in 36 s; climb to 36,000 ft in about a minute.",
      "Aerodynamics tuned to the Flanker: less induced and supersonic drag (it cruises and climbs high the way the real jet does) and a little more maximum lift from its big wing and leading-edge flaps. It turns with the F-15EX and Typhoon on wing alone, 18-19 deg/s sustained and about 23 deg/s instantaneous at mid speeds, and beats them all once thrust vectoring comes in at low speed.",
      "Top-speed limit: every jet now hits a firm barrier just past its rated top speed (the Su-35S used to creep past Mach 2.3). The other jets are unchanged.",
      "Supermanoeuvre mode: when the Su-35S pilot switches on the override (L), the message now reads SUPERMANOEUVRE and the HUD shows SMV · TVC, so you know the 70 deg angle-of-attack envelope and thrust vectoring are open. Switch it off and the jet goes back to its 34 deg limit.",
      "Takeoff and landing: the Su-35S lifts off at about 190 kt (1,600 ft on afterburner, 2,900 ft on dry power), approaches at 160 kt, and the landing indexer is tuned to its 12 deg on-speed angle of attack.",
      "Model fixes: the engine nacelles now slope up toward the tail like the real Flanker, so the nozzles sit at wing level and the tail clears the runway in the landing flare. Ventral fins are shorter and canted, main gear moved to match.",
      "Weapons now hang where they should: every wing pylon sits under the wing at mid-chord (the outer ones used to hang ahead of the leading edge), and the wingtip R-74Ms sit on the tip launch rails.",
      "Cockpit: the OLS-35 sensor ball no longer blocks the bottom of the HUD view (the glareshield hides it, as in the real jet). Checked both 15 in displays, the HUD, and the weapon and stores readouts for the R-77M, R-74M and GSh-30-1.",
      "Checked: no wobble after rolling out of turns, steady aim tracking, clean recovery from 70 deg AoA in about 1.4 s, and fair duels against every jet (roughly even with the Typhoon, a little behind the F-15EX, ahead of the Super Hornet).",
    ],
  },
  {
    version: '1.7.0',
    date: '2026-09-26',
    title: 'Sukhoi Su-35S',
    notes: [
      "New jet: SUKHOI SU-35S. Single-seat, twin-engine, super-manoeuvrable air-superiority fighter: 71.9 ft long, 49 ft span, 19.4 ft tall, 76,059 lb max takeoff weight, two Saturn AL-41F1S afterburning turbofans (32,000 lbf each), Mach 2.25, 59,060 ft ceiling, 1,944 NM range, same G limits and G effects as the other jets.",
      "3D thrust vectoring: the Su-35S's nozzles swivel with the controls, so it keeps full pitch, roll and yaw control at speeds where the other jets run out of air over their control surfaces. Squeeze the G-limiter override (paddle) and it can hold the nose up to 70 degrees angle of attack without departing, for Cobra-style nose pointing and very tight slow-speed turns. Release it and the jet recovers in about a second. AI Su-35 pilots use it too.",
      "Su-35S weapons, for the Su-35S ONLY (no other jet can carry them): R-77M active-radar long-range missile (longest reach in the game, a little easier to decoy than the AIM-120D) and R-74M infrared dogfight missile (canards and thrust vectoring, slightly longer range than the AIM-9X). Keys 2 and 3 pick the IR and radar missile of whatever jet you fly. Plus the 30 mm GSh-30-1 cannon with 150 rounds.",
      "Su-35S sensors: N035 Irbis-E passive electronically scanned X-band radar (longest detection range in the game) and the OLS-35 optical/laser IRST for passive tracking, plus the Khibiny-M EW suite.",
      "Twelve hardpoints and four loadouts: Air Superiority (6x R-77M, 4x R-74M), Max Load (10x R-77M, 2x R-74M), Long Reach (8x R-77M, 2x R-74M) and Dogfight (4x R-77M, 6x R-74M), including missiles between the engines and under the intakes.",
      "High-detail Su-35S model: long drooped nose with the OLS-35 ball, big bubble canopy on a raised spine, blended lifting body with sharp leading-edge extensions, widely spaced engine nacelles with raked intakes, tail booms with straight vertical fins, ventral fins and stabilators, the centre tail 'sting', moving leading-edge flaps, flaperons, rudders and dorsal airbrake, and nozzles you can see swivel in flight. Blue-grey splinter camouflage with red stars, 'ВКС России' and blue or red side numbers.",
      "The Su-35S's afterburner burns BLUE, like the real AL-41F1S, instead of orange.",
      "Su-35S cockpit: two 15-inch MFI-35 wide-screen displays side by side, the PUI-35 control display and a wide-angle HUD, with its own names on the MFD pages.",
      "The Su-35S joins every mode: fly it yourself, or meet it as a bandit in Waves, Duel and 5v5 (bandits still never fly your own type). The TRIAD decoration now needs a kill in all four jets.",
      "AI jets now wear random paint jobs: your wingmen and the bandits in Waves and 5v5 get random wraps, solid colours and finishes (in 5v5 each pilot keeps the same paint all match).",
      "5v5 Team Battle: the clock at the top now counts DOWN from 5:00 when the fight starts, instead of counting up. The HUD also calls out the last 60 seconds.",
    ],
  },
  {
    version: '1.6.0',
    date: '2026-09-26',
    title: 'Black Ice',
    notes: [
      "New wrap: BLACK ICE. A black nose fades into deep glacial teal toward the tail, with faceted ice crystals, smoky teal wisps and glowing cracks that shine faintly even in shadow. It's the first tile in the WRAP list; you can still change its colours, finish and brightness.",
      '5v5 Team Battle: the teams now start closer together (14 NM instead of 24), so more rounds are won by shooting the other team down rather than running out the 5-minute clock.',
      'Faster wrap previews: making a pattern no longer freezes the customize screen for a moment.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-09-26',
    title: 'Jet customization',
    notes: [
      "Jet customization for all three jets: press CUSTOMIZE JET on the main menu to open the new customization screen, just your jet on the turntable and the paint controls.",
      "Paint types: the FACTORY scheme, a SOLID COLOUR (18 colours plus a custom colour picker), or a WRAP.",
      "Eight wraps: Digital, Splinter, Tiger, Hex, Woodland, Arctic, Carbon fibre and Chevron. Each comes with its own colours, and you can change the base and pattern colours.",
      "Finish: Matte, Satin, Gloss or Metallic, plus a BRIGHTNESS slider (50-150%).",
      "Changes preview live on the jet; nothing is saved until you press APPLY. CANCEL (or Esc) puts your saved paint back, RESET TO FACTORY starts over. Switch between the F-15EX, F/A-18E/F and Typhoon with the tabs at the top; each jet keeps its own paint.",
      "Your paint job is on your jet in every mode, and panel lines, roundels, tail codes and weathering stay on top of it.",
      "5v5 Team Battle: a round still going after 5 minutes of fighting now ends and BOTH teams get a point (the time left shows in the HUD). If that puts both teams on the winning score together, the match is a draw.",
    ],
  },
  {
    version: '1.4.0',
    date: '2026-09-26',
    title: '5v5 Team Battle',
    notes: [
      "New game mode: 5v5 TEAM BATTLE. You and four AI wingmen (BLUE) against five AI bandits (RED) over Samos.",
      "Rounds: wipe out the other team to win the round; everyone respawns fully rearmed for the next. First team to 3 round wins takes the match (choose first to 2, 3 or 4).",
      "Your wingmen fly the same AI as the enemy, just on your side: they hunt, bracket, fire AMRAAMs and Sidewinders and defend themselves. Choose mixed wingman jets or all the same as yours.",
      "Bandits only fly the two jets you did not pick. Pick the AI difficulty (Easy to Extreme) and weapons (all, Sidewinders + gun, or guns only).",
      "Spectator: when you're shot down you can watch any jet on either team until the round ends. Click a jet in the list, or use the arrow keys / Tab; right-drag to orbit, wheel to zoom. It moves on to the next jet automatically when the one you're watching goes down.",
      "Free camera: press F while spectating to fly a camera anywhere (WASD, Q/E down/up, Shift faster, right-drag to look).",
      "Scoreboard: round number and score in the top bar, jets left on each side, round banners and voice calls. A round that runs past the time limit is decided by the rules at that time (see later versions).",
      "Logbook: 5v5 match and round record, plus two new decorations: SQUADRON LEADER (win a match) and CLEAN SWEEP (win without losing a round).",
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-26',
    title: 'Auto-Fly',
    notes: [
      "Auto-Fly replaces the old level-off autopilot. Press U to open a small panel, pick a destination (any airfield or the bullseye, or hold your current heading), a speed (300-650 kt) and an altitude (2,000-40,000 ft), then ENGAGE.",
      "The jet flies itself there: it turns onto course, holds your speed with the throttle (afterburner if needed), climbs over any mountains in its path, and circles overhead when it arrives.",
      "The destination becomes your HUD steerpoint, and the HUD shows where Auto-Fly is taking you and how far is left.",
      "Move the stick (or the mouse in mouse-aim) to take control back instantly; press U again to change the destination, speed or altitude, or to disengage.",
      "Steering fix: turns with a bank limit no longer over-pull and slowly climb (AI patrols benefit too).",
    ],
  },
  {
    version: '1.2.1',
    date: '2026-09-26',
    title: 'Smooth roll-outs',
    notes: [
      "Fixed the wobble after turning: when you stopped a turn the jet rocked wing over wing (roll one way, back, and back again). The mouse-aim autopilot now asks for a roll rate matched to what the flight controls can deliver, so the wings settle smoothly.",
      "Fine aim: for the last few degrees near the aim point the jet no longer swings its bank from side to side; it holds the wings steady and uses the rudder for small heading corrections.",
      "Unload to roll: when the jet needs to roll a long way it eases off the G first (like a real pilot), so it rolls quickly instead of fighting its angle-of-attack limit.",
      "Small corrections below the nose are made by easing the stick forward instead of rolling inverted.",
      "Gentler corrections at low speed, where the control surfaces have little authority.",
      "Fixed reversed rudder from v1.2.0: right rudder yaws the nose right again.",
      "The AI pilots use the same autopilot, so they fly smoother too.",
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-26',
    title: 'Realistic flight physics',
    notes: [
      "Flight physics rebuilt: the jets now rotate as real rigid bodies. Pitch, roll and yaw come from aerodynamic moments and the jet's inertia instead of being set directly, so every aircraft has weight, momentum and overshoot.",
      "Per-jet moments of inertia that change with fuel and stores: a jet loaded with wing tanks and missiles is slower to start and stop a roll.",
      "Real stability: pitch stability shifts aft when supersonic (less G available high and fast), the Typhoon is aerodynamically unstable like the real jet and relies on its flight-control computers, weathercock stability fades at extreme angle of attack, plus dihedral effect, adverse yaw and inertial coupling.",
      "Fly-by-wire modelled like modern jets: the control laws compute stabilator, aileron and rudder deflections through rate-limited actuators, with G-onset limiting (about 12 G/s). Response gets sluggish at low speed because the surfaces run out of authority, and crisp at high speed.",
      "Departures are possible: overriding the G-limiter at high angle of attack and low speed can stall the jet, with wing rock and nose slice; release the stick to recover.",
      "Engine failure yaws the jet toward the dead engine; it has to be trimmed out with rudder.",
      "Wind and turbulence: every mission has its own wind that strengthens and veers with height, light chop at altitude, rougher air low over land and rotor turbulence near the mountains. Gusts bump the nose and wings.",
      "Ground effect: the jet floats in the flare and induced drag drops near the runway.",
      "Control surfaces on the 3D models now show what the flight computers are actually doing (trim, damping, turn coordination).",
      "Fixed the F/A-18's vertical stabilizers: both now cant outward 20 degrees symmetrically (the left fin used to lean the wrong way).",
      "F-15EX vertical stabilizers are now perfectly straight (vertical).",
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-26',
    title: 'High-detail aircraft',
    notes: [
      'All three jets rebuilt from scratch: F-15EX Eagle II, F/A-18F Super Hornet and Eurofighter Typhoon (about 150,000 triangles each, up from about 15,000).',
      'Smooth blended fuselages built from real cross-sections: F-15 chines and dorsal hump, Super Hornet LEX blades, Typhoon drooped radome and spine.',
      'Hollow intakes with rounded lips, ducts that darken with depth and engine fans inside: raked F-15 boxes, Super Hornet carets under the LEX, Typhoon "smiling" chin intake with splitter.',
      'Real airfoil wings and tails with rounded tips, cranked and raked planforms, dog-teeth, and separate moving flaps, ailerons, leading-edge flaps, slats, rudders, stabilators and canards.',
      'Engine nozzles with petals, sawtooth exits, burner cans, flame holders and turbine faces.',
      'Detailed landing gear: oleo struts, torque links, drag braces, tyres and hubs, doors, taxi lights; twin nose wheels and launch bar on the Super Hornet.',
      'Pilots in ejection seats visible through the canopy, cockpit wells, glare shields, framed bubble canopies with reflective glass.',
      'Painted liveries: panel lines, rivets, walkways, NO STEP stencils, weathering and exhaust soot, radomes, anti-glare panels, coalition roundels, tail codes, serials and warning markings (F-15EX two-tone grey, Super Hornet tactical greys, Typhoon air-superiority grey).',
      'Speedbrakes modelled per jet: F-15 dorsal panel, Super Hornet LEX spoilers, Typhoon dorsal airbrake.',
      'New AIM-120D, AIM-9X, fuel tank, streamlined pylons and rail launchers.',
      'Detail parts are culled on distant jets, and each jet type is built once and shared, so waves spawn without stutter.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-26',
    title: 'First release',
    notes: [
      'Three aircraft (F-15EX, F/A-18E/F, Typhoon) over a 400 x 400 NM theater: Skye, Capri and Samos, with six airfields, forests and mountains everywhere.',
      'Free Flight, 10-wave combat and 1v1 Duel (Easy / Medium / Hard / Extreme); enemies never fly your type.',
      'Fly-by-wire flight model, fuel system with afterburner burn, G effects (grey-out, tunnel vision, 10-second G-LOC, red-out).',
      'AIM-120D, AIM-9X, guns, flares and chaff; radar, IRST and missiles all blocked by terrain and the curvature of the earth.',
      'AI with patrol, intercept, engage, defensive and terrain-masking behaviour.',
      '3D cockpits with working displays, helmet-mounted cueing, navigation, ILS and graded landings.',
      'Pilot logbook with decorations, mission debrief, track replays, touch controls.',
    ],
  },
];

export const VERSION = RELEASES[0].version;
