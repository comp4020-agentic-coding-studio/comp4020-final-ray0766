# Crit 8 hosted verification — 2026-10-06

The public release is live at [the course Fly URL](https://comp4020-final-ray0766.fly.dev/).
The repository is public and its main branch contains the implementation and Crit 8
writing. Application release: [89b8e09](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/commit/89b8e09).
The evidence-only follow-up changes documentation and screenshots; application
JavaScript remains `index-BfIgytnH.js`.

## Remote deployment and HTTP

- [Initial check and deploy](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/runs/37416393816): both successful.
- [Same-commit check and redeploy](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/runs/37417440868): both successful.
- Unauthenticated GitHub API access returned 200 and `private: false`.
- `/`, `/readme/`, `/credits/` and `/healthz` returned 200 over HTTPS.
  [HTTP evidence](http.json) includes the expected bundle and complete README headings.
- CI ran the production container, TypeScript, all 25 tests, the evidence check,
  standard TruffleHog and the course-key scan before deployment.

The existing Actions course credential worked. No token was extracted or created,
no account/security permission was expanded, and no alternative hosting was used.
Initial Fly logs record one app machine and one 1 GB data volume created for the
existing course application. The unchanged configuration specifies one shared CPU,
256 MB memory, Sydney region and automatic stop/start. No scaling or extra volume
was requested. Local Fly CLI access to the course organization remains unavailable;
the successful existing Actions path supplied the deployment authority.

## Actual Chrome journeys

A single installed, headed Chrome runner on the Mac used isolated test contexts,
with one worker and the exact course viewports: 1920×1080 and 390×844. Both core
loops have passing hosted evidence:

| Scenario | Observed result |
| --- | --- |
| Desktop keyboard delivery | pick up, deliver, reload/reopen and restore Fern suit/task; passed in 26.0 seconds |
| Phone touch delivery | touch walking, pickup/delivery, reload/reopen and restored suit/task; passed in 27.3 seconds |
| Desktop exploration/building | walk to port, launch, fly, land, claim, place cabin, refresh and recover; passed with visitor checks in 53.5 seconds |
| Independent visitor | fly to owner's world, see the cabin, rejected object edit with 403 |
| Phone exploration/building | touch walking, thrust/steering, landing, claim, touch tree placement, refresh and saved object; focused replay passed in 32.9 seconds |

The phone route alignment uses the existing keyboard pilot helper after exercising
real touch thrust and steering. This is phone-viewport coverage on a Mac, not a
physical-phone performance claim or an entirely touch-driven automated flight.
App page-error arrays were empty; build views had no horizontal overflow. Screenshots
were inspected to verify visible scene content rather than canvas existence alone.

The initial run passed three cases; the fourth was deliberately interrupted after
the temporary driver selected the default world already claimed by the desktop
case. The app's default bearing does not promise an unclaimed planet. The replay
selected an unclaimed world and passed. No production permission, flight or save
rule was relaxed. This is three initial passes plus one focused replay, not a
single all-green four-case run. [Results](results.json) retain that distinction;
`first-attempt-phone-*` screenshots retain the earlier attempt.

- [Desktop harbour](desktop-harbour.png), [phone harbour](phone-harbour.png).
- [Desktop flight](desktop-flight.png), [phone flight](phone-flight.png).
- [Desktop building](desktop-built.png), [phone building](phone-built.png).
- [Desktop delivery](desktop-completed.png), [phone delivery](mobile-completed.png).
- [Independent visitor](desktop-visitor.png).

## Real redeployment persistence

After every browser context had finished its reopening actions, a private baseline
was captured for four test identities. Delivery snapshots include the complete
player state; building snapshots include player state, current planet and saved
object transforms. Capturing after context closure matters because the final save
can increment a revision; earlier screenshots are not the comparison baseline.

The existing workflow was explicitly dispatched on the same release commit. Fly
updated the existing machine and passed its deployment checks. After that successful
redeploy, all four identities returned exactly the same compared state:
[comparison results](redeploy-compare.json). This exercises persistence through an
actual hosted release, not just refreshing a page. A separate manual CLI restart
was not performed. The local original SQLite database was neither uploaded nor
modified; the hosted app has its own persistent data volume.

Test cookies remained in a private temporary directory and never entered Git or
this report. Their observed attributes were Secure, HttpOnly and SameSite=Lax.
No user cookie was cleared. Owned runners and browser contexts were closed; no
local preview server was started. During release, 100 untracked files with ` 2`
in their names appeared locally; all matched their corresponding tracked files.
Their source is unconfirmed. They were retained and excluded from every commit.

## Boundaries

Hosted persistence and core interactions above are verified. No public load test,
physical handset run, cross-device account recovery, C10 logging or Claude module
integration is claimed. Earlier local stress/failure evidence remains in its
original folders. The student still needs to demonstrate and explain the work at
the crit and contribute to the session. This report does not claim a course cutoff
tag, tutor judgement or mark.
