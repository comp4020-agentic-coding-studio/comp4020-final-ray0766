# Little Worlds process

AI-assisted account. Earlier personal camera observations were approved by the author; the Crit10 reflection draws on the author's Chinese response on 20 October. Technical updates below are linked to repository evidence and are not additional claims about the author's experience.

## Direction and framework choices

Little Worlds began as a Messenger-inspired spherical courier prototype, with walking, a following camera, NPCs, and a saved delivery. I changed its main activity to claiming a planet, building a home, and visiting other people's worlds without changing their work. The courier became an optional introduction in the home-building change ([733c543](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/733c543)). This gave players a persistent contribution to return to and share through visits.

The browser uses TypeScript, Three.js, and Vite. Three.js supports a custom surface controller and camera without a complete game engine. A small DOM interface avoids another UI framework, at the cost of managing focus, dialogs, and input modes explicitly. Shared types help the client and server agree, but requests still require server validation.

Node 24's HTTP server and built-in SQLite fit the single small Fly machine and persistent volume. Transactions and constraints support ownership and saved edits. The built-in database avoids native-addon compilation, although Node becomes a deployment dependency. JSON saves would need custom recovery and concurrency handling; another database service would add operational scope. [ADR 0001](docs/adr/0001-local-prototype.md) records these choices.

## References and AI workflow

[Abeto's Messenger](https://messenger.abeto.co/) provided a reference for movement and spatial density. The [creators' interview](https://www.commarts.com/webpicks/messenger) describes using a sphere to avoid invisible boundaries and limiting controls for less experienced players. Earlier city-image references and their limits are in [ADR 0006](docs/adr/0006-shared-city-assets-and-display-scale.md). Design references are separate from the provenance of integrated modules. Broader research into small shared spaces remains a gap.

I wanted a dense planet with different areas having their own design. Adding objects reduced empty space but introduced repetition. Claude implemented geometry and [layout planning](docs/integration/planned-main-planet-v12.md), starting with roads and plazas before arranging plots. Object count alone cannot establish spatial quality. The workshop follows the shared design source, with a dedicated terminal approved as an exception.

Codex worked on the main repository, while Claude's separate workshop supplied reusable modules. Integration required adapters, persistence, and permissions; a demonstration was not evidence of availability in the playable game. The canonical branch is `integration/midpoint`. The Crit9-to-Crit10 comparison ([60d54ae...3d9a1b1](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/compare/60d54ae...3d9a1b1)) preserves the integrated sequence, including arrival, quality, Retina, and loading-message work, without reimporting abandoned camera experiments.

## Rules and observation

An anonymous browser cookie identifies a person. The server restricts building edits, room entry/editing, and history to the owner; nearby visitors share outdoor space and may operate exterior doors. Room descriptions are currently visible to visitors, so “private” means owner-controlled entry and editing, not confidential layout data. [The permission matrix](docs/crit10/permissions.zh-CN.md) records this distinction and the lack of identity recovery.

Teleportation remains limited to the user's home and harbour ([ADR 0007](docs/adr/0007-teleport-stations.md)); other journeys require flight. Saved flight uses sequence numbers, proximity checks, and recovery after failed saves. NPC dialogue is fixed text, without a runtime language-model dependency.

The business observation change ([6d19175](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/6d19175)) added stable observation aliases, accepted/refused outcomes, and bounded journals beside SQLite. Aliases cannot authenticate requests. Logs exclude cookies, internal identity hashes, free-text bodies, and room designs. Rotation and five-second sampling limit storage and traffic; they also prevent reconstructing every movement or counting every refusal. [ADR 0009](docs/adr/0009-business-observation.md) explains the tradeoff.

Corrections made the evidence more precise. Room/door logging ([45584f8](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/45584f8)) records actual door results rather than request intent. The arrival retry correction ([3d9a1b1](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/3d9a1b1)) replaces `api.unknown` with `arrival.retry_requested`; acceptance does not assert that background preparation finished. Four new assertions failed before the mapping change, then all ten focused log tests passed using temporary databases.

## Camera correction and personal review

During my own play, approaching a wall could make the camera look towards the sky. I requested several changes, but some made the result worse. I returned to a better camera version, kept its indoor switching, and focused the correction on unwanted upward movement near walls.

This changed the division of work. I had previously left decisions and testing too fully to AI. I now use AI for technical verification and judge the visual result through my own play. Finite positions or successful transitions do not establish a comfortable view. Further changes need a specific problem and an appropriate stopping point.

A separate collision test incorrectly selected `bodies[0]` after a tower was added. Its repair ([76e95f0](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/76e95f0)) selected the intended object by ID while retaining the assertion and physics implementation. Injecting a genuine failure confirmed that the check detected its target behaviour.

## Loading and responsiveness

Synchronous heavy computation delayed unrelated requests. A bounded worker now prepares expensive results, rechecks state, and applies database writes transactionally. One recorded half-CPU comparison reduced an observer's delay during another player's first teleport from 3,978 ms to 29 ms. This is a local measurement, not a hosted guarantee; the initiating player still waits and the worker costs memory. [Crit9 verification](docs/evidence/crit9-realtime/verification.md) records the limits.

Durable arrivals ([04e688f](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/04e688f)) let newcomers enter the harbour while home preparation continues. Retina rendering ([a443c5e](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/a443c5e)) reduced unnecessary pixel and antialiasing work. The opening notice ([acb888c](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/acb888c)) keeps the author's bilingual device guidance visible even before the main module loads. It recommends Smooth quality and acknowledges network/browser failures without inventing a minimum GPU.

A post-deployment check also found that Vite removes the entry script's HTML ID, so the existing module-failure Retry button stayed hidden. The [cec70b5](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/cec70b5) correction uses module attributes, with failing-then-passing tests and checks against actual built HTML. This was a concrete limit of the earlier source-only preview.

## Release and evidence boundary

[Release checks](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/workflows/checks.yml) tie validation and deployment to a commit. Production backup must pass integrity, foreign-key, and independent checksum verification before release. Existing storage and identities are preserved; test databases are never deployed as production. The [Crit10 record](docs/crit10/README.md) distinguishes code checks, release confirmation, and user-reported play.

The author reports that classmates played and the site ran normally. No dated action sequence or matched log excerpts were supplied, so the record does not invent them. The [reflection](reflections/crit-10.md) identifies smoother loading as the breakthrough and a future process of forming an idea, preparing a reference, then asking AI to implement. Automated checks do not replace the classroom log narration or establish physical-phone performance.
