# Art notes

## 2026-11-18 — combat, environment, interface and tier-3 vehicles

Continued PR #22 on top of the merged campaign/projectile work. Delivered five projectile
textures, a four-variation six-frame bullet-impact sheet, nine repeating terrain textures and
all 20 vehicle layers. All 49 miniature files pass required checks with zero errors. Seven
warnings: the four earlier gunner/fallen edge warnings, the existing rifleman faction contour
warning, and antialiased truck-turret edges in both factions. No threshold was relaxed.

Vehicle turrets share the hull's `fitPx` even when their canvases are smaller; the manifest test
now checks that relationship instead of incorrectly requiring the footprint to fit the turret
canvas. Native projectile/impact pools preserve existing motion, fuse cues, hit timing and the
range-end puff fix. Interface icons remain native SVGs, with exported inspectable copies.

See [COMBAT-ENVIRONMENT.md](COMBAT-ENVIRONMENT.md) for the exact file inventory, saved prompts,
preparation commands, gallery URLs and remaining battlefield-prop work. The branch merge also
disambiguates art decision numbers (A116–A127) from the campaign's D116–D146. Normalized local
checkout line endings for verification and excluded generated review sheets from the production
asset glob. A lossless shared miniature atlas fixes rotating-layer clipping exposed by software
WebGL with many individual textures, without changing GPU batch settings. Native animation
completion retires effects, allowing all six impact frames to display.

Running log for whoever draws the miniatures (Codex, a human, or both). Newest first. Record what you
changed from the brief and why, warnings from `npm run check:art` you chose not to fix (with the
reason), questions for the owner, and anything the integration phase
([todos/PHASE16-miniatures.md](../../todos/PHASE16-miniatures.md)) must know (e.g. a figure that
needed a different `fitPx`).

## 2026-11-18 — faster explosion playback

Owner requested quicker bursts. Small explosions now play at 30 fps (~267 ms), large at
24 fps (~333 ms), retaining all eight frames and all three variations. Pooled-effect lifetimes
are derived from those rates. No sheet or simulation changes.

## 2026-11-17 — animated overhead explosion sheets ([A127])

Delivered `assets/effects/explosion_small.png` (1024×384, 128 px frames) and
`explosion_large.png` (2048×768, 256 px frames). Each has three variation rows and eight frame
columns. Fixed overhead pivots; radial fire/debris/smoke, no vertical plume or terrain. The
small sequence runs at 20 fps; large at 14 fps. Fixed-grid preparation isolates each cell's
alpha and tapers the smoke tail, with transparent borders for filtering.

Registered native sprite sheets/row animations in Phaser. Explosion events choose a stable
variation and play once on pooled Sprites, which stop/reset before reuse. Grenades/cover use
small; mines/rockets and destroyed hazards/objectives use large. Character art stays static.
The looping review page (`?scene=gallery&explosions=1`) uses actual event cues and the gameplay
pool; checked ignition, changing fire/smoke frames and repeated pooled playback in Chrome.
Details and frame layout are in EXPLOSIONS.md. Validation: all 646 tests pass
with the cloud worker/timeout flags, plus lint, purity lint and production build. PNG tests
cover all 48 frames, including borders and fade behavior. Reviewed an exported animated GIF
and the running gameplay-pool gallery at multiple animation phases.


## 2026-11-17 — tier 2 infantry and a slightly larger base

Owner approved proceeding with the other soldiers ([A126]). Delivered all 12 tier-2 files:
four square-base finishes plus ally/enemy Grenadier, Gunner, Shotgunner and Bazooka. Base
scale increased from 0.55 to 0.70; figure scale remains 1.6.

Grenadier has a cocked throwing arm/large grenade; Gunner is a two-person crew feeding a
belt into a bipod-mounted gun; Shotgunner has broad rectangular armor and a fat short weapon;
Bazooka has a tube projecting front/back. Crew-served appearance remains one unit with the
existing health/behavior. The crew pivot is the gun receiver, with both figures behind it.
Faction repaints share exact alpha masks. All 29 infantry files pass tier-2 required checks.
The crew's soft-pixel warnings arise from the long perimeter of two figures, the belt and
thin bipod legs, not a shadow. Existing fallen-art/rifleman warnings remain documented in earlier entries.

All seven infantry roles now use miniature layers during play and replay. Deployment previews
read the selected/recorded role so the new classes do not run in as generic Riflemen.
`?scene=gallery&infantry=1` compares every role as live, echo, enemy and fallen through the real
renderer. Infantry art is complete; tier-3 vehicle art has not started.

## 2026-11-17 — owner feedback: feet-sized bases, silhouettes and directional deaths

Implemented A124/A125. Infantry base rendering is 55% of the old diameter; figures keep their
art normalization; the renderer draws figures at 1.6× the original miniature scale so body
size is legible without the old oversized disc. Hitboxes are unchanged. Removed the oversized
live-marker ring on miniature units. Sniper now has a broad shaggy
ghillie cloak, Shield has heavier armor/shoulders, and both factions share the same alpha mask
per sculpt. New generic fallen figures have no weapon, head toward +x, sprawled limbs and
restrained blood stains. Fallen art is also used for infantry whose standing pilot art is
not delivered yet; vehicle wreck handling is unchanged.

Bases disappear on infantry death. A presentation-only deathDirection in soldier state/view
points away from the lethal hit's origin/blast center, survives snapshots, and does not alter
collision or damage rules. Renderer offsets the corpse 1.25 sprite radii along it; directionless
deaths fall along last facing. Added north/east/west death examples to the gallery and tests
for lethal-source selection, snapshot/view propagation and displaced corpse pose.

Updated rotation/swarm sheets to use the same base ratio as the game. Checker warnings about
soft pixels on fallen art come from antialiased limbs and small blood spatters (visually
reviewed; no baked shadow/glow). The pre-existing rifleman faction contour warning remains.

## 2026-11-17 — correct the undersized sniper

The first normalization shrank the entire sniper to accommodate its long rifle, leaving its
helmet and shoulders too small next to the rifleman. Redrew both sniper factions with a larger
body, broader helmet netting and a prominent scope. Recentered on the helmet pivot and kept the
existing 128×128 canvas, 100 px fit, base and renderer scale. The enemy repaint shares the ally
alpha mask, avoiding a silhouette jump. Transparent margins still pass the art checker.

Inspected rotation and both swarm sheets at game size. The sniper now has a comparable body
presence to the other infantry; its long scoped rifle and netted helmet distinguish it from
the plain rifleman and wide shield. Art remains strictly overhead. The two existing rifleman/
fallen faction-contour warnings are unchanged.

## 2026-11-17 — pilot enabled in game at the owner's request

The 17 pilot files are now registered and used by the main renderer for Rifleman/Sniper/Shield,
including enemies, echoes, static remnants and fallen figures. Other roles and vehicles keep
their placeholders. This is an in-context preview, not approval of the full art set.
See PHASE16 implementation notes for integration scope.

## 2026-11-17 — tier 1 pilot for owner review

Delivered all 17 pilot PNGs. These are candidates for the style checkpoint, not owner-approved
final art. No renderer or manifest changes; PHASE16 still owns integration. AQ59/AQ60 are now
resolved in DECISIONS.md (A122/A123). The owner reiterated strict overhead projection.

- Generated painted-miniature masters, extracted layers, normalized canvas/pivots and downsampled.
  Standing figures show helmet crowns, shoulders and weapons, without faces, chests or boots.
  Replaced the initial bases because their heavier lower edge suggested a visible sidewall.
- Bases use exact circular/octagonal footprints, 100/96 px, with identical alpha across all
  finishes. Silver and tarnished finishes are color remaps of the polished gold master.
- Figures use a body/helmet pivot, not their weapon-inclusive bounding-box center.
- Shadow is generated by `node --import tsx tools/miniatures-shadows.ts` (pngjs), not painted.
- Validation: `node --import tsx tools/check-miniatures.ts --priority 1 --require --sheets`: all
  17 delivered, zero errors. Direct Node invocation avoids tsx CLI IPC restrictions in the sandbox.
- Two accepted-for-review warnings: enemy rifleman silhouette IoU 0.948 and fallen silhouette
  IoU 0.924 against their allies (threshold 0.95). Generated faction variants have slight contour
  drift; these need refinement if the owner accepts the overall look. Thresholds unchanged.
- Opened rotation.png and both swarm sheets. Live gold is immediately visible against dull
  brown-gold echoes; silver is distinct. Figures rotate around their bodies. Rifleman, netted
  sniper and shield silhouettes differ. The sniper reads smaller than the rifleman; review its
  body proportions before expanding the set. The shield also needs owner scrutiny for the
  strict overhead requirement: no perspective should be accepted merely because checks pass.

Verification of this delivery: lint, purity lint and production build passed. Full suite with
`node node_modules/vitest/vitest.mjs run --pool=threads --maxWorkers=2` passed 630/631 tests;
world generation's deterministic-seed test exceeded its default 5-second timeout. Reran
`src/gen/__tests__/world.test.ts` with `--pool=threads --maxWorkers=1 --testTimeout=30000`: all
22 tests passed. No test configuration or gameplay code was changed.

Review sheets are intentionally git-ignored; regenerate with the command above. Stop here for
the owner checkpoint in README.md. Tier 2 and tier 3 have not started.
