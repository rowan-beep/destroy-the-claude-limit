# Changelog

Every update gets a version number and notes here. The game shows the same
notes under **NOTES** in each menu: the air combat menu lists the air combat
updates, the space menu the space updates and the ocean menu the ocean updates.

## v7.2.2 (2026-10-09)

### Air Combat: The F-15EX gets its real front end

- **Fixed: The F-15EX's nose, canopy and intakes**
  - The whole front of the Eagle II has been rebuilt over the published F-15 three-view, in true scale, and now matches it from the side and from above. Before, the canopy sat about 0.3 m too low and stopped short, the spine behind it was up to 0.35 m too low, the belly and the intakes hung about 0.2 m low, the intakes stood about 0.3 m too far out and 0.8 m too far forward, and the radome was a thin straight cone with a kink where it met the body.
  - The radome is long and drooped, round at its base and flatter toward the tip, and meets the forward fuselage at a joint 2.6 m behind the tip. Behind it the sides straighten into the Eagle's shoulder: a ledge at canopy-rail height that the intakes tuck in under, with the lower crease running back from the radome.
  - The bubble canopy rises from a windscreen 3.3 m behind the tip to a crown about 1.8 m above it and runs 5 m back onto a raised spine, the rail climbing beside the rear cockpit. The windscreen sits on a closed coaming with a full-length glareshield and a HUD on top; the speedbrake lies on the new spine.
  - The intakes are tall, raked boxes beside the rear cockpit, the top lip ahead of the bottom one, with thick rounded lips, the compression ramp under the top lip, white ducts and a boundary-layer gap to the fuselage. The outer walls flare into the wing glove, and the conformal tanks fair into them.
  - The nose gear has moved 1.25 m aft to sit under the front seat, which gives the real 5.4 m wheelbase. The pitot probes, AoA vanes, formation lights, antennas and markings have moved onto the new shapes: the intake danger stripe follows the lip's rake, the insignia sits on the trunk's flat wall, the RESCUE arrow is under the canopy and the panel lines follow the shoulder and the crease. The cockpit view is unchanged.

## v7.2.1 (2026-10-09)

### Air Combat: A frame rate setting: 165 Hz where the browser holds the page at 60

- **New: FRAME RATE in Graphics settings**
  - DISPLAY (the default) draws every frame your screen refreshes, as before. Pick 60, 120, 144, 165 or 240 to cap the game at that rate.
  - The game has never capped itself at 60: the cap comes from the browser when the page is embedded in another (the claude.ai artifact is one), which can hand it only 60 animation frames a second however fast the screen is. Choose a rate above what the browser delivers and the game times its own frames to it instead, measured against the clock, with the physics still at 120 Hz and every frame drawn part-way between steps.
  - The FPS counter now shows when the game is on its own timer and what the browser's own frames run at, so you can see what you are getting. Whether those extra frames reach the screen is up to the browser: if it only composes the embedded page 60 times a second, the game runs smoother inside but the screen still shows 60.

## v7.2.0 (2026-10-09)

### Air Combat: Easy refuelling, a real KC-46, and three fixes you asked for

- **New: Refuelling that connects itself**
  - Get within 45 m of the boom's nozzle (or the basket) behind and below the tanker, roughly matched in speed, and the jet takes over: it stabilises at pre-contact, creeps in, the boom operator flies the boom down onto your receptacle, the nozzle slides out and latches with a clunk, and the jet is held on the boom while the fuel flows. Probe jets are pushed into the basket and the hose takes up. Hands off: nothing you do with the stick is needed, and the HUD counts the metres.
  - You stay connected until the tanks are full, when the jet slides down and back off the boom by itself and hands control back. A firm stick input, or H, disconnects early. The director lights under the tanker's belly show up / down and forward / aft while you close.
  - AUTO-FLY (U) now lists KC-46 TANKER first: pick it and the jet flies the whole join from wherever you are, from the runway if need be, closes at a walking pace and connects. The free-flight briefing and the HUD cue tell you where the auto-connect starts.
- **Improved: The KC-46 Pegasus**
  - The tanker is a proper 767-2C now: a lofted round fuselage with the drooped nose, the lifting tail cone and the six cockpit panes, a wing-body fairing, a wing with 6 degrees of dihedral, 35 degrees of sweep and the straight inboard trailing edge, flap-track fairings, PW4062 engines with dark ducts, fan faces and spinners on proper pylons, wing refuelling pods on pylons, the tailplane and fin with its dorsal fillet, the APU exhaust, antennas and the operator's camera fairing. The boom is a tapered tube with a hinge fairing, V ruddevators that flex with it and a telescoping nozzle; the centreline drogue has its fairing and a coupling in the basket. Painted in AMC grey with panel lines, doors, the U.S. AIR FORCE title, the roundels, the tail flash and the serial.
- **Fixed: The F-22's engines meet the body**
  - The two-dimensional nozzles were boxes stuck on behind the fuselage, their flaps three light grey plates stacked with gaps. The aft body now wraps the nozzle boxes and ends in a flat face the exits are cut out of; the painted sidewalls and the dark sawtooth flaps carry straight on from the deck and the belly, and the tail booms beside them are flat slabs flush with the belly instead of round pods.
- **Fixed: Fins that floated**
  - On most jets the fin's straight root chord sat on a sliver of sky where the spine slopes away or a canted fin's root left the skin (worst on the F-22, F-35, Su-57 and the Super Hornet, seen from below). Every fin and ventral fin now carries its root on down into the body, so they stand on the metal from any angle.
- **Improved: Vapour that lies on the wing**
  - The wing vapour was three flat sheets hovering over an estimated wing. It is now fitted to each jet's own airframe (the planform and the upper surface are read off the mesh), so in a hard pull a clumpy, streaky sheet of condensation lies on the wing and the strake and tears off the trailing edge, with a thinner layer just above it; the wingtip and strake vortices spin into thin twisting ropes of cloud trailing behind the jet, leaning with the angle of attack. The transonic cone is unchanged.

## v7.1.0 (2026-10-09)

### Air Combat: Audio rework: the fight in three dimensions

- **New: Everything around you has a place**
  - Every jet and missile near you now sits in a head-related (HRTF) 3D panner at its true direction: left and right, ahead and behind, above and below, not just panned across the stereo. Up to four jets and four missiles at once, each with its own Doppler, air absorption and beaming. Explosions, launches and passing rounds are placed the same way.
  - Missiles are heard: the motor tearing past with the Doppler drop, then the thin shriek of the coasting airframe at Mach 2.
- **New: Sonic booms**
  - When a supersonic jet passes you, its shock cone arrives as a sonic boom: the double crack of the nose and tail shocks, the rumble under them and the echoes, delayed, deepened and muffled by the distance. Ahead of the cone, yours or theirs, there is nothing to hear yet: a camera out in front of your own jet past Mach 1 sits in the zone of silence.
- **New: Their guns**
  - Other jets' guns fire where they are, with their own rate (the GSh-30's slow hammer, the M61's buzz) and the air between. When a jet behind you is firing with its nose on you, the rounds crack past your canopy.
- **New: The airframe**
  - The vortices off the strakes and leading edges howl above about 13° of angle of attack, rising with speed (loudest on the F-16, Hornet, Typhoon, Rafale, the Flankers and the MiG-31). The structure creaks under G above 5. In the cockpit the jet's roar also comes through the seat and the floor as a low body resonance.
- **Improved: The mix**
  - Warning tones, the lock tone and the voice take the jet down by half while they speak, so nothing important is lost under the engine. The outdoor reverb grows toward the ground and dries out high up. Explosions come in three renderings instead of one, and a close one sends shrapnel whizzing past.

## v7.0.0 (2026-10-09)

### Air Combat: Ranked, APEX toned down, every jet rebuilt, real pilots

- **New: RANKED: a Rainbow Six Siege ladder for the air game**
  - 36 ranks, exactly Siege's: Copper, Bronze, Silver, Gold, Platinum, Emerald and Diamond, five divisions each (V up to I), 100 RP a division, Copper V from 1,000 RP and Diamond I from 4,400. Champion sits above them all from 4,500 RP (and 8 ranked matches in the week) with no divisions: it shows your place in the world, #1, #2 and so on.
  - Matches you win and lose move your RP Elo-style against the other side: about ±30 at par, more when you beat someone ranked above you. Every kill adds 5 RP (at most 15 a match, and never more than half a loss back). A win is always worth at least 10. The demotion shield: the first loss that would drop you a division leaves you at its 0 RP; the next one drops you.
  - A hidden skill rating with an uncertainty, like Siege's MMR, is kept from week to week. It chooses the AI you fly against and pulls your rank toward it: when you are ranked well below your skill, wins pay up to +80 and losses cost as little as −9.
  - Ranks reset every Monday at 8:00 a.m. Washington State time (Pacific, daylight saving included). Each week opens with 5 placement matches: your rank is hidden until the fifth, each one is worth about +100 for a win and −50 for a loss, and you start 300 RP under your hidden skill (at most Diamond V; a brand-new pilot starts at 1,667, Bronze IV). Placements never put you straight into Champion.
  - Two playlists count: RANKED in the AI menu (a duel against an AI picked for your skill) and ONLINE free-for-all with 4 or more pilots, where your placing is scored as a win or loss against every other pilot. Leaving a match counts as a loss and keeps you out of ranked for 5, 15, 45 then 120 minutes.
- **New: Rank emblems**
  - Each rank has its own emblem, painted like the real thing: a dark bevelled shield round a field of cut crystal in the tier's colour, with facets, light streaks and sparkle, a dark chevron across it, a gem at the crown and at the point. Division I of a tier wears a white star, the other divisions their numeral; Champion wears its crown over the star and glows.
- **New: RANKED tab**
  - A new tab in the air menu (04 RANKED) with your rank emblem, RP, the division bar, the five placement slots, the week's record and match history with the RP of each result, the countdown to Monday's reset, the full ladder and the rules. A result card after every ranked match shows what moved and why.
- **Improved: APEX: top, but beatable**
  - The 45 G airframe is gone. APEX now flies the same jet you do, pulling at most to its over-G limit (13 G), and its missile-dodging at 45 G and the tail-shadow that held a spot 200 m behind you went with it. It drops chaff and flares like everyone else and moves like a real jet: no more instant, jagged snaps.
  - What stays: reactions in 0.04 s, gun aim within 0.5 mil, the 0.05 s Sidewinder lock, shots up to 80° off the nose, 12 NM eyes and the commander calling the fight. It never blacks out, and it only opens fire with the gun inside 800 m.
  - Measured, computer against computer, 60 one-on-one fights of EXTREME against APEX: APEX won 31, EXTREME 26, 3 draws. Decisively the best AI in the game, and a fight you can win.
- **Improved: Every jet rebuilt to its three-view**
  - All 13 airframes were laid over published three-view drawings in true scale and reshaped, silhouette by silhouette, until they match: the outlines, the sweep and chord of every wing, canard, fin and tailplane, where the canopy sits and how tall it is, the intakes, the nozzles. Nothing was simplified: every rivet line, light and antenna is still there, just in the right place.
  - Gripen E: the canopy sits further back and only just bulges above the high flat spine, the nose droops, the intakes are wider and start further aft, the canards are the real close-coupled ones (2.3 m root chord, tips 2.5 m out), the delta wing is swept 51° with its trailing edge running back to the nozzle, the fin tip is narrow with the EW pod poking ahead of it.
  - SR-71: the nacelles were 3 m too far forward and 2.5 m too long; the spikes, inlets, fins and ejector nozzles are now where the drawing puts them, with the wide outboard nacelle chines and a straight trailing edge.
  - F-22: blunter radome, deeper belly, wider body, the correct wing and tail planform. Rafale: drooped radome, the real canard and fin, actuator fairings, probe and gun. MiG-31: the long boom-tipped nose, chined forebody, high flat spine, LERX, tip pods, ventral fins and the big trunk intakes. X-15: the real 37° leading edge, the stubby tail surfaces and dorsal spine. F-35: the DSI bumps, the blended body sections, the correct wing and stabilators. Su-57: the faceted nose, LEVCONs on their real line, the wide flat body, the widely spaced fins and the nacelles. Typhoon, Su-35S, F-15EX, F/A-18E/F and F-16C had their spines, canopies and planforms corrected too.
  - The KC-46 tanker was corrected as well: a 50.5 m fuselage, the wing and tail where they belong.
- **New: Real pilots in the cockpits**
  - Every jet's pilot was rebuilt: a Nomex flight suit with its woven weave, folds and wear, a survival vest with its pockets, the full torso harness (shoulder straps, lap belt, chest strap, Koch fittings, leg straps), anti-G chaps with their lacing, leather gloves, laced boots, a kneeboard, watch, name tag, flag and squadron patches.
  - The helmet is clear-coated paint with the reflective tape and markings of its air arm: the HGU-55 with the JHMCS mount in US jets, the Striker II in the Typhoon, Rafale and Gripen, the white ZSh-7 in the Russian jets. The visor is a dark mirror, the oxygen mask has its seal, valve, microphone, bayonet straps and ribbed hose down to the chest regulator. The seats are the real ones: ACES II with its side handles, Martin-Baker with the loop between the knees, the K-36 with its arm paddles and headbox.
  - They fly the jet: the stick follows your pitch and roll and the right arm follows it, the throttle slides with your throttle and the left hand goes with it, and the pilot's head turns into every turn and scans the sky.

## v6.6.0 (2026-10-09)

### Air Combat: APEX: one against five

- **New: APEX difficulty**
  - A fifth step on the AI DIFFICULTY slider, after EXTREME, in every mode that has the slider: Duel, Team Battle, Last Pilot Standing, Airstrike, the fighters in Recon and the carriers' gun crews. The Duel's description lists it too. Campaign enemies also get one step harder than they do on EXTREME.
  - A battle commander re-reads the whole fight once a second. For each enemy it works out what they are doing: hunting with a lock on, shooting, defending a missile, running, dogfighting, flying slow, flying low or cruising. It learns which way they like to turn and from how far they shoot, and predicts where they will be over the next few seconds from the way they are turning. Every APEX jet is told where you are each second, even when its own radar has lost you.
  - With two or more APEX jets it hands out roles. The jet you have locked turns cold and drags you while the others come in on your beams. One stays high while another fights you low. Both run a pincer from either side when you cruise, and they chase you down when you run or are out of missiles.
  - Its pilots react in 0.04 s (EXTREME 0.12), aim the gun within 0.5 mil (1.2), need a 0.05 s lock for a Sidewinder (0.15), fire up to 80° off the nose (70), spot you from 12 NM (7) and fly down to 150 m (220). They only fire a Sidewinder your flares will not take: at your hot tail or in afterburner, when you are out of flares, or from under 900 m, then a second one 0.8 s later.
  - The commander's calls come up on your screen in red, for example: "He's locked on COBRA 2-2. COBRA 2-2, drag him. Everyone else, take his beam."
- **New: An airframe like nothing else**
  - APEX jets have their own airframe: 45 G, there the instant it is wanted, and the jet goes exactly where its pilot points it with no lag, no stall and no over-G, from about 80 kt up to past Mach 2. The pilot never blacks out. They carry 3x the gun rounds (1,530 in the F-15EX).
  - They never drop chaff or flares and do not need them: they beat missiles by flying. Until a missile is about to arrive they keep it on the beam at full speed; in its last 2.5 s they pull 45 G square to its line of sight (square to both lines of sight when two arrive together), and in the last half second they work out where the missile will be and pull whichever way opens the gap. They also step out of the path of missiles that have stopped guiding. In tests with no countermeasures at all, none of 180 missiles hit: 12 Sidewinders each from 1 and 2 NM, 12 AMRAAMs each from 5, 6 and 10 NM, 24 pairs of Sidewinders from two jets at once and 24 ripples of three.
- **New: APEX sits on your tail**
  - Once it is close it holds a spot behind you on your own flight path: 200 m while it has shells, 500 m with only Sidewinders left. It flies your velocity, swung by your turn, plus a pull onto the spot that it can always stop from. Measured with APEX unarmed (so it holds 500 m) following an EXTREME jet that fought back and fired at it, nine 200-second runs: half the time it was within 2-3 m of the 500 m mark and 88-90 % of the time within 50 m. The bigger gaps come when it closes back in after breaking away from a missile.
  - From there it guns your cockpit. It jinks out of your gun line whenever your nose comes within 10° of it inside 1,800 m.
- **How much harder**
  - One APEX F-15EX against five EXTREME F-15EX jets, computer against computer with a 10-minute limit: APEX won 200 games out of 200, all in a row (mean 3 min 19 s). The five fired 7,245 missiles at it and none brought it down; it took any damage at all in 7 games. 947 of the 1,000 jets it shot down fell to its gun.
  - One against one it beat EXTREME 20 times out of 20 (mean 1 min 41 s), and no EXTREME missile hit it.
- **New: APEX PREDATOR**
  - A new medal for winning a duel on APEX. The Logbook keeps APEX duels in their own row.
- **Improved: Missiles answer like real ones**
  - For every jet: a missile now takes 0.2 s to turn a steering command into a turn (it used to answer instantly). Against ordinary jets they stay deadly: fired at jets that drop no countermeasures, 12 of 12 Sidewinders and 6 of 12 AMRAAMs still hit.
- **Fixed: AI gun trigger during a break**
  - Computer pilots no longer keep the trigger held while they break from a missile, which used to empty their gun at nothing.

## v6.4.2 (2026-10-09)

### Ocean: Time warp that works

- **Fixed: Time warp**
  - It no longer sits at 1× in most of the places you use it. Set it and it runs: up to 100× in open water; at most 10× in the harbor, within 300 m of the wreck and K3, while listening and with the battery under 10 %; at most 5× within 6 m of the bottom; 1× only during a task, with the arm out or behind the Battery flat card.
  - Set to 100× at the berth, PETREL now covers about 77 m in 4 seconds of thrust; it used to be held at 1× until it had left the whole harbor.
  - Starting Quiet Survey no longer puts the slider back to 1×: the setting stays where you put it.
- **Fixed: A free survey no longer ends at the start**
  - Pressing E at the berth before leaving docked straight away and ended the dive at 0 km. Docking, and its prompt, now only come once the boat has been more than 40 m out.
- **No touch controls**
  - The on-screen stick and button pad are gone from the dives: dives are played with the keyboard and mouse or a gamepad.

## v6.4.1 (2026-10-09)

### Air Combat: Sound stays off while paused

- **Fixed: Paused means silent**
  - Opening Settings from the pause menu and closing it (or changing a volume there) turned the sound back on while the flight was still paused. It now stays silent until you resume.
- **Fixed: The simple menu's tiles**
  - The AIRSHOW tile's description was cut off at every window size, and at 1024 and 820 pixels wide most tile titles were too (FLIGHT SCHOOL, FREE FLIGHT, WAVE COMBAT, AIRSHOW, CAMPAIGN). Tiles now take two lines and the titles scale to the tile.

### Space Exploration: Quiet when paused, tidier menus

- **Fixed: The Saturn V goes quiet when paused**
  - The engines' roar kept playing behind the PAUSED card. It now stops while the flight is frozen and comes back with RESUME.
- **Fixed: No sound from a tab you have left**
  - Switching to another browser tab left the rocket and the other mission sounds playing in the background. The sound now stops while the tab is hidden and comes back when you return.
- **Fixed: Menus fit narrower windows**
  - In the simple menu the tile titles (APOLLO · THE MOON, STARSHIP TO MARS, CREW DRAGON · ISS, PERSEVERANCE) and their descriptions were cut off on narrower windows, from 1280 pixels wide down to a phone: tiles now take two lines and the titles scale to the tile.
  - The main menu's top bar ran off the right edge at 1024 wide (its mission counters now give way below 1100), and on a phone the footer's SIMPLE MENU button ran off the screen (the footer now wraps).

### Ocean: Weather, a bright harbor and a free look

- **New: Weather**
  - Pick the time of day (Dawn, Morning, Noon, Afternoon, Sunset), the sky (Clear, Fair, Cloudy, Overcast) and the sea (Calm, Moderate, Rough): 60 combinations. The new Weather panel at the menu's right has a slider for the time and buttons for the sky and the sea; The boat page and a dive's pause card have the same three.
  - The sun's height and colour, the sky, the clouds, the haze, the light under water, the waves and the wind all follow. The menu's harbor changes at once.
- **Improved: A bright menu**
  - The harbor now starts at noon with a few clouds and a calm sea instead of dawn. The dark veil over the left of the menu is gone (a light one stays behind the text), the glass panels let the harbor's colour through, and the picture behind the menu has a richer grade.
  - Saved weather carries over: Calm daylight becomes Noon, Fair, Calm; Overcast becomes Afternoon, Overcast, Rough; Dawn swell, which was everyone's default, becomes the new bright noon.
- **New: Look around the harbor**
  - Drag on the harbor to turn the view round PETREL, scroll to come closer or stand back, double-click to go back to the slow drift. A flick keeps it turning for a moment. The camera stays above the water, the pier and the survey vessel.
- **Fixed: Time warp and the battery**
  - With less than 10 % battery left, time now runs at most 10×: at 100× with full thrust and the lamps on, the last 10 % used to go in about 5 seconds. Behind the Battery flat card time runs at 1×.
- **Fixed: No sound from a tab you have left**
  - Switching to another browser tab left the sub's motor and the sea sounding in the background. The sound now stops while the tab is hidden and comes back when you return.
- **Fixed: The dive's instruments on narrower windows**
  - The objective panel no longer runs into the compass, and the survey panel and the prompt above it sit higher so they no longer cover the bottom of the screen. On a phone held upright the big messages appear under the compass instead of over the objective panel.
- **Fixed: The simple menu's tiles**
  - On narrower windows the tile titles and their descriptions were cut off; tiles now take two lines and the titles scale to the tile.

## v6.4.0 (2026-10-09)

### Ocean: A real harbor, a real sky, time warp and a new look

- **New: Kestrel Harbor, built like a working port**
  - The quay is a cast concrete wall with a capping beam, rubber fenders, steel ladders, cast-iron bollards, crane rails and lamp masts. Behind it a levelled concrete yard: stacked shipping containers, a corrugated-steel shed, the Kestrel Marine Lab, a workshop with the harbor control tower and its turning radar, and two fuel tanks.
  - A quay crane with a lattice jib stands over the water. The pier stands on concrete piles with timber fendering; the berth has its launch and recovery crane, foam fenders and marker buoys.
  - The two breakwaters are armour rock round a concrete crown, out to the red and green lights at the gate.
  - Every surface has its real texture and relief: concrete with joints and stains, timber, ribbed cladding, granite, painted steel. Everything the tide reaches is wet, weeded and darker up to the high-water mark.
- **New: The survey vessel**
  - KESTREL SURVEYOR lies alongside the pier, held by mooring lines: a 34 m hull with red antifouling, a white boot-top and dark blue topsides, a bridge with raked wraparound windows, a mast with two turning radar scanners and satellite domes, the funnel, an A-frame over the stern, a winch, a deck crane, a lab container, liferafts and a rescue boat. PETREL can no longer pass through it.
- **New: The land round the harbor**
  - Wooded hills: 2,288 pines, 1,666 broadleaf trees and 167 bushes on the Balanced preset, moving in the wind, with open grass between. The town's 55 houses stand along the slopes either side of the yard.
  - The ground itself shows grass going from green to dry, scrub and heather, bare soil, rock where it is steep and wet sand at the shore.
- **Improved: A real sky**
  - The sky is worked out from how sunlight scatters in the air: deep blue overhead, paler toward the horizon, a glow round the sun, and a red sky at dawn.
  - Cumulus clouds drift across it with the wind, lit on the side toward the sun; overcast is a grey deck. The haze over the land and the sea takes the sky's colour at the horizon.
- **New: Time warp**
  - The same slider as the space missions': 1× to 100× (or , and . to step it). Time speeds up smoothly and drops at once where it must: inside the harbor, near the wreck and K3, close to the bottom, while listening and during a task it stays at 1×; with the arm out 1×; with the scanning sonar turning at most 4×.
- **Improved: A new look for the menu and the dive**
  - The menu is laid over the harbor on a clear glass column: plain readable text, three pages (Missions, The boat, Echo Atlas) and one big Dive button that always says what it will start. Pick a mission and press Dive, or Continue on one in progress.
  - The dive's instruments, the pause and debrief cards, the chart and the touch controls are restyled to match: clean glass panels, normal letter spacing, the same colours throughout.

## v6.3.1 (2026-10-08)

### Air Combat: Sharp picture all the time

- **Fixed: No more automatic resolution drops**
  - The AUTO RESOLUTION option is gone: it lowered the picture to as little as 60 % of its resolution whenever the frame rate dipped, which made everything look blurry. The game now always draws at the resolution and scale you set in Settings → Graphics.

### Space Exploration: Sound and a sharp picture

- **Fixed: Sounds that were silent**
  - After the first screen, the game's sound was held at zero everywhere outside a jet flight, so the rover arm's motors, the drill, the time-warp sounds and the clicks in the space menus and missions were not heard. They are now.
- **Fixed: No more automatic resolution drops**
  - The automatic resolution option is gone: it lowered the picture to as little as 60 % of its resolution whenever the frame rate dipped, which made launches, Mars and the rover look blurry. The picture now stays at the resolution and scale you set.

### Ocean: Sound, the camera the right way round and a sharp picture

- **Fixed: The dives had no sound**
  - After the first screen the game's sound was held at zero, so nothing in a dive was heard: the sea, the thrusters, the ballast pumps, the hull, the hydrophone and the clicks. All of it is heard now.
- **Fixed: Looking around turns the way you look**
  - Dragging right (or the gamepad's right stick to the right) now turns the view right, from the dome and in the chase view; it turned left before. Up and down were already right.
- **Fixed: A sharp, clean picture**
  - The automatic resolution option is gone: it lowered the picture to as little as 60 % of its resolution whenever the frame rate dipped, which is when the ocean looked blurry. The picture now stays at the resolution and scale you set (the PERFORMANCE preset still draws at 75 %, as it says).
  - No more rainbow fringes along hard edges toward the sides of the screen (the posts, rails and the boat against the sky): the ocean is drawn without the lens's colour fringes.

## v6.3.0 (2026-10-08)

### Ocean: Scanning sonar, a hand-flown arm and floodlights

- **New: Scanning sonar**
  - PETREL's sonar head now turns: a ping is one full turn (3 s), the beam sweeping round from the bow, and N keeps it turning, a ping every turn, until you switch it off. While it turns the hydrophones are masked, so listening switches it off.
  - With the overlay on (O), whatever the beam sweeps over in the water lights up blue as it passes and fades behind it, out to 280 m with range rings every 50 m: the slope, the reef, the wreck and K3's mooring stand out well beyond what the lamps reach.
  - A round sonar display shows the same picture, heading-up, in the minimap's place while the head turns (and in the Quiet Survey panel): the sea bed in blue, hard returns in amber.
- **New: The manipulator arm, flown by hand**
  - V brings the arm out and the boat holds its place and depth. W/S move the jaw ahead and back, A/D left and right, R/F up and down; E closes the jaw on what is between it, V stows the arm and puts what it holds in the sample basket.
  - The jaw reaches 2.1 m from its shoulder, not behind it or into the hull, rests on the bottom (and stirs it) instead of going through it, and the camera moves round to watch it.
  - Take shells, stones, starfish, sea urchins and sea cucumbers off the bottom: each one in the basket goes into the Echo Atlas with the depth it came from. The expeditions' recorders can be taken by hand too; E outside the arm still does it for you.
- **New: Floodlights**
  - K switches on the floodlights round the hull (along both sides, under the belly and at the stern): the water and the bottom all round the boat light up, not only ahead, and the particles in the water catch the light. They draw a little more from the battery.
- **Controls**
  - Gamepad: hold A for the arm, hold B for the scanning sonar, hold Y for the floodlights (a tap still does what it did). Touch: ARM, SCAN SONAR and FLOODS buttons; with the arm out the stick and up / down move the jaw and USE grips.

## v6.2.0 (2026-10-08)

### Ocean: A living sea: the sea bed up close, jellyfish, silt and bioluminescence

- **New: The sea bed up close**
  - Wave ripples in the sand run across the swell, longer and fainter with depth until they die out below about 90 m, with shell fragments on the crests and darker sand in the troughs.
  - Rock is lumpy and cracked, with dark crevices and pink coralline crusts in the shallows; the deep silt is marked with the burrows and mounds of the animals living in it.
  - The relief catches the sunlight, the caustics and your lamps, and fades out with distance so nothing shimmers far off.
- **New: Life on the sea floor**
  - Seagrass meadows on the shallow sand that lean with the surge, shells, starfish, urchins on the rock and reef, sea pens, brittle stars and sea cucumbers on the deeper sand and mud, and glass sponges below 150 m.
  - Each lives where it would, and they are in the same places in every dive.
- **New: Jellyfish**
  - Moon jellies drift in loose swarms in the upper 30 m over the shelf; seen from below they catch the daylight coming down through them.
  - In the dark water of the basin, below 120 m, there are deep-red helmet jellies: they show only in your lamps, and lose their red a few metres off as the water takes it away.
  - Their bells pulse, a quick stroke and a slow relaxation, and the tentacles trail after them.
- **New: Silt**
  - Run the thrusters close to sand or mud, or touch the bottom, and the wash lifts the sediment in billowing clouds, lit by the daylight at that depth and by your lamps.
  - The fine mud of the deep basin hangs for about half a minute and drifts with the current; sand drops back within seconds. Rock stays clear.
- **New: Bioluminescence**
  - In dark water the plankton flash blue-green where the hull pushes through them and in the thrusters' wash. Switch the lamps off in the deep basin and the boat is outlined in sparks.
- **Fixed: Things in the water no longer vanish against the surface**
  - Seen from below, the surface was drawn over the marine snow, silt and lamp beams that were between it and the camera. It is now drawn behind them.

## v6.1.0 (2026-10-08)

### Ocean: THE SLOW PULSE: a second mission, 282 m down, and touch and gamepad controls

- **New: THE SLOW PULSE: what was pulsing in the deep basin**
  - Finish the first expedition and the follow-up opens on the MISSIONS page: nine stages, saved at each one, with its own debrief.
  - Take two bearings on the 12 kHz pulse (it is kilometres off, so the second bearing needs a long step to the side), go down in the search area and find its source in your lamps.
  - It is the Kestrel Marine Lab's deep mooring K3: an orange float 282 m down on a taut line, with its relocation pinger, a hydrophone recorder and the lab's tag. Scan the tag from in front and take the recorder off the line with the arm.
  - The anchor is 339 m down, past PETREL's 300 m rating: ping, and the multibeam under the boat (65° either side, 120 m down) shows what lies across the foot of the line.
- **New: Touch controls for phones and tablets**
  - A stick (ahead, astern, turn), buttons for up and down, flood and blow, the side thrusters, listening, sonar, the arm, lamps, the holds and transit time. Drag to look, pinch to zoom.
  - The emergency blow must be held for 2 s, so it never goes off by accident. On a phone held sideways the instruments move to the top corners.
- **New: Gamepad**
  - Left stick to drive, triggers up and down, bumpers for the side thrusters, D-pad for the tanks and the holds (hold up 2 s for the emergency blow), A use, B ping, X listen, Y lamps, right stick to look.
  - The CONTROLS page and the in-dive help (H) list it all.
- **Improved: The sea bed is built on a separate thread**
  - Sea-bed tiles are now built on a worker thread; the game itself only turns them into meshes. On the benchmark route (BALANCED) the slowest tile on the game's own thread went from 13.9 ms to 4.4 ms, frames held up by more than 8 ms of sea-bed work from 9 to none, and the game's own work per frame (95th percentile) from 8.9 to 6.4 ms.
  - The benchmark can compare: triadBench('balanced', 15, false) builds the tiles the old way.
- **Improved: Sonar answers across each beam's width**
  - Each of the 90 beams now answers for anything inside its own width, not only on its centre line, so a thin mooring line 200 m off is found from any side instead of only now and then.

## v6.0.0 (2026-10-08)

### Ocean: OCEAN: a survey submarine, a strange knock, and the sea as it really looks

- **New: A third program: OCEAN**
  - Pick OCEAN from the program menu under the TRIAD logo. Its menu has three pages: MISSIONS (the expedition and the free survey), HARBOR (the boat, the ocean's settings and a benchmark) and CHART (the Echo Atlas).
  - There is a SIMPLE menu too, like the air and space programs.
- **New: SV-1 PETREL, a one-pilot survey submersible**
  - 6.4 m long and 7.8 t, with an acrylic bow dome, two stern and two vertical thrusters, LED lamps, a forward-looking sonar with a multibeam under the hull, hydrophones and a five-function arm.
  - Top speed 2.6 m/s (5 knots). Rated to 300 m; past 360 m the tanks blow by themselves.
  - Real ballast: the vents flood the main tanks in about 4 s, the trim pump does the last bit slowly, the blower empties them, and B blows everything straight to the surface. Too light to dive? The boat says so.
  - Assists hold a depth (T) or a position (G). The battery lasts about 85 minutes at full thrust with the lamps on.
  - The physics runs in fixed 1/60 s steps, so the boat handles the same at any frame rate.
- **New: The expedition: QUIET SURVEY: THE SILENT BUOY**
  - Ten stages: leave Kestrel Harbor, dive by the training buoy, hear a faint double knock, take two bearings on it from two places, ping the search area, find a wreck in your lamps at about 85 m, scan her stern plate, recover what is knocking with the arm, come home and dock.
  - Nothing marks the source until you have found it yourself: the bearings and the search area they make are the only guide.
  - A debrief tells the story, with your scan photo, time, distance, depth, bearings and how close your search area was.
- **New: Quiet Survey: listening is the game**
  - Q quiets the thrusters and turns the hydrophones up. Hold slow (under 1.2 m/s) and steady (turning under 6°/s) for 3.5 s and you get a bearing, as a wedge 3° to 22° wide depending on how clearly the sound stands out.
  - The acoustics use real units: source levels in dB, spreading loss, seawater absorption by Thorp's formula (about 12 dB per km at the beacon's 37.5 kHz), the sea's own noise by Knudsen's curves, and your boat's noise from its thrusters, pumps and speed.
  - Every sound is also shown and written out: a bearing / time display, a noise budget (your noise, the sea's, the ping's), and a caption of each contact's pattern.
- **New: Active sonar**
  - P pings: the sector display and a sonar overlay in the view show the ground and anything hard within 280 m. A ping drowns faint sounds for 6 s, so you can't listen and ping at once.
- **New: The Echo Atlas**
  - Every contact, every bearing (with where you took it), every search area, the evidence (recordings, scans, photographs, the recovered item), your routes and an expedition log, kept between sessions.
  - M opens the chart in a dive; CHART in the menu shows it all with the story of each contact.
- **New: The sea as it really looks**
  - Water takes the red out of light first, then the green: the reef at 10 m is blue-green, the wreck at 85 m is in deep blue twilight and only your lamps show colour, and only close up.
  - Looking up from below you see the sky squeezed into Snell's window, with the mirror of total reflection outside it. Sunlight makes caustic nets on the shallow bottom and shafts through the water; marine snow drifts in your lamp beams.
  - At the waterline the picture is split properly between air and sea. The surface reflects the sky by Fresnel's law, and the swell is smaller inside the breakwater.
  - The camera's exposure adapts to the light, as a real camera's does.
- **New: Three graphics presets**
  - PERFORMANCE, BALANCED and CINEMATIC change only how things look (render scale, water and sea-bed detail, foam, caustics, light shafts, particles, fish, reef density, lamp shadows). Every clue, control and sonar reading is the same on all three.
  - The sea bed streams in tiles round you, finer near and coarser far, and is released behind you.
- **New: A free survey, and something more out there**
  - FREE SURVEY leaves the harbor with no task: listen, ping and chart the reef, the kelp, the slope and the deep basin. Finishing the expedition opens a follow-up contact you can hear and take bearings on.
- **New: Help when you need it**
  - Progress saves at every stage and every 20 s: CONTINUE picks up where you left off. The pause menu can take you back to the last safe point. A flat battery? Call a tow.
  - Settings: guidance (markers in view, compass only, or instruments only), a relaxed battery, a visibility aid, a large HUD, reduce motion and look speed. The CONTROLS page lists the ocean's keys.

## v5.8.0 (2026-10-08)

### Air Combat: No more dots on the coastlines, and tidier menus

- **Fixed: No more coloured dots on distant coastlines**
  - Far-off coasts were outlined with dotted green and black lines, and through the airshow camera's depth of field those dots grew into coloured circles. A shading fault where the beach meets the sea bed made broken pixels there; it is fixed.
  - Any broken pixel is now also filled in from its neighbours before the picture is blurred, so depth of field and glow can never spread one into a circle.
- **Fixed: The flight HUD stays out of the menus**
  - Closing the settings put the flight HUD over the menu (it then showed behind the Logbook too). It now only appears in flight.
- **New: Flight School on the SIMPLE menu**
  - It is the first tile, marked NEW? START HERE: the place a new pilot most needs it.
- **Improved: Logbook: a row for each jet**
  - The BY AIRCRAFT table had a column for every jet and ran out of its box. Now each jet has its own row, across the whole width.
- **Improved: The hangar panel fits a laptop screen**
  - The performance bars sit two to a row. On shorter windows the loadout list is tighter (only the chosen loadout spells out its stores; the others show them on hover) and the weapon and sensor facts are left to the FULL DOSSIER, so nothing is cut off, down to 1280 × 720.

### Space Exploration: No more stars through the Earth, a rover camera that stays put

- **Fixed: No more stars showing through the Earth**
  - From orbit, and most of all in the map view, the stars showed through the Earth's night side as a speckle of coloured dots. The sky is now drawn behind everything solid.
- **Fixed: Clean rocket plumes**
  - The edges of the exhaust plumes could break up into dotted coloured lines. The same fault is fixed on the edges of the Mars dust devils and the glowing wake behind the capsule on the way down to Mars.
- **Improved: The rover camera stays where you put it**
  - Drag the view round and it keeps that angle, turning with the rover as it drives. It used to swing back behind the rover 2.5 s after you let go.
  - During a job (drilling, flying Ingenuity) the job's camera now waits for its next shot instead of snapping straight back.
- **New: Always know where the next target is**
  - The next target is marked on screen all the time: a pulsing diamond on it when it is in view, or an arrow at the edge of the screen pointing the way, with its name and distance.
- **New: A space CONTROLS page**
  - CONTROLS on the space menu now lists the keys of each mission (the Saturn V, walking on the Moon, the launches, Starship to Mars, the rovers and the Solar System Explorer) instead of the jet's.
- **Fixed: No flight HUD over the space menu**
  - Closing the settings put the jet's HUD over the space menu. It no longer appears there.
- **Improved: Missions and destinations easier to read**
  - The MISSIONS column is wider and every name fits on one line (EUROPA CLIPPER and CREW DRAGON TO THE ISS, with the rocket in the line below).
  - DESTINATIONS says what it is: shortcuts that start you where each trip begins. A new card, EVERY OTHER WORLD, opens the Solar System Explorer.

## v5.7.1 (2026-10-08)

### Air Combat: See the hangar from the SIMPLE menu

- **Improved: The SIMPLE menu shows the hangar**
  - The tiles are now a smaller strip along the bottom, so your jet and the hangar round it fill the screen behind them.
  - Drag anywhere on the hangar to look around and scroll to zoom, the same as in the full menu.
  - HIDE MENU (top right) hides the menu for just the view. SHOW MENU or Esc brings it back.

### Space Exploration: See the launch site from the SIMPLE menu

- **Improved: The SIMPLE menu shows the launch site**
  - The mission tiles are now a smaller strip along the bottom, so the rocket on the pad and the site round it fill the screen behind them.
  - Drag anywhere on the view to look around and scroll to zoom, the same as in the full menu.
  - HIDE MENU (top right) hides the menu for just the view. SHOW MENU or Esc brings it back.

## v5.7.0 (2026-10-08)

### Air Combat: A SIMPLE menu, and easier camera controls

- **New: A SIMPLE menu**
  - SIMPLE MENU (at the bottom of the menu) swaps the full menu for a simple one: six big picture tiles (Free Flight, Airshow, Campaign, Dogfight, Wave Combat and the Daily Mission), your jet with arrows to change it, and one big FLY button.
  - FULL MENU brings the full one back. The game remembers which you like.
- **Improved: The airshow camera is easier to work**
  - Press R to pick a setting and [ or ] to change it, instead of a pair of keys for each one. R only offers what the shooting mode leaves to you: shutter, exposure compensation and ISO in S, aperture, exposure compensation and ISO in A, shutter, aperture and ISO in M, exposure compensation and ISO in the others.
  - Or click a setting on the readout at the bottom left to pick it, and scroll over it to change it. The one you are changing is outlined.
  - Nothing was taken away: every setting is still in the camera menu (C), and the old keys still work.

### Space Exploration: A SIMPLE menu

- **New: A SIMPLE menu**
  - SIMPLE MENU (at the bottom of the menu) swaps the full menu for a simple one: every mission as a big picture tile, from the Saturn V and Apollo to Starship, Crew Dragon, Artemis II, Falcon Heavy, the Mars landing, both rovers and the Solar System. Click one and you're off.
  - FULL MENU brings the full one back. The game remembers which you like.

## v5.6.1 (2026-10-08)

### Air Combat: Crew Chief taken out

- **CREW CHIEF is no longer on the main menu**
  - The hangar maintenance job from 5.6.0 has been taken out of the game.

## v5.6.0 (2026-10-08)

### Air Combat: A real camera for the airshow, and a faster renderer

- **New: The airshow camera works like a real one**
  - Shooting modes: AUTO, P, A (aperture priority), S (shutter priority) and M (manual), plus SPORTS, PORTRAIT, LANDSCAPE and NIGHT scenes.
  - The exposure triangle is real: aperture from f/1.4 to f/22 sets the depth of field, shutter speed from 1/8000 to 1 s sets the motion blur (a slow shutter panned with the jet blurs the background), and ISO from 100 to 25600 brightens the picture and adds noise.
  - Metering (matrix, centre-weighted, spot) and exposure compensation; a jet against a bright sky comes out as a silhouette unless you correct for it.
  - Focus: AF-S, AF-C, AF-A or manual, with point, zone or wide tracking areas drawn in the viewfinder, green when the jet is sharp.
  - Drive: single, continuous at 4 or 10 frames a second, 2 s and 10 s self-timers, and an interval timer. Shoot faster than the camera can save and it shows BUFFER FULL.
  - White balance (auto, daylight, cloudy, shade, tungsten, fluorescent, or a Kelvin value), nine picture styles (Standard, Vivid, Portrait, Landscape, Neutral, Monochrome, Classic Chrome, Velvia, Acros), sRGB or Adobe RGB, image stabilisation (off, on, sport) and lens corrections.
  - JPEG, RAW or RAW+JPEG. The viewfinder shows what the picture will look like, with the settings along the bottom; C opens the full camera menu, and every setting has its own keys.
  - Scoring now judges the real picture: shutter speed, camera shake, focus and exposure all count, and there are new PANNING and BOKEH shots to collect.
- **Improved: Photo album: sharper pictures, full screen, and quick deleting**
  - Pictures are saved at up to 3840 pixels wide (they were 1600) at a higher quality, and the full-size view waits for the whole picture before showing it, so it is never shown blurry.
  - FULL SCREEN (or F, or double-click) shows the picture alone, filling the screen.
  - SELECT, then click pictures (or SELECT ALL, Ctrl+A, or Shift-click for a run) and press the bin to delete them all at once. Ctrl-click a picture to start selecting.
  - Each picture keeps its camera settings. RAW pictures can be saved as a lossless PNG, or developed again with their own exposure, white balance, contrast, saturation and style, kept as a new picture.
- **Improved: A faster renderer**
  - Depth is now stored in a way the graphics card can test before shading, so it skips surfaces hidden behind others again, still with no flickering at long range.
  - Anti-aliasing, the depth of field and the final colour pass are cheaper: the last steps run as one, bloom works at a quarter of the screen and sun rays at half.
  - At 4K and above, anti-aliasing is held at 4x and ultra shadows at 4096, where more costs a lot and shows little.

### Space Exploration: A faster renderer

- **Improved: A faster renderer**
  - Depth is now stored in a way the graphics card can test before shading, so it skips surfaces hidden behind others again, still with no flickering at long range.
  - The final colour pass runs as one step and bloom works at a quarter of the screen.
  - At 4K and above, anti-aliasing is held at 4x and ultra shadows at 4096.

## v5.5.0 (2026-10-08)

### Air Combat: Airshow: the photo album, the hangar roll-out and a real crowd

- **New: Your photo album, right from the menu**
  - PHOTO ALBUM on the main menu opens your airshow pictures without starting a show; ALBUM (or Tab) still opens it during one.
  - Sort by newest, oldest, best rated or by jet, and filter by rating (3, 4 or 5 stars), by jet, and by what the jet was doing: vapour cone, knife edge, inverted, head-on, gear down and the rest. Each chip shows how many pictures match.
  - Pictures are grouped under headers (by day, by stars or by jet) and load as you scroll. Open one to see it full size, step through with the arrow keys, save it, make a magazine cover from it, or delete it.
  - Mark your favourites with the heart; the FAVOURITES filter shows just those, and favourites are never cleared out to make room.
  - The album now keeps up to 1,000 pictures (it was 120).
- **New: A jet rolls out of the hangar before every act**
  - Between acts the screen fades to black and the next jet taxis out of the hangar into the daylight, filmed from the door post and then from the apron, with its name, its role and which act it is, before a flash cuts back to the show.
- **New: A crowd that looks like people**
  - Every spectator is new: shaped heads with hair, ears and noses, real shoulders and hips, shoes, short or long sleeves, shorts or trousers, caps and sunglasses, and a much wider range of skin tones, hair and clothes.
  - They do ten different things: watch, point the jet out, film it on a phone, wave, clap, shade their eyes, cheer, sip a coffee, chat to the person next to them, or shoot it on a camera with a long lens.
  - Heads (and a little of the body) turn to follow the display jet across the sky.
- **Improved: Taking a picture no longer stalls the show**
  - The picture is now scaled and encoded in the background instead of on the frame you press the shutter, and saving it no longer reads the whole album first, so a big album doesn't slow it down.
- **Improved: Only the jets you need are loaded**
  - The jet flying the act is the only one in the air; the next one is loaded under the black screen between acts. The static display jets are only loaded while you're at the static park, and your own parked jet uses the ordinary model instead of the full cockpit one.

## v5.4.3 (2026-10-08)

### Air Combat: Camera controls the right way round

- **Fixed: Looking around turns the way you look**
  - AIRSHOW: A and the left arrow now look left, D and the right arrow look right, and dragging turns the view the way you drag. All of it was reversed.
  - Looking round your jet in the chase view (holding the right mouse button), when spectating and in replays: drag right to look right, drag up to look up. Both were reversed there too; the cockpit and the mouse-aim view already worked this way.

### Space Exploration: Camera controls the right way round

- **Fixed: The launch site view turns the way you drag**
  - Dragging up now looks up and dragging right looks right on the launch site; both were reversed. The views in flight, on Mars, on the rover and in the solar system already turn the way you drag.

## v5.4.2 (2026-10-08)

### Space Exploration: The rover arm drills the rock

- **Fixed: The drill lands on the rock, not in the air**
  - The arm used to swing to the same pose wherever the rock was, with the drill pointing forward into thin air. Now every joint is worked out for the exact spot on the rock, and the bit comes straight down onto its surface.
- **New: A final approach**
  - Press DRILL A CORE at a target and the rover turns on the spot and drives up to the rock (sped up), stopping square on to it with the rock in the arm's reach. If the rock is behind it, it backs up and turns round.
- **Improved: The whole job, step by step**
  - The arm unstows joint by joint and swings the turret out over the rock. The drill comes down until its stabilizer prongs rest on the rock, and the bit hammers 6 cm in while the arm holds still, throwing up cuttings that pile round the hole. Then it draws back out, leaving a hole in the rock (2.7 cm across; 1.6 cm for Curiosity).
  - Perseverance hands the bit to the carousel at the front of the rover, which turns and takes the sample tube inside. Curiosity's drill grinds the rock to powder instead: CHIMRA on its turret shakes the powder through its sieves into the laboratories inside.
  - Close-up camera shots follow each step, with the sound of the arm's motors and the drill's hammer.
- **Improved: The rock to drill stands out**
  - The outcrop picked at each drill target now stands up out of the ground instead of lying almost flush with it.

## v5.4.1 (2026-10-08)

### Air Combat: Airshow: saving pictures

- **Fixed: SAVE PICTURE and SAVE COVER work in the claude.ai version**
  - The page there asks you to confirm the save, then the JPEG downloads. In the web and Windows versions it downloads straight away, as before.
- **Fixed: A picture you have just taken is in the album straight away**
  - Opening the album right after the shutter used to miss the newest picture until you opened it again.

## v5.4.0 (2026-10-07)

### Air Combat: AIRSHOW: a game for people who love jets

- **New: AIRSHOW, a new mode at the top of the list**
  - No flying: you stand on the crowd line with a camera and a long zoom lens, and every jet in the game (all but the X-15) flies its display in front of you. The jet you pick opens the show; the rest follow in a new order every time.
  - The fighters line up, take off into a vertical climb and an Immelmann, then fly a high-speed pass at 40 m, a pull into the vertical, a half loop, a rolling pass, a 7.2 g turn through a full circle, a slow pass at 24° angle of attack, and a landing.
  - The thrust-vectoring jets (Su-35S, F-22A, Su-57) pull a cobra in the slow pass, the nose going past vertical. The SR-71 and the MiG-31 fly their own display: a long climb out, a high-speed pass, a pull up, a gear-down flypast and the landing.
  - The programme board shows each manoeuvre as it comes. N skips to the next jet, F runs the show 2× or 4× faster, and the long legs between passes go by four times faster on their own.
- **New: A real camera**
  - A 24-300 mm zoom to begin with, at 1/500 s. Drag (or WASD) to look round, the wheel or + and − to zoom, click or Space to take a picture.
  - Auto-track (T) keeps the jet in the middle, even through the fastest pass. Pan it yourself for the best pictures: the focus brackets turn green on the jet, and a streak shows how fast it is crossing the frame.
  - The thirds grid (G) helps the framing.
- **New: Every picture is scored**
  - On how big the jet is in the frame, where it sits (the middle, or on a third with room ahead of the nose), how sharp it is (motion blur in pixels) and the moment you caught.
  - Up to 15 kinds of shot to collect for each jet: the takeoff, the afterburners, straight up, the vapour cone, high-g vapour, the top side in a turn, the underside, inverted, knife edge, head-on, high alpha, the cobra, gear down, the touchdown and the jet on the static display.
  - A sharp, well-framed picture makes up to three stars; four and five need a moment too. Auto-track tops out at four stars.
- **New: The album and the spotter's logbook**
  - TAB opens the album: every picture scoring 15 or more is kept in your browser (the best and newest 120). See each one big, save it as a JPEG, or delete it.
  - Turn a three-star or better picture into a magazine cover, with the masthead, the cover lines and your shot, and save it.
  - The logbook shows every kind of shot of every jet, with your best stars for each.
- **New: Five ranks, each bringing something**
  - Points come from every picture and every new kind of shot. FENCE REGULAR (600 points) brings a 400 mm lens and the landing fence; CROWD-LINE PRO (1,800) 600 mm and burst shooting (hold the shutter); AVIATION PHOTOGRAPHER (4,000) 800 mm and the runway end; MAGAZINE COVER (8,000) a 1.4× teleconverter, 1,120 mm.
- **New: Four places to shoot from (V)**
  - The crowd line at show centre; the static park behind the crowd; the landing fence under the approach, where the jets land right over your head; and the runway end, behind the takeoff roll with the afterburners lit.
  - The grounds have a crowd barrier, about 1,150 spectators, marquees and a commentary stand. Four jets stand on the static display behind the crowd: yours and three others, with empty cockpits.
- **Improved: New vapour cone and wing vapour, in every mode**
  - Near Mach 1, low in damp air, a jet now wears a real vapour cone: a bell-shaped shroud of cloud from about the canopy back past the wings, sharp at the front and ragged at the back.
  - In a hard pull, sheets of vapour now form over the wings and stream back off them. Both used to be a few round puffs.

## v5.3.2 (2026-10-07)

### Space Exploration: Real time warp, a map for the rockets

- **Fixed: 1,000,000× now means 1,000,000×**
  - On a slow frame the clock used to fall behind the warp you set; now it keeps up.
  - In the parking orbit the orbit is worked out exactly, in one go, so even a million times faster costs no more than real time.
  - A speed you set by hand still stops in time for the next burn or the station: Crew Dragon at 1,000,000× used to fly straight past its own burns.
- **Fixed: The slider stays where you put it**
  - Let go of the slider and it no longer jumps back to 10×. The thumb stays where you set it, and the fill shows the speed actually running.
  - When something holds the clock back, it says what: A BURN: 50× AT MOST, IN THE AIR: 10× AT MOST, AT THE STATION: 20× AT MOST, SLOWING FOR THE NEXT EVENT.
- **New: A map for the rocket launches**
  - Press M (or MAP) in Artemis II, Crew Dragon and Europa Clipper for the globe from far out, with the track you've flown and the orbit ahead: green round a stable orbit, orange into the air, blue on an escape.
  - Artemis II shows the Moon and its path; Crew Dragon shows the station and its orbit. Drag to turn the globe and roll the wheel to zoom.
  - On Europa Clipper's cruise the map shows the inner solar system from far out.
- **Improved: Calmer warp effects**
  - The streaks of light across the screen are gone: they were too distracting. The glowing blue edges and the rings stay.

## v5.3.1 (2026-10-07)

### Air Combat: Su-57 intakes

- **Fixed: The Su-57's intakes**
  - The intake mouths looked like thin-walled boxes. They now have thick, rounded lips and rounded corners, a gentler rake, and dark ducts inside, the way the real intakes look.

### Space Exploration: Looking around in space

- **Fixed: Dragging to look around**
  - In the Saturn V, Starship to Mars and the rocket launches, dragging left and right turned the view the opposite way to dragging up and down, so it felt like sliding a picture about. Now both work the same way: drag right to look right, drag down to look down.
  - A flick keeps the view turning for a moment after you let go, slowing to a stop. Grab again to stop it.

## v5.3.0 (2026-10-07)

### Space Exploration: Time warp, solid rocks and a big round of fixes

- **Improved: Time warp is one smooth slider**
  - Every space mission has it: the Saturn V, Starship to Mars, the three rocket launches, the rovers and the Solar System Explorer.
  - Drag it, click anywhere along it, or roll the mouse wheel over it, to any speed in between. It clicks softly into the round numbers on the way.
  - The slider always shows the warp actually running. With fast forward on it glides by itself, lit amber and marked AUTO. When a burn or the air holds the clock back, a small marker stays where you set it.
  - , and . step to the next mark. Where the number keys picked a speed before, they still do.
- **Improved: Faster warp in the Saturn V**
  - The slider goes from 1× to 10,000×. Up to 500× runs whatever you are doing; faster than that runs on a coast, while burns and the air hold the clock to 500×.
- **Improved: The Solar System Explorer's clock**
  - Its slider reads in time per second, from real time to a year a second, with a pause button beside it (SPACE or 1).
- **New: Time warp you can feel**
  - Light streams outward from the edges of the screen, faster and longer the harder you warp. The edges glow and pulse, and the middle stays clear for the spacecraft.
  - Going into warp, a shockwave ring bursts out; dropping out of it, the ring collapses back with a flash of light. Each power of ten on the way up gives a smaller ring and a glassy tick.
  - A whoosh going in and coming out. On the slider, a chrono dial spins faster as time speeds up, the numbers roll, and light streams along the bar.
  - If your system asks for reduced motion, only the soft glow shows.
- **New: Every rock is solid under the rover**
  - Each rock round the rover has its own footprint and height. A wheel that rolls onto one climbs up over it and down the other side, and the rocker-bogie suspension tips to take it.
  - The rover slows while a wheel is climbing. Boulders taller than about 42 cm, more than the wheels can climb, stop it: back up or turn.
  - The rocks are fixed to the ground now: drive away and come back and the same rocks are in the same places. Before, the whole rock field was laid out afresh every 120 m or so of driving.
  - The start, the landing spot and the targets are kept clear.
- **Fixed: Rover jobs left the clock at 1×**
  - Drilling, firing the laser and flying Ingenuity still run in real time, but the warp you set now comes back when the job is done.
- **Fixed: STOP TO WORK did nothing**
  - Arriving at a target while still rolling, the button now reads STOP · DRILL A CORE (or whatever the job is): it brakes and starts the job.
- **Fixed: More rover fixes**
  - At the tilt limit the rover now stops instead of driving on; turning on the spot gets it out.
  - It no longer drives through the rock the scientists picked at a target: it stops beside it.
  - The laser log gives the real distance to the rock, not always 7 m.
  - When the rover won't go on (a rock ahead, too steep, the tilt limit) a warning says so in the middle of the screen.
  - The mouse wheel over the panels no longer zooms the camera.
- **Improved: Rover map and controls**
  - The map draws the tracks you've driven and a dotted line to the next target, and its shading is only worked out again when you've moved.
  - The wheel tracks are written into place as the rover goes, instead of rebuilt every frame.
  - The job button sits above the controls, so the bottom bar no longer wraps.
- **Fixed: Europa Clipper's cruise**
  - After the escape burn, WARP TO THE CRUISE now carries Clipper all the way out to where the cruise round the Sun begins. It used to stop short and leave you waiting.
  - WARP TO THE NEXT EVENT used to stop an hour short of each flyby and then do nothing, leaving you at 1×: it now runs right up to each one.
- **Fixed: Parachutes on the way home**
  - Orion and Crew Dragon put out their drogues first, then the mains lower down: Orion's drogues at 7.6 km and three mains at 2.9 km, Dragon's drogues at 5.5 km and four mains at 1.8 km.
- **Fixed: Crew Dragon counted twice**
  - The ISS mission now adds one to your missions, not two.
- **Fixed: Saturn V display**
  - On the way to the Moon, the orbit panel shows the closest pass the trip will really make.
  - Once you've landed it shows dashes instead of orbit numbers.
  - The engine restart row is named for the stage you're on, and the angle of attack only shows in the air.
- **Fixed: Moonwalk**
  - A jump or E pressed just before your boots touch down still happens when they land.
- **Fixed: Controls**
  - Keys held down as one mission ended no longer carry into the next.
  - While paused, only Escape and the help do anything.
  - In the rocket launches Escape closes the help first.
- **Fixed: Menus and screens**
  - The Destinations cards now have a FLY button that takes you there.
  - The flight display and the menus fit short and narrow screens better.
  - In the Solar System Explorer, planet names no longer show under the buttons and the info card.

## v5.2.0 (2026-10-07)

### Air Combat: Tanker

- **New: Aerial refuelling**
  - In Free Flight a KC-46A Pegasus tanker flies a racetrack 15 NM out from your base at 22,000 ft and 320 knots, turning at 20 degrees of bank like the real thing.
  - Fly up behind it and take fuel without landing. The bar at the top tells you where to move: FORWARD, UP, LEFT and so on, in metres, with your closing speed.
  - When your fuel is down to about half, an arrow on the HUD points the way to the tanker.
  - Close in, a station-keeping assist eases you into position and holds you there while you take fuel. You still fly the throttle: the bar tells you THROTTLE BACK or MORE POWER, and big inputs take you out of it.
- **New: The flying boom**
  - The F-15EX, F-16, F-22, SR-71 and F-35A take fuel from the boom under the tanker's tail.
  - Hold steady in the boom's reach, below and behind the tanker, and the boom operator plugs into your receptacle: about 55 kg of fuel a second.
  - The boom follows you while you are hooked up. Fly out of its reach, or move too fast, and it disconnects.
- **New: Probe and drogue**
  - The Super Hornet, Typhoon, Su-35S, Rafale, MiG-31, Su-57 and Gripen fly their probe into the basket trailing on the tanker's centreline hose.
  - Line up within a metre and a half of its middle, then push in at 1 to 2 m/s: the hose takes up the slack, and about 25 kg a second flows. The assist holds you just behind the basket while you line up, then eases you in.
  - Hooked up, move more than 5 m/s against the tanker and it's a breakaway.
- **New: The KC-46A**
  - The Boeing 767-based tanker at full size: 48 m long and 48 m across the wings, with its two big engines, the boom with its V-shaped control vanes and telescoping nozzle, the centreline hose and basket, the wing pods, and beacons that blink.
  - It fills your internal tanks first, then any drop tanks, and tells you how much it passed when you're topped off.

### Space Exploration: Crew Dragon to the ISS and home

- **New: Falcon 9 · Crew Dragon to the ISS**
  - A new mission: Falcon 9 lifts Crew Dragon and four astronauts off Pad 3, heading northeast up the coast into the station's 51.6 degree orbit.
  - Nine Merlins and 7.6 MN at liftoff. At main engine cutoff the second stage lights its Merlin Vacuum and Dragon is let go at about 200 km.
- **New: The first stage lands on a drone ship**
  - The first stage flips round, relights three engines for the entry burn, steers with its grid fins and lands on its legs on the drone ship A Shortfall of Gravitas, out in the Atlantic.
  - The camera follows it all the way down to the deck, where it stands with the SpaceX landing circle under it.
- **New: Chasing down the station**
  - Dragon opens its nosecone, coasts for most of an orbit, then fires its Dracos to climb from 200 to 420 km and arrives a few kilometres from the station.
  - The final approach is automatic, as on the real Dragon: holds at 400 m, 220 m and 20 m, then it closes at 10 cm a second, with little puffs from the Draco thrusters.
  - Soft capture, then hard capture at Harmony's forward port. The HUD shows the distance to the station and the closing rate all the way in.
- **New: Undock and come home**
  - Once you're docked, UNDOCK AND COME HOME: the hooks open, springs push Dragon off, and the Dracos back it out to 250 m.
  - The deorbit burn drops the low point of the orbit into the atmosphere and the trunk is let go. Dragon falls heat shield first, through entry at 7.9 km/s.
  - Two drogues steady it, then four orange-and-white main parachutes open, and Dragon splashes down in the Atlantic off Florida.
- **New: The International Space Station**
  - Built to its real layout: Harmony with the forward docking port, Destiny, Unity, Columbus, Kibo with its exposed platform and logistics module, Tranquility, the Cupola, BEAM, Leonardo and Quest.
  - The Russian segment: Zarya, Zvezda, Nauka, Poisk and Rassvet, with a Soyuz and a Progress docked.
  - The 109 m truss carries its eight solar array wings, 35 m long (most with the newer roll-out arrays on them), which turn on their rotary joints to face the Sun. Also on the truss: the big white radiators, the arrays' own radiators and Canadarm2.
- **New: Crew Dragon and Falcon 9**
  - Dragon with its heat shield, SuperDraco pods, windows and the nosecone that swings open over the docking adapter, on its trunk with the solar cells and fins.
  - Falcon 9 with its grid fins and landing legs, the black interstage and the second stage.
- **Fixed: Landed boosters stay put**
  - Falcon Heavy's side boosters no longer drift off their landing zones after touching down.

## v5.0.0 (2026-10-07)

### Air Combat: Three new jets and a new look

- **New: F-35A Lightning II**
  - One F135 engine and Mach 1.6.
  - Four AIM-120Ds in two weapons bays side by side under the belly, and the EOTS targeting sensor under the chin.
  - No head-up display at all: the symbology is on the helmet visor.
- **New: Su-57**
  - Mach 2 and thrust vectoring in three dimensions.
  - Four R-77Ms in two tandem bays, and an R-74M under each wing root.
- **New: Gripen E**
  - A light canard delta with Meteor and the new IRIS-T missile.
  - IRIS-T can lock on to a target 90 degrees off the nose.
- **All three, start to finish**
  - All three have their own cockpits, sounds and Jet Library entries, and fly against you as enemies too.
- **Improved: The jet game looks better**
  - Light streams from the sun in visible rays through gaps in the clouds and past the canopy frame, with lens flares across the picture when you look toward it.
  - The rays and flares stay faint and close to the sun, and they don't shimmer or flicker as the camera moves. The sun doesn't feed the bloom, so the picture never glows so much you can't see.
  - The picture is sharper, with a touch of lens colour fringing at the corners and light film grain, and at high speed the edges of the screen streak with motion.
  - Missile smoke, contrails and wingtip vapour now billow and break up with ragged edges instead of being flat white ribbons.
  - The sun rays, flares, grain and colour fringing are off on Low quality.
- **Improved: Physics you can feel**
  - Pull close to the stall, fly through the transonic zone, or open the speedbrake or drop the gear at speed, and the airframe buffets: the camera and your view shake, and you hear it rumble.
  - Hold a jet past its stall with the G override and a wing lets go: the jet lurches toward it, then the other wing goes.
  - Thrust-vectoring jets (Su-35S, F-22A) hold on far better.
- **New: Real landing-gear struts**
  - They squash on touchdown and rebound, the nose dips when you brake and lifts a little under power, and the jet leans out of a fast turn on the ground.
  - It jolts over runway joints and bumps on rough ground, and the wheels stay on the runway as the struts move.
- **Improved: Faster to load**
  - The first download of the game is about 2.2 MB instead of 3.2 MB: the space program now downloads only when you open it.
- **Improved: New release notes**
  - Only air combat updates are listed here now.
  - Each change has a headline tagged NEW, IMPROVED or FIXED, with the details under it.
  - The newest update is open, and older ones fold to one line each: click one to open it.
- **Improved: If the game can't start**
  - If the browser won't give the game WebGL, it now says so, shows the reason the browser gave, and suggests fixes (restart the browser, update the graphics driver, turn on hardware acceleration) with a TRY AGAIN button.
- **Fixed: Garbled symbols**
  - Garbled symbols in the shared version are fixed.

### Space Exploration: Starbase, rovers and the solar system

- **New: Falcon Heavy launches Europa Clipper**
  - Two new rockets fly two real missions, from a new Pad 3 down the coast.
  - Falcon Heavy launches NASA's Europa Clipper on its real route: 27 Merlin engines and 22.8 MN at liftoff.
  - The two side boosters flip round, fly back and land on Landing Zones 1 and 2 within seconds of each other while the camera follows them in, then the second stage leaves Earth.
  - The cruise runs on the real dates: past Mars on 1 March 2025, past Earth on 3 December 2026, into orbit round Jupiter on 11 April 2030, then a pass 25 km over Europa's ice.
  - Each planet fills the view as Clipper flies by.
- **New: SLS flies Artemis II**
  - NASA's Space Launch System: two solid boosters and four RS-25s, 39.1 MN at liftoff.
  - In orbit the autopilot works out a free return round the Moon. The ICPS burns until it runs dry and Orion's own engine finishes the injection, the way the real mission is flown.
  - Course corrections on the way out and on the way home, with the far side of the Moon thousands of kilometres below.
  - Entry at 11 km/s, three orange-and-white main parachutes and splashdown off the Cape about eight days after launch.
  - Working out a trajectory no longer freezes the game: it computes in the background while the clock holds.
- **New: Rovers on Mars: Perseverance and Curiosity**
  - Among the most detailed objects in the game: Perseverance is about 80,000 triangles, Curiosity about 66,000.
  - Rocker-bogie suspension that follows every rock, six wheels with 48 grousers, the mast with its cameras, the robotic arm and its turret, and the nuclear power source.
  - Ingenuity the helicopter comes too.
  - They drive at their real top speed, 4.2 cm/s, with time warp to cover the ground.
- **New: Three rover missions**
  - SEVEN MINUTES OF TERROR: Mars 2020's landing at Jezero, from entry through the parachute, heat shield and powered descent to the sky crane lowering the rover on its bridles. Then you drive it away.
  - JEZERO SAMPLE HUNT: core rocks, zap them with the laser and fly Ingenuity from its airfield.
  - GALE CRATER: Curiosity drills the old lake bed and heads for Mount Sharp.
- **New: The whole solar system**
  - Every planet and the major moons on their real orbits, with NASA's maps of Jupiter, Saturn, the Galilean moons, Titan, Pluto and more.
  - Saturn's and Uranus's rings, with their real gaps.
  - The sky in every space view is the real one: 40,000 stars from NASA's Tycho star map at their real positions, brightness and colours, and the Milky Way.
- **New: Solar System Explorer**
  - A new SOLAR SYSTEM EXPLORER on the space menu: fly round the whole solar system as it is today, on the real orbits.
  - Pick the Sun, any planet or Pluto from the bar at the top (each planet's moons join the bar when you visit it), and the camera flies there and frames it on its sunlit side.
  - Drag to look round, scroll to zoom from close over the surface out to 60 AU, and speed time up from a pause to a year a second to watch the moons and planets go round.
  - A card shows each world's size, year, day, gravity and distance from the Sun, with a few facts.
- **Improved: The real Earth from space**
  - NASA's Blue Marble, with the real cloud cover and the Black Marble city lights on the night side.
- **Improved: Mars looks far better**
  - From orbit, the planet uses an 8192 by 4096 Viking mosaic, eight times sharper, with real crater fields down to a few kilometres.
  - On the ground, Jezero has its crater rim on the horizon and the river delta to the west, and at Gale, Mount Sharp rises 5 km above the crater floor.
  - The rocks are weathered stone broken along fracture faces, with grain, layering and dust on their tops.
  - The air is clearer, so the crater rims and the mountain stand out.
- **New: Wind on Mars**
  - Layers of dust drift over the ground, streaked and billowing, thickest down low and thinning with height, and they race past as the ship comes down.
  - Dust devils wander across the plains, and close to the ground fine grit blows past in the gusts.
  - The distance fades into the dusty air, and how dusty it is changes from landing to landing.
- **Improved: Real hills on Mars**
  - Rolling hills up to about 800 m high, ridges, flat-topped mesas, knobs and craters.
  - The ground now reaches past the horizon, so the jagged edge on the skyline is gone, and fine detail fades out with distance instead of shimmering.
  - Dark sand and bright dust stand out more, so the far landscape no longer looks like flat tan.
- **Improved: The autopilot picks the landing site**
  - It picks the lowest, smoothest ground along the ship's track, where the air is thickest to brake in. The log names the site and the region.
  - The landing guidance looks ahead at the terrain, so the ship no longer gets caught out by a rise under it.
- **New: Starship's own pad: Pad 2**
  - A full Starbase-sized launch complex beside the Saturn V pad, built at real scale.
  - A 146 m launch-and-catch tower with its chopsticks and the arm that swings clear at liftoff.
  - The orbital launch mount on a raised pad, with a steel-lined flame trench cut through the pad, a curved flame deflector and water deluge pipes.
  - A tank farm with 14 tall tanks and 18 horizontal ones, subcoolers and pipe racks running to the mount and up the tower.
  - Deluge water tanks and a pump house, lightning masts, 16 floodlight masts, a launch-control bunker, workshops, a 660 m by 355 m concrete apron stained with soot, and the Mega Bay across the road.
- **Improved: Enormous liftoffs**
  - A jet of fire blasts out of the mouth of the flame trench, a towering cloud of smoke and steam boils up round the mount and rolls out toward the sea, and a ring of dust races out across the apron.
  - The cloud glows orange from the engines while they're close.
- **Fixed: The trip to Mars**
  - The map's labels no longer stay on screen after you close the map.
  - The solar system map now labels the Sun, Earth, Mars, Starship and where Mars will be when you arrive.
  - The camera looks back at Earth as you leave it, and the vacuum engines' plumes in space are faint, as they really are.
- **Improved: Faster to load**
  - The space program now downloads only when you open it. It's fetched in the background a few seconds after the game starts.
- **New: Release notes in the space menu**
  - Press NOTES at the bottom of the menu to see what's new. They open by themselves when there's an update you haven't seen.
  - Only space updates are listed here.
  - Each change has a headline tagged NEW, IMPROVED or FIXED, with the details under it. The newest update is open, and older ones fold to one line each: click one to open it.
- **Improved: If the game can't start**
  - If the browser won't give the game WebGL, it now says so, shows the reason the browser gave, and suggests fixes (restart the browser, update the graphics driver, turn on hardware acceleration) with a TRY AGAIN button.
- **Fixed: Garbled symbols**
  - Garbled symbols in the shared version are fixed.

## v4.56.1 (2026-10-06)

### Air Combat: Open Ocean fix

- **Fixed: Campaign crash on Open Ocean**
  - Fixed a crash when starting the campaign on the Open Ocean map with a campaign mission saved from another theater.
  - Modes that need land (campaign, daily, recon, strike and the tutorial) now fall back to free flight on the ocean.

### Space Exploration: The real Mars

- **Improved: Mars from the real maps**
  - The planet's colours now come from the Viking orbiters' global colour mosaic (NASA/JPL/USGS), so every dark region, bright dust plain, canyon, volcano and polar cap is where it really is, in its real colours, warmed to the butterscotch of true colour.
- **Fixed: Mars no longer looks like flat beige paint**
  - The dusty-haze effect was measuring the view angle in Mars's rotating frame instead of the world's, so it treated the whole planet as if it were seen edge-on and hid 70% of it behind haze.
  - Now the haze only thickens at the edge of the disc, as it should.
- **Improved: More detail from orbit**
  - From orbit, Mars has detail below the map's resolution: mottling of dark sand and bright dust, plus small hills and crater walls shaded by the Sun, fading in as you get closer.
  - The stars and the Sun now sit behind the planet instead of showing through it, and the Sun is no longer drawn on top of the planet.
- **Improved: Smooth ground, hills, dunes and craters**
  - On the ground, the terrain is smooth instead of stair-stepped: the height map is now interpolated with smooth curves, and the planet's height texture is filtered.
  - The landscape has rolling hills, flat-topped rises, dune fields with long crests, and craters at four sizes from 10 m to 2.6 km.
  - Dark sand gathers in low ground and bright dust lies on the rises, and the old stripy colour pattern on the ground is gone.
- **Improved: Better landing dust**
  - The landing dust is a fine dust storm instead of big round blobs, and the ignition flash no longer whites out the screen.

## v4.56.0 (2026-10-06)

### Space Exploration: Red planet, for real

- **Improved: Mars looks like the rovers' photographs**
  - The ground is fine reddish-brown dust and sand drifted into low ripples, strewn with pebbles and cobbles of dark basalt, rusty fragments and the odd pale stone, many half sunk in the drift.
  - The detail holds up from right next to the ship out to the horizon without visibly repeating.
  - Steep slopes show darker exposed rock, and boulders of several shapes sit half-buried round the landing site.
- **Improved: New lighting on Mars**
  - The sky is captured as light: the steel reflects the real butterscotch sky, and every shadow is filled with the warm light of the dusty air and the sunlit ground.
  - The sky is butterscotch at the horizon, a deeper brownish tan overhead, with a bluish glow round the Sun that spreads into the famous blue sunset when the Sun goes down.
  - The distant haze is the colour of the sky, and night is truly dark.
- **Improved: Richer colour from orbit**
  - From orbit, Mars is the rich butterscotch of the orbital photographs instead of a washed-out cream, and the glowing rim of the atmosphere only shows past the edge of the planet.
- **Improved: A dramatic entry**
  - On entry a sheath of glowing plasma hugs the belly, flickering, with a long pink-orange wake streaming behind the ship and embers torn off the flaps; the camera shakes with the heating.
  - In the belly-flop the flaps visibly work to steer the fall.
- **Improved: A dramatic landing burn**
  - The landing burn opens with an ignition flash, and the camera swings low and wide for the landing.
  - The Raptors light the ground and the dust orange from below as they blast out a ring of dust that races outward and billows up, flinging grit and pebbles across the ground.
  - On touchdown the legs take the weight and spring back, the nozzles glow hot and slowly cool, the dust drifts and settles, and the camera circles the ship.

## v4.55.0 (2026-10-06)

### Air Combat: F-16 intake

- **Improved: F-16 intake**
  - The F-16's intake is less of a smile now: the lower lip is flatter across the middle and the corners don't ride up as high, closer to the real jet.

### Space Exploration: Starship to Mars

- **New: Starship to Mars**
  - Open MISSIONS in the space program (or click STARSHIP on the LAUNCH PAD page) and fly the whole trip, from the pad to the ground on Mars.
  - The window is the real one from today: leave Earth in early November 2026 and arrive in September 2027.
- **New: Super Heavy and Starship**
  - Super Heavy and Starship are built to the next-generation figures: a 72.3 m booster with 33 Raptor 3s, 3,650 t of propellant and 8,240 tf of thrust, three grid fins, four chines and the hot-staging ring built into its top; and a 52.1 m ship with 1,550 t of propellant, three sea-level and three vacuum Raptors, black hexagonal heat-shield tiles over the stainless steel on its windward side, two forward and two aft flaps, the raceway and six landing legs.
- **New: The flight**
  - 33 engines light at liftoff, the stack throttles back through max-Q, then hot-stages: the ship lights its engines while still on the booster, and Super Heavy flips for its boostback burn.
  - The ship flies on to a 200 km orbit, where tankers refuel it over three weeks.
  - When the window opens, the trans-Mars injection burn sends it on a seven-month coast, with course corrections along the way.
- **New: Mars**
  - The planet is built from its real geography: Olympus Mons and the Tharsis volcanoes, the Valles Marineris canyons, the Hellas and Argyre basins, the northern lowlands, the polar caps and thousands of craters, with its dark and bright regions.
  - The thin air glows butterscotch by day with a blue halo round the Sun.
  - Starship enters belly first at over 5 km/s in a glow of plasma, banks to bleed off speed, falls belly-down with its flaps, then flips upright and fires its engines to land on its legs.
  - Engine blast kicks up dust off the boulder-strewn ground.
- **New: Autopilot, warp and map**
  - The autopilot can fly every step for you: press SPACE for the next step (launch, refuel, the injection burn), and the fast-forward button warps through the quiet parts and drops back to real time for every event.
  - Turn the autopilot off (T) to steer and throttle the landing yourself.
  - The map (M) shows your orbit, and in deep space the Sun, the orbits of Earth and Mars, and your path to Mars.
- **Improved: Exact time warp**
  - Time warp now runs at exactly the speed you pick.
  - Choose 500x and you get 500x: it no longer drops back on its own.
  - The Starship mission has speeds from 1x to 1,000,000x.

## v4.54.2 (2026-10-06)

### Air Combat: The Viper's smile

- **Improved: The F-16 intake's real shape**
  - Head on, the mouth is a wide crescent "smile": the lower lip curves down deepest in the middle, the upper lip sags with it, and the corners ride high at the sides.
  - From the side it's steeply raked, with the upper lip jutting forward like a hood and the sides sweeping back to a lower lip half a metre further aft.
  - The nose gear now sits just behind that lip, as on the real jet.

## v4.54.1 (2026-10-06)

### Air Combat: Viper, rebuilt

- **Fixed: F-16 rebuilt from nose to tail**
  - A bug in how its cross-sections were built had left out the lower half of the radome and of the whole rear fuselage, which is why the jet looked hollow and scrambled.
  - The body is now complete all the way round.
- **Improved: New nose**
  - The radome is a full drooped ogive like the real one, with the underside running nearly straight back to the intake and the top climbing to the windscreen.
  - Behind it, the forebody has the F-16's sharp side chines, which flow straight into the strakes, and it narrows below into a keel over the intake.
- **Improved: New rear**
  - The speedbrake housings now sit either side of the nozzle, with a petal above and below each that opens like a clamshell.
  - The fin-root "beaver tail" fairing runs back over the nozzle, and the stabilators are mounted just outboard of the housings, as on the real jet.
- **Fixed: Cockpit sides and nose gear**
  - The cockpit sides are now flat right up to the canopy rails, so nothing from the cockpit pokes through the skin.
  - The nose leg no longer has boxy doors sticking out below the intake.

## v4.54.0 (2026-10-06)

### Air Combat: Viper

- **New: F-16C Fighting Falcon**
  - The F-16C Fighting Falcon, the Viper.
  - A Block 50 with the General Electric F110-GE-129 (29,500 lb in afterburner), Mach 2, a 50,000 ft ceiling and a hard 9 G limit.
  - It's small and light, flown by computer with relaxed stability, and it rolls faster than anything else here: 300 degrees a second.
- **New: Built to the real dimensions**
  - The model is built to the real dimensions: 15 m long with the pitot, 9.96 m across the wingtip launchers, 4.88 m tall.
  - The fuselage runs as one piece from the radome to the nozzle.
  - The strakes curve forward from the cropped-delta wing into the cockpit sides, and the ventral intake's 'smile' sits under the cockpit with its splitter plate and the nose gear just behind the lip.
- **New: Canopy, wings and tail**
  - It has the frameless, gold-tinted bubble canopy over an ACES II seat tilted back 30 degrees, full-span leading-edge flaps and flaperons that droop when the gear comes down, all-moving stabilators with 10 degrees of anhedral, a tall fin, twin ventral fins, the split speedbrake petals beside the nozzle, and the wingtip launch rails.
- **New: Gun, probes and paint**
  - There's also the M61A1 port in the left strake, the nose pitot and angle-of-attack probes, the IFF 'bird slicers' ahead of the windscreen, the refuelling door on the spine, nav lights on the intake sides and a tail hook.
  - It wears USAF two-tone grey with panel lines, the RESCUE arrow, stencils, the national insignia on the intake trunk, a tail code and serial.
- **New: Cockpit**
  - Two colour MFDs either side of the up-front controls, standby instruments, the HUD on top of the glare shield and the side-stick on the right console.
  - With no canopy bow, it has the best view out of any jet in the game.
- **New: Weapons and loadouts**
  - The M61A1 Vulcan with 511 rounds, and nine stations carrying AIM-120D, AIM-9X, GBU-31 and GBU-32 JDAMs and 370-gallon tanks.
  - Five loadouts: Combat Air Patrol, Max AAM, Strike, Dogfight and Long CAP.
  - It has its own engine sound, RWR symbol, MFD pages, fuel tanks and an entry in the JET LIBRARY, and it flies in every combat mode, including as a wingman in the campaign.

## v4.53.0 (2026-10-06)

### Air Combat: Up close

- **Improved: Detail up close**
  - All nine jets look much more like the real thing up close.
  - Bring the hangar camera right up to one and you'll see rows of flush rivets along the frames and stringers, screws round the access panels, a fine texture in the paint that breaks up the reflections, and paint worn back to grey primer along the leading edges and panel lines.
  - From further away the jets stay as clean as before, with no shimmer.
- **Fixed: Lighting on the left side of every jet**
  - Parts built as a mirror image of the right-hand side (the intakes on most jets, tail booms, conformal fuel tanks, tailplanes and control surfaces) were shaded as if they faced inwards, so on the left they looked almost black, in the hangar and in the air.
  - Both sides now catch the light the same way.
- **Improved: Deeper panel lines**
  - Panel lines are cut deeper, so the seams catch the light the way they do on a real airframe.
- **Improved: Real canopy glass**
  - Look straight through one and it's almost clear, so you can see the pilot and the cockpit; towards the edges it turns to a mirror.
  - The F-22 keeps its gold-tinted canopy, now with the same glassy edges.
- **Improved: Hangar lighting**
  - In the hangar, light now bounces up off the floor onto the jet, so the belly and the undersides of the wings are no longer lost in shadow.
  - The portraits in the JET LIBRARY get a little of the same light.
- **Factory paint for this update**
  - Everyone's jet is back in its factory paint for this update, so you can see the new detail as it really is.
  - Your wrap or colour hasn't been lost: open the PAINT SHOP, pick WRAP or SOLID COLOUR, and the one you had comes straight back.
  - Press APPLY to keep it.
  - This happens only once.

## v4.52.2 (2026-10-05)

### Air Combat: No kill camera

- **Kill camera removed**
  - When your missile hits, the view stays with your own jet at normal speed, and the KILL CAMERA option has been taken out of the settings.

## v4.52.1 (2026-10-05)

### Air Combat: Twenty fixes

- **Fixed: Kill camera skip**
  - Pressing [F] to skip it now takes you back to the view you had.
  - It used to drop you into the cockpit even if you were flying in the chase view.
  - It also ends cleanly if you change the view any other way.
- **Fixed: A won mission stays won**
  - A mission you've won stays won.
  - If a last missile caught you during the closing radio calls, the result used to flip to MISSION FAILED.
- **Fixed: SHEPHERD**
  - The mission no longer counts as complete when only one Strike Eagle reaches the target.
  - At least two have to get there, as the briefing says.
- **Fixed: Campaign objective after a restart**
  - After FLY IT AGAIN or a restart, the objective at the top of the screen no longer shows the previous attempt's goal, or a broken countdown, while the briefing is up.
- **Fixed: Rearming keeps your weapon**
  - Rearming on the ground keeps the weapon you had selected.
  - After reloading a strike loadout you stay on bombs, instead of being switched to missiles and firing one by mistake.
- **Fixed: Missions run on game time**
  - Missions now run on game time, not real time.
  - In a free-for-all, once you're out and watching, fast-forward [T] now speeds up the shrinking zone as well as the jets, and mission timers pause properly during the kill camera's slow motion.
- **Fixed: No RESTART MISSION online**
  - The pause menu no longer offers RESTART MISSION in an online match, where it did nothing.
- **Fixed: Flight School restart**
  - RESTART MISSION during the lessons starts the lessons again.
  - It used to skip straight to the checkride.
- **Fixed: Your wingman when you land**
  - When you come home to land, VIPER 1-2 now breaks off and circles high over the field.
  - He used to try to hold formation next to you all the way down to the runway.
- **Fixed: NIGHT HUNTER**
  - GHOST no longer runs out of fuel on its long afterburner dash and falls into the sea on its own.
- **Fixed: LONG SHOT and KNIFE FIGHT**
  - The LONG SHOT decoration now counts kills from beyond 30 NM with the MiG-31's R-37M.
  - Its description and KNIFE FIGHT's now cover every jet's missiles, not just the AIM-120D and AIM-9X.
- **Fixed: Airstrike briefing**
  - It said to rearm with [K], which drops your fuel tanks.
  - It now says [H].
- **Fixed: Infrared tracker message**
  - The message you get pressing [I] in a jet without an infrared tracker now lists every jet that has one, the MiG-31 included, and so does the key's description in the controls list.
- **Fixed: Free Flight respawn**
  - After a respawn on the runway you no longer get a "welcome to the field" landing message straight away, and the flight time on the results screen starts again from zero.
- **Fixed: Waking enemy patrols**
  - An enemy patrol waiting to be woken now reacts when you fire at it or shoot one of its jets down.
  - Before, you could pick it off from long range while it kept flying in circles.
- **Fixed: Airstrike patrol**
  - The same fix for the patrol over the target.
  - It turns on you when you shoot at it, not only once you get close.
- **Fixed: Campaign mission picker**
  - Clicking CAMPAIGN again keeps the mission you picked from the list, instead of jumping back to the first mission you haven't finished.
- **Fixed: Wave Combat controller**
  - When the radar picture fades, the controller now gives the right direction to the bandits' last known position.
  - It used to say "to the east" every time.
- **Fixed: Main menu refresh**
  - Coming back from a mission now refreshes everything at once, so new campaign stars, newly unlocked missions and the daily mission's DONE tag show without having to click around first.
- **Fixed: Wave Combat restart**
  - RESTART takes you back to the wave you chose to start on, and the button now says which wave that is.
  - It always used to go back to wave 1.

## v4.52.0 (2026-10-05)

### Air Combat: Wolf of the Strait

- **New: CAMPAIGN: Wolf of the Strait**
  - CAMPAIGN, a story in eight missions called Wolf of the Strait.
  - It's at the top of the game modes.
  - The RED coalition stops turning back at the line, and its ace, WOLF 1, leads them.
  - Each mission unlocks the next one.
- **New: Eight missions**
  - FIRST CONTACT, meet two fighters at the line.
  - WOLF AT THE DOOR, scramble from the runway and stop four bombers before they reach your base.
  - BLIND THEIR EYES, bomb the radar station that saw you coming.
  - SHEPHERD, escort four Strike Eagles to the enemy airbase and watch it burn.
  - NIGHT HUNTER, catch a MiG-31 running in high and fast on a pitch-black night.
  - ANVIL, hit the well-defended command post.
  - FULL SKY, lead six jets into an eight-ship battle.
  - THE WHITE WOLF, meet WOLF 1 himself.
- **New: A wingman and a story**
  - You fly with a wingman, VIPER 1-2, who holds formation until the fight starts and then fights on his own.
  - The story plays out over the radio: your controller calls the bandits, the bomber leads call for help, and you hear WOLF 1 on the enemy channel, who learns your name and comes looking for you.
- **New: Three stars per mission**
  - Every mission has three stars: one for completing it and two for flying it well (bring your wingman home, land back at base, take no damage, protect every bomber, and more).
  - Stars you earn stay earned, the mission list shows them, and the total is on the CAMPAIGN button.
  - Finish a mission and NEXT MISSION takes you straight to the following one.
- **Improved: Dawn to dusk, on every map**
  - The campaign sets the time of day for each mission, from dawn scrambles to a dusk showdown, and the night mission turns the sky pitch black for your night-vision goggles.
  - The difficulty slider makes the enemy pilots sharper or softer.
  - It plays on Triad Isles, Frostfall Strait and the Jade Archipelago with the place names of each, using any fighter.
- **New: Kill camera**
  - When one of your missiles is about to hit, the view cuts to a slow-motion shot beside the target, the missile streaks in, the jet blows apart, and the game eases back to full speed.
  - Press [F] to skip it.
  - It never plays online or while a missile is chasing you, and you can turn it off under KILL CAMERA in the settings.

## v4.51.0 (2026-10-05)

### Space Exploration: Moonwalk

- **New: Walk on the Moon**
  - A few seconds after touchdown the astronaut climbs down the ladder, and from then on you're in control.
  - Move with W A S D, hold SHIFT to lope in the bouncing Apollo stride, and press SPACE to jump: in one-sixth gravity you crouch, spring and hang in the air for a long, slow arc before landing in a puff of dust.
- **New: Bootprints and moon dust**
  - Every step leaves a ridged bootprint in the regolith, and every footfall kicks up grains of dust that fly in clean arcs and drop straight back down, because there's no air to hold them.
- **New: Plant the flag**
  - Walk somewhere you like and press E.
  - The astronaut lifts the pole, drives it into the ground twice, unfurls the flag along its top bar, steps back and salutes.
- **New: Mission complete**
  - To finish, walk back to the ladder and press E.
  - The astronaut climbs aboard, and the mission ends with a MISSION COMPLETE card showing your time outside, distance walked, jumps and highest jump.
- **New: Three spacesuits**
  - The Apollo A7L, the white moonwalking suit with its gold sun visor, life-support backpack, chest control box and red and blue hose connectors.
  - The Axiom AxEMU, black with orange and blue bands, under a clear bubble helmet with its light bar.
  - The orange ACES pressure suit, with its white harness straps, white helmet with dark visor and black boots.
  - Every suit has woven, creased fabric, and dust gathers from the knees down.
- **New: Pick your suit**
  - Pick your suit under SPACESUIT on the Launch Pad page, or press V during the moonwalk to change suits on the spot.
- **Improved: Light bounced off the ground**
  - The shadowed side of the astronaut and the lander is now lit softly by sunlight bouncing back off the bright ground, as in the Apollo photos.
- **Improved: A camera that clears the ridges**
  - The moonwalk camera rises over crater rims and ridges by itself, so the ground never hides the astronaut.

## v4.50.0 (2026-10-05)

### Air Combat: Menu music fix

- **Fixed: Menu music**
  - Fixed the menu music being silent.
  - It now plays through the game's own sound system.

### Space Exploration: To the Moon

- **New: The Moon**
  - The Moon is here, at full size and at its real distance, circling Earth and turning to keep one face toward us.
  - Its gravity pulls on everything nearby, and from orbit you see dark maria, pale highlands, craters on craters and the bright rays of young ones, with faint blue earthshine on the night side.
- **New: Fly to the Moon**
  - Fly to the Moon and land on it.
  - In Earth orbit, press GO TO THE MOON and the autopilot flies the whole trip.
  - It waits for the right moment, then fires the S-IVB to push you out of Earth orbit.
  - Small correction burns trim the aim, three days of coasting follow, and a braking burn behind the Moon captures you into a 110 km lunar orbit.
  - Then press LAND ON THE MOON.
  - It's a one-way trip: the lander stays.
- **New: Transposition and docking**
  - The adapter's four panels swing open and tumble away, the command module backs off, turns round, comes back nose first and docks with the lunar module, then pulls it free of the S-IVB.
- **New: The lunar module**
  - The gold- and black-foil descent stage, the faceted crew cabin with its triangular windows, the docking tunnel, thruster quads, antennas, and four legs with footpads, contact probes and a ladder.
  - Its legs swing out before it goes down.
- **New: The landing**
  - The lander undocks, and the command module stays up in orbit.
  - The computer picks a spot on the near side with the Sun low behind you.
  - It lowers the orbit to 15 km, then flies the powered descent: braking along the path, pitching up through the high gate with the ground ahead, then a slow, almost vertical descent with the throttle easing back, dust blasting out across the ground, contact light, engine stop.
- **New: First steps**
  - After touchdown the camera swings round to the sunlit side, an astronaut steps off the ladder, bounds out and plants the flag, and Earth hangs in the black sky.
- **Improved: The lunar surface up close**
  - The lunar surface up close looks like the Apollo photos: warm grey regolith full of small pits and grain, craters of every size, thousands of rocks and pebbles, and hard black shadows under a low Sun.
- **New: New start: LUNAR ORBIT**
  - LUNAR ORBIT, with the command module docked to the lunar module 110 km above the Moon, ready to land.
  - The pause and end screens let you jump between all three starts.
- **Improved: Pick your time warp**
  - Pick your time warp: 1×, 2×, 10×, 100× or 500×, or AUTO, which races through long coasts (up to 10,000×) and slows down by itself for every burn, the docking and the landing.
- **Improved: New engine fire**
  - New engine fire on every engine.
  - Each plume now has a white-hot core and an outer flame, with turbulence streaming down it.
  - The F-1s get shock diamonds in thick air and the dark curtain of their turbine exhaust near the nozzles, and their flames balloon as the air thins.
  - The J-2s burn a pale blue.
  - The service module's and lunar module's engines burn with a faint, translucent glow.
  - There's a hot glow at every nozzle cluster.
- **Fixed: Rainbow bands on Earth**
  - Fixed the rainbow-coloured bands across Earth near the line between day and night: the atmosphere now fades smoothly into Earth's shadow.
- **Fixed: Menu music**
  - Fixed the menu music being silent.
  - It now plays through the game's own sound system.
  - It also keeps playing, looping seamlessly, while you fly the Saturn V.
- **Improved: Instruments round the Moon**
  - The ORBIT, FALLING and SAFE lamps, the orbit panel, the attitude ball and the map all work round the Moon too.
  - On the way out, the map shows your predicted path to the Moon and the Moon's own orbit.

## v4.49.0 (2026-10-05)

### Air Combat: Menu music

- **New: Menu music**
  - "High Up" now plays in the main menu.
  - It's only in the menu: it fades out smoothly when a mission or flight starts and fades back in when you return.
- **Improved: A seamless loop**
  - It loops seamlessly: the end of the track crossfades into the start, so there's never a gap or a jump.
- **Music on or off**
  - Turn it on or off with MUSIC ON/OFF at the bottom of the menu.
  - Your choice is remembered.

### Space Exploration: Menu music

- **New: Menu music**
  - "High Up" now plays in the main menu.
  - It's only in the menu: it fades out smoothly when a mission or flight starts and fades back in when you return.
- **Improved: A seamless loop**
  - It loops seamlessly: the end of the track crossfades into the start, so there's never a gap or a jump.
- **Music on or off**
  - Turn it on or off with the MUSIC button in the top bar (its little bars bounce while it plays).
  - Your choice is remembered.

## v4.48.0 (2026-10-05)

### Space Exploration: Easy rocket controls

- **Improved: Much simpler Saturn V controls**
  - Flying the Saturn V is much simpler now.
  - The wall of switches is gone.
  - In its place, one line tells you what's happening and what to do next, with a few big buttons for the things you can do right now.
- **New: One-button launch**
  - On the pad there's just LAUNCH (SPACE).
  - The autopilot counts down, lifts off, drops each stage as it burns out and flies you all the way to orbit.
  - All you do is watch.
- **New: Three goals in orbit**
  - Once you're in orbit you get three goals, and the autopilot flies whichever you pick.
  - GO HOME turns the rocket round, fires the braking burn, separates the capsule, and lets the heat shield and parachutes bring you down to a splashdown.
  - GO HIGHER climbs to a bigger orbit in two burns, a step at a time from 400 km up to geostationary height.
  - LEAVE EARTH burns outward until you break free of Earth's pull.
  - Each button says beforehand whether you have the fuel: GO HIGHER only offers a climb you can come back from, and LEAVE EARTH tells you how far you'd get if you can't break free.
- **New: FAST FORWARD (F)**
  - It speeds through the waiting and slows down by itself for every burn, staging and re-entry, so nothing gets skipped.
  - On the way home the capsule now speeds down under its parachutes too.
- **New: Take over any time**
  - STOP AUTOPILOT or a touch of W A S D hands you the controls at any time.
  - During the climb an ABORT button appears in case you need to save the crew.
- **New: PRO mode**
  - Want every switch of the real rocket?
  - Press PRO (P) for the full panel with staging, engine restarts, attitude modes and time warp.
  - Press EASY to go back.
  - Your choice is remembered.
- **Fixed: Fixes**
  - The countdown no longer logs "Ignition sequence start" twice, and the rocket holds its attitude steadily at high time warp.

## v4.47.0 (2026-10-04)

### Space Exploration: Fly the Saturn V

- **New: The Saturn V flies**
  - Press LAUNCH on the Launch Pad page (or FLY on the Orbital Flight mission) and choose where to start: on Pad 1 with the count holding at T-20 seconds, or already in a 185 km parking orbit with the S-IVB and the Apollo spacecraft.
- **New: Liftoff**
  - From the pad, press SPACE to resume the count.
  - The five F-1s light in sequence at T-8.9 s, the hold-down arms let go at zero, the swing arms pull back, and the rocket climbs out of a cloud of steam and smoke lit orange by the fire, and the roar changes as the air thins.
- **New: Real stages**
  - The S-IC burns out and drops away, the S-II's interstage and the escape tower are jettisoned, the S-II's centre engine shuts down early to stop pogo, and the S-IVB burns to orbit.
  - Each spent stage tumbles away on its own path and falls back into the atmosphere.
  - Auto-staging (T) drops stages as they burn out, or you can turn it off and stage yourself with SPACE.
- **New: Full-scale physics**
  - The physics run at full scale: a real-size Earth spinning under you, gravity that weakens with height, a standard atmosphere, F-1 thrust that grows as the air thins, propellant burned engine by engine, drag, and aerodynamic loads.
  - The rocket steers by gimballing its engines, so it turns slowly and heavily.
  - Turn too hard through max Q and the aero load breaks it apart.
- **New: Autopilot and attitude hold**
  - The Instrument Unit can fly the ascent for you (G): straight up off the pad, a pitch-over, a gravity turn, then a closed-loop climb into a 185 km parking orbit, with S-IVB cutoff when the orbit is reached.
  - Take over at any time with W/S to pitch, A/D to yaw and Q/E to roll, or hand the attitude to the stability system: hold, prograde, retrograde, normal, anti-normal, radial out or radial in (keys 1 to 8, 0 for free).
- **New: Engine restarts and coming home**
  - The S-IVB can restart its J-2 twice in orbit (Z), with ullage motors settling the propellant first.
  - X cuts the engines.
  - Burn retrograde to bring your periapsis down into the atmosphere, then separate the command module (J twice) for the ride home.
- **New: A spaceflight UI**
  - A new flight UI built for spaceflight.
  - A mission clock and a status badge sit at the top with three lamps: ORBIT when the orbit clears the atmosphere, FALLING when you're coming down, and SAFE when you're on an escape path, free of Earth's pull.
  - The vehicle panel shows what's left of the stack, each engine's state, propellant, mass, thrust-to-weight, Δv and burn time.
  - The orbit panel draws your orbit and lists apoapsis, periapsis, time to each, inclination, period and eccentricity, and what you're flying over.
  - The attitude ball in the middle shows prograde, retrograde, normal and radial markers, with altitude, vertical speed, g, orbital and surface speed, and Mach on either side.
  - Below that are dynamic pressure and aero load bars, and there's a flight log of every event.
- **New: Map view**
  - Map view (M) pulls back to show the whole Earth and your predicted path.
  - The line is green for a stable orbit, amber when it dips into the air, orange-red inside the atmosphere and blue on an escape path, with apoapsis and periapsis markers, an IMPACT marker where a falling path meets the ground, and a dashed line where the orbit passes behind the planet.
- **New: Earth and sky**
  - The Earth is drawn at full size with continents, deserts, forests, ice caps, oceans that catch the sunlight and city lights on the night side, under a drifting cloud deck.
  - A real scattering atmosphere paints the blue limb, the sky as you climb, and sunrise along the terminator.
  - In orbit the stars and the Milky Way come out, and they shine brightest when you pass into Earth's shadow.
- **New: Three cameras**
  - Three cameras (C): a chase camera you can drag around and zoom (it closes in as stages fall away), a long-lens tracking camera on the causeway, and an onboard camera looking down past the stages at the plume and the Earth.
  - The F-1 plume is long and narrow at sea level and balloons into a huge glowing cloud as the air thins.
  - The J-2s burn an almost invisible pale blue.
- **New: Time warp**
  - Time warp up to 10,000× (comma and period) while coasting.
  - Under power or in the atmosphere it's limited to 4×.
- **New: Abort, re-entry and splashdown**
  - Abort (B twice) fires the launch escape tower on the pad or during ascent, pitches the command module out over the sea and jettisons the tower.
  - Coming home, the command module glows with re-entry plasma, the drogues open, then the three striped main chutes, and it splashes down.
  - Each flight ends with a card showing your max altitude, speed, g, max Q and time in space.
  - Launches, missions and days in space count toward your commander record.
- **Pause and controls**
  - Press ESC to pause, restart, or switch to the other starting point, and H for the full controls list.

## v4.46.0 (2026-10-04)

### Space Exploration: The Saturn V

- **New: The Saturn V on the pad**
  - It's built at full scale, 110.6 m from the F-1 engines to the tip of the escape tower, stage by stage: the S-IC first stage with its five F-1s, four fins and engine fairings; the S-II on its interstage with the ullage motors; the S-IVB above its conical adapter; the Instrument Unit ring; then the Apollo spacecraft with the lunar module adapter, the service module with its thruster quads, the command module under its boost cover, and the orange launch escape tower.
- **New: Apollo paint**
  - It wears the Apollo paint scheme: white with the black-and-white roll pattern on the first stage, intertank, interstages and third stage, "USA" down the first stage, "UNITED STATES" and the flag, ribbed skirts and intertanks, and a little weathering.
- **Improved: The pad is ready**
  - Four hold-down arms carry the rocket on the launch mount, the tower is now the red-orange of the real umbilical towers with a hammerhead crane on top, every swing arm reaches across to the rocket's skin, and the crew access arm ends in the white room at the command module hatch.
  - Two searchlights light the vehicle, and liquid oxygen vapour drifts off its vents.
- **New: Saturn V figures**
  - The Launch Pad page shows the Saturn V's figures: height, diameter, liftoff mass and thrust, payload to low orbit and to the Moon, and a card for each stage (engines, propellants, thrust, length, fuelled mass and burn time) plus the Instrument Unit's guidance computer.

## v4.45.1 (2026-10-04)

### Space Exploration: Inverted vertical look in the space menu

- **Improved: Inverted vertical look**
  - Dragging up and down to look around is now inverted.
  - Left and right work the same as before.

## v4.45.0 (2026-10-04)

### Space Exploration: A living launch site and a real shoreline

- **Improved: Real cars and traffic**
  - Every car around the launch site is rebuilt with a real shape: sedans, hatchbacks, SUVs, pickups and vans with curved bodies, glass, glossy clear-coated paint, wheels with silver hubs, and head and tail lights.
  - They park in painted bays in a car park and along the road, and traffic now drives up and down the coast road with its headlights on.
- **Improved: Rebuilt cranes**
  - The crawler crane is rebuilt: tracks with shoe plates, a machinery house with louvres, an operator's cab with windows, a stacked counterweight and an A-frame gantry.
  - Its lattice boom now tapers at both ends and is braced on all four sides, with pendant lines and hoist ropes down to a hook block.
  - The small crane is now a real truck crane, with a telescopic boom, ten wheels and outriggers.
- **Improved: Detailed buildings**
  - The site buildings have rows of windows (a few still lit), parapets, rooftop air handlers with fans, vent stacks, roll-up bay doors, entrance canopies with lamps, and outside stairs.
- **New: Lots more round the pad**
  - Lots of new things around the pad: fuel tankers at the tank farm, box trucks, a shuttle bus, three tracking dishes and a radome, stacks of shipping containers, and concrete barriers.
  - There's also a gatehouse with a boom barrier on a new access road, street lights, two mobile lighting towers on the pad, a windsock, a half-buried concrete blockhouse, a pipe rack from the tank farm to the pad, and sand fences along the dunes.
- **Improved: The beach meets the sea**
  - The beach meets the sea properly now.
  - The water is glass-clear over the sand at the edge, turquoise in the shallows and deep blue-green further out.
  - Lines of breakers roll in with lacy foam behind each crest, a sheet of water washes up the sand and slides back, and the sand is dark and glossy where the waves have been.

## v4.44.0 (2026-10-04)

### Space Exploration: A sunrise launch site and a new space menu

- **New: A mission-control menu**
  - Space Exploration has a brand-new menu built like mission control.
  - A glass top bar holds the program switch, three tabs with a sliding highlight, a live UTC clock and your commander badge.
  - Panels slide in one after another when the menu opens, the big title types itself out letter by letter, the launch button sits in a slowly turning ring with status lights beside it, and switching tabs replays the animations.
  - The menu is lighter too, so the view behind it shows through.
- **Improved: Sunrise over the sea**
  - The launch site is rebuilt from the ground up as a sunrise over the sea.
  - The sun sits right on the horizon behind the pad, gold at its heart, with rays fanning up through a deck of broken cloud.
  - The clouds glow at their edges near the sun and turn rose and lilac further round.
  - The sky fades from orange at the horizon to blue overhead.
- **Improved: A new sea**
  - Waves drift in several directions at once, the sun throws a glittering path across the water toward you, and surf rolls in and breaks on the beach.
  - The water is clear and sandy in the shallows and deep blue-green further out.
- **Improved: Land to the horizon**
  - The land now runs all the way to the horizon instead of stopping after half a mile.
  - Past the beach and dunes come scrub flats dotted with thousands of bushes and grass clumps, then hills and far mountains inland.
  - A long, hazy shore closes the far side of the bay, with an island off to the right and ships out on the water.
  - Distant land fades into golden haze toward the sun and lilac haze away from it.
- **Improved: The pad**
  - A raised concrete hardstand with a sooted flame trench, an access ramp and scorched sand where the trench vents.
  - Two lightning masts stand taller than the 145 m tower, which now has catwalks, an elevator and swing arms.
  - A water tower stands beside the pad, two big propellant spheres join the tank farm, and the sheds are corrugated metal.
  - Further inland you can see a vehicle assembly hall and a town.
  - Gulls wheel over the pad.
- **Improved: Warm sunrise light**
  - Lighting is warm, low sunrise light with long shadows and soft skylight in the shade.

## v4.43.0 (2026-10-04)

### Air Combat: Space Exploration

- **New: Space Exploration**
  - Click the arrow next to TRIAD at the top left of the menu to switch between TRIAD (air combat) and Space Exploration, a second program with its own menu.
- **Your air combat game is kept**
  - Your air-combat game is kept exactly as you left it.
  - Switch back to TRIAD and your jet, its paint, your logbook and the hangar are all there.
  - The game also remembers which program you were last in.

### Space Exploration: Space Exploration

- **New: Space Exploration**
  - Click the arrow next to TRIAD at the top left of the menu to switch to Space Exploration.
  - The space program has its own blue, black and white menu: Missions, Launch Pad and Destinations, plus a commander card with its own record.
- **New: A coastal launch site**
  - The space menu opens over a coastal launch site on a clear morning.
  - A 145 m launch tower and an empty launch mount wait for the first rocket, with a tank farm, a crawler crane, sand flats, tidal channels and the sea beyond.
  - Drag to look around, scroll to zoom, double-click to reset.
- **Coming next**
  - Coming next: the Saturn V on the pad, then missions to orbit, the Moon and Mars, and rovers to drive there.

## v4.42.1 (2026-10-04)

### Air Combat: SR-71 slimmed down

- SR-71 reshaped to match the real three-view: no more wedge. The forebody is now long and slim, with the nose tapering over its first six metres before the body and chines run parallel back to the wing. The inner wing starts much further aft, and the outer wing panels are smaller and set back behind the nacelles, so the Blackbird has its long, thin, elongated look.

## v4.42.0 (2026-10-04)

### Air Combat: F-22 underside and SR-71 front end

- F-22 underside redone after photos of the real jet, keeping the working weapons-bay doors. The belly is now a neutral metallic grey with a patchwork of radar-absorbent panels in slightly different shades. You can see the big boxy intake-duct panels down each side, sawtooth edges on the bay doors, the small black diamond vents by the engines, lighter heat-resistant panels over the engine bays, flaperon breaks on the wings, and fluid streaks running aft.
- SR-71 front half reshaped: the nose and forward fuselage are fuller and deeper like the real Blackbird, and the canopy sits on top as dark smoked glass instead of a see-through bubble. There is now a radome band near the nose.
- SR-71 paint: a deeper iron-ball black, with bolder red trim outlining the walkways on the wings and fuselage. A new red border runs along the chines up to the cockpit.

## v4.41.3 (2026-10-04)

### Air Combat: F-22 matched to the real jet

- F-22 rebuilt from a top-down photo of the real jet. The wing is now the true clipped diamond: a steep leading edge from the intake shoulders, a cut-off tip, and a near-straight trailing edge. The tailplanes have the real kinked trailing edge (swept forward outboard, notched back beside the nozzles) and a squared-off tip.
- F-22 upper body: the canopy sits further forward and is a little shorter, like the real jet's.
- F-22 colours: a warmer two-tone grey with darker patches, and the pale edge strips that frame the real Raptor's wings and tailplanes.

## v4.41.2 (2026-10-04)

### Air Combat: F-22 reshaped

- F-22 reshaped to match the real Raptor. The tailplanes are now the big clipped diamonds that reach well past the nozzles, with the trailing edge swept forward like the wing. The fins are shorter and broader, with the real 23-degree leading edge and forward-swept trailing edge. The wing sits a metre further forward so it grows out of the intakes.
- F-22 colours: the paint is now the real two-tone medium grey with a faint sheen instead of near-white, and the canopy is a dark smoky gold instead of bright yellow.

## v4.41.1 (2026-10-04)

### Air Combat: Contrail fix

- Contrails no longer show as a hard, glitchy straight line behind the jet. Every jet's trail now builds up softly a little way behind the engines. It fades out when you look straight down its length instead of collapsing into a thin stripe, and it follows the curve of the Earth up high.
- Contrails only form in the altitude band where they really do (about 27,000 to 56,000 ft). There are none in the thin air near space.

## v4.41.0 (2026-10-03)

### Air Combat: X-15 rebuilt, and a high-speed dive fix

- Fixed jets breaking apart in a fast dive into thicker, lower air. The overspeed drag that holds every jet to its top speed could brake so violently that it counted as a fatal over-G. It now slows you hard but safely, and only real G on the wings can overstress the airframe.
- X-15: the drop tanks are back, now in the jet's own black with a bare-metal nose and a thin yellow band. Full power lasts about 10 minutes with the tanks (about 5 without), and the tanks fall away when they run dry.
- X-15: the rocket's control now holds the record envelope. It throttles itself back as you near Mach 6.72 or as your climb heads past about 354,000 ft, so long burns keep you fast and at the edge of space instead of flying off into orbit.
- X-15 rebuilt to match the real jet: the wide body with the big side fairings running nose to tail, a proper canopy hump faired into the spine, the correct short wing, tailplanes mounted on the fairings, a polished ball nose, and a closed tail base around the rocket (you could see into the hollow body from behind before). The paint is now a satin black without the streaks.
- X-15 rocket plume: no more long thin laser beam. The exhaust is short and bright, and spreads out wide as the air thins with height.
- X-15 cockpit: 1960s round dials in place of modern screens. An attitude ball sits in the middle, with Mach, altitude, angle of attack, climb rate, heading, G, chamber pressure and propellant around it. The head-up display is gone (the X-15 never had one), and the canopy frames are no longer in your line of sight. The weapons bar is hidden too, since it carries no weapons.

## v4.40.1 (2026-10-03)

### Air Combat: X-15 flies clean

- The X-15 now flies clean, like the real one in its NASA colours: the two big red and white drop tanks are gone. It still reaches about 354,000 ft, and climbing to 100,000 ft and levelling off with the rocket burning takes it past Mach 6.

## v4.40.0 (2026-10-03)

### Air Combat: X-15: to the edge of space

- New jet: the North American X-15, the rocket plane that flew to the edge of space. It is dropped from under a B-52 at 45,000 ft with the engine off. Throttle up to light the XLR99 rocket (57,000 lb of thrust, about 80 seconds of propellant), pull up to about 42 degrees and hold it: it burns out near 175,000 ft at Mach 5.5 and coasts up to about 354,000 ft, the real record. Climb steeper and it goes higher still.
- X-15A-2 speed run: take the two drop tanks for about another minute of burn, level off near 100,000 ft and it reaches Mach 6.7, the fastest a winged aircraft has ever been flown. The tanks drop away on their own when they run dry.
- Above the air the tail does nothing, so small thrusters in the nose and wingtips point the jet instead. Coming back down, hold 20 to 25 degrees angle of attack to survive re-entry, then glide home without power and land on the skids at about 200 knots.
- The edge of space: climb high and the Earth curves away below you, the sky turns black and fills with stars, and a thin bright band of blue air hugs the horizon. The haze thins out as you climb, and high cirrus fades away below you.
- Detailed X-15 model in black Inconel with the NASA tail band, its own cockpit, engine and propellant pages, and an entry in the aircraft library. It flies in free flight only.

## v4.39.3 (2026-10-03)

### Air Combat: MiG-31 landings and auto-land fixes

- MiG-31 landings fixed: the Foxhound could not fly slowly enough to land, so it came in at about 250 knots, far faster than the real jet. It now has its landing flaps: with the gear down at low speed they add the lift it needs, and it lands at about 175 to 185 knots. It flies exactly as before with the gear up. On auto-land it now catches a carrier wire on the first pass and lands softly on a runway.
- Auto-land: a fast-sinking heavy jet now starts its flare higher above the runway, so it has room to round out.
- Auto-land: when it circles back to set up an approach again, it no longer flies into rising ground. If high ground comes up close ahead of where the jet is really heading, it rolls the wings level and climbs on full power first.
- Multiplayer screen: after a disconnect it could show the SR-71 as your jet. Online you always fly a fighter, and the screen now says so.

## v4.39.2 (2026-10-03)

### Air Combat: Bug fixes

- Fixed: long fights slowly used up more and more graphics memory. The burning wreckage from every jet shot down in the air, and every ejected pilot's seat and parachute, was taken out of the world after it landed but never freed, so a long free-for-all or online session kept piling it up. It is now all cleaned up properly.
- Fixed: night-vision goggles stayed switched on after a mission, so your next flight (even in broad daylight) started in a washed-out green picture. Every sortie now starts with the goggles off.

## v4.39.1 (2026-10-03)

### Air Combat: Carrier auto-land fixes

- Fixed: carrier auto-land could keep circling the ship (swing out, turn in, miss the final approach, swing out again). Heavy jets like the MiG-31 and the SR-71 sagged in the hard turn onto final, were then only allowed gentle turns, and sailed kilometres past the centreline. They now keep turning hard, ease into the final course early enough for their own turn radius, and the final course no longer jumps around while the ship sails its circle.
- Fixed: the Su-35 and the Rafale often landed long on auto-land, floating past every wire for a bolter. The last stretch of the approach is now flown straight at the touchdown point, so they arrive on the glide path and catch a wire.
- Fixed: auto-land could call a wave-off for being low when the jet was already over the deck and about to land.
- In testing every jet launched off the catapult, came back round and caught a wire, almost always on the first pass.

## v4.39.0 (2026-10-03)

### Air Combat: Multiplayer room fixes

- Multiplayer rooms: fixed a match that could get stuck at "MATCH STARTS IN 0 S" forever. If a pilot left without the room noticing (kicked, closed the tab, lost their connection), the others could keep a ghost of them, and when the host then left, the ghost could be picked as the new host and nobody ran the match. Every pilot now sends a small heartbeat, anyone silent for 15 seconds is dropped, and only pilots who have been heard from lately can take over as host.
- Multiplayer rooms: the pilot count in the countdown no longer includes players who have already left.
- A background tab no longer looks like a pilot who has left: the heartbeat keeps going even when your tab isn't in front.

## v4.38.0 (2026-10-03)

### Air Combat: Lights in the dark

- Pitch-black nights are easier to fly: runway, approach and carrier deck lights now stay visible as bright points however far away they are, so you can find a runway or a ship from miles out with the naked eye.
- Every jet now shows its navigation lights at night: red on the left wingtip, green on the right, and a flashing white strobe. Other jets (friend or enemy) show up as moving lights in the dark, and your own wingtips glow in the outside view.
- Carrier deck lights sat so low that the deck hid most of them. They now outline the landing area and the deck edge properly at night.
- Night vision: the high, thin cirrus clouds no longer glow bright green overhead. They were not being darkened at night at all.
- Pitch black: the cockpit screens and other dim lights are no longer crushed to black, so your displays stay readable without night vision.

## v4.37.0 (2026-10-03)

### Air Combat: Carrier polish

- New carrier landing aid: with the gear down behind a friendly carrier, a copy of the deck's lens (the meatball) shows up next to your HUD. Keep the amber ball level with the green bars; it turns red when you are dangerously low. Under it a line-up marker shows where the centreline is, with a call (HIGH, LOW, COME LEFT, COME RIGHT or ON) and the range. If you forgot the hook it flashes HOOK UP. It works in the cockpit and from outside the jet.
- The catapults look the part now: the shuttle runs down the track with your jet, and on the Nimitz-class ships steam pours out of the catapult after every launch.
- Carrier auto-land from high above or close to the ship: it now runs out far enough behind the ship to get all the way down in one lap, instead of circling down a lap at a time. In testing it caught a wire on the first pass from every start we tried.
- Carrier auto-land is steadier lining up on the deck. It banks to correct while it is still well out, waves off sooner when it is badly off the centreline close in, and it never lets the jet sink toward the water while setting up: if it gets low it levels the wings and climbs first.
- The carriers' radars now sail with their ships, so your team's air picture comes from where the carrier really is.
- The map shows each carrier as a ship pointing the way it is sailing.
- Fixed: in replays the carriers stood still. They now sail their loops just like they did in the flight.
- Open Ocean is out of beta: the BETA TESTING tag on the menu and the warning at the start of a flight are gone.

## v4.36.1 (2026-10-03)

### Air Combat: Carrier auto-land fixes

- Carrier auto-land fixed: started from cruise height and speed it used to arrive far too high over the ship, then circle round and round without ever getting onto final. It now starts down early enough, keeps its cruise speed until it is close, and then sets up and comes straight down onto the deck.
- Auto-fly turns like a fighter now: up to 70 degrees of bank and about 4.5 G in cruise and around the carrier, instead of gentle 35 degree turns. Only the final approach to a deck or runway stays smooth.
- Auto-fly now tells you what it is doing around the carrier: swinging out behind the ship, turning in, final, the trap.

## v4.36.0 (2026-10-03)

### Air Combat: Carrier auto-land

- Auto-land on carriers. Open AUTO-FLY (U), pick a carrier as the destination with AUTO-LAND ticked and it does the whole thing: flies to the ship, sets up behind it, drops the gear and the hook, flies the ball down the glide path and catches a wire. It even works from the catapult: it launches, comes back round and traps on the same ship.
- It aims for where the deck will be when it gets there, not where it is now, because the ship keeps sailing its circle and the deck keeps pitching. In testing with every jet it caught a wire on the first pass almost every time. If something goes wrong close in (too low, too high or off the centreline) it waves off and comes round again, and a bolter makes it power up and go around.
- Fixed: a jet sitting on the moving deck slowly turned on its own, which could make it slide off the side after catching a wire.
- Fixed: the wire now holds the jet straight down the landing area while it stops it.
- Fixed: after catching a wire with the engines still spooled up, the jet could roll on toward the end of the deck.

## v4.35.0 (2026-10-03)

### Air Combat: Pitch black nights, night vision and a rolling sea

- New weather option: PITCH BLACK. Turn it on in the weather panel (top left) with any weather, on every map and in every mode. It is a moonless night: the sky, the sea and the land go completely dark, and all you can see are lights: runway and deck lights, afterburners, explosions and the glow of your own engine.
- Night-vision goggles: press 9, or the NIGHT VISION button in the weather panel. The picture turns dark green and grainy, and everything the starlight touches shows up again. In the cockpit you look through the round goggle tube; from outside the jet it fills the screen. They work in any weather and any mode.
- Open Ocean: the sea now moves. Long swells roll across the water with small whitecaps on the crests (only on this map; the others keep their calm water).
- Carrier landings: the HUD's landing needles and the steerpoints now follow the moving carriers, and the glide path matches the carrier's lens light. Auto-fly will take you to a carrier, but the landing is yours.
- Fixed: after catching a wire the jet could roll on and off the deck. The wire now holds you until you are back at idle, then the brakes hold you on the deck.
- Fixed: right after the catapult shot the jet sank toward the water. It now leaves the deck faster with the nose up and climbs away on its own.
- Rearming on a carrier now finishes with the deck crew putting you on a free catapult, ready to launch again.
- Fixed: the white wake behind the ships looked jagged and stepped from low angles.
- While you are on the catapult, the screen now tells you what to do (full throttle, the salute, the shot) instead of showing the runway take-off tip. The controls list (F9) shows H for the hook and 9 for night vision.

## v4.34.0 (2026-10-03)

### Air Combat: Open Ocean and aircraft carriers (BETA TESTING)

- BETA TESTING: the Open Ocean map and the aircraft carriers are brand new and still being tested, so you will find bugs. The next update fixes them, and also brings the rolling sea, PITCH BLACK nights and night-vision goggles.
- New theater: OPEN OCEAN, 80 × 80 NM of nothing but water. Pick it under THEATER on the main menu.
- Eight aircraft carriers. Four BLUE (USS Gerald R. Ford, Nimitz, Theodore Roosevelt and Abraham Lincoln) in the south-west, four RED in the north-east. Each one sails its own small loop at 30 knots, all the time, and the RED ships never come within 50 NM of the BLUE ones. The decks pitch, heave and roll with the swell.
- Catapult launch: start ON THE CATAPULT and your jet is hooked to the catapult with the blast deflector raised behind you. Go to full throttle, hold it for the salute, and the catapult throws you off the bow at flying speed.
- Landing on the wire: gear down, then press H in the air to lower the tailhook. Fly the glide path with the lens on the left of the landing area: the amber ball level with the green bars means you are on it, a red ball means you are too low. Catch a wire and you get which wire it was and a grade. Miss them all and it's a bolter: full power and go around.
- Rearm mid-mission: stop on a BLUE carrier with the throttle at idle and press H. The deck crew rearms, refuels and repairs you in 15 seconds, the same as at an airbase.
- The RED carriers have four 30 mm close-in guns each. Guns only, no missiles. They shoot at you in every mode, Free Flight included, and you can shoot the guns out.
- On the ocean you can fly Free Flight, Wave Combat, 1v1 Duel, 5v5 Team Battle and Free-for-all. Daily Mission, Blackbird, Airstrike and Flight School need land, so switch theater for those.

## v4.33.0 (2026-10-02)

### Air Combat: Multiplayer in the Claude page

- Multiplayer now works right here in the Claude page you play in. Artifact pages cannot reach outside servers, which is why the official servers always showed OFFLINE in it. Now the page has its own rooms: ROOM 1 and 2 on the Jade Archipelago, ROOM 3 on Triad Isles, ROOM 4 and 5 on Frostfall Strait.
- The rooms list shows how many pilots are in each room and whether a match is waiting, starting or on. Join one and it plays exactly like before: LAST PILOT STANDING, the shrinking zone, kills rearm you, last jet flying wins.
- No server needed: one pilot's game quietly runs each room's matches, and if that pilot leaves, someone else's game takes over and the match carries on.
- To play together, everyone opens the same link and is signed in to Claude. Friends must be invited to the page (the owner shares it with them from the Share menu); someone who opens it from a public link cannot join a room.
- The official servers still work for anyone playing on the website.

## v4.32.3 (2026-10-02)

### Air Combat: Official servers wake up faster

- Multiplayer: the official servers go to sleep when nobody has played for a while and take up to a minute to start again. The game now wakes them as soon as it loads, and while they start, the server list says "WAKING UP…" instead of "OFFLINE" and keeps trying until they answer.

## v4.32.2 (2026-10-02)

### Air Combat: Arrows that show the way

- New: a big cyan arrow on screen always points to where you need to go next, with the place's name, how far it is, and which way to turn ("TURN RIGHT 95°"). When the place comes into view, the arrow turns into a marker sitting right on it. It works in BLACKBIRD and in any mission with a steerpoint.
- BLACKBIRD: the step line at the top and the arrow now always point at the same radio station (the nearest one).
- Fixed: online, a MiG-31 showed up as an F-15EX to the other pilots.

## v4.32.1 (2026-10-02)

### Air Combat: Simpler BLACKBIRD missions

- BLACKBIRD missions are much easier to follow. Every mission is now the same four simple steps: record the enemy radio, fly over each site, pick the one that matches, fly home. The green steerpoint always points to the next thing to do.
- The top of the screen now says exactly what to do next in plain words (for example "STEP 2: FLY OVER SITE B (34 NM) TO SCAN IT"), and a new order pops up each time you finish a step.
- Scanning is simple: fly over a site and it scans itself in a second or two. No more separate camera, IR and side-radar rules, altitude limits or sites hidden under cloud.
- The radio is always on: just fly within the range shown and it records in about 20 seconds.
- Clues are said plainly ("THE REAL SITE HAS FUEL + RADIO MAST") instead of as riddles.
- The decision list shows a ✓ or ✗ for each clue at each site and marks the one that has everything.
- The friendly strike arrives in a couple of minutes instead of flying across the whole map, and the overheating tape recorder problem was removed. The stories, sites, answers and other in-flight trouble are still different every mission.

## v4.32.0 (2026-10-02)

### Air Combat: SR-71 Blackbird + BLACKBIRD spy missions

- New jet: the Lockheed SR-71A Blackbird. 32.7 m long, two Pratt & Whitney J58s that work more and more like ramjets the faster you go, Mach 3.5 at 75,000-80,000 ft, and it holds 85,000 ft. It is slow to get going: a long take-off roll, and minutes to get through Mach 1 and climb to cruise. Chined black fuselage, inlet spikes, canted fins, red walkway lines and U.S. AIR FORCE on top, tail 17972.
- The SR-71 is still in testing, so it flies only in the new BLACKBIRD mode and in Free Flight. It carries no weapons, no flares and no pods: the weapon bar is gone when you fly it, and the stores panel lists its sensors instead.
- New mode, BLACKBIRD: spy missions for the SR-71. Every sortie writes a new story (a missing missile brigade, a defector, a radar nobody can explain, a secret airbase build-up, a captured agent, a convoy) with new sites, new names, new clues, a new right answer and new trouble on the way.
- How it plays: record enemy radio nets from high up to learn what the real site looks like, then photograph the candidate sites (wings level, right over them), sweep them with the side-looking ASARS radar off your wingtip, or drop below 25,000 ft for IR film. Only one site is real; each decoy shows at most one of the clues. Clouds blind the cameras but not the radar.
- Stay unseen: a DETECTION meter fills when radars and troops see you. Above 70,000 ft and past Mach 2.8 you are almost invisible; slow, mid-altitude or a sonic boom over a base gives you away. Get tracked and the SA-2 sites wake up and MiG-31s scramble; get compromised and the target starts to move, so you must decide sooner.
- Problems mid-flight: an inlet unstart that slams the nose sideways, a fuel leak, the tape recorder overheating (slow down or lose the intercept), a pop-up SA-2 site, or a priority re-tasking from home with a deadline.
- Then make the call: an intel assessment lists what each site showed and you pick one. Friendly fighters fly in and strike it (stay close so they get your live pictures, then photograph the damage), or a raid team goes in while you hold overwatch. Fly home for a graded debrief (S to D) with the real answer revealed, then NEW MISSION for a different one.
- Briefings can now offer choices, used by the BLACKBIRD assessment.
- Missions that start in the air keep the throttle where the mode set it (the Blackbird starts in full burner at cruise).

## v4.31.1 (2026-10-01)

### Air Combat: Louder heartbeat

- The blackout heartbeat is a little louder (about 30 %).

## v4.31.0 (2026-10-01)

### Air Combat: 10 bug fixes

- Fixed: blacked out (G-LOC), you could still fire missiles, drop flares, move the throttle, lock targets, work the gear and eject. Now all controls are frozen until you come round, as intended. The camera, pause and map still work, and the aim point follows the jet so waking up does not yank it round.
- Fixed: crashing while blacked out left the screen black with "G-LOC" on it for the rest of the 10 seconds, hiding the crash and the death camera. It now clears as soon as the jet hits the ground.
- Fixed: burning wreckage thrown out by a crash or kill could fly through hillsides or sink below the sea. It now lands on the ground or stops at the water surface.
- Fixed: the delayed fuel-cell blasts and the smoke cloud of a mid-air kill could appear in the wrong place, because they followed the wreck as it moved on.
- Performance: kills more than about 25 km away now get a lighter effect (just the fireball and smoke). The full show near far-off kills was crowding out the smoke and fire close to you, which could make it flicker or vanish.
- Performance: at most 40 ground fires burn at once (wrecks, fuel trails, targets), so a long furball no longer piles up hundreds of them. Fires more than 3 km away also draw fewer flames, while keeping their smoke column.
- Performance: the hangar no longer keeps rendering behind the loading screen, so missions and the first map build load faster.
- Performance: the HUD no longer restyles itself every frame during grey-out and blur.
- Fixed: the theater map (M) used a 50 NM grid running from -200 to +200 on every map. On the Jade Archipelago that gave one line through the middle and stray labels off the map. The grid now matches the map (10 NM on Jade, 25 NM on Triad, 50 NM on Frostfall) and stays inside it.
- Fixed: the HUD minimap always covered 60 NM, wider than the whole Jade Archipelago, so everything was squeezed into the middle. On Jade it now covers 32 NM; the bigger maps are unchanged.

## v4.30.5 (2026-10-01)

### Air Combat: Raptor tidy-up

- F-22: removed the small circle that showed on top of the right intake when viewed from the front. It was the gun muzzle marker, which no longer sat flush after the intake was reshaped. The real jet's gun hides behind a flush door, so nothing shows now. The gun still fires from the same place.

## v4.30.4 (2026-10-01)

### Air Combat: Raptor intake blend

- F-22: the back of each intake now joins the fuselage smoothly. The intake's top, outer wall and belly blend into the body's own shape where they meet, so there is no step or box-shaped end at the join any more. The intake mouths are unchanged.

## v4.30.3 (2026-10-01)

### Air Combat: Camera fix

- Camera fixed: the free-look directions are back to normal (the last update had both up/down and left/right reversed). It moves exactly as it always did, and now also reaches the underside on every heading: hold the right (or middle) mouse button and drag up to swing the camera down under the jet.

## v4.30.2 (2026-10-01)

### Air Combat: Raptor underside, look underneath

- F-22 underside reshaped to match its intakes: behind the intakes the body now carries on the same shape, a flat belly out to a sharp edge and then a straight wall leaning out to the chine, so the intakes run straight into the fuselage with no step. The intakes themselves are unchanged. The side weapons bays now sit in that lower wall, just behind the intakes.
- Free-look now reaches under the jet: in the default mouse-aim camera, holding the right (or middle) mouse button and dragging down swings the camera below the jet to look at its underside, on any heading. Before, it could not get below the horizon when flying east or west.

## v4.30.1 (2026-10-01)

### Air Combat: Bug fixes

- Fixed: in 10 Waves on the Jade Archipelago, enemy flights could spawn beyond the edge of the map (their start distances were set for the much bigger theaters). They now start at distances scaled to the map, and always inside it.
- Fixed: Airstrike on the Jade Archipelago used start and target distances meant for the big theaters, so an airborne start was pushed against the map edge. Those distances now scale with the map size too. The bigger maps are unchanged.

## v4.30.0 (2026-10-01)

### Air Combat: Going down in flames

- Jets now die spectacularly. Blown apart in the air: a white-hot flash, a huge fireball carried on along the jet's flight path, the fuel cells and stores going up one after another a split second apart, a shock shell racing out, a shower of sparks, and a spray of burning fragments arcing away on smoke trails, leaving a drifting black pall behind.
- Into the ground: a blinding flash and a shock ring racing across the ground, a fireball thrown forward along the impact path that boils up into a rising column of fire and a mushroom of black smoke, dirt and rock blasted out and falling back, a dust skirt rolling outward, burning wreckage tumbling on ahead, and fuel left burning in a long smear along the impact path.
- Into the sea: a towering white plume and curtain of spray, a ring of churned water, a fireball flashing off the surface, burning fuel on the water and steam hanging over the spot.
- All built on the existing smoke and fire effects, so big furballs stay smooth.

## v4.29.3 (2026-10-01)

### Air Combat: Louder heartbeat

- The blackout heartbeat is 70 % louder.

## v4.29.2 (2026-10-01)

### Air Combat: Blackout sound fixes

- The heartbeat during a blackout is now a soft, low thump at a reasonable volume instead of a loud bang.
- Coming round from a blackout, the jet now eases back up to exactly the volume it had before, instead of slamming back in at full volume.
- At 9.0 G and above your whole view is now fully blurred.

## v4.29.1 (2026-10-01)

### Air Combat: Hear the heartbeat

- While you are blacked out the jet's sound drops by 90 % so you can hear your heartbeat. When you come round the jet goes straight back to your own volume setting.

## v4.29.0 (2026-10-01)

### Air Combat: Lights out

- New full blackout (G-LOC): the colour drains, your view swims and closes down to a shrinking pinhole, then goes black. In the dark you hear and see only your heart, beating at 55 bpm, with a deep red throb at the edges of the screen. When you come round the black lifts first, then the view opens out of a blur and the colour comes back last.
- The heartbeat only happens when you fully black out.
- With the G limiter on you cannot black out: the grey-out stays as before, and on a hard, sustained pull your vision now goes blurry every few seconds.

## v4.28.0 (2026-10-01)

### Air Combat: Faster menu, F-22 intakes

- Faster start: the game now opens straight to the menu. The map (terrain, digital map, ocean, trees) is no longer generated at start-up or kept in the background while you are in the menu; it is built when you press launch, and only the first time.
- F-22 intakes fixed: the fuselage side no longer shows through the inside of the intake mouths. The ducts are now dark inside and bend away out of sight like the real ones.
- MiG-31 exhaust nozzles are shorter and a little wider. Its flight performance is unchanged.

## v4.27.0 (2026-10-01)

### Air Combat: Foxhound nose and Raptor gold

- MiG-31 front end rebuilt so it no longer looks like an F-15: a longer, pointed radome, slab-sided nose with a sharp chine along the belly, low squared-off canopies with a framed windscreen, a mostly metal rear hood with small side windows that runs into a raised spine, and steeply raked intake mouths with the top lip well forward.
- F-22 canopy is now the real thing's reflective gold: from outside it reads as a gold mirror and you barely see the pilot. The view from the cockpit is unchanged.

## v4.26.1 (2026-10-01)

### Air Combat: Clean drop tanks

- External fuel tanks no longer have tail fins: every jet now carries a plain, smooth drop tank.

## v4.26.0 (2026-10-01)

### Air Combat: Jade Archipelago

- New map: Jade Archipelago, 80 x 80 nautical miles of wild tropical islands. It is now the default map.
- 20 islands and no two alike: the 3,150 m Mauna Jade stratovolcano in the middle, a broad shield volcano, a highland plateau, limestone karst towers, two coral atolls with lagoons, a flooded caldera, a crescent bay, a long ridge, a red-rock mesa, a cinder cone, sea needles, rolling hills, a twin-peaked island and small sandy cays.
- The trees change with the land: coconut palms along the beaches and on the cays, giant rainforest trees on the lowland slopes, and conifers higher up. The tallest summits rise above the tree line to bare rock.
- Beaches of white coral sand, with black sand on the volcanic islands, reefs and bright turquoise shallows that fade into deep blue water.
- Two runways: TAMARU AB (your base, in the southwest) and KAHIKI AB (the enemy base, in the northeast). Mauna Jade sits between them as the contested island.
- The water is still: it gets its depth and colour from the sea floor, with no wave animation, so frame rates stay high.
- The older maps are still in the map list.

## v4.25.0 (2026-09-30)

### Air Combat: MiG-31 Foxhound

- New jet: the Mikoyan MiG-31BM Foxhound, the fastest jet in the game. A two-seat interceptor that reaches Mach 2.83 up high (Mach 1.23 on the deck), 67,600 ft, with two D-30F6 afterburning turbofans. It is heavy and limited to 5 G: it cannot turn with the fighters, so it wins by speed and range.
- New missile: the R-37M, the longest-range missile in the game. Four ride half-sunk under the MiG-31's belly; they climb high and dive in at up to Mach 6, reaching 100 NM and more when fired high and fast, but a fighter that turns hard at the end can still beat one. The MiG-31 also carries R-74M heat-seekers on its wing pylons and a GSh-6-23M six-barrel 23 mm cannon under the right intake.
- The MiG-31's model follows the real jet: long dark radome, tandem two-seat cockpit, huge box intakes with splitter plates, twin fins canted outward with dark tips, ventral fins, all-moving tailplanes, heat-tinted titanium nozzles, the retractable IRST under the nose, and Russian Aerospace Forces markings. Four loadouts: interceptor, long reach, far patrol with tanks, and strike.
- Zaslon-M passive phased-array radar (tracks 24 targets), 8TK infrared search-and-track, its own cockpit with three colour displays, its own engine sound, and it appears as an enemy and wingman in every mode.

## v4.24.1 (2026-09-30)

### Air Combat: Amber menu

- The main menu is back to its full layout: the navigation rail, game modes and mission setup, the hangar with aircraft and loadouts, the theater page, the pilot card, the jet library, the paint shop and multiplayer. It has a new colour scheme: warm amber on dark charcoal instead of cyan on blue.

## v4.24.0 (2026-09-30)

### Air Combat: New menu, guns fixed

- New main menu: the jet fills the screen and everything you choose sits in one floating bar at the bottom: mode, aircraft, map, weather, time and start (runway or in the air, for the modes that have one). Click a choice, or its arrows, and it glides to the next option. Launch sits at the end of the bar; settings, controls, the logbook and what's new are top right. Online play is now a mode in the bar.
- The menu's weather choice sets the weather for your next flight, and the in-flight weather panel follows it.
- Guns fire from the right place on every jet: the tracers used to trail about 45 m behind each round from the moment it left the gun, so the fire looked like it came from behind the jet. Each tracer's tail now starts at the muzzle.
- Gun ports moved to where they are on the real jets: F-15EX, M61A2 in the right wing root beside the intake; F/A-18E/F, M61A2 on top of the nose ahead of the windscreen; Typhoon, BK-27 in the right wing root; Su-35S, GSh-30-1 in the right wing-root extension beside the cockpit; Rafale, 30M791 in the right side of the fuselage at the wing root; F-22A, M61A2 on top of the right wing root above the intake. The Typhoon, Rafale and F-22 models now show their gun muzzle too.

## v4.23.0 (2026-09-30)

### Air Combat: F-22 weapons bays

- F-22 weapons bays: every weapon except the gun now leaves only once its bay doors are fully open. Press fire and the doors open first; the missile or bomb goes the moment they are fully open, about half a second later for the main bay and a little longer for the side bays. The doors close again a couple of seconds after the last shot. AI Raptors follow the same rule.
- The F-22 now has real, moving bay doors. The two big main-bay doors hinge at their outer edges and swing down to hang straight below the jet, opening onto the dark bay interior with its launch rails. The side-bay doors in the walls beside the intakes swing outward.
- You can see what is in the bays: as the doors open, the AIM-120s or GBU-39s are lowered on their launchers under the belly, and each AIM-9X swings out on its rail beside the intake. Weapons now launch from those lowered positions instead of from inside the fuselage.

## v4.22.1 (2026-09-30)

### Air Combat: Low frame rate help

- New: if your browser is drawing the game on the processor instead of your graphics card (hardware acceleration switched off, or the graphics driver blocked), the game now says so as soon as it starts and tells you how to fix it. In that state it runs at only a few frames per second however fast the PC is.
- New: if flying stays below 20 fps for several seconds, the game shows once which graphics chip it is actually running on and at what resolution, so you can tell straight away if the browser picked the processor's built-in graphics instead of the graphics card, and what to change.
- Faster in and near clouds: cloud puffs around the camera that have faded to nothing are no longer drawn at all. Before, dozens of invisible full-screen layers were still shaded on every frame when flying through cloud, and puffs close to the camera now fade out slightly sooner.

## v4.22.0 (2026-09-30)

### Air Combat: Realistic jets, faster menu

- Jets look far more real: every airframe now picks up the light bouncing off the ground and sea below it, so bellies, intakes and the undersides of the wings are softly lit instead of near-black, the way real aircraft look in daylight.
- New paint finish on all six jets: the paint is now a flat, non-metallic military coating instead of a semi-metallic plastic sheen, with panel-to-panel colour and gloss variation, streaks swept back by the airflow, exhaust soot toward the tail and worn, polished leading edges.
- Much faster menu: switching jets in the hangar used to freeze everything for one to three seconds while the new jet's shaders were rebuilt from scratch. Shaders are now kept between jets, new ones are compiled in the background while the current jet stays on screen, and every jet you have looked at stays ready, so flicking back and forth is instant on High and Ultra.
- The menu hangar now runs at your screen's full refresh rate. It was capped at 60 fps, which judders on 120 and 144 Hz monitors and could drop to 30 fps with normal frame timing jitter on 60 Hz ones.
- Jet Library pictures are saved between visits, so the library and the jet cards open immediately instead of rebuilding a portrait of every jet each time the game starts.
- Fewer draw calls for every jet: the parts of each airframe that never move relative to one another (including the pilots, gear legs and control surfaces, each in their own group) are joined into one mesh per material, and all pylons are now a single mesh. The chase view went from 231 draw calls to about 180, and the menu hangar from 229 to about 165.
- Missions compile all their shaders during the loading screen, so there is no stutter the first time a jet, missile or effect comes into view.
- The G-effects screen pass (grey-out, tunnel vision, red-out) is skipped entirely when none of them is active, saving a full-screen pass every frame.
- Shader compile logs are no longer read back in the released game, which forced the graphics driver to finish every shader immediately and caused long stalls the first time something new appeared.

## v4.21.2 (2026-09-30)

### Air Combat: Auto-land fixed

- Auto-land fixed: it now lands first time instead of going around. The cause: with the gear down and slow, the jets' flight controls switch to their landing law (the stick commands pitch rate, and angle of attack is capped at 16 degrees), but the autopilot was steering as if the stick still commanded G. Its corrections were far too weak, so it drifted off the glideslope, dived to catch it and floated in the flare. It now flies the approach and flare through the landing law directly.
- Auto-land approach speed now comes from the jet's real weight: it adds speed until the jet flies the approach at 10.5 degrees angle of attack, so a jet heavy with bombs comes in faster with plenty of margin. Speed alone no longer triggers a go-around; it throttles back and opens the speedbrake instead.
- Auto-land intercepts the runway centreline properly: from any direction it turns onto the extended centreline at up to 45 degrees and rolls out on it, instead of chasing a single point 12 NM out (which could leave it circling that point for ever). Too close in, it flies out and turns back in. Go-arounds are kept for real problems only, and a go-around that touches the runway simply rolls on and lifts off again. Tested from 8 directions on both maps with all six jets: every flight landed on the centreline and stopped, with no go-arounds.
- Fixed: the radar warning receiver showed SAM and AAA sites as Su-35s; they now show as their SAM number (15, 11, 13) or A for guns.
- Fixed: the kill feed and the logbook said a SAM or AAA site that shot you down was an "Su-35S"; they now name the system (for example SA-15 GAUNTLET).
- Fixed: in an airstrike, alert fighters scrambled from both ends of the runway at once, straight at each other; they now line up one behind the other.
- Fixed: bombs still falling when you started a new airstrike stayed hanging in the sky.
- Fixed: an ammunition bunker's secondary explosions carried on while the game was paused, and could go off after the mission had ended.

## v4.21.1 (2026-09-30)

### Air Combat: Smooth autopilot power

- Auto-Fly no longer pumps the throttle. It used to chop the power whenever it reached the chosen height and slam it back on for a couple of seconds when it drifted high or low. Now a smooth speed controller finds the steady power setting for the speed and height and only nudges the throttle around it, so the engines stay spooled up the whole way (never near idle in cruise). Height changes are flown as gentle, steady climbs and descents with a small dead band, instead of chasing every metre.
- New AFTERBURNER option in the Auto-Fly panel: OFF (military power only, saves fuel), AUTO (lights the burner only when the chosen speed needs it, then keeps it lit steadily instead of flicking it on and off) or MAX (burner lit the whole way: fastest takeoff, climb and cruise). The HUD shows AB MAX / NO AB in the Auto-Fly status.
- Auto-land: a proper flare (the jet raises its nose to cut the sink rate before the wheels touch), the power comes back smoothly through the flare, a touch of wing-low against crosswind drift, and a real go-around: if it floats, balloons or would land too far down the runway it climbs out straight ahead wings level, flies round at circuit height and lands on the next try. Tested on all six jets in all three afterburner modes.

## v4.21.0 (2026-09-29)

### Air Combat: Airstrike

- New game mode: AIRSTRIKE. Fly a strike loadout against a defended ground target and bring the jet home. Every sortie is different: a new target in a new place each time (an ammunition depot, a command post, a SAM site, an army camp, an early-warning radar station on a hilltop, or an enemy airbase with jets parked on the apron), a new layout and mix of targets, new defences, new enemy fighters and a new start: on a random friendly runway, or already airborne 60 to 110 NM out.
- Guided bombs for every jet, each its real weapon: GBU-31 2,000 lb JDAM (F-15EX), GBU-32 JDAM (F/A-18E/F), GBU-39 Small Diameter Bombs in the F-22's weapons bay, Paveway IV (Eurofighter), AASM Hammer with its rocket booster (Rafale) and KAB-500S (Su-35S). They fall and glide with real physics: released high and fast they reach 10 to 40 NM, released low and slow only a few. New strike loadouts in every jet's list; key [4] selects bombs.
- Bombing computer and release countdown: it boxes a target (key [R] picks another) and, just below the middle of the screen in small see-through text, counts down to the release point: RELEASE IN 12 S with a thin progress bar, then RELEASE when you are in range, then IMPACT 18 S while the bombs fall. Several bombs released in one pass each go to a different target.
- Air defences that shoot back: ZSU-23-4 Shilka and 2S6 Tunguska radar-directed guns, SA-13 heat-seeking SAMs, and SA-15 and SA-11 radar SAMs that show on your RWR, lock and fire. Knock out a battery's fire-control radar and its launchers go blind. More defences and better crews the higher the difficulty. Enemy fighters may be on patrol over the target or scramble from the nearest enemy airbase once you are spotted.
- Ground targets built to their real sizes next to the jets (an F-15EX is 19 m long; an ammunition bunker 26 m, a Shilka 6.5 m, a hardened shelter 36 m): earth-covered ammunition bunkers, fuel tanks, command bunkers, headquarters, barracks, radars, SAM launchers, tanks, trucks and tents. Buildings collapse into burning rubble, fuel tanks go up in a fireball, ammunition cooks off, bombs leave craters. The gun works on vehicles too.
- The autopilot can now fly the whole trip. On the runway it takes off by itself: brakes off, afterburner when the jet is heavy, rotate, gear up. It flies a dead-straight track to the destination (correcting any drift back onto the line), climbs over high ground, plans its descent, then flies the approach: it picks the runway end into the wind, turns onto the localizer, rides the 3 degree glideslope at the right approach speed for the jet's weight, flares, touches down, brakes on the centreline and stops. If an approach goes wrong it goes around and tries again.
- Auto-Fly speed is now a slider from 200 kt up to the jet's own top speed (Mach 2.5, about 1,430 kt, for the F-15EX), no longer capped at 650 kt, and altitude is a slider up to the jet's ceiling. Tick AUTO-LAND to land at a destination airfield.
- More realistic airbases, in true proportion to the jets: hardened shelters rebuilt to real third-generation dimensions with earth berms, sliding blast doors and exhaust deflectors; hangar doors; an operations building at the tower; a bunded fuel farm; 25 m apron floodlight masts; fuel bowsers and tugs; a perimeter fence and a windsock.

## v4.20.0 (2026-09-29)

### Air Combat: Live engine nozzles

- Live engine nozzles on every jet. The nozzle petals now move with the engine just like a real one. At idle, and on a jet with its engines stopped, the nozzle hangs wide open. Push the throttle up and it closes down tight as the engine spools to military power. Light the afterburner and it swings open with the burner stage, opening slightly before the flame lights and reaching fully open at max burner. Pull the throttle back and it closes again. Hydraulic actuators drive the petals, so the nozzle follows the engine with a real lag (about a second end to end), and in afterburner it hunts very slightly around its setting.
- Every jet has it: the round convergent-divergent nozzles on the F-15EX, F/A-18E/F, Eurofighter, Rafale and Su-35S (on the Su-35S, while they vector), and the F-22's flat nozzle, whose upper and lower flaps swing apart and together.
- The exhaust flame is now as wide as the nozzle: narrower at military power, wider at full afterburner.
- Fixed: the glowing burner inside each nozzle was lit to the wrong depth on every jet. The glow now reaches back to the flame holders as intended, most visibly on the Su-35S and F-22.

## v4.19.0 (2026-09-29)

### Air Combat: New cockpit view

- A completely new cockpit view. The camera is no longer bolted to the airframe: your head now sits on a sprung neck that reacts to what your body feels. G pushes you down into the seat and the view settles with a small overshoot. Lateral G sways you, the afterburner presses you back, and a snap roll leaves your head behind for a moment. Hands off the look controls, your head keeps the horizon a little more level than the jet, glances up into a hard turn and leads a roll with the eyes, the way real pilots do.
- The cockpit shakes like a real one: a faint engine hum, afterburner rumble, runway bumps on the takeoff roll, a deep buffet near the stall and around the speed of sound, and a hard judder when the gun fires. Each has its own feel, and a new HEAD MOVEMENT slider in Settings turns it down or off.
- Realistic canopy glass: fine scratches, wipe marks and dust that only light up when you look toward the sun, just like real acrylic. Looking into the sun gives a starburst glare that the canopy frame and the jet's own structure can block. At dusk and at night, cockpit floodlights warm the panel, and the sun's shadows in the cockpit are twice as sharp on high and ultra graphics.
- Realistic interiors: every cockpit is repainted in its real colour, the grey of US and European jets and the turquoise of the Su-35S. The HUD glass is clear with just a faint green tint.
- A clean view: in the cockpit the side info panels (radar scope, RWR, weapons and fuel boxes) now hide, so you fly on the jet's own HUD and displays. Turn them back on with INFO PANELS IN COCKPIT in Settings.
- Today's daily mission, BORDER WATCH: Poland and Romania scrambled fighters this week as Russia launched 161 drones, 82 of them jet-powered, and cruise missiles at Ukraine, and two Romanian F-16s tracked a target near the border at Valkove. You are CARPAT 1. Four fast, radar-silent jet drones cross the border heading for your home field. Take off, find them and shoot every one down before any gets within 15 NM of home, then fly the jet home.
- Performance: distant jets now draw as a single mesh instead of 30 to 40 pieces. That cuts the frame's draw calls by more than half in big battles (518 to 233 in a 12-jet free-for-all, 430 to 144 in the cockpit) with no visible difference.
- Performance: the HUD scopes no longer measure the page layout every frame, and the scopes you can't see are skipped altogether.
- Performance: the gun lead marker's terrain check is cached per target instead of run every frame.
- Fixed: the spotting markers' line-of-sight memory grew for the whole session; it is now cleared as it fills.
- Fixed: finishing the drone mission said "bandits" instead of "drones".

## v4.18.1 (2026-09-28)

### Air Combat: Windows app

- TRIAD for Windows: a desktop app (TRIAD-Air-Combat.exe) you can download and share, published on the project's GitHub Releases page. It is a single portable .exe: no installer, just double-click. It plays the latest version of the game and keeps itself up to date, and without internet it plays the copy built into the app. F11 toggles full screen.
- Automatic updates while you play, on the website and in the desktop app: the game checks for a new version every minute. In the menu it reloads to the new version straight away; in the middle of a flight it tells you an update is ready and installs it when you are back in the menu.

## v4.18.0 (2026-09-28)

### Air Combat: New menu

- A completely new main menu, the "command deck". A navigation rail on the left has three sections, PLAY (game modes and mission setup), HANGAR (aircraft with studio portraits, loadouts and performance bars) and THEATER (map and time of day), plus the Jet Library, the Paint Shop, Multiplayer, the Logbook, Settings, Controls and the release notes. Floating glass panels sit around the 3D jet, a pilot card top right shows your rank, sorties, kills, hours and medals from the logbook, and the launch bar bottom right is always there with your mode, jet, loadout, theater and time of day. New look throughout: dark navy glass with an electric-cyan accent, big numbered sections and time-of-day swatches.
- Hangar: the long tan bar across the floor is really gone this time. It was the runway and taxiway lines from the new outdoor airfield: a bug turned those kilometre-long painted lines on their edge, and they ran straight through the hangar under the jet. They now lie flat on the runway where they belong.
- Jet portraits are rendered once and shared between the menu and the Jet Library.

## v4.17.2 (2026-09-28)

### Air Combat: Hangar floor fix

- Hangar: fixed the long tan band across the floor, and the whitish haze when looking toward the doors. Both came from the sunbeam effect for the big door opening, a flat sheet of glow that sloped down through the whole bay and read as a stripe on the floor from low angles. That sheet is gone, and the window sunbeams now fade out well above the floor.

## v4.17.1 (2026-09-28)

### Air Combat: Smooth takeoffs

- Smooth, realistic takeoffs. While the gear is down, the flight controls now use a takeoff and landing mode, like the real jets: the stick commands a gentle pitch rate, the jet holds its attitude when you let go, a soft AoA limit protects it, and the climb-out attitude tops out around 20 degrees. Lifting off with the stick still held back no longer snaps the nose 80 degrees up with an AoA warning. The nose also comes up smoothly on the runway and the rotation carries into the air without a jump. Raise the gear (or pass about 300 knots) and the normal fighter controls come back, with G building gently for the first few seconds.
- Hangar: fixed the long bar-shaped streak across the floor seen from one side of the jet. The sun was so low that shadows stretched into long bands; it now sits a little higher (still golden orange) with cleaner shadow edges.
- Performance: the hangar's shadows are drawn once instead of every frame (they are redrawn only when you change jet or loadout), the menu runs at 60 fps at most instead of flat out on high-refresh screens, one light was removed, the automatic resolution now also works in the menu, and on MEDIUM graphics the jets parked outside use the light model.

## v4.17.0 (2026-09-28)

### Air Combat: Golden-hour hangar

- The hangar is now at golden hour. A low orange sun shines straight in through the open doors and the side windows: long warm light across the floor, the jet lit from the front with long shadows behind it, visible light shafts with dust drifting in them, and the cool white hangar lights contrasting with the warm sun. Reflections on the jet now show the sunset sky.
- A completely new view outside, built in full 3D. There is a physically based sunset sky with drifting clouds, deep blue overhead and orange glare toward the sun, and real mountain ranges on every side, snow-capped in the distance, that fade into a warm haze toward the sun and a cool blue-grey haze everywhere else. The airfield has a concrete apron with slab joints, stains, tyre marks and painted parking stands with two jets parked on them, a taxiway and a runway with their markings, blue and white edge lights and signs, floodlight masts, a neighbouring hangar with its doors part open, hardened aircraft shelters, the control tower and operations block with lit windows, a turning radar, a fire station, fuel tanks, a windsock, a fuel truck, a tug, a follow-me truck and tree lines all around.
- Much more inside the hangar: a spare engine on its transport trailer, a big flag hanging from the roof, an air-conditioning cart with its duct running up into the jet, a tow bar at the nose wheel, a nitrogen bottle cart, a hydraulic test stand, LED floodlights on tripods, drum fans, oil drums on a spill pallet, FOD cans, a tyre rack, a scissor lift, a forklift, rolling tool carts, wall screens with the flying schedule and a clock, a vending machine and coffee counter, parts shelving, an eyewash station, air hoses and a bicycle by the door.
- Fixed: the gun lead marker could show through a mountain. It now only appears when you can actually see the target.
- Fixed: on laptops, choosing HIGH graphics could reset to the automatically chosen preset every time the game was reloaded. Your choice now sticks.

## v4.16.0 (2026-09-28)

### Air Combat: Jet Library

- New section of the menu: the JET LIBRARY (orange JET LIBRARY button at the top of the menu, or BROWSE THE JET LIBRARY above the aircraft list). It has its own full-screen look: a shelf of studio portraits of every jet along the bottom (rendered from the real 3D models in your own paint), the focused jet big in the hangar behind, and a dossier on the right.
- Filter the shelf by region (USA, Europe, Russia), generation, thrust vectoring, IRST, carrier-capable or two-seat, and sort it by name, top speed, thrust-to-weight, range, roll rate, missile count or newest. Arrow keys step through the jets; Esc goes back.
- The dossier has five tabs. OVERVIEW: the real aircraft's history, maker, first flight, service entry, number built and operators, its strengths and weaknesses in the game, how to fly it, and your own record in it from the logbook. PERFORMANCE: bars ranking it against the whole library (top speed, thrust-to-weight, wing loading, roll and pitch rate, G, ceiling, range). WEAPONS: its missiles, gun and countermeasures, and every loadout (click one to see it on the jet). SENSORS: radar, IRST and EW. COMPARE: head-to-head against any other jet, line by line with the difference in percent.
- SELECT puts the jet and the loadout you picked into the main menu, ready to fly; CUSTOMIZE goes straight to its paint shop.

## v4.15.0 (2026-09-28)

### Air Combat: Daily Mission

- New game mode: DAILY MISSION (top of the mode list). Every day there is a new mission built from real aviation news. Pick it, press FLY, and a briefing box in the middle of the screen tells you the real story and exactly what to do; the mission starts when you press OKAY (or Enter). You scramble from your home base, fly to where the story put the bandits (steerpoint 1 on your nav, marked on the map), and they wait there circling, radar silent, until you come within 20 NM or shoot at them. Then it is a fight. Shoot them all down and fly back within 10 NM of a friendly field to complete it. The menu shows a tick once you have finished today's mission.
- Today's mission, NORDIC SCRAMBLE: on 24 September Finnish F/A-18 Hornets and Swedish JAS 39 Gripens scrambled together for the first time to intercept a Russian formation (a transport with MiG-31 and Su-30 escorts) over the Gulf of Finland. You fly that scramble against three Flankers circling over the strait; in this version the escort does not back off. It is set best on Frostfall Strait (the menu offers to switch), but works on either map with any jet.

## v4.14.0 (2026-09-28)

### Air Combat: Laptop performance

- Runs much better on laptops and other lower-end computers. On first start the game now checks the graphics chip and picks a preset it can run: older Intel HD / UHD graphics start on LOW, Iris Xe, Radeon 680M/780M, entry GeForce and base Apple M-chips on MEDIUM, and gaming graphics cards stay on HIGH. Players still on the untouched HIGH default get the same one-time check. You can change it any time in Settings.
- New AUTO RESOLUTION setting (on by default, under Display). When the frame rate dips below about 48 fps in a fight, the render resolution steps down a little (to 60% at most) and climbs back once there is headroom again, so the game stays smooth instead of stuttering.
- Lighter graphics on LOW and MEDIUM: high-DPI laptop screens render at 1x (LOW) or 1.25x (MEDIUM) instead of 2x; the terrain uses one texture sample where HIGH uses three; your own jet is built with fewer polygons; jets around you swap to their light distance model sooner; the afterburner heat haze is off on LOW; and the hangar's shadow maps are smaller (the spotlight shadow is off on LOW).
- A full-screen image pass that only protected the bloom now switches off along with bloom.

## v4.13.1 (2026-09-28)

### Air Combat: Sharper terrain

- Sharper, clearer terrain on both maps. The ground texture is now projected onto slopes from the side as well as from above, so mountainsides no longer smear into blurry streaks; it is four times the resolution, stays sharp at shallow viewing angles, and rock faces show real fractured blocks and strata instead of a smooth smudge. On High and Ultra graphics the terrain keeps more detail in the middle distance. The thin rock spires along Hvitøy's central wall are softened into proper crests.

## v4.13.0 (2026-09-28)

### Air Combat: Real snow, natural mountains

- Frostfall Strait's snow looks like real snow now. It is an even, bright white whose texture comes from the light on its surface: wind-built drifts and sastrugi ridges catch the sun, the forward-scattered sheen glares on sunlit slopes, and ice crystals glint up close. Snow in shadow is lit blue by the sky instead of going dark and grey. The grey blotches on the slopes are gone; bare, dark rock shows only where it is too steep for snow to hold, with snow lodged in its cracks.
- More natural mountains on both maps. The snow map's big mountains were cones with evenly spaced pleats running down from the summit (the coffee-filter look); they are now real massifs with irregular outlines, several summits, arêtes, cirques and V-shaped valleys that wander, fork and meet. The Frostfall massifs and Hvitøy's central wall, and the Triad Isles' Skye crests and the Samos dividing range, are rebuilt the same way: a chain of peaks and saddles with branching spurs instead of an even wall or rows of ridges.
- Terrain lighting: mountain shadows and sky light no longer make slopes shade themselves in speckled patches. Only real blockers (other ridges) cast terrain shadows.

## v4.12.2 (2026-09-28)

### Air Combat: Keyboard and mouse only

- Touch-screen controls removed. Every device now plays exactly like a PC with keyboard and mouse (WASD, mouse aim and so on); touching the screen no longer brings up on-screen sticks or buttons, and the TOUCH CONTROLS setting is gone.

## v4.12.1 (2026-09-28)

### Air Combat: Less crackle

- Jet crackle turned down by 90 %: the ripping sound at high power and in afterburner is now a subtle edge under the roar, on your jet and on the jets around you.

## v4.12.0 (2026-09-28)

### Air Combat: Real jet sound

- ALL-NEW JET SOUND: every engine, afterburner and weapon sound rebuilt around how real fighters sound. The exhaust is proper jet mixing noise with its deep hump, breathing with the turbulence, and at high power it CRACKLES: the ripping, tearing shock waves you hear from a real fighter at full power, beamed out behind the jet.
- Afterburner: a lower, heavier, fluttering roar with the combustion throb and sub-bass pressure you feel, irregular reheat pops, a deep thump when it lights with the stages catching one after another, and a pop when you come out of burner.
- Real turbine sound for every engine (F110, F414, EJ200, M88, F119, AL-41F1S), with real spool speeds and blade counts: the fan's tone turns into the rasping buzz-saw when its tips go supersonic at high power, and the compressor whine is loudest at idle and from in front of the jet.
- Where you listen from matters: behind the jet it's roar and crackle, in front it's the whine and the intake; distance takes the top off the sound, and a jet that has broken the sound barrier outruns its own roar in the cockpit.
- Other jets now each have their own sound: up to three at once, each with Doppler (the pitch drops as they pass), stereo position, and the whine as they come at you turning into the roar and crackle as they go by.
- Cockpit: the canopy takes the roar down to a felt rumble, the air tearing past the canopy dominates at speed, plus the air conditioning, the G-suit hissing as it inflates and the oxygen regulator as you breathe (faster under G).
- On the ground: tyre rumble, the thump of the runway joints, and tyre chirps and a thump into the struts on touchdown.
- Weapons: the gun rendered shot by shot (the M61's growl as it spins up and the barrels whirring down; the heavy 27 and 30 mm cannons thudding), missiles with a rail clunk, the motor lighting with a crack and a harsh crackling roar falling away, explosions with the blast wave, fireball, rolling rumble, debris and echoes off the ground, hits ringing through the skin, flares and chaff, and new hydraulics for the gear.
- The warning tones and voices are unchanged.
- Touch screens (phones, tablets and touch-screen laptops): the camera now always swings back behind the jet 1.8 seconds after you stop dragging the view. A lost touch or a long press no longer leaves it stuck where you left it.

## v4.11.2 (2026-09-28)

### Air Combat: Pilot neck fix, hangar camera

- Pilots: the head no longer floats. There is now a whole head inside the helmet with the neck running from the suit collar up into it, the helmet comes down lower at the back, and the inside of the shell has a dark padded liner, so no angle shows a gap or a hollow helmet.
- Hangar camera: dragging up and down now moves the view the other way (drag up to look down over the top of the jet). Left and right are unchanged.

## v4.11.1 (2026-09-28)

### Air Combat: Pilot suit colours, better masks

- Pilot flight suit colour in CUSTOMIZE: under PILOT FLIGHT SUIT pick sage green, olive drab, desert tan, navy blue, air force blue, charcoal, black, test-pilot orange or white, any custom colour, or STD for the standard issue of that jet. It is saved per jet with your paint job and shows on your jet in flight and in the hangar (scroll in on the cockpit to see it).
- More realistic oxygen mask, modelled on the MBU-20/P: a hard shell over the nose and mouth (narrow at the bridge, wide at the chin) with its rubber face seal, the exhalation valve and hose connector underneath, a bayonet strap up each side clipping into the helmet, and a corrugated hose down to the regulator on the chest. The helmet is now open at the face, so the mask sits on the pilot's face rather than on the helmet.
- Shorter necks: the shoulders, flotation collar and suit collar now come up to the helmet as they do on a real pilot in his kit.

## v4.11.0 (2026-09-28)

### Air Combat: Realistic pilots

- Realistic pilots in every cockpit, replacing the blocky stick figures. Each one is a seated aircrew figure built to real proportions: flight suit, survival vest with its pockets and flotation collar, harness with leg straps, anti-G suit chaps on the legs, boots and gloves.
- Real helmets: a shell that comes down over the ears, a dark visor housing across the brow, a tinted mirrored visor over the eyes, the helmet-sight mount on top, and the oxygen mask with its hose running down to the connector on the chest.
- Kit matches the jet. F-15EX, F/A-18 and F-22A crews wear US sage green with grey helmets and tan gloves; Typhoon and Rafale pilots wear European kit with black gloves; the Su-35S pilot has a white helmet and a green mask. Seats have their ejection handles (ACES II side handles on the F-15EX and F-22A).
- Hands on the controls: the right hand holds the stick (a centre stick between the knees, or the side stick on the right console in the F-22A and Rafale) and the left hand holds the throttle on the left console. The only animation is the stick: it moves with the pilot's pitch and roll inputs, and the arm follows the hand on it.

## v4.10.1 (2026-09-28)

### Air Combat: Gun lead circle out to 10 NM

- Gun lead circle now shows out to 10 NM (it was about 1 NM), so you can line up on a bandit long before you're in range. The range to the target is shown under the circle once it's beyond a mile.
- Rounds now fly for 8 seconds instead of 3.2, so the gun reaches about 2 to 2.5 NM (a bit further up high, where the air is thinner). Inside that the circle is bright and turns red when you're on target; further out it is dimmed and marked OUT OF GUN RANGE, because the rounds slow down and drop before they could get there.

## v4.10.0 (2026-09-28)

### Air Combat: Flight School

- New game mode: FLIGHT SCHOOL, first on the mode list. An instructor panel walks you through flying and fighting in 12 short lessons, in the air over the contested island: switching views, climbing and diving, turning, throttle and afterburner (in and out of burner), pulling 6 G, radar lock, a radar missile shot, a heat-seeker shot, the gun with the lead circle, and flares and chaff. The target drones fly steady and never shoot back.
- Each lesson finishes by itself as soon as you have done it (a progress bar fills as you go); press ENTER to skip one. The instructions show your own key bindings and change with your mouse mode (mouse aim, mouse stick or keyboard). Crash, and you are put straight back in the air to carry on. Missed shots are reloaded.
- Then the CHECKRIDE, the demo test: 3 drones and a manoeuvring bandit that turns, dodges and drops flares but never fires. Destroy all four within 5 minutes. You get a grade (A, B or C) from your time and missiles used; RETAKE CHECKRIDE or RESTART LESSONS from the results screen.

## v4.9.0 (2026-09-28)

### Air Combat: A real hangar

- New hangar behind the menus: a realistic modern maintenance hangar replaces the round futuristic turntable. It is a steel-framed shed with ribbed metal cladding, blockwork walls, roof trusses, an overhead yellow bridge crane with its hoist and pendant, air ducts, sprinklers and LED high-bay lights.
- Real sunlight: the big sliding doors stand half open onto a sunlit apron (another hangar, a fuel truck, light masts and hills in the haze beyond). The sun falls in through the doors and a row of clerestory windows, with real shadows, window-shaped light patches on the floor, soft light shafts and dust drifting in the beams. The jet's paint now reflects the hangar around it.
- Lots of detail: a polished epoxy floor with painted lead-in line, parking box, walkways, hatched keep-clear zones, joints, tie-downs, tyre marks and oil stains; a two-storey glazed office block with lit rooms, a steel stair and railed walkway, and a squadron banner; workbenches with pegboards, red tool chests, racking full of boxes, desks with lit computer monitors and office chairs, lockers, a maintenance whiteboard, safety posters, exit signs and extinguishers.
- Around your jet: a boarding ladder hooked on the cockpit, wheel chocks, a ground power cart with its cable plugged in, a flight-line fire extinguisher, work stands, step ladders, a munitions trolley, a tow tractor and cones at the wingtips. The jet stays parked facing the doors and the camera slowly walks around it (drag, scroll and double-click work as before).
- The NEW tag is gone from the Free-for-all mode.

## v4.8.1 (2026-09-28)

### Air Combat: Su-35S nozzle clipping fix

- Su-35S: the thrust-vectoring nozzles no longer clip through the airframe. The burner can inside each nozzle was one long part reaching well forward into the engine nacelle, and it swung with the nozzle, so in hard manoeuvres it poked out through the side of the nacelle. It now ends just behind the gimbal.
- Thrust-vectoring nozzles (Su-35S and F-22A) now stay inside their real travel: pitch, roll and yaw vectoring share the jet's limit (15 degrees on the Su-35S, 20 on the F-22A) instead of adding up to double that when you pull and roll at the same time. The handling itself is unchanged.

## v4.8.0 (2026-09-28)

### Air Combat: Real afterburners

- New afterburners on every jet, modelled on real photos. The burner can inside each nozzle now lights up from the flame: white-hot on the axis, deep yellow-orange out at the liner and a glowing orange lip, with the flame-holder rings and spokes standing out as dark silhouettes when you look straight in.
- New plume: a white-yellow flame at the nozzle that turns orange within a couple of nozzle diameters, streaky and licking with turbulence flowing downstream, then a translucent column with a train of pale shock diamonds. It gets longer and the diamonds clearer at altitude. The Su-35S keeps its blue-violet plume, and the F-22A's flat nozzles now throw a wide, flat jet.
- Heat haze: the air behind every hot engine near you now shimmers and bends whatever is seen through it (strong in reheat, softer at military power). It never distorts your own cockpit.
- F-22A fixes: the glowing face deep inside its flat nozzles was facing the wrong way and could not be seen from behind, and the nozzle throats had no colour data, so they rendered as bright lit metal.

## v4.7.1 (2026-09-28)

### Air Combat: Smooth at 165 / 240 Hz, FPS counter

- High refresh rate displays: the game was never capped at 60 fps, but physics runs at a fixed 120 Hz, so above 120 fps some frames showed the same position twice and motion stuttered. Jets and missiles are now drawn part-way between physics steps, so motion is smooth on every frame at 144, 165 and 240 Hz.
- FPS counter is now always shown at the very bottom of the screen in flight.

## v4.7.0 (2026-09-28)

### Air Combat: Faster combat, more realistic jets

- Much faster in combat. Every jet now has a distance model: past a couple of hundred metres the full airframe is swapped for a merged copy that takes a handful of draw calls instead of about sixty, and looks the same at that range. In a 5v5 this cut draw calls by about a third and the triangles drawn per frame from 4 million to 2.5 million.
- Shadows are much cheaper. Your own jet used to draw its full-detail model (1.5 million triangles) a second time just for its shadow. Every jet now casts its shadow from a single-draw silhouette, and the full-detail model is only drawn once.
- More realistic jets: every airframe now has ambient occlusion baked from its own shape. Wing roots, intakes, the tunnel between the engines, tail roots and the underside now get soft contact shading instead of flat, evenly lit paint.
- In-flight detail: your own jet keeps its full hero-detail model in flight, and Ultra graphics now builds it about 40% denser than before.

## v4.6.2 (2026-09-28)

### Air Combat: Old menu back, auto-update

- Back to the previous main menu layout. The text fixes from 4.6.0 stay (mode descriptions, loadout notes, F-22A internal bays).
- The game now checks for a newer version when it loads and reloads itself once if one is live, so updates show up without a hard refresh.

## v4.6.1 (2026-09-28)

### Air Combat: Rafale intro removed

- Removed the Rafale intro that played the first time the update notes opened: its music, the animation and all of its code are gone. The update notes now just open. The Rafale itself is unchanged.

## v4.6.0 (2026-09-28)

### Air Combat: New menu, F-22A handling, fixes

- New main menu. A slim top bar replaces the crowded header: Multiplayer, Logbook, Controls and Settings on one line. On the left is a compact aircraft list. The jet in the hangar gets the middle of the screen, with its name and key numbers underneath. On the right, one panel with three tabs: Mission (game mode and its options), Aircraft (loadout and full specifications) and Theater (map choice). FLY is always at the bottom of that panel with a summary of what you're about to fly, so nothing is pushed off the screen any more.
- F-22A handling: the 2D nozzles now also deflect in opposite directions to roll the jet, as on the real Raptor, so it stays controllable rolling at high angle of attack. They still can't yaw. The post-stall limit with the G override is now 60 degrees (the Su-35S keeps 70), and it recovers from a high-alpha pull faster (1.3 s instead of 1.8 s).
- F-22A performance: its high-detail model is back to the same density as the other jets (about 2.4 million triangles, down from 3.8 million), so the frame rate, and the feel of the controls, is steadier on laptops.
- Fixed: outdated text from when there were fewer jets. The Free Flight description said 'any of the three jets' and '400 x 400 NM', the duel and wave descriptions said 'the two jets you did not pick', the free-for-all option said 'ALL FOUR TYPES', the loadout note only mentioned two missile families, and the TRIAD medal said 'all four aircraft'.
- Flatter, cleaner buttons across the menus (no more gradients).

## v4.5.1 (2026-09-28)

### Air Combat: F-22A model rebuilt

- F-22A model rebuilt from the ground up. The flat, faceted fuselage now has a sharp chine running from the nose to the tail and the wide flat deck over the intakes and wing roots. The caret intakes are built into the sides of the fuselage, with dark ducts. It also has the frameless gold canopy on a raised sill, broad trapezoidal fins canted out 28 degrees, the tail booms that carry the all-moving tailplanes, and square 2D nozzles with serrated upper and lower flaps that swing as you vector.
- Correct stance: the F-22 now stands 16.7 ft tall on its gear, with the nose leg behind the radome.
- Your own F-22 and the hangar jet are built at about 3.8 million triangles, the most detailed jet in the game.

## v4.5.0 (2026-09-28)

### Air Combat: F-22A Raptor

- NEW JET: the LOCKHEED MARTIN F-22A RAPTOR, the first fifth-generation fighter in the game, and the fastest.
- Speed: supercruise at Mach 1.8 with no afterburner, Mach 2.25 flat out, a 65,000 ft ceiling, and a climb that goes straight up at around 60,000 ft a minute. It's the quickest jet in the game from Mach 0.9 to 1.6 and to 36,000 ft.
- Engines: 2x Pratt & Whitney F119-PW-100, 70,000 lbf total with afterburner. The 2D nozzles vector 20 degrees up and down (pitch only) for tight flips and post-stall moves with G-limiter override.
- Kept fair on purpose: the radar is F-15EX-class, the radar signature is normal (no stealth advantage), and it carries only 8 missiles, all in internal bays: 6 AIM-120D and 2 AIM-9X. M61A2 20 mm gun, 480 rounds. Missiles in the bays add weight but no drag.
- Dimensions: 62 ft long, 44.5 ft span, 16.7 ft tall, empty weight 43,300 lb.
- New 3D model, the most detailed in the game (your own jet and the hangar get an even denser build than the others). It has the chined diamond nose, a frameless gold-tinted bubble canopy, caret intakes, a diamond wing with a forward-swept trailing edge, big all-moving tailplanes, twin fins canted out 28 degrees, flat two-dimensional nozzles that move as you vector, and the two-tone Raptor grey with its darker patches.
- The F-22A is in every mode, including multiplayer on the official servers.

## v4.4.1 (2026-09-28)

### Air Combat: Fixes: clouds, reflections, weather panel

- Fixed: a regular micro-stutter in cloudy weather. Up to 20,000 cloud puffs were re-sorted five times a second with a slow sort; they now use a fast native sort.
- Fixed: jets reflected a bright blue sky in rain, storms and overcast. Paint and canopy reflections now match the weather, so they're grey under the clouds.
- Fixed: on smaller screens the weather panel covered the FLIGHT panel. On short screens it now starts tucked away as just the arrow tab, and it's a little smaller. It remembers whether you left it open.
- Performance: when it isn't raining, the screen-droplet layer no longer redraws and re-uploads its texture every frame.

## v4.4.0 (2026-09-27)

### Air Combat: Gun lead marker

- NEW: gun lead marker, like War Thunder. When an enemy is inside gun range (about 1 NM), a small circle appears ahead of them, with a dotted line from the jet, showing exactly where to shoot. Put your gun cross on the circle and your rounds meet the target: it allows for the target's motion, your own speed, the rounds slowing down and bullet drop. It turns red when you're on target. It works for the locked target, or else for the enemy nearest your gun line, with any weapon selected, in cockpit and outside views.

## v4.3.2 (2026-09-27)

### Air Combat: Smaller rain drops

- Rain drops on the screen are a third of the size and land only along the very left and right edges, so the middle of the screen stays clear.

## v4.3.1 (2026-09-27)

### Air Combat: Rain on the canopy

- Rain now beads on the screen like water on a window: drops land, grow and refract a blurred, flipped view of what's behind them. At speed the airflow sweeps them sideways off the edges of the screen; when you're slow they run down and slide off.
- The falling rain no longer streaks past like you're jumping to lightspeed: the streaks are short, and they thin out the faster you fly, so the drops on the canopy take over.
- Fixed: clouds popping in and out at the horizon. The far edge of the cloud field now fades out smoothly instead of cutting off, and the cloud deck reaches well past the horizon.

## v4.3.0 (2026-09-27)

### Air Combat: Weather

- NEW: WEATHER. A weather panel sits at the top left while you fly: pick CLEAR, CLOUDY, OVERCAST, RAIN, STORM or SNOW, then fine-tune CLOUD COVER, RAIN / SNOW and VISIBILITY (shown in NM). The arrow tab slides the panel off the screen and back. Your choice is saved.
- New clouds: big, full cumulus built from overlapping puffs and spread across the whole theater, from a few fair-weather clouds on a clear day to a sky full of towering cumulus. They no longer look like small clumps of dots.
- Overcast, rain and snow bring a solid cloud deck. Under it the sun is hidden and the day goes grey. Fly up into it and you're in whiteout, then break out on top into sunshine over a sea of cloud.
- RAIN: a dark deck, rain streaks that stretch into lines at speed and lower visibility. STORM: heavier rain, darker cloud, thunderheads, and lightning that lights up the sky, followed by thunder. SNOW: drifting flakes in grey murk. Rain and snow fall only below the cloud base.
- Weather only changes your own screen: in multiplayer, other pilots see their own weather. The old CLOUDS option in Settings is replaced by the weather panel. CLOUD QUALITY still sets how full each cloud is.

## v4.2.0 (2026-09-27)

### Air Combat: Hero-detail jets

- Every jet now has a HERO model with about 10 times the polygons: 2.5 to 4 million triangles per airframe (F-15EX 3.3M, F/A-18E/F 2.9M, Typhoon 2.5M, Su-35S 4.0M, Rafale 2.6M), up from 250,000 to 390,000.
- The whole airframe is rebuilt at the higher density: fuselage lofts, intakes and ducts, canopies and frames, wings, canards, fins and control surfaces, nozzles and petals, landing gear and every turned part. Curves are smooth all the way round and silhouettes stay clean however close the camera gets.
- You get the hero model for your own jet and in the hangar. The jets around you keep the standard model so a 12-jet fight still runs smoothly.
- Hero density follows GRAPHICS QUALITY in the settings: about 10x on HIGH and ULTRA, about 4x on MEDIUM and about 1.5x on LOW.
- Memory: the hangar now keeps only the jet on the turntable built and frees the others. A hero model is freed when nothing uses it any more.

## v4.1.0 (2026-09-27)

### Air Combat: The Rafale is coming

- It's here. NEW JET: the DASSAULT RAFALE C. You don't hear it coming. Your radar warning receiver is the first thing that knows, and by then it's already too late.
- It sees you first: RBE2 AESA radar out to 90 NM, OSF passive infrared search and track out to 42 NM, and SPECTRA self-protection that jams your missiles and dumps chaff and flares on its own.
- METEOR: a ramjet air-to-air missile that stays under power all the way to you. It reaches about 92 NM from 40,000 ft (about 52 NM at 20,000 ft), more than double the AIM-120D. Inside about 34 NM there is no escape: no turn, no dive and no afterburner outruns it.
- MICA IR: an imaging heat-seeker with thrust vectoring that reaches about 27 NM, out-reaching every other heat-seeker in the game. It rides on the wingtips and pylons.
- 14 hardpoints and 20,900 lb of payload: up to 10 air-to-air missiles, plus a 30 mm Nexter 30M791 cannon with 125 rounds at 2,500 rounds a minute.
- Two Safran M88-2 engines (11,240 lbf dry and 16,860 lbf with afterburner each) push the lightest jet in the theater to Mach 1.8 and 50,000 ft. Its close-coupled canard delta holds energy in the turn, pulls +9 G and keeps flying at 30 degrees angle of attack. Combat range is 2,000 NM with tanks.
- Dimensions: 50.2 ft long, 35.8 ft span, 17.4 ft tall. Empty weight 21,700 lb, max takeoff 54,000 lb, g limits +9 / -3.2.
- New 3D model: the long pointed radome, OSF sensors ahead of the windscreen, the fixed refuelling probe curving forward on the right side, bubble canopy, big canards over the D-shaped side intakes, cropped delta wing with slats and elevons, wingtip missile rails, and the single fin with its squared SPECTRA fairing. Two close-set nozzles, twin nose wheels and French grey paint. It has its own engine sound, cockpit displays and stores page.
- Loadouts: AIR SUPERIORITY (4 Meteor, 4 MICA), COMBAT AIR PATROL (2 Meteor, 4 MICA, 3 tanks), MAX AAM (6 Meteor, 4 MICA) and DOGFIGHT (2 Meteor, 6 MICA).
- The Rafale is in every mode, including multiplayer on the official servers. Pick it in the hangar... if you'd rather be the one hunting.

## v4.0.1 (2026-09-27)

### Air Combat: Intakes the right way up

- Fixed: the Su-35S and Typhoon engine intakes were raked upside down, with the bottom lip sticking out in front. Now the top edge leads and the mouth leans back underneath, as on the real jets: the Flanker's intakes are cut back underneath, and the Typhoon's upper lip (by the splitter) sits ahead of its lower lip.

## v4.0.0 (2026-09-27)

### Air Combat: Multiplayer

- NEW: MULTIPLAYER. Press MULTIPLAYER ▸ on the main menu to fly LAST PILOT STANDING against real people. It's free-for-all only, and there is no AI on any server.
- Official servers OFFICIAL 1 to 5 (1-3 on Triad Isles, 4-5 on Frostfall Strait) are listed with live pilot counts. You can also join any server by typing its address.
- Host your own server: 'cd server && npm install && npm start' (options: --name, --map triad|frost, --port, --max). Up to 12 pilots per room.
- How a match works: between matches everyone flies around the arena with weapons on hold. When two or more pilots are in, a 15-second countdown starts, then everyone drops in on a ring facing the middle. Weapons are free after 8 seconds, the zone shrinks in stages and the storm outside takes you down, each kill rearms you with a missile of each type, gun rounds, flares and fuel, and the last jet flying wins. Results show for a few seconds, then the next match starts by itself.
- Join during a match and you spectate until the next one ([TAB] next pilot, [F] free camera). If you're shot down, you watch the rest of the match.
- Everything is shared between players: jets with their own paint jobs and loadouts, afterburner, gear and damage smoke, missiles in flight (with RWR and missile warnings), flares and chaff (they can decoy your missiles), gunfire tracers, and radar locks on your RWR.
- What the shooter sees decides a hit, and the pilot who was hit takes the damage and reports the kill, so the kill feed and scores match for everyone. Other jets are smoothed over the network so they fly smoothly.
- Joining a server on a different theater loads that theater, then joins automatically. Pausing doesn't stop an online match. The HUD shows your ping.
- Play online from the website version: browsers only allow secure (wss://) connections from a web page.

## v3.1.0 (2026-09-27)

### Air Combat: Physics update and bug fixes

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

## v3.0.0 (2026-09-27)

### Air Combat: New sound engine and realistic jet models

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

## v2.2.3 (2026-09-26)

### Air Combat: Accurate missile racks

- Missile racks researched from the real jets (the F-15EX is unchanged):
- F/A-18E/F Super Hornet: AIM-9X on the wingtip LAU-127 rails, a single missile hung under each outboard pylon, and an LAU-115 twin rack on each middle wing pylon with two AMRAAMs side by side on LAU-127 shoulder rails (as in the Navy's 'Murder Hornet' air-to-air loadout), plus the fuselage cheek AMRAAMs. A fuel tank on the middle station hangs from the pylon centre.
- Eurofighter Typhoon: back to one missile per wing pylon, as on the real jet (no twin racks), with the AMRAAMs semi-recessed under the fuselage.
- Su-35S: one missile per hardpoint as on the real Flanker, on chunkier Russian APU-170 / P-72 style launchers: R-74M on the wingtips and outer pylons, R-77M on the inner pylons, under the engine nacelles and in the tunnel between the engines.
- Loadouts, missile counts and handling are unchanged.

## v2.2.2 (2026-09-26)

### Air Combat: No more freeze on kills

- Fixed: the game froze for a couple of seconds every time a jet was shot down. When a jet was destroyed, its paint job was copied to scorch the wreck, and each copy needlessly converted the whole livery (large texture data) to text, once for every part of the airframe. The wreck is now scorched with a lightweight copy, shared across parts: the kill that took seconds now takes about 3 thousandths of a second, so explosions play smoothly.

## v2.2.1 (2026-09-26)

### Air Combat: Aligned missile racks

- Missile racks rebuilt on all four jets to match the real thing: missiles now ride in matched pairs on twin-rail racks, side by side on the shoulders of a shared pylon (like LAU-128s on an F-15 pylon), level with each other, parallel to the fuselage and with their noses lined up.
- F-15EX: both wing pylons are twin racks, four missiles per wing in two neat pairs, plus the tandem pairs along the conformal tanks.
- F/A-18E/F: the outboard wing pylon is a twin rack, level with the inboard pylon. Typhoon: the wing missiles pair up on one twin rack. Su-35S: the inner wing pair shares a twin rack and the outboard missile rides a shoulder rail at the same height.
- Fuel tanks on a rack station hang from the middle of the pylon, below the shoulder missiles. Loadouts, weapon counts and handling are unchanged, and missiles launch from their new rail positions.

## v2.2.0 (2026-09-26)

### Air Combat: XP and levels removed

- Removed the pilot XP, level and money system completely: no pilot card on the main menu, no XP pop-ups or XP bar in flight, no level-up celebration, no XP section in the debrief, and its saved data is cleared. Everything else plays exactly the same.
- Free-for-all: the bounty and your placing work as before, just without XP or money attached.

## v2.1.1 (2026-09-26)

### Air Combat: Black screen fix

- Fixed: the screen could go completely black as soon as you started flying on some graphics cards. A very bright sun glint off glossy paint or a canopy could overflow the HDR picture buffer, and the new bloom smeared that broken pixel across the whole screen. The picture is now cleaned before bloom, so this can't happen any more, and bloom still glows as before.
- Hardened the haze, cloud and free-for-all storm-wall shaders against the same kind of invalid values.

## v2.1.0 (2026-09-26)

### Air Combat: Free-for-all: Last Pilot Standing

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

## v2.0.0 (2026-09-26)

### Air Combat: Graphics overhaul

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

## v1.9.2 (2026-09-26)

### Air Combat: Chase camera auto-recenter

- Chase camera auto-recenter: when you look around your jet in the chase view, the camera now glides smoothly back to its normal position behind the jet after 1.8 seconds without moving it. It eases in gently, sweeps home the short way round (even after a full orbit) and settles softly, with no snapping.
- It never pulls the view away while you're still looking: as long as you hold the right mouse button (or the middle button, or keep your finger on the touch look area), the camera stays exactly where you put it. The 1.8-second timer only starts once you let go.
- The recenter only applies to your own jet in flight. The cockpit view, the spectator camera and replays keep the view where you leave it.

## v1.9.1 (2026-09-26)

### Air Combat: Giant mountains

- Frostfall Strait mountains rebuilt: no more spiky knife-edge peaks. The mountains are now broad and massive, like Mount Fuji: huge snow-capped cones 20 to 40 miles across, with long sweeping concave flanks rising to a small summit crater, and gullies and ribs running down their sides.
- Lots more big mountains: every landmass is covered in these giant cones, many of them rising over 20,000 ft and the biggest above 26,000 ft, standing on wide rounded ranges instead of jagged ridges. Hvitøy's dividing wall is a broad mountain wall now too, and the rocky islets are small snow cones.
- Real snow line: the lower slopes of the mountains show bare russet volcanic rock and scree streaking up the gullies, with the snow cap above, like the reference photo, so you can see how tall they really are from the air.
- All six Frostfall airfields keep clear approach valleys through the new mountains.

## v1.9.0 (2026-09-26)

### Air Combat: Frostfall Strait, new water, 3 new wraps

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

## v1.8.0 (2026-09-26)

### Air Combat: Pilot XP & levels, realistic afterburners

- NEW: Pilot XP, levels and money. Everything you do in the air earns XP; XP raises your level (1 to 100) and your rank, from CADET to GENERAL OF THE AIR FORCE. Your pilot card with level badge, rank, XP bar and money is at the top of the main menu, and it counts up your gains when you come back from a sortie.
- Kills pay XP and money, scaled by the enemy difficulty (Easy 60% up to Extreme 140%): 100 XP and $400 per kill at Hard, plus GUN KILL (+50 XP, $200), LONG SHOT past 20 NM (+40, $150), DOUBLE KILL within 12 s (+50, $250) and FIRST BLOOD (+25).
- Combat and flying XP: defeating a missile fired at you (+25 XP, $100); manoeuvres like HIGH-G TURN (7 G for 3 s), LOOP, AILERON ROLL, LOW PASS (under 200 ft above 350 kt), INVERTED FLIGHT and SUPERMANOEUVRE (Su-35S post-stall); SUPERSONIC, MACH 1.5 and MACH 2 once per mission; distance flown (20 XP per 10 NM, more when supersonic); and landings (Greaser +100 XP / $300, Good +60 / $150).
- Mission results pay out too: waves cleared, all 10 waves, 5v5 rounds and match wins, and duel wins.
- Fair levelling: each level needs a little more XP than the last (500 XP for level 2, then 150 more per level), so early levels come quickly and later ones stay reachable. Every level-up pays a cash bonus ($250 × the new level). You never lose XP or money. Manoeuvres have cooldowns and a cap per mission so they can't be farmed, and distance doesn't count while Auto-Fly is flying the jet.
- Animations: XP and money pop up as glowing toasts as you earn them (repeats stack, e.g. LOOP ×2), a slim XP bar above the weapons fills with a glow, and a level-up sets off a full-screen celebration with light rays, expanding rings, sparks, a gold level badge slamming in, 'PROMOTED' for a new rank, the cash bonus and a fanfare. The debrief shows everything you earned, with the totals counting up and the XP bar filling through each level-up.
- Photorealistic afterburners on all four jets: each engine now has a white-hot core, a main plume with real shock diamonds and flowing turbulence, and a faint outer heat haze that fades softly at the edges instead of a solid cone. The nozzles glow white-hot in the middle and orange at the rim, and the plume stretches in thin air at altitude. Western jets burn yellow-orange fading to violet; the Su-35S keeps its blue flame with bright diamonds.
- Fixed: Su-35S gun kills were credited to the 'BK-27' (the Typhoon's cannon); they now show the GSh-30.

## v1.7.6 (2026-09-26)

### Air Combat: Smoother hangar camera

- Hangar camera: the drag direction is reversed (both left/right and up/down).
- Smoother camera: moves glide with gentler easing, and a quick flick keeps the view turning for a moment before it slows to a stop. Holding still before you let go stops it dead.
- Zoom in much closer: scroll (or pinch) right up to the jet to see the cockpit, missiles and nozzles up close. The camera centres on the jet as you zoom in and never goes inside the airframe.

## v1.7.5 (2026-09-26)

### Air Combat: Hangar camera

- Look around the jet in the hangar: on the main menu (and the customize screen) drag anywhere on the empty space around the jet to orbit the camera, from low beside the jet to straight overhead. Scroll the mouse wheel (or pinch on a touch screen) to zoom in close or back out. Double-click to reset the view.
- The turntable stops its slow spin as soon as you take the camera, so the jet stays where you put it.
- The loadout note on the main menu now names both missile families (the Su-35S carries R-77M and R-74M, not AIM-120D and AIM-9X).

## v1.7.4 (2026-09-26)

### Air Combat: Pusk! and model fixes

- Su-35S launch call is now just 'Pusk!' (Пуск, 'launch!'), for both the R-77M and the R-74M. It's spoken in Russian if your device has a Russian voice. The F-15EX, F/A-18E/F and Typhoon keep 'Fox three' (AIM-120D) and 'Fox two' (AIM-9X).
- Model fixes for the F-15EX, F/A-18E/F and Typhoon: every wing pylon and missile rail now sits under the wing at mid-chord. Before, many hung well ahead of the leading edge; the Typhoon's outer rails started almost 3 m in front of the wingtip, and some Super Hornet pylons floated 1 m ahead of the wing.
- Stores now hang the right distance below the wing for their size: a fuel tank sits lower than a missile on the same pylon, so tanks no longer cut into the wing and missiles no longer float below it. Missiles launch from where they visibly hang.
- Landing indexer fixed for all four jets: its on-speed angle of attack now matches how each jet actually flies at approach speed (F-15EX 12, F/A-18E/F 10, Typhoon 13, Su-35S 12 degrees). Before, the F-15EX, Super Hornet and Typhoon always showed 'slow' on a correct approach.

## v1.7.3 (2026-09-26)

### Air Combat: Correct launch calls

- Launch calls fixed. F-15EX, F/A-18E/F and Typhoon use the NATO brevity codes again: 'FOX 3' / 'Fox three' for the AIM-120D and 'FOX 2' / 'Fox two' for the AIM-9X.
- Su-35S launch calls are now what Russian pilots actually say. They don't use 'Fox' codes: they name the missile and call 'Пуск!' ('launch!'). The feed shows 'Р-77М — ПУСК!' or 'Р-74М — ПУСК!', and the voice says it in Russian if your device has a Russian voice (otherwise 'R 77 M, pusk!').

## v1.7.2 (2026-09-26)

### Air Combat: Missile calls

- Launch calls now say what you actually fired. Firing an R-77M shows 'R-77M AWAY (FOX 3)' in the feed and the voice says 'R 77 M away'; an R-74M says 'R-74M AWAY (FOX 2)'. The same goes for every jet: 'AMRAAM away' for the AIM-120D and 'Sidewinder away' for the AIM-9X.

## v1.7.1 (2026-09-26)

### Air Combat: Su-35S complete

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

## v1.7.0 (2026-09-26)

### Air Combat: Sukhoi Su-35S

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

## v1.6.0 (2026-09-26)

### Air Combat: Black Ice

- New wrap: BLACK ICE. A black nose fades into deep glacial teal toward the tail, with faceted ice crystals, smoky teal wisps and glowing cracks that shine faintly even in shadow. It's the first tile in the WRAP list; you can still change its colours, finish and brightness.
- 5v5 Team Battle: the teams now start closer together (14 NM instead of 24), so more rounds are won by shooting the other team down rather than running out the 5-minute clock.
- Faster wrap previews: making a pattern no longer freezes the customize screen for a moment.

## v1.5.0 (2026-09-26)

### Air Combat: Jet customization

- Jet customization for all three jets: press CUSTOMIZE JET on the main menu to open the new customization screen, just your jet on the turntable and the paint controls.
- Paint types: the FACTORY scheme, a SOLID COLOUR (18 colours plus a custom colour picker), or a WRAP.
- Eight wraps: Digital, Splinter, Tiger, Hex, Woodland, Arctic, Carbon fibre and Chevron. Each comes with its own colours, and you can change the base and pattern colours.
- Finish: Matte, Satin, Gloss or Metallic, plus a BRIGHTNESS slider (50-150%).
- Changes preview live on the jet; nothing is saved until you press APPLY. CANCEL (or Esc) puts your saved paint back, RESET TO FACTORY starts over. Switch between the F-15EX, F/A-18E/F and Typhoon with the tabs at the top; each jet keeps its own paint.
- Your paint job is on your jet in every mode, and panel lines, roundels, tail codes and weathering stay on top of it.
- 5v5 Team Battle: a round still going after 5 minutes of fighting now ends and BOTH teams get a point (the time left shows in the HUD). If that puts both teams on the winning score together, the match is a draw.

## v1.4.0 (2026-09-26)

### Air Combat: 5v5 Team Battle

- New game mode: 5v5 TEAM BATTLE. You and four AI wingmen (BLUE) against five AI bandits (RED) over Samos.
- Rounds: wipe out the other team to win the round; everyone respawns fully rearmed for the next. First team to 3 round wins takes the match (choose first to 2, 3 or 4).
- Your wingmen fly the same AI as the enemy, just on your side: they hunt, bracket, fire AMRAAMs and Sidewinders and defend themselves. Choose mixed wingman jets or all the same as yours.
- Bandits only fly the two jets you did not pick. Pick the AI difficulty (Easy to Extreme) and weapons (all, Sidewinders + gun, or guns only).
- Spectator: when you're shot down you can watch any jet on either team until the round ends. Click a jet in the list, or use the arrow keys / Tab; right-drag to orbit, wheel to zoom. It moves on to the next jet automatically when the one you're watching goes down.
- Free camera: press F while spectating to fly a camera anywhere (WASD, Q/E down/up, Shift faster, right-drag to look).
- Scoreboard: round number and score in the top bar, jets left on each side, round banners and voice calls. A round that runs past the time limit is decided by the rules at that time (see later versions).
- Logbook: 5v5 match and round record, plus two new decorations: SQUADRON LEADER (win a match) and CLEAN SWEEP (win without losing a round).

## v1.3.0 (2026-09-26)

### Air Combat: Auto-Fly

- Auto-Fly replaces the old level-off autopilot. Press U to open a small panel, pick a destination (any airfield or the bullseye, or hold your current heading), a speed (300-650 kt) and an altitude (2,000-40,000 ft), then ENGAGE.
- The jet flies itself there: it turns onto course, holds your speed with the throttle (afterburner if needed), climbs over any mountains in its path, and circles overhead when it arrives.
- The destination becomes your HUD steerpoint, and the HUD shows where Auto-Fly is taking you and how far is left.
- Move the stick (or the mouse in mouse-aim) to take control back instantly; press U again to change the destination, speed or altitude, or to disengage.
- Steering fix: turns with a bank limit no longer over-pull and slowly climb (AI patrols benefit too).

## v1.2.1 (2026-09-26)

### Air Combat: Smooth roll-outs

- Fixed the wobble after turning: when you stopped a turn the jet rocked wing over wing (roll one way, back, and back again). The mouse-aim autopilot now asks for a roll rate matched to what the flight controls can deliver, so the wings settle smoothly.
- Fine aim: for the last few degrees near the aim point the jet no longer swings its bank from side to side; it holds the wings steady and uses the rudder for small heading corrections.
- Unload to roll: when the jet needs to roll a long way it eases off the G first (like a real pilot), so it rolls quickly instead of fighting its angle-of-attack limit.
- Small corrections below the nose are made by easing the stick forward instead of rolling inverted.
- Gentler corrections at low speed, where the control surfaces have little authority.
- Fixed reversed rudder from v1.2.0: right rudder yaws the nose right again.
- The AI pilots use the same autopilot, so they fly smoother too.

## v1.2.0 (2026-09-26)

### Air Combat: Realistic flight physics

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

## v1.1.0 (2026-09-26)

### Air Combat: High-detail aircraft

- All three jets rebuilt from scratch: F-15EX Eagle II, F/A-18F Super Hornet and Eurofighter Typhoon (about 150,000 triangles each, up from about 15,000).
- Smooth blended fuselages built from real cross-sections: F-15 chines and dorsal hump, Super Hornet LEX blades, Typhoon drooped radome and spine.
- Hollow intakes with rounded lips, ducts that darken with depth and engine fans inside: raked F-15 boxes, Super Hornet carets under the LEX, Typhoon "smiling" chin intake with splitter.
- Real airfoil wings and tails with rounded tips, cranked and raked planforms, dog-teeth, and separate moving flaps, ailerons, leading-edge flaps, slats, rudders, stabilators and canards.
- Engine nozzles with petals, sawtooth exits, burner cans, flame holders and turbine faces.
- Detailed landing gear: oleo struts, torque links, drag braces, tyres and hubs, doors, taxi lights; twin nose wheels and launch bar on the Super Hornet.
- Pilots in ejection seats visible through the canopy, cockpit wells, glare shields, framed bubble canopies with reflective glass.
- Painted liveries: panel lines, rivets, walkways, NO STEP stencils, weathering and exhaust soot, radomes, anti-glare panels, coalition roundels, tail codes, serials and warning markings (F-15EX two-tone grey, Super Hornet tactical greys, Typhoon air-superiority grey).
- Speedbrakes modelled per jet: F-15 dorsal panel, Super Hornet LEX spoilers, Typhoon dorsal airbrake.
- New AIM-120D, AIM-9X, fuel tank, streamlined pylons and rail launchers.
- Detail parts are culled on distant jets, and each jet type is built once and shared, so waves spawn without stutter.

## v1.0.0 (2026-09-26)

### Air Combat: First release

- Three aircraft (F-15EX, F/A-18E/F, Typhoon) over a 400 x 400 NM theater: Skye, Capri and Samos, with six airfields, forests and mountains everywhere.
- Free Flight, 10-wave combat and 1v1 Duel (Easy / Medium / Hard / Extreme); enemies never fly your type.
- Fly-by-wire flight model, fuel system with afterburner burn, G effects (grey-out, tunnel vision, 10-second G-LOC, red-out).
- AIM-120D, AIM-9X, guns, flares and chaff; radar, IRST and missiles all blocked by terrain and the curvature of the earth.
- AI with patrol, intercept, engage, defensive and terrain-masking behaviour.
- 3D cockpits with working displays, helmet-mounted cueing, navigation, ILS and graded landings.
- Pilot logbook with decorations, mission debrief, track replays, touch controls.
