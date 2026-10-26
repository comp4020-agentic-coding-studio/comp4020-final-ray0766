# Production usability release verification — 26 October 2026 UTC

Application commit [7115161](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/711516106ff7eab293a7aa3b482994da832b1c2e) passed [run 40412311125](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/runs/40412311125): **153 files / 978 tests**, 197.93 seconds, plus typecheck, evidence and both secret scans. No deadline or assertion was relaxed. The historical 971-test release and failed local attempts remain in their original records.

The production backup was 679,936 bytes, schema 20, integrity `ok`, zero foreign-key violations, with an independently rechecked SHA-256. It remains private on the existing Fly volume at `/data/release-backups/711516106ff7-40412311125/before.sqlite`. The live database was already integrated, so no cutover migration ran. The SHA-tagged image was confirmed at **22:31:55 UTC**; rollback was skipped. Deployment did not change the AI setting or reset data.

Health was integrated/200, the rendered README body matched source exactly, and the homepage plus 14 referenced JS/CSS assets matched the locally verified build byte-for-byte. Later evidence-only commits do not change these application files; their own main workflow must complete before they count as published. This checkpoint records the application SHA tested here, not a claim about an as-yet-unrun future workflow.

## Retained identities and actual interaction

Chrome 155.0.8059.85 on the Mac reused the original three separate persistent profiles. Read-only authenticated probes checked identity and owned planet before opening the game; no replacement accounts were created. Only these authorised synthetic users were inspected. Before/after comparisons covered their names, full saved object records and appearance records, without publishing cookies, identity IDs or raw saves.

| Identity | Viewport | Observation after deployment |
| --- | --- | --- |
| Test explorer 1 | 1920×1080 | Same name, 42 objects and Bench 42. Guide → Find ship produced a three-point route. Real keyboard movement followed it to **Board your ship E**, grounded, then returned along the route. Objects and appearance remained identical. |
| Test explorer 2 | 390×844, touch emulation | Same name, 42 objects and Bench 42. Selecting Tree folded the catalogue, moved focus to Show kit and left a 206.39px control tray below the visible planet. Actual touch created a valid preview; Show/Hide retained it; Cancel plus explicit discard confirmation removed the unsaved draft. Nothing was placed. |
| Test explorer 3 | 1920×1080 | Same name, 42 objects, Bench 42 and saved appearance. Returning entry and build list remained usable. |

All three entered without repeated character creation. Initial outdoor pitch was `-0.12` radians and overview was off. The saved home-gate positions activate the inherited 1.2m close camera and hide the local avatar; inspected pixels still show ground, buildings and interaction controls. These returned-home views retain substantial sky and are **not** the earlier fresh-hub framing comparison or proof of comfort at every origin. No camera behaviour was changed during this verification.

The first harness stopped because it incorrectly required the avatar to remain visible at all saved origins. Another narrow attempt automatically dismissed the unsaved-draft confirmation and therefore correctly retained the draft. Those results were retained privately; correcting the drivers required no product changes. Only the narrow confirmation scenario was repeated after the other scenarios passed. Final checks observed no page exceptions or paid guide requests. Production guide status was disabled. The only game POSTs were presence and user 1's ordinary movement; no building, name or appearance write was made. All profiles, planets and buildings remain.

## Visible evidence and boundaries

- [Returned home view](user1-initial.png): initial pitch at a saved home gate; inherited close camera is visible in the framing.
- [Find ship arrival](find-ship-arrived.png): the guide says Ready to board and the normal boarding action is available.
- [Narrow touch preview](narrow-preview.png): the planet is above the compact tray; this Tree was cancelled, not saved.
- [Sanitised results and image hashes](result.json).

This is agent-driven verification, not author acceptance or a physical-phone performance measurement. No new flight, arbitrary-building, public-load or complete cross-visit exercise was run. The separate [next-Sydney-date return check](../three-player-20261026/return-visit/README.md) concerns `393b977` after 13h 25m–13h 28m, not 24-hour retention of this release. Automatic Fly sleep/wake history remains independently unverified. Author-accepted wall cutaway and same-position overlap were not redesigned. No HD grade or universally bug-free world is claimed.
