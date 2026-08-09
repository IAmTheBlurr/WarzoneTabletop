# Warzone Tabletop — First-Person Three.js Battlefield

A first-person exploration of a Warhammer 40,000 tabletop battlefield at miniature scale — the "you are the miniature" fantasy. Think of the classic *Sin* multiplayer map set inside a giant room, or Micro Machines / Toy Commander: the world reads as a physical tabletop (painted-miniature aesthetic, printed footprint templates, low-poly terrain), but you walk through it in first person at the eye height of the model you're embodying.

This spec pack is written to be consumed by an agentic coding session (Claude Code / Codex). Every gameplay-relevant number lives in `game-constants.json` — treat it as the single source of truth and load or mirror it in code rather than hardcoding values in multiple places.

## Document index

| File | Contents |
|---|---|
| `README.md` | This file. Project overview, agent guidance, glossary. |
| `game-constants.json` | **Single source of truth** for all numeric parameters. |
| `01-scale-system.md` | The 1:64 scale math, unit conventions, board dimensions, conversion tables. |
| `02-body-profiles.md` | The three switchable player bodies (Guardsman, Sister of Battle, Primaris Marine): eye heights, movement speeds, jump heights, and controls. |
| `03-jump-pack-physics.md` | Jump-pack mechanic: hold-to-activate, fixed ballistic arc, and the ground-proximity retro-burn landing system. Includes formulas and pseudocode. |
| `04-terrain-footprints.md` | Official 11th-edition terrain footprint set (shapes + dimensions), terrain level heights, and how to lay them out. |
| `05-art-direction.md` | The "tabletop diorama" aesthetic: materials, palette, lighting, what to avoid. |
| `06-implementation-roadmap.md` | Phased build plan with acceptance criteria per phase, suggested file structure, and testing notes. |
| `07-collision-and-ground.md` | **Authoritative** collision model (player capsule, AABB walls, auto step-up) and ground detection (5-ray pattern, snap, coyote time). Also defines feet-vs-camera conventions, spawn/camera behavior context, and body-swap collision. |

## Core design pillars

1. **You are the miniature.** The camera lives at the eye height of a 28mm-scale model blown up to life size. The world around you is the *tabletop*, not a "real" battlefield — it should look like painted resin, MDF terrain, and printed paper templates.
2. **Lore-informed, fun-first.** Distances, heights, and terrain sizes are derived from real tabletop measurements at a rigorously computed 1:64 scale. Movement speeds are *not* lore-simulation speeds (those work out to under 1 mph and feel terrible — see `01-scale-system.md`); they are tuned for playable FPS feel, scaled per body type.
3. **Three bodies, one world.** The player can hot-swap between three profiles (Guardsman / Sister of Battle / Primaris Marine). Switching changes camera height, movement speed, and jump capability — the same doorway should feel cavernous as a Guardsman and snug as a Primaris.
4. **The jump pack is a commitment.** Hold jump long enough and the jump pack fires: a fixed, unsteerable ballistic arc covering exactly 64 units, with an automatic proximity-triggered retro-burn that cushions the landing. No air control. Simple, predictable, cinematic.

## Unit convention (critical)

**1 Three.js world unit = 1 real-world foot** (at in-fiction scale). All constants in this pack use these units unless explicitly labeled "board inches" (physical tabletop measurements). Conversion: `board inches × 64 ÷ 12 = world units`. See `01-scale-system.md`.

## Tech stack

- Three.js (latest stable), plain JS or TypeScript at the agent's discretion.
- No physics engine required — jump/gravity/retro-burn are simple analytic kinematics (see `03-jump-pack-physics.md`). Collision and ground detection are fully specified in `07-collision-and-ground.md`; camera (FOV 75°), spawn point, and default body are in `game-constants.json → camera / spawn`.
- Pointer-lock first-person controls (WASD + mouse). Keep dependencies minimal; a single-page Vite app is a fine baseline.

## Scope guardrails

- **In scope:** flat battlefield board, footprint templates rendered on the mat, simple low-poly terrain volumes on those footprints (boxes/prisms at correct level heights), three body profiles, sprint, jump, jump pack with retro-burn, body switching.
- **Nice-to-have:** the beyond-the-board "room" dressing (table edge, floor far below, giant furniture) that sells the miniature fantasy; dice/tape-measure props; a HUD showing current body.
- **Out of scope (v1):** combat, AI, multiplayer, animations beyond camera movement, detailed GW model recreation (IP caution: shapes should be *generic* sci-fi gothic, inspired-by rather than replicas).

## Known open items

1. The large "triangle" footprints are actually four-sided — the point of the triangle is truncated to a short (~1.5 board-inch) edge, and the long diagonal has a slight curve. The user has physical templates and will supply photos; until then use the documented approximation in `04-terrain-footprints.md`.
2. Exact heights of the new official 11th-edition GW terrain kits were not confirmed from primary sources. The spec uses the user's stated convention (3 board inches per terrain level) which is consistent with common tournament terrain. Treat per-kit dimensions as tunable.

**Resolved decisions (do not reopen):** the scale factor stays 64 despite the 8.5 ft Primaris body (`01-scale-system.md`, "The 8.0 vs 8.5 anchor"); collision/ground semantics are locked by `07-collision-and-ground.md`; the Sister's speed deliberately exceeds her leg-length scaling (armour-assist identity, `02-body-profiles.md`); spawn is the Primaris at (0, 0, −145) facing board center, FOV 75° (`game-constants.json`); the room floor is visual-only (never collidable/raycastable) with the respawn plane at y = −175 just above it (`07 §7.2`).

## Glossary

- **Board inches** — measurements on the physical tabletop (the 44×60" board, 6" moves, footprint templates).
- **World units** — Three.js units, 1 unit = 1 in-fiction foot.
- **Scale factor** — 64. One board inch = 64 in-fiction inches.
- **Footprint** — a flat printed template on the mat defining a terrain area (11th-edition rules concept).
- **Level** — terrain storey. Level 1 floor sits 3 board inches (16 world units) above the mat; Level 2 at 6 board inches (32 world units).
- **Retro-burn** — automatic downward-thrust braking phase of a jump-pack descent, triggered by proximity to the ground, not by a timer.

## Running the implementation

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, click **Enter the battlefield**, and use mouse look with WASD. Hold Shift to sprint, tap Space for a normal jump, hold Space for 0.5 seconds as the Primaris to fire the jump pack, and press 1/2/3 to switch bodies. Press `~` for controller telemetry.

The production build is `npm run build`. Measured phase results and checkpoint hashes are recorded in `ACCEPTANCE.md`; implementation judgments are isolated in `DECISIONS.md`.
