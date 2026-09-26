# Changelog

Every update gets a version number and notes here. The same notes are shown
in the game under **WHAT'S NEW** on the main menu.

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
