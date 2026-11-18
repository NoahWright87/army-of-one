# PHASE16: Miniature pieces (layered soldiers and vehicles)

**Goal:** draw soldiers and vehicles as collectible miniatures on gold/silver bases ([A116]–[A121]):
a shadow, a base that slides, and a figure that turns to aim, instead of one rotating sprite plus a
role icon. The art brief and checker are already written; this phase wires the layers into the
renderer. **Rendering only: no sim, recording or timeline changes.**

**Depends on:** PHASE12-b (vehicles). Art delivery (`docs/art/`) can run in parallel: build the
renderer against generated placeholders and swap the real PNGs in when they land.

## Read first

- `docs/art/README.md` (the two hard rules: top-down, and works at every rotation), `PIECE-SPEC.md`.
- `src/content/miniatures.ts`: sizes, file names/keys, `BASE_SHAPE_BY_ROLE`, `miniatureFiles()`.
- [A116]–[A123] in `docs/DECISIONS.md`.
- Today's code: `src/render/soldier-style.ts` (`soldierVisual`: texture/alpha/depth per state),
  `src/render/phaser/world-renderer.ts` (`drawSoldiers`, vehicle hull/turret drawing, role icons,
  live marker, shield ring), `src/content/assets.ts` (manifest), `docs/perf.md`.

## Tasks

- [x] **Manifest.** Add an entry per `miniatureFiles()` item (`mini_*` keys, `fitPx`, size, brief
      from the spec, `status: 'placeholder'` until real art lands). Keep the rule "code uses keys
      only".
- [x] **Placeholders (superseded by delivered final PNGs).** Extend `npm run gen:placeholders` to draw simple stand-ins for every
      `mini_*` key (gold/silver/tarnished discs, octagons, squares, plinths; a dark oval figure with a
      barrel, per role a distinguishing mark; the generated shadow blobs are *final*, not placeholders).
      Placeholders must obey the art rules too (top-down, radially lit), so the checker passes them.
- [x] **Style rules (pure, unit-tested).** In `soldier-style.ts` map a soldier's state to
      `{ baseKey, figureKey, alpha, … }`: live → `gold`; echo / static → `gold-tarnished`; enemy →
      `silver`; dead → unarmed fallen figure off the vanished base, along lethal-hit direction ([A125]). Role → shape via `BASE_SHAPE_BY_ROLE`.
- [x] **Renderer layers.** Per soldier: shadow (not rotated, offset in screen space), base (not
      rotated by aim; rotated by the camera if it rotates), figure (`rotation = facing`). Vehicles: base
      + hull rotate with the heading, the turret on top with its own aim, wreck on death. Retire the
      procedural vehicle hull drawing and the role-icon sprite (keep the icon behind a setting if it
      still helps in the respawn screen).
- [x] **Pools and performance.** This triples sprites per soldier. Use the existing pools and
      culling (`src/render/phaser/pool.ts`, `cullOffscreen`), only touch what changed, and re-run
      `npm run bench` / the stress mode (`?stress=100`, 400) against `docs/perf.md`. Consider baking
      base+shadow into one texture per finish if the sprite count hurts.
- [x] **Gallery.** Add every state × role × finish to `?scene=gallery` (the visual test page), plus a
      swarm view (50+ echoes, one live piece) at the real 32 px size.
- [x] **Camera rotation.** Verify with the camera rotated 0/90/180/270: bases and figures must not
      show a light direction or shadow shifting. (Shadows stay offset in *screen* space.)
- [ ] **Animation hooks (optional, cheap).** Slide tilt/squash when starting/stopping, figure turn
      easing (aim lag like a turret), recoil kick, tip-over on death, a "placed on the table" drop at
      deploy/echo spawn. All as tweens on layers; no new art.
- [x] Keep it playable with placeholders at every step. `npm run lint && npm run lint:purity &&
      npm run test && npm run build` must pass.

## ⛔ Decisions needed

- [AQ59] resolved by [A122]: use the proposed base shapes in the data file.
- [AQ60] resolved by [A123]: use the proposed static/fallen states.

## Notes from implementation

### Pilot integration (2026-11-17)

The owner requested the pilot in game to judge it in context; this is a partial PHASE16, not
the complete 49-file integration. Registered the 17 delivered PNGs under `mini_*` manifest keys
(final status prevents placeholder regeneration; visual approval is still pending).

`render/pilot-miniatures.ts` selects cached layer keys by role, faction and alive state.
Rifleman, Sniper and Shield use the pilot; other roles and vehicles retain their existing art.
WorldRenderer pools the base and shadow alongside the figure, preserves culling and opacity,
keeps the base upright while the figure aims, and converts the contact-shadow offset from
screen into world space. Dead pieces dim; static/flicker, interruption and lead-in overlays
remain. Role icons and ordinal labels are suppressed on miniature pieces. Replay uses the
same WorldRenderer. Run-ins use the pilot generic rifleman in place of the old generic sprite.

Added a rotating pilot-role/finish row to the gallery and unit coverage for finish, corpse,
fallback and manifest selection. Placeholder recipes remain exhaustive for placeholder keys;
the recipe parity test now checks final-art dimensions without trying to regenerate that art.

Verified visually in shared Chrome: gallery (states, rotating figures and fixed bases) and
the real Breach autoplay flow (countdown and deployed live miniature). Full vehicle layering,
remaining role art, expanded swarm/performance review and animation hooks are still pending.

Validation: lint, purity lint, production build and all 635 tests passed. Tests used
`node node_modules/vitest/vitest.mjs run --pool=threads --maxWorkers=2 --testTimeout=30000`
for this cloud environment (no repository test settings changed).

### Owner feedback follow-up ([A124]–[A125])

Foot bases are 0.55× their old scale; figure layers independently use 1.6× for legibility.
No large live ring on miniature units. Sniper/Shield silhouettes and unarmed fallen art were
redrawn. Bases disappear on infantry death, including unsupported standing-art roles. Corpses
are offset from their former base along a snapshot-safe, presentation-only lethal-hit direction.
Vehicles retain their old wreck rendering. Corpse opacity has a 0.55 floor so dim-echo settings
do not hide the new fallen poses. Added directional examples to the gallery.

Follow-up validation: all 638 tests pass (threads, two workers, 30-second timeout), plus lint,
purity lint, art checks and production build. Inspected the running gallery with all three
pilot silhouettes and directional corpse examples. Art checker warnings are documented in
`docs/art/NOTES.md`; no thresholds were loosened.

### Remaining infantry ([A126])

Tier-2 art is delivered and registered: all seven infantry roles now use miniature layers.
Bases increased to 0.70×; figures remain 1.6×. The Machine Gunner's two-person crew is one
image/unit. Live and echo run-ins carry role metadata for the correct sculpt. Dedicated
comparison view: `?scene=gallery&infantry=1` (live/echo/enemy/fallen for every infantry role).
The remaining vehicle art and vehicle-layer integration are still pending.

Infantry completion validation: all 639 tests pass with the cloud worker/timeout flags, plus
lint, purity lint, production build and tier-2 required art checks. Visually inspected the
rotation sheet, both swarm sheets and the running infantry gallery. Warnings are explained
in `docs/art/NOTES.md`; checker thresholds are unchanged.


### Vehicle and combat/environment continuation (2026-11-18)

All 49 miniature files are delivered and registered. Vehicles use separate pooled bases, hulls,
shadows and turrets, with turret-free wrecks. Procedural vehicle bodies are retired. A shared
lossless atlas keeps asset keys and pivots while reducing GPU texture switching and eliminating
software-WebGL clipping. Camera rotations 0/90/180/270 were reviewed in the native vehicle gallery.

Added animated bullet impacts, weapon-specific projectiles, nine terrain textures and native
SVG role/HUD icons. See docs/art/COMBAT-ENVIRONMENT.md for inventory, reproduction and prop backlog.
Synthetic 100/400-unit browser fixtures stabilize their pools; a 25/100-life headless smoke bench
also runs with flying bullets. These are smoke checks, not a hardware performance certification.
Optional character animation hooks remain deferred; character images remain static.

### Projectile readability follow-up (2026-11-18)

- [x] Add short, tapered trails behind actual projectile travel; bright outlined cores retain a
  minimum screen thickness. Warm gold player fire, muted gold echoes and coral enemy fire ([A129]).
- [x] Keep the existing Tracers setting; turning it off hides trails while preserving visible cores.
- [x] Add short rocket smoke trails and the same allegiance treatment to tank shells.
- [x] Strengthen grenade shadows and preserve their screen-space separation during camera rotation.
- [x] Add `?scene=gallery&trails=1` with all three allegiances on grass, concrete and road.

Views expose existing projectile owners/allegiances; simulation, saves and recordings are
unchanged. Bounded tick-position history handles catch-up, pause, removal, seeks and jumps, with
tests for interpolation/age/distance clipping. Validation: 718 tests, lint, purity lint and build;
desktop/mobile browser checks cover colours, zoom/rotation, toggle, pool reuse and cleanup.
