# Little Worlds · 小星球

[Play](https://comp4020-final-ray0766.fly.dev/) · [Player guide](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/player-guide.md) · [Source and checks](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/tree/main)

## A place to make and revisit

Little Worlds is for a few friends or classmates who want to make a small place and visit each other. Good means a contribution survives your departure, visitors can understand and explore it without damaging it, and travelling between homes takes less attention than enjoying them. The public village brings people together; each person's planet gives their visit a lasting destination. Other people matter through their presence and creations, not a score or an endless conversation feed.

[Messenger](https://messenger.abeto.co/) supplied a concrete reference for a compact, explorable world. In its [creator's interview](https://www.commarts.com/webpicks/messenger), Abeto connects spherical geography with continuous exploration and simpler controls with accessibility to inexperienced players. Little Worlds adopts those questions, not Messenger's assets or every answer: the ground camera remains freely controlled, while ship travel is automatic. Its distinctive commitment is a persistent home that another person can visit but cannot overwrite.

A delivery-only world offers a reason to walk but little that a visitor can leave behind. Unrestricted shared editing would allow collaboration at the cost of individual control. This project chooses ownership and visits instead. There is no player chat, trading, combat or resource grind; adding them would compete with the short route from making something to showing it. Photography can record a discovery, but a community publishing service is not implemented.

## What is enforced, and what needs judgement

Server checks enforce ownership, unique planet names, acknowledged saves and versioned travel. Visitors cannot build in another person's world or enter their private room. Explicit character creation and Save/Cancel protect appearance choices. A failed request must preserve a recoverable draft or acknowledged position, not report success. These rules live in [CLAUDE](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/CLAUDE.md) and [the checks](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/tree/main/spec): `first-character`, `appearance`, `auto-trip`, `home-owner-access`, `teleport-station` and `save-progress`.

Readable entrances, comfortable observation and a worthwhile visit require judgement. The author’s own play exposed trapped movement and difficult flight, prompting walking-only characters, explicit safe-ground recovery and automatic journeys. Technical browser scenarios check keyboard focus, narrow layouts, retries and return routes; they do not establish that every building is comfortable or that visitors enjoy it. The [verification record](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/evidence/final-hd/verification.md) separates measured results, historical evidence and outstanding acceptance. Wall cutaway near indoor corners and overlapping travellers at the same landing point are author-accepted known visual limitations, not completed repairs.

## Try the core route

Save your traveller, then press **Space / Guide**, expand **Fixed help** if shown, and choose **My planet**. Walk to its gate, return home and use **Menu → Build on my planet** to place one module. **Guide → Find ship** draws a ground route; board, choose a destination and Depart. Flight lands automatically. A neighbour's gate returns you to the main planet or your own home. **Tab** opens Menu; **Esc** releases the mouse. Touch equivalents and detailed controls are in the player guide.

## Boundaries

Keep your cookies: anonymous identity has no account recovery. Presence expires; acknowledged creations persist. Room layouts are not confidential storage. Fixed help requires no AI. Optional DeepSeek chat has a right-side panel, status feedback, eight attempts per identity per hour, and one persistent US$1 trial budget transferred from local use. Only the submitted question and public instructions are sent. Smooth quality and honest retry feedback support weaker devices without promising a frame rate. The [release record](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/releases/final-2026-10.md) distinguishes local verification from the exact successful main deployment; a source push alone is not proof that the hosted version changed.

The [usability follow-up](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/integration/usability-fixes-20261026.md) fixes the reported route and framing problems, with 978 local tests passing. The release record separates this revision’s deployment checks from the earlier 971-test release.

A [production recheck](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/evidence/production-return-sync-20261027/README.md) retained three homes after 34h54m–34h57m. Six movement samples reached the other production client in 240–530 ms; the record explains measurement boundaries.
