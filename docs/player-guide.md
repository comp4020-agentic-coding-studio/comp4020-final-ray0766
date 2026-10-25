# Little Worlds — current player guide

This guide describes the local Final candidate. Check [README](../README.md) for the difference between the current 8152 preview and the published release. The previous mixed prototype account is preserved as a [historical snapshot](integration/player-guide-history-20261025.md).

## Loading and your identity

English is the default when there is no valid saved language preference, regardless of browser language. Choose Chinese/English in the loading screen or interface; an explicit choice persists. Smooth is the first option to try if loading is slow or movement stutters. A stronger computer may help, but network and browser settings can also prevent loading. There is no verified minimum GPU. Preparation progress reports actual stages; use Retry after a failure.

Your identity is an anonymous browser cookie, not an account. Keep it to retain access to your planet. A new profile/private window creates a separate identity; clearing cookies does not recover the old one.

A genuinely new identity automatically opens **Create your traveller**. Choose a face, haircut, skin tone, eye colour and coat, then **Save and explore**. Only the server-confirmed save enables play. **Back to welcome** saves nothing and offers Continue creating or About. Returning within the same page keeps the draft; an unsaved refresh starts a draft again but still requires creation. Failed saves keep the current draft for retry.

Existing identities retain progress and saved appearance, or use a compatible new default. They are not forced through creation. Later, **Menu → Your traveller** offers Save/Cancel, a rotatable preview and explicit reload after a competing tab's save. Cancel does not change the stored look. The old courier option and comparison/trial page are retired.

## Move, look and open controls

| Input | Action |
| --- | --- |
| WASD / arrows | Walk; outdoor direction follows the camera |
| Shift | Sprint |
| E / nearby action button | Use the nearby door, person, gate or ship |
| Click the scene / Click to look | Capture the outdoor mouse for observation |
| Esc | Release mouse capture only |
| Tab from the scene / Menu button | Open Pause |
| Tab / Shift+Tab inside a UI | Navigate its controls |
| Space from the scene / Guide | Open Sprout's scene conversation |
| M / Atlas | Browse destinations |

Characters do not jump. Indoor movement stays in the fixed 2.5D room view. On touch, use the movement stick or tap the ground, drag to observe outdoors and tap action buttons. If mouse capture is unavailable, drag to look.

Menus, editors, focus loss and Esc release capture. Close/Resume/Cancel buttons return you to the world; click again to capture. Esc does not dismiss menus or the guide. Typing a space, activating a focused button or using Tab inside a form does not invoke scene shortcuts.

If an old saved ledge leaves you stuck outdoors, **Menu → Return to safe ground** opens a confirmation. Stay here changes nothing. Confirm affects only your character at the current planet's server-selected landing area; buildings, possessions and other players remain. Indoors, exit normally first. Recovery does not silently reset old saves.

## A short exploration route

The new identity starts in the public village while a private home prepares in the background. Home preparation may take time; failures have a Retry path. The Mica → Sol delivery and Village guide are optional. Skip or reopen that guide without resetting progress.

1. Press Space or choose Guide. Sprout appears beside you in the same world, with fixed bilingual help. Choose **My planet** for the gate route. Close the conversation and walk the arrows yourself.
2. At the gate, choose **Return to my home**. Enter your room, or use **Menu → Build on my planet** to place one ready-made module. A placement preview is not saved; confirm the placement and wait for acknowledgement.
3. Choose **Guide → Find ship**. Indoors it first says to leave through the room door. Outdoors, the same selection continues as validated ground arrows. The guide stays put; it does not lead or push you. A blocked/unproved route is explained rather than presented as safe. Choose another topic to replace the route or Clear route to remove it.
4. At the landing point, close the conversation and use **E / Board your ship**. Select a named destination and **Depart**. Main planet, My planet, Neighbour and Unclaimed distinguish the choices.
5. Explore as a visitor, then use any available outdoor gate to return to the main planet or your own home. If there is no gate, find the parked ship and choose a return destination.

Topic buttons and **Use fixed help** run locally. In the authorised local trial, **Ask AI** sends only your current question and public gameplay instructions to DeepSeek; no chat history, saves or identity are sent. Replies stream into the same scene bubble and may be wrong. The guide cannot operate the game.

The server allows 8 upstream attempts per cookie identity per rolling 60 minutes, shared across tabs and retained on restart. Remaining attempts and the next recovery time are shown. Upstream failures and Stop reply still count; invalid questions and rejected duplicate submissions do not. Use fixed help during an outage or limit. A persistent US$1 trial budget stops calls when another conservative reservation cannot fit; it does not reset on restart. The authorised trial covers all December and ends at 00:00 on 1 January 2027 in Australia/Sydney (UTC+11), equivalent to 13:00 UTC on 31 December 2026. It may stop earlier if the unchanged budget cannot cover another reservation. Future calls are reserved and accounted at twice the currently verified peak rate as price headroom; future supplier prices are not guaranteed. See [trial limits and actual checks](integration/local-guide-ai.md).

## Automatic travel

There is no manual flight mode, manual landing, altitude control or visible flight rail network. The ship takes off, navigates and lands automatically. Drag to orbit the 3D view; Look forward is optional and observation does not steer. Destinations remain real worlds; an edge indicator points towards a target outside the view.

Click a visible planet or choose another destination during a trip to open **Change destination?**. Confirm changes the server trip; **Keep destination** cancels the proposal. Clicking an interface control does not select a planet behind it.

**Skip journey** still waits for destination preparation and an acknowledged arrival. A failure offers **Retry arrival** and a return option. **Cancel · return to departure** re-plans to the trip's captured origin. It does not delete the trip or leave you stranded. Menu, focus loss, disconnection and refresh can pause a journey; Resume, Skip and Return remain explicit. Ground refresh restores the last acknowledged walking position.

World detail uses a bounded cache and background preparation; it does not preload the entire universe. A coarse real destination may appear before its detailed buildings. The server retains journey, sequence, boundary and collision checks; prepared automatic arrivals have their own limited trip contract.

## Homes, names and visitors

A new identity gets one home when preparation completes. An old identity without one keeps its old progress: use the ship to visit an unclaimed world, then **Menu → Make this my planet**. Having a planet and having an enterable room are separate; an older owner may need Set up my home. An existing home without a gate can be reached by ship; station siting is explicit and does not move saved buildings or silently rebuild a dismantled gate.

**Menu → Name my planet** changes only your own planet. Names use 1–32 characters. Trimmed, NFKC-normalized, case-insensitive duplicates are rejected by the server; keeping your current name is allowed. Names appear in destination and visitor views, while stable IDs and permissions remain unchanged.

Only an owner can build, enter/edit the private room or read private history. Nearby visitors may operate shared exterior doors and use gates; neither action grants ownership. At a neighbour's gate, E / Go to the main planet returns to the harbour, while Return to my home goes to your own world. Without a home, the main planet is still available. A home without a gate uses its landing pad for arrival.

All rooms retain the fixed 2.5D view. Open the door before entering/leaving. Furniture drafts use Save/Cancel; unsaved/pending/failed edits have leave/reload protection. This is not crash-proof draft storage. Photos use the same fixed room angle with zoom and explicit Back to exploring.

The walking-room wall cutaway can abruptly hide several wall sections near a corner. Collision and saved geometry remain, but the visual treatment is an unresolved design decision. It has been diagnosed, not repaired. Do not infer a missing building from that rendering effect.

## What is saved

Ground and flight movement save periodically; pending/saving/saved status applies to acknowledged movement. A later unacknowledged step may be lost on refresh. Appearance, building placement, blueprint library, ship design and room drafts each have explicit saves. Saving a blueprint is separate from placing it in the world.

On a failed request, keep the draft and use the relevant retry/reload control. Wait for reconnection before changing the world. Conflicting tabs must resolve to the acknowledged revision, not silently overwrite one another. Nearby visitors are ephemeral presence, not saved NPCs; presence disappears after departure or expiry and never grants authority.

No player chat, voice, trade, combat, account recovery or cross-device identity is implemented. The constellation and visible visitor/rendering counts are bounded; this is a small shared-world project, not unlimited multiplayer hosting. See the [local verification index](integration/final-local-readiness.md) for actual checks and untested limits.
