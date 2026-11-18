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
- [ ] Signs on maps (`MapDef.signs`) and in the block editor.
- [ ] The tutorial mission.

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
