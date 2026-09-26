# Outstanding work

Keep this file under 30 lines. Remove completed items; code and executable checks establish current behavior.

- Finish manual dice acceptance using [the verification guide](docs/how-to/change-and-check.md#check-dice-interactions). Cover face/result agreement, terrain and footprint contacts, repeated rolls, automatic rerolls, and player hits. The controller self-tests do not cover this feature.
- Replace provisional polygon footprint geometry only when measured reference data is available; see `truncatedTriangle` in [footprints.ts](src/world/footprints.ts). Preserve the current approximation until then.
- Select a project license and document [texture provenance](public/assets/textures/README.md).
