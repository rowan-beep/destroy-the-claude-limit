# TRIAD — Air Combat Simulator

A browser combat flight simulator in the spirit of DCS, built with TypeScript and
Three.js. Three aircraft, one 400 × 400 NM theater, and an AI that uses the
terrain against you.

**Aircraft (the only vehicles in the game):**

| | F-15EX Eagle II | F/A-18E/F Super Hornet | Eurofighter Typhoon |
|---|---|---|---|
| Crew | 2 | 2 | 1 |
| Max speed | Mach 2.5 | Mach 1.8 | Mach 2.0 |
| Ceiling | 60,000 ft | 50,000 ft | 55,000 ft |
| Engines | 2 × F110-GE-129 (29,500 lbf AB) | 2 × F414-GE-400 (22,000 lbf AB) | 2 × EJ200 (20,233 lbf AB) |
| MTOW | 81,000 lb | 66,000 lb | 51,800 lb |
| Gun | M61A1 20 mm | M61A2 20 mm | BK-27 27 mm |
| Radar | AN/APG-82(V)1 AESA | AN/APG-79 AESA | CAPTOR-E + PIRATE IRST |

Current version: **v1.2.1** — see [CHANGELOG.md](CHANGELOG.md) (also in the game
under **v1.2.1 · NOTES** on the main menu).

Each jet is a high-detail procedural model (~150k triangles): blended fuselages
built from real cross-sections, hollow intakes with ducts and fans, airfoil
wings and tails with moving control surfaces, petal nozzles with burner cans,
detailed landing gear, seated pilots and painted liveries with panel lines,
rivets, stencils and weathering.

Missiles: AIM-120D AMRAAM (active radar, datalink midcourse, loft) and AIM-9X
(IR, high off-boresight). Countermeasures: flares and chaff.

## Playing

```bash
npm install
npm run dev        # http://localhost:5173
```

Other builds:

```bash
npm run build          # multi-file site in dist/ (what GitHub Pages serves)
npm run build:single   # ONE self-contained HTML file in dist-single/index.html
npm run typecheck
```

`dist-single/index.html` has no external dependencies (fonts fall back to
system fonts offline); you can double-click it and play from disk.

### Game modes

- **Free Flight** — pick a jet and a friendly airbase (runway or air start). No enemies.
- **Waves** — ten escalating waves. Waves 1–3: 3 basic jets. 4–6: 6 tactical jets
  that defend properly and terrain-mask. 7–9: 6 aggressive jets with mid-range
  AIM-120D shots. Wave 10: 9 elite jets with coordinated multi-ship targeting.
- **1v1 Duel** — choose your jet, your opponent (one of the two you did not pick)
  and the difficulty (Easy / Medium / Hard / Extreme). Start head-on over Samos, or
  on opposite Samos runways with the mountain between you. Rules: all weapons,
  Sidewinders + guns, or guns only.

Enemy AI is never the same type as the player's jet.

### The theater

400 × 400 NM of sea with three islands, all covered in forest and hills (no grass):

- **Skye** (blue) — steep mountains, sea lochs, coastal cliffs. Dunvegan AB, Broadford AB.
- **Capri** (red) — compact, rocky limestone crags, blue grottoes. Anacapri AB, Marina Grande AB.
- **Samos** (split) — high pine-covered hills and pebble beaches, with a great N–S
  ridge. Karlovasi AB (blue, west) and Vathy AB (red, east) cannot see each other.

Radar, IRST, ground radars and missile seekers all need real line of sight:
terrain and the curvature of the earth block them, so you can hide in sea lochs or
behind the Samos ridge, and so can the AI.

### Controls (defaults, rebindable in CONTROLS)

| Key | Action | Key | Action |
|---|---|---|---|
| Mouse | Aim (mouse-aim mode) | LMB / Space | Fire |
| W / S | Pitch down / up | A / D | Roll |
| Q / E | Rudder | Shift / Z | Throttle up / down |
| Tab | Afterburner | 1 / 2 / 3 | Gun / AIM-9X / AIM-120D |
| R / T | Lock / unlock | Y | Radar mode |
| I | IRST (Typhoon) | C / V | Flares / chaff |
| G | Gear | B | Speedbrake |
| N | Wheel brakes | L | G-limiter override |
| F | Cockpit / chase camera | F1–F4, F6 | Cockpit, chase, fly-by, target, weapon cams |
| RMB drag | Look around | [ / ] | Zoom |
| M | Theater map | H | Rearm & refuel (stopped at a friendly base) |
| K | Jettison tanks | J (hold) | Eject |
| U | Level-off autopilot | Esc / P | Pause |
| , / . | Left / centre / right display page | \\ | Cockpit cursor (click displays) |
| ' | Next steerpoint | End | Steer to nearest friendly field |

Gamepads are supported. Mouse modes (mouse-aim, virtual joystick, keyboard-only)
are in SETTINGS.

### Cockpits and avionics

Each jet has its own 3D cockpit with working displays:

- **F-15EX** — a 10×19 in touch-screen large-area display split into two
  portals, up-front controller, standby display, caution panel, LOCK/SHOOT lights.
- **F/A-18E/F** — two DDIs, the up-front controller display, 8×8 in centre MFD,
  engine/fuel display and standby instruments.
- **Typhoon** — three colour MHDDs, the dedicated warning panel and the
  get-u-home standby display.

Display pages: **RADAR** (B-scope, RWS/TWS/ACM/silent, track files, STT data
block, launch zone, jammer strobes, why a lock was lost), **TSD / SA / PA**
(heading-up moving map with coastlines, contours and the datalinked picture),
**STORES**, **ENGINE**, **FUEL** (bingo/joker, fuel at steerpoint), **EW**
(threats, jammer, countermeasure program), **HSI** (TACAN, ILS) and
**FCS/DAMAGE**. Click the bezel buttons with the cockpit cursor (`\`) or cycle
pages with `,` `/` `.`.

Helmet-mounted cueing (JHMCS / JHMCS II / Striker II): look at a target in the
cockpit and press **R** to lock it; the AIM-9X seeker follows your head.

Navigation: steerpoints for every field plus bullseye (`'` next, `End` = nearest
friendly field), HUD steerpoint cue, ILS on every runway (approach valleys keep
the glideslope clear of the mountains), an AoA bracket, and graded touchdowns.

### Logbook, debrief and replay

Every sortie is logged: kills by weapon and range, missiles defeated, landings,
G / Mach / altitude records, duel record by difficulty, best wave and 18
decorations (LOGBOOK on the main menu). The results screen shows an engagement
map and timeline, and **WATCH REPLAY** plays the whole mission back with
scrubbing, 0.25–8× speed and chase / fly-by / target cameras on any aircraft.

### Phones and tablets

Touch controls (virtual stick, throttle slider, fire/lock/weapon/countermeasure
buttons, drag to look) switch on automatically on touch devices.

### Flight and physiology

- Six-degree-of-freedom physics: forces *and* moments. Each jet has its own
  moments of inertia (changing with fuel and wing stores), stability and
  damping derivatives, and control power; rotation follows Euler's equations.
- Fly-by-wire: the stick commands load factor and roll rate; the control laws
  work out stabilator / aileron / rudder deflections (rate-limited actuators,
  G-onset limiting, AoA and G limiters; override with L). Authority fades at
  low speed, stability stiffens supersonic, the Typhoon is unstable without
  its computers, and pushing past the limits can depart the jet.
- Wind and turbulence (per-mission wind, chop aloft, rough air low over land,
  mountain rotor), ground effect, and asymmetric thrust with an engine out.
- Fuel matters. Afterburner multiplies fuel flow several times over.
- G effects: +4.0 to +7.9 G grey-out; +8.0 to +10.4 G tunnel vision; +10.5 G and
  above G-LOC (10 s blackout, controls frozen). −2.0 to −4.9 G red-out at 50 %;
  −5.0 G and below full red-out.

## Code layout

```
src/core      math, noise, atmosphere, input, settings
src/world     terrain function, islands, LOD streaming, trees, ocean, clouds, airfields
src/render    renderer, fog, sky, particles, G-effect post-processing, cameras
src/aircraft  specs, flight model, damage, procedural 3D models (models/kit.ts: loft,
              wing, livery shader), cockpit
src/weapons   AIM-120D / AIM-9X, guns, countermeasures
src/sensors   radar, IRST, RWR / MAWS, signatures
src/ai        skill levels, steering controller, AI pilot state machine
src/game      simulation, team air picture / GCI, spawning, game modes, logbook, replay
src/avionics  display pages, navigation (steerpoints, TACAN, ILS, fuel planning)
src/ui        HUD, helmet display, scopes, map, menus, hangar, debrief, touch and replay controls
src/audio     synthesized engine, weapon and warning audio
```

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push
to `main` (enable Pages with source "GitHub Actions" in the repository settings).
