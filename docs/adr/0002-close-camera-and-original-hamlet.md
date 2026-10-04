# ADR 0002: Close walking view and original hamlet

Status: implemented locally. Date: 2026-10-05 (Canberra).

The user found the first playable prototype visually distant from the reference
and requested substantial improvement. Direct observation of the live Messenger
showed a close normal-play camera, substantial character silhouettes, dense
street framing and quiet UI. See `../evidence/round-2/reference-observation.md`.

The existing transported tangent frame and server contract remain. The default
camera now follows closer, with an optional planet overview. Small visual terrain
height differences affect scene placement without changing saved unit vectors.
Decorative collision remains a client-side approximation.

Original geometry and a shared toon gradient create a postal hamlet. The courier
uses shoulder, elbow, hip and knee pivots, a speed-driven gait, holding pose,
blinks and greetings. NPCs turn toward a nearby player. Static opaque geometry
and outline segments are merged; animated actors and the windmill remain separate.

The active NPC label clamps to the viewport edge when off screen; sphere-ray
intersection hides genuinely far-side labels. A coarse player silhouette appears
behind obstacles. This is a readability aid, not camera collision avoidance.
The camera can still pass through or be occluded by large props at some angles.
That tradeoff and comfort need human playtesting before further camera work.

Dialogue sits near the lower play area and does not add a confirmation step to
the existing one-parcel task. UI and camera changes neither reset identities nor
alter quest persistence. Multiplayer, construction and extra tasks remain out of
scope. No reference assets or source were extracted.
