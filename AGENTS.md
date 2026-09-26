# Repository guidance

## Evidence and scope

- Inspect the code, configuration, and checks relevant to the task. They establish current behavior; documentation explains use and intent. Investigate disagreements instead of changing working behavior to match stale prose.
- Preserve unrelated local changes. Keep game behavior changes separate from documentation and housekeeping unless the task requires both.
- Keep the browser application self-contained. Terrain capture, scanner hardware, and offline asset tools are separate projects.

## Implementation

- Prefer clear names, types, small focused functions, and executable checks over prose that restates implementation. Comments should explain non-obvious reasons or constraints.
- Use `GAME` from `src/constants.ts` for shared gameplay tuning. Use `boardInchesToWorld` in `src/world/layout.ts` at physical-inch conversion boundaries. Keep units explicit in identifiers.
- Preserve the deliberate scale convention, responsive ground movement, stable camera, and home-den setting unless the task changes them. Read `docs/explanation/design.md` when changing those choices.
- Keep fixed-step simulation independent of rendering. The player controller and dice physics have separate collision representations; terrain changes may affect both.

## Verification

- Read `package.json` for available commands. `npm run build` type-checks and builds; there is no `npm test` script.
- For behavioral changes, use the relevant browser checks and manual exercises in `docs/how-to/change-and-check.md`. Report what actually ran and any unresolved failure. A historical result is not current verification.
- For documentation-only changes, check links, commands, and source references. Do not add tests that merely repeat implementation.
- Stop local servers you start for a task when they are no longer needed.

## Documentation maintenance

- Keep README focused on running and using the current application. Organize additional docs by reader need: tutorials, task guides, source-linked reference, and explanation.
- Link to code and configuration instead of copying algorithms, tuning tables, directory inventories, or dependency versions. Change affected documentation in the same patch as behavior.
- Keep durable reasoning in one place: near the relevant code, or in the short design explanation when it crosses systems.
- Do not add session transcripts, boot prompts, personal profiles, generated acceptance reports, speculative roadmaps, or archives of superseded instructions.
- `STATUS.md` is optional working memory: at most 30 lines, only unresolved actionable items with source pointers. Replace stale entries and remove completed items; do not append a history.
- `AGENTS.md` owns shared guidance. `CLAUDE.md` imports it; do not copy rules between them.

## GitHub

- Use dedicated `gh` subcommands for GitHub operations and `git` for source control. Inspect the applicable command help before deciding an operation is unsupported.
- Do not use `gh api`, direct REST/GraphQL, browser automation, connectors, or custom scripts for GitHub operations. If dedicated commands cannot do the requested operation, explain the limitation before using another method.
