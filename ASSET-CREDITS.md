# Asset provenance

## NASA SVS CGI Moon Kit — orbital planet surfaces

Credit: **NASA's Scientific Visualization Studio**. Visualization: Ernie Wright
(USRA). Source data: Lunar Reconnaissance Orbiter LROC (camera team, Arizona State
University) and LOLA (laser altimeter team).

- Source page: https://svs.gsfc.nasa.gov/4720/
- Usage terms checked 2026-10-05: https://svs.gsfc.nasa.gov/help/#frequently-asked-questions
  NASA SVS states that its content is public domain unless otherwise noted and
  may be downloaded, used and redistributed. The two image entries below carry
  no separate restriction. No NASA insignia, people or audio are used.
- NASA's additional media guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/
- `public/textures/lroc-color-2k.jpg`: the 2025 LROC colour map, 2048×1024.
  Original: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg
- `public/textures/lola-height-1k.jpg`: LOLA elevation preview, 1024×512.
  Original: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg

The files are locally bundled, with no runtime third-party request. They are
unmodified files used with per-world rotation, restrained material tint and bump
scale. This is fictional orbital scenery, not a scientific Moon visualization.
The existing walkable terrain and saved placements are unchanged. NASA does not
endorse this project.

## Original procedural work

Ship mesh/panels/nozzles, roughness texture, engine effect, interface, distant dust
ring, ocean-world texture and the earlier surface scenes are created in code in
this repository. No Cyberpunk 2077 or Messenger asset was copied or extracted.
No model pack, paid asset or paid API was used.

## Three.js

Three.js 0.186.1 and its bundled RoundedBoxGeometry, merge helper and
RoomEnvironment are used under the MIT license. License: `node_modules/three/LICENSE`.
Source: https://github.com/mrdoob/three

The industrial starport district, service circuit, observatory, boarding/return
beacons, mechanical suits and visitor LOD silhouettes added in round 5 are also
original procedural geometry. The existing NASA orbital texture attribution is
unchanged. At that stage, no external workshop or character pack was imported.
Round 6 resource reuse is credited separately below.

## Round 6 — City reference and shared structural resources

The official RSI Locations page and its Area18/New Babbage images were actually
viewed as references for architectural scale, layered skyline and dusk air. They
are not bundled or used as textures. No Star Citizen model, texture or sound was
extracted. The new city layout, lights, signs, facade maps, surface grain and the
Sunseed material profile are generated in this repository.

With explicit user authorization to reuse compatible assets, 13 unchanged pure
geometry/material dependency files were copied from the user's independent
`planet-claude-modules` repository at commit
`ea279fd34fce3a054faaea622378181ce2d8dc9a`. These are credited to that Claude workspace,
not presented as newly authored geometry from this thread. The snapshot excludes
its uncommitted editor, blueprint, server, terrain, history and spacecraft work.
Source path and per-file SHA-256 values: `docs/integration/shared-geometry-source.json`.
Use and integration boundary: `docs/integration/shared-assets.md`. This is local
reuse of the user's own project resources, not a third-party public asset pack.
