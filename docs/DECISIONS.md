# Decision Log

Product-owner rulings that refine or override `army-of-one-product-design.html`. **This file
wins over the design doc where they disagree.** Agents: don't edit rulings. Add new questions
to "Open questions" and the product owner will move them up once answered.

Legend: **[D#]** = decided. **[Q#]** = open question. **[E#]** = engineering decision (agents may
revise with justification in a PR).

---

## Timeline & truth

- **[D1] Every attempt re-runs the battle from the world's start.** Enemies/hazards reset and react
  to the current world. Echoes replay alongside the live soldier.
- **[D2] The latest attempt is the truth.** Whatever happened in the most recent playthrough
  decides lane endpoints and respawn options. If a previously rescued soldier dies in the latest
  attempt, their lane shows an **X** at the new death time, and the rest of their recording is
  drawn as a **dashed/greyed line**. That tells you they once lived longer and will replay those
  actions if rescued again. A lane can have any number of these "you made it worse" segments.
- **[D3] You have to live long enough to see it through.** When the live soldier dies, the attempt
  ends. Truth updates **only for the battle time that was actually simulated** in that attempt.
  Battle time after the live soldier's death keeps its previously known truth for now. The
  player never has to *wait* for or *watch* the rest of the battle being resolved. Instead it's
  reconciled in the background while they're on the respawn screen ([D23]).
- **[D4] O = alive at end of recording.** No precalculation. If an echo reaches the end of its
  recording alive, it becomes **static** (noninteractive, flickering) for the rest of that
  attempt, and is offered as an **O** at the next respawn.
- **[D5] Resuming an O starts with a 5-second lead-in.** The battle loads ~5s of battle time before
  the O. The soldier plays out its recording while a countdown runs. The player can already be
  pressing move/aim/fire, and those inputs take effect the instant the countdown hits zero.
  During the lead-in the soldier is **unkillable** (may take damage, but HP can't drop below
  1).
- **[D5a] Every deployment gets the 5-second lead-in + countdown**, not just O resumes ([D25]).
- **[D6] Reloading mid-life resumes that soldier** with the same 5-second lead-in, from the last
  autosave. Exploitable ("reload to dodge death"), and the product owner doesn't care.

- **[D23] Background "scrubber" resolves stale history (was Q1).** While the player is on the respawn
  screen, the rest of the battle (everything after the attempt's last simulated tick) is re-simulated
  headlessly in the background. The timeline shows a **scrubber line sweeping across the remaining
  time**, updating lanes as it goes: greying out things that no longer happen, flipping X/O, and
  adding/removing spawn options. Deploying on something the scrubber hasn't reached yet still works:
  the deploy's own fast-forward is "seeing it through". If that fast-forward invalidates the choice
  (the soldier dies, or the capture never happens), bounce back to the respawn screen with a short
  "History shifted" notice.
- **[D24] Interrupted echoes (was Q2):** they stay killable, the freeze is permanent for that
  attempt (no recovery if the blocker clears), and an interrupted soldier is **not** a resumable
  respawn option.

## Spawning

- **[D7] Each spawn point has its own incrementing clock.** The Nth new soldier at a given spawn
  point enters at `pointOpenTick + (N-1) × spawnInterval` (start with 2s; tunable). Example: Beach
  A's 1st soldier enters at 0:00 and its 2nd at 0:02. Beach B's 1st soldier (maybe your 10th
  life overall) still enters at 0:00. A single road naturally becomes a line of soldiers running
  in. Choosing a spawn point is therefore also choosing an entry time. The respawn UI must show
  each point's next entry time.
- **[D8] Initial spawn points open at clock 0. Capture-point spawns open when and where the point
  was captured.** If a point was captured at 2:00, a soldier spawning there enters a battle that
  is already 2 minutes in.
- **[D9] Capture-point spawns are causal.** If the soldier who captured a point is killed earlier
  in a later attempt and never completes the capture, that spawn point is unavailable from then
  on. The captor's remaining timeline shows as interrupted until they're rescued again.

- **[D25] Every new soldier gets the same 5s lead-in as an O resume (was Q3)**, including the very
  first soldier at 0:00. For entries before battle time 5s, the part of the countdown before tick 0
  is a frozen pre-battle hold: nothing plays back if you're the first soldier on the field. The
  camera sits on the spawn point; the soldier appears when the countdown hits zero.
- **[D26] Soldiers from a lost capture point never spawn (was Q4).** If a capture no longer
  happens in the current truth (the scrubber or an attempt reveals it), soldiers who spawned
  there never spawn: their whole lane greys out. If the point is captured again (by their
  recorded spawn tick), they spawn and replay again. *(Interpretation: a soldier spawns at its
  recorded spawn tick if and only if its spawn point is ours at that tick.)*

## Capture points (Battlefield 2-style)

- **[D10] Any soldier standing inside the capture radius contributes.** More soldiers = faster.
- **[D11] Two stages:** lower the enemy flag fully → point becomes **neutral**; raise our flag
  fully → **we control it**. Reaching a stage boundary locks in that stage.
- **[D12] Interrupted progress decays, accelerating toward 0.** If nobody is capturing (everyone
  died or left), the point keeps its current stage, but progress within the stage decays back to
  0. Decay is much faster than capture but not instant, and it **accelerates the longer the circle
  is empty**. A brief step out loses very little. Staying out drains quickly.

## Combat & soldiers

- **[D13] No friendly fire.** Your soldiers' shots never hurt your soldiers.
- **[D14] Three soldier sizes:** sprite (largest) > damage hitbox (a bit smaller) > a *very small*
  movement-blocking radius. Soldiers can't fully overlap but stay "liquid" like RTS crowds: you can
  always squirm through a crowd. Separation must be soft enough not to wreck echo playback unless
  you deliberately pile many soldiers on one spot.
- **[D15] Phase-1 threats** are simple: mines, basic turrets, frogger-style traffic, or similar.
  Soldiers can alter them, mostly by shooting them.
- **[D16] Phase-1 interruption sources:** a gate that opens/shuts, a bridge that raises/lowers, or a
  bridge you can blow up. Something that blocks a route an echo originally used.

## Missions

- **[D17] Phase-1 win condition:** blow up an objective or capture a flag point.
- **[D18] No time cap.** Play however you want: one perfect life or 300 sacrifices. Later, missions
  get scored (speed, soldiers used, etc.), possibly with a radar chart of play style.

## Platform & process

- **[D19] Stack:** Phaser 4 + TypeScript + Vite, Vitest, npm. Deployed by **Netlify** (owner configures
  it in Netlify's UI; repo provides `netlify.toml`). Keep as much as possible engine-agnostic:
  a 3D version may come later and Phaser doesn't do 3D.
- **[D20] Persist mission progress in localStorage.** Not every tick, but frequently enough that an
  accidental mobile pull-to-refresh loses little.
- **[D21] Placeholders for everything:** basic-shape PNGs, simple sounds, draft copy, all clearly
  named and listed in a manifest so Codex/GPT can swap in generated art later. Art direction is
  not a gate. Make a stab and move on.
- **[D22] Agents:** Claude and Codex work in parallel, guided by the owner. Conventions live in
  `AGENTS.md`.

## Engineering decisions

- **[E1] Echoes follow a recorded schedule, not raw inputs.** The live soldier's inputs drive the
  sim. What's recorded is the outcome: timed waypoints (position + facing) and discrete events
  (shots with origin + angle, interactions). Echoes pathfind to reach each waypoint **at its
  recorded time**. They are throttled so they never arrive early, even if an obstacle they once
  sidestepped is gone, and may "cheat" a little speed to catch up when late. Recorded shots fire
  from (close to) the recorded position at the recorded angle.
- **[E2] No randomness in the sim** (a seeded PRNG exists for emergencies). Determinism is needed so
  that unchanged history replays identically.
- **[E3] Damage and deaths are never replayed; they're simulated.** An echo dies in replay because
  the world kills it again, not because the recording says so. That is what makes rescues
  possible.
- **[E4] World snapshots** are taken periodically (e.g. every 1s of battle time) during attempts, so
  later attempts can start at a forward spawn or an O lead-in without simulating from 0.
- **[E5] The respawn timeline is a DOM/SVG overlay**, independent of Phaser.
- **[E6] Fixed 60 Hz sim tick**, render interpolated separately.
- **[E7] Recordings start lossless (every tick, quantized positions)** so unchanged history replays
  exactly. Thinning to sparse waypoints is a later, outcome-tested optimization (PHASE06-a).
- **[E8] On-schedule echoes are kinematic.** They push the live soldier (and off-schedule echoes)
  but aren't pushed themselves, which keeps replays exact. The live soldier squirms around them
  via soft separation.
- **[E9] Storage may move to IndexedDB** if a large army's recordings outgrow localStorage. Same
  intent as [D20].

---

## Open questions

_None right now. Add new ones here as `[Q#]` entries (Q1–Q4 became D23–D26)._
