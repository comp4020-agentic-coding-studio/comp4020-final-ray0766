# Return across the local date — 27 October 2026 (Sydney)

The three original production test profiles were reopened sequentially in installed Chrome 155.0.8059.85. This is a return check using the retained identities, not replacement accounts, a new concurrent-load test or human acceptance. The earlier [three-agent session](../README.md) remains unchanged as historical evidence. The tested production release is [393b977](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/393b97745e873f5e94d614abee31da6a75183b8d); the 978-test local usability candidate is **not deployed or validated here**.

## Actual interval and results

Sydney was UTC+11. The prior refresh observations were on **26 October at 19:40–19:44 AEDT**; these return observations were on **27 October at 09:09 AEDT**. Both fall on 26 October in UTC. This demonstrates return after a local date change, **not 24 elapsed hours**.

| Retained identity | Prior saved-state observation (UTC) | Return observation (UTC) | Elapsed | Result |
| --- | --- | --- | --- | --- |
| Test explorer 1 | 26 Oct 08:40:59.354 | 26 Oct 22:09:30.429 | 13h 28m 31.075s | Same owned name, 42 saved objects and Bench 42; character creation did not repeat. |
| Test explorer 2 | 26 Oct 08:44:04.326 | 26 Oct 22:09:33.955 | 13h 25m 29.629s | Same owned name, 42 saved objects and Bench 42; Soft bob / Sky appearance still present; no repeated creation. |
| Test explorer 3 | 26 Oct 08:43:40.964 | 26 Oct 22:09:37.637 | 13h 25m 56.673s | Same owned name, 42 saved objects and Bench 42; Smooth preference remains; no repeated creation. |

The retained cookie's presence was checked without printing its value. A read-only authenticated universe request verified the expected owned name before opening the app: this endpoint cannot create a replacement identity. Each profile then entered normally, passed the returning-player loading screen, opened Menu → Build, and selected the existing Bench 42. No Save, Place, Move, Rotate, Remove, rename, travel or AI action was used. Only normal `/api/presence` POSTs were observed. Before/after checks found the current planet's complete object records and saved appearance unchanged during the check. These are comparisons of the three authorised test worlds, not a full-database audit. Original records support name/count/bench and the stated appearance/quality comparisons; no original byte-level snapshot exists to prove all fields unchanged over the entire interval.

## Existing deployment evidence

Public GitHub metadata confirms [run 40295066160](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/runs/40295066160) for the same SHA. Its [deploy job](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/runs/40295066160/job/121480286368) ran from 08:53:41 to 08:55:44 UTC, after all three original saves and before this return. Live backup succeeded at 08:53:54–08:54:08, Deploy at 08:55:04–08:55:40, and release confirmation at 08:55:41–08:55:42. The workflow deploys a SHA-tagged image and confirms it; rollback was skipped. Thus these retained values were observed before and after an independently recorded production deployment, not merely after a browser reload.

The current public main SHA and successful run SHA both remain `393b977`; live health and README returned 200 and the unpublished candidate notice was absent from live README. No Fly credential, machine event history or application log was read. **Automatic stop/start events during the intervening hours were not independently verified.** No server was restarted for this test, and no claim of a particular process ID, uninterrupted uptime, or a separately induced restart is made.

## Pixels, harness and boundaries

- [User 1 returned](user1-returned.png): named home, buildings and saved Bench 42 selection in the desktop view.
- [User 2 returned](user2-returned.png): the 390×844 saved-object UI shows Bench 42; buildings render, but the published building panel still obscures part of the ground. This is not proof that every bench pixel is unobstructed or that the unpublished narrow-layout repair is live.
- [User 3 returned](user3-returned.png): named home, buildings and saved Bench 42 selection in the desktop view.

All three images were inspected. The first driver attempts incorrectly assumed an always-mounted appearance dialog, a clickable returning welcome button, a quality-control ID and title-case location text. Those attempts authenticated the retained identities but stopped before completing the intended UI capture. The corrected pass above completed normally; this is not described as a first-attempt uninterrupted pass. No application exception, data loss or model request was observed. Private driver receipts retain these corrections; the [sanitised result](result.json) excludes cookies, profiles, databases and raw traffic.

All three profiles, identities, names, homes, objects and appearances were retained. No test user or object was created or deleted. This closes the bounded **next local calendar day** revisit for these three production users, including a recorded deployment between observations. It does not prove 24-hour or multi-day retention, arbitrary players, new candidate deployment, physical-phone performance, or completed interplanetary visits. Accepted wall cutaway and same-position occlusion remain unchanged.
