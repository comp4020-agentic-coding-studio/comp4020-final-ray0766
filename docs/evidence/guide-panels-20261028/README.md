# Independent help and chat panels — 28 October 2026

This revision separates optional local help and ground directions on the left from **Chat with Sprout · DeepSeek** on the right. They are sibling non-modal panels with independent launchers and close controls. **Space / Guide** opens help; **Chat · DeepSeek** opens chat. **Close and walk** closes both. Closing one panel retains the other panel and its state. Narrow screens place help above and chat below, with world space between them. Existing menu, pointer-lock, ground routes and stationary Sprout behaviour are retained.

The chat has a local, bounded message list (at most 24 entries), multiline input, explicit Send, streaming status, Stop, retry-status control and labelled failures/limits. Closing and reopening retains the page's messages; reloading clears that local transcript. Earlier messages are not sent upstream: the unchanged backend receives only the current question and public instructions. No credentials, pricing, limits, budget ledger, deadline or production player data are changed by this revision.

## Executed checks

Installed Chrome on the user's Mac rendered the real local game at **1920×1080** and **390×844** (touch emulation, Chinese). Fresh disposable contexts and a dedicated mock server/database on loopback port 8178 were used; the existing 8152/8098 databases and production profiles were untouched. The upstream adapter was replaced with deterministic mock streams and errors; **zero real provider requests** were sent. This verifies UI behaviour, not a new model-quality/latency or paid-production acceptance test.

Both viewport scenarios passed: independent container positions without overlap; ordinary click/tap Send; duplicate submission while pending sends once; Space typing and native Tab navigation; fixed topics draw a route without changing the AI reply; explicit upstream failure retaining the question; Stop; disabled-state feedback; closing/reopening chat with retained messages; closing help without closing chat; and Close and walk dismissing both. No page errors were captured. The [sanitised result](result.json) pins source hashes and lists the scenarios. The 13 affected unit assertions/tests passed, with typecheck, lint, client and worker builds and evidence check passing. The subsequent SHA-specific main workflow supplies the full release gate and deployment outcome.

The initial browser run exposed the page-wide footer positioning leaking into chat and intercepting Send. After isolating its header/footer layout, the narrow run exposed help overlapping the wrapped toolbar's Chat button. Moving narrow help below the toolbar corrected that obstruction. These were actual layout defects, repaired before the final pass; pointer interception was not bypassed with forced clicks. An earlier unit command also waited for the absent default 8080 service; it was corrected to use the owned 8178 service. Private failed driver receipts remain outside Git.

- [Desktop: left help and right conversation](desktop-chat.png)
- [Narrow: separate help and chat with visible world space](narrow-chat.png)

Both images were inspected. All responses and displayed budget amounts in these images belong to the mock fixture, not the production model or budget ledger. These are agent-driven checks, not a physical-phone benchmark, all-browser guarantee or new human usability study. The source hashes identify the exact UI exercised; the accompanying publication changes writing/evidence without retroactively changing the recorded 34-hour persistence result.
