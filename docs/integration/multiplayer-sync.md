# Multiplayer synchronization handoff

Base: `13a3e1e008e462dea499e084929d9c1eb680f230`.
Branch/worktree: `final-multiplayer-sync`.

## Changes

- Check both the scene and player snapshot before Colony applies any player pose,
  collider scene, rendered objects or HUD. Ground recovery advances
  `ground.sceneRevision`/`ground.sequence` even when `player.revision` is unchanged.
  A delayed snapshot must not undo the recovered pose.
- Keep a successful newer universe acknowledgement when an older pending poll
  subsequently fails. A current failure still marks building synchronization offline.
- Issue presence request tickets and invalidate them on clear/travel/disconnect or
  expiry. Ignore out-of-order replies and mismatched planets; clear all visitor
  diagnostics together with the rendered avatars.
- A stale old-planet heartbeat receives 409 without erasing the identity's newer
  current-planet presence. Space mode still removes ground presence. Authority,
  positions, expiry and read-only building permissions remain server-derived.

## Required integration patch

`multiplayer-sync-main.patch` is a separate patch against the base `main.ts`.
The committed `main.ts` is deliberately unchanged. The patch is required to
activate standalone player snapshot guards and presence request invalidation at
all production call sites. Apply/reconcile it after cherry-picking this commit:

```sh
git apply --check docs/integration/multiplayer-sync-main.patch
git apply docs/integration/multiplayer-sync-main.patch
```

It adds the guard import, early boolean return in `accept`, uses `applyPlayer:accept`,
captures the heartbeat ticket, clears presence on disconnect/failure, and prevents a
stale reconnect response from replacing the walker after `accept` rejected it.
The patch was temporarily applied only in this worktree for typecheck, lint,
production build and browser validation, then removed before committing.

Conflict areas: `main.ts` accept/reconnect/presence loop and Colony bridge, where
movement/camera work may have nearby changes. `colony.ts` touches only its import,
`accept` guard and `poll` catch; the parallel build UX task owns pointer/cancel
interactions elsewhere in that file. No shared state interface or server route
changes are required. No storage transactions, movement physics, vendored art,
materials, lighting, Fly settings or existing DB files are changed.

## Executed verification

- 8 focused tests passed: `spec/multiplayer-sync.test.ts` (5) and
  `spec/presence-client.test.ts` (3). A temporary Vitest configuration selected
  only those two files and omitted the unrelated HTTP global setup; all DB
  fixtures use SQLite `:memory:` and only owner/visitor identities.
- Restoring only Colony/server presence to the base version made three selected
  regression tests fail: stale scene applied its player first; stale poll failure
  undid a newer success; old-planet heartbeat deleted current presence. The fixed
  files were restored immediately afterwards.
- `tsc --noEmit`, `eslint .`, and `vite build` passed with the temporary main patch.
- Initial test-only float comparison and private-field fixture typing failures
  were corrected before the successful checks above.
- One focused Chrome browser test passed in 1.5 minutes (Chrome 154.0.8037.98,
  two independent 1920×1080 contexts), with no page errors. Its execution
  details and checkpoints are recorded in
  `../evidence/multiplayer-sync/result.json`; the browser test uses two fresh
  contexts on local port 8102 and a newly created `/tmp` database. The stair
  fixture is created through normal authenticated APIs; walking, flight,
  building move/delete use real controls. No browser identity is saved to disk.

No full suite, 393 sentinel, deployment, push or production-state validation was run.

## Observed browser limitation

The upper-floor before/after screenshots were visually inspected: the visitor
stands on the intact floor, then on terrain after removal. The post-removal
screenshot retains the existing message “A newer ground position exists.
Reconnect to your saved position.” A deletion can race an in-flight motion
sequence; the current server fence rejects that stale movement and the existing
recovery completes. The visitor then successfully returns to the harbour using
real controls. This is successful recovery, not evidence of zero conflicts or
fully seamless motion. No movement-transaction or physics behavior was changed.
The lamp screenshot shows the rendered world/return beacon rather than a useful
close view of the lamp; its move is confirmed by the real UI action, authoritative
object version/position and visitor scene revision assertions.

Both self-created browser contexts were closed; the local 8102 server exited
successfully and its port was confirmed free. The temporary test DB is preserved
outside the repository. There is no saved browser storage/cookie file.
