# Little Worlds process

AI-assisted account approved by the author.

## Direction and framework choices

Little Worlds began as a Messenger-inspired spherical courier prototype, with walking, a following camera, NPCs, and a saved delivery. I changed its main activity to claiming a planet, building a home, and visiting other people's worlds without changing their work. The courier became an optional introduction in the home-building change (`733c543`). This gave the project a persistent contribution that players could return to and share through visits.

The browser uses TypeScript, Three.js, and Vite. Three.js supports a custom surface controller and camera without requiring a complete game engine. A small DOM interface avoids another UI framework, at the cost of managing focus, dialogs, and input modes explicitly. Shared TypeScript types help the client and server agree, but requests still need server validation.

Node 24's HTTP server and built-in SQLite fit the single small Fly machine and persistent data volume. SQLite transactions and constraints support ownership and saved edits. Its built-in version avoids native-addon compilation, although the Node version becomes a deployment dependency. A JSON save file would need custom recovery and concurrency handling; a separate database service would add operational scope. These choices are recorded in [ADR 0001](docs/adr/0001-local-prototype.md).

## References and AI workflow

[Abeto's Messenger](https://messenger.abeto.co/) provided a reference for movement and spatial density. The [creators' interview](https://www.commarts.com/webpicks/messenger) describes using a sphere to avoid invisible boundaries and limiting controls with an automated camera to help less experienced players. These are concrete reasons to keep navigation readable. Earlier city-image references and their limits are recorded in [ADR 0006](docs/adr/0006-shared-city-assets-and-display-scale.md). Design references are separate from the provenance of integrated project modules. Broader research into small shared spaces remains a gap.

I wanted a dense planet with different areas having their own design. Early versions had large empty areas. Adding objects improved density but introduced repetition. Claude implemented new geometry and [layout planning](docs/integration/planned-main-planet-v12.md), starting with roads and plazas before arranging plots. Object count alone cannot establish spatial quality. The workshop follows the shared design source, with a dedicated terminal later approved as an exception.

AI assistants performed implementation and technical checks. Codex worked on the main repository, while Claude's separate workshop supplied reusable modules. Integration required adapters, persistence, and permission checks; a separate demonstration was not evidence that its features were available in the playable game. Recorded source snapshots also made it possible to distinguish reused modules from host changes.

## Rules that preserve the game

Each user has one home world and can independently enter their own house. Other players cannot enter that private interior. Ownership therefore needs enforcement on the server as well as visible interface rules. Browser identity remains a limitation: losing its cookies can mean losing ownership access.

Teleportation was narrowed from all visited planets to the user's home and the main planet ([ADR 0007](docs/adr/0007-teleport-stations.md)). Other journeys still require flying. Saved flight uses sequence numbers, proximity-limited landing, and recovery after failed saves, as recorded in [ADR 0004](docs/adr/0004-continuous-flight.md). This keeps travel meaningful while making home convenient to reach. NPC dialogue is fixed text, without live language-model calls, keeping this interaction predictable and avoiding another runtime service.

## Camera correction and personal review

During my own play, approaching a wall could make the camera look towards the sky. I requested several changes, but some made the result worse. I returned to a better camera version, kept its indoor switching, and focused the correction on unwanted upward movement near walls.

This changed the division of work. I had previously left decisions and testing too fully to AI. I now use AI for technical verification and judge the visual result through my own play. A test can establish that positions remain finite or that a transition occurs. It cannot decide whether the view is comfortable or shows the relevant part of the scene. Indoor switching and near-wall behaviour need to be reviewed together.

The current camera has received that direct review. Further changes need a specific problem to solve. Restoring every detail of an older version or repeatedly revising acceptable behaviour would risk losing useful features. Testing should have a clear target and an appropriate stopping point, rather than becoming unlimited correction.

## Isolating expensive server work

A performance investigation found that synchronous heavy computation could block the server. One player's expensive operation delayed unrelated requests from others. On the single-machine deployment, this was a shared responsiveness problem.

The latest local correction moves heavy computation into one worker with a bounded queue. State is checked again before results are applied, and database writes use transactions. The worker's JavaScript is compiled in advance. The queue limits accumulated work, revalidation handles state changing while a job waits, and transactions keep related writes consistent.

In one recorded half-CPU comparison, an observing player's request delay during another player's first teleport fell from 3,978 ms to 29 ms. This supports keeping unrelated requests responsive during heavy work. The initiating player still waits, and the worker uses additional memory. The [C9 decision](docs/adr/0008-multiplayer-preparation.md) contains the expensive operation instead of passing its delay to everyone. The [candidate handoff](docs/integration/candidate-handoff.md) and [realtime verification](docs/evidence/crit9-realtime/verification.md) record the result and its limits.

## Evidence and the current release boundary

Corrections also became rules and tests. An early blank canvas required checking visible scene content rather than merely canvas existence. A turning defect needed signed angular rotation and a regression check. Those lessons constrain `CLAUDE.md` and `spec/`.

More recently, a collision test incorrectly selected `bodies[0]` after a tower was added. The test repair (`76e95f0`) selected the intended object by ID while retaining its original assertion; the physics implementation was unchanged. Injecting a genuine failure then confirmed that the check could detect its target behaviour. This separates a broken test assumption from a broken game rule.

Evidence must be read in sequence. The later candidate handoff records a successful Docker build, while older verification entries describe earlier states. These records do not establish one completely green test suite, physical-phone performance, or public-load capacity. Technical checks and personal visual review answer different questions.

The latest version is available locally on port 8098. Its performance correction has not yet been pushed or publicly deployed, so local results cannot be presented as hosted results. Publication is approved, with release execution and deployment checks still pending.
