# Round two — local implementation and visual verification

Date: 2026-10-05, Canberra. Branch: `prototype/small-world-c8`.
Workspace: `/Users/ray/Documents/Codex/2026-10-05/task-2/comp4020-final-ray0766`.

## What changed

The live Messenger was observed in the user's Mac Chrome, including its opening
dialogue and close play camera. See [direct observation](reference-observation.md)
for the limited scope of that comparison. Only the rendered experience was used;
no reference models, textures, shaders, sounds or source were extracted.

- Replaced the distant default view with a closer following camera and mild
  movement look-ahead; retained a selectable distant planet view.
- Built an original postal street with cottages, a glasshouse, connected paths,
  pond crossing, windmill, lamps, benches and planting. Added gentle terrain
  variation, toon lighting, selected edge outlines and layered sky colours.
- Rebuilt the courier with articulated limbs, a satchel, cap, face, gait,
  blinking, parcel-holding pose and greeting. Nearby NPCs turn toward the player.
- Reduced the persistent interface, added contextual dialogue and an off-screen
  destination marker for narrow views. Added a coarse occlusion silhouette.
- Merged static opaque geometry by material and static outline segments. Dynamic
  characters and the windmill remain separate; windmill rotation uses elapsed time.

The server implementation, identity, database schema and quest contract are
unchanged from the verified first prototype. Existing saved visits remain valid.

## Executed checks

| Check | Observed result |
| --- | --- |
| `pnpm lint` | Pass |
| `pnpm check` | Typecheck and 4 test files / 9 tests pass |
| `pnpm build` | Pass; JS 579.26 kB, gzip estimate 149.46 kB; CSS 14.91 kB |
| `pnpm check:evidence` | Pass mechanically; student writing remains incomplete |
| `pnpm test:browser` | 8 Chrome tests pass, approximately 1.2 minutes |
| Visible Mac Chrome | Rendered desktop and 390 × 844 walking/planet modes inspected; temporary viewport reset |
| `docker build -t little-post:c8-v2 .` | Pass with frozen dependencies, Node 24-slim |
| `APP_URL=http://127.0.0.1:8081 pnpm check` | Same 9 tests pass against the container |
| `APP_URL=http://127.0.0.1:8081 pnpm test:browser` | All 8 tests pass in 58.6 seconds |
| Concurrent request replay | Five pickup and five delivery requests preserve exactly one delivery |
| Real container restart | Same cookie restores full state: sky coat, delivered, deliveries = 1 |
| Container memory sample | 39.59 MiB / 256 MiB with one CPU; one idle sample, not a load test |
| Image size sample | 85,521,146 bytes |

The first verification request immediately after `docker restart` raced server
readiness and received a closed socket. Retrying after the server started passed
full state equality; it was not a lost-state or quest-transition failure.

Browser journeys use real keyboard and Chrome touch events through the visible
UI. Both sizes choose Fern, walk to Mica, collect, verify and close the dialogue,
reload while carrying, reach Sol, deliver, verify the dialogue, close the browser
context and restore its cookie in a new context. The returned visit retains Fern
and completion. Separate checks exercise offline/reconnect, reduced motion,
resizing, modal Escape, north-pole crossing, reversal, click-to-walk, and both
camera transitions. No test teleport or quest bypass endpoint was added.

## Rendering measurement

Raw timing records are in [desktop-render-sample.json](desktop-render-sample.json)
and [phone-render-sample.json](phone-render-sample.json). These are short stationary
samples after switching both camera modes, collected in installed Chrome 154 on
this Mac. Device-pixel ratio is 1; the phone case changes the viewport, not the
hardware. They are evidence, not a frame-rate pass threshold or a physical-phone
performance guarantee. The live preview caps device-pixel ratio at 1.8.

| Final container-served sample | Mean FPS | Median / p95 frame ms | Draw calls | Triangles |
| --- | --- | --- | --- | --- |
| Desktop 1920 × 1080 | 60.0 | 16.7 / 16.8 | 441 | 101,350 |
| Phone viewport 390 × 844 | 59.6 | 16.7 / 16.8 | 321 | 96,042 |

Each sample lasted about 2.5 seconds. These renderer counters include work for
the shadow pass. An earlier local-server sample measured 59.2 / 60.0 FPS;
the raw JSON files retain the final container-served run above.

## Screenshots and comparison

| View | Previous prototype | This round |
| --- | --- | --- |
| Desktop 1920 × 1080 | [Before](before-desktop.png) | [After](after-desktop.png) |
| Phone 390 × 844 | [Before](before-mobile.png) | [After](after-mobile.png) |
| Desktop delivery | [Before](before-delivery.png) | [After](after-delivery.png) |
| Phone delivery | — | [Dialogue and completed task](after-mobile-delivery.png) |
| Planet mode | — | [Desktop](desktop-planet.png), [phone](phone-planet.png) |

Before images are preserved from the first round (`b70a53a`). After images are
captured by the current real-browser tests and inspected as rendered images.
They show original prototype art, not copied Messenger assets. Different moments
of the animated scene may move shadows, birds and character poses slightly.

## Remaining boundaries

This is an improved local prototype, not a claim of Messenger's production
quality. Bespoke illustrated models, richer environmental variety and camera
comfort need further design/playtesting. The silhouette helps find an occluded
player but does not implement camera collision; props can still enter the view.
Phone hardware and deployed performance are untested. Pole math covers both
poles; browser traversal explicitly covers north. No multiplayer, construction,
extra quests, C10 logging or new account-recovery system was added.

Student-authored design/research argument, PROCESS argument and Crit8 reflection
remain unfinished. No personal academic views or feedback were invented. No
push, public repository change, Fly deployment or course submission occurred.
Those steps and any hosting charges require the user's specific approval.
