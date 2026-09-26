# Make and verify a change

Use this guide when changing the running application. Follow the [setup instructions](../../README.md#run-locally) first. Keep the browser console available for errors and telemetry.

## Find the behavior

| Change | Start here |
| --- | --- |
| Body dimensions, speeds, jump and dice tuning | [game-constants.json](../../game-constants.json), consumed through `GAME` |
| Movement, grounding, jump-pack timing | `PlayerController` in [controller.ts](../../src/player/controller.ts), [collision.ts](../../src/player/collision.ts), [jumppack.ts](../../src/player/jumppack.ts) |
| Input bindings | `InputManager` in [input.ts](../../src/player/input.ts) |
| Menus and saved mouse sensitivity | [index.html](../../index.html), [main.ts](../../src/main.ts), `SettingsStore` in [settings.ts](../../src/settings.ts) |
| Footprint placement and terrain | `BATTLEFIELD_LAYOUT` in [layout.ts](../../src/world/layout.ts), [footprints.ts](../../src/world/footprints.ts), [terrain.ts](../../src/world/terrain.ts) |
| Room and materials | [room.ts](../../src/world/room.ts), [materials.ts](../../src/world/materials.ts), [palette.ts](../../src/world/palette.ts) |
| Dice behavior and face detection | `DiceSystem` in [diceSystem.ts](../../src/dice/diceSystem.ts), `readTopFace` in [diceMath.ts](../../src/dice/diceMath.ts) |

Read the consuming code before editing a configuration field. Some fields describe dimensions or targets rather than controlling a solver directly. Input bindings are implemented in TypeScript.

For example, to tune a body's running speed, change its `runSpeed` under `bodies`, then check the body and control routes below and try that body in the scene. Keep values in world units per second; do not apply the tabletop scale factor again. Tests that compare speed to configuration check consistency, while play-testing determines whether the new speed feels right.

## Build

```sh
npm run build
```

This runs TypeScript checking and creates the Vite production build. It does not execute the browser self-tests. There is currently no `npm test` command.

## Run the relevant browser checks

With `npm run dev` running, append a query below to the local URL Vite prints. Open one route at a time on a fresh page. Each renders a result panel; every check should say **PASS**. The implementation is [selftest.ts](../../src/testing/selftest.ts), wired in [main.ts](../../src/main.ts).

| Query | Coverage |
| --- | --- |
| `?selftest=phase1` | Spawn, running, sprinting, jumping, falling and respawn |
| `?selftest=phase2` | Body changes, movement response, jump heights and dimensions |
| `?selftest=phase3` | Terrain registration, walls, ledges, steps, gaps and grounding |
| `?selftest=phase4` | Jump-pack launch, flight, braking, wall impact and off-table fall |
| `?selftest=timing` | Fixed-step movement under different render intervals |
| `?selftest=controls` | Keyboard direction, sprint, mouse look and body mapping |
| `?selftest=environment` | Environment structure, footprint thickness and presentation constraints |

These are executable checks of selected behaviors, not full visual or performance acceptance. After a controller or shared-configuration change, run all seven. For narrower changes, run the relevant routes and inspect the actual scene. Reload without the query before normal play.

Use **Backquote** to show telemetry. `?debugArc` draws a predicted pack arc; `?preview=corner` and `?preview=window` provide fixed inspection views. The browser-console helper `window.__WZT__` exposes snapshots and test controls; inspect its definition in `main.ts` before using it. Its `step` helper advances simulation and is not a pause control.

## Check dice interactions

After a dice or collision change, play at miniature eye height and check:

- Several rolls: visible top face agrees with the HUD, pips remain readable, and the die settles plausibly.
- Raised footprint edges and terrain walls: shallow edge bridging remains valid; genuinely cocked rests reroll.
- An off-table throw: the announcement, retirement animation and automatic replacement complete.
- Repeated R presses during rolling, settling and retirement: one active die remains and the system recovers.
- Player contact: a hard hit respawns the player once; disturbing a settled die returns its result to pending.

Use snapshots and scene inspection to reproduce a failure. Do not infer these results from passing controller tests or claim a statistically fair die from a few rolls.

## Check menus and settings

Open Options from the main menu and from the pause menu. Change sensitivity, return to play, and confirm both look axes respond. Reload at the same URL and confirm the choice persists; check Reset and Resume. Changing the port changes the storage origin.

## Finish

Check the console, review the diff, and update only documentation affected by the change. Describe validation in the change summary rather than creating a permanent acceptance report. Stop the local server with **Ctrl+C**.
