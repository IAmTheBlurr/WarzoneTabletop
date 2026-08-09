# 05 — Art Direction: The Tabletop Diorama

## The one-line brief

**You are not on a battlefield. You are standing on a tabletop that *depicts* a battlefield.** Every material choice should whisper "hobby table": painted resin, laser-cut MDF, printed neoprene, dried drybrush strokes. Reference feelings: the giant-room multiplayer maps of late-90s shooters (*Sin*'s den map with the mousetrap catapult), Micro Machines, Toy Commander, Chibi-Robo.

## What sells the illusion (in priority order)

1. **Scale cues beyond the board.** The single strongest signal. Even a low-effort version — the mat ends, a wooden table edge drops away, a vast dim floor lies far below, maybe a colossal blurry bookshelf silhouette in the fog — instantly reframes everything as miniature. Board sits at "table height": put the room floor ~180 world units below the mat (visual scenery only — never collidable or raycastable, see `07 §7.2`; the respawn plane catches the player just above it).
2. **The printed-template look.** Footprint decals that read as paper/acrylic templates (see `04-terrain-footprints.md §4.5`), with terrain sitting on them slightly inset.
3. **Miniature materials, not real materials.** Flat/low-roughness plastic-paint sheen, visible "drybrush" edge highlights (bake into vertex colors or a simple edge-lightening trick), slightly toy-like saturated colors. No PBR realism, no texture-photo walls. MeshLambert/MeshToon-adjacent shading is the right neighborhood.
4. **Chunky geometry.** Walls too thick, details oversized, bevels exaggerated — miniature terrain is cast chunky so it survives handling. Low-poly is not a budget compromise here; it *is* the look.
5. **Hobby-table props (nice-to-have).** A giant D6 the size of a small building resting off-board, a tape measure, a paint pot. One or two props max — restraint keeps it a battlefield, not a joke.

## Palette

Named values as a starting kit (tune freely, keep the register):

- `matGreen  #4a5d3a` — battle-mat olive, the ground plane
- `matBurn   #6b5d4a` — dry-earth mat variation / printed craters
- `boneWall  #b8b0a0` — ruin walls, "Zandri dust" tabletop bone
- `rustAccent #8a4a32` — container/pipe accent, oxide red
- `templateTan #d9cfb8` — footprint template paper
- `tableWood #5a4632` — the table edge beyond the mat
- `roomFog   #1e1a20` — the dim room beyond, everything fades to this

Signature move: the world outside the board desaturates and darkens into `roomFog` — the tabletop is the lit stage, the room is theater darkness.

## Lighting

- One warm key **DirectionalLight** angled like a desk lamp / ceiling light — this is the "hobby room" sun. Soft shadows if cheap (a single shadow-casting light, low-res map is fine and even on-theme).
- Gentle cool ambient/hemisphere fill so shadow sides stay readable.
- **Fog** starting past the board edge so the room reads as huge and dim without modeling it.

## What to avoid

- Photorealistic textures, normal-mapped grit, volumetric anything.
- Actual GW iconography, logos, or faithful model replicas — keep shapes *generic* gothic-industrial sci-fi (arched ruin windows are fine; a 1:1 sculpt of a named kit is not).
- Skyboxes with sky. There is no sky. There is a ceiling somewhere up in the fog.
- Motion/visual noise: no bloom-heavy post stack. At most a subtle vignette.

## HUD / UI register

Minimal and diegetic-adjacent: small current-body label (e.g., "PRIMARIS MARINE — 1/2/3 to switch"), a jump-pack charge tick while Space is held (a thin radial or bar filling over the 0.5 s hold), crosshair dot. Utility sans-serif, sentence case, no faux-gothic fonts in the UI (the terrain carries the theme; the UI stays legible).
