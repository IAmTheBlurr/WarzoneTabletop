# 02 — Player Body Profiles

Three switchable first-person bodies. Switching (hotkeys 1/2/3) changes camera eye height, movement handling, jump capability, and collision size. The world never changes — only your body does — so the same ruin doorway should feel huge as a Guardsman and tight as a Primaris. That contrast is the core of the miniature fantasy; preserve it.

All values are in world units (feet) and units/second. Mirror of `game-constants.json → bodies`. Collision semantics (capsule, step height) are defined in `07-collision-and-ground.md`.

## Profile table

| | **1 — Guardsman** | **2 — Sister of Battle** | **3 — Primaris Marine** |
|---|---|---|---|
| Fiction | Ordinary human trooper, flak armour | Adepta Sororitas in power armour | Transhuman in Mk X power armour |
| Standing height | 5.8 (≈5'9") | 6.3 (≈6'3" armoured) | 8.5 (armoured) |
| **Camera eye height** | **5.4** | **5.9** | **8.1** |
| Walk speed | 4.5 | 5.5 | 6.6 |
| Sprint speed (hold Shift) | 8.1 | 9.9 | 11.9 |
| Acceleration (units/s²) | 45 | 28 | 22 |
| Deceleration (units/s²) | 60 | 40 | 35 |
| Air control multiplier | 0.9 | 0.6 | 0.5 |
| Vertical jump height | 1.5 | 4.0 | 6.0 |
| Capsule radius | 0.75 | 0.9 | 1.4 |
| Step height (auto-step) | 0.9 | 1.0 | 1.5 |
| Jump pack | No | No | **Yes** |

## Three distinct movement identities (the design intent)

Eye height alone can't differentiate the Guardsman and Sister (their lore heights are genuinely close), so each body gets a distinct *handling* identity:

- **Guardsman — nimble and small.** Lowest viewpoint, slowest top speed, but the snappiest handling in the game: highest accel/decel and near-full air control. Everything looms over him; he darts. Playing him is "scout cam".
- **Sister — armoured momentum.** Power armour's servo-muscles push her *top speed above an unaugmented human's* despite similar legs — this deliberately breaks the leg-length scaling formula below; the armour does the work. But she carries weight: slow spool-up, wide stops, reduced air control, and that huge 4-unit servo-assisted jump. Playing her is commitment to lines of movement.
- **Primaris — the hero body.** Tallest view, fastest stride, biggest jump, the jump pack, and the widest capsule — he squeezes through doorways the others stroll through, and steps over rubble (1.5 step height) that stops them. A locomotive: slowest to accelerate, fastest at full tilt.

## Design rationale (do not re-derive, just know why)

- **Heights are lore-anchored.** Normal humans in 40k run 5'7"–5'10"; Sisters are baseline women boosted a few inches by power armour; Primaris in armour land around 8–8.5 ft. (The 8.5 body vs the 8.0 scale anchor is a documented decision — `01-scale-system.md`.)
- **Base speed comes from leg length, then armour adjusts.** Baseline: a playable FPS walk of 4.5 for the Guardsman; the Primaris scales linearly with height (`4.5 × 8.5/5.8 ≈ 6.6`). The Sister is deliberately boosted above her height-scaled value (which would be a boring 4.9) to 5.5 for the armour-assist identity. Sprint = 1.8× walk for all.
- **Jumps scale with power armour, not height.** Unaugmented athletic vertical ≈ 1.5 ft; servo-muscles justify the Sister's 4.0 and Primaris 6.0. Gameplay-tuned, lore-flavoured.

## Movement model (ground + air)

Horizontal velocity approaches the wish direction with per-body accel/decel:

```
target   = wishDir × (sprintHeld ? sprintSpeed : walkSpeed)   // wishDir from WASD, camera-relative, y=0
rate     = (|target| > |horizVel| toward target) ? accel : decel
horizVel = moveTowards(horizVel, target, rate × dt)
```

- Airborne from a **normal jump**: multiply `rate` by `airControlMultiplier`.
- Airborne on the **jump pack**: air control is zero — the arc is committed (`03`).

## Jump implementation (normal jump)

Simple analytic kinematics, no physics engine:

```
jumpVelocity = sqrt(2 × g × jumpHeightUnits)     // g = 32.2
```

- Guardsman: √(2·32.2·1.5) ≈ **9.8 units/s**
- Sister: √(2·32.2·4.0) ≈ **16.0 units/s**
- Primaris: √(2·32.2·6.0) ≈ **19.7 units/s**

Tap Space → apply jumpVelocity if grounded (or within the 0.1 s coyote window — `07 §7.4`). Gravity integrates it down. Grounded/landing is defined entirely by `07-collision-and-ground.md`. (Coyote time applies to the *normal* jump only; jump-pack arming requires strict grounded at keydown — `03 §3.1`.)

## Body switching behavior

- Instant swap on keypress (1/2/3), mid-air allowed.
- On swap the collision capsule changes; run one horizontal resolve pass with the new radius so growing near a wall pushes you out cleanly (`07 §7.5`).
- Camera eye height lerps over ~0.15 s rather than snapping.
- HUD (nice-to-have) shows current body name + a small silhouette.
- Holding Space as a non-jump-pack body just performs a normal jump on press; the hold-threshold logic only arms for bodies with `hasJumpPack: true`.

## Controls summary

| Input | Action |
|---|---|
| Mouse (pointer lock) | Look |
| W/A/S/D | Move / strafe |
| Shift (hold) | Sprint |
| Space (tap) | Normal jump |
| Space (hold ≥ 0.5 s, Primaris only) | Jump pack (see `03-jump-pack-physics.md`) |
| 1 / 2 / 3 | Switch body |
