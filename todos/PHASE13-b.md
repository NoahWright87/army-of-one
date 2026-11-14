# PHASE13-b: Budgets, a block library and generated levels

**Goal:** author a set of blocks for real (library, budget slider), and play a level stitched
from them by seed ([D80]–[D86]).

**Owns:** `src/gen/`, `src/ui/editor/`, `src/app/editor-*.ts`, `src/content/blocks/`,
`tools/gen-cli.ts`. Shared touches: `BLOCK_TUNING` (threat costs, level), strings, `main.ts`
(generated missions), the title screen (Random mission link).

## Tasks

- [x] **Budget spending** (`src/gen/budget.ts`, [D85]): priority 0 free and always; then 1…5,
      all of one priority before the next, a seeded order within a priority; members need their
      anchor, levers their gate; skip what doesn't fit and keep trying cheaper things.
      Enemy threat costs in `BLOCK_TUNING.threat` (nothing is free for the enemy, [D86]).
- [x] **Editor budget slider:** drag to see what a budget buys (the rest fades but stays
      clickable), "N of total: buys M", Reshuffle for the order within a priority. Play uses
      the slider's budget.
- [x] **Rotate / flip** (`src/gen/transform.ts`): 8 orientations of edges, ground, rects,
      points and facings.
- [x] **Shared map assembly** (`src/gen/assemble.ts`): blocks on a grid → `MapDef` (ids
      prefixed per block). The Play map and generated levels both use it.
- [x] **One level from a seed** (`src/gen/level.ts`): 2 × 4 blocks, scan-order fill from the
      bottom with exact tag matches, fallbacks logged, the budget rising toward the top,
      objective at a top-row objective slot, a reachability check with seeded rerolls.
      `?mission=gen-<seed>` (or `gen-<seed>-<budget>`) plays it.
- [x] **Block library** in the editor ("My blocks…"): your blocks (open / delete), official
      blocks (copy & open), grouped by edge layout up to rotation and flipping; blocks with
      problems are flagged and left out of levels. Opening JSON adds to the library.
- [x] **Starter blocks** (`src/content/blocks/starter-*.json`): 12 PLACEHOLDER blocks covering
      grass / road / stream / water edges so stitching works today. Replace with real ones.
- [x] **Random mission:** a title-screen link and "Play a random level" in the editor.
- [x] `npm run gen -- --seed N` prints a level; `--coverage N` sweeps seeds for missing matches.
- [x] Tests: budget rules, orientation, every official block valid in all 8 orientations,
      determinism, seams match, reachability, budget ramp, a sim run on a generated level.

## Not yet

Group templates (stamped copies), patrol routes, bridges, concrete/base blocks (no starter
block uses concrete edges yet), level size options, the world map (13-c).

## Notes from implementation

- The pick is two-step: a fitting block (equally likely), then one of its fitting
  orientations, so a symmetric block isn't 8× more likely than an asymmetric one.
- Coverage today: 500 seeds, every cell matched exactly; ~1 in 10 levels needed a reroll
  because the objective was cut off (usually water) and every level ended reachable.
- The reachability check is a coarse half-cell flood fill (walls, water, cover block; gates
  count as open). It doesn't know about mines or turrets.
- Generated levels use the official blocks plus the player's own valid blocks, so a
  `gen-<seed>` id only means the same map with the same block library ([Q51]).
- Runtime maps (Play, generated) resolve on the main thread (the worker can't see them).
