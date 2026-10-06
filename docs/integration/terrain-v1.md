# Opt-in terrain — local playable stage

2026-10-06. This belongs to `final/workshop-v1`; the published Crit 8 release is
still `09233d9`. These are engineering instructions, not student reflection.

## Try it locally

From this repository run `pnpm build`, then
`PORT=8098 HOST=127.0.0.1 pnpm start`. Open <http://127.0.0.1:8098>.
Use the existing flight controls to land on your own planet. Pause → Terrain
workshop opens a separate preview. Choose Ocean, Desert, Ice or Temperate and a
whole-number seed (0–4294967295). Previewing and closing never save. Apply checks
all placed objects and only then saves the environment. Other visitors cannot apply.

Existing planets keep the original landscape until their owner explicitly applies.
The public harbour remains unchanged. There is no bulk migration or reset button.
A conflicting preview lists the buildings that would flood or lose support; Apply
stays disabled. The server repeats the check, including dense custom-blueprint
footprints, even if a request bypasses the UI. A stale planet revision asks for a
reload. An identical successful retry does not create another change.

Pause → My building history remains owner-private. It now draws the environment
that was active at the selected building event. Events before this integration
remain on the original landscape. Terrain applications themselves are not building
events and do not rewrite old snapshots. Playback cannot restore or edit the world.

## Integration contract

The deterministic environment codec, four style programs, field, mesher, kit and
RESTRICT policy are unchanged files from Claude commit `a4546bb`. The manifest
records every copied hash; no demo server patch was integrated. The main project
owns authentication, SQLite migration, transactional application and lifecycle.

Schema 9 adds nullable environment documents to planets and history rows, and
widens the ground-state radius constraint to include the generator's lower relief.
The migration backs up SQLite, runs transactionally and preserves existing rows.
Applying terrain preserves building IDs, anchors, yaw, versions and blueprints.
Seats are derived again. Current occupants must remain dry, and an aircraft inside
the expanded clearance blocks application. Ground checkpoints rebase after the
planet revision changes; the same pure field and foundation grading drive client
movement, server replay and the drawn terrain vertices.

The flight hull conservatively expands by the generator's 1.75 m maximum relief.
Takeoff stays above it and landing uses the generator's protected dry spawn area.
The existing bounded orbital-detail policy is unchanged; nearby detail regenerates
from the same saved environment, while distant worlds retain coarse proxies.

Models and texture kits are released when replacing worlds, closing previews or
evicting orbital detail. The main transparent canvas preserves destination alpha
for the source's additive atmosphere; source shaders are unchanged. The adapter
supplies the already-existing scene sun direction to the source material uniforms.

## Current limits

Water-level areas are blocked for walking; no swimming or special frozen-sea
locomotion was added. Procedural small plants/rocks are scenery, not rigid bodies.
Flight uses a conservative spherical envelope, not a per-triangle terrain hull.
The UI exposes style and seed, not every generator parameter. Terrain changes have
no separate audit timeline or undo/restore command. Physical phone performance and
public concurrent load remain untested. The build still reports the existing
650 kB chunk warning; its threshold was not changed.

See [verification and screenshots](../evidence/terrain/verification.md).
