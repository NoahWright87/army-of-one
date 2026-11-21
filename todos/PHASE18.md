# PHASE18: Words in the world

Goal: in-world ways to show text ([D147]–[D152]), as the base for a tutorial mission that
doesn't feel like one. Built in a lab first so the owner can tune the look by eye.

## Tasks

- [x] Speech markup: effects, colours, sizes, pacing (`[all]`/`[words]`/`[letters]`), pauses,
      `[quake]`; extensible effect registry (`src/render/worldtext/markup.ts`, `effects.ts`).
- [x] Speech layer: text only, outline + shadow, letters pop out of the speaker, follow them,
      screen-pixel size at any zoom, lines stack instead of covering each other (`speech-layer.ts`).
- [x] Names and ranks per role, `{name}`/`{rankShort}`/`{theirName}`… (`src/content/soldier-names.ts`).
- [x] Chatter director with the noise budget, not recorded (`barks.ts`); lines in strings.ts
      (`bark.<situation>.<n>`); wired into the WorldRenderer (game, arena, replay); F2 → Display
      → "Soldiers' chatter" turns it off.
- [x] Signposts: kinds with their own post + 9-slice frame, a per-sign frame override, read ring,
      grow out of the post / shrink back (`signpost-model.ts`, `signpost-layer.ts`,
      `src/content/sign-styles.ts`); placeholder art.
- [x] Text lab `?scene=textlab`: walk to signs, make anyone talk, stage situations, tune live,
      copy settings.
- [ ] Owner picks in the lab ([Q61], [Q62]); fold the numbers into `DEFAULT_WORLD_TEXT`.
- [x] The HQ ([D153]): `src/content/hub.ts` (map + layout), `src/app/hub.ts` (driver),
      `src/app/hub-main.ts` (signs' content, navigation). Signs carry buttons (DOM over the
      frame; 1–9 / E keys). `/` opens it; `?scene=title` is the old menu; a skirmish started there
      is `?mission=<id>&go=1` (no title screen, "← HQ" back).
- [ ] Signs on maps (`MapDef.signs`) and in the block editor.
- [x] Basic training ([D155]): `src/content/maps/basic-training.ts` (the course),
      `src/app/basic-training.ts` (the drill sergeant's director: lines, unlocks, respawn hints),
      `src/app/basic-training-overlay.ts` (draws him and the course's signs), `src/ui/coach/coach.ts`
      (the reusable UI coach). Sim additions any map can use: `MapDef.triggers` (gates that open on
      a capture / targets down / squad dead), `ObjectiveDef.target` (practice targets),
      `SquadDef.hold` (a gun nest that never moves).

## Notes from implementation

- Tags use square brackets (`[shake]`), so they never clash with `{name}` variables.
- Each letter is two Phaser Texts (outline layer under fill layer, in two containers): one
  letter's outline never covers its neighbour. Letters are padded because slanted fonts overhang.
- Fonts are PLACEHOLDER Google Fonts loaded at runtime (`fonts.ts`).
- Chatter runs on the render side (Math.random is fine there): it never touches the sim, so
  determinism and recordings are unaffected.
- "Saved someone" is detected as: you killed the enemy who hurt a friend in the last 3 s. The
  timeline rescue (an X becoming an O) has no event yet.
- Tuning: `src/content/world-text.ts` (render-side; kept out of the sim's F2 tuning panel).
- The HQ runs on the battle scene with a `SessionDriver` (`HubDriver`) and a new
  `BattleSession.overlay` hook (signs, labels, decor), so walking, shooting, touch and camera are
  the battle's. New sim helpers for it: `resetSoldier` (fresh life in place, same id; used for
  the class rack and respawns) and `setGateOpen`.
- Range targets are enemy soldiers with the AI off (`hubTuning`); they get back up after 2 s.
- Fixed on the way (all missions): a flying bullet only fired over cover on its first tick, so a
  gunner braced on sandbags shot into them (`castRay`'s `fireOverFrom`: judged from the shooter).
- Basic training's progress (`aoo:bt:v1`) holds lines said, unlocks and hints followed; graduating
  sets `aoo:bt:done`. Starting it again from the HQ (`&new=1`) resets both the save and progress.
- The first-visit redirect only happens on a bare `/`; `?scene=hub` always opens the HQ.
- Basic training tightened ([D156]): checkpoint flags (C, D) before the fights, the R3 chute (a
  wall where it's safe, a fence where the MG sees you), `MapTrigger.delaySeconds` (the chute gate),
  floor chevrons (`BT_CHEVRONS`, drawn by the overlay), always-on respawn hint to the newest flag.
  `src/sim/__tests__/basic-training.test.ts` plays a naive player through every station (incl.
  the mine save); a browser "cold player" bot that only follows the screen was run end to end.
- Real stats only ([D157]): `BASIC_TRAINING_TUNING` and the squads' `skill` boosts are gone; the
  naive-player tests now run on `DEFAULT_TUNING`. Grenades skid less (`groundFriction` 0.25,
  `rollDeceleration` 1800): they used to land on the target and roll out of their own blast.
- Look reach and scope zoom ([D158]): `src/content/camera.ts` (per class), `lookView` /
  `lookReach` / `phoneFitZoom` in `src/render/camera-look-ahead.ts`. Every gun braces
  (`tuning.brace`, `SoldierView.braced`); `SoldierState.steady` slows a mounted MG / raised
  Sniper rifle instead of dropping it. `mg.coverRangeMultiplier` in `gunRange`.
- Touch reticle drag: `TouchControls.reticle` (set in `makeControls` from the input source's
  `pointerWorld()`, mapped to client px); `tap` is now the dragged reticle (auto-aim yields
  while it's held), other fingers fire (`fireHeld`). `__aoo.touch` exposes the controls.
- Map rev 3: R5's riflemen moved east past auto-aim (MG mounts and aims by hand; a gap in the
  bags), R7 is a sniper range (door at its west end, bags inside, far guns behind a fence).
