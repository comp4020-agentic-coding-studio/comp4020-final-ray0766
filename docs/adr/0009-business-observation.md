# ADR 0009: Observe actions without exposing browser credentials

## Decision and permissions

An anonymous browser identity remains the person in this app. Its HttpOnly cookie
is an authentication credential; the server's stored hash is internal identity,
and neither belongs in logs. Only a planet's owner may change its buildings,
terrain or private room, enter that room, or read its history. Everyone may see
public outdoor geometry and presence. A gate links only the current identity's
home and the harbour. These existing server checks remain unchanged.

The HTTP server records accepted business actions and refusals with an ISO time,
an observation-only `visitor-…` alias, action, validated-format planet/object IDs,
HTTP status, outcome and a fixed reason code. Coat and delivery details use fixed
enums. Unknown error text, names, designs, complete bodies, cookie values and
internal session hashes are excluded. A separate random 32-byte key beside SQLite
derives aliases with HMAC-SHA256; the alias cannot authenticate any request. Keep
that key private. With the same key, aliases remain stable across server restarts.
New key material changes aliases; it does not change any player or permission.

## Storage, budgets and reading

Each event goes to stdout for the existing `flyctl logs` workflow and to
`<DATABASE_PATH>.business.jsonl`. Before an append would exceed 1 MiB, that file
replaces `<DATABASE_PATH>.business.jsonl.1`. Only these two journal files remain,
plus `<DATABASE_PATH>.business-key` (mode 0600). They live beside the existing DB
on its persistent volume; no schema migration or new service is involved.
Files survive ordinary restarts and redeploys when that volume is preserved.
Old events are deliberately evicted on rotation; this is not an unlimited audit
archive or a power-loss durability guarantee. All three paths are gitignored.

Successful universe/library polls are omitted. Movement, flight checkpoints and
presence are sampled at most once per five seconds per actor/action/status;
repeated refusals use the same bound. The throttle map holds at most 2048 entries.
Discrete actions such as claims, coat changes, building saves and travel retain
individual records. Movement logs show accepted checkpoints, not every frame.
If a journal append fails, stdout continues and stderr reports degraded storage;
diagnostics cannot turn a completed database save into an apparent failed save.
The key must be readable at startup; loss/corruption is reported as a startup error.

Locally, replace the example path with the isolated server's actual DB path:

```sh
tail -F /tmp/example.sqlite.business.jsonl
cat /tmp/example.sqlite.business.jsonl.1 /tmp/example.sqlite.business.jsonl
```

On the deployed service, use `mise exec -- flyctl logs -a <repo>`; an operator
with shell access can also read the two files beside the deployed DB. There is
no public logs endpoint. Do not publish the key, DB, log files or credentials.

## Entry and save feedback

An old identity without a home gets a bilingual explanation when it approaches
the harbour gate. The existing ship guide, Atlas, flight, landing and claim flow
remains the route to ownership. No old identity is silently assigned a home.

Ground and flight movement feedback distinguishes pending movement, an in-flight
save and acknowledged movement. Each request captures a batch ticket; acknowledging
it leaves later movement pending. Recovery retires old tickets. The protocol,
350 ms save timers, authority and reconnection behaviour stay the same. Refresh
can still lose movement the server has not acknowledged. Blueprint, ship-design,
room-layout and placement previews still require their own explicit saves.

## Evidence and remaining human work

`spec/business-log.test.ts` checks privacy, restart aliases, rotation and sampling.
`spec/business-log-api.test.ts` uses a fresh isolated legacy server: two identities,
one claim, a coat change and a refused visitor write. `spec/save-progress.test.ts`
checks late acknowledgements and recovery; `spec/teleport-guidance.test.ts` checks
both languages and reuse of the existing guide without claiming or travelling.

These are technical checks. They do not establish hosted performance or complete
Crit 10. The author's [peer report](../crit10/peer-report.zh-CN.md) confirms play
and normal operation but supplies no matched action/log transcript. The
[reflection](../../reflections/crit-10.md) now uses the author's own account. Research-note authorship and visual or
control acceptance remain with the user.

## Crit10 source audit clarification (2026-10-16)

The current contract and limits are traced in
[the permission matrix](../crit10/permissions.zh-CN.md). Nearby visitors can operate
a shared exterior door; they cannot newly enter or edit another owner's room.
“Private room” above means owner-only entry and layout editing, not confidential
layout data: the current home descriptor includes the interior for visitors too.
The initial matrix recorded that visibility boundary and a generic room-save refusal
reason; subsequent logging corrections are recorded below, with permissions unchanged. The
[rehearsal pack](../crit10/README.md) separates host notes, URL-only participants,
blank observations and safe evidence export. It separates preparation, the user's reported trial and exact release evidence;
a template is never evidence that a rehearsal took place.

## Minimal logging corrections (2026-10-16)

The actual room-edit refusal now maps to `home_owner_required`. A successful
`home.door` may additionally include `doorOpen` and `doorVersion`, read only from
the authoritative post-action `currentPlanet.homeDoor` snapshot for the matching
requested building. Refusals, failed actions and absent/invalid/mismatched snapshots
never emit door state; request intent cannot supply it. An accepted no-op may repeat
the same version and is not evidence of another transition. No room contents,
coordinates or additional body data are logged. The [focused verification](../crit10/log-fix-verification.md)
uses temporary isolated servers; no permission or visibility policy changes,
human rehearsal or hosted deployment are implied.

## Arrival retry correction (2026-10-20 UTC)

`POST /api/arrival/retry` records `arrival.retry_requested` instead of
`api.unknown`. Accepted requests may be idempotent or subject to preparation
cooldown; this event does not assert queue execution or home completion.
Refusals retain the HTTP outcome and fixed reason without logging request bodies
or raw errors. The focused unit and isolated integrated/legacy HTTP tests cover
both accepted and refused requests; see [release verification](../crit10/release-verification.md).
