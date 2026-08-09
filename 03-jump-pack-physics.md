# 03 — Jump Pack Physics

The jump pack is the signature mechanic. It is deliberately a **commitment move**: once fired, there is no steering — you sail a fixed, pre-determined parabola and the pack itself handles the landing with an automatic retro-burn. Predictable, cinematic, simple to implement.

Only bodies with `hasJumpPack: true` (Primaris) can use it.

## 3.1 Activation — hold-to-fire

- Player **holds Space**. A press-timer runs.
- `< 0.5 s` and released → it was a normal jump (already applied on keydown; the hold does nothing extra).
- `≥ 0.5 s` held (`holdThresholdSeconds`) → **jump pack fires at the threshold moment** in the camera's current horizontal facing direction — **provided the player was grounded at keydown**.
- **Grounded is checked at keydown, not at the threshold.** This matters: the tap-jump applies on keydown, so by t = 0.5 s the player is normally mid-air on their own jump — that's fine and expected. Requiring grounded *at the threshold* would make the pack unfireable. Strict grounding at press — no coyote arming (`07 §7.4`).
- **The pack launch overrides current velocity entirely** (the player is usually mid-tap-jump when it fires). Override, don't blend — this is mandatory, not polish.
- While airborne on the pack: **no air control**. WASD is ignored, mouse look still works (you can look around while flying, you just can't change the arc).
- Canonical controller states (used identically in `06` and `07`): `GROUNDED`, `AIRBORNE`, `PACK_BALLISTIC`, `RETRO_BURN`. State machine: `GROUNDED → (keydown: normal jump + arm timer) → AIRBORNE → (timer hits 0.5 s, still held) → PACK_BALLISTIC → (retro-burn condition) → RETRO_BURN → GROUNDED`. Releasing before 0.5 s just disarms the timer and the jump plays out normally.

## 3.2 The fixed arc — derivation and constants

Tabletop basis: a jump-pack move is **12 board inches**, which at 1:64 scale is exactly **64 world units** of horizontal range.

Projectile at 45° launch on flat ground, `g = 32.2 units/s²`:

```
Range:        R = v² sin(2θ) / g          → v = sqrt(R·g)  at θ=45°
Launch speed: v = sqrt(64 × 32.2) = 45.4 units/s
Components:   vx = vy = v/√2 ≈ 32.1 units/s
Peak height:  h = vy²/(2g) = 16.0 units
Airtime:      T = 2·vy/g ≈ 2.0 s
```

**Constants (mirror of `game-constants.json → jumpPack`):** range 64, angle 45°, launch speed 45.4, peak 16, airtime ~2.0 s.

Pleasing symmetry worth knowing: the arc peaks at exactly one terrain level (16 units), and its range equals two levels of height. A pack jump comfortably clears a Level-1 ruin.

## 3.3 Flight integration

Analytic kinematics per frame (fixed 60 Hz step or dt-scaled):

```js
// on launch
const dir = horizontalForward(camera);          // normalized, y = 0
vel.set(dir.x * 32.1, 32.1, dir.z * 32.1);      // vx, vy, vz

// per frame while airborne (ballistic phase)
vel.y -= G * dt;
pos.addScaledVector(vel, dt);
```

## 3.4 Retro-burn — ground-proximity trigger (NOT a timer)

**Requirement:** the braking burn is triggered by **distance to the ground below**, never by elapsed time. This makes landings feel right regardless of what you land on — mat, Level-1 floor at 16 units, or Level-2 roof at 32 units.

### Trigger condition (checked every frame while on the pack)

Ray convention per `07-collision-and-ground.md §7.4`: the burn uses the **center feet-origin down-ray** against the same `groundRaycastGroup` used for grounding — one ray system, two consumers.

```
raycast straight down from player feet → groundDistance
fire retro-burn when:
    vel.y < 0                          // descending
AND groundDistance ≤ activationHeight  // 11 units default (tune 10–12)
```

### Braking model — distance-proportional deceleration

Goal: arrive at the ground at a gentle `targetLandingSpeed = 5 units/s` (soft thump, not a stop mid-air). Compute the exact deceleration needed to shed the excess speed over the distance remaining, recomputed every frame so it self-corrects:

```
neededDecel = (vel.y² − targetLandingSpeed²) / (2 × groundDistance)
thrust      = clamp(neededDecel, 0, maxThrust)        // maxThrust = 96.6 (3g)
vel.y      += (thrust − G·… ) — see integration below
```

Integration detail: gravity still applies, so the pack's upward thrust must fight it:

```js
// per frame during RETRO_BURN
const d = groundDistance;                       // from downward raycast
const vy = -vel.y;                              // downward speed, positive
let thrust = 0;
if (d > 0.01 && vy > TARGET_LAND) {
  thrust = (vy*vy - TARGET_LAND*TARGET_LAND) / (2 * d) + G;  // + G to cancel gravity too
  thrust = Math.min(thrust, MAX_THRUST);        // 96.6
}
vel.y += (thrust - G) * dt;
vel.y = Math.min(vel.y, 0);                     // never re-ascend during burn
pos.addScaledVector(vel, dt);
```

Notes for the implementer:

- Adding `G` inside the thrust term and subtracting it in integration keeps the algebra honest: net decel equals `neededDecel` exactly (until the clamp bites).
- The `MAX_THRUST` clamp (3g) means very short landing gaps (e.g., clipping a rooftop edge late in descent) produce a firmer landing rather than an impossible instant stop — good, it reads as physical.
- Clamp `vel.y ≤ 0` during burn so an over-corrected frame can't make the player bounce upward.
- Horizontal velocity is untouched by the burn — you keep sailing forward while braking vertically, which looks like a real assault-marine landing flare.
- On touchdown (`groundDistance ≤ ε`): zero velocity, state → GROUNDED, small camera dip + dust puff (polish).

### Why proximity beats a timed burn

A timer assumes flat ground at launch height. This world has floors at 0, 16, and 32 units. Proximity triggering means landing on a Level-2 rooftop starts the burn ~11 units above *that roof*, and overshooting the roof edge simply re-arms the burn against the true ground below. No special cases.

## 3.5 Edge cases

| Case | Behavior |
|---|---|
| Arc hits a wall mid-flight | Kill horizontal velocity, keep vertical; descent + retro-burn proceed normally against the ground below. |
| Player lands on terrain higher than launch (e.g., Level 1 at 16u — the exact arc peak) | Proximity trigger handles it; landing may be firmer (less braking distance). Acceptable. |
| Space released mid-flight | No effect. The arc is committed. |
| Pack fired at board edge | v1: let them fly off the table. The room floor is excluded from the ray group (`07 §7.2`), so **no retro-burn fires over the void** — the player falls past the respawn plane (y = −175) and respawns. The "you fell off the table" moment is on-theme. |
| Ceiling above during ascent | v1 terrain is open-topped ruins; ignore. If added later, treat like wall-hit. |
