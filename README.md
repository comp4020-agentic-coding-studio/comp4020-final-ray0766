# Little Worlds · 小星球

[Published version](https://comp4020-final-ray0766.fly.dev/) · [Release checks](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/workflows/checks.yml) · [Current player guide](docs/player-guide.md)

Little Worlds is a shared browser world for a few friends or classmates: make a home, travel between planets and encounter other people. Each browser identity has one home planet; the public village gives everyone somewhere to meet. The aim is a place worth walking through and returning to, without scores, resource grinding, player chat, trading or combat.

**Version boundary:** this README describes the Final integration on `integration/midpoint`, developed from `d5e524c`. Its preview is [localhost:8152](http://127.0.0.1:8152/?measure=1). The published link above remains the older `d5e524c` production release; pushing this development branch does not deploy it. [Local readiness and evidence index](docs/integration/final-local-readiness.md) separates current checks, historical measurements and remaining limits.

## A short first visit

1. Load the world and choose a picture quality. English is the default; an explicit Chinese/English selection persists. The device notice and retry controls work before the game module loads.
2. A new browser identity creates a traveller: three face shapes, three haircuts, five skin tones, three eye colours and three coat palettes. **Save and explore** must be acknowledged by the server before play. Back saves nothing and offers a clear way to resume. Existing identities retain progress and saved appearance, or receive a compatible new default.
3. Walk the village, or press **Space / Guide** to ask Sprout for fixed local help. **My planet** points towards the return gate; **Find ship** draws a validated ground route. Close the small scene conversation and walk yourself. The guide stays beside you and never leads or moves the player.
4. At your home, **Menu → Build on my planet** lets you place a ready-made module. At the ship, choose a destination and **Depart**. Takeoff, flight and landing are automatic. Visit another world, then use its gate to return to the main planet or your own home, or return by ship.

The optional Mica → Sol delivery and village guide remain available, but are not required before using the main exploration tools. Keep your browser cookies: this anonymous identity has no account recovery or cross-device login.

## Current controls and safeguards

- **Menu + Tab** opens Pause from the game scene. Within a menu/editor, Tab and Shift+Tab navigate controls. **Esc only releases the mouse**; use explicit Close/Resume/Cancel controls to leave an interface. **Space** opens the stationary, scene-anchored guide without stealing spaces from inputs or buttons.
- Click the outdoor scene or **Click to look** to capture the mouse. WASD/arrows walk, Shift runs and E uses a nearby action. Menus, focus loss and Esc release capture; another click is required to resume. Touch retains dragging, the walking stick and action buttons. Characters cannot jump. **Menu → Return to safe ground** asks for confirmation and only recovers that character to the current planet's safe landing area.
- All rooms use the existing fixed **2.5D** view, including restored sessions. Entry releases mouse capture; exit restores outdoor observation. Doors, walking, furniture editing and fixed-angle photos remain. The walking-room wall cutaway can be abrupt near corners; its visual treatment remains a pending decision, not a repaired defect.
- Flight has no manual mode or visible rails. Drag to orbit the view. Clicking a real planet asks before changing the destination. **Skip journey** waits for destination preparation and server confirmation. **Cancel · return to departure** changes the trip back to its captured origin. Reconnect/refresh offers Resume, Skip or Return. These are versioned server trips, not an exception to ordinary movement checks.
- **Menu → Name my planet** changes only the owner's name. The server rejects normalized duplicates; IDs, ownership and saved objects remain stable. Visitors may use gates and nearby exterior doors, but cannot build, enter/edit another owner's room or read private history.
- Sprout offers bilingual fixed help and truthful unknown answers. The authorised **local AI trial** streams optional DeepSeek replies after an explicit Ask AI action, limited to 8 upstream attempts per browser identity per rolling hour and a persistent US$1 trial budget. Fixed help and the core route require no model service; see the [guide boundary](docs/world-guide.md) and [trial verification](docs/integration/local-guide-ai.md). Later appearance edits use **Menu → Your traveller**, with Save/Cancel and conflict recovery. The old courier renderer, model choice and comparison gallery are retired.

## Design goals and evidence

Connected paths, readable entrances and clear return routes matter more than feature count. [Messenger by Abeto](https://messenger.abeto.co/) and its [author interview](https://www.commarts.com/webpicks/messenger) inform the spherical-world composition and navigation. Our village, traveller and workshop use original/credited assets; see [asset credits](ASSET-CREDITS.md).

The table maps goals to current [CLAUDE rules](CLAUDE.md) and relevant checks. The presence of a test is not a claim that every test just ran; the [readiness index](docs/integration/final-local-readiness.md) separates current results from historical evidence.

| Goal | CLAUDE rule | Representative checks |
| --- | --- | --- |
| Understand loading and first creation | Honest loading and accessible interaction; appearance contract | [Welcome](spec/welcome.test.ts), [quality/Retina](spec/quality.test.ts), [first character](spec/first-character.test.ts), [entry lifecycle](spec/character-entry.test.ts) |
| Coherent movement and input | Movement and readable views | [Scene shortcuts](spec/scene-shortcuts.test.ts), [mouse look](spec/mouse-look.test.ts), [walking-only physics](spec/sprint-jump.test.ts), [safe recovery](spec/ground-recovery.test.ts), [stairs](spec/stair-replay.test.ts) |
| Find a destination without a tutorial dependency | Honest loading and accessible interaction; bounded local AI trial | [AI quota/budget](spec/guide-ai.test.ts), [Guide interaction](spec/guide-interaction.test.ts), [validated ground routes](spec/tutorial-route.test.ts), [automatic trips and names](spec/auto-trip.test.ts) |
| Travel without repeated blocking preparation | Movement and readable views; loading | [Preparation/retry](spec/flight-preparation.test.ts), [bounded cache](spec/orbit-preload.test.ts), [checkpoint pacing](spec/flight-checkpoint.test.ts), [flight boundary](spec/flight-boundary.test.ts) |
| Consistent rooms and meaningful ownership | Movement; Identity, persistence and observation | [Fixed room projection](spec/indoor-room-view.test.ts), [home lifecycle](spec/panel-loading.test.ts), [owner access](spec/home-owner-access.test.ts), [visitor gates](spec/teleport-station.test.ts) |
| Preserve and explain saved changes | Identity, persistence and observation | [Appearance](spec/appearance.test.ts), [save acknowledgements](spec/save-progress.test.ts), [HTTP business observation](spec/business-log-api.test.ts), [log privacy decision](docs/adr/0009-business-observation.md) |

## Limits, writing and release status

SQLite persists acknowledged writes. Movement status does not include an unsaved building/room/appearance draft; finish its explicit Save and wait for confirmation. Offline interaction uses the existing retry/recovery paths. Nearby presence is ephemeral and planet scoped, with at most 16 visitors and four detailed avatars; it grants no permissions. Room layout descriptions are not confidential storage.

Smooth/Standard/Beautiful and Auto retain pixel and resource budgets. The opening notice recommends Smooth and, if necessary, a more powerful computer; network/browser settings may also explain failures. No GPU minimum is established. Flight caches at most 12 detailed worlds on Smooth and 16 on other presets, drawing at most eight detailed and 24 solid worlds nearby. The first detail wait is capped at 12 seconds before coarse-world interaction continues. These are count/time bounds, not RAM, GPU-memory or frame-rate guarantees.

The author has confirmed the Crit10 peer trial and log exercise; [the Crit10 record](docs/crit10/README.md) distinguishes that report from automated checks. The author-approved English revisions are in [PROCESS](PROCESS.md), [the reflections](reflections/) and [research-note](research-note.md). The reflections retain their Crit-stage experiences and AI-assistance notes; later Final changes are not backdated into those accounts.

Historical [8098 delivery evidence](docs/optimization/2026-10-final-delivery.zh-CN.md), [prototype player-guide snapshot](docs/integration/player-guide-history-20261025.md) and dated performance measurements describe their original versions. Current local tests do not establish physical-phone performance, all custom buildings, long-session/public-load capacity or a new production release. The full default regression suite has not been rerun for this close-out; it remains a separately approved release check. A local preview or development-branch push does not establish a production release. The optional live guide remains a local-only trial; no production AI credentials or trial ledger are included.
