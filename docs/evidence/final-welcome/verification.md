# Opening screen — local candidate

Based on `d5e524cf948c4d8da6476b61d5189ceb3df853a6`, with the concurrent local movement repair. Nothing was committed, pushed or deployed by this work.

## Implementation

- The opening uses the current main planet, rendered offline from `createWorld(scene, true, null, [], {}, 21.6)`, including the actual public-town buildings, roads, terrain and vegetation. This is a cover illustration, not a live view of the current visitor's saved location.
- `public/assets/welcome/main-planet-v1.webp` is a transparent 1200 × 1200 WebP, **161,748 bytes**. [Asset provenance](asset-provenance.json) records source, camera, lights and content hash. Only navigation light columns were hidden for the still. No imported reference art or vendor edits.
- The browser loads the still before the main module. The capture renderer is an offline tool, never a runtime import; the game still creates only its existing world.
- Inline critical CSS and the welcome module share the same visual rules. The existing loading/readiness state machine, unknown-total indeterminate progress, full approved performance notice, quality controls, language preference, error retry and return-player path remain.
- Chinese title is **小星球** and the button is **开始探索**. English uses the existing **Little Worlds** brand and **Start exploring**. The visible language control remains the existing host control.

## Verified

All final screenshots below came from the real production-style Vite build at isolated `127.0.0.1:8164`, with API requests proxied only to this task's isolated test server at `8150`; fresh browser contexts, no production data. Chrome **155.0.8059.85**. Narrow viewport is desktop Chrome emulation, not a physical phone measurement.

- [Desktop ready](desktop-ready.png): 1920 × 1080, Chinese.
- [Narrow ready](phone-ready.png): 390 × 844, Chinese.
- [Narrow English](phone-en-ready.png): 390 × 844, English.
- These three cases had zero page errors, no horizontal overflow, a visible complete performance notice, a working Smooth quality selection, and Enter activating the focused Start button. With reduced motion, the opening contained zero running animations. [Machine-readable results](result.json).
- [Desktop before modules](desktop-before-module.png) and [narrow before modules](phone-before-module.png): module request deliberately held; image and approved notice visible, zero game canvases, Start disabled, progress has no invented value.
- [Desktop module failure](desktop-module-error.png) and [narrow module failure](phone-module-error.png): deliberately failed the main module request, then focused Retry and pressed Enter. Reload reached actual world readiness and restored the quality control. [Retry results](retry.json).
- Welcome / loading-state / quality tests: **3 files, 28 tests passed**. [Test results](tests-final.json).
- `tsc --noEmit`, focused ESLint (`welcome.ts`, `welcome.test.ts`), `git diff --check` and Vite production build passed. The existing >650 kB chunk warning remains; this work makes no loading-speed or physical-device performance claim. [Build log](build.log).

## Iterations and limits

The first narrow layout measured 404 px scroll width in a 390 px viewport and overlapped the intro with the bottom of the illustration. The final narrower image and spacing measure 390 px scroll width. The English narrow panel retains 14 px of vertical scrollable padding; all controls and the full notice are within the viewport.

An initial unit-test command was unable to reach the local health endpoint inside the network-restricted sandbox; no tests ran. The normal permitted local test invocation subsequently passed. A failed-module attempt against the Vite development server unexpectedly reached readiness instead of remaining failed, so it was not counted as retry evidence. The final repeat used the static production build, without hot reload, and both viewport cases passed.

The attached reference image was described by the parent thread after it viewed the user's attachment. This implementation follows that composition; it does not claim a pixel comparison with the reference. The final integrated build also passed desktop/narrow cold-cache loading at 300 ms latency and 196,608 B/s download, then offline freeze, reconnection and saved-position reload. Readiness took 16.165 / 16.293 seconds in that local run. Detailed network results remain outside this archive at `/Users/ray/Documents/Codex/2026-10-21/task/rail-validation/network-combined/result.json`; the full local delivery report is `/Users/ray/Documents/Codex/2026-10-21/task/final-local-review.md`.
