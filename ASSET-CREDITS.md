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

## Final workshop-v1 — committed editor and updated materials

This local branch supersedes the round 6 source snapshot with **31 unchanged
TypeScript files** from the user's `planet-claude-modules` commit
`db79d7350decb4167d12e1a980a293cdb77cea83`. This is reuse of Claude's editor,
codec, assembly view, ground fitting and geometry/material dependencies; the
main-project adapter adds the UI, lifecycle and authoritative server library.
The source workspace was read-only. Per-file hashes and imported assets are
recorded in `src/assets/claude-geometry/PROVENANCE.json`. Earlier round 6
provenance remains historical evidence, not the current dependency inventory.

Seven locally bundled [Poly Haven](https://polyhaven.com) texture sets use
[CC0 1.0](https://polyhaven.com/license). Source URLs, authors, preparation
steps and hashes are in `public/assets/scans/manifest.json`: Hangar Concrete
Floor and Clean Asphalt (Dimitrios Savva), Concrete Pavement (Charlotte
Baglioni), Metal Plate, Metal Plate 02 and Blue Metal Plate (Rob Tuytel),
and Corrugated Iron 02 (Jenelle van Heerden, Sergej Majboroda). Medium detail
uses 512 px albedo/normal and 256 px packed ARM WebP maps. Capture methods
are not established; these are not described as photogrammetry assets.

The snapshot also includes the optional CC0 Aircraft Workshop 01 HDRI
(Oliksiy Yakovlyev) and Hanger Exterior Cloudy HDRI (Dimitrios Savva,
Jarod Guest). The integrated workshop currently uses a procedural environment
and bounded real fill lighting rather than loading these HDRIs. Three.js
OrbitControls and postprocessing helpers are also covered by its MIT license.

## R3 local integration

The current dependency snapshot contains 32 unchanged TypeScript files from
`planet-claude-modules@a4546bb120d969774776f1fbe2cb1c990a7c3e66`. It replaces ten
files of the prior snapshot and adds the practical-light pool. Main owns only
adapters, resource URL routing, persistence and physics; Claude's geometry and
lighting parameters are unchanged.

Current module assets live under
`public/assets/claude/a4546bb120d969774776f1fbe2cb1c990a7c3e66/`; the manifest and
per-file SHA256 values are recorded in `src/assets/claude-geometry/PROVENANCE.json`.
Legacy unversioned assets remain available to previously loaded pages. The new
CC0 dusk environment is **Qwantani Dusk 2 (Pure Sky)** by Greg Zaal and Jarod Guest,
https://polyhaven.com/a/qwantani_dusk_2_puresky. It replaces the old Hanger Exterior
Cloudy selection within the new snapshot; the old file is retained only for URL
compatibility. Aircraft Workshop 01 and the seven texture sets keep their credits
above. The main workshop still uses the procedural hangar environment.

The 56 KTX2 files are Claude's UASTC + Zstandard encodings of those same CC0 maps;
WebP fallbacks remain bundled. The Basis transcoder JS/WASM pair is the unchanged
three.js 0.186.1 distribution of Binomial's Apache-2.0 transcoder. Source and notices:
https://github.com/BinomialLLC/basis_universal. No KitBash assets were downloaded or
added. Medium detail defaults to WebP; `?textures=ktx2` is a diagnostic override.
