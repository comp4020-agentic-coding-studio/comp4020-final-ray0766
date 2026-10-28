# Linked Space interaction and complete conversation — 28 October 2026

This follows the [independent-panel revision](../guide-panels-20261028/README.md). The existing eligible **Space / Guide** interaction now opens the left fixed help and right chat together, focusing the composer. A repeated eligible Space closes both; Space inside the textarea remains ordinary typing. Held keys, composition, modifiers, native button activation and open game dialogs retain their existing input rules. Esc continues to release mouse capture; explicit Close controls and Close and walk remain available. Closing/reopening retains this page's bounded transcript and incomplete response; it does not persist conversation history across reloads or send older messages upstream.

The right conversation has a stable height, a larger independently scrolling message history and a fixed input/send area. Header, status and actions stay inside the frame; history scrolling does not move the composer. Data disclosure is expandable, with a visible DeepSeek transmission summary. The compact quota retains remaining attempts, next slot and approximate budget, while the explanation includes failed/Stop attempts. None of the backend credential, budget, expiry, quota or model settings changed. Narrow layout retains non-overlapping upper help and lower chat, with visible world space between them.

## Actual verification

Installed Chrome on the user's Mac rendered the real isolated game at 1920×1080 (English) and 390×844 (touch-emulated Chinese), using the dedicated mock backend on loopback 8178 and fresh disposable browser contexts. **No paid provider request was sent.** Responses, errors and amounts in the screenshots belong to the mock fixture. Production and the original 8152/8098 saves were not used for this local check.

Both viewports passed: real Space opening both panels; typing spaces without closing either panel; native Tab navigation; separate close/reopen retaining messages; fixed-topic ground route selection; duplicate submit protection; explicit mock failure with retained question; Stop; disabled-state feedback; Close and walk; and scrolling a long synthetic history while the composer's vertical position changed by less than one pixel. Opening the data disclosure also left composer and footer within the dialog. The history initially measured about 443 px high on desktop and 163 px on narrow. Source hashes and exact bounds are in [result.json](result.json).

Held-key suppression, eligible Space close/reopen, and route replacement/clear are also covered by the affected unit tests. The existing indoor CSS-state fixture keeps chat actions visible, an indoor-frame unit check covers its launcher, and a narrow synthetic home-card fixture verifies toolbar Menu remains clickable. Those fixtures are not relabelled as an end-to-end room visit. There were no captured page errors. The 13 affected tests, typecheck, lint, client/worker build and evidence checks passed. The final SHA's main workflow supplies the complete release gate, production backup and deployment status.

- [Desktop complete conversation](desktop-chat.png)
- [Narrow complete conversation](narrow-chat.png)

Both images were inspected. These are agent-operated mock UI checks, not new real-model quality/latency tests, physical-phone performance measurements or human usability approval. The application changes no world geometry, saves or permissions. PROCESS, research and reflections are outside this follow-up. Subsequent publication/online checks do not redate this evidence.
