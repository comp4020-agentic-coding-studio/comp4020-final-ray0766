# Candidate handoff: planned main planet and teleport stations

Prepared 2026-10-13. This candidate is local only:

- nothing is pushed;
- 8098 still serves its own checkout and database;
- switching 8098 needs the user's separate approval.

## What 8098 runs today

Port 8098 serves `8020/final-workshop-v1`. That checkout of the same
repository sits at `4f0d596` ("Complete v10 village town and shared wide
entrances"). Its database is `final-workshop-v1/.data/little-post.sqlite`
(schema 15, 207 players).

## Commit range

The candidate is branch `claude/little-worlds-planet-redesign-072c03`,
`4f0d596..667bd24` (23 code commits; this note's commits after it change
documents only). `4f0d596` is an ancestor, so the branch
applies on top of what 8098 runs.

`package.json`, `pnpm-lock.yaml`, the Dockerfile and `fly.toml` are
unchanged.

The range has two layers:

**1. `298a440`: imported baseline**

- 100 files.
- A snapshot of the uncommitted 8134 village workspace
  (`~/Documents/Codex/2026-10-08/task-2/little-worlds-village`): the v11
  ground camera and the wide-road town.
- That workspace was never modified.
- Its own record (`docs/integration/ground-camera-v11.md` there) says the
  camera work was still being corrected and had not been accepted for
  release.
- The full `pnpm lint` errors come from these imported camera files.
- Switching 8098 to this branch also brings this camera work. If it is not
  accepted, it is a separate decision.

**2. `c844e0b..667bd24`: this work (22 commits, 73 files)**

The planned main planet:

- a plan → ledger → scene pipeline;
- continuous streets with kerbs;
- 57 structures (56 buildings and the portal) from shared workshop
  compositions;
- 18 appended village-kit parts;
- the `?plan=1` debug view;
- the ledger is now v15.

Teleport stations:

- a 4.7 m wormhole portal with a lit standing pad and a console;
- on the harbour's Arrival Square and on every home;
- they link only a player's own home and the harbour;
- visitors cannot use another home's gate;
- older homes get their gate the first time their owner is home.

Starport terminals:

- a 14.6 m tower beside the harbour boarding gate;
- a slim tower on every home pad;
- lit boarding rings that match where "Board your ship" appears;
- a boarding console at the harbour gate;
- amber and violet light columns over the harbour terminal and portal.

Persistence:

- schema 16 adds `teleport_requests`, `home_stations` and `teleport_marks`;
- `teleport_marks` belongs to the withdrawn landing-mark feature; it stays
  empty on a fresh migration and nothing reads or writes it;
- the hub physics version stays 9; every other planet's is now 8.

Withdrawn in this range and absent from the final tree:

- the multi-destination teleport list;
- landing marks;
- the old-save mark back-fill.

## Databases: keep the live one

- **Never** copy a candidate or preview database onto the live path.
  - In this candidate the copies are `For-ai/little-worlds-teleport/teleport-candidate.sqlite`
    (8143), `verify-8144.sqlite`, and the worktree's `.data/*.sqlite`.
  - In the 8134 workspace it is `village-preview.sqlite`.
- They are copies or forks, and they hold test identities:
  - the 8143 copy has 7 test players from the final checks;
  - 8134's preview has 15 identities that 8098 does not have.
- The switch serves the new code on the existing live file.
- On first start the server migrates schema 15 → 16. It first writes its
  own `VACUUM INTO` backup next to the database.
- The new tables start empty. No player, building, library or history row
  is rewritten on open.

**Dry run on a fresh copy of the live database (2026-10-13)**

The new code opened the copy and read every player once, as the first
requests after a switch would:

- 207 players, 22 tables before migration, schema 16 after, backup written;
- 0 positions moved, 0 sent to a landing point, 0 read failures;
- 178 hub ground rows revalidated at scene revision 1015, physics 9;
- private-planet rows at physics 8;
- 0 stations placed (they wait for each owner's visit) and 0 marks.

**Where 207 and 220 come from**

- 207 is the live 8098 database. The candidate copy was taken from it. Its
  pre-migration backup has exactly the same 207 player identities, coats,
  quest and delivery states.
- 220 comes from the 8134 workspace's preview database
  (`village-preview.sqlite`). Its camera record reported 220 players when it
  was checked; it holds 221 today.
- 8134 and 8098 share 206 identities:
  - 8134 has 15 more, created by its own preview sessions;
  - 8098 has 1 more, a player who arrived after 8134 forked.

## Switching 8098 (only after approval)

1. Take a consistent copy of the live database with
   `sqlite3 <live> ".backup <live>.before-v15-<date>.sqlite"`. Check that it
   opens and has 207 or more players.
2. In `final-workshop-v1`, fetch the branch from this repository's local
   path. No push is needed. Check out the branch head; its last code commit is
   `667bd24`, and later commits only touch documents.
   - Leave the untracked `dist 2/`, `dist 3/` and
     `tests/e2e/crit8-update-live.spec.ts` alone.
3. Run `pnpm build`.
4. Restart the 8098 server with the same `DATABASE_PATH`. Confirm the log
   line "Before migration, saved a consistent backup: …".
5. Smoke test at desktop and phone sizes:
   - walk on the hub;
   - board and land;
   - home ⇄ harbour teleport;
   - enter and leave the home room.

## Rollback

An older server refuses schema 16. Rolling back means:

1. stop the server;
2. check out `4f0d596`;
3. rebuild;
4. restore the pre-switch backup.

Saves made after the switch are lost, so decide on rollback quickly. Do not
hand-edit the schema back.

## Final checks (2026-10-13, candidate 8143)

**Setup**

- Real Chrome 154 on an Apple M3, headless, driving real controls.
- Moving the test player onto a pad or onto the dock was a database edit of
  the 8143 copy only.

**Desktop 1920×1080, English**

- A new visitor starts at their own door, and their home has a gate.
- They enter the room and go back outside.
- They teleport from the home pad to the harbour and arrive on its pad.
- They board inside the harbour ring. Controls return 0.1 s after
  launching.
- A 34 s flight above the planet lattice lands them on their own home's
  pad: grounded, with the boarding prompt shown.
- They teleport to the harbour and back home again.
- No failed API request and no console error.

**Phone 390×844, Chinese**

- Room in and out, and home ⇄ harbour teleport.
- No failed request and no console error.

**Targeted specs and sentinels**

These are recorded in `teleport-stations.md` and
`planned-main-planet-v12.md`.

## Known limits

- Older homes get their gate when the owner is first home. Until then their
  owner arrives from the harbour at the landing pad.
- At a home pad the follow camera is pulled in when the tower is directly
  behind the player. That is the existing camera's reaction to a wall.
- There is no teleport animation or sound.
- Physical-phone performance, walk feel and camera review are the user's
  hand test.
