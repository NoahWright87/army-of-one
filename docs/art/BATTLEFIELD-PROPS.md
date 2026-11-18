# Cover and fixed turret art

Owner-authorized next batch after the projectile readability pass. All images use the existing
painted tabletop miniature style, strict overhead view, transparent RGBA and no baked shadows.

## Delivered

Thirteen PNGs in `assets/battlefield/`, registered by key in `src/content/assets.ts`:

| Family | Files | Runtime size |
|---|---|---|
| Cover | `cover_sandbags`, `cover_crate`, `cover_fence`, `cover_halfWall`, `cover_window`, `cover_bunkerWindow` | Strips 256×64; crate 128×128 |
| Debris | `rubble_sandbags`, `rubble_wood`, `rubble_concrete`, `rubble_metal` | Strips 256×64; wood 128×128 |
| Fixed turret | `turret_base`, `turret_gun`, `turret_wreck` | 128×128, displayed in the existing 64-world-unit footprint |

Names above omit `.png`. Sandbags spill burlap/sand; crates leave planks/straps; fence collapses
into bent mesh/rails; concrete walls/windows leave chunks and reinforcing wire. Cover is neutral.
Fixed enemy turrets have grey steel and restrained red plates; their existing windup warning and
hit flash still apply. The base remains fixed while the gun rotates. Wrecks have no rotating gun.

## Integration

`src/content/battlefield-art.ts` holds the inventory and material-to-texture mapping.
`render/cover-art.ts` computes pure layouts inside each authored rectangle. Phaser draws repeated
sections at a fixed material scale, rotating the local strip for vertical barriers. Crates tile
as square objects; they are not stretched into a single elongated crate. Matching join pixels
avoid transparent seams. Narrow fence mesh and window/slit openings reveal the ground beneath.

Each cover body and its alpha-shaped contact shadow are created once. Destruction swaps the
body texture to its material debris and hides the intact shadow. Restoring an earlier view swaps
them back. This replaces procedural flat-colour cover and dot rubble, and fixes persistent cover
shadows after destruction. The existing turret keys now point to painted final PNGs; obsolete
placeholder turret files were removed by the normal generator.

No changes to collision rectangles, cover probabilities, armor/HP, damage, AI, recordings or
saved-map formats. Block/world planning diagrams retain their schematic object symbols.

## Generate and reproduce

The **built-in imagegen tool** generated the masters from the existing tank hull/truck gun style
references. Exact prompts are preserved in [battlefield-prompts.json](battlefield-prompts.json).
Selected originals were copied to the ignored `art-source/battlefield/` directory. Packaging
only crops, resamples, matches strip edges and aligns the gun pivot; it does not redraw the art.

```
node --import tsx tools/package-battlefield.mjs art-source/battlefield
npm run gen:placeholders
```

The turret gun's tallest alpha span identifies its round breech, so the pivot follows the
mechanical mount rather than the weapon-inclusive bounding box. All runtime images are committed;
the game never needs the ignored master files.

## Review and validation

`?scene=gallery&props=1` shows every material as short/long/vertical/destroyed cover, plus rotating,
warning and destroyed fixed turrets. Start `?mission=mission-04&dev=1` to see them in Compound.
The legacy `?scene=sandbox` route always uses Breach, regardless of its mission query parameter.

723 tests plus lint, purity lint and production build pass. New checks cover fixed-scale/vertical
layouts, manifest mappings, exact strip joins and transparent window/slit openings. Desktop and
mobile Chrome checks cover the gallery, 90/180/270-degree cameras, real Compound/generated maps,
repeated destruction/restoration, unchanged map data, stable scene object counts and shutdown.

## Follow-up delivery

[The final image pass](FINAL-IMAGE-PASS.md) now supplies the other structures, objectives, scorch,
capture/status art, muzzle flash, title/panel/campaign art and compatibility textures. Idle and
armed mine illustrations remain the sole image placeholders after the generator blocked the base art.
