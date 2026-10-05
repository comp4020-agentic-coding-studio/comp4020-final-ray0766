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
  Preserve the existing ground scene until separately restyled. Do not add the
  independently proposed workshop/blueprint/ecology/history features here.
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
- Preserve original procedural scenery and character art. Record measured
  performance with hardware/browser context; phone viewport emulation does not
  establish physical phone performance.
- Run typecheck, lint, course tests, focused state/motion tests, build, real Chrome
  browser checks, and evidence checks. Record failures and repairs truthfully.
- Write factual engineering evidence only. Do not invent student reflection,
  personal positions, playtest feedback, citations, deployment, or test results.
- No push, public repository change, Fly billing/deploy or submission without
  separate approval. Crit7 and the deleted old implementation are out of scope.
