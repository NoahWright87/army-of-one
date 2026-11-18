# Overhead explosion animations

The two transparent RGBA PNG sheets live in `assets/effects/`. Each row is a separate variation;
columns are consecutive frames from left to right. Canvas centers are fixed pivots in every cell.
All artwork is strictly overhead: fire, debris and smoke spread across the ground plane, with no
side-view plume, horizon, mushroom cloud or baked terrain.

| Sheet | Frame | Grid | PNG size | Playback | Used for |
|---|---|---|---|---|---|
| `explosion_small.png` | 128×128 | 8 columns × 3 rows | 1024×384 | 30 fps, ~267 ms | Grenades, breaking cover |
| `explosion_large.png` | 256×256 | 8 columns × 3 rows | 2048×768 | 24 fps, ~333 ms | Mines, rockets/shells, destroyed hazards/objectives |

Rows: round lobed fireburst; jagged radial blast/dust/debris; irregular clustered fire puffs.
Each sequence progresses through ignition, expansion, peak fire, smoke/embers and dissipation.
The large sheet has broader fire, heavier dust and more debris than the small sheet.

Preparation used a fixed crop/scale for the whole grid, per-cell alpha feathering to isolate the
original generated haze, and a progressively fainter smoke tail. No per-frame recentering or
rescaling: the explosion grows within its frame. Every frame has two fully transparent border
pixels to prevent texture bleed. The sheets contain no labels or grid lines.

`src/content/explosions.ts` is the data source for sizes, frame order, rates and animation names.
The asset manifest declares sheet frame dimensions. Preload uses Phaser's native sprite-sheet
loader and registers one native animation per row. The renderer plays those one-shot animations
on pooled Sprites; completion returns the sprite to the pool. Existing muzzle/impact images use
the same pool with animation stopped and their normal fade/scale effect.

Variation selection is a deterministic hash of event id/tick, independent of simulation RNG.
Damage, blast radii and simulation events are unchanged; existing visual sizing is preserved.
Character images remain static. Review all six animations through actual explosion events and
the gameplay pool at `?scene=gallery&explosions=1`.

Verification: `tools/explosions.test.ts` checks dimensions, transparent frame boundaries,
ignition-to-peak growth, smoke fade, distinct variations, row frame ranges and event routing.
Also inspect the running gallery: a script cannot prove that artwork is top-down or motion looks
coherent. `docs/art/NOTES.md` records delivery validation.
