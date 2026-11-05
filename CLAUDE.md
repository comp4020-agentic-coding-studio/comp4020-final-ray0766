# Little Worlds development rules

These are the current engineering rules for the goals in [README](README.md#what-is-enforced-and-what-needs-judgement): what the app must never do, what every screen must hold to, and what a change must not break. Earlier prototype and R3–R8 decisions remain in [ADRs](docs/adr/) and [integration records](docs/integration/); their dates, versions and then-unfinished work are historical, not a second current specification. Directories, ports, release approvals and other operational history live in the [working baseline](docs/integration/working-baseline.md). Follow the user's later explicit instructions within their stated scope.

## The idea these rules protect

README defines good as a contribution that survives your departure, a visit that cannot damage what it finds, and travel that takes less attention than enjoying the place. Every rule below serves one of those, and the named checks in [spec/](spec/) test them:

- **It survives.** Persist before acknowledging, in transactions with revisions and idempotent retries; a failed save keeps a recoverable draft or acknowledged position, never a false success (`save-progress`, `home-owner-access`).
- **A visit cannot damage it.** Identity and permissions are derived on the server; each identity owns at most one planet, and visitors can neither build there nor enter its room. Gate travel grants no rights (`home-owner-access`, `teleport-station`).
- **Travel asks little.** Journeys are chosen, not driven: versioned server trips, automatic takeoff and landing, walking without jumping, explicit safe-ground recovery (`auto-trip`).
- **Choices are explicit.** Character creation is mandatory and Save/Cancel protect appearance; no AI is enabled silently (`first-character`, `appearance`).
- **Claims are honest.** Loading, retries and evidence say what was measured; nothing is relaxed to make a check pass.

## Working rules

- Work on the directory and branch named in the working baseline.
- Inspect the working tree before editing; preserve unrelated changes, old worktrees and archives.
- Do not restore discarded cameras or overwrite the independent Claude source workspace.
- Use isolated test databases for development and browser checks; never substitute an empty or sample database for a real save, and never change the frozen local release or its save without a task that explicitly authorises it.
- Keep commit, branch push, production deployment, migration and submission permissions separate: each release needs its own approval naming the intended external action, and a completed release authorises neither the next one nor production AI.
- Do not read or change credentials for unrelated product work.
- Preserve the course deployment contract: the two HTTP invariants, one shared-cpu-1x / 256 MB machine and one `/data` volume in `fly.toml`.

## A coherent shared place

- Preserve the compact village, connected walkable routes, reusable workshop kit, home interiors and optional public delivery activity.
- No player-to-player chat, trade, economy, combat or large quest system.
- New identities enter the public harbour while their home prepares; old identities without a home retain their state and receive the existing flight/claim/build guidance.
- A manually claimed home must not become a second home.

- Use automatic travel between fixed planet slots; Atlas choices require confirmation before changing an active trip.
- Skip/return use a versioned server trip and prepare the destination before arrival.
- Boarding requires the server-saved port proximity.
- Any outdoor teleport gate can return its traveller to the public planet or their own home, including a visitor at another owner's gate.
- Destination identity, saved proximity and visit epochs remain server-authoritative; gate travel grants no building or private-room rights.
- Preserve near/slow landings, journey/sequence fences, bounded flight and collision checks.
- Temporary craft and return beacons are travel scenery, not placed owner objects.
- Ship designs, owner-private history and opt-in terrain are existing features, not reasons to build a competing editor.

## Movement and readable views

- Share `GroundWorld`, stable part IDs, radii and anchors between rendering, client prediction and server validation.
- Keep unit radial directions, orthogonal tangent frames at poles, independent saved height, legacy airborne saves and natural falling.
- Characters cannot jump; only sprint is accepted in movement flags.
- Explicit safe-ground recovery is server-selected, planet/visit/sequence-fenced and affects only the requesting character.
- Ordinary walking is 3 m/s and sprint is 4.8 m/s.
- Do not shrink the capsule, weaken speed/collision checks or accept client height/velocity to make a test pass.
- Bump the shared physics version when collision semantics change and fence old movement batches.

- Desktop relative mouse look must start with an explicit gesture and release for Esc, menus/editors, hidden pages and focus loss.
- Never auto-recapture; retain touch dragging and the unsupported-browser fallback.
- Keep bounded pitch and camera-relative movement on the sphere.
- Flight is chosen, not driven: the player picks a destination and confirms a new one by clicking a planet. Skip shortens the journey but still waits for the server to prepare the destination before arrival; Cancel returns to departure. No manual driving or visible flight routes remain, and guide ground routes are separate.
- Dedicated trip receipts fence destination changes and prepared arrivals; never weaken ordinary checkpoint validation.
- Frame actual distant destinations as well as nearby ones; keep coarse rendering and detail cache budgets bounded.
- Validate the user’s actual reported saved origin in an isolated fixture, inspecting pixels as well as frustum counts.
- Preserve the accepted outdoor camera.
- Every indoor entry/restoration uses the existing home-room fixed 2.5D projection; do not offer perspective/follow-orbit switching indoors or restore old camera preferences.
- Release mouse capture on entry and restore the outdoor bearing on exit.
- Room/photo rendering changes must restore temporary clipping and leave geometry, physics and saved data intact; do not reactivate the unused v11/cutaway/certification route.
- Validate close and overview views, occluded labels, doors, stairs and destination readability at desktop and narrow widths.
- A new reported obstruction needs its own reproducible fixture; passing representative buildings does not prove all user blueprints safe.
- Source-of-truth dimensions and versions live in code, not old milestone prose.

- Outdoor and arrival observation start at `INITIAL_OUTDOOR_PITCH` (-0.12 radians) without repeatedly recentering free look.
- In building mode, fit the planet into the visible area beside/above the controls; clear that offset on exit.
- On narrow screens, folding the catalogue must retain the draft, placement controls and keyboard focus.
- For Find ship, try a nearby proved port connector before a distant home-route join; preserve the existing 4ms/six-new-connector budget and refuse unproved edges.
- Reusing an identical support query must preserve every resulting pose, not change collision semantics.
- The [repair and verification record](docs/integration/usability-fixes-20261026.md) covers these.

## Identity, persistence and observation

- Derive identity and permissions on the server.
- Each identity owns at most one planet; only its owner can build, enter/edit its room and read its history.
- Public geometry and nearby exterior door operation remain shared.
- Room layout descriptions are not confidential storage.
- Anonymous cookies are not real-world identity, cross-device login or an account-recovery system.

- Persist before acknowledging to `DATABASE_PATH` (local `.data`, container `/data`).
- Use SQLite transactions, ownership constraints, revisions, idempotent retries and placement/capacity checks.
- Append history with the authoritative write; import older objects as a labelled baseline, never fabricated events.
- Terrain stays opt-in and respects existing buildings.
- Back up SQLite before an authorised migration; preserve saved coats, quests, positions, buildings, ships and history.
- Never commit databases, cookies, tokens or private configuration.

- Ground/flight save feedback follows the captured batch: stale acknowledgements cannot clear newer movement.
- Failed saves freeze/rebase to acknowledged state.
- Blueprints, ship designs and rooms are explicit-save drafts; retain failed drafts and protect dirty-room leave/reload until acknowledgement or explicit discard.
- Only the server changes delivery state, with saved proximity and idempotent actions.

- Presence is ephemeral, planet/mode scoped and never grants authority.
- Business observation uses stable pseudonyms, allowlisted actions and accepted/refused outcomes; never log names, designs, request bodies, cookies, tokens or internal identity/session hashes.
- Preserve bounded rotation, sampling and stdout, as specified in [ADR 0009](docs/adr/0009-business-observation.md).

## Honest loading and accessible interaction

- Keep bounded, deduplicated preparation on the worker; failures use explicit retry/backoff, never synchronous heavy fallback on the request thread.
- Flight detail uses one bounded initial corridor wait, directional prefetch and a capped reusable cache; subsequent preparation must keep coarse worlds and controls usable.
- Retain truthful progress, explicit retries and quality-dependent resource bounds.
- Do not preload the whole universe or weaken server flight validation to improve a timing result.
- Arrival acknowledgement is distinct from home readiness.
- Do not reset identity or saved progress to disguise a loading failure.

- Retain Smooth/Standard/Beautiful and Auto, manual preference priority, the Retina pixel budget and the approved device notice before modules load and throughout welcome/error states.
- Do not invent a GPU minimum, percentage or completion state.
- An opening visual must use our main-world assets/render and must not initialise a second full world.
- Preserve retries, a usable quality choice, visible focus, keyboard/modal operation, touch controls, Chinese/English selection and reduced motion.
- English is the default before and after modules load when no valid explicit language choice is saved, regardless of browser language.
- Preserve an explicit saved Chinese choice and live language switching.
- Translate host UI in place without changing drafts or user-authored names.

## Guide and optional AI

- Sprout is stationary local scenery while optional left-side help or the independent right-side chat is open; keep the world visible on narrow screens.
- The existing eligible Space interaction opens both help and chat together, without stealing editable/control keyboard input.
- Esc only releases mouse capture, including with dialogs open; use explicit close controls.
- Tab opens Pause only from eligible game-scene focus; preserve Tab/Shift+Tab navigation in every UI and consume the opening key until release.
- Destination choices draw only validated walking routes and never move the guide/player.
- Find ship is one destination in that guide; do not restore a duplicate menu marker.

- No external AI may be silently enabled.
- Production requires explicit `GUIDE_AI_DEPLOYMENT`, the expected Fly app and an existing `/data/guide-ai/trial.sqlite` ledger; never create a replacement budget or reset the ledger.
- Keep visible disclosure and an explicit Send to DeepSeek action, and send only the current question and public instructions.
- Persist atomic per-identity rolling 8/hour reservations and the shared US$1 budget before calling the pinned official endpoint; never retry upstream automatically, and unknown charges keep their conservative reservation.
- Keep keys server-only and out of logs, source, browser bundles and evidence.
- The trial deadline is 1 January 2027 00:00 Australia/Sydney, not a price guarantee: price future calls at twice the verified peak rates, preserve historical charges and the US$1 cap when migrating the one recognised legacy policy, reject unknown policy changes, and never describe future supplier billing as guaranteed.
- Every valid free-text submission belongs to the AI endpoint: never route it through keyword help or replace an interrupted model reply with fixed text.
- Show disabled, disconnected, limited and failed states honestly, retain the input/partial answer, and keep fixed topic help in a separate expandable section.
- General conversation may use model knowledge; undocumented game behaviour must remain uncertain, and the model has no state-changing tools.

## Assets and provenance

- Keep `src/assets/claude-geometry` byte-identical to its committed provenance manifest.
- Adapt materials, translation, rendering and independent collision proxies outside it.
- Preserve pinned resource URLs and older releases; do not mix transcoder versions or apply a source demo's display lift to actual placement.
- Public and private construction share the same material/geometry language.
- Keep the bounded remote-avatar budget and the existing medium practical-light budget: two point and two spot slots, without light shadows.

- Use original or documented licensed assets.
- [Messenger](https://messenger.abeto.co/) is a composition/navigation reference, not a source of copied code, branding, shaders, models, audio or textures.
- Keep the approved NASA maps credited and follow [ASSET-CREDITS](ASSET-CREDITS.md).

## Verification and claims

- Keep both course HTTP invariants.
- Run applicable focused regressions, typecheck, lint, build and evidence checks; the full default `app` + `legacy-http` suite is a separate release gate.
- [spec/README](spec/README.md) explains the isolated legacy server and the separately runnable unused camera tests.
- Do not delete tests or loosen production contracts to hide a faulty fixture or driver.
- The gate caps test-file concurrency at two, retains every existing deadline and keeps legacy HTTP sequential.
- Close each fixture's stores and workers before removing only its own registered temporary directories.
- Preserve failed runs and explain repairs; report each release's test counts separately rather than merging them.

- Browser validation must show rendered pixels and real keyboard/touch interactions, including desktop/narrow layouts and relevant slow-network/disconnection recovery.
- Report exact tested source, viewport, browser and limitations; CI, emulated phone viewports and short samples do not prove physical-phone performance, arbitrary blueprints or public-load capacity.
- Evidence paths in README map goals to checks, not blanket claims that every check just ran.

- Do not invent student reflections, personal positions, playtest feedback, citations, performance improvements or release results.
- Keep human reports, repeatable technical checks and deployment confirmation distinct; an author-confirmed human exercise is not reopened as missing because automated evidence differs from it.

## Character appearance

- Character appearance is a finite versioned option record in `player_appearances`, not arbitrary geometry or uploaded assets.
- Validate all enum fields and ownership on the server; use an expected appearance revision and transactional, idempotent saves.
- Cancel must not write.
- Use the unified new traveller renderer.
- Preserve legacy progress and raw appearance rows; normalise retired model values on read.
- Only newly created integrated identities receive an incomplete `appearance_onboarding` row; complete it atomically with an explicit appearance save and reject gameplay POSTs until complete.
- Never use localStorage as authority or force existing users through creation.
- Keep shared procedural geometry/materials and the existing four detailed outdoor visitor budget; do not increase it for customisation.
- Keep the editor preview lazy-loaded, and give incomplete first creation a clear resume/leave path.

## Accepted limitations

- The author has accepted abrupt walking-room wall cutaway and same-position traveller occlusion as known visual limitations; neither was repaired.
- Do not reopen their redesign or call them fixed; retain boundary/collision checks and the separate home editor view.
- Historical prototype controls and unused experimental modules are not current player instructions.
