# OCEAN mode

The third program beside TRIAD air combat and SPACE EXPLORATION. One survey
submersible, one coastal region, one complete expedition, built around
listening, navigation and atmosphere rather than survival or crafting.

## Playing

Pick **OCEAN** from the program menu under the TRIAD logo. The menu has three
pages:

- **MISSIONS**: *Quiet Survey: The Silent Buoy* (begin, continue, start over),
  a **Free Survey**, and a follow-up contact that opens when the expedition is done.
- **HARBOR**: the boat, the ocean's settings and the benchmark.
- **CHART**: the Echo Atlas (chart, contacts with their bearings and story,
  evidence, expedition log).

Keys (also on the CONTROLS page and in a dive with H):

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
| `render/*` | Light in water (`oceanMaterial.ts`), sea surface and sky (`water.ts`), streamed sea bed (`seabed.ts`), harbor / reef / wreck (`props.ts`), the boat (`subModel.ts`), particles, shafts, lamp beams, sonar overlay and waterline (`fx.ts`), fish (`fish.ts`), and the scene (`oceanWorld.ts`). |
| `dive/dive.ts`, `dive/hud.ts` | The dive: input, cameras, tools, saving, the instruments and the Quiet Survey panel. |
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

- The sea bed streams as a three-level quadtree of 160 / 320 / 640 m tiles within
  a per-frame time budget, nearest and ahead first; a tile that is no longer
  wanted stays until whatever replaces it is built, so no holes open.
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

## Deferred

The smallest coherent version was built first. Not in this slice:

- Touch and gamepad controls for the dive (keyboard and mouse only).
- The follow-up contact's source: it can be heard and triangulated in a free
  survey, but there is nothing to find at the end of it yet.
- Sea-bed tile building in a Web Worker (a single fine tile can take ~10-20 ms on
  a slow CPU; it happens once per tile, mostly when the camera jumps).
- More regions, vehicles (ROV, research sub), a diver, and cross-mode links.
- Multiplayer.
- Real hydrophone recordings: the contact sounds are synthesised.
