# TRIAD — Air Combat Simulator

A browser combat flight simulator in the spirit of DCS, built with TypeScript and
Three.js. Six aircraft, two theaters (Frostfall Strait and Triad Isles), and an AI that uses the
terrain against you.

**Aircraft (the only vehicles in the game):**

| | F-15EX Eagle II | F/A-18E/F Super Hornet | Eurofighter Typhoon | Sukhoi Su-35S | Dassault Rafale C | Lockheed Martin F-22A Raptor |
|---|---|---|---|---|---|---|
| Crew | 2 | 2 | 1 | 1 | 1 | 1 |
| Max speed | Mach 2.5 | Mach 1.8 | Mach 2.0 | Mach 2.25 | Mach 1.8 | Mach 2.25 (supercruise Mach 1.8) |
| Ceiling | 60,000 ft | 50,000 ft | 55,000 ft | 59,060 ft | 50,000 ft | 65,000 ft |
| Engines | 2 × F110-GE-129 (29,500 lbf AB) | 2 × F414-GE-400 (22,000 lbf AB) | 2 × EJ200 (20,233 lbf AB) | 2 × AL-41F1S, 3D thrust vectoring (32,000 lbf AB) | 2 × M88-2 (16,860 lbf AB) | 2 × F119-PW-100, 2D thrust vectoring (35,000 lbf AB) |
| MTOW | 81,000 lb | 66,000 lb | 51,800 lb | 76,059 lb | 54,000 lb | 83,500 lb |
| Gun | M61A1 20 mm | M61A2 20 mm | BK-27 27 mm | GSh-30-1 30 mm (150 rds) | 30M791 30 mm (125 rds) | M61A2 20 mm (480 rds) |
| Radar | AN/APG-82(V)1 AESA | AN/APG-79 AESA | CAPTOR-E + PIRATE IRST | N035 Irbis-E PESA + OLS-35 IRST | RBE2 AESA + OSF IRST, SPECTRA | AN/APG-77 AESA |
| Missiles | AIM-120D, AIM-9X | AIM-120D, AIM-9X | AIM-120D, AIM-9X | R-77M, R-74M (Su-35S only) | Meteor, MICA IR (Rafale only) | AIM-120D, AIM-9X (internal bays) |

Current version: **v4.7.1** — see [CHANGELOG.md](CHANGELOG.md) (also in the game
under **v4.7.1 · NOTES** on the main menu).

Each jet is a high-detail procedural model: about 250k-390k triangles for the jets
around you, and a hero build with about 10x that (2.5-4 million triangles) for your
own jet and the hangar: blended fuselages
built from real cross-sections, hollow intakes with ducts and fans, airfoil
wings and tails with moving control surfaces, petal nozzles with burner cans,
detailed landing gear, seated pilots and painted liveries with panel lines,
rivets, stencils and weathering.

Missiles: AIM-120D AMRAAM (active radar, datalink midcourse, loft) and AIM-9X
(IR, high off-boresight) on the F-15EX, Super Hornet and Typhoon; R-77M (active
radar, dual-pulse) and R-74M (IR, canards + thrust vectoring) on the Su-35S only;
Meteor (ramjet, about 92 NM reach and a 34 NM no-escape zone, the longest in the
game) and MICA IR (imaging IR, thrust vectoring, about 27 NM) on the Rafale only. Countermeasures: flares and chaff.

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
  and the difficulty (Easy / Medium / Hard / Extreme). Start head-on over the contested island (Hvitøy or Samos), or
  on its opposite runways with the mountain between you. Rules: all weapons,
  Sidewinders + guns, or guns only.

Enemy AI is never the same type as the player's jet.

- **5v5 Team Battle** — you and four AI wingmen against five AI bandits over the contested island.
  Wipe out the other team to take the round; everyone respawns; first to 3 wins.
  When you're shot down, spectate any jet on either team or fly a free camera (F).
  A round still going after 5 minutes ends with a point to both teams.
- **Free-for-all (Last Pilot Standing)** — 12 jets, you and 11 AI, everyone hostile to
  everyone, no respawns. The battle zone shrinks in stages and the storm outside it
  destroys jets that stay out. Kills refill a missile of each type; the top scorer carries
  a revealed bounty; the last two fight a FINAL DUEL. Your placing out of 12 goes on the scoreboard.

**Customize** (main menu): solid colours, 12 wrap patterns (including Black Ice, Inferno, Aurora and Galaxy), finish and brightness for each jet.

### Graphics

**SETTINGS → GRAPHICS** has overall presets (Low, Medium, High, Ultra, 4K Ultra) and
every option on its own: render resolution up to 4K (3840 × 2160) with a resolution
scale, MSAA up to 8×, shadow quality, mountain lighting (sun shadows cast by the terrain
across the whole map and sky occlusion in valleys), light scattering, bloom, tone
mapping (Neutral / Filmic / AgX), brightness, contrast, saturation, vignette, world
detail, cloud amount (up to overcast), cloud quality and drifting cloud shadows.

### The theaters

Pick the map on the **THEATER** card on the main menu. Every mode works on both.

**Frostfall Strait** (default): 200 × 200 NM frozen arctic archipelago, with snow-covered
mountains (huge Fuji-style cones, the tallest over 26,000 ft), glaciers, ice cliffs, pack ice and still, depth-shaded water.
Fights start around 29,500 ft.

- **Nordland** and **Sørvik** (blue) — Nordhavn AB, Isvik AB.
- **Østmark** and **Kragfjell** (red) — Kragen AB, Svalbru AB.
- **Hvitøy** (contested) — a wall of peaks between Hvitøy West AB (blue) and Hvitøy East AB (red).

**Triad Isles**: 400 × 400 NM of sea with three islands, all covered in forest and hills (no grass):

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
| U | Auto-Fly (destination, speed, altitude) | Esc / P | Pause |
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
- **Su-35S** — two 15 in MFI-35 wide-screen displays side by side, the PUI-35
  control display and a wide-angle HUD.
- **Rafale** — a head-level display between two lateral displays,
  and the wide HUD.

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

## Multiplayer

**MULTIPLAYER ▸** on the main menu opens the server browser: the official
servers **OFFICIAL 1-5** with live pilot counts, or any server by address.
Online play is LAST PILOT STANDING between real players only — there is no AI
on any server. Between matches everyone flies with weapons on hold; a match
starts when two or more pilots are in (15 s countdown), everyone drops in on a
ring around the arena, the zone shrinks, kills rearm you, the last jet flying
wins, and the next match starts by itself. Pilots who join mid-match spectate
until the next one. Each room is up to 12 pilots and has a fixed theater (the
game loads it when you join).

Play online from the website build (GitHub Pages): browsers only allow secure
`wss://` connections from an `https://` page.

### Official servers (OFFICIAL 1-5)

One server process hosts all five rooms (OFFICIAL 1-3 on Triad Isles,
OFFICIAL 4-5 on Frostfall Strait):

    cd server && npm install && node server.mjs --official

`render.yaml` deploys exactly that on Render (New → Blueprint → this repo),
which gives `wss://triad-servers.onrender.com` — the address the game looks
for (`src/net/servers.ts`; a build can point elsewhere with the
`VITE_TRIAD_SERVER` environment variable). Any Node 18+ host or
`server/Dockerfile` works too; it listens on `$PORT` (default 8080) and
`GET /status` lists the rooms.

### Host your own

    cd server && npm install
    node server.mjs --name "MY SERVER" --map triad --port 8080   # or --map frost, --max 8

Friends join with **JOIN A SERVER BY ADDRESS**. Over the internet the server
needs a secure address (a free Cloudflare Tunnel, Render, or a TLS reverse
proxy); on your own network `192.168.x.x:8080` works from the offline build
(`triad-offline.html`, opened from disk).

### How it works

Each client flies its own jet and its own weapons; the server relays jet
state (20 Hz), missiles, countermeasures and hits, and runs the match and the
zone. What the shooter sees decides a hit (its gun rounds and missiles hit the
other jet on its screen), the hit is sent to that pilot, and their client
takes the damage and reports the kill. Other jets are shown 0.12 s behind real
time and interpolated so they move smoothly.
