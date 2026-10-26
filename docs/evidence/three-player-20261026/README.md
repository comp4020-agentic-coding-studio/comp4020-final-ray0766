# Three independent production explorers — 26 October 2026

Tested application: [29e7e68](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/29e7e6870b458a4cfff70c13c9dc5fab6f0f509a), at [the production site](https://comp4020-final-ray0766.fly.dev/). These are three separately delegated agent tests, not three human participants or an HD guarantee. No feature code changed during this session.

## Isolation and actual overlap

Each agent launched a separate installed Chrome 155.0.8059.85 process with its own initially fresh persistent profile on the user's Mac. Profiles and cookies were never shared and remain private outside Git. Mac Chrome WebGL2 was checked on a blank page before entry. This is distinct from the earlier cloud-browser WebGL-disabled attempt, which never reached gameplay.

All three saved a new character and stayed online before a common go signal. The conservative shared exploration window is **08:37:32–08:44:13 UTC**. Users 2 and 3 observed two other visible travellers at the common start. Placements occurred at different moments within this real overlap; this was not a simultaneous-write race or a load test. Separate identities also received distinct owned homes and could only use their own building UI.

| Agent | Viewport / observed quality | UI exploration and construction | Retained result and refresh |
| --- | --- | --- | --- |
| [User 1](user1.json) | 1920×1080; Standard | Created character; My planet guide; keyboard walk to gate; Return to my home; renamed through Menu; placed Bench at 08:40:31 UTC. A too-close placement was refused, then open ground succeeded. | Test explorer 1 and Bench 42 persisted at 08:40:59. Online until 08:44:13. |
| [User 2](user2.json) | 390×844, touch emulation; Standard | Created Soft bob / Sky traveller; actual joystick walk; gate return; Menu rename; touch ground selection and Place object at 08:43:32. | Test explorer 2 and Bench 42 persisted at 08:44:04. Agent's closing report records online until 08:45:33. |
| [User 3](user3.json) | 1920×1080; Auto/Standard initially, explicitly switched to Smooth | Created character; keyboard guide route; gate return; Menu rename; Place object at 08:43:02. | Test explorer 3, appearance, Smooth setting and 42/64 objects persisted at 08:43:40. Online until 08:46:40. |

All game mutations came from visible forms, buttons, canvas clicks and normal keyboard/touch input. Read-only world/DOM diagnostics helped agents follow ground routes. There were no test API POSTs, direct database writes, position injections or attempts to edit another owner's world. This automation assistance is not evidence of unaided human discoverability. Each planet already had generated home objects; the agents each added **one** bench, not 42 new objects. User 3's initial selector count of 43 included a placeholder; the authoritative UI showed 42/64.

## Cross-observation, failures and limits

- User 1 saw Test explorer 2 in Atlas as a read-only neighbour with 41 objects before its placement. Users 2 and 3 later saw the other two names as read-only neighbours with 42 objects. The cards are evidence of cross-client visibility, not a measured sub-second update or a physical visit.
- **Physical cross-visits were not completed.** User 1's Find ship request from its home gate displayed “No confirmed safe route”; the read-only proof diagnostic returned `no-safe-approach`. The agent stopped rather than inject a position or claim a completed journey.
- Desktop entry into building showed much sky until ordinary orbit/zoom adjustments. On the 390px viewport the building panel covered much of the ground. User 2 used the existing Planet view and a small exposed ground area to place its bench. Its refresh screenshot still shows this framing problem; persistence was checked through the saved-object UI, not falsely inferred from clearly visible bench pixels.
- User 3 saw an initial offline message recover. One final read-only universe request failed with `ERR_NETWORK_CHANGED`, with no save pending. There were no captured page exceptions or AI requests across the three sessions.
- Driver mistakes (a select treated as a button, a redundant Close, a wrong gate selector and truncated terminal input) were corrected as harness errors, not relabelled product failures. No production code or assertion was weakened.
- User 2's last optional combined neighbour screenshot/report-finalisation action was denied by automatic approval review and was not retried. Its existing JSON is preserved as-is and therefore stops after the successful refresh; Atlas observations, quality and closing time above come from that independent agent's final report. No denied screenshot was recreated. This limits the saved evidence, not the already completed UI actions.

## Inspected pixels

| Screenshot | What it supports |
| --- | --- |
| [User 1 after refresh](user1-home.png) | Named home and placed bench visible in the settled world. |
| [User 1 route refusal](user1-route-blocked.png) | Visible Find ship safety-route refusal at its actual home gate. |
| [User 2 build overview](user2-build-overview.png) | Narrow building panel and limited exposed placement ground; adverse evidence. |
| [User 2 after refresh](user2-after-refresh.png) | Persisted session/building interface, but mostly sky; not a visual bench-presence claim. |
| [User 3 after refresh](user3-home.png) | Named home with Bench 42 selected from saved objects and rendered world. |
| [User 3 Atlas](user3-atlas.png) | The other two test worlds and their read-only status/counts. |

All listed images were inspected. They contain only the game and synthetic test aliases; profiles, cookies, private configuration, raw traffic and player databases are excluded. The adjacent per-agent JSON files are retained observations, not reconstructed request logs.

## Data retention and scope

All three new identities, homes, names, appearances and benches remain on production. The three persistent profiles also remain private for later return; closing Chrome did not clear them. No reset or end-of-test cleanup was performed. Local 8152, frozen 8098, the AI budget ledger and production configuration were untouched. No paid guide request was made.

This demonstrates concurrent agent sessions, UI construction and immediate refresh persistence. It does **not** demonstrate next-day persistence, a new restart/redeployment check, physical-phone performance, arbitrary layouts, a complete fly/land/return route, or ordinary-human usability. The previously accepted wall cutaway and same-position traveller occlusion remain limitations, not repaired features.
