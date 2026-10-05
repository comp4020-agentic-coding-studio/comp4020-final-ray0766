# ADR 0006 — A human-scale district with shared player assets

Status: implemented locally; validation evidence is in round 6.

The user chose the actual city photographs on the RSI Locations page, especially
Area18's layered industrial city at dusk and New Babbage's readable construction.
Both requested official images were downloaded to temporary local files and viewed
before implementation. They inform scale, structure and atmospheric separation;
no game asset, photograph texture or paid pack enters the application.

- Reference page: https://support.robertsspaceindustries.com/hc/en-us/articles/360008085873-Locations-in-Star-Citizen
- Area18 image: https://support.robertsspaceindustries.com/hc/article_attachments/360030106974
- New Babbage image: https://support.robertsspaceindustries.com/hc/article_attachments/360054596254

## Scale without invalidating old coordinates

Increasing the logical planet radius would invalidate placement, travel and saved
walking assumptions. Only the public ground presentation changes: a bijective
stereographic rescaling maps the existing unit normal to a shallow district on an
800-unit display sphere. Compression is 0.048, making the initial district about
3.9 times wider in displayed metres. The map is defined at both poles, is invertible
for ground picking and does not rewrite any stored normal. Movement compensates by
its local scale, retaining approximately 3 displayed m/s. Camera, character frame,
NPCs and remote visitors use the same projection. Private planets keep their old
radius, positions and terrain; flight keeps the existing constellation coordinates.

The shared unit tests exercise inverse mapping, poles, tangent frames, local speed
and the identity mapping on private worlds. There is no production teleport route.
The server's existing logical proximity/bounded movement rules remain authoritative.
UI direction distances use display metres. Its broad public boarding gate remains
the same logical clearance region, now presented as a wider physical apron.

A 3.4-second local departure presentation shows the actual parked craft rising over
this rendered district, then returns to the existing orbital flight renderer.
Server takeoff is acknowledged first; the acknowledged orbital pilot is stationary
during the presentation. Reduced-motion mode skips it, and refreshing in flight
resumes the saved flight state without replaying the shot. This is an explicit
presentation-scale transition, not continuous simulation from metres to orbit.

## Art and performance

Near architecture contains floor divisions, recessed glazing, human-scale entries,
structural members, ducts, service equipment, drains and signage. Sparse practical
emission, PBR materials, a directional twilight sky and distance fog supply depth;
there is no bloom postprocess. A lower ground camera and drag-look make the near
surfaces inspectable; a ray-tested camera boom shortens before entering a facade.

Static geometry is merged by material. Far silhouettes do not cast dynamic shadows;
compact viewports omit a distant ring, use reduced model detail, cap pixel ratio at
1.35 and use a 1024 shadow map (desktop cap 1.8 / shadow 2048). The shared materials
are cached once for the page lifetime. This is a bounded district sample, not a
claim of city interiors or public multiplayer capacity.

## Shared content and division of work

The user clarified that high-quality art must also be available to players. They
then assigned the editor/assembly/undo/blueprint work to Claude and this thread the
asset layer plus current-UI compatibility. Thirteen verified, committed pure geometry
dependencies were reused without modifying the independent workspace. The public
kiosks and player cabin call the same assembly; their windows, floors, pipes and
lights share the same emitter/material layer. `shared-assets.md` documents units,
axes, connection hints, lifecycle and the precise currently playable boundary.
No blueprint editor, schema, history system or competing snapping implementation was
created. The six existing saved object kinds and every server write guard remain.
