# PHASE02-b: Presentation: renderer, input, HUD, placeholder pipeline

**Goal:** make the sim playable and readable in the browser, and establish the placeholder-content
pipeline ([D21]) so art, sound and copy can be swapped later without touching code.

**Depends on:** PHASE01. **Parallel with:** PHASE02-a.
**Owns:** `src/render/**`, `src/ui/**` (HUD only), `src/content/assets.ts`,
`src/content/strings.ts`, `assets/**`, `tools/gen-*.ts`, `src/app/**`.
**Shared contract:** `src/sim/view.ts` (`WorldView`) + `SoldierInput`. Render against the stub
view types from PHASE01. 02-a fills them in concurrently. Use a hand-written fake `WorldView`
fixture (`src/render/phaser/__fixtures__/`) containing one of every entity, so you can build
without waiting.

## Tasks

### Placeholder pipeline
- [ ] `tools/gen-placeholders.ts` (wired to `npm run gen:placeholders`): rasterizes simple shapes
  to PNG (use `pngjs` or similar pure-JS lib, with no native deps so it runs in CI). Each image:
  flat fill + dark outline + a tiny glyph/letter where it helps meaning. Output to
  `assets/placeholder/PLACEHOLDER__<key>.png`.
- [ ] Minimum image set (keys): `soldier_live`, `soldier_echo`, `soldier_static`,
  `soldier_corpse`, `soldier_shield_ring` (lead-in invulnerability), `icon_interrupted`,
  `icon_x`, `icon_o`, `turret_base`, `turret_gun`, `turret_wreck`, `mine`, `mine_armed`,
  `vehicle`, `vehicle_wreck`, `gate_closed`, `gate_open`, `lever_a`, `lever_b`, `bridge_down`,
  `bridge_up`, `water_tile`, `ground_tile`, `wall_tile`, `objective`, `objective_destroyed`,
  `spawn_marker`, `muzzle_flash`, `impact`, `explosion`. Add more as needed. Soldiers face +x
  (match PHASE01's angle convention) so rotation just works.
- [ ] `tools/gen-sounds.ts`: synthesizes short placeholder WAVs (pure JS, writing PCM):
  `sfx_rifle_shot`, `sfx_turret_shot`, `sfx_turret_windup`, `sfx_hit`, `sfx_death`,
  `sfx_explosion`, `sfx_lever`, `sfx_gate`, `sfx_vehicle_loop`, `sfx_static_hum`,
  `sfx_countdown_tick`, `sfx_resume_go`. Intentionally crude.
- [ ] `src/content/assets.ts`: the manifest. One entry per asset: `{ key, file, kind:
  'image'|'sound', size?, represents, replacementBrief, status: 'placeholder' }`. Example
  replacementBrief: "Top-down soldier, facing right, 64×64, transparent background, readable at
  32px; the player-controlled version should be the most saturated." The generator scripts read
  this manifest so the lists can't drift.
- [ ] Also generate `assets/ASSETS.md` from the manifest: a human/agent-readable table of
  everything that needs replacing.
- [ ] `src/content/strings.ts`: all player-facing copy (HUD labels, objective text, spawn point
  names, countdown, mission complete…). Mark the file/entries as placeholder copy.

### Rendering (`src/render/phaser/`)
- [ ] Asset loading by manifest key only.
- [ ] Draw every `WorldView` entity: map tiles/walls, soldiers (by kind: live, echo, static,
  interrupted, corpse), turrets (base + rotating gun + wind-up telegraph), mines (armed state),
  vehicles, wrecks, gates, levers, bridges (animated state), objective.
- [ ] **Readability first** (design doc §11): the live soldier must be instantly findable in a
  crowd (saturation, outline, drawn on top). Echoes are translucent/desaturated. Static figures
  flicker (alpha jitter + a static overlay sprite). Interrupted figures show the `!` icon. Draw a
  small per-soldier number label on echoes (toggleable).
- [ ] Interpolate positions between sim ticks for smooth rendering at display refresh rate.
- [ ] Event-driven effects from `SimEvent`s: tracers, muzzle flashes, impacts, explosions,
  hit flash on damaged soldiers, sounds. Incoming fire toward the live soldier must be obvious.
- [ ] Simple sprite pooling. Don't create/destroy sprites per frame. (Army-scale optimization comes
  in 05-b; just don't paint us into a corner.)

### Input
- [ ] Keyboard + mouse → `SoldierInput` per sim tick: WASD/arrows move, mouse aims, LMB/Space
  fire (hold for auto), E interact. Aim is the angle from the soldier's world position to the
  mouse's world position.
- [ ] Input layer is an interface (`InputSource`) so touch/gamepad/auto-aim can plug in later
  (06-b), and so the O lead-in (PHASE04) can read inputs before applying them.

### HUD (`src/ui/hud/` DOM overlay, or Phaser UI; your call, but keep logic in pure functions)
- [ ] HP, battle clock (`m:ss` from tick), current soldier label ("Soldier 3"), objective text.
- [ ] Countdown overlay component (big centered "5…4…3…", used by PHASE04's lead-in). Build it
  now, triggered by a debug key.
- [ ] Debug overlay (toggle with backtick): FPS, sim tick, entity counts, world hash, ms per sim
  step.

## Acceptance
- `npm run gen:placeholders` regenerates every PNG/WAV deterministically. `assets/ASSETS.md`
  lists them all, and no code references `assets/` paths directly.
- With 02-a merged, mission-01 is playable: you can walk, shoot the turret, trip mines, dodge
  traffic, pull levers, and destroy the objective, with readable feedback for each.
- The fake-view fixture renders every entity kind and soldier state (useful as a visual test page,
  e.g. `?scene=gallery`).

## Notes from implementation
_(append here)_
