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
- [x] `tools/gen-placeholders.ts` (wired to `npm run gen:placeholders`): rasterizes simple shapes
  to PNG (use `pngjs` or similar pure-JS lib, with no native deps so it runs in CI). Each image:
  flat fill + dark outline + a tiny glyph/letter where it helps meaning. Output to
  `assets/placeholder/PLACEHOLDER__<key>.png`.
- [x] Minimum image set (keys): `soldier_live`, `soldier_echo`, `soldier_static`,
  `soldier_corpse`, `soldier_shield_ring` (lead-in invulnerability), `icon_interrupted`,
  `icon_x`, `icon_o`, `turret_base`, `turret_gun`, `turret_wreck`, `mine`, `mine_armed`,
  `vehicle`, `vehicle_wreck`, `gate_closed`, `gate_open`, `lever_a`, `lever_b`, `bridge_down`,
  `bridge_up`, `water_tile`, `ground_tile`, `wall_tile`, `objective`, `objective_destroyed`,
  `spawn_marker`, `muzzle_flash`, `impact`, `explosion`. Add more as needed. Soldiers face +x
  (match PHASE01's angle convention) so rotation just works.
- [x] `tools/gen-sounds.ts`: synthesizes short placeholder WAVs (pure JS, writing PCM):
  `sfx_rifle_shot`, `sfx_turret_shot`, `sfx_turret_windup`, `sfx_hit`, `sfx_death`,
  `sfx_explosion`, `sfx_lever`, `sfx_gate`, `sfx_vehicle_loop`, `sfx_static_hum`,
  `sfx_countdown_tick`, `sfx_resume_go`. Intentionally crude.
- [x] `src/content/assets.ts`: the manifest. One entry per asset: `{ key, file, kind:
  'image'|'sound', size?, represents, replacementBrief, status: 'placeholder' }`. Example
  replacementBrief: "Top-down soldier, facing right, 64×64, transparent background, readable at
  32px; the player-controlled version should be the most saturated." The generator scripts read
  this manifest so the lists can't drift.
- [x] Also generate `assets/ASSETS.md` from the manifest: a human/agent-readable table of
  everything that needs replacing.
- [x] `src/content/strings.ts`: all player-facing copy (HUD labels, objective text, spawn point
  names, countdown, mission complete…). Mark the file/entries as placeholder copy.

### Rendering (`src/render/phaser/`)
- [x] Asset loading by manifest key only.
- [x] Draw every `WorldView` entity: map tiles/walls, soldiers (by kind: live, echo, static,
  interrupted, corpse), turrets (base + rotating gun + wind-up telegraph), mines (armed state),
  vehicles, wrecks, gates, levers, bridges (animated state), objective.
- [x] **Readability first** (design doc §11): the live soldier must be instantly findable in a
  crowd (saturation, outline, drawn on top). Echoes are translucent/desaturated. Static figures
  flicker (alpha jitter + a static overlay sprite). Interrupted figures show the `!` icon. Draw a
  small per-soldier number label on echoes (toggleable).
- [x] Interpolate positions between sim ticks for smooth rendering at display refresh rate.
- [x] Event-driven effects from `SimEvent`s: tracers, muzzle flashes, impacts, explosions,
  hit flash on damaged soldiers, sounds. Incoming fire toward the live soldier must be obvious.
- [x] Simple sprite pooling. Don't create/destroy sprites per frame. (Army-scale optimization comes
  in 05-b; just don't paint us into a corner.)

### Input
- [x] Keyboard + mouse → `SoldierInput` per sim tick: WASD/arrows move, mouse aims, LMB/Space
  fire (hold for auto), E interact. Aim is the angle from the soldier's world position to the
  mouse's world position.
- [x] Input layer is an interface (`InputSource`) so touch/gamepad/auto-aim can plug in later
  (06-b), and so the O lead-in (PHASE04) can read inputs before applying them.

### HUD (`src/ui/hud/` DOM overlay, or Phaser UI; your call, but keep logic in pure functions)
- [x] HP, battle clock (`m:ss` from tick), current soldier label ("Soldier 3"), objective text.
- [x] Countdown overlay component (big centered "5…4…3…", used by PHASE04's lead-in). Build it
  now, triggered by a debug key.
- [x] Debug overlay (toggle with backtick): FPS, sim tick, entity counts, world hash, ms per sim
  step.

## Acceptance
- `npm run gen:placeholders` regenerates every PNG/WAV deterministically. `assets/ASSETS.md`
  lists them all, and no code references `assets/` paths directly.
- With 02-a merged, mission-01 is playable: you can walk, shoot the turret, trip mines, dodge
  traffic, pull levers, and destroy the objective, with readable feedback for each.
- The fake-view fixture renders every entity kind and soldier state (useful as a visual test page,
  e.g. `?scene=gallery`).

## Notes from implementation
- **Layout.** `src/render/` holds pure, tested logic (`interp.ts`, `soldier-style.ts`,
  `event-cues.ts`, `sound-mix.ts`, `geometry.ts`, `depth.ts`, `input/input-math.ts`,
  `assets/resolve-asset-urls.ts`, `phaser/pool.ts`); Phaser code is in `render/phaser/` and
  `render/input/keyboard-mouse-input.ts`. HUD and settings are DOM overlays in `src/ui/hud/` and
  `src/ui/settings/` (models are pure; DOM files only render them). `src/app/` wires it together.
- **Adding an asset.** Add an entry to `IMAGE_ASSETS` or `SOUND_ASSETS` in
  `src/content/assets.ts` (key, size/duration, represents, replacementBrief). The compiler then
  forces a recipe in `tools/gen-images.ts` (`IMAGE_RECIPES`) or `tools/gen-sounds.ts`
  (`SOUND_RECIPES`). Run `npm run gen:placeholders` and commit the files. `PreloadScene` loads
  every manifest entry under its key, so `scene.add.image(x, y, 'my_key')` just works. To ship
  real art, point `file` at it and set `status: 'final'` (the generator skips final entries).
  Tests check that every key has a file, the PNG/WAV bytes match the recipes (so stale generated
  files fail CI), ASSETS.md is current, and no source file outside the resolver mentions asset
  paths. Image entries have an optional `fitPx`: how many pixels map onto the entity's logical
  size. Soldiers are 64×64 with a 44 px body, scaled to `2 × spriteRadius`.
- **Asset URLs.** `src/render/assets/asset-urls.ts` is the only file that knows paths. It uses
  eager `import.meta.glob('/assets/**/*', { query: '?url' })`, so Vite fingerprints and bundles
  them (small PNGs get inlined as data URLs, which Phaser loads fine).
- **Strings.** `src/content/strings.ts`: `str(key, params)` for known keys and
  `strDynamic(key)` for keys that come from data (map `nameKey`s; falls back to the key). Every
  entry is placeholder copy until listed in `FINAL_KEYS`. 02-a: add `map.mission01.name` and
  spawn names if yours differ (`spawn.road` and `spawn.beach` already exist).
- **Rendering.** `WorldRenderer` (one instance per scene) pools every game object by entity id
  (`KeyedPool`; effects use a `FreeList`). Per sim step call `onStep(prevView, curView, liveId)`,
  which turns that tick's `SimEvent`s into cues (tracers, muzzle, impact, explosion, hit flash,
  sounds, shake) via the pure `eventCues`. Per frame call `render({ alpha, nowMs, liveId,
  pointer })`. Positions, facings, turret aim and bridge `raised` interpolate between the two
  views. Moves of more than 96 units snap, so respawns and teleports don't slide.
- **Readability rules** (`soldier-style.ts`): the live soldier is the saturated yellow sprite,
  drawn on top with a pulsing ground ring. Echoes use the desaturated sprite at
  `echoOpacity` with an ordinal label. Statics get alpha jitter plus a flipping TV-static
  overlay. Interrupted echoes show a bobbing `!`. Lead-in shows the rotating cyan shield ring.
  Corpses sit under everything. "Incoming fire" is a hostile shot that hits the live soldier or
  passes within 40 units of them. It gets a thick red tracer, a red HUD edge vignette and a small
  shake. A turret winding up on the live soldier draws a pulsing red laser along its aim.
- **Deviations / assumptions about the view contract** (02-a, please confirm or tell me):
  - `GateView`/`BridgeView` `x, y` are assumed to be the **top-left** corner, like `Rect`. Flip
    `RECT_VIEWS_ARE_TOP_LEFT` in `src/render/geometry.ts` if they're centers.
  - `VehicleView.w` is assumed to be the length along `heading` (the sprite faces +x).
  - `TurretView` has no target id, so the renderer remembers `turretWindup.targetId` until the
    turret leaves `windup`. A `targetId?: string` on `TurretView` would be simpler.
  - Mines have no "armed" event, so the renderer detects the idle→armed transition itself to
    play `sfx_mine_armed`.
  - The `[E] Use` prompt near levers uses a render-only radius (56). If the sim exposes its
    interact reach in tuning, the renderer should use that instead.
  - `SimEvent` positions: `soldierDied` and `hazardDestroyed` have no x/y, so effects look the
    entity up in the current view. That works as long as dead and destroyed entities stay in the
    view (corpses and wrecks do).
- **Fixed step.** Kept `src/app/fixed-step.ts`. Scenes feed it `game.loop.rawDelta`, not
  Phaser's smoothed delta. Phaser clamps the smoothed delta to 16.7 ms whenever the page lacks
  focus, which made battle time run slow in headless and background tabs. The stepper already
  caps catch-up (250 ms/frame, 8 steps).
- **Input.** `InputSource` (`src/render/input/input-source.ts`) has `read(soldierPos)` (called
  once per sim tick, no side effects on the sim) and `pointerWorld()` for the reticle. Fire and
  interact presses shorter than a tick are latched (`PressLatch`), so quick taps aren't lost.
- **Settings panel (F2).** `src/ui/settings/registry.ts` is a generic `SettingsStore`: boolean,
  number and choice definitions, registered by any module, with validation and clamping. It
  persists only non-default values as one JSON blob under `army-of-one.settings.v1`, and every
  storage access is wrapped in try/catch (falls back to memory). Display settings
  (`display-settings.ts`): echo labels, echo opacity, static flicker, HP bars
  (off/damaged/always), turret ranges and mine radii (off/active/always), lever→target lines,
  incoming-fire highlight, tracers, camera smoothing, camera zoom, screen shake, volume, mute,
  debug overlay, interpolation on/off, and sim speed (0.25×–4×). Use `bindDisplaySettings(store)`
  for a live typed object. **Sim tuning** is registered automatically from `DEFAULT_TUNING`, one
  slider per numeric or boolean leaf (`tuningSettingDefs`), so new 02-a tuning sections appear
  without code. `effectiveTuning(store, DEFAULT_TUNING)` → `withTuning` overrides. Values apply
  when a battle is created. The panel's **Restart battle** button restarts the scene with them.
  Live mid-battle tuning isn't wired, because `World.tuning` is fixed at `createWorld`.
- **Gallery (`?scene=gallery`).** `src/render/phaser/__fixtures__/gallery-fixture.ts` is a fake
  `MapDef` plus `galleryView(tick)`. It has one of every entity kind and every
  soldier/turret/mine/bridge state, a crowd that tests whether the live soldier pops, light
  animation (turret sweep, moving truck, bridges raising and lowering), and `galleryEvents(tick)`
  replaying shots, incoming fire, damage, windup, a mine blast and a destroyed hazard every 2 s.
  A test makes the build fail if a state union grows and the fixture doesn't cover it.
  `window.__aoo = { game, settings }` is exposed for browser checks.
- **For PHASE04:**
  - Start a battle with `game.scene.start('battle', { session })`, where `BattleSession =
    { world, liveId, makeInput(scene) }` (`src/render/phaser/services.ts`). Without a session the
    scene calls `services.createSession()` → `createDefaultSession(tuning, makeInput)` in
    `src/app/battle-setup.ts`. Switching to mission-01 is one line there (`BATTLE_MAP`).
    `scene.restart()` reuses the original data, so a restarted PHASE04 session would reuse the
    same (already mutated) world. Pass a fresh session instead.
  - Countdown overlay: `services.countdown.update(remainingTicks)` each frame (≤ 0 shows GO once,
    which lingers about 0.7 s and hides by itself). `update(null)` hides it. `onCue('tick' | 'go')`
    fires once per number (the battle scene plays `sfx_countdown_tick` / `sfx_resume_go`).
    It's driven by battle ticks, so the frozen pre-battle hold just keeps decrementing its own
    counter. F4 or the panel button runs a 5 s demo.
  - The battle scene currently applies `source.read()` to the live soldier every tick. For the
    lead-in, read the input every tick (to preview it) but only put it in the input map once
    control switches.
  - HUD: `buildHudModel(view, liveId)` → `hud.update(model)`. It shows "Shielded" during lead-in
    and KIA on death. `hud.flashDamage()` draws the red edge.
- **Not done / later:** a directional damage indicator, a captured-insertion-point notification
  (05-a), BitmapText for echo labels at army scale (05-b), and real sound spatialization
  (distance falloff only for now).
