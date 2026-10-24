# PHASE06: Streamline (playtest feedback)

The owner played PHASE04/05 and said, roughly: *functionally fantastic, but damn is it slow.
Show me a basic map of what's been revealed so I know where I'm spawning. The action should
travel in one direction: a straight shot into turrets. People will die, but you'll respawn.
Jump straight into what the game is.*

That became rulings **[D27]–[D30]** in `docs/DECISIONS.md`. This phase applies them in three
parallel parts:

| Part | What | Owns (primarily) |
|---|---|---|
| [06-a](PHASE06-a.md) | A linear "straight shot" mission (new default) + fast pacing + camera look-ahead | `src/content/maps/**`, `src/sim/scenarios/**`, `src/app/autoplay-lives.ts`, pacing values in `tuning.ts`, camera code |
| [06-b](PHASE06-b.md) | Revealed map: a fog-of-war model, a map panel on the respawn screen, an in-game minimap | new `src/timeline/reveal*.ts` (pure), `src/ui/respawn/**` map panel, new `src/ui/minimap/**` |
| [06-c](PHASE06-c.md) | Snappy flow (cut every wait) + a frame-rate pass | `src/app/flow.ts`, flow parts of `src/app/game.ts`, `src/ui/flow/**`, `src/render/**` perf |

Shared rules for all three:
- **Don't break the core loop.** Rescue → O → resume, scrubber, reload recovery and determinism
  tests must keep passing.
- **New behaviour gets a setting** when it's a matter of taste (F2 panel or `tuning.ts`), with a
  sensible default. Product rulings ([D5] 5 s lead-in, [D7] stagger, …) stay as they are unless a
  ruling changes them.
- Expect small merge touches in `src/app/game.ts`, `src/content/tuning.ts` and `strings.ts`.
  Keep your edits there additive and localized.
