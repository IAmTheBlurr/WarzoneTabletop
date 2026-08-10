# 06 — Implementation Roadmap (for the coding agent)

Build in phases; each phase is independently runnable and testable in the browser. Load `game-constants.json` at startup (or generate a typed `constants.ts` from it) — never scatter magic numbers.

## Suggested stack & structure

- Vite + Three.js. TypeScript preferred but not required.
- No physics engine. Collision is exactly `07-collision-and-ground.md`: circle-vs-AABB math plus one `Raycaster` for the ground rays — no BVH library needed at this scale.

```
src/
  main.ts            // bootstrap, loop, resize
  constants.ts       // loaded/mirrored from game-constants.json
  world/
    board.ts         // mat, table edge, room shell, fog, lights
    footprints.ts    // template decal shapes (incl. truncated triangle)
    terrain.ts       // ruin/container/barricade massing per footprint
    layout.ts        // the placement table from 04 §4.4
  player/
    controller.ts    // state machine: GROUNDED / AIRBORNE / PACK_BALLISTIC / RETRO_BURN
    collision.ts     // capsule-vs-AABB resolve + 5-ray ground detection (07 — authoritative)
    bodies.ts        // the three profiles + switching
    jumppack.ts      // arc launch + proximity retro-burn (03)
    input.ts         // pointer lock, WASD, space hold-timer, 1/2/3
  ui/
    hud.ts           // body label, pack charge indicator, crosshair
```

## Phase 1 — Board & first-person shell

Flat mat (234.67 × 320 units) centered at origin, table-wood apron, room floor ~180 units below (visual only — `07 §7.2`), fog, desk-lamp key light. Camera per `game-constants.json → camera` (FOV 75°, near 0.1, far 3000); spawn per `→ spawn` (feet at (0, 0, −145), facing +Z toward board center). Pointer-lock FPS controller hardcoded to the Guardsman profile for this phase: WASD walk/sprint with the accel model (`02`), gravity, tap-jump, and ground detection + snap per `07 §7.4` (mat and table only; the 5-ray pattern from day one so terrain "just works" in Phase 3).

**Accept:** can walk the full mat at 60 fps; sprint is visibly ~1.8× walk; walking off the table edge falls past y = −175 (just above the visual room floor — no clipping through it) and respawns you at the spawn point with spawn facing.

## Phase 2 — Body profiles & switching

All three profiles from `02-body-profiles.md` including per-body accel/decel/air-control and capsule dims, hotkeys 1/2/3, eye-height lerp (~0.15 s), body-swap collision re-resolve (`07 §7.5`), HUD body label. Default body on spawn becomes `primaris` per `game-constants.json → spawn`.

**Accept:** switching Primaris → Guardsman visibly drops the camera ~2.7 units; jump heights measurably differ (Guardsman cannot jump a 2-unit block; Primaris clears a 5-unit one); the three handling identities are distinguishable blindfolded — Guardsman snaps to speed, Sister reaches a higher top speed than the Guardsman but takes visibly longer to spool up and stop, Primaris is fastest of all with the heaviest spool.

## Phase 3 — Footprints & terrain

Raised 1/16-inch rubble footprint boards per `04 §4.1–4.2` (truncated-triangle shape via `THREE.Shape`), the §4.4 layout, terrain massing: ruins with Level-1 floors 16 units above the footprint top and some Level-2 floors 32 units above it, containers, chest-high lines at ~5.3, all doorways ≥ 5.0 units. Every terrain volume registers its AABBs into the `collidables` list and its meshes into the `groundRaycastGroup` per `07 §7.2` (footprint boards remain excluded pending the configurable-set phase).

**Accept:** board reads as a plausible tournament table from a corner screenshot; the `07 §7.7` acceptance tests pass (wall sliding, slab-edge stability, auto step-up, doorway widths per body); can stand on Level-1 and Level-2 floors; line terrain is over-the-head for Guardsman, chest-high for Primaris.

## Phase 4 — Jump pack

Full `03-jump-pack-physics.md`: 0.5 s hold arms and fires (Primaris only), fixed 64-unit 45° arc, no air control, proximity retro-burn to a ~5 units/s touchdown, wall-hit kills horizontal velocity, HUD charge tick during hold.

**Accept (measure, don't eyeball):** flat-ground pack jump lands 64 ± 1 units downrange ~2.0 s later; peak ≈ 16 units; landing vertical speed ≤ ~6 units/s on the mat **and** on a Level-2 roof (proving the proximity trigger, not a timer); burn onto a Level-1 floor from the arc's descending leg feels firmer but not instant.

## Phase 5 — Polish (optional, in order of value)

1. Landing dust puff without camera displacement, sway, bob, roll, or dynamic FOV.
2. Drybrush-style edge lightening on terrain; raised rubble footprint borders.
3. One hobby prop off-board (giant D6).
4. Simple footstep audio scaled to body (Primaris thuds).

## Testing notes

- Add a debug overlay (toggle `~`): position, velocity, grounded state, controller state, current groundDistance. The Phase-4 acceptance numbers are read from this overlay.
- Keep a `DEBUG_ARC` flag that draws the predicted parabola on pack launch — invaluable while tuning.
- Fixed-timestep (60 Hz accumulator) or clamped dt (≤ 33 ms) for the kinematics so tab-switch frame spikes can't tunnel the player through the mat.

## Open items to surface to the user, not solve silently

1. Triangle-footprint exact profile — awaiting photos; current shape is an approximation (`04 §4.2`).
2. Official GW terrain-kit heights — massing is a tasteful guess pinned to the 16-unit level system.
3. Whether the Sister should eventually get a jump pack variant (Seraphim exist in lore); constants already support flipping `hasJumpPack`.
