# Style bible

## The concept in one sentence

**Painted collectible wargame miniatures on cast metal display bases, photographed from directly above
on a model war-room table.** Think hobby-shop resin or pewter figures, hand-painted, mounted on gold or
silver presentation plinths. Charming and tactile, but readable first.

The table itself (felt, map, buildings) is a separate, later art track; do not draw it here. These
images are only the *pieces*.

## Era and tone

Loosely **World War II**: steel helmets, bolt/semi-auto rifles, light machine guns, bazookas, trucks,
tanks. It is a model of a war, not a depiction of one: chunky, toy-like and good-natured. No explicit gore or faces needing expression. Restrained blood marks on unarmed fallen figures
are allowed by the updated owner direction ([D125]).

- Keep everything **generic**. No real national insignia, flags, crosses, runes, unit patches or any
  hate symbols. Factions are told apart by *paint scheme and helmet silhouette only*.
- No text, numbers, letters or logos anywhere (not on bases, helmets, vehicles).

## Two materials: metal base, painted figure

### The base (a cast metal plinth)

A chunky display base seen from above:

1. A thin darker **edge band** (3–4 px) at the extreme outline: the base's side wall catching the
   edge, so it reads as a thick object.
2. A **raised rim**, 9–10 px wide (12 px for vehicles), with a bevel: a lighter inner lip and outer lip
   running *evenly all the way round*.
3. An **inset face** in a **satin (less shiny) shade of the same metal**, with a very faint
   concentric engraved line near the rim. The face is the same color family as the rim, so the whole base
   reads as *one color* at a glance (this is what the player identifies at 32 px).
4. **No** text, emblem, star, number or pattern that would imply an orientation.

Shape language by class (all are drawn in all four finishes; see PIECE-SPEC.md for sizes):

- **round**: smooth circle. Light infantry.
- **octagon**: flat sides on the axes, chunkier bevel and thicker rim. Looks *heavy and armored*.
- **square**: rounded square, blocky and stable. Heavy-weapon crews.
- **truck**: long rounded rectangle plinth.
- **tank**: biggest base, rectangle with chamfered corners.

### The four finishes

Same sculpt and silhouette, only the surface changes. The set of four must be **pixel-identical in
outline** (`npm run check:art` verifies it); produce the other three from the polished gold one.

| Finish | Meaning | Look | Guide colors |
|---|---|---|---|
| `gold` | **Live soldier**, the player | Mirror-bright polished gold: high contrast, glossy, the shiniest thing on screen | highlight `#FFF1B0`, light `#F7CB45`, mid `#D9A21B`, shade `#8F5F0E`, deep `#5A3A08` |
| `gold-tarnished` | **Echoes**, past lives | The same gold, long neglected: dull, matte, darker, desaturated brown-gold, faint greenish patina only in the recesses | highlight `#C9B27A`, mid `#8C7440`, shade `#5A4A2A`, deep `#342A18`, patina `#5F6B4A` |
| `silver` | **Enemy** | Bright cool polished silver / chrome, clean | highlight `#FFFFFF`, light `#E4E8EE`, mid `#B6BEC8`, shade `#6E7886`, deep `#3A424C` |
| `silver-tarnished` | *Reserved* (multiplayer) | Dull, blackened, aged silver; not used yet | light `#9097A0`, mid `#707780`, shade `#454B53`, deep `#23272C`, blackened `#1B1E22` |

**The critical pair is `gold` vs `gold-tarnished`.** At 32 px, in a crowd, the player must find the one
shiny gold piece among dozens of dull ones. Make the gap big: brightness, saturation *and* gloss all
differ. The checker warns if the two are too alike.

### The figure (a painted miniature)

- Painted **plastic/resin look**: satin paint, crisp edges, slightly darker paint in recesses ("wash"),
  lighter paint on raised ridges ("edge highlight"). A few tiny paint chips are fine; keep them tiny.
- **One sculpt per role, two paint schemes** (ally and enemy), and the enemy must be the *same drawing
  repainted* (the checker compares silhouettes).
- **Ally paint** (generic Allied-ish): olive drab uniform `#5C6B3A`, khaki webbing `#A59A6B`, olive
  helmet `#4F5A33`, leather `#5A3E26`, gunmetal weapon `#3B3F44`, wood `#6B4A2B`, skin `#C89A74`.
- **Enemy paint** (generic Axis-ish, no insignia): field-grey uniform `#6B7480`, darker slate
  `#4A525C`, dark helmet with a clearly *different silhouette* from the ally's (e.g. ally = round shallow
  dome with rim; enemy = deeper, flared-neck shell), dark webbing `#3F3A33`, black-brown leather `#2B2118`.
- **Outline**: every figure has a **near-black warm outline `#14110E`, at least 4 px** wide at canvas
  size (it becomes ~1.3 px in game). This is what keeps tiny figures readable against the gold/silver
  base. The base itself has no black outline (its edge band is enough).
- **Value contrast**: figures should be mid-dark against the bright base. Never paint a figure in
  yellow-gold or light grey (it would vanish into the base).

### Proportions (this is a *collectible*, not a scale model)

Exaggerate for readability, like chunky hobby miniatures:

- **Big head/helmet**, thick shoulders, chunky oversized weapon.
- Weapons are the role's signature silhouette and should be bold and clean: long, simple, obvious.
- Hands and arms simplified into thick mitten-like shapes. No individual fingers.

## Lighting: the rule that makes rotation work

**Imagine a light tent directly overhead: soft, shadowless, even.**

Allowed:
- Highlights that are *rotationally even*: a ring around a rim, a glint on the crown (center) of a
  helmet dome.
- Darker paint in recesses and where parts meet (ambient occlusion).
- A subtle radial falloff (brighter toward the center of the base, darker at the edge).

Forbidden:
- A directional gradient across the whole image (one side brighter).
- A specular "sun glint" in one spot on the rim.
- Cast shadows (under the weapon, under the figure, under the base). The renderer draws one soft
  shadow blob *under* the base as a separate layer.
- Reflections of an environment (windows, horizons).

Test: rotate the picture 90° and 180° in your head. If it would look "wrong", the light is baked in.
(`npm run check:art` measures this as *lighting bias* and fails images over 0.12.)

## Per-pixel hygiene

- **Transparent background**, 8-bit RGBA PNG. No white or colored halo around the edge, no checkerboard
  baked in, no drop shadow, no glow.
- Crisp anti-aliased edges (1 px soft). Few semi-transparent pixels except on edges (a mass of soft
  pixels usually means a baked shadow or glow).
- Exact canvas sizes from PIECE-SPEC.md. Content centered on the pivot with transparent margin.
- No text, no watermarks, no signatures, no UI, no grid lines, no reference marks.

## Forbidden list (quick scan)

Front/side/3-4 views · perspective · cast shadows · directional light · glow · text/numbers ·
real-world insignia or flags · faces looking at the camera · explicit gore · 3D renders that look
photographic with depth of field · different styles between files · busy fine detail that disappears
at 32 px.

## Updated pilot direction ([D124]–[D125])

Bases are foot-sized supports, at 0.55× the original display scale, with figures at 1.6×: bodies overhang and mostly cover
the metal. No oversized live-marker ring on miniature units. Snipers have a broad shaggy
ghillie silhouette; Shield units have beefier padded armor. On death the base vanishes and an
unarmed sprawled body falls beside its former position along the lethal hit direction.
