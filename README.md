# Little Worlds

**Local Final workshop milestone:** this branch adds the server-backed assembly
workshop described in [the workshop guide](docs/integration/workshop-v1.md),
[walkable buildings and saved floor heights](docs/integration/physics-v1.md),
[private ship designs](docs/evidence/ships/verification.md),
[owner-private building history](docs/evidence/history/verification.md), and
[opt-in deterministic terrain](docs/integration/terrain-v1.md).
[Cross-module stability and loading evidence](docs/evidence/stability/verification.md)
records the bounded desktop/phone replay, deferred editors and measured first-screen resources.
[LOD R4 integration evidence](docs/evidence/lod-r4/verification.md) records the three-file
geometry update, measured main-world frame counts and its sub-millimetre window-hood difference.
[R7 village integration](docs/integration/r7-village.md) adds the shared cream, timber
and terracotta presentation, village ship parts and compatible ground collision.
The earlier [compact-world milestone](docs/integration/compact-worlds.md) introduced
a 14 m village and persisted 10–12 m new planets while protecting old layouts.
The current default public world is the 21.6 m-radius [planned main planet (v12)](docs/integration/planned-main-planet-v12.md): one authored plan drives continuous streets, 56 buildings from shared workshop compositions, gardens and plazas; the v10 town below is the previous layout.
[Sprint and jump](docs/integration/sprint-jump.md) adds hold-Shift running and
Space jumping with shared collision, server validation and saved airborne state.
[Chinese / English interface](docs/integration/bilingual.md) adds an always-available
language selector, browser-local preference and in-place translation without losing drafts.
The earlier [player-built village](docs/integration/village-density.md) established
sixteen rooms in eight legal blueprint plots using the player construction rules.
[R8 workshop](docs/integration/r8-workshop.md) added 24 parts (45 at that milestone),
three editable examples and matching quick props while preserving old saves.
[Village world v10](docs/integration/village-world-v10.md) is the current local default:
a varied continuous public town, 18 residents and 48 catalogue parts, including
residential wide doors and continuous two-cell entry stairs shared with the workshop.
[Ground camera v11](docs/integration/ground-camera-v11.md) records the local camera
repair, independent tests and bounded desktop/touch control checks. Route, mode,
performance and release verification remain pending in that record.
The published Crit 8 release remains `09233d9`. This local branch defaults to v10;
its delivery target is [localhost:8098](http://localhost:8098/). No public deployment
is included.

> Prepared with AI assistance from the student's recorded design decisions and
> the implementation evidence.

## Chinese / English

Choose **中文** or **English** at the top of the world or inside any open dialog.
The first visit follows the browser language (`zh` → Chinese; otherwise English).
An explicit choice stays in local storage; no account or database change is needed.
Changing language keeps the current world, flight, editor draft and saved progress.
Player-authored names and technical IDs remain unchanged.

## Public town and workshop examples

The default local v10 town has a 21.6 m radius, 273 counted objects
(144 buildings, 106 road objects and 23 site objects)
across 18 designed places. Its 18 residents comprise two existing task
characters, four conversational residents and 12 ambient residents. Public buildings
remain shells in the exterior world; only the existing private home has a separate
interior. The 48-part catalogue, dimensions and collisions are shared with player
construction. Private planets retain eight custom structures and 64 total objects,
and blueprints retain the 5×5 footprint, three-storey and 120-part limits.

The earlier reproducible [Garden pair](/examples/village/garden.json),
[Loft pair](/examples/village/loft.json) and [Port pair](/examples/village/port.json)
documents remain available as standard blueprint JSON. The workshop does not expose
an import button. Saved libraries and existing construction remain compatible.

The workshop's **Example → Load example** controls open a lived-in cottage, corner
lane or pad-side stall as an editable draft. Save it to your library, then place it
on your own planet. New trees, flowers and benches share the blueprint kit's exact
dimensions; previously saved quick props retain their old appearance and size.

## What good means here

Little Worlds is a small shared space for people who want to explore, make a place
of their own, and see what others have made. The intended audience is a handful
of classmates or friends in separate browsers. A good visit should leave something
recognisable behind: a chosen suit, a completed delivery, or a building on an owned
planet. Returning should recover that work. Someone else's visit should not erase it.

The core loop is walk to the harbour's ship, fly to a world, land, claim a home,
build, and revisit. Other people can explore that home but cannot edit it. Shared
presence makes the constellation feel inhabited; ownership makes experimentation
possible without asking everyone else for permission. There is no score or resource
grind. The optional courier task provides a short, complete activity before flying.

## References and choices

[Messenger by abeto](https://messenger.abeto.co/) prompted the spherical walking and
following camera. In the [authors' interview](https://www.commarts.com/webpicks/messenger),
continuous exploration and accessible navigation matter alongside the visual style.
Here, that influence becomes direct movement and nearby actions, rather than a
collection of management panels. Its code and assets were not extracted.

The student repeatedly asked for more convincing scale and materials than the early
low-poly hamlet. Official [Area18 and New Babbage imagery](https://support.robertsspaceindustries.com/hc/en-us/articles/360008085873-Locations-in-Star-Citizen)
informed the industrial harbour's depth and structure. The design also requires
player buildings to share the public district's material and geometry quality.
An impressive background alone would not meet that goal. The published kit has six
placeable kinds. This local branch also integrates the component workshop. [Asset credits](/credits/)
document original procedural work, the user's shared geometry and NASA orbital maps.

## Promises and their limits

Server checks enforce one home per browser identity, owner-only editing, valid
placements, stale-edit rejection and idempotent writes. SQLite stores character,
delivery, ownership, buildings and travel state. Tests exercise permissions,
repeated requests, movement boundaries and database reopening. Visible visitors
receive saved changes through one-second polling; ground presence expires when
people leave. This is a bounded shared world, not a public-scale concurrency claim.

A random browser cookie identifies a visitor. Clearing it loses access to the owned
home; there is no account recovery or cross-device identity. Save failures are
shown, and travel freezes until acknowledged state is recovered. Chat, trading,
combat and ship interiors remain outside this milestone. This local branch adds
owner-private building history and opt-in terrain; the published release does not. Assembly uses a bounded 5 × 5 × 3 grid with 120 parts per blueprint.

Camera comfort, readable routes and a consistent visual language require judgement.
Agent-run Chrome journeys and screenshot review informed changes; they are not a
user study. Hosted Chrome checks at 1920×1080 and 390×844 verified both core loops,
visitor permissions and saved state across redeployment. Physical phones and public
load remain untested. [Verification](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/evidence/crit8-live/verification.md)
records the interrupted test-driver attempt and successful focused replay.

## Play and release status

Walk with WASD/arrows or the touch stick; use E or nearby buttons to interact.
Escape opens Pause, M opens the Atlas, and the harbour path leads to the two boarding lanterns.

[Course Fly site](https://comp4020-final-ray0766.fly.dev/) ·
[Source repository](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766) ·
[Build and deploy status](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/workflows/checks.yml).
The hosted Crit 8 release `09233d9` remains within the existing course allocation.
Its hosted checks cover walking, delivery, flight, building, visitor permissions
and durable saved state. Source and local gameplay checks for this v10 branch are
recorded in [the v10 integration evidence](docs/integration/village-world-v10.md).

For local use, install Node 24 and pnpm 11, then run `pnpm install`, `pnpm build`
and `pnpm start`. Open http://localhost:8080 and `/readme/`.
See `docs/player-guide.md` for controls and `PROCESS.md` for the engineering record.
