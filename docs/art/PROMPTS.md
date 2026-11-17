# Prompts and pipeline

Copy-paste material for generating the art. Adapt wording to whatever image tool you have, but keep
the **rules** intact. Read [README.md](README.md) and [STYLE-BIBLE.md](STYLE-BIBLE.md) first.

## Pipeline that works for this set

1. **Generate large, deliver small.** Ask for **1024×1024** (or the tool's largest square) with the
   subject centered, then **downscale to the exact canvas size** with a high-quality resampler
   (Lanczos) after cutting out the background. A 128 px canvas is 8× smaller than 1024, so the piece
   must be bold enough to survive that.
   - Subject scale: a round base's 100 px footprint is 78% of a 128 px canvas. Ask for the base to fill
     **about 78%** of the image width, centered, with an even margin all round.
   - Non-square canvases (truck, tank): generate on a square canvas with the piece centered and crop or
     pad to the exact size afterwards, keeping the center on the pivot.
2. **Transparency.** If the tool outputs real alpha, use it. If not, generate on a flat, pure
   `#FF00FF` magenta background (nothing in the set uses it), key it out with a script, and de-spill the
   edge so there's no pink fringe. Never leave a baked checkerboard, white halo or soft shadow.
3. **Lock the look first, derive everything else.**
   - Make `base_round_gold.png` and `figure_rifleman_ally.png` until they pass the checker and look
     right on a rotation sheet. Attach them as style references for all later images.
   - **Bases:** the other three finishes must have an *identical silhouette*. Derive them from the gold
     base by recoloring/editing (a hue/lightness remap script, plus an image-edit pass for tarnish
     texture), never by re-generating from scratch. Other shapes (octagon, square, truck, tank) get one
     fresh gold master each, then the same derivation.
   - **Figures:** draw `ally` first, then make `enemy` by **repainting the same image** (edit the
     uniform/helmet colors; helmet shape change allowed), never a fresh drawing.
4. **Shadows are scripted**, not generated (PIECE-SPEC.md §5).
5. **Check, then look.** `npm run check:art -- --sheets` after every batch, and open the sheets.

## The preamble (paste this at the top of EVERY image request)

```
Collectible hand-painted wargame miniature, photographed from DIRECTLY ABOVE.
STRICT TOP-DOWN ORTHOGRAPHIC VIEW: a camera looking straight down. We see the TOP of the
helmet, the shoulders as a wide oval, the weapon pointing along the ground, and the flat top
face of a metal display base. NOT front view, NOT side view, NOT 3/4 view, NOT isometric,
NO perspective. We must never see a face, chest, boots or the front of a vehicle.

The image will be ROTATED to arbitrary angles in a game, so: NO directional lighting, NO cast
shadows, NO drop shadow, NO glow. Lit like a light tent directly overhead: soft, even,
shadowless. Highlights only radially even (a ring around a rim, a glint on the very center of
a helmet dome), never from one side.

Forward / front points to the RIGHT of the image. The body or hub is exactly centered in the
image (the rotation pivot). Plain transparent background (or flat #FF00FF magenta if
transparency is unavailable). No text, numbers, logos, watermarks, flags or real-world
insignia. Chunky exaggerated collectible-miniature proportions (big helmet, thick shoulders,
oversized bold weapon). Thick near-black outline (#14110E) on figures. Satin paint, subtle
wash in recesses, slight edge highlights. Must read clearly when shrunk to 32 px.
```

## Bases

Replace `{SHAPE}` and `{FINISH}` using the tables in [PIECE-SPEC.md](PIECE-SPEC.md) and
[STYLE-BIBLE.md](STYLE-BIBLE.md).

```
{PREAMBLE}
A cast-metal display base for a miniature, with NO figure on it, seen from straight above.
Shape: {SHAPE DESCRIPTION}. A thin darker edge band at the outline, a raised beveled rim, and an
inset satin face of the same metal with one very faint engraved concentric line near the rim.
The shading is RADIALLY SYMMETRIC (brighter toward the center, darker at the edge, evenly lit
all round): absolutely no light coming from one side, no single sun glint, no shadow.
Finish: {FINISH DESCRIPTION + guide colors}.
No text, emblem, star or pattern that implies a direction.
```

`{FINISH DESCRIPTION}` snippets:

- **gold**: "mirror-polished bright gold, glossy, high contrast, the shiniest object in the scene".
- **gold-tarnished**: "the same gold, but badly tarnished: dull, matte, darker, desaturated brown-gold,
  a faint greenish-brown patina in the engraved line and the bevel recesses; clearly aged and low
  gloss. It must look very different from the polished gold at a glance".
- **silver**: "bright cool polished silver / chrome, clean and crisp".
- **silver-tarnished**: "dull, blackened, aged silver, matte, dark grey with near-black in the recesses".

## Figures

```
{PREAMBLE}
A single painted infantry miniature, NO base (the base is a separate layer), seen from straight
above, facing RIGHT. Role: {ROLE BRIEF from PIECE-SPEC.md}.
Body (helmet crown + shoulders) centered on the exact middle of the image; the weapon points to
the right. Body fits inside a circle about 60/128 of the image width; the weapon reaches about
{x} of the way to the right edge. Paint scheme: {ALLY or ENEMY PAINT from STYLE-BIBLE.md}.
We see: the top of the helmet (round), both shoulders as a wide oval, the backpack behind
the neck, both arms reaching forward to the weapon. We do NOT see a face.
```

Enemy repaint (use the ally image as the input to an *edit*, not a new generation):

```
Edit this exact miniature: keep the pose, outline, weapon and every shape identical. Only repaint it in
the enemy scheme: field-grey uniform #6B7480, dark slate #4A525C, dark webbing #3F3A33, and replace
the helmet shape with a deeper flared-neck shell in #3E444D. Keep the thick near-black outline,
the top-down view, the lack of shadows and the transparent background.
```

## Fallen figure

```
{PREAMBLE}
The same kind of miniature as the attached rifleman, now KNOCKED OVER: lying flat on its side/back
across the middle of the image, seen from straight above. Helmet visible, no weapon, sprawled
limbs and restrained blood stains. Head toward the right, feet toward the left, body centered. Darker, lower contrast and slightly desaturated so it reads as
background. Paint scheme: {ALLY|ENEMY}.
```

## Vehicles

```
{PREAMBLE}
A {truck|tank} HULL, no turret, seen from straight above: {HULL BRIEF from PIECE-SPEC.md §4}.
Front toward the RIGHT. Centered on the middle of the image. {ALLY|ENEMY} paint.
```

```
{PREAMBLE}
A {machine-gun ring mount|tank turret} for a miniature vehicle, seen from straight above, barrel
pointing RIGHT from the exact center. Hub centered. {ALLY|ENEMY} paint.
```

```
{PREAMBLE}
The burnt-out blown-open wreck of the attached {truck|tank} hull, seen from straight above,
front toward the right, centered. Charred black, scorch marks, no turret, no fire or smoke
(flat and still), neutral paint.
```

## When an image comes back wrong

| Symptom | Add to the prompt / fix |
|---|---|
| A soldier standing, face visible, head toward the top | "Camera is DIRECTLY OVERHEAD pointing down. We see only the top of the helmet and shoulders. No face. Head is at the CENTER of the image, not the top." |
| 3/4 or isometric base (side wall visible) | "Flat plate seen from straight above. Only the top face and rim. No side wall, no perspective." |
| Shadow under the figure / glow | "No shadow of any kind. Transparent background right up to the edge of the object." |
| One side of the base brighter | "Lighting is evenly radial around the center. Rotate the image 90°: it must look identical." Check with `npm run check:art` (lighting bias). |
| Figure not centered / body offset | Re-center in a script. The body (not the weapon) must be on the center. |
| Pointing up or left instead of right | Rotate it in a script; do not regenerate. |
| Pale yellow figure vanishing into the gold base | Repaint darker; figures are mid-dark. |
| Finishes of one base have different shapes | Derive from the gold master by recoloring (never regenerate). |
| Echo gold too close to live gold | Darker, less saturated, matte, with patina; the checker prints the RGB distance (want ≥ 45). |
| Pink fringe after keying magenta | De-spill edges; erode the matte 1 px. |
