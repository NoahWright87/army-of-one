# Verifying the art

Two layers: a **mechanical checker** for the rules a script can prove, and a **human checklist** for
the things only eyes can judge. Do both before calling a batch done.

## The checker

```
npm install                           # once
npm run check:art                     # check whatever's in assets/miniatures/ (missing files are fine)
npm run check:art -- --priority 1     # also list what's missing up to tier 1
npm run check:art -- --require        # ...and treat missing files as errors (use at the end)
npm run check:art -- --sheets         # also render assets/miniatures/_review/*.png
```

Exit code is 1 if there's any **ERROR**. Warnings don't fail the run, but read every one: each is a
specific thing the owner will notice.

### What it checks

| Check | Level | Why |
|---|---|---|
| Canvas size equals the spec | error | The renderer scales by `fitPx` and assumes the canvas. |
| Nothing in the outer 2 px | error | Rotation and scaling would clip it. |
| Base footprint size (±3 warn, ±8 error) | warn/error | Bases of every shape must fit the same hitbox. |
| Base centered on the pivot (≤ 3 px) | error | Else it wobbles when the camera rotates. |
| **Lighting bias** of bases ≤ 0.12 (warn > 0.06) | error/warn | Directional light is the thing that breaks under rotation. |
| Figure covers the pivot pixel | error | The body must sit on the center so it spins in place. |
| Figure's vertical center within 6 px of the axis | warn | Else it orbits when it rotates. |
| Figure extends further right than left (not bazooka) | warn | Catches figures drawn facing the wrong way. |
| Figure outline is dark (luminance ≤ 0.38) | warn | Legibility at 32 px. |
| Lots of semi-transparent pixels | warn | Usually a baked shadow or glow. |
| The four finishes of a shape share one silhouette (IoU ≥ 0.98) | error | They are swapped at runtime; the outline can't jump. |
| Gold is saturated; silver is neutral | warn | Readability of side. |
| Tarnished is clearly darker than polished (≤ 85% luminance) | warn | Live vs echo. |
| Live gold vs echo gold RGB distance ≥ 45 | warn | **The main gameplay requirement.** |
| Ally and enemy figure silhouettes match (IoU ≥ 0.95) | warn | One sculpt, two paints. |

It does **not** know whether the image is *actually* top-down, or whether the figure is a good
rifleman. That's what the sheets and the checklist are for.

### The review sheets (`--sheets`, writes `assets/miniatures/_review/`, git-ignored)

- **`rotation.png`**: every role that has all its pieces, three rows each (columns are 0°, 45°, …, 315°):
  - Row A, **aim**: the base stays put and the figure turns on it. The figure should pivot in place
    with no wobble or orbit, and the weapon should lead cleanly.
  - Row B, **camera rotation**: the whole piece turned together. It must look right at every
    angle; this is where baked-in lighting gives itself away (a base whose bright side moves around is wrong).
  - Row C: the same in the enemy's silver.
- **`swarm_32px_x2.png`** and **`swarm_48px_x1.png`**: a screen full of pieces (about 60 echoes,
  18 enemies, and **one live soldier**) at the real in-game size. **The live soldier must be
  findable within about a second.** If you have to hunt for it, make the polished gold shinier, or the
  echoes duller. Also check that roles are tellable apart.

## Human checklist (per batch, look at the sheets)

- [ ] **Top-down**: every image shows helmet tops and weapon lengths, never faces, chests, boots or
  a vehicle's front. No visible base side wall beyond the thin edge band.
- [ ] **Rotation row A**: figure spins in place around the center for all 8 angles. No orbit, no pop.
- [ ] **Rotation row B**: nothing looks "lit from one side" at any angle; shadows are absent.
- [ ] **Swarm @ 32 px**: find the live soldier fast. Echoes read as "the old gold". Enemies read as silver.
- [ ] **Role silhouettes**: with the sheet blurred, rifleman / shield / sniper (and the rest, in
  tier 2) are tellable apart by weapon shape.
- [ ] **Bases**: round / octagon / square read as different classes at 32 px. The octagon feels heavy.
- [ ] **Ally vs enemy**: same sculpt, clearly different paint and helmet shape.
- [ ] **Consistency**: all files look like they came from one set (same paint style, outline weight,
  base surface).
- [ ] **No** text, numbers, insignia, shadows, glow, halos or leftover background fringe.

## Acceptance for each tier

1. `npm run check:art -- --priority N --require` exits 0 (N = the tier just delivered).
2. Every warning is either fixed or explained in `docs/art/NOTES.md`.
3. The sheets were opened and looked at (say what you saw in the report).
4. After tier 1 only: the owner has seen the sheets and approved the style before tier 2 starts.

## If the checker is wrong

Thresholds live in `tools/miniatures-lib.ts`; tests are in `tools/miniatures.test.ts`. If a check
rejects art that is clearly correct, say what and why in your report, fix the check with a test, and
keep the change minimal. Don't just loosen a threshold to get green.
