# Production return after 34 hours and movement synchronization

Measured **27 October 2026, 19:38–19:39 UTC** (28 October, 06:38–06:39 Australia/Sydney, AEDT / UTC+11) on [production](https://comp4020-final-ray0766.fly.dev/), release [86e101b](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/86e101b0010b550b380309bdc4cf248d6560ca47). Its [main workflow](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/runs/40569554265) had completed checks, the verified backup, deployment and release confirmation. That revision changes documentation; the executable guide revision remains [720ff83](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/720ff83b58bfdc0b381a1cd25bc1f9ae74fd5c4d).

These are agent-operated installed Chrome **156.0.8078.48** sessions on the user's Mac, using the three original retained persistent profiles. They are not new accounts or human acceptance. Desktop was 1920×1080; user 2 was 390×844 with touch emulation. Headless WebGL rendered the actual site. The production connection was not artificially throttled. Hardware performance and physical-phone behaviour were not benchmarked. [Sanitised observations and sample timings](result.json) contain no cookies, internal identities, private profiles, database records or raw traffic.

## Retained homes, appearances and construction

| Retained identity | Original saved-state observation (UTC, 26 Oct) | Return (UTC, 27 Oct) | Actual elapsed | Result |
| --- | --- | --- | --- | --- |
| Test explorer 1 | 08:40:59.354 | 19:38:24.784 | 34h 57m 25.430s | Same named home, 42 saved objects, Bench 42 and appearance; no repeated character creation. |
| Test explorer 2 | 08:44:04.326 | 19:38:28.511 | 34h 54m 24.185s | Same named home, 42 saved objects, Bench 42 and Soft bob / Sky appearance; no repeated creation. |
| Test explorer 3 | 08:43:40.964 | 19:38:32.052 | 34h 54m 51.088s | Same named home, 42 saved objects, Bench 42 and appearance; Smooth preference still selected. |

Original observations occurred on **26 October 19:40–19:44 AEDT**, and this return on **28 October 06:38 AEDT**. All three intervals exceed 24 elapsed hours. The earlier [13.5-hour return](../three-player-20261026/return-visit/README.md) remains a separate historical observation; its date and result were not rewritten.

Before opening each app, a read-only authenticated universe request checked the retained identity's expected owned name. It cannot create a replacement identity. Each session then entered through normal loading, opened Menu → Build and selected the existing Bench 42, without placing or saving anything. There were only normal presence POSTs during this return stage. The 42 objects include generated home objects and the one bench originally added by each agent, not 42 newly built objects.

Names, object counts and the existing bench were compared with the original report. Saved appearance matched the earlier return record. Complete object arrays and appearance were also compared immediately before and after this visit, confirming this check did not alter them. No original byte-level object snapshot exists to establish that every field remained identical throughout the entire 35-hour interval. This is a bounded check of the three authorised worlds, not a full-database audit.

The original saves preceded successful production deployments, including the recorded [393b977 deployment](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/runs/40295066160) and the tested release's workflow above. Retention therefore spans independently recorded deployments, not just browser reloads. **Automatic sleep/wake events were not independently inspected or induced.** No particular process ID or uninterrupted uptime is claimed.

## Real production movement samples

Users 1 and 2 used the normal gate button to meet on the main planet. Both remained online; the desktop actor performed six real 240 ms keyboard holds, with 1.2 seconds of settling between samples. User 2's independent profile observed the same actor. No test API writes, position injection or database changes substituted for the UI actions.

A passive wrapper observed successful `/api/presence` responses without replacing their contents. The start timestamp was recorded immediately before keyboard dispatch. A changed remote position had to differ from the previous settled position by more than 0.002 unit-vector distance. After the observer's accepted presence diagnostic changed and two animation frames elapsed, a visible visitor had to remain present. This measures a real input → production service → second-client update path; it is **not the configured polling interval reported as latency**.

| Input | Response received/parsed (ms) | Applied-state diagnostic + two frames (ms) |
| --- | ---: | ---: |
| W | 292.0 | 315.9 |
| S | 239.8 | 260.3 |
| A | 530.3 | 563.3 |
| D | 492.0 | 513.2 |
| W | 512.1 | 542.4 |
| S | 492.3 | 511.9 |

All six samples observed a changed position without page errors. Response times were **239.8–530.3 ms** (median **492.2 ms**); applied-state/two-frame times were **260.3–563.3 ms** (median **512.5 ms**). These are short samples from one connection and two clients on one Mac, not a percentile, load, geographic or physical-device guarantee. Automation dispatch and passive JSON parsing are included. The [`GroundPresence` implementation](../../../src/client/presence.ts) interpolates toward accepted positions; the second metric does not independently time the first changed pixel or completion of that interpolation. The visible diagnostic counts scene objects and cannot prove an unobstructed avatar: the existing same-position overlap remains visible in the settled captures.

This closes the narrow production **movement/presence** timing gap. It does not measure production building-revision propagation: the older [timed object-update samples](../final-hd/verification.md) remain local evidence. No existing layout was edited just to create a new latency sample. This session is not a physical interplanetary cross-visit acceptance test or a claim that every shared-state path is sub-second.

## Inspected images and preserved data

- [User 1 returned](user1-returned.png): desktop named home, saved Bench 42 selection and rendered construction.
- [User 2 returned](user2-returned.png): narrow folded builder leaves the planet visible; the complete saved-object count and Bench 42 selection were checked through the actual UI, not inferred solely from pixels.
- [User 3 returned](user3-returned.png): desktop named home and existing Bench 42 selected.
- [Desktop after movement](desktop-after.png) and [narrow observer after movement](narrow-after.png): both clients at the real main-planet gate. The actor returned near the common landing point, so overlap limits independent avatar readability in these settled images. Timing comes from the passive samples above, not a claimed screenshot pixel comparison.

Every image was inspected and contains only the game and synthetic aliases. Both movement participants used the gate to return to their own homes afterward. Read-only comparisons then confirmed complete object arrays, names and appearances unchanged. Ordinary travel and walking updated their own saved location/position through the application; this was not a strictly read-only session. No buildings, names, appearances, identities or profiles were created, removed or overwritten. All three test users and their buildings remain. **Zero guide-provider requests** were made; local saves, AI configuration/budget and other players were untouched.

This evidence publication changes documents and images only. Its subsequent main workflow supplies its own check, backup and deployment outcome without redating the measurements above. It does not claim final author acceptance or guarantee a grade.
