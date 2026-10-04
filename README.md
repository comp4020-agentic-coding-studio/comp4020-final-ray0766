# Little Post

A small planet, two neighbours, and one parcel of sunseeds. Little Post is a
local COMP8020 Final prototype: choose a courier, wander around the spherical
world, collect a parcel from Mica, then bring it to Sol at the glasshouse. The
completed delivery and coat remain when the same browser returns.

## Current design brief

This prototype implements the approved learning goal: reproduce the core
experience of continuous movement on a small planet with a following camera,
then develop an original direction. The target is a short, legible delivery that a new visitor can finish without
operating the camera. There is no timer or penalty for taking a longer route.
The connected lanes, destination arrow, distance and nearby action button
provide several ways to find the next step. Three coats offer a personal choice.

This is an engineering description of the current prototype and agreed scope.
The student’s own argument about what makes the experience good, its intended
audience, and the sources behind that position still needs to be written and
reviewed before submission. This page does not stand in for that academic work.

## What is implemented

Keyboard movement uses WASD or the arrow keys. Clicking the ground selects a
walking destination; phone users can drag the thumbstick. Press E, or use the
nearby button, to collect or deliver. The camera follows the local surface
orientation through either pole. Trees and buildings have simple collision
boundaries. A close walking view and optional planet overview share the same
controller. Articulated couriers greet neighbours; dialogue accompanies the parcel
handoff. The postal street, glasshouse, pond and windmill provide landmarks.

Character and task state are stored in SQLite on the server, identified by an
HttpOnly browser cookie. The browser never awards itself a delivery. The server
checks the action, parcel state, saved proximity, character choice and incoming
coordinates. Repeating a successful request cannot create a second delivery.
Losing the connection pauses movement and shows a retry message; reconnecting
returns to the last saved location. Clearing cookies creates a new visitor.
There is no account or cross-device recovery in this version.

## Reference and original work

[Messenger by abeto](https://messenger.abeto.co/) is the interaction reference.
The [authors’ interview in Communication Arts](https://www.commarts.com/webpicks/messenger)
describes Three.js, custom controls and a camera that recentres automatically.
Those ideas informed the technical exploration. The planet, couriers, buildings,
plants, interface, palette, names and delivery text here were created in code
for this prototype. No original game assets, shaders or source were extracted.

[Three.js](https://threejs.org/docs/) supplies rendering and vector mathematics.
[Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) supplies the
persistent database.

## What is checked, and what needs judgement

Automated specifications cover continuous spherical movement, reversal,
bounded speed, request validation, isolated identities, ordered task transitions,
idempotency and reopening the database. Browser checks exercise the visible
journey, refresh, returning visits, dialogue, camera modes and 1920 × 1080 and
390 × 844 layouts. Evidence: `docs/evidence/round-2/verification.md`.
Camera comfort still needs human playtesting; tests do not settle that judgement.

## Run locally

Use Node 24 and pnpm 11. Install with `pnpm install`, then run `pnpm build` and
`pnpm start`. Visit http://localhost:8080. Run `pnpm check`, `pnpm lint`,
`pnpm test:browser` and `pnpm check:evidence` while the app is running.
SQLite defaults to `.data/little-post.sqlite`; production uses
`DATABASE_PATH=/data/little-post.sqlite` on the course volume.

## Scope still ahead

This is a local C8 prototype, not a submitted or deployed Final. C9 shared
multiplayer and C10 server logging are deferred. Map editing, additional quests,
complex art and public deployment are outside this implementation. Student
reflection, design argument and the COMP8020 research note remain the student’s
work. Publication, a push to main and Fly deployment require separate approval.
