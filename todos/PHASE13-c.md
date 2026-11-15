# PHASE13-c: The world map (sketch)

**Goal:** a campaign board built like a game of Carcassonne ([D89]), carved into levels
([D90]), each played as a self-contained mission ([D91]).

**Depends on:** 13-b.

## Direction

- **Frame** ([D83]): board 6–9 blocks wide. Enemy base (all-concrete edges) in the northern 2–3
  rows; player entries (drop zones, beach landings) in the southern 1–2 rows; a few impassable
  seams chosen at random while keeping a continuous path (preferably several) from start to
  base.
- **Fill** in scan order with exact tag matches; any barrier tag satisfies a barrier seam. More
  concrete around the base so it ends up heavily fortified.
- **Carve** into contiguous levels along natural seams (choke points, rivers, the base
  perimeter). Irregular shapes are fine (the outside is solid).
- **Per level:** entries where it borders the start or levels you hold (you pick the side on
  the world map; the level is rotated so you attack upward), objectives toward the far side at
  authored objective slots ([Q46]).
- **World map view:** the board's painted ground, scaled down (one pixel per cell), with level
  outlines; enemies aren't shown (they're decided by the budget when you deploy).
- **Campaign inputs** ([D91], PHASE14): enemy budget grows per level taken; bonus blocks (fuel
  depot → income, factory → unlock); nothing else carries over.

## Open

- [Q46] What wins a level.
- Whether hand-made campaign boards (fixed layout, generated levels) come first.

## Notes from implementation (first slice: the generator and its viewer)

Built as a testing tool, not yet a campaign screen:

- **`src/gen/world.ts`** `generateWorld(pool, { seed })`: a 7 × 10 board (`BLOCK_TUNING.world`).
  Frame: the base in the top 2 rows; up to 4 strokes: **rivers** across the seams *between bands
  of levels* (with one or two crossings) and **ridges** between columns, each kept only if
  every block stays reachable from the bottom row. Fill: `fillGrid` (shared with single random
  levels) with the frame's barriers as hard constraints, and **every seam the frame didn't mark
  must be crossable** ([D83]: the frame decides the hard edges). A board with an unreachable
  pocket is rerolled (seeded).
- **Carving** (rectangles for now): bands 2 rows deep from the bottom, the base rows last,
  each split into chunks 2–3 blocks wide, cutting at ridges where possible; a chunk whose whole
  south edge is river is merged into its neighbour so every level has a way in. Budgets rise
  from `budgetFirst` (first band) to `budgetLast`, base levels × `baseBudgetBonus`, capped at
  what the level holds.
- **Level maps** (`worldLevelMap`, via `buildLevelMap` shared with random levels): the level's
  blocks attacked from the south; the budget split by row (further up weighs more) but never
  more to a block than it can spend, so a full budget buys everything; the objective at the
  first *reachable* candidate (top-row objective slots, then other slots, then block centres).
- **Viewer** (`?scene=world`, title-screen link "World map generator"): the board (ground,
  walls, frame strokes in red, inexact matches dashed orange, base outlined red, levels with
  number and budget). R / Regenerate rolls a new seed, ◀ ▶ step seeds, the seed stays in the
  URL. Click a level: a budget slider with a live sketch of the level (enemies by role,
  turrets, mines, objective, spawns) and stats; **Playtest at this budget** opens
  `?mission=world-<seed>-<level>-<budget>` ("← World map" comes back).
- Stats over 100 seeds with the 17 starter blocks: ~40 ms per world, ~3.4 attempts, every level
  reachable; ~5 inexact matches per world (gaps in the starter blocks, shown in the viewer).

Not yet: irregular level shapes, entries from the side (rotating a level), campaign state
([D91]), the world map as a player-facing screen, base interiors deeper than one wall row
(needs inner corners).

## Notes from implementation (tile matching, [D101]–[D104])

- **Edge tags are gone** (block format v3; v1/v2 load and keep their painted edges). Matching is
  `src/gen/edges.ts`: sides read clockwise, exact tile types, ±1 place; `EdgeMatcher` caches pairs.
  Cost: ~25 ms per 7 × 10 board, ~55 ms with every level's map built.
- **Growth** (`src/gen/grow.ts`): HQ (role `hq`) top, start (role `start`) bottom, turns
  (`tuning.grow.enemyShare` = 0.34 to the enemy), each cell taking a block that matches every
  placed neighbour; otherwise the best partial match (logged, dashed orange in the viewer).
  `connect` cuts a 3-wide path (Dijkstra over tiles, obstacles cost 40×) where needed; the
  world cuts start → HQ, and each level cuts south edge → objective if it has no way in.
- The frame (rivers/ridges strokes) and base rows are gone; carving stays rectangular bands.
- Tile types: Rocks (`K`) and Concrete Wall (`X`) are solid (become walls); Bridge (`B`) is
  only painted by cuts.
- Editor: edges unlocked; each side shows "N blocks fit" (live) and a preset menu; a block's
  role (start / HQ) is set in the Block panel. Placed walls/cover may not touch edge tiles.
- 25 new PLACEHOLDER starter blocks (field, roads, rivers, lake edges/corners/inlet/open water,
  river mouth, ridges, base wall/gate/corners/yard/road/HQ, landing zone).
- Stats (100 seeds, official blocks): ~10 inexact matches per 70 blocks, a quarter of worlds
  needed a short cut, every level reachable.

## Notes from implementation (bigger levels and world, [D105])

- `tuning.world`: 8 × 60 board, bands 10 rows deep, levels 2–3 wide (~18–19 levels per world).
  `tuning.level`: random levels are 2 × 10. Budgets are per block, ramping by band (30 → 80 per
  block, base band × 1.3).
- Level reachability is rasterized (one bitmap of blockers per level), which took a level map
  from ~85 ms to ~12 ms. A whole board grows in ~165 ms.
- Viewer: the board fills the stage width and scrolls (opens at the bottom, the player's start);
  the level sketch is capped in height. "Inexact matches" counts loose cells again.
- Stats (10 seeds, official blocks): ~80 loose matches per 480 blocks (~16%, gaps in the starter
  set), every level reachable, ~83 enemies per level at its default budget.

## Notes from implementation (random campaign, PHASE13-d, [D106])

- **Title screen:** "Start a campaign" / "Continue campaign" is the main button; "New campaign"
  (asks twice) when one is in progress. The handmade missions sit under it.
- **State** (`src/gen/campaign.ts`, pure): seed, whether it uses your blocks, levels taken.
  `attackable` = first band, or directly north of a held level (overlapping columns);
  `campaignBudget` = the level's own budget × (1 + 0.12 × levels taken), capped at all it holds;
  `hqLevel` = the top-row level with the HQ block; taking it wins.
- **Campaign map** (`?scene=campaign`): the board with held levels tinted blue, attackable ones
  outlined yellow, locked ones dimmed, the HQ red. Click a level: status, size, budget, enemy
  count and a sketch; **Attack**. Zoomed so about two bands fit on screen.
- **Battles** (`from=campaign`): skip the title (continue the level's save if there is one),
  "← Campaign" button, a win marks the level taken and the results card's button returns to
  the map.
- Not yet: attacking from the side, losing/retreating, carry-over between levels ([Q58]).

## Notes from implementation (growth look-ahead and repair)

The owner found blocks that plainly didn't match (concrete against a river) while the viewer
said "Matches its neighbours". Three bugs, all fixed in `src/gen/grow.ts`:

- **No look-ahead.** A block was checked only against placed neighbours, so it could leave an
  empty neighbour that nothing could fill (river to the north, compound walls east and west).
  Now candidate sets are bitsets over the palette; a block is only chosen if every empty
  neighbour still has something that fits, and the frontier cell with the fewest options goes
  first.
- **Dead ends** clear the neighbours boxing a cell in and regrow them (`tuning.grow.repairsPerCell`,
  `repairBudget`). Only after that does the fallback run, and it now picks the block whose edge
  *tiles* agree best (it used to count matching sides, so a whole concrete edge against water
  scored the same as a near miss).
- **Fit is judged at the end**, seam by seam (`seamMatches`). It used to be recorded when a block
  was placed, so a block that was fine when placed showed "matches" after a later neighbour broke
  the seam. The viewer's block panel shows ✓/✗ per side with the neighbour's edge, and the
  overlay draws the bad seams themselves.
- Result over 20 seeds (official blocks): bad seams per world 71 → ~3 (of 892), ~106 ms per world
  (was ~135). Base pieces in the open country fell from ~28% to ~16% of blocks as a side effect.
  The leftovers are real content gaps (e.g. a road dead-ending at grass or at a compound wall
  with no gate), visible in the viewer.
