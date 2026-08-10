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

- Combat run / sprint: Guardsman 7.00 / 12.50, Sister 8.50 / 15.00, Primaris 10.50 / 18.00 units/s. Ground input reaches or leaves its target speed in one fixed simulation step.
- Primaris → Guardsman eye drop: 2.70 units.
- Integrated free-jump peaks, Guardsman / Sister / Primaris: 1.42 / 3.87 / 5.84 units.
- World registration: 16 footprint decals, 42 terrain meshes, 42 terrain AABBs plus one collidable off-board D6 prop. Footprints are absent from the ground ray group.
- Wall slide, slab-edge stability, 0.5-unit auto-step, 5.3333-unit barricade blocking, 2.5/5.0-unit doorway matrix, Level-1/Level-2 grounding, and 0.1-second coyote behavior pass.
- Jump-pack keydown arming: fires exactly at 0.500 seconds while the normal jump is already airborne.
- Flat pack flight: 64.74 units, 2.02 seconds, 15.74-unit peak.
- Touchdown: 5.01 units/s on both mat-height and Level-2 test surfaces; burn activates at 10.75 units of center-ray ground distance.
- Pack steering input has no effect; a wall impact zeros horizontal velocity; an off-table flight finds no ground, never retro-burns, and respawns below y = −175.

The in-app regression routes are `?selftest=phase1`, `phase2`, `phase3`, and `phase4`. They render their measured results over the running scene.

## Frame-timing regression

The renderer remains synchronized only to the display's uncapped `requestAnimationFrame` cadence; physics uses a separate 60 Hz fixed-step clock. The `?selftest=timing` regression verifies that 60, 30, 20, 15, and 10 rendered frames all advance exactly 60 physics steps and move the Guardsman exactly 7.00 units during one real second. Hidden-tab time is discarded on visibility changes rather than replayed as a catch-up spike.

## Control-direction regression

The `?selftest=controls` regression verifies camera-relative W/A/S/D directions and equal speeds, both Shift sprint modifiers, horizontal and vertical mouse-look direction, pitch limits, and the 1/2/3 body-selection mapping.

## Environment and locomotion regression

The `?selftest=environment` regression verifies the physically modeled den surround, dense miniature-scale mat and hobby detail, 22.35-second Primaris combat-run / 13.04-second sprint targets across the 44-inch width, and the absence of camera-motion or dynamic-FOV presentation tricks.
