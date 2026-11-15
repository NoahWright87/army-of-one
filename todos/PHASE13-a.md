# PHASE13-a: Block format and the block editor MVP

**Goal:** a basic, very usable editor so the owner can author blocks and check the direction
before the generator exists ([D80]–[D82], [D85], [D87], [D88]).

**Owns:** `src/gen/`, `src/ui/editor/`, `src/app/editor-*.ts`, `src/content/ground.ts`.
Shared touches (minimal): `MapDef.ground`, the renderer's ground drawing, `registerMap`,
`boot.ts` / `main.ts` hooks, strings, `BLOCK_TUNING`.

## Tasks

- [x] Block JSON format (`src/gen/block.ts`): 15 × 15 ground letters, four edge tags, items
      (wall, cover, gate, lever, turret, mine, soldier, capture point, objective slot) with
      priority 0–5, group and anchor. Validation with editor-facing problems, parse +
      diff-friendly `blockToJson`.
- [x] Ground kinds and edge tags (`src/content/ground.ts`): grass, dirt, road, sand, concrete,
      water; tags grass / road / stream / water / concrete. Tags paint and lock their edge
      (corners free).
- [x] Block → playable `MapDef` (`src/gen/preview.ts`): staging strip with three spawns, the
      first objective slot becomes a capture-to-win flag, capture points get forward spawns,
      groups become squads (holding their capture point), water from painted cells.
- [x] `MapDef.ground` drawn by the renderer (flat placeholder colours + a stepped blend at
      borders).
- [x] Editor at `?scene=editor`: paint (click/drag), place, select/drag, properties panel,
      edge tags, live problems list, undo/redo, Delete, R rotate, autosave to localStorage,
      Download / Copy / Open JSON, New, **Play this block** (the real game, fresh save each time,
      "← Editor" button back).
- [x] Tests: block validation and JSON, preview map validity + a headless sim run with enemies,
      water merging, editor model (paint locks, drag = one undo step, rename keeps levers).

## Not in this part (13-b and later)

Budget slider, rotate/flip preview, block library (grouped by edge layout), group templates,
starter/official blocks, bridges and drawbridges, vehicles' patrol routes, touch editing.

## Notes from implementation

- The editor canvas is a plain 2D canvas, not the Phaser renderer I proposed: quicker to make
  usable and nothing to keep in sync for editing. **Play** is the WYSIWYG check (it runs the
  real renderer and sim). Revisit if authors want the game's look while editing.
- The Play map resolves on the main thread (`resolveWorker` is skipped for it): the worker can't
  see a map registered at runtime ([E13]).
- Every soldier group is one guard squad; ungrouped soldiers share one squad. Patrol routes
  aren't authorable yet.
- Facing is picked from 8 directions; R rotates rects about their centre (so a rotated rect can
  sit on quarter cells) and turns facings 45°.
- Validation stops walls/cover sitting on a band cell the edge tag says is open ([D81]); gates
  may (a gated road edge is fine).
