# Changelog

Every update gets a version number and notes here. The same notes are shown
in the game under **WHAT'S NEW** on the main menu.

## v1.6.0 — Black Ice (2026-09-26)

- New wrap: BLACK ICE. A black nose fades into deep glacial teal toward the tail, with faceted ice crystals, smoky teal wisps and glowing cracks that shine faintly even in shadow. It's the first tile in the WRAP list; you can still change its colours, finish and brightness.
- 5v5 Team Battle: the teams now start closer together (14 NM instead of 24), so more rounds are won by shooting the other team down rather than running out the 5-minute clock.
- Faster wrap previews: making a pattern no longer freezes the customize screen for a moment.

## v1.5.0 — Jet customization (2026-09-26)

- Jet customization for all three jets: press CUSTOMIZE JET on the main menu to open the new customization screen, just your jet on the turntable and the paint controls.
- Paint types: the FACTORY scheme, a SOLID COLOUR (18 colours plus a custom colour picker), or a WRAP.
- Eight wraps: Digital, Splinter, Tiger, Hex, Woodland, Arctic, Carbon fibre and Chevron. Each comes with its own colours, and you can change the base and pattern colours.
- Finish: Matte, Satin, Gloss or Metallic, plus a BRIGHTNESS slider (50-150%).
- Changes preview live on the jet; nothing is saved until you press APPLY. CANCEL (or Esc) puts your saved paint back, RESET TO FACTORY starts over. Switch between the F-15EX, F/A-18E/F and Typhoon with the tabs at the top; each jet keeps its own paint.
- Your paint job is on your jet in every mode, and panel lines, roundels, tail codes and weathering stay on top of it.
- 5v5 Team Battle: a round still going after 5 minutes of fighting now ends and BOTH teams get a point (the time left shows in the HUD). If that puts both teams on the winning score together, the match is a draw.

## v1.4.0 — 5v5 Team Battle (2026-09-26)

- New game mode: 5v5 TEAM BATTLE. You and four AI wingmen (BLUE) against five AI bandits (RED) over Samos.
- Rounds: wipe out the other team to win the round; everyone respawns fully rearmed for the next. First team to 3 round wins takes the match (choose first to 2, 3 or 4).
- Your wingmen fly the same AI as the enemy, just on your side: they hunt, bracket, fire AMRAAMs and Sidewinders and defend themselves. Choose mixed wingman jets or all the same as yours.
- Bandits only fly the two jets you did not pick. Pick the AI difficulty (Easy to Extreme) and weapons (all, Sidewinders + gun, or guns only).
- Spectator: when you're shot down you can watch any jet on either team until the round ends. Click a jet in the list, or use the arrow keys / Tab; right-drag to orbit, wheel to zoom. It moves on to the next jet automatically when the one you're watching goes down.
- Free camera: press F while spectating to fly a camera anywhere (WASD, Q/E down/up, Shift faster, right-drag to look).
- Scoreboard: round number and score in the top bar, jets left on each side, round banners and voice calls. A round nobody finishes in 10 minutes goes to the team with more jets left (a tie replays the round).
- Logbook: 5v5 match and round record, plus two new decorations: SQUADRON LEADER (win a match) and CLEAN SWEEP (win without losing a round).

## v1.3.0 — Auto-Fly (2026-09-26)

- Auto-Fly replaces the old level-off autopilot. Press U to open a small panel, pick a destination (any airfield or the bullseye, or hold your current heading), a speed (300-650 kt) and an altitude (2,000-40,000 ft), then ENGAGE.
- The jet flies itself there: it turns onto course, holds your speed with the throttle (afterburner if needed), climbs over any mountains in its path, and circles overhead when it arrives.
- The destination becomes your HUD steerpoint, and the HUD shows where Auto-Fly is taking you and how far is left.
- Move the stick (or the mouse in mouse-aim) to take control back instantly; press U again to change the destination, speed or altitude, or to disengage.
- Steering fix: turns with a bank limit no longer over-pull and slowly climb (AI patrols benefit too).

## v1.2.1 — Smooth roll-outs (2026-09-26)

- Fixed the wobble after turning: when you stopped a turn the jet rocked wing over wing (roll one way, back, and back again). The mouse-aim autopilot now asks for a roll rate matched to what the flight controls can deliver, so the wings settle smoothly.
- Fine aim: for the last few degrees near the aim point the jet no longer swings its bank from side to side; it holds the wings steady and uses the rudder for small heading corrections.
- Unload to roll: when the jet needs to roll a long way it eases off the G first (like a real pilot), so it rolls quickly instead of fighting its angle-of-attack limit.
- Small corrections below the nose are made by easing the stick forward instead of rolling inverted.
- Gentler corrections at low speed, where the control surfaces have little authority.
- Fixed reversed rudder from v1.2.0: right rudder yaws the nose right again.
- The AI pilots use the same autopilot, so they fly smoother too.

## v1.2.0 — Realistic flight physics (2026-09-26)

- Flight physics rebuilt: the jets now rotate as real rigid bodies. Pitch, roll and yaw come from aerodynamic moments and the jet's inertia instead of being set directly, so every aircraft has weight, momentum and overshoot.
- Per-jet moments of inertia that change with fuel and stores: a jet loaded with wing tanks and missiles is slower to start and stop a roll.
- Real stability: pitch stability shifts aft when supersonic (less G available high and fast), the Typhoon is aerodynamically unstable like the real jet and relies on its flight-control computers, weathercock stability fades at extreme angle of attack, plus dihedral effect, adverse yaw and inertial coupling.
- Fly-by-wire modelled like modern jets: the control laws compute stabilator, aileron and rudder deflections through rate-limited actuators, with G-onset limiting (about 12 G/s). Response gets sluggish at low speed because the surfaces run out of authority, and crisp at high speed.
- Departures are possible: overriding the G-limiter at high angle of attack and low speed can stall the jet, with wing rock and nose slice; release the stick to recover.
- Engine failure yaws the jet toward the dead engine; it has to be trimmed out with rudder.
- Wind and turbulence: every mission has its own wind that strengthens and veers with height, light chop at altitude, rougher air low over land and rotor turbulence near the mountains. Gusts bump the nose and wings.
- Ground effect: the jet floats in the flare and induced drag drops near the runway.
- Control surfaces on the 3D models now show what the flight computers are actually doing (trim, damping, turn coordination).
- Fixed the F/A-18's vertical stabilizers: both now cant outward 20 degrees symmetrically (the left fin used to lean the wrong way).
- F-15EX vertical stabilizers are now perfectly straight (vertical).

## v1.1.0 — High-detail aircraft (2026-09-26)

- All three jets rebuilt from scratch: F-15EX Eagle II, F/A-18F Super Hornet
  and Eurofighter Typhoon (about 150,000 triangles each, up from about 15,000).
- Smooth blended fuselages built from real cross-sections: F-15 chines and
  dorsal hump, Super Hornet LEX blades, Typhoon drooped radome and spine.
- Hollow intakes with rounded lips, ducts that darken with depth and engine
  fans inside: raked F-15 boxes, Super Hornet carets under the LEX, Typhoon
  "smiling" chin intake with splitter.
- Real airfoil wings and tails with rounded tips, cranked and raked planforms,
  dog-teeth, and separate moving flaps, ailerons, leading-edge flaps, slats,
  rudders, stabilators and canards.
- Engine nozzles with petals, sawtooth exits, burner cans, flame holders and
  turbine faces.
- Detailed landing gear: oleo struts, torque links, drag braces, tyres and
  hubs, doors, taxi lights; twin nose wheels and launch bar on the Super Hornet.
- Pilots in ejection seats visible through the canopy, cockpit wells, glare
  shields, framed bubble canopies with reflective glass.
- Painted liveries: panel lines, rivets, walkways, NO STEP stencils,
  weathering and exhaust soot, radomes, anti-glare panels, coalition roundels,
  tail codes, serials and warning markings.
- Speedbrakes modelled per jet: F-15 dorsal panel, Super Hornet LEX spoilers,
  Typhoon dorsal airbrake.
- New AIM-120D, AIM-9X, fuel tank, streamlined pylons and rail launchers.
- Detail parts are culled on distant jets, and each jet type is built once and
  shared, so waves spawn without stutter.

## v1.0.0 — First release (2026-09-26)

- Three aircraft (F-15EX, F/A-18E/F, Typhoon) over a 400 × 400 NM theater:
  Skye, Capri and Samos, with six airfields, forests and mountains everywhere.
- Free Flight, 10-wave combat and 1v1 Duel (Easy / Medium / Hard / Extreme);
  enemies never fly your type.
- Fly-by-wire flight model, fuel system with afterburner burn, G effects
  (grey-out, tunnel vision, 10-second G-LOC, red-out).
- AIM-120D, AIM-9X, guns, flares and chaff; radar, IRST and missiles all
  blocked by terrain and the curvature of the earth.
- AI with patrol, intercept, engage, defensive and terrain-masking behaviour.
- 3D cockpits with working displays, helmet-mounted cueing, navigation, ILS
  and graded landings.
- Pilot logbook with decorations, mission debrief, track replays, touch
  controls.
