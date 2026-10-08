# OCEAN mode

The third program beside TRIAD air combat and SPACE EXPLORATION. One survey
submersible, one coastal region, an expedition and its follow-up, built around
listening, navigation and atmosphere rather than survival or crafting.

## Playing

Pick **OCEAN** from the program menu under the TRIAD logo. The menu has three
pages:

- **MISSIONS**: *Quiet Survey: The Silent Buoy* (begin, continue, start over),
  a **Free Survey**, and *The Slow Pulse*, the follow-up that opens when the
  expedition is done: the pulse on the wreck's recorder comes from the Kestrel
  Marine Lab's deep mooring K3 (top float 282 m down, inside the boat's 300 m
  rating; anchor and a lost container 339 m down, outside it, seen only on the
  multibeam).
- **HARBOR**: the boat, the ocean's settings and the benchmark.
- **CHART**: the Echo Atlas (chart, contacts with their bearings and story,
  evidence, expedition log).

Keys (also on the CONTROLS page and in a dive with H, with the gamepad and
touch controls):

| | |
|---|---|
| W / S, A / D | thrust ahead / astern, turn |
| ← / → | side thrusters |
| R / F | vertical thrusters |
| Z / X | flood / blow the ballast tanks |
| B | emergency blow (straight to the surface) |
| T / G | hold depth / hold position |
| Q | Quiet Survey (listen) |
| P | sonar ping (one turn of the scanning head) · N scanning sonar on / off · O sonar overlay |
| L / K | lamps / floodlights |
| E | scan, recover with the arm, dock |
| V | manipulator arm out / stowed; with it out W/S, A/D, R/F move the jaw and E grips |
| C | chase camera / pilot's dome |
| M | chart · Esc pause · , / . transit time ×1 ×2 ×4 |

A standard gamepad drives too (left stick, triggers up / down, bumpers side
thrust, D-pad tanks and holds, A use, B ping, X listen, Y lamps, right stick
look; hold A for the arm, B for the scanning sonar, Y for the floodlights). On
touch screens a stick and a button pad appear; the emergency blow (on the pad,
or D-pad up on a gamepad) must be held for 2 s.

### The sonar, the arm and the lights

- The sonar head turns: a ping is one full turn (3 s) from the bow, its 90 beams
  cast as the head passes them; the scanning sonar (N) keeps it turning, a ping
  a turn, and masks the hydrophones while it does. The overlay paints what the
  beam sweeps over (out to 280 m, range rings every 50 m) in blue that fades
  behind it, and a heading-up display shows the same picture.
- The arm is flown by its jaw in the boat's frame (`dive/manipulator.ts`): it
  reaches 2.1 m from the shoulder, never behind it or into the hull, rests on
  the bottom, and the joints follow by a two-link solution. It can take the
  expeditions' recorders and samples off the bottom (shells, stones, starfish,
  urchins, sea cucumbers), which stay gone for the dive and go into the Echo
  Atlas when stowed in the basket.
- The floodlights are lenses round the hull and one light at the middle of the
  boat that stands for them (cheaper than seven); the marine snow and the silt
  are lit by it too.

## How it is built

Everything lives in `src/ocean/` and is loaded only when the program is first
opened (`src/ocean/oceanProgram.ts`, a separate chunk); the menu
(`src/ui/menu/oceanMenu.ts`) is in the main bundle.

| Module | What it does |
|---|---|
| `world/geo.ts` | The region: sea bed height function, coast, harbor, sites, regions, colliders. Pure. |
| `world/waves.ts` | The swell: the same wave sum on the CPU (the hull floats on it) and in GLSL; the breakwater's shelter. |
| `sub/subPhysics.ts` | SV-1 PETREL: fixed 1/60 s steps, thrust, quadratic drag, buoyancy by submerged fraction, vent / pump / blower ballast, depth and position assists, hull collisions, battery. Pure. |
| `acoustics/acoustics.ts` | Passive sonar equation in real units (source level, spherical spreading, Thorp absorption, Knudsen sea noise, own noise), the listening procedure, bearings, triangulation, active sonar rays. Pure. |
| `atlas/atlas.ts` | The Echo Atlas: contacts, observations, evidence, tracks, markers, expeditions; saved in localStorage, tolerant of damaged saves. |
| `mission/expedition.ts` | The expedition's ten stages as a state machine over plain state; checkpoints and career. Pure. |
| `mission/followup.ts` | The follow-up's nine stages, the second listening point and the multibeam's reach. Pure. |
| `render/*` | Light in water (`oceanMaterial.ts`), sea surface and sky (`water.ts`), streamed sea bed (`seabed.ts`, its tiles built by `seabedArrays.ts` on a worker thread, `seabedWorker.ts`) and its close-up detail (`seabedDetail.ts`), harbor / reef / wreck / mooring (`props.ts`), the boat (`subModel.ts`), particles, shafts, lamp beams, sonar overlay and waterline (`fx.ts`), fish (`fish.ts`), sea-floor life (`seabedLife.ts`), jellyfish (`jellies.ts`), stirred-up silt (`silt.ts`), bioluminescence (`biolum.ts`), the sonar sweep's disc (`sonarSweep.ts`), and the scene (`oceanWorld.ts`). |
| `dive/dive.ts`, `dive/hud.ts` | The dive: input, cameras, tools, saving, the instruments and the Quiet Survey panel. |
| `dive/controls.ts` | Touch and gamepad controls, feeding the same orders as the keys. |
| `audio/oceanAudio.ts` | Sea, thrusters, pumps, hull, hydrophones and pings through the game's effects bus. |
| `perf/presets.ts`, `perf/benchmark.ts` | The three presets and the benchmark route. |

The pure modules have unit tests in `tests/ocean/` (`npm test`).

### Light in water

Every material in the scene gets the same shader patch: daylight on a surface
is dimmed per colour by the depth of that surface (diffuse attenuation, red
first), lamp light loses its red over the distance it travels, and the part of
each sight line that is under the surface extinguishes the colour behind it and
adds the light scattered in the water at that depth. Because the underwater part
is worked out per pixel, a camera at the waterline sees air above and sea below.
The surface shows the sky by Fresnel's law from above and Snell's window with
total internal reflection from below. Exposure adapts to the light round the
camera.

### Life and detail in the water

- The sea bed's close-up detail is worked out per pixel on top of the tile's
  colour: wave ripples across the swell (longer and fainter with depth, gone
  below about 90 m), grains and shell hash, rock relief with crevices and
  coralline crusts in the shallows, and burrows and mounds on the deep silt.
  The relief tilts the normal near the camera (25-140 m fade).
- Sea-floor life is placed by a hash of 16 m cells round the camera, the same in
  every dive, each kind where it lives: seagrass meadows on shallow sand (2.5-18
  m), shells, urchins on rock and reef, starfish, sea pens, brittle stars and
  sea cucumbers on the deeper sand and silt, glass sponges below 150 m. The
  seagrass leans with the surge in the vertex shader.
- Jellyfish: moon jellies in drifting aggregations in the upper 30 m over the
  shelf, deep-red helmet jellies below 120 m in the basin (seen only in the
  lamps, and losing their red with distance). Their bells pulse and their
  tentacles trail in the vertex shader; the bell scatters the daylight coming
  down through it.
- Silt: the thrusters' wash near sand or mud, or a touch on the bottom, lifts
  billowing clouds lit by the daylight at their depth and by the lamps. Fine
  silt hangs for about half a minute and drifts with the current; sand drops
  out within seconds.
- Bioluminescence: in dark water (daylight below a set level) the hull and the
  thrusters' wash set off blue-green sparks that flare and fade over a second
  or so.
- Seen from below, the surface is drawn before the transparent things in the
  water (none of which write depth), so it never paints over them.

### Performance

- The sea bed streams as a three-level quadtree of 160 / 320 / 640 m tiles,
  nearest and ahead first; a tile that is no longer wanted stays until whatever
  replaces it is built, so no holes open. The tiles are built on a worker thread
  (a few at a time); the main thread only turns the arrays into a mesh, within a
  per-frame budget. Where no worker can start, tiles are built on the main
  thread as before.
- The wreck's detailed model is built within 520 m and released beyond 760 m.
- Fish swim entirely in the vertex shader; the reef and kelp are instanced.
- Presets change only the look (render scale, water and sea-bed detail, foam,
  caustics, light shafts, particles, silt and spark pools, fish, reef, sea-floor
  life and jellyfish density, lamp shadows); every clue, control and sonar
  reading is identical on all three.

### Benchmark

HARBOR ▸ BENCHMARK runs a fixed route (harbor at dawn, rough overcast surface,
through the waterline and back, the reef, the wreck with lamps, the deep basin,
a spell of listening) and reports per segment: median, p95, p99 and worst frame
interval, frames over 50 ms, average FPS, the game's own work per frame, draw
calls and triangles; for the run: sea-bed tiles built / released, the slowest
tile build, frames whose streaming work exceeded 8 ms, the wreck's builds,
geometries, textures, shader programs and JS heap (Chromium). From the console:
`await triadBench('balanced')` or `triadBench('performance', 15)` (15 route
steps per second for slow machines: the same path in fewer frames).

The proposed targets are 60 FPS on Performance and Balanced and 30 FPS on
Cinematic on a desktop graphics card. The only measurements so far are on a
machine with no graphics card (Chromium drawing on the CPU with SwiftShader,
960 × 540 window, 15 route steps per second, production build), so they show
relative cost, not the frame rate a player will see:

| Preset | Render size | Median frame | p95 | p99 | Game's own work (median / p95) | Heap start → end |
|---|---|---|---|---|---|---|
| Performance | 540 × 304 | 156 ms | 220 ms | 281 ms | 2.0 / 6.6 ms | 77 → 77 MB |
| Balanced | 720 × 405 | 332 ms | 442 ms | 565 ms | 2.3 / 8.3 ms | 78 → 82 MB |
| Cinematic | 720 × 405 | 378 ms | 537 ms | 715 ms | 2.9 / 9.8 ms | 83 → 89 MB |

On that machine nearly all of each frame is the software rasteriser; the
game's own work (simulation, acoustics, streaming, submitting the draws) is
2-3 ms. Three passes of the route in one session kept the counts steady
(325-326 geometries, 51 textures, 40-41 shader programs; heap 78 → 82 MB), and
after switching between the three programs three times they were the same in
the second and third rounds (939 geometries, 109 textures, 81 programs). The first frames
after leaving the menu (up to 1.4 s on Performance, 6 s on Cinematic while the
shadow shaders compile) are reported apart from the totals.

The sea-bed worker, measured the same way on one production build (BALANCED, one
run each, `triadBench('balanced', 15, false)` against `triadBench('balanced', 15)`):

| | Tiles built on the main thread | On the worker |
|---|---|---|
| Slowest tile, main-thread cost | 13.9 ms | 4.4 ms (making the mesh only) |
| Frames with more than 8 ms of sea-bed work | 9 | 0 |
| Game's own work per frame, median / p95 | 2.5 / 8.9 ms | 2.2 / 6.4 ms |
| Frame interval, median | 331 ms | 331 ms |

On that machine the frame interval is the software rasteriser's; what the worker
takes away is the sea bed's share of the game's own work, the spikes a player
with a real graphics card would feel as hitches.

## Deferred

The smallest coherent version was built first. Not in this slice:

- More regions, vehicles (an ROV to go down K3's line past PETREL's rating, a
  research sub), a diver, and cross-mode links.
- Remappable gamepad buttons (the layout is fixed to the standard mapping).
- Multiplayer.
- Real hydrophone recordings: the contact sounds are synthesised.
