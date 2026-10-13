# TRIAD

**A combat flight simulator, a space program and a deep-sea survey, in one browser game.**

TRIAD is written in TypeScript on Three.js and runs entirely in the browser: no plugins,
no downloads, no game assets beyond what the code builds. Every aircraft, rocket, rover,
submarine, island and sound is generated procedurally at start-up.

It has three programs, chosen on the launcher screen:

| Program | What you do |
|---|---|
| **AIR COMBAT** | Fly 13 real jets over four theaters: dogfights, campaigns, ranked 5v5, airstrikes, spy flights, carrier ops, aerial refuelling, airshows and online battles. |
| **SPACE EXPLORATION** | Fly the Saturn V to the Moon, Starship to Mars, Falcon 9, Falcon Heavy and SLS missions, drive Perseverance and Curiosity, and tour the whole Solar System at real scale. |
| **OCEAN** | Pilot a one-person survey submersible off Kestrel Harbor, listen with hydrophones, triangulate a sound and recover what is knocking in the dark. |

Current version: **7.12.2**. Full history in [CHANGELOG.md](CHANGELOG.md).

---

## Contents

1. [Playing](#playing)
2. [The launcher](#the-launcher)
3. [Air combat](#air-combat)
   - [Aircraft](#aircraft)
   - [Weapons](#weapons)
   - [Game modes](#game-modes)
   - [Ranked](#ranked)
   - [AI pilots and difficulty](#ai-pilots-and-difficulty)
   - [Theaters](#theaters)
   - [Time of day, weather and night](#time-of-day-weather-and-night)
   - [Carriers, tankers and Auto-Fly](#carriers-tankers-and-auto-fly)
   - [Flight model and physiology](#flight-model-and-physiology)
   - [Sensors and line of sight](#sensors-and-line-of-sight)
   - [Cockpits and avionics](#cockpits-and-avionics)
   - [Models, paint and the hangar](#models-paint-and-the-hangar)
   - [Cameras, replay, logbook](#cameras-replay-logbook)
   - [Sound](#sound)
   - [Controls](#controls)
   - [Graphics settings](#graphics-settings)
4. [Space exploration](#space-exploration)
5. [Ocean](#ocean)
6. [Multiplayer](#multiplayer)
7. [Building and development](#building-and-development)
8. [Project layout](#project-layout)
9. [Release notes](#release-notes)

---

## Playing

### In a browser

The website build is published to GitHub Pages (see [Deploying](#deploying)). Any recent desktop browser with WebGL 2 works; a dedicated
graphics card is strongly recommended. The game warns you if the browser is drawing
on the CPU (SwiftShader) instead of the graphics card, and tells you how to switch
hardware acceleration on.

### Windows app

[Download TRIAD-Air-Combat.exe](https://github.com/rowan-beep/destroy-the-claude-limit/releases/download/desktop/TRIAD-Air-Combat.exe):
a portable app, no installer. It plays the live website, so game updates reach it
without a new download: a few seconds after an update goes live the game switches to it
at the main menu (mid-flight it waits until you are back in the menu).

### From source

```bash
npm install
npm run dev          # http://localhost:5173
```

Node 18 or newer. See [Building and development](#building-and-development) for the
other builds.

### Single file

`npm run build:single` writes one self-contained `dist-single/index.html` with every
script, style and generated asset inlined. Double-click it to play from disk, with no
server and no network. Fonts fall back to system fonts offline.

### Phones and tablets

Touch controls switch on automatically on touch devices: a virtual stick, a throttle
slider, fire, lock, weapon and countermeasure buttons, and drag-to-look. The ocean
program has its own touch layout.

---

## The launcher

The game opens on the **TRIAD** launcher: three full-height cards, one per program,
each with its own backdrop. Pick with the mouse, the arrow keys or **1 / 2 / 3**, and
**Enter** to start. The last program you played is pre-selected.

Picking a program starts its loading screen: in-engine cinematic photographs of that
program, a new one every 4 seconds with a slow push-in and a cross-fade, a fact along
the bottom and a loading bar. It always takes 8 seconds from the pick to the menu. On a
slow machine the menu comes up on time and the rest (jet portraits, the theater) keeps
loading behind it.

A pulsing red **NEW** badge appears on a program's card while that program has
release notes you have not opened yet. Each program keeps its own notes: the air
combat menu lists only air updates, the space menu only space updates, and the
ocean menu only ocean updates. Opening the notes clears the badge.

The air and space menus come in two styles, switchable in settings: **CURRENT**
(the full menu with the 3D hangar) and **SIMPLE** (a compact list).

---

## Air combat

### Aircraft

Thirteen aircraft, each with its own flight model, cockpit, sensors, weapons, sounds
and a high-detail procedural 3D model built from the real jet's cross-sections and
planform.

| Aircraft | Crew | Top speed | Ceiling | Engines (afterburner thrust each) | Max takeoff weight | Gun | Radar | Missiles |
|---|---|---|---|---|---|---|---|---|
| **F-15EX Eagle II** | 2 | Mach 2.5 | 60,000 ft | 2 × GE F110-GE-129 (29,500 lbf) | 81,000 lb | M61A1 Vulcan 20 mm, 510 rds | AN/APG-82(V)1 AESA | AIM-120D, AIM-9X |
| **F/A-18E/F Super Hornet** | 2 | Mach 1.8 | 50,000 ft | 2 × GE F414-GE-400 (22,000 lbf) | 66,000 lb | M61A2 Vulcan 20 mm, 412 rds | AN/APG-79 AESA | AIM-120D, AIM-9X |
| **F-16C Fighting Falcon** | 1 | Mach 2.05 | 50,000 ft | 1 × GE F110-GE-129 (29,500 lbf) | 37,500 lb | M61A1 Vulcan 20 mm, 511 rds | AN/APG-83 SABR AESA | AIM-120D, AIM-9X |
| **Eurofighter Typhoon** | 1 | Mach 2.0 | 55,000 ft | 2 × Eurojet EJ200 (20,233 lbf) | 51,800 lb | Mauser BK-27 27 mm, 150 rds | CAPTOR-E AESA + PIRATE IRST | AIM-120D, AIM-9X |
| **Sukhoi Su-35S** | 1 | Mach 2.25 | 59,060 ft | 2 × Saturn AL-41F1S, 3D thrust vectoring (32,000 lbf) | 76,059 lb | GSh-30-1 30 mm, 150 rds | N035 Irbis-E PESA + OLS-35 IRST | R-77M, R-74M |
| **Dassault Rafale C** | 1 | Mach 1.8 | 50,000 ft | 2 × Safran M88-2 (16,860 lbf) | 54,000 lb | Nexter 30M791 30 mm, 125 rds | Thales RBE2 AESA + OSF IRST | Meteor, MICA IR |
| **F-22A Raptor** | 1 | Mach 2.25 (supercruise Mach 1.8) | 65,000 ft | 2 × P&W F119-PW-100, 2D thrust vectoring (35,000 lbf) | 83,500 lb | M61A2 Vulcan 20 mm, 480 rds | AN/APG-77 AESA | AIM-120D, AIM-9X (internal bays) |
| **F-35A Lightning II** | 1 | Mach 1.6 | 50,000 ft | 1 × P&W F135-PW-100 (43,000 lbf) | 70,000 lb | GAU-22/A 25 mm, 182 rds | AN/APG-81 AESA | AIM-120D, AIM-9X (internal bays) |
| **Sukhoi Su-57 Felon** | 1 | Mach 2.0 | 65,600 ft | 2 × Saturn AL-41F1, 3D thrust vectoring (32,000 lbf) | 77,160 lb | GSh-30-1 30 mm, 150 rds | N036 Byelka AESA | R-77M, R-74M (internal bays) |
| **Saab JAS 39E Gripen E** | 1 | Mach 2.0 | 52,000 ft | 1 × GE F414G (22,000 lbf) | 36,400 lb | Mauser BK-27 27 mm, 120 rds | Leonardo Raven ES-05 AESA | Meteor, IRIS-T |
| **MiG-31BM Foxhound** | 2 | Mach 2.83 | 67,600 ft | 2 × Aviadvigatel D-30F6 (34,170 lbf) | 101,850 lb | GSh-6-23M 23 mm, 260 rds | Zaslon-M PESA | R-37M, R-74M |
| **SR-71A Blackbird** | 2 | Mach 3.5 | 88,000 ft | 2 × P&W J58 bleed-bypass turbojets (34,000 lbf) | 172,000 lb | none (unarmed) | ASARS-1 ground-mapping radar | none |
| **North American X-15** | 1 | Mach 6.72 | 354,200 ft | 1 × Thiokol XLR99 rocket (57,000 lbf) | 56,130 lb | none (research aircraft) | none | none |

What makes each one different in the air:

- **F-15EX Eagle II**: the heaviest hitter, 23 hardpoints and up to 12 air-to-air
  missiles. Two-seat, conformal fuel tanks, near-black gunship-grey factory paint.
- **F/A-18E/F Super Hornet**: long-legged, brutally agile at low speed and high angle
  of attack thanks to its leading-edge extensions. Carrier-capable.
- **F-16C Viper**: small and light, relaxed stability under digital fly-by-wire, a
  side-stick and a seat reclined 30 degrees for 9 G.
- **Typhoon**: canard-delta with the best thrust-to-weight of the classic jets, and the
  PIRATE passive IRST that tracks without lighting up the target's warning receiver.
  Unstable without its flight computers.
- **Su-35S**: 3D thrust vectoring lets it point its nose far past the stall and turn
  where the others fall out of the sky.
- **Rafale**: the lightest classic jet, a close-coupled canard delta that keeps its
  energy in the turn. Carries the Meteor ramjet missile, the longest reach in the
  game (about 92 NM, with a 34 NM no-escape zone).
- **F-22A Raptor**: supercruises at Mach 1.8 without afterburner, climbs at over
  60,000 ft a minute, and vectors its nozzles 20 degrees for post-stall flips.
  Everything rides inside the weapons bays.
- **F-35A**: stealth with four AIM-120Ds in the internal bays, or "beast mode" with
  more under the wings when stealth does not matter.
- **Su-57**: a big, fast fifth-generation airframe with moving leading-edge root
  extensions, supercruise near Mach 1.3 and 3D vectoring nozzles.
- **Gripen E**: the lightest fighter in the theater, rolls fast and supercruises at
  about Mach 1.15 with four missiles. Its radar sits on a tilting swashplate and sees
  100 degrees either side of the nose.
- **MiG-31BM**: a huge two-seat interceptor built for speed, with four R-37M
  very-long-range missiles half-sunk under the belly.
- **SR-71A**: unarmed. Moving inlet spikes that turn the J58s into near-ramjets at
  speed, and a cruise above 80,000 ft. Flown in the BLACKBIRD spy missions and free flight.
- **X-15**: dropped from a B-52 at 45,000 ft, it lights its rocket and climbs to the
  edge of space. Reaction-control thrusters steer it where the air runs out, and the
  sky goes black, the Earth's curve shows and the stars come out.

Every combat jet has four or five loadouts (air superiority, max missiles, dogfight,
strike, long-range with tanks), chosen in the hangar.

### Weapons

**Air-to-air missiles**

| Missile | Guidance | Carried by |
|---|---|---|
| AIM-120D AMRAAM | active radar, datalink midcourse, loft | F-15EX, Super Hornet, F-16C, Typhoon, F-22A, F-35A |
| AIM-9X Sidewinder Block II | imaging IR, high off-boresight, helmet-cued | the same jets |
| R-77M | active radar, dual-pulse motor | Su-35S, Su-57 |
| R-74M | IR, canards and thrust vectoring | Su-35S, Su-57, MiG-31 |
| MBDA Meteor | ramjet, active radar, the longest reach in the game | Rafale, Gripen E |
| MBDA MICA IR | imaging IR, thrust vectoring, about 27 NM | Rafale |
| Diehl IRIS-T | IR, thrust vectoring | Gripen E |
| R-37M | very long range, active radar | MiG-31 |

Missiles fly their own physics: motor burn and coast, drag, proportional navigation,
seeker field of view, gimbal limits and line of sight. Decoys work the way they do on
modern seekers: imaging-IR missiles (AIM-9X, IRIS-T, MICA IR) ignore most flares, the
R-74M a few more, and a radar missile only loses you to chaff while you beam it (turn
to put it 90 degrees off your nose), which on its own can also notch it. Turning is what
beats a missile; decoys help. Terrain between the missile and its target breaks the
lock. Each motor leaves its own smoke: thin trails from the reduced-smoke AIM-120,
AIM-9X, IRIS-T and MICA, thick white ones from the Russian missiles, and almost none
from the Meteor once its ramjet takes over from the booster.

**Guided bombs** (strike loadouts): GBU-31 JDAM (2,000 lb), GBU-32 JDAM (1,000 lb),
GBU-39 Small Diameter Bomb, Paveway IV, AASM Hammer and KAB-500S. A bombing computer
counts down to the release point.

**Guns**: each jet's real cannon, its rate of fire, muzzle velocity, dispersion and
round count, with a lead-computing gunsight. The rotary cannons (M61, GAU-22, GSh-6-23)
take a moment to spin up to full rate; the revolver and single-barrel cannons fire at
once.

**Countermeasures**: flares and chaff, with a dispensing program on the EW page.

### Game modes

| Mode | Summary |
|---|---|
| **Flight School** | An instructor teaches flying (views, climb and dive, turning, throttle and afterburner, pulling G) and fighting (radar lock, radar missile, heat-seeker, gun, flares and chaff) against drones that never shoot back. Then a checkride: 3 drones and a manoeuvring bandit in 5 minutes, graded A to C. |
| **Free Flight** | Any jet from a friendly runway or an air start, the whole theater, no enemies. |
| **Wave Combat** | Ten escalating waves. 1-3: three basic bandits. 4-6: six tactical bandits that defend, dispense and terrain-mask. 7-9: six aggressive bandits with long radar-missile shots. 10: nine elite bandits with multi-ship tactics. Optional auto-rearm between waves. |
| **1v1 Duel** | Your jet against any other type, at Easy, Medium, Hard, Extreme or APEX. Start head-on in the air or on opposite runways of the contested island with the mountains between you. Rules: all weapons, heat-seekers and guns, or guns only. |
| **5v5 Team Battle** | You and four AI wingmen against five AI bandits. Wipe out the other team to take the round; everyone respawns rearmed; first to 3 (configurable). Shot down? Spectate any jet or fly a free camera. |
| **Free-for-all** | Last Pilot Standing: you and 11 AI pilots, all hostile, no respawns. The zone shrinks in stages and the storm outside it destroys jets that stay out. Kills refill a missile of each type, rounds, flares and fuel; the top scorer carries a bounty; the last two fight a FINAL DUEL. |
| **Ranked** | A 5v5 playlist modelled on Rainbow Six Siege's ranked system. See [Ranked](#ranked). |
| **Campaign** | *Wolf of the Strait*, eight story missions with wingmen and radio calls: First Contact, Wolf at the Door, Blind Their Eyes, Shepherd, Night Hunter, Anvil, Full Sky and The White Wolf. Each unlocks the next and has three stars to earn. |
| **Airstrike** | Bomb a defended ground target: an ammunition depot, command post, SAM site, army camp, radar station or airbase. Every sortie is new: different target, defences, patrols and start. Destroy every primary target, fly home and land. |
| **Blackbird** | SR-71 spy missions. Each is a new crisis: photograph enemy bases, sweep them with the side-looking radar and record their radio traffic, piece the clues together and make the call. Inlet unstarts, SA-2 launches and MiG-31 scrambles along the way. |
| **Daily Mission** | A new mission every day built from real aviation news: read the briefing, scramble, find the bandits where the story put them, fight and land. |
| **Airshow** | No flying: you stand on the crowd line with a camera and a long lens while every jet flies its display (takeoff into the vertical, high-speed pass with vapour cone, rolling pass, max-G turn, high-alpha pass or cobra, landing). Every picture is scored on framing, sharpness and moment; the best go into an album in the hangar, and points earn longer lenses. Pro camera settings: shutter, aperture, ISO, focus. |
| **Online** | Multiplayer Last Pilot Standing against real players only. See [Multiplayer](#multiplayer). |

AI enemies are never the same type as the player's jet.

### Ranked

Built like Rainbow Six Siege's ranked 2.0:

- **36 ranks**: Copper, Bronze, Silver, Gold, Platinum, Emerald and Diamond, five
  divisions each (V lowest to I highest), then **Champion** with a leaderboard place.
- **Rank points (RP)**: 100 RP per division. Copper V starts at 1,000 RP and Diamond I
  at 4,400. Champion needs 4,500 RP and 8 completed matches that week.
- **Hidden skill (MMR)**: a rating with an uncertainty, carried from week to week, that
  decides how much RP a win or loss moves you.
- **Placements**: your first 5 matches each week are placements; your rank stays hidden
  until the fifth. A first-time pilot seeds at Bronze IV. Placements never reach
  Champion, and nobody seeds above Diamond V.
- **Matches**: you and four wingmen against five bandits, first to 4 rounds (overtime
  at 3-3, first to 5). Every AI pilot flies at your rank: Copper is about Easy,
  Diamond about Extreme, Champion is APEX.
- Wins and kills earn RP, losses cost it. Leaving a match counts as a loss.
- **Weekly reset** every Monday at 8:00 a.m. Pacific.
- The **RANKED** tab shows your emblem, the ladder and the leaderboard.

### AI pilots and difficulty

One continuous skill level drives reaction time, aim, energy management, missile
discipline and tactics, with explicit features switched on as it rises: terrain
masking, notching, dispensing, afterburner discipline, multi-ship targeting.

| Level | Behaviour |
|---|---|
| Easy | slow to react, predictable, short shots |
| Medium | defends missiles, uses the vertical |
| Hard | terrain-masks, notches, shoots at long range |
| Extreme | aggressive energy fighting, coordinated with its flight |
| **APEX** | everything Extreme has, pushed further, and orders from a battle commander that tells each pilot when to bait, flank, cover, press and shoot. It takes a long missile shot only at a jet flying at it and holds every other shot for the no-escape zone |

The AI flies the same flight model and sensors you do; it does not cheat on line of
sight.

### Theaters

Pick the map on the **THEATER** card. Every mode works on every map.

| Theater | Size | Description |
|---|---|---|
| **Triad Isles** | 400 × 400 NM | The original theater. **Skye** (blue): steep mountains, sea lochs and cliffs, Dunvegan and Broadford air bases. **Capri** (red): compact limestone crags and grottoes, Anacapri and Marina Grande. **Samos** (contested): pine-covered hills with a great north-south ridge between Karlovasi (blue, west) and Vathy (red, east). |
| **Frostfall Strait** | 200 × 200 NM | A frozen arctic archipelago: snow-covered ranges over 25,000 ft, glaciers, ice cliffs, pack ice and deep blue water. **Nordland** and **Sørvik** (blue), **Østmark** and **Kragfjell** (red), and **Hvitøy** in the strait, a wall of peaks between its two bases. |
| **Jade Archipelago** | 80 × 80 NM | Twenty tropical islands, each different: a 10,000 ft volcano, limestone towers, atolls and lagoons, a flooded caldera, needle peaks, jungle ridges and white beaches. One runway per side. |
| **Open Ocean** | 80 × 80 NM | Nothing but deep, rolling water and two fleets: four BLUE aircraft carriers in the south-west and four RED in the north-east, each sailing its own loop. |

Terrain is a continuous height function streamed in tiles on worker threads, with
forests, rock, snow and beaches, airfields with taxiways, aprons, hangars, lights and
ILS approaches, and an ocean with waves, foam and depth shading.

### Time of day, weather and night

- **Time of day**: dawn, morning, noon, afternoon and dusk, each with its own sun height,
  sky and light.
- **Weather**: clear, cloudy, overcast, rain, storm and snow, set from the weather
  widget. Cloud cover, precipitation and visibility follow, and the clouds cast
  drifting shadows on the ground. Wind and turbulence are set per mission.
- **Pitch black**: a moonless, starless night on any map, in any mode. The naked eye
  sees only real light sources: engine glow, afterburners, runway and deck lights,
  explosions. **Night-vision goggles** (key 9) amplify the faint light into a grainy
  green picture, through the goggle tube in the cockpit and full-screen outside.

### Carriers, tankers and Auto-Fly

**Aircraft carriers** sail, pitch and heave. Each carrier sails its own loop at 30
knots for wind over the deck, with its position and deck motion a pure function of the
mission clock, so every client and replay agrees. Launch off a catapult, land with the
tailhook (H in the air) on the arresting wires, and rearm and refuel on deck. Stay
clear of the enemy ships' guns.

**Aerial refuelling** from a Boeing KC-46A Pegasus flying a racetrack near the base.
Boom-receptacle jets (F-15EX, F-16, F-22, F-35A, SR-71) take the flying boom;
probe-and-drogue jets (Super Hornet, Typhoon, Su-35S, Rafale, MiG-31, Su-57, Gripen)
take the basket. Fly to the pre-contact position and the jet captures itself the last
metres: the boom operator flies the boom down, the nozzle latches and the jet is held
while the fuel flows.

**Auto-Fly** (U) is a complete autopilot, gate to gate: takeoff (brakes off, power,
centreline steering, rotation, gear up), climb, cruise to any airfield, carrier or the
tanker at the speed and altitude you choose, then approach, landing and rollout. A
speed slider goes up to the jet's top speed.

### Flight model and physiology

- **Six degrees of freedom**: forces and moments. Each jet has its own moments of
  inertia (changing with fuel and stores), stability and damping derivatives and
  control power; rotation follows Euler's equations.
- **Aerodynamics**: lift and drag curves with stall, compressibility and wave drag,
  ground effect, and a standard atmosphere to the edge of space.
- **Engines**: thrust with altitude and Mach, spool-up time, afterburner light-off,
  fuel flow that multiplies several times over in reheat, and asymmetric thrust with
  an engine out.
- **Fly-by-wire**: the stick commands load factor and roll rate; control laws work out
  stabilator, aileron and rudder deflections with rate-limited actuators, G-onset
  limiting and AoA and G limiters (override with L). Authority fades at low speed,
  stability stiffens supersonic, and pushing past the limits can depart the jet.
- **Thrust vectoring** on the Su-35S, Su-57 (3D) and F-22A (2D) for post-stall flight.
- **Wind and turbulence**: per-mission wind, chop aloft, rough air low over land and
  mountain rotor.
- **Damage**: hits to engines, fuel, controls and structure, with smoke, fire, leaks and
  break-up; ejection with a parachute.
- **G effects**: +4.0 to +7.9 G grey-out, +8.0 to +10.4 G tunnel vision, +10.5 G and
  above G-LOC (10 seconds of blackout, controls frozen). −2.0 to −4.9 G red-out at
  half strength; −5.0 G and below full red-out.

### Sensors and line of sight

- **Radar**: RWS, TWS, ACM and silent modes, track files, single-target track, launch
  zones and notch losses. Each jet's radar has its own range, scan limits and track
  count.
- **IRST** on the Typhoon, Su-35S, Rafale and MiG-31: passive tracking that does not
  trigger the target's warning receiver.
- **RWR and missile warning**: threat symbols, launch warnings and audio.
- **Line of sight**: radar, IRST, ground radars and missile seekers need real line of
  sight. Terrain and the curvature of the Earth block them, so you can hide in sea lochs
  or behind a ridge, and so can the AI.
- **Signatures**: radar cross-section and IR signature per jet, aspect and throttle;
  stealth jets are detected much later.
- **Team picture**: ground-controlled-intercept radars at every airbase plus whatever
  the team's fighters see make up each side's shared, datalinked air picture. Ground
  radars obey the same terrain masking and horizon, so flying low behind a ridge keeps
  you off the enemy's scopes.

### Cockpits and avionics

Every jet has its own 3D cockpit with working displays:

- **F-15EX**: a 10 × 19 inch touch-screen display split into two portals, up-front
  controller, standby display, caution panel, LOCK and SHOOT lights.
- **F/A-18E/F**: two DDIs, the up-front control display, the 8 × 8 inch centre display,
  engine and fuel display and standby instruments.
- **Typhoon**: three colour MHDDs, the warning panel and the get-u-home display.
- **Su-35S**: two 15 inch MFI-35 wide-screen displays, the PUI-35 control display and a
  wide-angle HUD.
- **Rafale**: a head-level display between two lateral displays, and the wide HUD.
- And the others, each with its own layout, from the F-35's panoramic display to the
  SR-71's round gauges and the X-15's research instruments.

Display pages: **RADAR** (B-scope, modes, track files, launch zone, jammer strobes,
why a lock was lost), **TSD / SA** (heading-up moving map with coastlines, contours and
the datalinked picture), **STORES**, **ENGINE**, **FUEL** (bingo, joker, fuel at
steerpoint), **EW** (threats, jammer, countermeasure program), **HSI** (TACAN, ILS) and
**FCS / DAMAGE**. Click the bezel buttons with the cockpit cursor (\\) or cycle pages
with `,` `/` `.`.

**Helmet-mounted cueing** (JHMCS, JHMCS II, Striker II, HMDS, TARGO): look at a target in
the cockpit and press R to lock it; the heat-seeker's seeker follows your head.

**Navigation**: steerpoints for every field and carrier plus bullseye (' next, End for
the nearest friendly field), a HUD steerpoint cue, ILS on every runway with approach
valleys that keep the glideslope clear of the mountains, an AoA bracket and graded
touchdowns.

### Models, paint and the hangar

Each aircraft is a procedural model built at load time: blended fuselages lofted from
real cross-sections, hollow intakes with ducts and fans, airfoil wings and tails with
moving control surfaces, petal or bare nozzles with burner cans, detailed landing gear,
seated pilots in flight gear, canopies with frames and glass, and painted liveries with
panel lines, rivets, stencils, markings and weathering drawn from the model's own
geometry. The jets around you use a light build; your own jet and the hangar use a far
denser hero build.

The **hangar** shows your jet in a lit 3D bay that you can orbit and zoom, with its
specs, loadouts and paint. **Customize** offers each jet's factory scheme, solid
colours and 13 wrap patterns (Black Ice, Inferno, Aurora, Galaxy, Raptor Camo, Digital,
Splinter, Tiger, Hex, Woodland, Arctic, Carbon and Chevron), with a finish (matte, satin,
gloss or metallic) and a brightness for each jet. The F-15EX's
factory scheme is a near-black gunship-grey metallic with a satin radome. The F-22A wears
its real two-grey camouflage: soft-edged darker patches laid out in 3D by the skin shader,
so they run on unbroken over every surface (the Raptor Camo wrap puts it on any jet).

Landing gear (every jet, `src/aircraft/models/gear.ts`) is built like the real thing: trunnion,
shock strut with a chrome oleo, torque links, folding drag brace and retraction jack, brake lines,
treaded tyres on spoked hubs with brake stacks, doors and wheel wells, and on the nose leg the
steering collar and lights. It moves in sequence (doors open, legs swing on eased hydraulics while
the brace folds and the jack telescopes, the legs tuck into their bays, the doors shut), the oleos
compress on the ground and extend off it, the wheels roll with ground speed and are braked as the
gear comes up, and the nose wheel steers with the pedals at taxi speed.

Air-to-air missiles (`src/aircraft/models/missiles.ts`) are built like the real rounds: tangent-ogive
radomes with rain-erosion tips or glass IR domes in a metal ring, the body in its sections with joint
rings, warhead and motor bands and stencilling, T-hooks, raceway and umbilical, airfoil fins, an open
nozzle with TVC jet vanes where the real one has them. A `shine` vertex attribute makes the glass
glossy and the bare metal metallic. Distant jets carry the lighter models from `stores.ts`.

Canopies are shaded as stretched acrylic: nearly clear looking straight in, a mirror of
the sky across the curve (Fresnel), the far wall seen through the near one, and faint
smudges that catch the sun; the F-22's is gold-coated.

### Cameras, replay, logbook

- **Cameras**: cockpit (F1), chase (F2), fly-by (F3), target and padlock (F4) and
  weapon camera that rides a missile to its target (F6). Right-drag to look, [ and ]
  to zoom. A cinematic kill camera plays your kills back.
- **Logbook**: every sortie is logged: kills by weapon and range, missiles defeated,
  landings, G, Mach and altitude records, duel record by difficulty, best wave, and
  **24 decorations** (First Blood, Ace in a Day, Gunslinger, Long Shot, Knife Fight, In
  the Notch, Terrain Masker, Spoofed and more).
- **Debrief**: an engagement map and timeline after every mission.
- **Replay**: WATCH REPLAY plays the whole mission back with scrubbing, 0.25× to 8×
  speed and chase, fly-by and target cameras on any aircraft.

### Sound

Every sound is synthesised in WebAudio at start-up; no audio files ship with the game.
Jet exhaust with the hump of a real jet spectrum and the crackle of shock waves,
afterburner roar with light-off thumps and reheat pops, the fan's blade-passing tone and
buzz-saw at supersonic tip speeds, wind and buffet, gear and flaps, missiles, guns,
sonic booms and warning tones. Sources are placed in 3D with head-related
filtering, and the cockpit has its own muffled mix.

### Controls

Defaults, all rebindable in **CONTROLS**. Gamepads are supported. Mouse modes
(mouse-aim, virtual joystick, keyboard only) are in **SETTINGS**.

| Key | Action | Key | Action |
|---|---|---|---|
| Mouse / W S A D or arrows | Pitch and roll | Q / E | Rudder |
| Shift / Z | Throttle up / down | Tab | Afterburner |
| Space / left mouse | Fire | \` | Cycle weapon |
| 1 / 2 / 3 / 4 | Gun / IR missile / radar missile / bombs | R / T | Lock / break lock |
| Y | Radar mode | ; | Radar scope range |
| I | IRST lock | C / V | Flares / chaff |
| G | Gear | B | Speedbrake |
| N (hold) | Wheel brakes | L | G-limiter override |
| H | Rearm on the ground, tailhook in the air, disconnect from the tanker | K | Jettison tanks |
| J (hold) | Eject | 9 | Night-vision goggles |
| F | Cockpit / chase | F1 F2 F3 F4 F6 | Cockpit, chase, fly-by, target, weapon cameras |
| Right-drag | Look around | [ / ] | Zoom |
| Home or X | Reset view | O | Aircraft labels |
| M | Theater map | U | Auto-Fly |
| , / . | Left / right display page | / | Centre display page |
| \\ or Insert | Cockpit cursor | ' | Next steerpoint |
| End | Steer to the nearest friendly field | F9 | Controls panel |
| F10 | Hide HUD and panels | Esc / P | Pause |

### Graphics settings

**SETTINGS → GRAPHICS** has presets (Low, Medium, High, Ultra and 4K Ultra) and every
option on its own:

- Render resolution (native, 1080, 1440 or 2160 rows) with a resolution scale.
- MSAA up to 8×.
- Shadow quality, and mountain lighting: sun shadows cast by the terrain across the
  whole map and sky occlusion in valleys.
- Light scattering (sun glow through haze, silver-lined clouds) and bloom.
- Tone mapping (Neutral, Filmic, AgX), brightness, contrast, saturation and vignette.
- Field of view, world detail, cloud amount (up to overcast), cloud quality and cloud
  shadows.
- Frame rate: match the display, or cap at 60, 120, 144, 165 or 240.

The game picks a starting preset for your device on first run.

---

## Space exploration

A separate program, loaded only when you first pick it.

### Missions

| Mission | What you fly |
|---|---|
| **Orbital Flight** | The Saturn V from the pad to Earth orbit; then the trip to the Moon, the lunar module landing, a moonwalk to plant the flag, and the return. Start on the pad, in Earth orbit or in lunar orbit. |
| **Starship to Mars** | Starship from its launch tower at the starship base, the long cruise, entry and landing on Mars. |
| **Europa Clipper** | Falcon Heavy: twin side-booster landings, then the long way round, past Mars and Earth, into orbit round Jupiter. |
| **Crew Dragon to the ISS** | Falcon 9: a drone-ship landing for the first stage, then chase down the space station and dock. |
| **SLS · Artemis II** | The Space Launch System: four astronauts round the far side of the Moon and home. |
| **Solar System Explorer** | Fly to any planet or major moon at real scale, on the real orbits from real ephemerides. |
| **Seven Minutes of Terror** | Mars 2020: entry, parachute and the sky crane, then drive Perseverance from its landing site. |
| **Jezero Sample Hunt** | Perseverance in Jezero Crater: core rocks, zap them with SuperCam's laser and fly the Ingenuity helicopter. |
| **Gale Crater** | Curiosity: drill the old lake bed and climb toward Mount Sharp. |

### The vehicles

- **Saturn V**: S-IC, S-II and S-IVB stages with the instrument unit, staging,
  interstage separation and the launch escape tower, on Pad 1 with its mobile launcher.
- **Starship**: the full stack on its launch tower with the tank farm and lightning
  masts, hot staging, and the belly-flop and flip on landing.
- **Falcon 9** and **Falcon Heavy**: Merlin 1D engines, boostback and landing burns,
  grid fins and legs.
- **SLS Block 1**: four RS-25 engines, two five-segment solid boosters and the interim
  cryogenic upper stage with Orion.

Each vehicle flies real stage masses, thrusts and specific impulses; an autopilot flies
the ascent while you watch or take over.

### Space features

- **Universe**: Earth, the Moon, every planet and the major moons on their real orbits,
  with procedural surfaces, atmospheres and rings, and city lights on Earth's night side.
- **Mars**: real topography from the Mars orbiter laser altimeter, wind-blown dust haze,
  dust devils and aerial perspective.
- **Rovers**: detailed Perseverance and Curiosity models with a working robotic arm and
  drill, the Ingenuity helicopter, and the sky-crane landing.
- **Time warp**: a smooth slider on every mission, with warp animations.
- **Spacesuits** for the moonwalk, chosen on the launch pad page.
- **Destinations** jump straight to Earth orbit, the Moon or Mars.

---

## Ocean

The third program: **SV-1 PETREL**, a one-pilot survey submersible rated to 300 m, off
Kestrel Harbor. Built around listening, navigation and atmosphere rather than survival
or crafting. Full design notes in [docs/OCEAN.md](docs/OCEAN.md).

### Missions

- **Quiet Survey: The Silent Buoy**, a complete expedition: leave the harbor, hear a
  strange knock, take bearings from two places to triangulate it, ping the approach,
  find the wreck in your lamps, scan its plate, recover the recorder, come home and dock.
- **The Slow Pulse**, the follow-up, opens when the expedition is done: a pulse from
  the deep basin, the Kestrel Marine Lab's mooring 282 m down, with something lying past
  the boat's rating that only the multibeam can see.
- **Free Survey**: the whole region, no story.

Nothing marks a source on the map before you have located it yourself.

### How it works

- **Acoustics** on the passive sonar equation: signal excess is source level minus
  transmission loss minus noise, in dB re 1 µPa. Spherical spreading plus Thorp's
  seawater absorption, and sea noise from the Knudsen curves for the sea state. The same
  numbers drive the sound, the listening display, the bearings and the atlas.
- **The Echo Atlas** keeps every contact you hear, its bearings and its story, the
  evidence and the expedition log, across sessions.
- **The boat**: fixed-step physics with thrust, drag, buoyancy, ballast, assists and
  collisions; a 360 degree scanning sonar whose beam paints the sea bed blue as it
  sweeps; a manipulator arm you fly by hand to take samples; floodlights all round the
  hull.
- **The sea**: a streamed sea bed with ripples, burrows, seagrass, starfish, glass
  sponges, fish, drifting jellyfish, silt your thrusters stir up and plankton that spark
  blue-green in the dark. Water absorbs light per colour with depth.
- **Above water**: the harbor with its sky, hills, structures and boats.
- **Weather**: dawn, morning, noon, afternoon or sunset; clear, fair, cloudy or overcast
  skies; calm, moderate or rough seas.
- **Time warp** for the long transits.
- **Graphics presets**: Performance, Balanced and Cinematic, and a repeatable benchmark
  route on the HARBOR page (or `triadBench('balanced')` in the browser console).
- Keyboard and mouse, gamepad or touch.

---

## Multiplayer

> Since 7.12.0 multiplayer is only offered inside the claude.ai artifact (its own live
> rooms). The website and the Windows app no longer show **MULTIPLAYER**: the server the
> website used dropped every connection after five minutes. The servers and the client
> code are still here, switched off by `multiplayerOn()` in `src/net/servers.ts`.

### Online servers

**MULTIPLAYER ▸** on the main menu opens the server browser: the official servers
**OFFICIAL 1-5** with live pilot counts, or any server by address. Online play is Last
Pilot Standing between real players only; there is no AI on any server.

Between matches everyone flies with weapons on hold. A match starts when two or more
pilots are in (15 second countdown); everyone drops in on a ring around the arena, the
zone shrinks, kills rearm you, the last jet flying wins, and the next match starts by
itself. Pilots who join mid-match spectate until the next one. Each room holds up to 12
pilots on a fixed theater, which the game loads when you join.

Play online from the website build: browsers only allow secure `wss://` connections from
an `https://` page.

**Official servers.** One server process hosts all five rooms (OFFICIAL 1-3 on Triad
Isles, 4-5 on Frostfall Strait):

```bash
cd server && npm install && node server.mjs --official
```

`render.yaml` deploys exactly that on Render (New → Blueprint → this repository), which
gives `wss://triad-servers.onrender.com`, the address the game looks for in
`src/net/servers.ts`. A build can point elsewhere with the `VITE_TRIAD_SERVER`
environment variable. Any Node 18+ host, or `server/Dockerfile`, works too; it listens
on `$PORT` (default 8080) and `GET /status` lists the rooms. `server/admin.html` is a
small admin page.

**Host your own:**

```bash
cd server && npm install
node server.mjs --name "MY SERVER" --map triad --port 8080   # or --map frost, --max 8
```

Friends join with **JOIN A SERVER BY ADDRESS**. Over the internet the server needs a
secure address (a Cloudflare Tunnel, Render, or a TLS reverse proxy); on your own
network `192.168.x.x:8080` works from the offline single-file build opened from disk.

**How it works.** Each client flies its own jet and weapons; the server relays jet state
at 20 Hz, missiles, countermeasures and hits, and runs the match and the zone. The
shooter's view decides a hit: its rounds and missiles hit the other jet on its screen,
the hit is sent to that pilot, and their client takes the damage and reports the kill.
Other jets are drawn 0.12 seconds behind real time and interpolated so they move
smoothly.

### Inside a claude.ai artifact

When the game runs as a claude.ai artifact it cannot reach outside servers, so it plays
over the page's live room instead: everyone who has the artifact open shares presence
and messages, there is a lobby and room list, one copy hosts and directs each match, and
the owner gets a control panel. The ranked leaderboard is kept in the artifact's shared
database.

### Accounts, cloud saves and the online leaderboard

The website and the Windows app have accounts (ACCOUNT / SIGN IN at the bottom of the
menu rail, or at the top of the simple menu), backed by a Supabase project:

- **Email and password, no emails sent.** CREATE AN ACCOUNT takes an email and a
  password and signs the player in at once; the Supabase project confirms new accounts
  by itself (Authentication → Email → "Confirm email" off, `mailer_autoconfirm`), so
  the game never needs to send mail. The email is only the account's name. There is no
  password reset by email; a signed-in player can change their password.
- **Nothing is lost.** The first time a player signs in, everything the game has saved
  in that browser (settings, ranked, logbook, campaign, paint, ocean and space
  progress) is copied to the account, and the browser copy stays as it is. After that
  changes are saved every 20 s and when the game is closed or hidden, and another
  device that signs in gets them. If a device and the account have both moved on, the
  player picks which to keep and the other copy goes to the account's backups first;
  the database also keeps a daily backup of every save. Signing out keeps everything on
  the device. Airshow photos stay on the device that took them.
- **Online leaderboard.** Anyone can read the week's ranked board; signed-in pilots who
  have finished their placements appear on it.

The code is in `src/net/cloud.ts` (sign-in, sync, leaderboard), `src/net/cloudSave.ts`
(what counts as the save and how a device and an account agree, unit-tested) and
`src/ui/menu/accountModal.ts`. The tables and their row level security are in
`supabase/migrations/` (run once in the SQL Editor). Builds need `VITE_SUPABASE_URL`
and `VITE_SUPABASE_PUBLISHABLE_KEY` (in `.env` locally, in `deploy.yml` for GitHub
Pages, in the project settings on Vercel); without them the game simply has no
accounts. The claude.ai artifact keeps its own storage and board.

---

## Building and development

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload at http://localhost:5173 |
| `npm run typecheck` | `tsc --noEmit` over the whole project |
| `npm test` | Unit tests (see below) |
| `npm run build` | Type-check, then the multi-file site in `dist/` (what GitHub Pages serves) |
| `npm run build:single` | Type-check, then one self-contained `dist-single/index.html` |
| `npm run build:exe` | The single-file build wrapped in a portable Windows app (Electron) |
| `npm run changelog` | Regenerate `CHANGELOG.md` from the release notes in `src/version.ts` |
| `npm run server` | Run the multiplayer server locally |
| `npm run cinematics` | Render the loading-screen photographs in the game engine |
| `npm run preview` | Serve the built site |

### Tests

`npm test` runs `scripts/test.mjs`: every `tests/**/*.test.ts` is bundled with esbuild
(shipped with Vite) and run with Node's built-in test runner. No browser and no extra
packages. There are 75 tests: `tests/air` covers the ranked maths (ranks, RP, MMR,
placements, weekly reset) and `tests/ocean` covers the acoustics, the Echo Atlas, the
controls, both expeditions, geography, sea life, the manipulator arm, the sub's physics
and sea-bed streaming.

### Deploying

- **Website**: `.github/workflows/deploy.yml` builds the site plus the offline
  single-file copy (`triad-offline.html`) and publishes them to GitHub Pages on every
  push to the release branch (`claude/bold-darwin-occlgg`; it can also be run by hand from
  Actions); pull requests build as a check without deploying. Open games (in a browser or
  the Windows app) check for a new build every 15 s and switch to it at the main menu.
  Enable Pages with source "GitHub Actions" in the repository settings.
- **Windows app**: `.github/workflows/desktop.yml` builds the portable `.exe` and
  publishes it as the `desktop` release. It runs by hand only (Actions → Run workflow).
- **claude.ai artifact**: `npm run build:artifact` builds and checks
  `dist-artifact/index.html`, which is published to the game's artifact. Every change
  ships to both the website and the artifact (see `CLAUDE.md`).
- **Servers**: `render.yaml` as described in [Multiplayer](#multiplayer).
- **Vercel** (optional): `vercel.json` deploys the site and the game server as one
  project with two services: `app` (the Vite site, at `/`) and `server`
  (`server/server.mjs`, at `/api`). The site built there talks to its own server at
  `wss://<domain>/api` (`VITE_TRIAD_SERVER=/api`); set `TRIAD_OFFICIAL=1` in the
  project's environment variables for rooms OFFICIAL 1-5, and the console is at
  `/api/admin`. Vercel runs the server on its Functions (WebSockets beta): rooms live
  in memory, so players can land on different instances, and connections close at
  the function's maximum duration. The GitHub Pages site, the Windows app and the
  artifact keep using the Render servers.

### Cinematics

`tools/cinematics` composes in-engine shots: each shot script starts a mission, poses
the aircraft and the sun, frames the camera and settles the frame. `run.cjs` captures
them at preview, 1440p or 8K, on the graphics card or, with `CINE_SOFTWARE=1`, headless
on the CPU. The loading screen's photographs come from here.

### Dependencies

One runtime dependency: **three.js**. Development uses TypeScript, Vite and
`vite-plugin-singlefile`. The desktop app adds Electron. The server needs only the `ws`
WebSocket package.

---

## Project layout

```
src/
  main.ts          entry point: boots the launcher and the chosen program
  version.ts       version and release notes per program (CHANGELOG.md is built from it)
  core/            maths, noise, RNG, atmosphere, input and bindings, settings, weather, GPU tier
  world/           terrain function and generator, islands and maps, LOD streaming on
                   workers, trees, ocean and waves, clouds, airfields, carriers
  render/          renderer, environment and sky, fog, post-processing (bloom, depth of
                   field, vision effects, final pass), particles, trails, vapour, heat haze,
                   night and goggles, cameras, cockpit view, Earth curvature
  aircraft/        specs, flight model, damage, pilots, the jet library
    models/        procedural 3D models: kit.ts (lofts, wings, skin and livery shader),
                   parts.ts (intakes, nozzles, gear...), paint, one file per aircraft
  weapons/         missiles, guns and gunnery, bombs and the bombing computer, countermeasures
  sensors/         radar, IRST, RWR and missile warning, signatures
  ai/              skill levels, steering, the AI pilot, the APEX battle commander
  avionics/        display pages, gauges, navigation (steerpoints, TACAN, ILS, fuel)
  game/            simulation, game modes (modes/), spawning, campaign, ranked, airshow,
                   carriers and navy, tanker, Auto-Fly, logbook, replay, spectator, pro camera
  net/             multiplayer client, server list, room link and director for artifacts,
                   ranked leaderboard
  ui/              HUD, launcher, menus and hangar, map, debrief, settings, touch controls,
                   replay and spectator controls, airshow album, weather widget
  audio/           synthesised sound engine, DSP, menu music
  space/           the space program: universe, Saturn V, launch vehicles and missions,
                   Mars and Starship, rovers, the Solar System explorer, time warp
  ocean/           the ocean program: sub physics, acoustics, the dive, the Echo Atlas,
                   missions, rendering, performance presets and benchmark
tests/             unit tests (air, ocean)
scripts/           test runner, changelog generator
server/            multiplayer server, Dockerfile, admin page
desktop/           Electron wrapper for the Windows app
tools/cinematics/  in-engine shot scripts and renderer
docs/              design notes (OCEAN.md)
public/            static assets served as-is (cinematic stills, hi-res images)
```

The space and ocean programs are split into their own lazily loaded chunks, so players
of one program never download the others' code.

---

## Release notes

Release notes live in `src/version.ts`, newest first, with separate notes for each
program (`air`, `space`, `ocean`). Each note is a short headline with detail points,
tagged NEW, IMPROVED or FIXED. The game shows them in each program's **NOTES** panel,
opens them by itself the first time there is something new, and badges the launcher card
until they are read. `npm run changelog` writes the same notes to
[CHANGELOG.md](CHANGELOG.md).
