# Art brief: collectible miniatures (start here)

You are drawing the pieces for **Army of One**, a top-down 2D browser shooter. Every soldier and
vehicle is a **collectible wargame miniature standing on a gold or silver display base**, seen from
directly above, as if the whole battle were a model war-room table. Pieces slide around, they do not
walk, so there is **no animation art**: one still image per layer.

Product-owner rulings behind this are [A116]–[A126] in `docs/DECISIONS.md`. Where this folder and
DECISIONS.md disagree, DECISIONS.md wins. Ask before inventing anything not written here.

---

## ⚠️ THE HARD RULES (read twice)

### 1. STRICTLY TOP-DOWN. No exceptions.

Every image is what a camera sees **looking straight down** at the piece (a true orthographic
overhead view, like a drone photo or a map). You see the **top of the helmet**, the **shoulders as
a wide oval**, the **weapon pointing away along the ground**, and the **flat top face of the base**.

- NOT a front view. NOT a side view. NOT 3/4 or "isometric". NOT a "hero pose" of a standing soldier
  drawn from the front with the head at the top of the image. This is the single most common mistake:
  **if you can see a soldier's face, chest, boots or the front of a vehicle, the image is wrong.**
- No perspective: parallel lines stay parallel, circles stay circles, nothing converges.
- The base is a flat plate seen from above: you see its **top face and rim only**, never its side wall
  (a thin 3–4 px bevel line at the very edge is fine; it is the rim catching light).

### 2. IT MUST WORK AT EVERY ROTATION.

The game rotates these images freely: the figure **turns to aim at any angle**, vehicles turn to
any heading, and the camera itself can rotate the whole world. So:

- **No light direction.** Do not paint highlights "from the top-left", and **never bake in a cast
  shadow**. Light everything as if from straight above in a light tent: soft, even, radially
  symmetric. A highlight may sit on the *center* of a dome (a helmet crown) or run *evenly around* a
  rim, never on one side.
- **No shadow layer inside the figure or base files.** Shadows are a separate generated layer.
- **The pivot is the exact center of the canvas.** The figure's body must sit on that center so it
  spins in place and never "orbits".
- **Forward is +x (to the right).** The weapon / front points right. The game rotates from there.
- Nothing may touch the outer 2 px of the canvas; leave transparent margin.

You can verify both rules mechanically: `npm run check:art` and `npm run check:art -- --sheets` (see
[VERIFY.md](VERIFY.md)). It fails images with directional lighting, off-center bodies, wrong sizes,
etc., and renders **rotation sheets** and **swarm sheets** you must look at before reporting done.

---

## Updated owner direction ([A124]–[A125])

Bases now support the feet and are mostly hidden by overhanging bodies. The renderer scales
infantry bases to 0.70× and figures to 1.6× the original display scale. Bases vanish on death;
unarmed, sprawled bodies fall beside the old position, away from the lethal hit. Restrained
blood stains are allowed. Snipers wear shaggy ghillie suits; Shield units are visibly beefier.
These rulings supersede earlier large-display-base, dead-on-base and no-blood descriptions.

## What the player needs from the art

Ranked, because the art style serves this:

1. **Find your own soldier in a swarm of echoes.** The live soldier is polished **gold**; echoes
   (your past lives) are the same gold but **tarnished**, dull and aged; enemies are **silver**.
   Finish on the BASE is the primary signal and must read at **32 px**.
2. **Tell unit types apart at a glance.** Figure sculpt + weapon silhouette says the role; the
   **base shape** (round / octagon / square / long plinths) says the broad class.
3. Everything else (charm, texture, painted detail) is gravy. Do not trade 1 and 2 for it.

Soldiers are drawn at about **32 px** across in the game, vehicles about 52–64 px. Design bold, chunky
shapes, thick dark outlines and strong value contrast. Fine detail will be invisible.

## Documents

| File | What's in it |
|---|---|
| [STYLE-BIBLE.md](STYLE-BIBLE.md) | The look: materials, palettes, lighting, outline, proportions, forbidden things |
| [PIECE-SPEC.md](PIECE-SPEC.md) | Layers, canvas sizes, pivots, base shapes, per-role figure briefs, vehicles, **the full file list** |
| [PROMPTS.md](PROMPTS.md) | Copy-paste prompt preamble, per-asset prompts, recolor/fix-it prompts, pipeline tips |
| [VERIFY.md](VERIFY.md) | The checker, the review sheets, and the acceptance checklist |
| `src/content/miniatures.ts` | The same spec as data (sizes, file names, role→base). The checker reads it. |

## Where files go

`assets/miniatures/<file>.png`, named exactly as listed in PIECE-SPEC.md / produced by
`miniatureFiles()` in `src/content/miniatures.ts`. Generated review sheets land in
`assets/miniatures/_review/` (git-ignored; do not commit them).

**Do not** edit `src/`, `assets/placeholder/`, or the asset manifest (`src/content/assets.ts`). Hooking
the art into the game is a separate phase ([todos/PHASE16-miniatures.md](../../todos/PHASE16-miniatures.md)).
The only code files you may touch are the art tools (`tools/miniatures-*.ts`, `tools/check-miniatures.ts`)
if the checker has a bug, and you must say so.

## Workflow (do it in this order; stop at the checkpoint)

1. **Read** STYLE-BIBLE.md and PIECE-SPEC.md fully.
2. **Lock the look** with the two "hero" pieces: `base_round_gold.png` and `figure_rifleman_ally.png`.
   Iterate until they pass `npm run check:art` and look right on a rotation sheet. Everything else is
   generated from these (attach them as the style reference for every later image).
3. **Pilot (tier 1)**: the rest of the round + octagon bases (all four finishes each), the
   rifleman / shield / sniper figures (ally and enemy), the fallen figures, and `shadow_infantry.png`.
   Run `npm run check:art -- --priority 1 --sheets`, fix errors, then **look at every sheet**.
4. ⛔ **CHECKPOINT: stop and show the owner the pilot** (the rotation sheet and both swarm sheets). Do
   not start tier 2 until the owner has said the style is right. Re-drawing 40 images is expensive.
   Owner approved proceeding to tier 2 in the 2026-11-17 feedback session ([A126]).
5. **Tier 2**: the square base, and the grenadier / gunner / shotgun / bazooka figures.
6. **Tier 3**: vehicles (truck, tank: base, hull, turret, wreck) and the vehicle shadows.
7. Tick off files in the checklist at the bottom of PIECE-SPEC.md and add notes in
   `docs/art/NOTES.md` (what you changed or couldn't do).

## When something in the brief is wrong or missing

Do not guess about *gameplay* meaning. Write the question under "Open questions" in
`docs/DECISIONS.md` as a `[Q#]` entry, carry on with the smallest sensible choice, and say so in your
report. Art taste calls (exact paint colors, which pose) are yours to make inside the style bible.

## Explosion effects

Animated VFX have a separate sheet spec: [EXPLOSIONS.md](EXPLOSIONS.md). Review them in game
with `?scene=gallery&explosions=1`. Character art remains static ([A127]).

## Combat, terrain, UI and vehicle continuation

All 49 miniature files are now delivered and integrated. See
[COMBAT-ENVIRONMENT.md](COMBAT-ENVIRONMENT.md) for bullet-impact animations, projectiles,
terrain textures, UI icons, review routes, reproduction prompts and the remaining prop backlog.
This owner-authorized continuation includes the renderer/manifest integration described as a
separate phase above. Campaign decision numbers retain their D prefix; art decisions use A.

Terrain painting now uses [automatic textured transitions](TERRAIN-TRANSITIONS.md) in both the
editor and game ([A128]); base surfaces are combined with reusable edge/corner masks.

Cover, material debris and fixed turrets are now painted and integrated too:
[battlefield prop inventory, prompts, reproduction and review](BATTLEFIELD-PROPS.md).
