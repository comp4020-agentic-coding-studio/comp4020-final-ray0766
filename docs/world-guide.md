# Local world guide

The fixed scene guide is part of the [published Final](releases/final-2026-10.md). The paid AI trial below is local-only. The [Find ship routing repair](integration/usability-fixes-20261026.md) in this revision proves nearby bent connections without changing the walking, collision or boarding rules.

Press **Space** or choose **Guide** to talk to Sprout beside your character. Use **Close** or **Close and walk** to dismiss the conversation. **Esc** only releases mouse capture. **Tab** opens Pause from the game scene; within this conversation it keeps native focus navigation. Typing spaces and activating focused buttons keep their native behaviour. A small non-modal bubble is anchored beside the guide in the existing 3D scene, without changing camera or opening a full-screen page. Close and walk returns control; mouse capture only resumes after another explicit click. Touch has Guide buttons outside and in the home interior.

Sprout stands at a nearby collision-checked spot only while talking. It never leads, follows, waits for a player, pushes or becomes a saved object. If no safe spot exists, fixed help remains in a small bubble with an explicit explanation. Room/planet changes close the conversation. Inside, help remains available but outdoor routes require leaving the room first.

Choose **My planet**, **Place a module**, **Find ship**, **Return**, or **People & saving**. A destination selection replaces the previous ground route. Close the bubble and walk the validated arrows yourself; Clear route removes it. The route planner uses the existing geometry checks and declines unproved connections. Indoor/offline periods hide navigation; a planet change clears it. These are walking directions, not ship routes. Automatic ship travel remains unchanged, with no visible flight rails.

## Local help and authorised AI trial

Topic buttons and **Use fixed help** remain documented local instructions. The limited keyword fallback says when it has no answer and is never labelled as a live model reply.

The 8152 local trial now supports **Ask AI**, using `deepseek-flash` with thinking disabled and streaming. The visible disclosure explains that an explicit question sends only that question and public gameplay instructions to DeepSeek. It sends no conversation history, saved worlds, player identity or private messages. The model has no game tools and cannot change permissions or state. Answers may be wrong; fixed help is available throughout.

The server validates the existing cookie identity, then atomically reserves one of 8 attempts per rolling 60 minutes and a conservative share of a persistent US$1 trial budget. Tabs share the allowance and restart preserves it. Invalid/empty questions and refused duplicate requests do not consume a call. An attempted upstream request counts even if it fails or the player stops it. The interface shows remaining attempts, earliest slot recovery and approximate budget remaining. Calls stop if another reservation cannot fit, or at the authorised trial end: 1 January 2027, 00:00 Australia/Sydney (UTC+11; 31 December 2026, 13:00 UTC). Future calls use twice the peak rate verified on 25 October as conservative accounting headroom, not a promise of December supplier prices. Historical request charges remain unchanged. Clearing cookies can create a new identity; this is not absolute abuse prevention. The global budget is the backstop.

`GET /api/guide/status` returns non-secret availability; `POST /api/guide/ask` streams bounded replies. The existing `/api/guide/help` fixed/mock boundary remains. Default server configuration is still AI-off; only the explicitly authorised local backend loads the external user-filled key. No production configuration was changed. See [policy, configuration and actual verification](integration/local-guide-ai.md).

## Verification boundary

Targeted tests cover keyboard ownership, local answer limits, collision-checked placement, stationary actors, route selection/cancellation, context changes and the fixed/mock server boundary. The separately recorded AI checks cover persistent quotas, reservations, failure/cancellation and actual streamed replies. Browser checks use isolated data, desktop and touch-emulated narrow Chrome. A validated example is not a guarantee that every custom layout has a connected route. Evidence lives in the local task workspace; it is not human playtest evidence or a production release.

Find ship reuses the same validated walking route, not a second marker. Indoors, choose it and leave through the room door; guidance continues outdoors. Near the ship, close the bubble and use E / Board your ship. While aboard, the guide button explains that ground guidance resumes after landing.
