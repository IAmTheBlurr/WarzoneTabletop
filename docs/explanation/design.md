# Scale and game feel

Warzone Tabletop places a first-person player inside a miniature battlefield in an ordinary home den. The contrast between painted terrain and full-size furniture establishes the scale. It is an exploration prototype; it does not simulate tabletop turns or combat rules.

## Physical scale and perceived speed

One world unit represents one in-fiction foot. A physical tabletop inch represents 64 in-fiction inches. Conversion belongs in `boardInchesToWorld` in [layout.ts](../../src/world/layout.ts); configured measurements live in [game-constants.json](../../game-constants.json).

The scale was anchored to an eight-foot figure represented by a 1.5-inch miniature. The Primaris body's height was deliberately chosen slightly larger than that anchor. Changing that body height does not imply rescaling the world.

Literal tabletop movement rates and realistic walking speeds made traversal feel too slow. Ground movement therefore responds immediately, with running and sprinting tuned for play. Body size, air control, jumping, and access to the pack provide the differences between bodies. The controller's existing ground-response comment records this choice at the implementation site.

## A stable view in a convincing room

Keep the camera free of routine head bob, sway, landing compression, and speed-based field-of-view changes. Surface detail, nearby objects, room parallax, and responsive movement should convey speed and scale. This does not eliminate actual camera translation during jumps or eye-height changes when switching bodies.

The environment is an inhabited private den: visible lamps, a hallway, shelves, framed art, a window, and hobby objects. Terrain should read as painted physical models; surrounding furniture should read as full-size objects. Extend that contrast rather than relying on unrelated screen effects.

## Player and dice collision have different jobs

The player uses the custom controller and collision helpers in [src/player](../../src/player). Its position is the feet, with the camera offset by eye height. Horizontal wall volumes and ground rays support the current flat-surface terrain. Slopes or arbitrary meshes would need deliberate collision work.

The room floor is scenery rather than a landing surface. Falling below the table respawns the player before reaching it, avoiding a stranded player with no route back.

The die uses `cannon-es` through [DiceSystem](../../src/dice/diceSystem.ts) for rotation, impacts, and settling. It has its own static collision bodies, including raised footprints that are not player ground targets. Changes to terrain need verification against both representations. The footprint-bridge tolerance is explained beside its calculation in [diceMath.ts](../../src/dice/diceMath.ts).

## A committed jump pack

The pack arms when a hold starts on a surface and launches after the hold threshold. Its flight ignores steering input. Braking begins when a downward ray finds a nearby surface, so it can react to terrain beneath the player.

The retro-burn solver deliberately advances vertical motion faster during braking to preserve the intended short flight while horizontal velocity remains unchanged. This is a game-feel compromise, not a physically exact projectile trajectory. The implementation and its rationale belong in [PlayerController](../../src/player/controller.ts); the phase-four checks exercise the resulting behavior.

## Provisional terrain

The initial footprint sizing reference was the [June 2026 Event Companion](https://assets.warhammer-community.com/eng_12-06_warhammer40000_event_companion-s3bfb5f9s1-ivswuij3fo.pdf). That is historical measurement provenance, not a claim of current rules compliance or exact kit reproduction.

The large polygon outline and terrain massing remain approximations. When measured replacements become available, preserve explicit units, origins and orientation, and provide simple collision proxies separately from detailed visual meshes. Capture and reconstruction tooling is maintained outside this browser application.
