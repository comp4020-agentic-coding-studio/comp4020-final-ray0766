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
[Compact worlds](docs/integration/compact-worlds.md) restores a 14 m public village,
persisted 10–12 m new planets and protected old layouts.
[Sprint and jump](docs/integration/sprint-jump.md) adds hold-Shift running and
Space jumping with shared collision, server validation and saved airborne state.
[Chinese / English interface](docs/integration/bilingual.md) adds an always-available
language selector, browser-local preference and in-place translation without losing drafts.
[Player-built public village](docs/integration/village-density.md) adds sixteen rooms in eight
legal blueprint plots, with the same catalogue, dimensions and collisions used by players.
The published Crit 8 release remains `09233d9`; these changes are not deployed.

> Prepared with AI assistance from the student's recorded design decisions and
> the implementation evidence.

## Chinese / English

Choose **中文** or **English** at the top of the world or inside any open dialog.
The first visit follows the browser language (`zh` → Chinese; otherwise English).
An explicit choice stays in local storage; no account or database change is needed.
Changing language keeps the current world, flight, editor draft and saved progress.
Player-authored names and technical IDs remain unchanged.

## Public village examples

The local public village uses 8 ordinary blueprint structures and 56 quick-build
props, within the existing limits. Its three reproducible documents are
[Garden pair](/examples/village/garden.json), [Loft pair](/examples/village/loft.json)
and [Port pair](/examples/village/port.json). These are standard blueprint JSON;
the current workshop does not yet expose an import button. The part grid, saved
library, placement and collision rules are the same as player construction.

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
The release is deployed within the existing course allocation. Hosted checks cover
walking, delivery, flight, building, visitor permissions and durable saved state.

For local use, install Node 24 and pnpm 11, then run `pnpm install`, `pnpm build`
and `pnpm start`. Open http://localhost:8080 and `/readme/`.
See `docs/player-guide.md` for controls and `PROCESS.md` for the engineering record.
