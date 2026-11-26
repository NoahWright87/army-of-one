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
   - [x] `src/sim/tape/`: frames every `attempt.tapeFrameEveryTicks` (a `WorldView`) + every
         event, a `Tape` that stitches runs (a run replaces the tape from its control tick on),
         `viewAt(tick)` with blending.
   - [x] Every run records: attempts and resolve passes (also in the worker).
   - [x] The after-action replay plays the tape (no re-simulation from 0:00).
   - [x] Handoff: until control the run is set to the tape at every frame it has (positions,
         facing, HP; objectives' HP); the controller logs any drift left at the control tick.
   - [x] Resume lead-ins lose the 1 HP floor ([D5] → owner 2026-11-21).
   - [x] Save: the tape is saved with the mission (deflated) and loaded on boot.
   - [x] Hide share links (`?share=1` brings them back); keep 3 replays in total.
2. **One continuous view**
   - [x] A clock (`src/render/time-clock.ts`) that plays at a rate or glides to a time (eased,
         ~0.3–1.3 s whatever the distance), inside what has played.
   - [x] The battle scene's respawn mode plays the tape on it; a death slows time to ¼ and
         plays on to the frontier; deploying glides back to the lead-in start and the run
         continues in the same scene (`BattleScene.adopt`). No death freeze.
3. **Respawn controls** (`src/ui/inworld/`)
   - [x] Lettered chevrons stacked over the timeline (A, B, C… = Alpha, Bravo, Charlie…;
         resumes by soldier number), last-used in gold; deaths as red ticks; a hatched
         not-yet-played part.
   - [x] Circles on spawn points and on saved soldiers whenever they're on screen; tap (or a
         chevron) glides time and camera there and opens the card (roles + DEPLOY / RESUME).
   - [x] Minimap: bigger on wide screens, tap/drag to look. Wheel and pinch zoom, drag to pan.
   - [x] Respawn look: the world desaturates, a vignette, the HUD gives way; controls fade.
   - [x] R / Space select the last spawn, again to deploy. No big redeploy button.

## Notes from implementation

- **Why replays didn't win** (the tutorial's stuck gate): an echo only snapped onto its
  recording within `echo.snapDistance` (4 px), less than a tick of walking plus a crowd push
  and far below a sprint step. A jostled or sprinting echo fell off schedule, got stuck on a
  soldier the live run had brushed past, and its recorded shots were skipped. The snap limit is
  now the soldier's fastest step plus the max push (`EchoController.snapLimit`).
- **Live ≠ echo, by nature**: a live soldier and an enemy shove each other half and half while
  an echo replays pinned to its path; an echo's "how much is it moving" (visibility) comes from
  its motion, not input. So re-simulating a stretch someone played live drifts a little. The
  tape fixes what matters: replays play the tape, and runs are glued to it until control
  (`sim/tape/align.ts`). Truth folds (lanes, X/O) still come from re-simulation after control.
- Drift tools: `sim/tape/drift.ts` (`firstDrift`, `compareViews`), `__aoo.checkDrift()` in the
  browser, and the controller logs "Handoff at tick …" if the sim and tape disagree at control.
  Tests: a bot army with enemies (Breach, basic training) and the real flow with resumes.
- Tape size: ~2 MB of JSON per 9 s of battle with ~46 soldiers in memory (70 KB deflated in the
  save). Long missions will want trimming (fewer frames for old battle time, or a compact
  frame format) — not done.
- `flow.inWorldRespawn` (F2 → Game, on) switches it all; off = the old respawn screen. Autoplay
  keeps the old screen. **Basic training uses the new view** (owner: "make it the standard"):
  its coach points at the chevron to pick, the class on the card, then DEPLOY
  (`inWorldCoachSteps` in main.ts; chevrons and circles carry `data-select`, class buttons
  `data-role`). A fresh mission opens on the suggested spawn's card. Money that can't run out
  (training's 9,999,999) isn't shown.
- Spawn letters (`spawnLabels`): a point named with a NATO word ("Alpha flag") keeps that
  letter; the rest take the free letters in map order and their NATO name (Breach: A Alpha,
  B Bravo, C Charlie; basic training's Barracks: E Echo).
- Not done: reverse playback with effects (going back is silent), timeline captures/objective
  marks, the old screen's lane-change captions ("Soldier 3 now survives"), sounds pitched with
  time, phone pinch tested only by code (not on a device). Basic training's coach was checked in
  the browser for the first deploy and the first respawn; the resume and new-class lessons were
  not played through.

### Drift guarantee (follow-up)

A fresh re-sim from 0:00 does **not** reproduce the tape exactly, and isn't meant to. The tape is
stitched from runs that start at snapshots of earlier runs and, before control, are only glued to
the tape (`alignToFrame`: pose, facing, HP). Hidden state (enemy AI memory, bullets in flight,
recoil) is whatever the previous run left, and a live soldier's physics differs slightly from the
same soldier replayed as an echo. Found with a wider near-miss radius: the re-sim fired the same
shots at angles ~0.03 rad apart (bullets inherited from a snapshot), a bullet hit S1 at tick 302 in
the re-sim and missed on the tape. The sim itself is deterministic; no gap to fix.

- `firstDrift` (tests) re-simulates glued to the tape and fails only on what the glue can't fix:
  alive/dead, gates, flags, destroyed objectives, one-frame pose error. HP is not compared.
- `firstStrictDrift` (`__aoo.checkDrift()`, pure-echo tests) is the exact comparison: a diagnostic.
- The handoff check ignores HP too (same reason); `tape-flow.test.ts` allows an enemy to be nudged ≤ 10 px, nobody else. The test no longer pins `nearMissRadius` (PHASE21 senses).
