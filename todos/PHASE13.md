# PHASE13: Map blocks, generated levels and the world map (overview)

**Goal:** endless, fresh, human-authored levels. People who play the game build **blocks**
(15 × 15-cell pieces of map with their fortifications and soldiers) in an in-game editor; a
seeded generator stitches them into levels and a Carcassonne-style world map ([D80]–[D91]).

Read [D80]–[D91] first: they replace this doc's earlier "chunks along a vertical spine" sketch.

## The pieces, in order

| Part | What | Status |
|---|---|---|
| [13-a](PHASE13-a.md) | Block format + **block editor MVP** (`?scene=editor`): paint, edge tags, place, priority/groups, JSON download/upload, Play | Built |
| [13-b](PHASE13-b.md) | Budget spending, rotate/flip, one generated level from a seed (`?mission=gen-<seed>`); editor budget slider, block library, starter blocks | Next |
| [13-c](PHASE13-c.md) | World map board: frame, fill, carve into levels, objectives per level; campaign inputs ([D91]) | Sketch |

The owner asked for a usable UI first so direction can be checked early: each part ends with
something to click on.

## Rules that keep this from getting over-complicated

Learned from the toybox shmup editor (per-enemy paths, timing tracks, a separate editor model):

- **One map format.** A block becomes a plain `MapDef`; the editor plays it in the real sim.
  No second model, no bespoke enemy scripting ([D84]): soldiers, roles and the AI do the rest.
- **Blocks are fixed content.** No per-instance knobs. Difficulty comes from the budget
  ([D85]) choosing how much of an overfilled block spawns, never from editing what's there.
- **The generator is simple.** Scan-order fill with exact tag matching ([D83]), seeded picks,
  a logged fallback when nothing fits. No backtracking or constraint solving.
- **Templates are copies** (stamped groups), never live links.
- **The world map remembers nothing** about battles ([D91]): levels are pure functions of their
  inputs (blocks, entry side, budget, unlocks).

## Shared conventions

- Pure TS: `src/gen/` (lint-restricted like `src/sim/`). Data: `src/content/ground.ts` (ground
  kinds, edge tags), `src/content/tuning.ts` (`BLOCK_TUNING`), official blocks will live in
  `src/content/blocks/*.json`.
- Block JSON: `v` (schema version), `id`, `name`, `edges {n,e,s,w}`, `ground` (15 strings of
  15 letters, north first), `items` (cells; facing in degrees, 90 = south). See
  `src/gen/block.ts`.
- Player-facing text in `src/content/strings.ts` (`editor.*`, `ground.*`, `edge.*`).
