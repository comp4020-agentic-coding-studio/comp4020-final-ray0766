# Working baseline, approvals and operational history

[CLAUDE.md](../../CLAUDE.md) holds the standing rules. This page keeps the operational detail those rules used to carry: where the work happens, which local services exist, and which releases and trials were approved, by date. It is a record, not a second set of rules; when a rule and this page seem to disagree, the rule wins and this page is out of date.

## Where the work happens

- Directory `/Users/ray/Desktop/Study/ANU-Master/8020/comp4020-final-ray0766`, branch `integration/midpoint`. Read [MIDPOINT](../../MIDPOINT.md) and its [source ledger](midpoint-sources.zh-CN.md) first. Old worktrees, the independent Claude source workspace and archived directories are kept for reference and must not be overwritten.
- The frozen 8098 release and its `.data/midpoint` save and configuration stay intact unless a task explicitly authorises changing them. Its managed entry is `node scripts/local-preview.ts`; it refuses sample or empty databases.
- The current isolated preview is 8152. Its latest source, build and data checks are indexed in [local readiness](final-local-readiness.md).
- Production is the course Fly app with one shared-cpu-1x / 256 MB machine and one `/data` volume; `DATABASE_PATH` is `/data` in the container and `.data` locally.

## Approvals on record

- **25 October release approval.** A backed-up 8152 restart, fast-forward integration into `main`, its ordinary push and the existing Fly pipeline with a compatible migration. It did not authorise production AI and granted no standing approval for later releases.
- **25 October HD close-out.** One isolated full test run and bounded repair and rechecks, plus sanitised summaries and necessary screenshots. The first failed run is preserved in the [Final verification record](../evidence/final-hd/verification.md). It did not authorise production changes.
- **Local guide trial and production handoff.** The local paid trial is described in [its verification record](local-guide-ai.md). The 27 October authorisation transferred the existing trial, its ledger and its US$1 cumulative budget to production and retired local paid access, as recorded in [the handoff](production-guide-20261027.md). Future calls are priced at twice the peak rates verified on 25 October.
- **Usability repair gate.** The later local usability repair completed the full gate at 153 files / 978 tests ([record](usability-fixes-20261026.md)). That count is kept separate from the 971-test release of 25 October; the [release record](../releases/final-2026-10.md) says which deployment carried which checks.
- **Crit 10 human exercise.** Peer use and the log practice are author-confirmed complete. Automated evidence differing from them is not a reason to reopen them as missing.

## What the rules still require of this history

Each release approval names the intended external action and covers only that release. Commit, branch push, production deployment, migration and submission remain separate permissions, and none of the approvals above authorises the next one.
