# PHASE16: Miniature pieces (layered soldiers and vehicles)

**Goal:** draw soldiers and vehicles as collectible miniatures on gold/silver bases ([D116]–[D121]):
a shadow, a base that slides, and a figure that turns to aim, instead of one rotating sprite plus a
role icon. The art brief and checker are already written; this phase wires the layers into the
renderer. **Rendering only: no sim, recording or timeline changes.**

**Depends on:** PHASE12-b (vehicles). Art delivery (`docs/art/`) can run in parallel: build the
renderer against generated placeholders and swap the real PNGs in when they land.

## Read first

- `docs/art/README.md` (the two hard rules: top-down, and works at every rotation), `PIECE-SPEC.md`.
- `src/content/miniatures.ts`: sizes, file names/keys, `BASE_SHAPE_BY_ROLE`, `miniatureFiles()`.
- [D116]–[D123] in `docs/DECISIONS.md`.
- Today's code: `src/render/soldier-style.ts` (`soldierVisual`: texture/alpha/depth per state),
  `src/render/phaser/world-renderer.ts` (`drawSoldiers`, vehicle hull/turret drawing, role icons,
  live marker, shield ring), `src/content/assets.ts` (manifest), `docs/perf.md`.

## Tasks

- [ ] **Manifest.** Add an entry per `miniatureFiles()` item (`mini_*` keys, `fitPx`, size, brief
      from the spec, `status: 'placeholder'` until real art lands). Keep the rule "code uses keys
      only".
- [ ] **Placeholders.** Extend `npm run gen:placeholders` to draw simple stand-ins for every
      `mini_*` key (gold/silver/tarnished discs, octagons, squares, plinths; a dark oval figure with a
      barrel, per role a distinguishing mark; the generated shadow blobs are *final*, not placeholders).
      Placeholders must obey the art rules too (top-down, radially lit), so the checker passes them.
- [ ] **Style rules (pure, unit-tested).** In `soldier-style.ts` map a soldier's state to
      `{ baseKey, figureKey, alpha, … }`: live → `gold`; echo / static → `gold-tarnished`; enemy →
      `silver`; dead → fallen figure on a dimmed base ([D123]). Role → shape via `BASE_SHAPE_BY_ROLE`.
- [ ] **Renderer layers.** Per soldier: shadow (not rotated, offset in screen space), base (not
      rotated by aim; rotated by the camera if it rotates), figure (`rotation = facing`). Vehicles: base
      + hull rotate with the heading, the turret on top with its own aim, wreck on death. Retire the
      procedural vehicle hull drawing and the role-icon sprite (keep the icon behind a setting if it
      still helps in the respawn screen).
- [ ] **Pools and performance.** This triples sprites per soldier. Use the existing pools and
      culling (`src/render/phaser/pool.ts`, `cullOffscreen`), only touch what changed, and re-run
      `npm run bench` / the stress mode (`?stress=100`, 400) against `docs/perf.md`. Consider baking
      base+shadow into one texture per finish if the sprite count hurts.
- [ ] **Gallery.** Add every state × role × finish to `?scene=gallery` (the visual test page), plus a
      swarm view (50+ echoes, one live piece) at the real 32 px size.
- [ ] **Camera rotation.** Verify with the camera rotated 0/90/180/270: bases and figures must not
      show a light direction or shadow shifting. (Shadows stay offset in *screen* space.)
- [ ] **Animation hooks (optional, cheap).** Slide tilt/squash when starting/stopping, figure turn
      easing (aim lag like a turret), recoil kick, tip-over on death, a "placed on the table" drop at
      deploy/echo spawn. All as tweens on layers; no new art.
- [ ] Keep it playable with placeholders at every step. `npm run lint && npm run lint:purity &&
      npm run test && npm run build` must pass.

## ⛔ Decisions needed

- [Q59] resolved by [D122]: use the proposed base shapes in the data file.
- [Q60] resolved by [D123]: use the proposed static/fallen states.

## Notes from implementation

_(none yet)_
