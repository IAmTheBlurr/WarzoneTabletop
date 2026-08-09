# Implementation Decisions

This file records judgment calls and interpretations. Numeric gameplay values still come exclusively from `game-constants.json`.

## Research verification — 2026-08-09

- **Footprints confirmed.** Games Workshop's current Warhammer 40,000 Event Companion lists the same 16-piece set as the spec: four 6×4-inch, two 10×2.5-inch, four 6×2-inch, four 7×11.5-inch, and two 8×11.5-inch polygon footprints. Source: <https://assets.warhammer-community.com/eng_12-06_warhammer40000_event_companion-s3bfb5f9s1-ivswuij3fo.pdf>.
- **Kit categories confirmed, full heights unavailable.** GW describes Battlefields: Armageddon as 28 terrain pieces split among ruins, galvanic relays, capacitors, and related industrial elements, but its preview and Event Companion do not give a complete measured height table. Source: <https://www.warhammer-community.com/en-gb/articles/1abmqefl/the-big-summer-preview-new-starter-sets-and-ready-painted-terrain/>.
- A current secondary-source photo places one dense Armageddon feature at roughly 95 mm / 3.75 inches. Because this is partial and not a direct measurement table, the implementation does not treat it as authoritative. The spec's 3-inch storey convention remains the massing anchor.

## Open calls

- **Triangle photo unavailable.** The supplied attachment directory contains the kickoff prompt only. Until the reference image is supplied, the large polygon uses the documented four-sided approximation with a 0.25-board-inch outward quadratic bow on the long diagonal. This will remain isolated in `src/world/footprints.ts` for later refinement.
- **Terrain massing.** Generic gothic-industrial forms will use floor tops at exactly 16 and 32 world units, line terrain at 5.3333 units, and 0.8-unit slabs. Decorative silhouettes may extend above those walkable heights, but collision floors will not.

## Collision acceptance interpretation

- `06-implementation-roadmap.md` says the Guardsman cannot jump a 2-unit block. Under the authoritative `07 §7.3` moving wall-band rule, however, a collider stops blocking once its top is below `feet + stepHeight`; while airborne, that gives the Guardsman an effective obstacle-crossing envelope of roughly `1.5 jump + 0.9 step = 2.4` units. The implementation follows `07` as required. Phase 2 therefore measures the three exact free-jump apices and supplies 2- and 5-unit calibration blocks visually, but does not alter wall collision to manufacture the older 2-unit expectation.
- `04 §4.3` calls the 5.333-unit line terrain “over-the-head” for a Guardsman, but the authoritative body constants make the Guardsman 5.8 units tall with eyes at 5.4. The exact mandated obstacle height is retained; in first person it reads at the eye line rather than literally above the head.

## Battlefield layout and massing

- The example layout's long lines overlap the corner large rectangles when converted literally. They are shifted to `(8, 27)` and `(-8, -27)` board inches, and the short lines are placed as two rotationally symmetric pairs. The center-heavy composition and 180-degree symmetry are preserved.
- Large ruin wall tops extend one board inch above their highest floor, using the documented 1-board-inch line height as the visual parapet increment. Walkable slab tops remain exactly 16 and 32 units and slab thickness remains exactly 0.8.
- Standard ruin openings are 6.5 units wide. The two polygon ruins deliberately use the permitted 2.5-unit small-body gap so the body-width traversal contrast exists on the final board.
