# Chinese / English interface — local implementation

Authorised on 7 October 2026 after `9c76e15`. This is an engineering record,
not a student reflection or a deployment claim.

The world header and every native dialog have a Chinese/English selector. On a
first visit, a `zh` browser language selects Chinese; other languages use English.
An explicit choice is stored under `little-worlds:language:v1` in localStorage.
Unavailable storage leaves switching usable for the current page. There is no
new account, cookie, server route, schema migration or translation service.

## Coverage and implementation

`src/client/messages.ts` centralises English source messages, Chinese translations
and dynamic templates. Explicit host UI setters in `i18n.ts` retain source text
in weak maps and update text nodes/accessible attributes in place. Switching does
not rebuild the scene or dialog, rerun editor commands, change input values,
deselect parts, reset undo, or trigger a gameplay save. Template slots opt in to
system-term translation; names and identifiers stay verbatim. Unknown diagnostic
messages fall back to their original text. No DOM-wide mutation observer runs in
the animation loop.

Coverage includes navigation, pause/help/courier dialogs, HUD and touch labels,
delivery/NPC conversation, first-visit guidance, atlas/region/bearing/flight text,
building catalogue and placement, blueprint tools/parts/properties/validation,
ship components/paint/preview/save, terrain previews, private history, loading,
confirmation dialogs, connection state and known server validation errors.
`html.lang`, page title, aria-label, title and placeholder follow the selection.
Numeric counts, object IDs, option values and keyboard shortcuts stay intact.

Persisted planet/ship/blueprint/group names remain unchanged, including names
whose spelling matches a translated system label (`Cottage`, `Clay`). Built-in
planet names and NPC proper names also retain their identity. Documentation at
`/readme/`, engineering records, immutable 3D signage/resource text and unexpected
browser/vendor diagnostic wording remain in their source language. The no-JS
fallback is English because the selector requires JavaScript. These are not
represented as translated player-interface coverage.

## Verification

- Typecheck, ESLint and production build passed.
- 45 focused checks passed serially: new language tests, onboarding/build UX,
  course invariants/API, sprint/jump and save recovery. The language tests cover
  preference fallback, blocked storage, every template's placeholder parity,
  nested system terms, unchanged names/IDs, modal/focus/selection/draft retention,
  live updates, aria labels and persisted explicit preference.
- Chrome 154 completed the full Chinese/English journey on isolated port 8114:
  suit choice, server-error/rollback/reconnect, real Shift/Space movement,
  pickup→delivery, real boarding/flight/landing, claiming, building preview,
  blueprint validation/save, terrain draft, history, refresh, and 390×844 layout.
  Player-created names stay unchanged; language switching performs no ship save.
  The recorded replay has zero page errors and rejected movement requests.
- Visual review caught a phone builder screenshot taken immediately after leaving
  the ship preview, before the camera settled. A replay waits one second before
  capture: the planet is visibly rendered, WebGL is not lost, and the recorded
  frame contains 89 draw calls / 20,600 triangles. Both images are retained.
- The first browser driver tried to fill a field inside collapsed Parts & groups.
  Its failure is retained; the driver now opens the details element first.
- An initial parallel regression expansion overlapped browser activity on the
  shared test fixture service and hit timeouts/claim contention. Serial focused
  reruns passed. A separate serial comparison of ships/blueprints/planet API
  reports 10 passed and the same 3 failures both here and in an extracted,
  unmodified `9c76e15` baseline. Two legacy migration fixtures downgrade only
  `user_version` on modern compact data, so migration increments planet revisions;
  the older ship test attempts legacy large moves rejected by current validated
  ground motion. Those tests and backend behaviour remain unchanged in this UI
  milestone. See `baseline-comparison.json`; this is not a full-suite green claim.
- The first small course/API smoke accidentally used 8098, creating fresh
  anonymous fixture sessions; it did not use the user's browser identity. All
  browser and subsequent HTTP validation used isolated 8114. No test cookies,
  identity tokens, SQLite files or storage-state files are committed.

Evidence is in `docs/evidence/bilingual/`. Phone dimensions are desktop viewport
emulation, not physical-phone performance. IAB validation remains unavailable:
only an empty-address new tab was observed before this task; no IAB control tool
or macOS Accessibility permission was available. Chrome results do not resolve
that separate IAB report.

## Local delivery

The 8098 update uses the existing Final checkout and launchd service. Before
switching, the release procedure backs up SQLite, verifies all rows and columns
remain identical at schema12, checks the protected untracked Crit8 test hash, and
compares served assets against this build. Rollout evidence/backups live outside
the repository in `task-2/bilingual-backups/`. No push, public release, Fly deploy,
Crit8/Crit7 edit or independent Claude workspace change is authorised here.
