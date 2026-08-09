# Acceptance Results

Measured in Chromium against the fixed 60 Hz controller on 2026-08-09.

## Phase checkpoints

| Phase | Git checkpoint | Result |
|---|---|---|
| 1 — Board and first-person shell | `aa74064` | 5/5 passed |
| 2 — Body profiles and switching | `efd75cb` | 5/5 passed |
| 3 — Footprints, terrain, collision | `124a32a` | 8/8 passed |
| 4 — Jump pack and retro-burn | `bbee19a` | 7/7 passed |

## Key measurements

- Guardsman walk: 4.50 units/s; sprint: 8.10 units/s (1.80×).
- Primaris → Guardsman eye drop: 2.70 units.
- Integrated free-jump peaks, Guardsman / Sister / Primaris: 1.42 / 3.87 / 5.84 units.
- World registration: 16 footprint decals, 42 terrain meshes, 42 terrain AABBs plus one collidable off-board D6 prop. Footprints are absent from the ground ray group.
- Wall slide, slab-edge stability, 0.5-unit auto-step, 5.3333-unit barricade blocking, 2.5/5.0-unit doorway matrix, Level-1/Level-2 grounding, and 0.1-second coyote behavior pass.
- Jump-pack keydown arming: fires exactly at 0.500 seconds while the normal jump is already airborne.
- Flat pack flight: 64.74 units, 2.02 seconds, 15.74-unit peak.
- Touchdown: 5.01 units/s on both mat-height and Level-2 test surfaces; burn activates at 10.75 units of center-ray ground distance.
- Pack steering input has no effect; a wall impact zeros horizontal velocity; an off-table flight finds no ground, never retro-burns, and respawns below y = −175.

The in-app regression routes are `?selftest=phase1`, `phase2`, `phase3`, and `phase4`. They render their measured results over the running scene.
