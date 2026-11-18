# Combat, terrain, UI and vehicle art continuation

This continues PR #22 after merging the campaign/projectile changes from PR #21. Gameplay,
damage, collision geometry, bullet speeds, drop and recording formats are unchanged. Bullet
views now include their existing weapon identity, so pellets, pistol rounds and rifle rounds
can use different images. Tank-shell views identify themselves separately from bazooka rockets.

## Delivered

| Area | Files | Runtime use |
|---|---|---|
| Projectiles | `assets/projectiles/{pellet,pistol,rifle,rocket,grenade}.png` | Pooled, interpolated images; MG/sniper use rifle art; tank shells use a larger pointed round |
| Bullet impacts | `assets/effects/impact.png` | 768×512 sheet; 6 columns × 4 rows; 128×128 frames; 36 fps, about 167 ms |
| Ground | `assets/terrain/{grass,dirt,road,sand,concrete,water,rocks,wall,bridge}.png` | Nine 128×128 repeating materials; campaign ground, static water/walls and hand-made-map ground |
| Vehicles | 20 tier-3 PNGs in `assets/miniatures/` | Truck/tank bases, ally/enemy hulls and turrets, wrecks, generated contact shadows |
| Shared atlas | `assets/atlases/miniatures.png` | Lossless packed source for all 49 miniature layers; existing keys and pivots preserved |
| Interface | `assets/ui/role_*.svg`, `helmet.svg` | Exported copies of the native SVG icon system; all nine roles; shared HUD/campaign helmet |

All 49 miniature files in PIECE-SPEC.md are now delivered. Infantry and explosion images were
preserved. The built-in imagegen tool generated the new raster masters; exact prompts are in
[generated-prompts.json](generated-prompts.json). UI icons extend the existing vector system.

Impact rows are earth/dust, steel sparks, stone/chips and an alternative steel ricochet. Dust
variations alternate on ordinary bullet stops; armor cues use the spark rows. This does not
infer a new ground-material hit rule. Flying shots do not produce a puff at their initial range
endpoint: the existing `bulletStopped` event controls where and when impacts play. Legacy
hitscan shots retain their endpoint effect. Impact row selection uses a stable presentation hash,
without consuming simulation randomness. Native one-shot animations reuse the explosion Sprite
pool, resetting animation, frame, scale and alpha on reuse.

Projectiles keep the hostile warm tint. Grenades keep the existing height, ground shadow, fuse
blink and bounce position. Vehicle base/hull heading and turret aim interpolate independently;
wrecks have no turret. The miniature base finish replaces the generic vehicle circle/live ring.
Art size does not change hitboxes. Terrain is rendered in contiguous row strips with global
texture offsets; physics and minimap/editor terrain colors remain the existing pure data.

## Reproduce and review

Runtime files are committed. Full-size imagegen masters are also saved locally in the ignored
`art-source/combat/`, `art-source/terrain/` and `art-source/vehicles/` folders. To regenerate runtime
sizes from masters with those same descriptive names:

```
node tools/prepare-combat-art.mjs art-source/combat
node tools/package-terrain.mjs art-source/terrain
node tools/package-vehicles.mjs art-source/vehicles
node --import tsx tools/pack-miniature-atlas.ts
node --import tsx tools/export-ui-art.ts
node --import tsx tools/check-miniatures.ts --priority 3 --require --sheets
```

Vehicle factions and base finishes are pixel-aligned recolors. Vehicle normalization removes
low-alpha generation haze, centers hulls and aligns turret mount pivots. Opposite terrain edges
are conditioned symmetrically; animation frames retain their fixed grid and receive transparent
2 px borders. The runtime asset glob excludes `_review/` sheets from production bundles.

The shared atlas avoids clipping found in software WebGL when many separate miniature textures
are batched together. Phaser texture aliases retain each existing asset key and local frame
dimensions while sharing the atlas's GPU source. The atlas owns that source; aliases release
only their frames when destroyed. GPU batch settings stay unchanged. Animated effects recycle
on native animation completion rather than a wall-clock deadline, ensuring the last frame plays.

Browser review routes (append to the game's base URL):

- `?scene=gallery&combat=1`: moving projectiles and native impact animations.
- `?scene=gallery&terrain=1`: all nine materials.
- `?scene=gallery&vehicles=1`: live/echo/enemy/wreck, independently turning hulls and turrets.
- `?scene=gallery&infantry=1`, `?scene=gallery&explosions=1`: existing review routes.

Campaign decisions keep D116–D146. The independently authored art decisions are now A116–A127,
and the resolved art questions AQ59/AQ60, so merging the branches does not erase either set.

## Verification

703 tests pass, including pixel-exact atlas/frame checks, projectile margins, impact growth/fade
and stop-event routing. ESLint/Prettier, purity lint and the production build pass. The miniature
checker reports all 49 delivered, zero errors and seven documented warnings. A production build
under the PR's Pages-style subpath was checked in desktop and mobile Chrome with no runtime or
resource errors. Native impact frames 1–6 were observed. Vehicle views at 0/90/180/270 and the
combat/terrain/infantry galleries were inspected. Synthetic 100/400-unit renderer fixtures keep
stable pools; the 25/100-life headless smoke benchmark runs with flying bullets. Software-rendered
frame rates are not a hardware performance promise.

Review screenshots: [combat](review/combat.png), [terrain](review/terrain.png),
[vehicles](review/vehicles.png). The live galleries are better for judging motion and scale.

## Remaining battlefield art

The miniature checklist is complete; the entire game's placeholder manifest is not. The next
coherent art batch is battlefield objects and cover:

- Sandbags, crates, fences, half-walls, windows and bunker windows currently use procedural art.
- Static turrets and wrecks, mines/armed mines/scorch marks, HQ/objective intact and destroyed.
- Gates, levers, bridge state/debris art and capture/spawn markers/flags.
- Muzzle flash and legacy non-miniature overlays remain placeholder images; several soldier
  fallback images and ground placeholders are retained for compatibility even though new art
  handles normal gameplay.

Audio remains placeholder and is outside this image pass. Decorative UI panels, campaign-map
illustration and title artwork are separate future taste decisions; this pass updates the shared
role and enemy-counter icon content without changing those flows.
