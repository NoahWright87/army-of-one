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
