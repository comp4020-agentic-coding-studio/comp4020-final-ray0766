# Little Worlds · 小星球

[Play](https://comp4020-final-ray0766.fly.dev/) · [Player guide](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/player-guide.md) · [Source and checks](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/tree/main)

## A place to make and revisit

Little Worlds is for a few friends or classmates making small places and visiting each other. Good means a contribution survives your departure, visitors can understand and explore it without damaging it, and travelling between homes takes less attention than enjoying them. The public village brings people together; each person's planet gives their visit a lasting destination. Other people matter through presence and creations, not a score or an endless feed.

[Messenger](https://messenger.abeto.co/) supplied a concrete reference for a compact, explorable world; in its [creator's interview](https://www.commarts.com/webpicks/messenger), Abeto links spherical geography to continuous exploration and simpler controls to accessibility. Little Worlds adopts those questions, not Messenger's assets or every answer: the ground camera stays freely controlled while ship travel is automatic. Its distinctive commitment is a persistent home that another person can visit but cannot overwrite.

A delivery-only world gives a reason to walk but leaves a visitor nothing behind; unrestricted shared editing would trade individual control for collaboration. This project chooses ownership and visits. There is no player chat, trading, combat or resource grind; they would compete with the short route from making to showing. Photo mode records a discovery; there is no publishing service.

## What is enforced, and what needs judgement

Server checks enforce ownership, unique planet names, acknowledged saves and versioned travel. Visitors cannot build in another person's world or enter their private room. Explicit character creation and Save/Cancel protect appearance choices. A failed request must preserve a recoverable draft or acknowledged position, not report success. These rules live in [CLAUDE](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/CLAUDE.md) and [the checks](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/tree/main/spec): `first-character`, `appearance`, `auto-trip`, `home-owner-access`, `teleport-station` and `save-progress`.

Readable entrances, comfortable observation and a worthwhile visit require judgement. The author’s own play exposed trapped movement and difficult flight, prompting walking-only characters, explicit safe-ground recovery and automatic journeys. Browser scenarios check keyboard focus, narrow layouts, retries and return routes; they do not show that every building is comfortable or every visit enjoyable. The [verification record](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/evidence/final-hd/verification.md) separates measured results, historical evidence and outstanding acceptance. Wall cutaway near indoor corners and overlapping travellers at one landing point are visual limitations the author accepted rather than repaired.

## Try the core route

Save your traveller, then press **Space / Guide** on the left, open **Fixed help** if shown, and choose **My planet**. Walk to its gate, return home and use **Menu → Build on my planet** to place one module. **Guide → Find ship** draws a ground route; board, choose a destination and Depart. Flight lands automatically; a neighbour's gate returns you to the main planet or your own home. **Tab** opens Menu; **Esc** releases the mouse. Touch controls are in the player guide.

## Boundaries

Keep your cookies: anonymous identity has no account recovery. Presence expires; acknowledged creations persist. Room layouts are not confidential storage. Sharing uses one-second HTTP polling and 250 ms presence heartbeats, not WebSockets; [PROCESS](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/PROCESS.md) explains why. Fixed help needs no AI; optional DeepSeek chat sits in a right-side panel with eight attempts per identity per hour and one US$1 trial budget, sending only the submitted question and public instructions. Smooth quality and honest retry feedback help weaker devices without promising a frame rate. The [release record](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/releases/final-2026-10.md) ties each claim to the exact main deployment that carried it; a source push alone proves nothing.

The [usability follow-up](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/integration/usability-fixes-20261026.md) fixes the reported route and framing problems (978 local tests passing); a [production recheck](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/evidence/production-return-sync-20261027/README.md) retained three homes after 34h54m–34h57m, with six movement samples reaching the other client in 240–530 ms.
