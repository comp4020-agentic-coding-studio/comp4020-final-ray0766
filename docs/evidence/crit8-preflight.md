# Crit 8 preparation — 2026-10-06

Historical status at this preflight: local review candidate only. No push, visibility change, deployment or
submission has happened. No gameplay, schema or dependency changes were made.
Application baseline: `68279a9` on `prototype/small-world-c8`; implementation
`103a7ff`. README, PROCESS and reflection are AI-assisted drafts pending student
review. The older detailed README is retained as `docs/player-guide.md`.

## Course requirements and authorship

Official pages checked on 2026-10-06:

- [Crit 8](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/08-its-alive/)
- [Final project](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
- [Assessment](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/)
- [AI use and integrity](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/ai-use-and-integrity/)
- [Hosting access](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/hosting-access/)

The policy permits AI drafting with human responsibility and prohibits false
accounts of process. The brief advises students to draft their arguments themselves.
The current drafts follow the student's recorded choices and explicitly distinguish
agent implementation/testing from student direction. They are not approved personal
statements or proof that academic writing requirements are complete.

## Executed local checks

| Check | Result |
| --- | --- |
| `pnpm lint` | exit 0 |
| `pnpm build` | exit 0; JS still `index-BfIgytnH.js` |
| `pnpm check` | exit 0; TypeScript and 25 tests in 10 files |
| `pnpm check:evidence` | exit 0; mechanical existence/citation checks only |
| Root and `/readme/` HTTP checks | 200; course heading invariant passes |
| Independent HTTP persistence test | character, ownership, saved object and complete universe identical after actual server process restart |
| Duplicate object create | succeeds without duplication; covered by store and HTTP checks |
| Independent visitor write | rejected with 403 |

Tests used a fresh temporary database and loopback port. The original `.data`
store and port 8080 were untouched. The owned temporary server was terminated at
the end; no browser was started and no cookies were cleared. The existing 650 kB
bundle advisory remains; no threshold was changed. Existing browser evidence is
in round 6, not represented as a fresh browser run. Existing tests cover database
reopening for delivery progress and saved flight/ownership as well.

Private temporary command logs and JSON run summary were retained outside Git.
The test database contains disposable identities and is not a publication artifact.

## Complete history publication review

Reviewed all 13 reachable commits and 388 unique blobs (44,527,058 bytes).
Gitleaks 8.30.1 was downloaded from its official GitHub release and its archive
SHA-256 was checked against the release checksum list. Full-history scan with
`--log-opts=--all` and 100% redaction exited 0 with no findings. Additional local
pattern scans checked course keys, private keys, known token forms, literal session
cookies, saved identity fields and database-file signatures.

No tracked databases, local token files, private keys or literal session-token
values were found. Cookie candidates in failed-run excerpts are source interpolation,
not captured cookie values. A long identifier in the asset catalogue is an asset
name, not a visitor. Existing screenshots are application evidence; there was no
new browser capture in this preparation pass. Scanning is evidence, not a guarantee
that every possible sensitive string can be recognised.

Historical documents and test logs contain local filesystem paths. One non-noreply
Git email belongs to the inherited initial template commit; later implementation
commits use noreply addresses. These metadata and paths become visible with the
complete public history. No history was rewritten and no value is reproduced here.
Publication approval should account for the whole history, not just today's files.

## Remote, credentials and cost boundary

GitHub read-only checks found the repository PRIVATE, remote `main` at `07b2f35`,
and the only workflow run with both check/deploy skipped. There are no GitHub
Deployment records. The repository has an Actions secret named `FLY_API_TOKEN`
(updated 2026-09-28); its value was not read and its validity has not been tested.

The local checkout has no `mise.local.toml` and no `FLY_API_TOKEN` environment value.
The existing Fly login lists a personal organization and cannot read the target
course app. This is an access blocker for manual deployment, not proof the app
does not exist. No new token, account, organization or resource was created.
The course documents a separate app-scoped token delivered through Ed and a
separate deploy credential installed for Actions. Public CI is therefore a possible
existing-credential path, subject to publication approval and a successful run.

Course hosting documentation says the course pays within its default allocation.
The unchanged config specifies one shared-cpu-1x, 256 MB machine, one 1 GB `/data`
volume, Sydney region and automatic stop/start. No extra machine, dedicated IP,
paid plan or expanded volume was requested. Actual application allocation and
organization cannot be verified with the current local credential.

The workflow runs checks only when public. A push to public `main` runs container
build, type/tests, evidence and secret scans, then deploys with `--remote-only
--ha=false` and checks the live root. Public pull requests run checks without the
main deploy condition; workflow dispatch on public main can also deploy. Changing
visibility alone does not trigger a push event. Its deploy condition must be
included in approval for publication/main delivery.

## Planned hosted acceptance — not executed

1. Confirm the reviewed documents and exact commit; obtain publication approval.
   Preserve the original local save. Use the existing course app only.
2. Publish the approved history and deliver the candidate to `main` through an
   authorised operation; inspect the actual check and deploy results.
3. Verify HTTPS `/`, `/readme/`, `/credits/`, the expected bundle and server-rendered
   README content. Check secure session-cookie attributes without recording values.
4. Use one isolated Chrome instance at 1920×1080 and 390×844. Complete a delivery,
   then fly, land, claim and place an object through controls. Refresh/reconnect and
   verify saved state. Check a second visitor can see but cannot edit the object.
5. Once the course app is confirmed to be the new test deployment, restart its one
   service and confirm the same test state survives. Do not erase or replace the
   volume; document any failed attempt and shut down owned browser contexts.
6. Update README release status only after hosted success, retain exact CI/deploy
   links and evidence, and separately confirm any formal course shipping action.

Unfinished: student review of writing, public approval, credential path validation,
successful remote CI/deploy and hosted acceptance. Claude module integration,
COMP8020 research note and C10 logging remain outside this Crit 8 preparation.

## Subsequent release authorization

After reviewing the reflection and the history privacy findings, the student
approved making this exact course repository public, pushing the stable candidate
to main and deploying within the existing course allocation. They requested a
new reflection opening beginning with topic selection; the supplied wording was
applied and the remaining two paragraphs retained. Publication/hosted execution
results belong to a subsequent release record.
