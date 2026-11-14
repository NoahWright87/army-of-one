# PHASE13-b: Budgets and one generated level (sketch)

**Goal:** a level stitched from blocks by seed, with a budget, playable at
`?mission=gen-<seed>`; and the editor features that make authoring for it easy.

**Depends on:** 13-a. Flesh this out after the owner has tried the editor.

## Direction

- **Budget spending** ([D85]): priority 0 always; then 1…5, breadth-first across the block, a
  seeded order within a priority; members need their anchor, levers their gate; skip what
  doesn't fit and keep trying cheaper things at the same priority; leftover carries to the
  next block. A threat-cost table in `tuning.ts` (riflemen aren't free for the enemy, [D86]).
- **Editor budget slider:** drag it and watch the block fill, group by group; show the block's
  total cost. Play uses the slider's budget.
- **Rotate / flip** blocks (8 orientations): edges, ground, rects, facings.
- **One level:** a few columns × rows of blocks filled in scan order with exact tag matches
  ([D83]), a reachability check (reroll on failure, seeded), objective in the far row, spawns
  below the first row. `npm run gen -- --seed N` prints it; a coverage mode lists missing
  edge layouts.
- **Block library** in the editor: official blocks (`src/content/blocks/*.json`) and custom
  ones (browser), grouped by edge layout with counts including rotations.
- **Group templates:** save a group, stamp copies into other blocks.
- A starter set of official blocks, ideally the owner's.

## Open

- Level size for a single generated mission (before the world map exists).
- Whether replays of generated levels carry the stitched map or just the id ([E13]).
