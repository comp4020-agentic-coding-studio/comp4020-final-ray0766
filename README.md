# Little Worlds

Little Worlds is a shared browser world for a few friends or classmates built around travelling between planets, making a home, and encountering other people. Each player has one home planet. A public village gives everyone a common place to visit. The aim is a world that feels worth walking through and returning to, without scores, resource grinding, chat, trading, or combat.

## What good means here

A good visit should be understandable without a developer explaining every action. Streets should connect useful places, buildings should leave room to walk, and visible controls should show where to board a ship or use a portal. A dense planet is not automatically a well-designed one: courtyards, gardens, wider junctions, and different neighbourhoods matter as much as building count.

[Messenger by Abeto](https://messenger.abeto.co/) is a reference for the relationship between characters, streets, buildings, and a small spherical world. Its [author interview](https://www.commarts.com/webpicks/messenger) describes accessible navigation and deliberately limited crowds. Little Worlds applies that emphasis on approachable exploration to a home-building setting. Workshop parts support reusable construction, while the current airport towers are deliberately separate travel facilities. The goal is a coherent place, not an exact reproduction of the reference.

## Getting started

Open the app in a browser. A new browser identity receives a home and can enter its owner's room, open the workshop, or explore outdoors. Keep its cookies: there is no account recovery if that identity is lost. Use WASD or arrows to walk, drag to look, Shift to sprint, Space to jump, and E or the nearby button to interact. Mobile has a touch stick and buttons. Chinese and English interfaces are available.

Stand in an orange boarding circle to board a ship. Fly to other planets to explore them. The portal's illuminated pad offers one destination: the public planet from your own home, or your own home from the public planet. A visitor cannot use somebody else's home portal. This limited shortcut makes routine travel easier without replacing flight as the way to explore. In the workshop, saving a blueprint and placing it are separate actions.

## Being together without losing your own place

Players should notice each other's outdoor presence and see relevant shared changes within about a second, without refreshing. This is the design target, not an unlimited-load guarantee. Ownership still matters: visiting does not grant permission to edit another person's buildings, enter their private room, or read their private history. Saved changes belong in persistent storage; a browser refresh should not be the end of a home.

Responsiveness is part of that promise. Someone generating a home should not freeze everyone else's requests. Expensive preparation uses a queued worker, while the initiating player waits. The server validates state before committing changes. This costs memory and can make entry slower, but protects people already using the world.

## What is checked and what needs judgement

Ownership, persistence, placement, and request handling have code-level checks. Camera comfort, street composition, readable interactions, and the feeling of movement require human playtesting. My own wall-camera testing led to changes that technical checks alone had not settled.

The current version is publicly deployed; the full CI check passed (722 tests), excluding unresolved disabled camera tests. Multiplayer and performance measurements in the [verification notes](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/evidence/crit9-realtime/verification.md) are mostly bounded local experiments, not guarantees about the public server. In one public run, a second browser session saw walking within 0.5 s and a coat change within 0.1 s, without reloading. The [process account](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/PROCESS.md) explains the choices behind this version; [asset credits](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/ASSET-CREDITS.md) record provenance.
