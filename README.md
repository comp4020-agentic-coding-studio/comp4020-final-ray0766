# Little Worlds

[Play Little Worlds](https://comp4020-final-ray0766.fly.dev/) · [Release checks](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/actions/workflows/checks.yml)

Little Worlds is a shared browser world for a few friends or classmates, built around travelling between planets, making a home, and encountering other people. Each player has one home planet. A public village gives everyone a common place to visit. The aim is a world worth walking through and returning to, without scores, resource grinding, chat, trading, or combat.

## What good means here

A good visit should be understandable without a developer explaining every action. Streets should connect useful places, buildings should leave room to walk, and visible controls should show where to board a ship or use a portal. Courtyards, gardens, wider junctions, and different neighbourhoods matter as much as building count.

[Messenger by Abeto](https://messenger.abeto.co/) is a reference for the relationship between characters, streets, buildings, and a small spherical world. Its [author interview](https://www.commarts.com/webpicks/messenger) describes accessible navigation and deliberately limited crowds. Little Worlds applies that emphasis to home-building. Workshop parts support reusable construction, while airport towers are separate travel facilities. The goal is a coherent place, not an exact reproduction.

## Getting started

Open the app and choose Chinese or English. A new browser identity starts at the public harbour while its home is prepared in the background. Preparation can take time or need a retry; entering the shared world does not mean the home is ready. Keep your cookies: this anonymous identity has no account recovery or cross-device login.

Use WASD or arrows to walk, drag to look, Shift to sprint, Space to jump, and E or the nearby button to interact. Mobile has a touch stick and buttons. Stand in an orange boarding circle to board a ship. Fly to explore other planets. Portals connect only your own home and the public planet; visitors cannot use somebody else's home portal. Saving a blueprint and placing it are separate workshop actions.

The opening screen explains the real-time 3D workload before the main module loads. Try “Smooth” quality if loading or movement struggles; a more powerful computer may help. Network or browser settings can also cause loading failures. No particular GPU is a validated minimum requirement.

## Being together without losing your place

Nearby players should see shared outdoor changes within about a second without refreshing. This is a design target, not an unlimited-load guarantee. The server checks ownership before building, room entry/editing, and history access. Visitors can see public geometry and operate nearby exterior doors. Room layout data is currently returned to visitors, although entering and editing are owner-only: it is not confidential storage. See the [permission matrix](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/crit10/permissions.zh-CN.md).

Saved changes use SQLite on the persistent volume. Expensive preparation uses a bounded worker queue so one person's home generation does not block everybody's requests. Server-side action logs retain pseudonymous browser aliases and accepted/refused outcomes across ordinary restarts, with bounded rotation rather than unlimited retention.

## Evidence and limits

The [Crit10 record](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/docs/crit10/README.md) links the release, focused checks, and user-reported peer trial. The author reports that classmates played and the website ran normally; no action-by-action transcript or matched log excerpt was supplied. This is distinct from automated permission and persistence checks. Read the Actions result for the exact release SHA; an older green run does not validate newer code. Disabled camera tests, physical-phone performance, and public-load capacity remain outside that claim.

[PROCESS](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/PROCESS.md), the [Crit10 reflection](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/reflections/crit-10.md), and [asset credits](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ray0766/blob/main/ASSET-CREDITS.md) explain development choices, personal learning, and provenance.
