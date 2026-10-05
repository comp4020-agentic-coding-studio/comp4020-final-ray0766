# Workshop integration boundary (not an integrated workshop)

The user assigned the blueprint, ecology, ship and history modules to a separate
workspace. Round 5 did not import, launch, copy or invoke that code. Round 6 now reuses only
a fixed, verified pure-geometry resource snapshot, as documented in
`shared-assets.md`; the independent editor/server work remains separate.
The exported `ColonyBridge` type in `src/client/colony.ts` is the existing typed
boundary for a future ground/building UI adapter. Exposing its type adds no new
runtime feature or rights. `Colony` still owns the current small catalogue/editor.

## What an adapter may use today

- `read()` supplies the server's `Universe` and `PlayerState`.
- `write(route, body)` uses the application's existing queued, same-origin session
  requests. Its identity is the HttpOnly cookie; no owner/player ID is accepted.
- `applyPlayer`, `universe`, `pause`, `flush`, `obstacles` and `notice` preserve
  acknowledged-state handling, walking/editor input isolation and user feedback.
- `bearing(planetId)` marks an Atlas destination. It is not a teleport or takeoff API.
- `canvas`, `camera`, `scene`, `ground()` expose the current local display. They
  are not authoritative ownership, quest, travel or persistence state.

The current server accepts only these existing placement operations:

```ts
// POST /api/objects/create
{ planetId, objectId, kind, position, rotation }
// POST /api/objects/update
{ planetId, objectId, position, rotation, expectedVersion }
// POST /api/objects/delete
{ planetId, objectId, expectedVersion }
```

`kind` must be one of the six `CATALOGUE` keys in `src/shared/planets.ts`;
`objectId` is a fresh UUID, `position` a finite unit surface normal, and `rotation`
is in `[0, 2π)`. Keep UUIDs stable when retrying an identical create. Updates/deletes
carry the saved object version. Ownership, landing clearance, overlap and the
64-object limit are rechecked on the server. Deleted IDs cannot be resurrected.
Multi-part blueprint placement is not atomic in this API: an adapter must not
claim all-or-nothing batch saving or bypass validation.

New model kinds, blueprint schemas, ecology heights, ship parts and history events
need a separately reviewed schema/API change and preservation tests before they
can become saved world content. No arbitrary client mesh/JSON is trusted today.
Keep the current port, departure/landing state machine, coordinate system, finite
world slots and presence scopes unchanged during a proposed module integration.
