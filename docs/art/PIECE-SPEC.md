# Piece spec: layers, sizes, roles, files

All sizes are in **art pixels**. The game draws about **3.1 art px per world unit** everywhere, so
figure art uses that normalization. For readability the renderer draws infantry figures at
1.6× and their foot bases at 0.70× the original scale ([A124]). Soldiers appear about 32 px across on a normal screen
(their 100 px base is scaled down about 3×), so everything below is designed to survive heavy
downscaling.

Machine-readable twin of this document: `src/content/miniatures.ts` (`BASES`, `BASE_SHAPE_BY_ROLE`,
`miniatureFiles()`). If a number here and a number there disagree, the code is what the checker uses:
report the mismatch.

## 1. The layer stack

Drawn bottom to top, all centered on the same point (the piece's position):

```
 5  effects        muzzle flash, hit flash, etc. (not your job here)
 4  turret / gun   vehicles only: spins on its own, independent of the hull
 3  figure / hull  the painted miniature: TURNS TO AIM (infantry) / TURNS TO HEADING (vehicles)
 2  base           the metal plinth: slides along, does NOT turn with the aim (infantry)
 1  shadow         soft blob, never rotates, always offset the same way on screen
```

- **Infantry:** the base does not rotate with aim (a circle needs none; an octagon/square would look
  silly spinning). Only the *figure* spins on top of it, around the exact center of the base. The whole
  assembly also rotates if the camera rotates, which is why the base must look right at any angle.
- **Vehicles:** the long base and the hull turn together with the heading (a long plinth has to point
  where the vehicle points). The **turret** is a separate image that spins about its own center,
  independently, to aim.
- Each layer is a **separate PNG**. Never composite layers together into one image, and never paint
  the base into a figure image (or the reverse).

### Canvas and pivot rules (apply to every file)

- The **canvas center is the pivot**: for a 128×128 canvas, between pixels 63 and 64 on both axes.
- **+x is forward.** Weapons, the front of a hull, a turret's barrel: all point to the right.
- The thing that must stay on the pivot while spinning: the *body* of a figure (its helmet / torso),
  the *middle* of a hull, the *hub* of a turret. Weapons stick out; bodies do not wander.
- A transparent margin of at least 2 px on every side (more where the table says).
- `fitPx` is what the renderer maps onto the soldier's logical size; it is listed per base below and
  is shared by that unit's base and figure, so *keep art normalization unchanged; the renderer deliberately scales infantry bases to 0.70× and figures to 1.6× ([A124])*.

## 2. Bases

All four finishes of a shape have the **identical outline, pixel for pixel**; only the surface changes.

| Shape | Canvas | Metal part | fitPx | Used for |
|---|---|---|---|---|
| `round` | 128×128 | circle, 100 px diameter | 100 | rifleman, grenadier, sniper (light infantry) |
| `octagon` | 128×128 | regular octagon, flat sides facing up/down/left/right, 96 px across flats | 100 | shield, shotgun (armored infantry) |
| `square` | 128×128 | rounded square, 82 px per side, 20 px corner radius | 100 | gunner, bazooka (heavy weapons) |
| `truck` | 192×128 | rounded rectangle 160×96, 20 px corner radius, long axis = x | 160 | gun truck |
| `tank` | 256×192 | rectangle 200×152 with 28 px chamfered corners, long axis = x | 200 | tank |

Which role stands on which base is **confirmed** ([A122] in DECISIONS.md): it lives in
`BASE_SHAPE_BY_ROLE` in `src/content/miniatures.ts`, and because every infantry shape is drawn in
every finish, changing a role's shape later needs no new art.

The shape language is meant to be *felt*: the armored octagon should look chunkier and heavier than
the round one (thicker rim, stronger bevel), the square blockier and more planted.

Base surface and finish details are in [STYLE-BIBLE.md](STYLE-BIBLE.md). In game:

| Soldier state | Base finish used |
|---|---|
| Live (player) | `gold` |
| Echo (a past life) | `gold-tarnished` (the figure is drawn semi-transparent by the engine) |
| Static remnant (recording ran out) | `gold-tarnished` plus a flicker/scanline overlay (engine) |
| Enemy | `silver` |
| Dead | no base; unarmed fallen figure displaced along the lethal hit direction ([A125]) |
| *(reserved)* other players | `silver-tarnished` |

## 3. Infantry figures

Canvas **128×128**, pivot at the center, facing **+x**. One sculpt per role, drawn **twice**: `ally` and
`enemy` paint. The enemy is the same drawing repainted (same silhouette, same pose); it differs by
paint scheme and by helmet *shape* only.

### Layout guide (rifleman, seen from above, +x to the right)

```
                 y = -27 ─ shoulder edge
        pack      ╭───────────╮
      ╭──────╮   ╱  shoulders  ╲        rifle held in both hands
  ◄───┤ x≈-30├──┤   (helmet    ├──────═════════════════════►  muzzle, x ≈ +55
      ╰──────╯   ╲  r≈14 here)  ╱           +x = forward
                  ╰───────────╯
                 y = +27
     pivot = the helmet's center = the center of the canvas
```


- Helmet: a circle about **26–30 px** diameter centered on (or within 4 px of) the pivot.
- Shoulders: an oval about **54 px** across (y) by **34 px** deep (x).
- Weapons extend toward +x up to about **x = +58** (the sniper may reach **+62**; nothing past **+62**,
  the canvas edge is +64 and needs a 2 px margin).
- The whole figure body should sit within a circle about **60 px** in diameter around the pivot, so
  a good part of the base's rim and face still shows around it (that is how the player reads the base
  finish!). Only weapons, the shield, or the bazooka tube may overhang the base's rim.

### Role briefs

| Role | Silhouette to read at 32 px | Details |
|---|---|---|
| `rifleman` | helmet + rifle straight forward | Steel helmet; rifle in both hands pointing +x; small pack/bedroll on the back (−x). The plain baseline soldier: draw this first. |
| `grenadier` | helmet + one arm out holding a ball | Helmet; satchel/pouches; **no rifle**; one arm cocked forward holding a pineapple grenade (draw the grenade bold and round, ~12 px). |
| `gunner` | **two helmets + splayed bipod** | Two-person crew: gunner on the receiver, assistant feeding a bold ammo belt from a box. A single sprite/unit pivot centered on the gun mount. |
| `sniper` | **very long thin gun** | Broad ragged ghillie cloak and hood, unmistakable bush-like outline; long scoped rifle. Body stays comparable in size to other infantry. |
| `shield` | **a big curved slab across the front** | Beefy armored shoulders and thick arms; low helmet tucked behind a heavy curved ballistic shield spanning the front arc (about 135°, roughly y = −42…+42) at x ≈ +22…+34; sidearm hand peeking past the edge. |
| `shotgun` | bulkier body, short fat gun | Heavy padded shoulders (the widest infantry body, up to ~58 px across), helmet, short pump shotgun forward to ~+46, shell bandolier across the chest. |
| `bazooka` | **a tube through the body** | Helmet; long rocket tube on the shoulder extending BOTH forward (to ~+58) and behind (to ~−52); the only figure with a front/back-symmetric silhouette. Shows the back-blast flare at the −x end. |

Each figure must be **unmistakable from the others by silhouette alone**. Squint test: blur it to a
silhouette; if two roles look alike, change the weapon, not the paint.

### `fallen` (dead soldier)

One generic image per faction (`figure_fallen_ally`, `figure_fallen_enemy`), 128×128: the **same kind
of miniature knocked over**, lying flat on the ground, helmet visible, no weapon, limbs sprawled with restrained blood marks. Head toward +x,
body centered on the pivot; the renderer rotates and offsets it away from the lethal damage source. Darker and
lower contrast than a standing figure so it reads as background. Role-agnostic on purpose: the engine
draws it without a base.

## 4. Vehicles

Vehicles are **three** layers on a long base: **hull**, **turret** (above the hull) and the base.
Hull and turret also come in `ally` and `enemy` paint; the wreck is faction-neutral.

| Unit | Hull canvas | Hull extents (approx., from center) | Turret canvas |
|---|---|---|---|
| Gun truck | 192×128 (`hull_truck_*`) | x −70…+70, y −38…+38 | 128×128 (`turret_truck_*`) |
| Tank | 256×192 (`hull_tank_*`) | x −86…+86, y −60…+60 | 192×192 (`turret_tank_*`) |

- **Hull**: the body seen from straight above. Truck: military cargo truck, cab toward +x, open bed
  behind with an empty ring-mount circle in the middle (for the turret), tires barely visible at the
  edges. Tank: wide tracks left and right, engine deck at the back, an empty turret ring at the middle,
  sloped front toward +x.
- **Turret**: spins about its own center (which is placed on the hull's center). Truck: a
  ring-mounted machine gun with a small gun-shield plate, barrel along +x. Tank: round turret with
  hatch, long cannon along +x with the muzzle tip within 4 px of the canvas edge.
- **Wreck** (`wreck_truck`, `wreck_tank`): the hull blown open and charred black, scorch marks, no
  turret. Same canvas and pivot as the hull. It sits on a dimmed base.
- Heading = hull +x. The hull must look right at any rotation (same lighting rules).

## 5. Shadows (generated, not painted)

`shadow_infantry` (160×160), `shadow_truck` (224×160), `shadow_tank` (288×224): a soft, black,
radially symmetric blob (alpha fades smoothly from ~45% at the middle to 0 at the edge), centered.
The renderer offsets it a few px in screen space so every piece sits "on" the table. **Write a small
script for these** (`tools/`, using `pngjs`); do not use an image model. It is not rotated by the game.

## 6. Delivery checklist

Tick items as they pass `npm run check:art`. The tiers are the order of work; **stop after tier 1 and
show the owner** (README.md workflow). Total: 49 files.

(Generated from `src/content/miniatures.ts`; regenerate this section if the spec changes.)

#### Tier 1

| Done | File | Canvas | Draw |
|---|---|---|---|
| [x] | `base_round_gold.png` | 128×128 | round base, **gold** finish |
| [x] | `base_round_silver.png` | 128×128 | round base, **silver** finish |
| [x] | `base_round_gold-tarnished.png` | 128×128 | round base, **gold-tarnished** finish |
| [x] | `base_round_silver-tarnished.png` | 128×128 | round base, **silver-tarnished** finish |
| [x] | `base_octagon_gold.png` | 128×128 | octagon base, **gold** finish |
| [x] | `base_octagon_silver.png` | 128×128 | octagon base, **silver** finish |
| [x] | `base_octagon_gold-tarnished.png` | 128×128 | octagon base, **gold-tarnished** finish |
| [x] | `base_octagon_silver-tarnished.png` | 128×128 | octagon base, **silver-tarnished** finish |
| [x] | `figure_rifleman_ally.png` | 128×128 | Standard rifleman: steel helmet, rifle held forward in both hands, small pack on the back. |
| [x] | `figure_rifleman_enemy.png` | 128×128 | Standard rifleman: steel helmet, rifle held forward in both hands, small pack on the back. |
| [x] | `figure_sniper_ally.png` | 128×128 | Sniper: broad shaggy ghillie cloak and hood, long scoped rifle; full-sized body. |
| [x] | `figure_sniper_enemy.png` | 128×128 | Sniper: broad shaggy ghillie cloak and hood, long scoped rifle; full-sized body. |
| [x] | `figure_shield_ally.png` | 128×128 | Shield bearer: low helmet tucked behind a big curved ballistic shield that spans the whole front arc (about 135°), sidearm hand visible. |
| [x] | `figure_shield_enemy.png` | 128×128 | Shield bearer: low helmet tucked behind a big curved ballistic shield that spans the whole front arc (about 135°), sidearm hand visible. |
| [x] | `figure_fallen_ally.png` | 128×128 | Unarmed fallen miniature: head toward +x, sprawled limbs, restrained blood marks; no base. |
| [x] | `figure_fallen_enemy.png` | 128×128 | Unarmed fallen miniature: head toward +x, sprawled limbs, restrained blood marks; no base. |
| [x] | `shadow_infantry.png` | 160×160 | GENERATED, not painted: a soft, radially symmetric dark blob (centered, black, alpha fading to 0 at the edge) that the renderer offsets i… |

#### Tier 2

| Done | File | Canvas | Draw |
|---|---|---|---|
| [x] | `base_square_gold.png` | 128×128 | square base, **gold** finish |
| [x] | `base_square_silver.png` | 128×128 | square base, **silver** finish |
| [x] | `base_square_gold-tarnished.png` | 128×128 | square base, **gold-tarnished** finish |
| [x] | `base_square_silver-tarnished.png` | 128×128 | square base, **silver-tarnished** finish |
| [x] | `figure_grenadier_ally.png` | 128×128 | Grenadier: helmet, grenade bandolier / pouches, one arm cocked holding a grenade forward, no rifle. |
| [x] | `figure_grenadier_enemy.png` | 128×128 | Grenadier: helmet, grenade bandolier / pouches, one arm cocked holding a grenade forward, no rifle. |
| [x] | `figure_gunner_ally.png` | 128×128 | Machine-gun crew: two figures, ammo belt/box and splayed bipod. |
| [x] | `figure_gunner_enemy.png` | 128×128 | Machine-gun crew: two figures, ammo belt/box and splayed bipod. |
| [x] | `figure_shotgun_ally.png` | 128×128 | Shotgunner: bulkier padded shoulders, helmet, short heavy pump shotgun forward, shell bandolier across the chest. |
| [x] | `figure_shotgun_enemy.png` | 128×128 | Shotgunner: bulkier padded shoulders, helmet, short heavy pump shotgun forward, shell bandolier across the chest. |
| [x] | `figure_bazooka_ally.png` | 128×128 | Bazooka gunner: helmet, long rocket tube resting on the shoulder, sticking out BOTH in front of and behind the body (the only figure with… |
| [x] | `figure_bazooka_enemy.png` | 128×128 | Bazooka gunner: helmet, long rocket tube resting on the shoulder, sticking out BOTH in front of and behind the body (the only figure with… |

#### Tier 3

| Done | File | Canvas | Draw |
|---|---|---|---|
| [x] | `base_truck_gold.png` | 192×128 | truck base, **gold** finish |
| [x] | `base_truck_silver.png` | 192×128 | truck base, **silver** finish |
| [x] | `base_truck_gold-tarnished.png` | 192×128 | truck base, **gold-tarnished** finish |
| [x] | `base_truck_silver-tarnished.png` | 192×128 | truck base, **silver-tarnished** finish |
| [x] | `base_tank_gold.png` | 256×192 | tank base, **gold** finish |
| [x] | `base_tank_silver.png` | 256×192 | tank base, **silver** finish |
| [x] | `base_tank_gold-tarnished.png` | 256×192 | tank base, **gold-tarnished** finish |
| [x] | `base_tank_silver-tarnished.png` | 256×192 | tank base, **silver-tarnished** finish |
| [x] | `hull_truck_ally.png` | 192×128 | Gun truck hull: military cargo truck seen from straight above, cab toward +x, open bed behind with a ring mount hole (the gun is a separa… |
| [x] | `turret_truck_ally.png` | 128×128 | Ring-mounted machine gun for the truck bed, barrel pointing +x from the center pivot, gunner shield plate in front. |
| [x] | `hull_truck_enemy.png` | 192×128 | Gun truck hull: military cargo truck seen from straight above, cab toward +x, open bed behind with a ring mount hole (the gun is a separa… |
| [x] | `turret_truck_enemy.png` | 128×128 | Ring-mounted machine gun for the truck bed, barrel pointing +x from the center pivot, gunner shield plate in front. |
| [x] | `wreck_truck.png` | 192×128 | Burnt, blown-open wreck of the hull above (no turret), charred black with scorch marks. Faction-neutral. |
| [x] | `hull_tank_ally.png` | 256×192 | Tank hull seen from straight above: wide tracks either side, engine deck at the back, turret ring (empty circle) in the middle (the turre… |
| [x] | `turret_tank_ally.png` | 192×192 | Tank turret seen from straight above, round hatch near the center pivot, long cannon pointing +x (barrel tip within 4 px of the canvas ed… |
| [x] | `hull_tank_enemy.png` | 256×192 | Tank hull seen from straight above: wide tracks either side, engine deck at the back, turret ring (empty circle) in the middle (the turre… |
| [x] | `turret_tank_enemy.png` | 192×192 | Tank turret seen from straight above, round hatch near the center pivot, long cannon pointing +x (barrel tip within 4 px of the canvas ed… |
| [x] | `wreck_tank.png` | 256×192 | Burnt, blown-open wreck of the hull above (no turret), charred black with scorch marks. Faction-neutral. |
| [x] | `shadow_truck.png` | 224×160 | GENERATED, not painted: a soft, radially symmetric dark blob (centered, black, alpha fading to 0 at the edge) that the renderer offsets i… |
| [x] | `shadow_tank.png` | 288×224 | GENERATED, not painted: a soft, radially symmetric dark blob (centered, black, alpha fading to 0 at the edge) that the renderer offsets i… |
