# R3 integration verification

Source `a4546bb120d969774776f1fbe2cb1c990a7c3e66`, integrated over physics `4c18ae5`.
No source-module edits, physical-envelope changes, schema migration, push or deploy.

- TypeScript, lint and production build passed. Build output: main JS 634.75 kB /
  175.92 kB gzip, shared Three core 250.55 kB / 68.19 kB gzip, lazy KTX2 loader
  58.99 kB / 24.21 kB gzip. These are file sizes, not runtime performance claims.
- Five affected test files passed, 20 tests: R3 pool/anchor/ghost and ownership
  disposal, static MIME/ETag/cache, blueprint persistence/permissions, physics,
  presence and spherical motion. No isolated 393-sentinel suite was run.
- Real installed headed Chrome repeated the physics desktop/390×844 touch journey:
  open doorway, wall blocking, stairs, upper-floor reload/reconnect and return flight.
  [Physics run](physics/browser-result.json) passed, without page errors.
- [R3 browser checks](browser-result.json) passed for desktop WebP and phone-size
  KTX2. A single intercepted KTX2 map returned 404 and the application loaded its
  WebP fallback; other maps used KTX2. All observed module resource requests used
  one release namespace, including the transcoder. Default geometry/detail remained
  medium. This does not establish real-phone or BC7 compatibility.
- Main and workshop pools reported two spots/two points/no practical shadow.
  Editing/undo and actual phone canvas touch worked. Close released the workshop
  WebGL context and reopen created one canvas. The first R3 driver attempt did not
  accept the unsaved-draft confirmation after undo; correcting the driver made
  the focused replay pass. This was not treated as an application disposal failure.
- [Main ghost check](ghost-result.json) records unchanged fitting counts while
  selecting an existing placed structure as a ghost, then cancelling it. Saved
  building records remained unchanged and no page errors were observed.
- Screenshots were visually inspected: [desktop interior](desktop-inside.png),
  [phone framing](phone-workshop.png), [phone interior](phone-inside.png),
  [cleared placement ghost](ghost-cleared.png). They show the actual rendered app.

The source module reports a prior 89/93 whole-suite result, then 14/14 focused
phone repairs. Its two medium overview budget failures remain known and were not
fixed here. Neither that isolated suite nor physical device performance is claimed
as green by these main-project checks. Test Chrome was closed after use; only the
local 8098 preview remains. Original Crit 8 and earlier milestone evidence remains
unchanged; R3's physics replay has its own directory.
