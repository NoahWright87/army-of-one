# PHASE19: The battle tape, one continuous view

Owner session 2026-11-21 (after the in-world respawn POC, `todos/POC-inworld-respawn.md`).

## The model (owner's words, condensed)

- **What actually played is truth.** Everything that plays is recorded on a **tape**: every
  unit, human and AI (position, facing, HP, alive), plus doors, objectives, captures and what
  happened (shots, hits, deaths). Rewinding and fast-forwarding over the past are playback, never
  re-simulation.
- **The past before you take control cannot change.** A lead-in is everyone (you, echoes and
  enemies) watching a short stretch of tape. The sim takes over **exactly at the tick the human
  regains control**. The AI may switch targets then; that's fine.
- **Beyond the frontier** (what has played so far), the battle is simulated *and* recorded.
  Zooming back over it later plays the recording.
- **Invincibility only for brand-new soldiers** (a stopgap; maybe not needed). Echoes,
  resumes and replays get none.
- Bigger saves are fine; keep only 2–3 replays in total. Old saves are dropped. Share links are
  hidden until there's a backend.
- Lead-in stays ~2 s ([D128]; the [D5] text saying 5 s is outdated).
- R / Space acts like tapping the last-used spawn (the view and time slide there).
- The death slow-motion stops at the end of what's recorded.

## Steps

1. **Tape** (this phase's core)
   - [ ] `src/sim/tape/`: frames every `tape.frameEveryTicks` (a compact view of the world) +
         every event, a `Tape` that stitches runs (a run replaces the tape from its first new
         tick on), `frameAt(tick)` with interpolation.
   - [ ] Every run records: attempts and resolve passes (also in the worker).
   - [ ] The after-action replay plays the tape (no re-simulation from 0:00).
   - [ ] Handoff: during a lead-in the screen shows the tape; at the control tick the sim is
         aligned to the tape's frame (positions, HP, alive), and drift is logged in dev builds.
   - [ ] Resume lead-ins lose the 1 HP floor ([D5] → owner 2026-11-21).
   - [ ] Save format: the tape is saved with the mission; old saves are dropped.
   - [ ] Hide share links; keep 2–3 replays in total.
2. **One continuous view**: a clock that eases through the tape at any rate, forward or back;
   a death slows time and plays to the frontier; deploying rewinds into the run-in.
3. **Respawn controls**: lettered chevrons (Alpha, Bravo…) stacked over the timeline, the
   last-used one highlighted; the minimap (tap/drag to look); pinch/wheel zoom; tap a saved
   soldier to slide to their time; a clear "respawn mode" look; no big redeploy button.

## Notes from implementation

(filled in as it goes)
