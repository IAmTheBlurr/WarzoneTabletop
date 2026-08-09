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
