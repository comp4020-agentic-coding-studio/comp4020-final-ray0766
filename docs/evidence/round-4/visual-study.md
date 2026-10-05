# Industrial flight sample

The user reviewed the cartoon flight view and explicitly requested a more mature
science-fiction industrial feel, with Cyberpunk 2077 as an aesthetic reference.
The implemented scope is a focused ship/flight/approach sample, not a claim of AAA
production quality or a completed world-wide art pass. Ground buildings and
couriers retain the earlier prototype visuals. No game assets were extracted.

`src/client/space-art.ts` now owns the original procedural ship and orbital art.
The ship uses a tapered structural hull, raised panel seams, bolt heads, cooling
louvres, canopy framing, twin engine housings, nozzle rings and small running
lights. Standard/physical materials separate painted metal, exposed steel,
ceramic panels, copper-toned nozzle bands and glass. A deterministic local texture
adds subtle roughness and surface wear. Static geometry is merged per material.

A procedural environment reflection and warm/cool directional lighting reveal
edges without a bloom pass. Sparse stars and a distant ringed body establish
background scale; the latter sits outside the flight boundary. Orbital planets use NASA SVS public-domain colour/elevation maps, a seeded
ocean-world texture and a restrained atmospheric rim. `ASSET-CREDITS.md` records
the downloaded files, exact sources and verified redistribution terms. This is visual orbital scenery, not the proposed user-configurable
ecology generator. Existing planet IDs, slots, surface physics and saves remain.

Steering input now eases into angular motion, the visual bank settles gradually,
and acceleration subtly extends the chase-camera distance and field of view.
The camera is offset to show side structure. Engine intensity and exhaust respond
to thrust; the HUD reports coasting/braking, speed, heading and pitch. Reduced-motion
mode suppresses speed-based FOV and camera easing. Ship appearance does not change
its collision hull or server motion budget.

The first PBR screenshot still looked too pale and the planets too noisy. The
paint/ceramic values were darkened, surface contrast reduced, crater structure
added and a distant scale reference repositioned. The actual Chrome screenshots
and renderer measurements accompany the final verification record. Phone view
retains touch steering and pedals, with a compact HUD and the same gameplay.

Ship mesh construction, its roughness texture, UI and shader snippets are local
procedural work. Lunar maps are the credited NASA SVS exception. Three.js r186 supplies its MIT-licensed core and bundled
RoundedBoxGeometry, geometry merge helper and RoomEnvironment; no model pack, purchase or paid API was used. The two NASA image files are
bundled locally and add no runtime request to a third party.

Technical references inspected: [Three.js material documentation](https://threejs.org/docs/).
The bundled dependency's license is `node_modules/three/LICENSE`.

The last purely procedural rocky surface still read as large round spots in the
close approach screenshot. NASA SVS CGI Moon Kit colour and LOLA elevation maps
replaced that texture after checking the source page and public-domain terms.
The distant ring also gained transparent radial bands instead of a flat disc.
