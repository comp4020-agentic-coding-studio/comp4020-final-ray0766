# Little Worlds

A constellation made together: visit a blank planet, make it your home, and shape
it with a small building kit. Everyone can visit every planet, while only its
owner can change it. Sunseed Harbour preserves the original courier world and
its optional delivery. Existing coats, delivery progress and locations survive
the move to this multi-planet prototype.

## Current design brief

The user authorised an original direction beyond the Messenger learning
prototype: many worlds, one home per browser identity, and shared exploration
without editing someone else’s work. The main loop is now star map, visit, claim,
build and revisit. Blank planets contain terrain only. Claimed planets start
empty too; their owners supply the first buildings and planting.

The catalogue contains cottages, trees, path stones, flowers, benches and lamps.
Enter Build mode, choose an object, tap an open ground position, rotate if needed,
and save. Select an existing object on the planet or from the accessible object
list to move, rotate or remove it. Leave Build mode to walk elsewhere. Placement
reserves the landing spot, separates objects and limits each planet to 64 objects;
path stones may overlap one another to form continuous routes.

This describes the implemented, agreed brief. The student’s own argument about
quality, audience and research still needs to be written and reviewed. It is not
an authored academic position or a substitute for the required reflection.

## Ownership, persistence and visitors

A random HttpOnly, SameSite browser cookie identifies a server session. SQLite
stores ownership, object transforms, task state and per-planet visit positions.
The database enforces one owner per planet and one planet per identity. Claim
transactions resolve races. Every building write checks server-derived ownership;
client owner IDs or hidden buttons cannot grant permission. Requests validate
models, coordinates, rotation, overlap and capacity. Version checks reject stale
edits, duplicate operations do not multiply objects, and deletion tombstones
prevent an old create request from resurrecting an object.

Visitors see saved scene changes through one-second polling while their page is
visible. Their own movement remains local to their session; other visitors’
avatars are not shown. No chat or trading is included. Multiple tabs of one
identity share the current visit. Scene edits are acknowledged only after saving.

An anonymous identity is not a real-world person. New browser profiles can create
new identities. Clearing cookies loses access to the owned planet, which remains
visitable. There is no login, cross-device identity or recovery flow. The star map
explains this before claiming. These limits need revisiting before public release.

## Original work and references

[Messenger by abeto](https://messenger.abeto.co/) informed spherical movement and
camera exploration; its [authors’ interview](https://www.commarts.com/webpicks/messenger)
provided technical context. The live experience was also inspected in Chrome.
All scene assets, characters and interface here are original procedural work;
no reference assets or source were extracted. Rendering uses
[Three.js](https://threejs.org/docs/), with Node’s SQLite for persistence.

## Run and verify

Use Node 24 and pnpm 11: `pnpm install`, `pnpm build`, then `pnpm start`.
Open http://localhost:8080 or `/readme/`. With the server running, use `pnpm lint`,
`pnpm check`, `pnpm test:browser` and `pnpm check:evidence`.

SQLite defaults to `.data/little-post.sqlite`. Upgrades create consistent backup
files before transactional migration. Recovery instructions and actual test
results are in `docs/evidence/round-3/verification.md`. Desktop and phone-size
Chrome checks cover independent owners, visitors, touch building and persistence;
physical phones and public hosting remain unverified.

This is local work. Student writing, C10 logging and deployed validation remain
unfinished. Push, public visibility, Fly costs/deployment and submission require
separate approval.
