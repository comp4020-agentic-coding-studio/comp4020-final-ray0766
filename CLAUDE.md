# Little Post implementation rules

These engineering rules record the scope authorised for the first local
prototype. They do not claim to be the student's finished academic harness.

- Keep the existing course Final repository lineage and its two shipped checks.
  Preserve fly.toml: one shared-cpu-1x machine, 256 MB, one /data volume.
- Current authorised scope adds multiple claimable planets and a small original
  building catalogue. Each server session can own at most one planet, each planet
  has at most one owner; everyone can visit, only the owner can edit. Preserve the
  spherical controller and keep the delivery as an optional public-harbour activity.
  Do not expand into chat, trade, economics or large quest systems.
- Travel is now continuous controllable arcade flight between fixed planet centres.
  Atlas selections mark bearings only; never restore a production teleport route.
  Server checks journey/sequence, bounded motion, collision clearance and near/slow
  landing. Preserve both ground and flight saves; freeze/rebase after failed saves.
- Back up existing SQLite before schema migration; preserve original coats, quest
  state and position. Enforce ownership on every write with server-derived identity
  and SQL constraints/transactions. Hidden UI and client owner IDs grant no rights.
- Use revision checks and idempotent writes, validate placement/overlap/capacity,
  and test independent sessions, concurrent claims and read-only visitors. Anonymous
  browser identity is not a real-world person or cross-device account.
- Latest visual direction: an industrial science-fiction flight sample with original
  mechanical geometry, PBR metal/glass layers, restrained HUD and readable exposure.
  The authorised ground restyle adds an industrial public hub, connected routes,
  original suits and a physical gate. Board only beside the saved port position;
  no global takeoff button or client-supplied proximity bypass. Private return
  beacons/craft are temporary travel scenery, never placed owner objects. Final workshop-v1 now reuses Claude’s committed editor to save private named/grouped
  blueprints on the server and place immutable structures on owned planets.
  Ship workshops, terrain editing and public history remain out of scope.
- Original procedural assets or explicitly documented free licensed assets only.
  The user approved NASA SVS public-domain lunar maps for the orbital sample.
  Messenger is an interaction reference; do
  not extract its code, shaders, models, sounds, or textures.
- Spherical movement must keep unit radial position and orthogonal tangent
  directions at poles. Character reversal must actually turn. Camera pose must
  use a Camera lookAt convention, not an Object3D's opposite forward direction.
- Only the server changes quest state. Check input type, finite unit positions,
  bounded travel, valid coat, parcel state, and saved NPC proximity. Duplicate
  pickup/delivery requests must be idempotent. Do not trust client counters.
- Persist before acknowledging. Save SQLite to DATABASE_PATH (local .data;
  /data in the container). Never commit databases, cookies, tokens or .env files.
- Preserve fixed planet slots while expanding the finite survey; use bounded
  orbital detail and remote-avatar budgets. Ground presence is ephemeral and
  scoped by server-derived planet/mode. Never expose cookies or session hashes,
  accept client position as presence authority, or grant building rights through
  presence. No remote spacecraft/chat/voice/account systems in this iteration.
- A failed save must show an error and reconnect to the acknowledged state.
  Queue writes so delivery cannot overtake position. Never silently mark an
  unsaved coat or quest complete.
- Support WASD/arrows, E, clickable actions, touch joystick, visible focus,
  modal keyboard use, reduced motion, and both marking viewports.
- Browser validation must confirm the world is visibly rendered, not only that
  a canvas element exists. Exercise the complete interaction via real controls.
- Check close and overview cameras at desktop and phone sizes. Elevated NPC
  labels need camera-ray occlusion, not the old radial visibility approximation.
  Keep a readable active destination when it leaves the narrow phone viewport.
- Keep original/properly credited scenery and character art. Record measured
  performance with hardware/browser context; phone viewport emulation does not
  establish physical phone performance.
- Run typecheck, lint, course tests, focused state/motion tests, build, real Chrome
  browser checks, and evidence checks. Record failures and repairs truthfully.
- Write factual engineering evidence only. Do not invent student reflection,
  personal positions, playtest feedback, citations, deployment, or test results.
- No push, public repository change, Fly billing/deploy or submission without
  separate approval. Crit7 and the deleted old implementation are out of scope.

- Round 6 user clarification supersedes a decorative-only city: public and player
  art share a material/geometry vocabulary. The existing six saved kinds use the
  shared assets without changing storage. Seventeen structure resources expose
  local metres, +Y up, +Z exterior and connection metadata for the separate editor.
- The user assigned snapping/assembly/undo/blueprint storage to Claude. Do not build
  a competing editor here. `src/assets/claude-geometry` is an immutable, verified
  committed resource snapshot; its provenance manifest records the source hash.
  Do not copy or overwrite that independent workspace's uncommitted changes.
- Public display projection is reversible and separate from durable normals and
  orbital coordinates. Compensate walking speed; transform visitor frames and
  ground picking consistently. Private saved object transforms remain unchanged.
- Store round 6 screenshots/results separately; keep earlier failed-run evidence.

- Physics milestone: the user assigned art to Claude and ground physics to this
  project. Keep the vendored db79d73 files and art adapters unchanged. Author static
  collision metadata independently in `src/shared/physics`; use stable part IDs and
  anchors. Persist height separately from spherical direction, validate movement
  on the server, and preserve flight, ownership and existing saves. Do not expand
  this milestone into a rigid-body engine or subsequent feature phase.

- The user subsequently authorised continuous local integration after physics:
  first Claude R3 (`a4546bb`), then private ship designs reflected consistently in
  the parked, flying and landed craft; then assess terrain and owner-private
  history separately. Earlier scope limits do not block these authorised steps.
  Keep independent commits and bounded verification. Preserve published 09233d9,
  Crit 8 reflection/evidence and the independent Claude source workspace.
- R3 vendored source remains byte-identical. Vite routes its asset URLs into the
  pinned release directory; old resource URLs remain served. Do not silently
  overwrite an immutable resource directory or mix transcoder versions. Physics,
  collision proxies and the custom harbour service.light stay independent.

- The user explicitly authorised the next two local playable stages: owner-private
  building history, then deterministic terrain selection/preview/apply. Keep current
  building tables authoritative and append history in the same transaction. Import
  old objects as a labelled baseline, never fabricated past events. Every history
  read is owner-only; playback cannot write to the world. Terrain remains opt-in:
  preserve null legacy environments and the public harbour, apply RESTRICT to all
  existing buildings, and share ground semantics across rendering, physics and server
  validation. No broad historical terrain migration, source-art changes or deployment.
