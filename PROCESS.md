# Process — Little Worlds, Crit 8 candidate

> AI-assisted account based on recorded instructions, commits and executed
> checks. Implementation, automated tests and browser captures were performed by agents;
> they are not claims that the student personally wrote or executed them.

## Direction and the current definition of good

The project began as a Messenger-inspired spherical courier prototype: continuous
walking, a following camera, two NPCs and one saved delivery. The student then
chose a different central activity: claim an empty planet, build a home and visit
other people's worlds without changing their work. That direction is implemented
in [733c543](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/733c543).
The courier remains an optional introduction rather than the whole project.

The working definition of good is a readable journey that leaves a durable,
recognisable contribution. Ownership and visits support that definition together:
people can encounter others' work while retaining control over their own. A browser
identity counts as a participant, with the explicit cost that lost cookies mean
lost ownership access. No real-world identity or account recovery is promised.

Messenger's live experience and its authors' interview grounded movement and camera
choices. Subsequent student feedback rejected the early miniature, low-poly look
as insufficient for the intended scale. Official city reference images informed
layered streets and mechanical structure. The stronger constraint was that players'
buildings must share the public scenery's quality. The references and limits are
recorded in [ADR 0006](docs/adr/0006-shared-city-assets-and-display-scale.md), not treated
as permission to copy commercial assets. Broader research into small shared spaces
remains a gap in the argument, rather than reading falsely attributed to the student.

## Stack and trade-offs

The implementation uses TypeScript, Three.js and Vite in the browser, with Node 24's
HTTP server and built-in SQLite on the backend. Three.js permits a custom surface
controller and camera without adopting a complete game engine. A small DOM interface
avoids a separate UI framework; the cost is explicit management of focus, dialogs,
input modes and state synchronization. TypeScript shares geometry and request types,
but server validation remains necessary because browser requests are untrusted.

SQLite fits the course's single machine and persistent `/data` volume. Transactions,
constraints and version checks protect ownership and edits. Built-in SQLite avoids
native-addon compilation; the runtime version remains a deployment dependency.
A JSON save file would require more custom recovery and concurrency handling. A
separate database service would add operational scope beyond the course allocation.
These choices and their original constraints are in [ADR 0001](docs/adr/0001-local-prototype.md)
and the initial implementation [c02a639](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/c02a639).

One-second polling supplies saved world changes and short-lived ground presence.
It is sufficient for this bounded prototype and keeps the server simple; it does
not prove capacity under a public crowd or unreliable networks. Presence contains
scoped ephemeral identifiers and never grants building rights. A persistent
connection may become useful later, but changing transports would not replace
permission checks or conflict handling. [705cc35](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/705cc35)
records the current presence and physical-port implementation.

## Directing and correcting agent work

The student supplied the interaction references, redirected the central loop,
challenged the visual scale and separated the independent Claude workshop from the
main playable system. Codex implemented and checked the main repository. The
workflow used concrete acceptance journeys, small recorded commits, browser
inspection and server tests. It preserved the course repository lineage and kept
Crit 7 and the cancelled earlier implementation outside the work.

An early rendered canvas was blank because a temporary Object3D and the camera
used opposite forward conventions. The correction changed the pose object and
required checking visible world content, not merely canvas existence. A separate
turning defect prevented reversal when opposite headings were blended; signed
angular rotation and a regression check replaced that approach. Both corrections
appear in the initial commits and now constrain `CLAUDE.md` and `spec/`.

Flight introduced saved journeys and sequence numbers, proximity-limited landing
and frozen recovery after failed saves. Tests use bounded motion and real travel
controls rather than a production teleport shortcut. [f590257](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/f590257)
and [ADR 0004](docs/adr/0004-continuous-flight.md) record that change. Existing coats,
quests and object transforms were retained across migration and restart checks.

The latest city changes separate public display scale from durable spherical
coordinates. This preserves old saves while showing a broader district. Thirteen
unchanged geometry dependencies were copied from a verified commit of the student's
independent Claude workspace, with per-file hashes and provenance. The editor,
blueprint persistence, terrain, timeline and ship-design modules remain separate.
The six existing placeable kinds reuse the shared asset layer; seventeen exported
resource types do not imply seventeen editable building tools.

This distinction matters for acceptance: a showcase image cannot establish that an
object is editable, saved or available in the deployed system. Integration needs
its own schema, ownership and resource-lifecycle checks. The current Crit 8 candidate
therefore freezes features rather than treating the separate demos as shipped.
[103a7ff](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/103a7ff)
is the latest application implementation.

## Evidence and remaining release work

Round 6 records lint, TypeScript, 25 logic/HTTP/course tests and production build
success. The complete Chrome run passed 19 of 21 cases; two delivery cases exposed
an early arrival label. After aligning the label with interaction availability,
seven focused headed replays passed. All scenarios have passing evidence across
runs; this is not a single all-green full-suite result. The same round repaired
a final paused-position flush and walking at the expanded south pole.

[Round 6 verification](docs/evidence/round-6/verification.md) links screenshots and
failed-run evidence. Its desktop performance captures were 1600×1000; the phone
viewport was 390×844 on a Mac, not a physical phone. Final hosted acceptance must
use the course's 1920×1080 and 390×844 sizes. A startup comparison preserved all
rows in five existing tables. Earlier container restart evidence remains separate
from this round; hosted persistence has not yet been established.

The student approved public release of the complete repository history and revised
the reflection to begin with topic selection. Publication, CI and Fly deployment
are being carried out as explicit release steps, not inferred from local success.
This overview replaces the accumulated chronology; earlier accounts remain in Git
history. Fresh preparation results are in [the preflight record](docs/evidence/crit8-preflight.md);
hosted results will be recorded separately without rewriting earlier evidence.
