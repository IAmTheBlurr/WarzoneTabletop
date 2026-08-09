# 01 — Scale System & Units

Everything in this project hangs off one measured fact and one lore fact.

## Derivation of the 1:64 scale

- **Measured:** a Primaris Space Marine miniature is ~**1.5 inches** tall, feet to head (user measured a physical model in hand).
- **Lore:** a Primaris Space Marine in armour stands ~**8 feet** (96 inches) tall. (Lore sources put unarmoured Primaris at roughly 7'5"–7'6"; ~8–8.5 ft armoured is the accepted range. The scale math anchors on 8 ft = 96 in for a clean ratio; the relationship to the 8.5 ft in-game body is covered in the next section.)

```
scale = 96 real inches / 1.5 model inches = 64
```

**One board inch represents 64 in-fiction inches (5⅓ feet).** The tabletop is a 1:64 scale model of the battlefield.

## The 8.0 vs 8.5 anchor — a deliberate fudge (decision, final)

There is a quiet mismatch in this spec, made on purpose; do not "fix" it:

- The **scale factor (64)** is derived from the clean 8.0 ft lore figure (96 ÷ 1.5).
- The **in-game Primaris body** is 8.5 ft — the armoured lore ceiling, chosen so the hero body feels maximal.

Strictly, an 8.5 ft marine at 1.5 model inches implies scale 68. We keep **64** because every load-bearing number stays clean and mutually reinforcing: 16-unit terrain levels, a 64-unit pack jump whose peak is exactly one level, a 32-unit standard move. At scale 68 all of those go ugly (17-unit levels, 68-unit jumps) for a ~6% pedantry gain nobody will perceive in first person. Consequence: the Primaris camera rides ~6% higher than a strict 1:64 reading of the physical model. Accepted. If any future work re-derives scale, it must anchor on **8.0 ft**, never the 8.5 body height.

## World unit convention

**1 Three.js world unit = 1 in-fiction foot.**

Conversion (use this everywhere):

```
worldUnits = boardInches × 64 / 12  =  boardInches × 5.3333
```

Why feet and not meters: every source measurement in this project (board size, moves, footprints, lore heights) is imperial, so feet keep every conversion clean and auditable. Gravity is therefore **32.2 units/s²**.

## The battlefield board

| | Board inches | World units (feet) |
|---|---|---|
| Width | 44 | **234.67** |
| Depth | 60 | **320.00** |

The full 2000-point battlefield is about 235 × 320 ft — slightly smaller than a football pitch. Center the board on the world origin: X spans −117.33…+117.33, Z spans −160…+160.

## Terrain level heights

Tabletop terrain storeys step in 3-board-inch increments:

| Level | Board inches above mat | World units |
|---|---|---|
| Mat / ground | 0 | 0 |
| Level 1 floor | 3 | **16** |
| Level 2 floor | 6 | **32** |

16 ft per storey is taller than a normal real-world floor (10–12 ft) but reads perfectly for oversized gothic/industrial 40k architecture — keep it.

## Quick conversion table (common tabletop distances)

| Board inches | World units | Tabletop meaning |
|---|---|---|
| 1 | 5.33 | — |
| 2 | 10.67 | short-line footprint width |
| 3 | 16 | one terrain level |
| 6 | 32 | standard Move characteristic |
| 12 | 64 | jump-pack move / rapid-fire range feel |
| 24 | 128 | typical weapon range |
| 44 | 234.67 | board width |
| 60 | 320 | board depth |

## Rejected: lore-accurate movement speeds (reference only)

We computed what tabletop-faithful movement would feel like, and explicitly rejected it for gameplay:

- 6 board inches/round × 5 rounds = 30 board inches = **160 world units** total movement per game.
- If the whole game represents 3 minutes of fiction → **0.61 mph** (0.18 units/s). If 5 minutes → **0.36 mph** (0.107 units/s).
- Slower than a strolling toddler. Do **not** implement. Player speeds are fun-first (see `02-body-profiles.md`); this section exists so a future agent doesn't "helpfully" re-derive and apply these numbers.
