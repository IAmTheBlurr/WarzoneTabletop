# 04 — Terrain Footprints & Terrain (11th Edition)

11th-edition 40k defines terrain by **footprints**: flat printed templates laid on the mat that mark where terrain rules apply. GW publishes official template sizes (also distributed as printable files), and third parties cut acrylic versions to the same dimensions. In-game, footprints render as flat printed-template decals on the mat, with simple low-poly terrain volumes standing on them.

## 4.1 The standard competitive set — 16 pieces, 5 shapes

Dimensions in **board inches** (physical template size). World units = board inches × 5.3333.

| Piece | Count | Board inches | World units | Shape |
|---|---|---|---|---|
| Large rectangle | 4 | 7 × 11.5 | 37.33 × 61.33 | Rectangle |
| Large "triangle" | 2 | 8 × 11.5 | 42.67 × 61.33 | **Truncated right triangle — see 4.2** |
| Medium rectangle | 4 | 6 × 4 | 32.00 × 21.33 | Rectangle |
| Long line | 2 | 10 × 2.5 | 53.33 × 13.33 | Rectangle |
| Short line | 4 | 6 × 2 | 32.00 × 10.67 | Rectangle |

Sixteen pieces total (4 + 2 + 4 + 2 + 4).

## 4.2 The large "triangle" — actually a truncated quad (important)

Per direct observation of the physical GW templates (user has them in hand):

- It is **not** a true right triangle. It's a **four-sided shape**.
- The sharp tip of the triangle is **cut off**, leaving a short edge roughly **1.5 board inches** wide where the point would be.
- The long diagonal side has a **slight curve** to it (not a straight hypotenuse).
- Overall bounding box: 8 × 11.5 board inches.

**Approximation for v1** (bounding box 8 wide × 11.5 long, board inches; origin at the right-angle corner):

```
(0, 0) → (8, 0) → (1.5, 11.5) → (0, 11.5) → close
```

i.e. a right trapezoid-ish quad: full 8" base, a 1.5" edge at the far end, one vertical side, and one long diagonal from (8,0) to (1.5,11.5). Optionally bow the diagonal outward very slightly (a single quadratic curve with a small sagitta, ~0.25") to match the observed curve.

**PENDING:** photos of the physical templates are coming and take precedence over this approximation. Flag this shape in code as `// TODO: refine against reference photos`.

## 4.3 Terrain volumes on the footprints

Footprints define the *plan*; the terrain standing on them is simple massing:

- **Level heights:** floors at 3 board inches (16 world units) and 6 board inches (32 world units) above the mat. Walls/floors ~0.15 board inches thick (≈0.8 world units) — miniature-terrain chunky, not architectural.
- **Minimum doorway / passable-gap width: 5.0 world units** (the Primaris capsule is 2.8 units wide — see `07-collision-and-ground.md §7.1`). Any gap narrower than 5.0 is deliberately Primaris-blocking; if used, make it clearly readable (2.5-unit "small-body-only" slots are a fun traversal feature, never an accident).
- **Large rectangles & triangles:** multi-level open-topped gothic *ruins* — an L- or U-shaped arrangement of walls on the footprint edge, with partial Level-1 (and sometimes Level-2) floor slabs the player can jump-pack onto. Include at least one interior floor reachable by pack jump (peak = exactly 16 units, so Level-1 floors are the natural landing spots).
- **Medium rectangles:** solid obscuring blocks — shipping-container stacks, silo clusters, or a solid ruin chunk. 1–2 levels.
- **Long / short lines:** low linear obstacles — barricades, pipes, low walls. Height ~1 board inch (≈5.3 world units): chest-high to a Primaris, over-the-head cover for a Guardsman. That height contrast between bodies is a feature; keep line terrain at exactly this height.
- Exact GW kit dimensions for the new official 11th-edition terrain sets were not confirmed from primary sources; treat massing as tunable and prioritize the footprint dimensions + level heights, which are the load-bearing numbers.

## 4.4 Example board layout (tournament-style, mirrored)

A reasonable v1 layout — roughly rotationally symmetric about the board center, in board-inch coordinates (origin at board center, X across the 44" width, Z along the 60" depth):

| Piece | Center (X, Z) | Rotation |
|---|---|---|
| Large rect A | (0, +10) | 90° |
| Large rect B | (0, −10) | 90° |
| Large rect C | (−14, +22) | 0° |
| Large rect D | (+14, −22) | 0° |
| Triangle A | (+13, +8) | 180° |
| Triangle B | (−13, −8) | 0° |
| Medium rects | corners-ish: (±16, ±6) | varied |
| Long lines | (±8, ±26) | 0° |
| Short lines | scattered midfield flanks | varied |

Layout is aesthetic, not rules-critical — the agent may adjust for readability and fun traversal, but keep center-heavy large pieces (blocks sightlines across the middle, standard competitive practice) and rough 180° symmetry.

## 4.5 Rendering the templates

- Render each footprint as a **flat decal** slightly above the mat (y ≈ 0.02, polygonOffset to avoid z-fighting): a printed-paper look — off-white or kraft-tan fill, thin dark border line, maybe faint hazard striping or an Imperial aquila-*like* generic glyph (avoid actual GW iconography).
- The terrain volume sits *on* the template with a small inset (~0.25 board inches) so the printed border stays visible around the base — exactly how it looks on a real table.
