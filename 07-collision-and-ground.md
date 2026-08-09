# 07 — Collision & Ground Detection (Addendum)

This doc fully specifies the player collision model and ground detection that earlier docs referenced loosely. It is authoritative; where older wording is vaguer, this wins. Constants live in `game-constants.json → collision` and per-body fields in `→ bodies`.

## 7.1 Core conventions (memorize these)

- **`pos` is the player's FEET** — the base of the capsule, sitting on whatever surface they stand on. It is *not* the camera.
- **Camera position = `pos + (0, eyeHeight, 0)`.** Eye heights per body are in `02-body-profiles.md`.
- **Player volume = vertical capsule** approximated for collision as: a circle of `capsuleRadius` in the XZ plane, spanning vertically from `pos.y` to `pos.y + heightUnits`.
- **The world is axis-aligned and flat.** No slopes, no ramps, no stairs in v1. Every walkable surface is horizontal (mat y=0, Level-1 floors y=16, Level-2 y=32, table apron — the room floor is NOT walkable, see §7.2). Every wall is a vertical axis-aligned box. This assumption is what makes the whole system below simple — do not introduce sloped geometry without upgrading this spec.

Per-body collision dimensions:

| | Guardsman | Sister | Primaris |
|---|---|---|---|
| Capsule radius | 0.75 | 0.9 | 1.4 |
| Capsule height | 5.8 | 6.3 | 8.5 |
| Step height | 0.9 | 1.0 | 1.5 |

Consequence for level design: a Primaris is 2.8 units wide. **Minimum doorway / gap width anywhere the player should pass: 5.0 world units** (see `04 §4.3`).

## 7.2 World collision representation

- Every terrain volume (wall segment, floor slab, container, barricade, silo) registers one or more **static AABBs** into a global `collidables` list at build time. Compound pieces (a U-shaped ruin) are several AABBs.
- The same meshes also live in a `groundRaycastGroup` (a THREE.Group or raycast layer) together with the mat and table apron. **Footprint decals are excluded** from raycasting (separate layer) — you stand on the mat, not on paper.
- **The mat must be a raycast target like any other surface — do not special-case it analytically.** The retro-burn's unlimited-length down-ray has to be able to hit it; an analytic-only mat silently breaks the burn. One code path for all ground.
- **The room floor (y ≈ −180) is visual scenery only: excluded from both `collidables` and `groundRaycastGroup`.** Two reasons. (a) If it were landable, a pack fired off the table edge would retro-burn the player gently onto the room floor with no way back up — a soft-lock. (b) The respawn plane (y = −175, `game-constants.json → spawn`) sits just *above* the visual floor and must trigger before any landing or visible clipping. Net behavior falling off the table: the ray group reads nothing below, no burn fires, you fall past the table edge and respawn. (Future option, explicitly out of scope: a walkable room floor with a route back up — if ever added, move the floor into both groups and drop the respawn plane below it.)

## 7.3 Horizontal movement & wall collision

Per-axis move-and-resolve, which produces natural wall sliding for free:

```
1. desired = horizVel * dt
2. pos.x += desired.x → resolve penetrations along X only
3. pos.z += desired.z → resolve penetrations along Z only
4. run steps 2–3 a second iteration (handles inside corners cleanly)
```

**Penetration test (capsule vs AABB, 2D):** a collidable AABB is *relevant* only if its vertical span overlaps the player's **wall band**: `[pos.y + stepHeight, pos.y + heightUnits]`. For each relevant AABB, do a circle-vs-rectangle test in XZ (closest point on rect to circle center; overlap if distance < radius). If overlapping, push the player out along the axis currently being resolved by the exact overlap amount.

Two deliberate consequences of the wall band:

- **Auto step-up:** obstacles lower than `stepHeight` (debris, template edges, mat seams) never block horizontally; the ground snap (7.4) then lifts the feet on top. No special step-up code needed. A Primaris strides over 1.5-unit rubble that stops a Guardsman.
- **Head clearance:** anything above `pos.y + heightUnits` doesn't block. v1 ruins are open-topped so this rarely matters; if low arches are added, this test already handles "can I fit under it" correctly per body.

Barricades (5.3 units tall) exceed every step height → they block horizontally and must be jumped, as intended.

## 7.4 Ground detection (the authoritative definition)

**Ray pattern:** 5 rays pointing straight down, origins at height `pos.y + stepHeight`:

- 1 center ray at (pos.x, pos.z)
- 4 offset rays at (±0.7·radius, 0) and (0, ±0.7·radius) relative to center

The offset rays are what let you stand stably on the *edge* of a Level-1 floor slab without jittering; the center ray alone fails there.

**Grounded test (every frame):**

```
hits    = min hit distance among the 5 rays vs groundRaycastGroup
grounded = (vertVel.y ≤ 0) AND (hits ≤ stepHeight + groundSnapDistance)
if grounded:
    pos.y = highestHitPoint.y     // snap feet to surface
    vertVel.y = 0
```

`groundSnapDistance = 0.3`. The snap-down is what keeps you glued to the ground when the auto step-up lifts you onto debris or when floating-point drift accumulates — without it you get micro-airborne flicker.

**Which surface am I on?** Nothing special: whatever the rays hit *is* the ground — mat at 0, floor slab at 16, roof at 32, or table wood. (The room floor is deliberately not in the ray group — §7.2.) There is no "main ground plane" concept anywhere in the code. This is the same principle as the jump-pack proximity trigger.

**Ledges & coyote time:** when the rays stop hitting (walked off an edge), state → AIRBORNE and gravity applies, but a normal jump is still accepted for `coyoteTimeSeconds = 0.1` after leaving the ground. Jump-pack arming (the 0.5 s hold) requires *actually* grounded — no coyote pack launches.

**Retro-burn distance:** `groundDistance` in `03-jump-pack-physics.md` is the **center ray**, origin at feet, unlimited length, against the same `groundRaycastGroup`. One ray system, two consumers. (Using only the center ray for the burn is correct: it's a smooth control input, not a stability test.)

**Ceiling (optional in v1):** if implemented, a single up-ray from `pos.y + heightUnits`; on hit within `contactEpsilon` while `vertVel.y > 0`, clamp `vertVel.y = 0`.

`contactEpsilon = 0.05` for all touch tests (touchdown, ceiling).

## 7.5 Body switching & collision

On swap (1/2/3):

1. Change capsule dims + eye height (camera lerps per `02`).
2. Re-run one horizontal resolve pass with the new radius — growing from Sister to Primaris inside a tight gap pushes you out of the nearest wall instead of leaving you embedded.
3. Mid-air swaps keep current velocity; ground rays simply use the new step height next frame. No other special handling.

## 7.6 Integration order (one frame)

```
input → update horizVel (accel model, 02)
      → apply gravity if not grounded (or pack/burn logic, 03)
      → horizontal move + resolve (7.3, skipped only during PACK_BALLISTIC's
        wall-hit rule: pack flight still collides, on hit → zero horizVel per 03 §3.5)
      → vertical move: pos.y += vertVel.y * dt
      → ground detection + snap (7.4)
      → camera = pos + eyeHeight (lerped)
```

Fixed 60 Hz accumulator or dt clamped ≤ 33 ms (roadmap testing notes) so fast falls can't tunnel through a 0.8-unit floor slab. At the pack's worst case (~32 units/s descent before burn), 33 ms moves ~1.06 units — right at slab thickness, which is why the clamp is mandatory and the retro-burn (which slows descent well before impact) provides margin.

## 7.7 Acceptance tests

- Walk into every wall type at 45°: smooth slide, no penetration, no jitter; inside corners don't trap or eject the player.
- Stand half-off a Level-1 slab edge: stable (offset rays), no vibration.
- Guardsman walks over 0.5-unit debris without jumping; barricade (5.3) blocks all bodies horizontally.
- Primaris cannot enter a 2.5-unit gap; Guardsman can. Both pass a 5.0-unit doorway.
- Walk off a Level-2 roof, press Space within 0.1 s: jump still fires (coyote); after 0.2 s it doesn't.
- Debug overlay's `groundDistance` while pack-flying over stepped terrain visibly re-reads each surface (mat → roof → mat), and the retro-burn fires against the surface actually below.
- Pack-fly off the table edge into the void: **no** retro-burn fires (room floor not in ray group), the player falls past y = −175 and respawns at the spawn point with spawn facing.
- Swap Sister → Primaris while brushing a wall: player is pushed out cleanly, camera never inside geometry.
