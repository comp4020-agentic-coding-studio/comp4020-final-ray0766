# Ship save and scene integration verification

Local branch `final/workshop-v1`, based on R3 `697278e`, 2026-10-06.
No deployment or submission was performed. Geometry is the unchanged Claude
`a4546bb120d969774776f1fbe2cb1c990a7c3e66` ship factory: 12 added source files,
44 total vendored source hashes verified against the source workspace.

## Delivered behavior

Pause menu → Ship workshop edits one current private ship: three starters, six
part categories, three paint regions, engine glow, name and registration. Save
and use applies the acknowledged document to the surface, departure and flight
models. All use medium detail, +Y up / −Z forward and the same metre scale. Existing
flight dynamics, ground collision metadata and ownership rules are unchanged.
The 2.4 m solid ship envelope fits the existing conservative flight clearance.

`POST /api/ship/save` derives identity from the existing HttpOnly session, decodes
the strict canonical design document, checks a saved version, and persists before
acknowledging. Equivalent retries do not create revisions. Actual changes are
refused while flying, with mode read inside the write transaction. A stale editor
keeps its draft and can reload the acknowledged design. Failed network saves do
not switch either live model. Identity remains per browser visit, not an account.

## Storage and verification

- SQLite schema 6 → 7 adds only `player_ships`. Before migration, consistent local
  snapshots were made with SQLite backup; the app also produced its automatic
  `VACUUM INTO` v6 backup. A migrated copy retained all values in all eight original
  tables and passed `integrity_check`. Final live DB is schema 7, integrity `ok`.
- Post-test comparison retained all original player, building, blueprint, visit,
  tombstone and ground-state rows. Six previously unowned planet rows were claimed
  by the main HTTP test suite; only owner/revision fields changed there. Previously
  owned planets were preserved. Test identities remain in ignored local `.data`.
- `pnpm typecheck`, `pnpm lint`, `APP_URL=http://127.0.0.1:8098 pnpm test`:
  **14 files / 45 tests passed**. Five ship tests cover private sessions, retries,
  stale versions, invalid documents, in-flight changes, backup/reopen, model bounds,
  pose-preserving replacements, owned-resource and paint-lease disposal, HTTP origin,
  authentication and body limits. Existing course, delivery, flight, building and
  physics checks passed in the same run.
- `pnpm build` passed. Main chunk is 691.37 kB / 194.39 kB gzip; Vite warns that it
  exceeds the existing 650 kB chunk threshold. No threshold was raised. This is an
  outstanding bundle-splitting opportunity, not a failed build.
- `pnpm check:evidence` passed; original Crit 8 reflection, PROCESS and earlier
  phase evidence were not edited.

## Actual browser checks

Installed Chrome, headed, 1440×900 desktop and 390×844 touch emulation:

- The complete journey passed in 42.9 s: save Hauler, normalize registration,
  intentional 503 save failure with draft retained, reload the saved design,
  release/reopen WebGL preview, page refresh, walk to boarding gate, launch,
  refresh while in flight, steer using real keyboard controls, land, then reconnect
  in another context. The same canonical design was observed in editor, parked
  craft and flight; screenshots show the rendered geometry.
- Phone touch orbit, unobscured frame/save controls, save, refresh and editor reopen
  passed. No horizontal overflow and no page errors were observed.
- A separate two-tab check passed in 2.8 s: stale save rejected, newer server ship
  retained, losing draft kept, explicit reload recovered the saved design.
- The first attempt discovered a real CSS issue: the original HUD's absolute
  footer covered the editor's Reload button. A scoped static footer fixed it.
  [First-run note](first-run.txt) preserves the failure; the successful rerun is
  [recorded here](browser-result.json), with [conflict evidence](conflict-result.json).
- A final saved-world render after removing the old fixed ship-number sign also
  completed without page errors. Test contexts and Chrome processes were closed;
  only the 127.0.0.1:8098 preview remains.

Visually inspected screenshots: [desktop editor](desktop-workshop.png),
[phone editor](phone-workshop.png), [flight](flight.png),
[landed craft](landed.png), [final return gate](landed-final.png).
Phone viewport emulation does not establish physical-phone performance. The source
module's prior overview budget failures were not repaired or rerun in this stage.

## Local use

`PORT=8098 HOST=127.0.0.1 pnpm start` after `pnpm build`, then open
`http://127.0.0.1:8098/`. The current preview is already running. Use the same browser
profile to retain its anonymous visit; select Ship workshop from the pause menu.
