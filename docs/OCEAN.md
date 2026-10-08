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
| P | sonar ping · O sonar overlay |
| L | lamps |
| E | scan, recover with the arm, dock |
| C | chase camera / pilot's dome |
| M | chart · Esc pause · , / . transit time ×1 ×2 ×4 |

A standard gamepad drives too (left stick, triggers up / down, bumpers side
thrust, D-pad tanks and holds, A use, B ping, X listen, Y lamps, right stick
look). On touch screens a stick and a button pad appear; the emergency blow (on
the pad, or D-pad up on a gamepad) must be held for 2 s.

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
| `render/*` | Light in water (`oceanMaterial.ts`), sea surface and sky (`water.ts`), streamed sea bed (`seabed.ts`, its tiles built by `seabedArrays.ts` on a worker thread, `seabedWorker.ts`), harbor / reef / wreck / mooring (`props.ts`), the boat (`subModel.ts`), particles, shafts, lamp beams, sonar overlay and waterline (`fx.ts`), fish (`fish.ts`), and the scene (`oceanWorld.ts`). |
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
  caustics, light shafts, particles, fish, reef density, lamp shadows); every
  clue, control and sonar reading is identical on all three.

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

## Deferred

The smallest coherent version was built first. Not in this slice:

- More regions, vehicles (an ROV to go down K3's line past PETREL's rating, a
  research sub), a diver, and cross-mode links.
- Remappable gamepad buttons (the layout is fixed to the standard mapping).
- Multiplayer.
- Real hydrophone recordings: the contact sounds are synthesised.
