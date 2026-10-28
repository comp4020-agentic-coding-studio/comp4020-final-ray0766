# Original ambient music — 28 October 2026

An original 32-second, four-bar bell/pad miniature is synthesized locally with Web Audio oscillators and a shared low-pass filter/master gain. There are no downloaded tracks, samples, new dependencies, external music services or copied Messenger music. Messenger only describes the requested gentle atmosphere. Notes have soft attacks/decays; initial master volume is 14%, adjustable in **Menu → Background music**. Only a real click or keypress starts audio; no context is created before interaction. Muting suspends the shared context and stops the scheduler/voices. Preferences are stored in localStorage, independent of game identity and saves. Hidden tabs suspend playback; returning respects the enabled preference. Unsupported/blocked playback is labelled for retry, never thrown as an unhandled game error.

## Verification and listening boundary

Three focused tests cover quiet/default and damaged preferences, one-context gesture lifecycle, toggle/volume persistence, visibility suspend/resume and unavailable audio handling. Typecheck, lint, build and evidence checks passed. The final main workflow supplies the complete release gate and deployment outcome.

Installed Chrome on the user's Mac ran the actual isolated game at 1920×1080 and touch-emulated 390×844. Native AudioContext instrumentation confirmed no context before character-save interaction; real playback reached running state, repeated on/off still used one context, and 25% volume plus off preference survived reload. A native analyser measured nonzero output peaks of approximately 0.0151 and 0.0161 at that volume. The [result](result.json) pins the music source and observations. The visibility transition was a controlled unit fixture, not an independently timed OS background-power benchmark.

**No subjective listening was performed.** Audio signal/state verification does not establish that the melody sounds pleasant, matches a reference or is audible at every device volume. The user can assess it through the site and adjust/mute it. No real AI request, player-data reset or credential/budget change was made. Existing game controls and Space/chat ownership are unchanged.

- [Desktop controls](desktop.png)
- [Narrow controls](narrow.png)

The screenshots show isolated test identities, not production model responses or budget data. Final SHA-specific CI/backup/deploy results are separate from these local checks; documentation does not redate the earlier 34-hour retention evidence.
