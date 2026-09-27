# Changelog

Every update gets a version number and notes here. The same notes are shown
in the game under **WHAT'S NEW** on the main menu.

## v3.1.0 — Physics update and bug fixes (2026-09-27)

- PHYSICS: the wings now feel the wind on the runway too. Into a headwind you lift off sooner and roll shorter (about 20% less runway with a 20 kt headwind); with a tailwind it takes longer.
- Jet wash and wake turbulence: flying close behind another jet puts you in its trailing vortices, so you get bumps, sink and a roll kick near a vortex core. It's strongest right behind a heavy, slow, hard-pulling jet and fades out about a kilometre back.
- Gun recoil: firing the cannon pushes back on the jet (about 16 kN for the F-15's M61), so long bursts cost some speed.
- Sideslip drag: flying sideways on the rudder now costs energy, as it does on a real jet.
- Negative-G overstress: pushing well past the negative G limit now over-stresses the airframe, and extreme negative G breaks it.
- Engines spool up and down more slowly in thin air at high altitude.
- External stores now add drag gradually through the transonic range, instead of jumping suddenly at Mach 1.
- Missile rocket motors produce a little more thrust at altitude, where there's less air pressure pushing back on the nozzle.
- Chaff clouds and flares slow down and drift with the wind.
- Fixed: cannon rounds could pass straight through a wing without hitting.
- Landing grades now use your airspeed at touchdown, not your ground speed.
- Fixed: in free-for-all, the drop-in countdown said 'weapons free in 6 s' but nothing held fire; nobody can shoot until weapons free now.
- Fixed: AI pilots low on fuel in free-for-all flew 'home', straight out of the zone and into the storm; they now fight on.
- Fixed: respawning in Free Flight with the fire key left the camera stuck on the death view, with the old gear and HUD state.
- Fixed: hit markers appeared for Su-35S missile hits; they're for gun hits only.
- Fixed: Su-35S messages named the AIM-9X and PIRATE; they now say R-74M and OLS-35.
- Fixed: the Duel record counted mutual kills as losses (now shown as draws); restarting a Duel or Waves mission left decoys in the air; restarting Waves from wave 1 didn't reset the mission clock.

## v3.0.0 — New sound engine and realistic jet models (2026-09-27)

- ALL-NEW SOUND ENGINE: every sound in the game has been rebuilt from scratch. It is all generated live (no recordings), so it follows exactly what your jet is doing.
- Fixed: the constant 'fan' drone is gone. It came from the old gun sound, which kept humming quietly in the background even when you were not firing.
- Jet engines: a layered engine sound (deep exhaust rumble, roar and jet hiss) that breathes with natural turbulence instead of a steady hum, plus a faint turbine whine that rises with the throttle. Each jet sounds different: F-15EX (F110), Super Hornet (F414), Typhoon (EJ200, the highest-pitched) and a deeper, heavier Su-35S (AL-41F1S).
- Where you listen from matters: behind a jet you hear the roar, in front of it the turbine whine, and in the cockpit everything is muffled through the canopy. In the outside views the sound fades with distance.
- Afterburner: a deep rumble with popping crackle, and a 'whump' when it lights.
- Airflow: wind rush that grows with speed, a canopy whistle, buffet when you pull hard or fly at high angle of attack, a rumble with the gear down, and the hiss of the cockpit air conditioning.
- Other jets that pass close by roar past with a Doppler pitch shift.
- Guns are rendered shot by shot at each gun's real rate of fire: the M61's BRRRT spins up and down, and the Typhoon's 27 mm and the Su-35S's 30 mm cannons thump.
- Also new: missile launches, explosions (delayed and muffled with distance), hits, flares and chaff, gear and mechanical clunks, the Sidewinder growl, RWR tones and warnings. A limiter keeps loud moments from distorting.
- MORE REALISTIC JET MODELS, all four jets:
- Paint: panel seams are now engraved into the skin and catch the light, with subtle paint mottling, varying gloss, and grime along the belly and toward the tail.
- Engine nozzles rebuilt: overlapping petal plates, the actuator ring and rods, and heat-stained metal (pale bronze at the root, straw, then blue toward the exit, sooty at the lip). Inside they are now dark and sooty with the afterburner flame holders visible, instead of a bright pale tube. At normal power they no longer glow in daylight; only the afterburner lights them up.
- Thinner, more realistic canopy frames.
- Su-35S: a proper interlocking splinter camouflage in three blue-greys (replacing the patchy see-through shapes), a slightly drooped radome like the real Flanker, and more raked intakes. The dorsal airbrake is gone, as on the real Su-35S; the rudders now splay outward to act as the airbrake.
- Typhoon: the PIRATE infrared sensor ahead of the windscreen, the BK-27 cannon blister in the right wing root, the refuelling probe fairing, and a deeper chin intake. Its splitter plate is now painted (it used to show as a black block).
- F/A-18E/F: the refuelling probe hump on the right side of the nose.
- F-15EX: gets the new paint, nozzles and canopy; its shape is unchanged.

## v2.2.3 — Accurate missile racks (2026-09-26)

- Missile racks researched from the real jets (the F-15EX is unchanged):
- F/A-18E/F Super Hornet: AIM-9X on the wingtip LAU-127 rails, a single missile hung under each outboard pylon, and an LAU-115 twin rack on each middle wing pylon with two AMRAAMs side by side on LAU-127 shoulder rails (as in the Navy's 'Murder Hornet' air-to-air loadout), plus the fuselage cheek AMRAAMs. A fuel tank on the middle station hangs from the pylon centre.
- Eurofighter Typhoon: back to one missile per wing pylon, as on the real jet (no twin racks), with the AMRAAMs semi-recessed under the fuselage.
- Su-35S: one missile per hardpoint as on the real Flanker, on chunkier Russian APU-170 / P-72 style launchers: R-74M on the wingtips and outer pylons, R-77M on the inner pylons, under the engine nacelles and in the tunnel between the engines.
- Loadouts, missile counts and handling are unchanged.

## v2.2.2 — No more freeze on kills (2026-09-26)

- Fixed: the game froze for a couple of seconds every time a jet was shot down. When a jet was destroyed, its paint job was copied to scorch the wreck, and each copy needlessly converted the whole livery (large texture data) to text, once for every part of the airframe. The wreck is now scorched with a lightweight copy, shared across parts: the kill that took seconds now takes about 3 thousandths of a second, so explosions play smoothly.

## v2.2.1 — Aligned missile racks (2026-09-26)

- Missile racks rebuilt on all four jets to match the real thing: missiles now ride in matched pairs on twin-rail racks, side by side on the shoulders of a shared pylon (like LAU-128s on an F-15 pylon), level with each other, parallel to the fuselage and with their noses lined up.
- F-15EX: both wing pylons are twin racks, four missiles per wing in two neat pairs, plus the tandem pairs along the conformal tanks.
- F/A-18E/F: the outboard wing pylon is a twin rack, level with the inboard pylon. Typhoon: the wing missiles pair up on one twin rack. Su-35S: the inner wing pair shares a twin rack and the outboard missile rides a shoulder rail at the same height.
- Fuel tanks on a rack station hang from the middle of the pylon, below the shoulder missiles. Loadouts, weapon counts and handling are unchanged, and missiles launch from their new rail positions.

## v2.2.0 — XP and levels removed (2026-09-26)

- Removed the pilot XP, level and money system completely: no pilot card on the main menu, no XP pop-ups or XP bar in flight, no level-up celebration, no XP section in the debrief, and its saved data is cleared. Everything else plays exactly the same.
- Free-for-all: the bounty and your placing work as before, just without XP or money attached.

## v2.1.1 — Black screen fix (2026-09-26)

- Fixed: the screen could go completely black as soon as you started flying on some graphics cards. A very bright sun glint off glossy paint or a canopy could overflow the HDR picture buffer, and the new bloom smeared that broken pixel across the whole screen. The picture is now cleaned before bloom, so this can't happen any more, and bloom still glows as before.
- Hardened the haze, cloud and free-for-all storm-wall shaders against the same kind of invalid values.

## v2.1.0 — Free-for-all: Last Pilot Standing (2026-09-26)

- NEW GAME MODE: FREE-FOR-ALL — LAST PILOT STANDING. 12 jets in the sky: you and 11 AI pilots, every jet hostile to every other jet. No teams, no wingmen, no respawns. Last jet flying wins.
- Drop-in: all twelve jets start spread around a ring over the contested island, facing inward at staggered altitudes, with a short countdown before weapons are free.
- The shrinking zone: the battle zone closes in stages toward a random final circle (40 NM down to 3 NM, then SUDDEN DEATH). Outside it the storm tears your jet apart, slowly at first and faster every stage; the screen glows purple and a countdown tells you how long you have. Back inside, the airframe slowly recovers. You see the storm as a towering wall of light in the sky, and on the minimap and the map [M] as a solid ring (the zone now) and a dashed ring (where it goes next).
- Scavenging: every kill puts a missile of each type back on your rails and refills some gun rounds, flares, chaff and fuel. No ground crews in a free-for-all.
- Bounty: the pilot with the most kills (2 or more) carries a gold bounty. Their position is revealed to everyone, with a gold marker on your HUD and minimap, and every AI hunts them. Claiming it pays +150 XP and $600. If you carry it, everyone is coming for you.
- Smarter free-for-all AI: pilots pick off damaged jets, third-party fights that are already going on, hunt the bounty and reposition into the next circle before it closes. In the final circles every jet is revealed on radar and nobody can hide behind the mountains, so matches end in a fight instead of a stand-off.
- FINAL DUEL: when two jets are left, both are fully rearmed for the showdown.
- Shot down? Spectate the rest of the match: watch any pilot, see everyone's kills and who has the bounty, fly a free camera, press [T] to fast-forward 4×, or quit from the pause menu.
- Results: your placing out of 12 with a full scoreboard (placing, kills and when each pilot went down), then XP and money: 1st pays 600 XP / $3,000, 2nd 350 / $1,500, 3rd 250 / $1,000, and everyone else earns XP for each pilot they outlasted.
- Match options on the main menu: AI difficulty, opponent jets (all four types, or all the same as yours), match pace (Quick ~6 min, Standard ~9 min, Long ~13 min) and weapons (all, heaters + gun, or guns only). Works on both maps.
- Logbook: a new FREE-FOR-ALL section (matches, wins, top-3 finishes, best placing) and three new decorations: LAST PILOT STANDING, PODIUM and BOUNTY HUNTER.
- Fixed: Su-35S kills with the GSh-30 cannon, R-77M and R-74M never counted toward the gun-kill, long-shot and knife-fight decorations.
- Fixed: the theater map [M] always said 400 × 400 NM; it now names the map you are flying and its real size.

## v2.0.0 — Graphics overhaul (2026-09-26)

- GRAPHICS OVERHAUL: every part of the picture is now adjustable, from one overall preset down to individual effects, and changes apply instantly while you watch.
- Overall quality presets: LOW, MEDIUM, HIGH, ULTRA and 4K ULTRA. Pick one to set everything at once; change any single option and the preset shows CUSTOM.
- 4K: RENDER RESOLUTION can be NATIVE, 1080p, 1440p or 4K. 4K renders a true 3840 × 2160 picture (downsampled to your screen if it is smaller) for razor-sharp jets and ridgelines. A resolution scale slider fine-tunes it, and the settings show exactly what is being rendered plus your live frame rate.
- Anti-aliasing: OFF, MSAA 2×, 4× or 8× smooths jagged edges. The main-menu hangar now gets anti-aliasing, bloom and the picture settings too.
- Mountain lighting: the whole theater is lit from the real sun. Mountains cast long, soft shadows across valleys, fjords and the sea (huge at dawn and dusk), and deep valleys and gorges get less sky light while peaks are fully lit. Shadowed snow picks up the blue of the sky, and the water in a mountain's shadow loses its sun glitter.
- Cloud shadows: every cumulus casts a soft shadow that drifts across the land and the sea below it; mountains above the cloud base stay in the sun.
- Light scattering: the haze glows around the sun like real sunlight through air, strongest at dawn and dusk, and backlit clouds get bright silver linings. A low sun warms the horizon around it.
- Bloom: very bright light (the sun, afterburners, flares, explosions, runway lights) glows softly. Adjustable from OFF to 150%.
- Shadows: OFF, LOW, MEDIUM, HIGH or ULTRA, from 1024 up to 8192-pixel shadow maps with softer edges on the higher tiers.
- Picture: BRIGHTNESS, CONTRAST and SATURATION sliders, a lens VIGNETTE and three TONE MAPPING styles (Neutral, Filmic and the soft, natural AgX), with a one-click RESET PICTURE.
- Clouds: new OVERCAST option (Clear, Scattered, Broken, Overcast), plus CLOUD QUALITY from Low to Ultra for fuller, rounder cumulus.
- Redesigned SETTINGS: a new panel slides in from the right with a see-through backdrop so you can judge graphics changes on the jet or the world behind it. It has side tabs (Graphics, Controls, Audio, Gameplay), preset cards, clear sections and a short explanation under every option, plus sliders that show their values and on/off switches. It works from the main menu and the pause menu, and it fits phone screens too.
- Fixed: the loading screen always said 'GENERATING THE 400 × 400 NM THEATER'; it now names the map you're loading and its size.

## v1.9.2 — Chase camera auto-recenter (2026-09-26)

- Chase camera auto-recenter: when you look around your jet in the chase view, the camera now glides smoothly back to its normal position behind the jet after 1.8 seconds without moving it. It eases in gently, sweeps home the short way round (even after a full orbit) and settles softly, with no snapping.
- It never pulls the view away while you're still looking: as long as you hold the right mouse button (or the middle button, or keep your finger on the touch look area), the camera stays exactly where you put it. The 1.8-second timer only starts once you let go.
- The recenter only applies to your own jet in flight. The cockpit view, the spectator camera and replays keep the view where you leave it.

## v1.9.1 — Giant mountains (2026-09-26)

- Frostfall Strait mountains rebuilt: no more spiky knife-edge peaks. The mountains are now broad and massive, like Mount Fuji: huge snow-capped cones 20 to 40 miles across, with long sweeping concave flanks rising to a small summit crater, and gullies and ribs running down their sides.
- Lots more big mountains: every landmass is covered in these giant cones, many of them rising over 20,000 ft and the biggest above 26,000 ft, standing on wide rounded ranges instead of jagged ridges. Hvitøy's dividing wall is a broad mountain wall now too, and the rocky islets are small snow cones.
- Real snow line: the lower slopes of the mountains show bare russet volcanic rock and scree streaking up the gullies, with the snow cap above, like the reference photo, so you can see how tall they really are from the air.
- All six Frostfall airfields keep clear approach valleys through the new mountains.

## v1.9.0 — Frostfall Strait, new water, 3 new wraps (2026-09-26)

- NEW MAP: FROSTFALL STRAIT, a frozen arctic archipelago of 200 × 200 NM (half the size of the first map), and the new default theater. Five big snow-covered landmasses (NORDLAND and SØRVIK for BLUE, ØSTMARK and KRAGFJELL for RED) with the contested island of HVITØY in the middle of the strait, plus scattered rocky islets (SKJÆR).
- Really tall mountains: jagged, ridged ranges climb straight out of the sea to around 26,900 ft, with sharp knife-edge ridges, bare rock on the steep faces, snowfields and glaciers everywhere else, and ice cliffs at the shoreline. Deep glacial valleys lead into every runway so approaches stay clear, and a wall of peaks splits Hvitøy between its BLUE and RED airfields.
- Pack ice: the sea around the coasts breaks up into white ice floes separated by dark leads of open water, just like the real Arctic.
- Six new airfields: NORDHAVN AB, ISVIK AB and HVITØY WEST AB (BLUE); KRAGEN AB, SVALBRU AB and HVITØY EAST AB (RED), each with its own TACAN channel. The cockpit kneeboard lists the airfields of whichever map you're flying.
- The original map is now called TRIAD ISLES (Skye, Capri and Samos, 400 × 400 NM).
- Theater picker: choose FROSTFALL STRAIT or TRIAD ISLES on the THEATER card on the main menu. Your choice is saved; the game reloads the world when you switch.
- Every game mode works on both maps: Free Flight from any friendly base, Waves, 1v1 Duel (head-on or from the runways on either side of the contested island's mountain wall) and 5v5 Team Battle. On Frostfall Strait the fights start around 29,500 ft, above the peaks, and the AI terrain-masks through the valleys.
- New water on both maps: a calm, still sea designed to look good from 20,000 ft up. It is deep navy far out, blending to rich blue and bright turquoise over shallow water near the coasts, following the real sea floor, with soft broad variations and a gentle sheen instead of busy moving waves. Frostfall has colder, darker arctic blues.
- 3 NEW WRAPS: INFERNO (charred black plates split by glowing molten veins that get hotter toward the tail), AURORA (night-sky navy with rippling green-to-violet northern-light curtains and stars) and GALAXY (deep space with purple and blue nebula clouds, dark dust lanes and glowing stars). All three glow softly in the dark. Pick them in CUSTOMIZE; you can recolour them with the base and pattern colours like any other wrap.
- Fixed: the WHAT'S NEW window could pop up over the top of a flight that had already started.
- Fixed: on the theater map (M), every island name after the first was drawn in tiny text instead of the large label.
- Fixed: mode descriptions, mission briefings and the free-flight base list no longer name the old islands when you're flying the other map.

## v1.8.0 — Pilot XP & levels, realistic afterburners (2026-09-26)

- NEW: Pilot XP, levels and money. Everything you do in the air earns XP; XP raises your level (1 to 100) and your rank, from CADET to GENERAL OF THE AIR FORCE. Your pilot card with level badge, rank, XP bar and money is at the top of the main menu, and it counts up your gains when you come back from a sortie.
- Kills pay XP and money, scaled by the enemy difficulty (Easy 60% up to Extreme 140%): 100 XP and $400 per kill at Hard, plus GUN KILL (+50 XP, $200), LONG SHOT past 20 NM (+40, $150), DOUBLE KILL within 12 s (+50, $250) and FIRST BLOOD (+25).
- Combat and flying XP: defeating a missile fired at you (+25 XP, $100); manoeuvres like HIGH-G TURN (7 G for 3 s), LOOP, AILERON ROLL, LOW PASS (under 200 ft above 350 kt), INVERTED FLIGHT and SUPERMANOEUVRE (Su-35S post-stall); SUPERSONIC, MACH 1.5 and MACH 2 once per mission; distance flown (20 XP per 10 NM, more when supersonic); and landings (Greaser +100 XP / $300, Good +60 / $150).
- Mission results pay out too: waves cleared, all 10 waves, 5v5 rounds and match wins, and duel wins.
- Fair levelling: each level needs a little more XP than the last (500 XP for level 2, then 150 more per level), so early levels come quickly and later ones stay reachable. Every level-up pays a cash bonus ($250 × the new level). You never lose XP or money. Manoeuvres have cooldowns and a cap per mission so they can't be farmed, and distance doesn't count while Auto-Fly is flying the jet.
- Animations: XP and money pop up as glowing toasts as you earn them (repeats stack, e.g. LOOP ×2), a slim XP bar above the weapons fills with a glow, and a level-up sets off a full-screen celebration with light rays, expanding rings, sparks, a gold level badge slamming in, 'PROMOTED' for a new rank, the cash bonus and a fanfare. The debrief shows everything you earned, with the totals counting up and the XP bar filling through each level-up.
- Photorealistic afterburners on all four jets: each engine now has a white-hot core, a main plume with real shock diamonds and flowing turbulence, and a faint outer heat haze that fades softly at the edges instead of a solid cone. The nozzles glow white-hot in the middle and orange at the rim, and the plume stretches in thin air at altitude. Western jets burn yellow-orange fading to violet; the Su-35S keeps its blue flame with bright diamonds.
- Fixed: Su-35S gun kills were credited to the 'BK-27' (the Typhoon's cannon); they now show the GSh-30.

## v1.7.6 — Smoother hangar camera (2026-09-26)

- Hangar camera: the drag direction is reversed (both left/right and up/down).
- Smoother camera: moves glide with gentler easing, and a quick flick keeps the view turning for a moment before it slows to a stop. Holding still before you let go stops it dead.
- Zoom in much closer: scroll (or pinch) right up to the jet to see the cockpit, missiles and nozzles up close. The camera centres on the jet as you zoom in and never goes inside the airframe.

## v1.7.5 — Hangar camera (2026-09-26)

- Look around the jet in the hangar: on the main menu (and the customize screen) drag anywhere on the empty space around the jet to orbit the camera, from low beside the jet to straight overhead. Scroll the mouse wheel (or pinch on a touch screen) to zoom in close or back out. Double-click to reset the view.
- The turntable stops its slow spin as soon as you take the camera, so the jet stays where you put it.
- The loadout note on the main menu now names both missile families (the Su-35S carries R-77M and R-74M, not AIM-120D and AIM-9X).

## v1.7.4 — Pusk! and model fixes (2026-09-26)

- Su-35S launch call is now just 'Pusk!' (Пуск, 'launch!'), for both the R-77M and the R-74M. It's spoken in Russian if your device has a Russian voice. The F-15EX, F/A-18E/F and Typhoon keep 'Fox three' (AIM-120D) and 'Fox two' (AIM-9X).
- Model fixes for the F-15EX, F/A-18E/F and Typhoon: every wing pylon and missile rail now sits under the wing at mid-chord. Before, many hung well ahead of the leading edge; the Typhoon's outer rails started almost 3 m in front of the wingtip, and some Super Hornet pylons floated 1 m ahead of the wing.
- Stores now hang the right distance below the wing for their size: a fuel tank sits lower than a missile on the same pylon, so tanks no longer cut into the wing and missiles no longer float below it. Missiles launch from where they visibly hang.
- Landing indexer fixed for all four jets: its on-speed angle of attack now matches how each jet actually flies at approach speed (F-15EX 12, F/A-18E/F 10, Typhoon 13, Su-35S 12 degrees). Before, the F-15EX, Super Hornet and Typhoon always showed 'slow' on a correct approach.

## v1.7.3 — Correct launch calls (2026-09-26)

- Launch calls fixed. F-15EX, F/A-18E/F and Typhoon use the NATO brevity codes again: 'FOX 3' / 'Fox three' for the AIM-120D and 'FOX 2' / 'Fox two' for the AIM-9X.
- Su-35S launch calls are now what Russian pilots actually say. They don't use 'Fox' codes: they name the missile and call 'Пуск!' ('launch!'). The feed shows 'Р-77М — ПУСК!' or 'Р-74М — ПУСК!', and the voice says it in Russian if your device has a Russian voice (otherwise 'R 77 M, pusk!').

## v1.7.2 — Missile calls (2026-09-26)

- Launch calls now say what you actually fired. Firing an R-77M shows 'R-77M AWAY (FOX 3)' in the feed and the voice says 'R 77 M away'; an R-74M says 'R-74M AWAY (FOX 2)'. The same goes for every jet: 'AMRAAM away' for the AIM-120D and 'Sidewinder away' for the AIM-9X.

## v1.7.1 — Su-35S complete (2026-09-26)

- The Sukhoi Su-35S is now COMPLETE: physics, handling, looks, cockpit and weapons have all been checked against the real jet's numbers and against the other three jets.
- Performance now matches the published figures: top speed Mach 2.25 (measured 2.27), service ceiling 59,060 ft (measured 59,000), about 1,950 NM of range on internal fuel. Mach 0.9 to 1.6 at 30,000 ft in 36 s; climb to 36,000 ft in about a minute.
- Aerodynamics tuned to the Flanker: less induced and supersonic drag (it cruises and climbs high the way the real jet does) and a little more maximum lift from its big wing and leading-edge flaps. It turns with the F-15EX and Typhoon on wing alone, 18-19 deg/s sustained and about 23 deg/s instantaneous at mid speeds, and beats them all once thrust vectoring comes in at low speed.
- Top-speed limit: every jet now hits a firm barrier just past its rated top speed (the Su-35S used to creep past Mach 2.3). The other jets are unchanged.
- Supermanoeuvre mode: when the Su-35S pilot switches on the override (L), the message now reads SUPERMANOEUVRE and the HUD shows SMV · TVC, so you know the 70 deg angle-of-attack envelope and thrust vectoring are open. Switch it off and the jet goes back to its 34 deg limit.
- Takeoff and landing: the Su-35S lifts off at about 190 kt (1,600 ft on afterburner, 2,900 ft on dry power), approaches at 160 kt, and the landing indexer is tuned to its 12 deg on-speed angle of attack.
- Model fixes: the engine nacelles now slope up toward the tail like the real Flanker, so the nozzles sit at wing level and the tail clears the runway in the landing flare. Ventral fins are shorter and canted, main gear moved to match.
- Weapons now hang where they should: every wing pylon sits under the wing at mid-chord (the outer ones used to hang ahead of the leading edge), and the wingtip R-74Ms sit on the tip launch rails.
- Cockpit: the OLS-35 sensor ball no longer blocks the bottom of the HUD view (the glareshield hides it, as in the real jet). Checked both 15 in displays, the HUD, and the weapon and stores readouts for the R-77M, R-74M and GSh-30-1.
- Checked: no wobble after rolling out of turns, steady aim tracking, clean recovery from 70 deg AoA in about 1.4 s, and fair duels against every jet (roughly even with the Typhoon, a little behind the F-15EX, ahead of the Super Hornet).

## v1.7.0 — Sukhoi Su-35S (2026-09-26)

- New jet: SUKHOI SU-35S. Single-seat, twin-engine, super-manoeuvrable air-superiority fighter: 71.9 ft long, 49 ft span, 19.4 ft tall, 76,059 lb max takeoff weight, two Saturn AL-41F1S afterburning turbofans (32,000 lbf each), Mach 2.25, 59,060 ft ceiling, 1,944 NM range, same G limits and G effects as the other jets.
- 3D thrust vectoring: the Su-35S's nozzles swivel with the controls, so it keeps full pitch, roll and yaw control at speeds where the other jets run out of air over their control surfaces. Squeeze the G-limiter override (paddle) and it can hold the nose up to 70 degrees angle of attack without departing, for Cobra-style nose pointing and very tight slow-speed turns. Release it and the jet recovers in about a second. AI Su-35 pilots use it too.
- Su-35S weapons, for the Su-35S ONLY (no other jet can carry them): R-77M active-radar long-range missile (longest reach in the game, a little easier to decoy than the AIM-120D) and R-74M infrared dogfight missile (canards and thrust vectoring, slightly longer range than the AIM-9X). Keys 2 and 3 pick the IR and radar missile of whatever jet you fly. Plus the 30 mm GSh-30-1 cannon with 150 rounds.
- Su-35S sensors: N035 Irbis-E passive electronically scanned X-band radar (longest detection range in the game) and the OLS-35 optical/laser IRST for passive tracking, plus the Khibiny-M EW suite.
- Twelve hardpoints and four loadouts: Air Superiority (6x R-77M, 4x R-74M), Max Load (10x R-77M, 2x R-74M), Long Reach (8x R-77M, 2x R-74M) and Dogfight (4x R-77M, 6x R-74M), including missiles between the engines and under the intakes.
- High-detail Su-35S model: long drooped nose with the OLS-35 ball, big bubble canopy on a raised spine, blended lifting body with sharp leading-edge extensions, widely spaced engine nacelles with raked intakes, tail booms with straight vertical fins, ventral fins and stabilators, the centre tail 'sting', moving leading-edge flaps, flaperons, rudders and dorsal airbrake, and nozzles you can see swivel in flight. Blue-grey splinter camouflage with red stars, 'ВКС России' and blue or red side numbers.
- The Su-35S's afterburner burns BLUE, like the real AL-41F1S, instead of orange.
- Su-35S cockpit: two 15-inch MFI-35 wide-screen displays side by side, the PUI-35 control display and a wide-angle HUD, with its own names on the MFD pages.
- The Su-35S joins every mode: fly it yourself, or meet it as a bandit in Waves, Duel and 5v5 (bandits still never fly your own type). The TRIAD decoration now needs a kill in all four jets.
- AI jets now wear random paint jobs: your wingmen and the bandits in Waves and 5v5 get random wraps, solid colours and finishes (in 5v5 each pilot keeps the same paint all match).
- 5v5 Team Battle: the clock at the top now counts DOWN from 5:00 when the fight starts, instead of counting up. The HUD also calls out the last 60 seconds.

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
