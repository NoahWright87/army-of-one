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

## Pacing & map design (playtest feedback on PHASE04/05)

- **[D27] The action travels in one direction.** Missions are linear: you enter at one end and push
  toward the objective at the other. On screen, **forward is up**. Side routes can exist, but
  nothing loops back or sprawls sideways. This keeps multi-soldier (and later multiplayer)
  orchestration readable.
- **[D28] Jump straight into what the game is.** Contact within a few seconds of spawning: a
  straight shot into turrets. People will die, and that's fine; respawning *is* the game.
  Minimise dead time everywhere: walking, menus, waits, transitions.
- **[D29] A basic map of what's been revealed so far.** Show the parts of the battlefield your
  soldiers have seen (in the current truth), plus spawn points and known threats. It lives on the
  respawn screen, so you know where you're spawning, and as a small in-game minimap.
- **[D30] "It's slow" means pace *and* performance.** Fix both: fast pacing per [D28], and the
  browser build should feel smooth (target 60 fps on an ordinary laptop).
- **[D31] Breach is the only mission, and the template for new ones.** mission-03 "Breach" is the
  one playable mission. It shows how a mission should look: mostly vertical, moving in one
  direction ([D27]), with contact within seconds ([D28]). mission-01 and mission-02 were removed
  because they were too big and slow. Old saves for them are ignored.

## Cover, roles and weapons (PHASE07-c, owner session 2026-11)

- **[D32] Real-time cover with two numbers.** Every cover piece has the share of **straight shots**
  (bullets, fragments) it stops and the share of **lobbed** objects (grenades) it stops, 0–100 %.
  Most things are 100 % or 50 %. Materials set both: chain-link fence 10 % / 50 %, sandbags
  50 % / 15 %, half wall 60 % / 15 %, window 30 % / 40 %, crate 75 % / 30 %, bunker window
  90 % / 70 % (`tuning.cover.materials`; a map may override either number per piece). Solid walls
  are 100 % / 100 %. A bullet that crosses a cover piece is stopped with that probability. Cover
  is directional by nature: only shots that actually cross it are affected. Cover blocks movement
  like a wall. Breach's sandbags are 50 %.
- **[D33] Cover also hides you.** Crossing cover cuts the remaining sight past it: after cover
  of value c at distance d, sight reaches `d + (range − d) × (1 − c)`. So a turret can still shoot
  at a soldier hugging the far side of half cover, but won't spot one standing well back from it.
- **[D34] Cover indicator: arcs.** The soldier you control shows an arc toward each nearby piece
  of cover (or wall), darker and thicker for better cover: a solid wall to the east is a hard `)`,
  a fence to the west a faint `(`. Echoes don't show it.
- **[D35] Firing over cover, and accuracy.** A shooter standing right next to cover that isn't
  solid (below 100 %) fires over it: that piece doesn't stop their shots or their sight. There's
  no per-piece "can fire over" property. All soldiers are less accurate while moving (spread
  grows with speed; standing still is exact).
- **[D36] Roles.** Picked per new soldier on the respawn screen, no limits on how many of each.
  Each role has a spawn cost: the Rifleman is free, the others will cost something, but every cost
  is 0 for now and nothing spends them yet. A resumed soldier keeps their role; quick redeploy
  reuses the last role picked. **No Medic** (too easy to exploit). First roles: Rifleman and
  Grenadier.
- **[D37] Grenadier: frag grenades.** Hold fire to wind up (a ring fills); the further you aim,
  the longer the wind-up, and releasing early throws shorter. Throws scatter more while moving.
  Grenades have a simulated height: they arc, bounce off the ground and off cover (with speed
  carried from before the bounce), roll, and explode on a fuse. Explosions are a small central
  blast plus fragments that fly like bullets. **Grenades hurt your own soldiers too**, echoes
  included (an exception to [D13]: that's the risk/reward). Cover stops airborne grenades by its
  lobbed number; you can miss the window.
- **[D38] An indoor mission as a cover proof of concept.** mission-04 "Compound": a yard with a
  fence, crates and sandbags, a building with windows, a door and half walls, and a bunker with
  an armored slit. A separate playable mission (more missions are coming); Breach stays the
  default and the template. Machine guns (steadied on cover), mortars and enemy soldiers come
  after cover.

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
  exactly. Thinning to sparse waypoints is a later, outcome-tested optimization (PHASE07-a).
- **[E8] On-schedule echoes are kinematic.** They push the live soldier (and off-schedule echoes)
  but aren't pushed themselves, which keeps replays exact. The live soldier squirms around them
  via soft separation.
- **[E9] Storage may move to IndexedDB** if a large army's recordings outgrow localStorage. Same
  intent as [D20].
- **[E10] Outcome rolls are hashes, not a random stream (PHASE07-c).** Each cover roll, moving
  spread and fragment ring rotation is `hash(shooter, tick, cover id …)`. The same shot through
  the same cover gets the same answer in every replay, however much else in history changed;
  a shared PRNG stream would reshuffle every later roll after any change. Recordings store the
  final shot angle and throw (angle + distance), so spread is never re-rolled for echoes ([E1]).

---

## Open questions

_Add new ones here as `[Q#]` entries (Q1–Q4 became D23–D26)._

- **[Q5] Traffic behind a wreck (PHASE02-a).** When a vehicle is shot into a wreck, what do the
  vehicles behind it do? Implemented as `tuning.vehicle.blockedBehavior`:
  `'stop'` (default: they stop bumper-to-bumper behind it; stopped vehicles are solid, harmless
  and shootable, traffic backs up to the lane start, and the road downstream of the wreck goes
  quiet, so shooting a car makes a safe crossing) or `'passThrough'` (they drive through wrecks).
- **[Q6] Can you dodge a turret's wind-up by sidestepping (PHASE02-a)?** `tuning.turret.trackDuringWindup`:
  `true` (default: it keeps tracking during the telegraph and the shot always hits if it still has
  line of sight, so the only escape is breaking LOS) or `false` (aim freezes at wind-up start, so a
  sidestep dodges).
- **[Q7] Is traffic already running at battle start (PHASE02-a)?** `tuning.vehicle.prewarm`:
  `true` (default: lanes start full, as if traffic had always run) or `false` (empty road at 0:00,
  first vehicle enters at each lane's offset).
- **[Q8] How does an echo replay a lever press (PHASE03-a)?** `tuning.echo.replayInteract`:
  `'toggle'` (default: it presses the lever again, so if a later soldier already opened the gate,
  the echo's replayed press *closes* it, possibly blocking itself) or `'restoreState'` (it only
  presses if that brings the gate/bridge to the state its original press produced; an
  already-open gate stays open).
- **[Q9] Lead-in protection in later replays (PHASE03-a).** During a resume lead-in the soldier
  can't drop below 1 HP ([D5]). When that life later replays as an echo there's no floor, so a
  hit the lead-in absorbed can kill the echo in a later attempt. Currently: no floor for echoes
  (damage is always simulated, [E3]). Alternative: echoes keep `minHp = 1` over their recorded
  lead-in windows.
- **[Q10] Can a background resolve finish the mission (PHASE04)?** If the scrubber ([D23])
  replays an echo destroying the objective, the lane shows ✓ and the respawn header says the
  objective is destroyed, but the mission does **not** complete: it completes only when a live
  attempt sees it happen ("you have to live long enough to see it through", [D3]). Any deploy
  that doesn't interfere will then reach it. Alternative: end the mission as soon as the truth
  says the objective falls.
- **[Q11] Death beat style (PHASE04).** Currently a freeze on the last frame plus a big "KIA"
  caption for `tuning.deathBeatSeconds` (1 s), while the scrubber already runs. Alternative: a
  slow-motion second (the battle keeps simulating after the death, which would also extend
  what the attempt "saw").
- **[Q12] Reload mid-life skips the title (PHASE04).** [D6] says reloading resumes that soldier;
  with setting `game.resumeOnReload` on (default) a reload with a life in progress goes straight
  into its resume lead-in, without the title screen. Off: the title shows first and Continue
  starts the lead-in. (Browsers block sound until the first click either way.)
- **[Q13] Maps with both kinds of objective (PHASE05-a).** [D17] says blow up an objective *or*
  capture a flag point. Implemented: the mission completes when **every** objective is done
  (all destroy targets destroyed and every flag point ours). mission-02 has only the HQ flag, so
  capturing it wins. Alternative: any one objective wins. No setting yet (no map mixes them).
- **[Q14] Forward-spawn slots when the capture time moves (PHASE05-a).** [D7] gives each spawn
  point its own clock from its open tick. If a re-capture happens at a different tick, the next
  new soldier there enters at `max(captureTick + N × interval, latest soldier there + interval)`,
  where N counts only soldiers who entered at or after the current capture tick (earlier ones now
  never spawn, [D26]). Alternative: keep counting every soldier ever spawned there.
- **[Q15] Do captured points ever revert (PHASE05-a)?** There are no enemy soldiers, so a point
  that is ours stays ours for the rest of the battle, and stage boundaries lock in ([D11]). Any
  soldier counts toward a capture, echoes included ([D10]), so echoes alone can (re)capture in
  replay; static figures don't count. Revisit when enemies that recapture arrive.
- **[Q16] Quick redeploy details (PHASE06-c).** R / Space on the death beat or the respawn
  screen deploys a **new soldier at the last-used spawn point's next slot** (a resumed soldier
  counts as their own spawn point). If that point isn't offered any more, it uses the first new
  soldier option, and it never picks an O resume while a new soldier is possible. From the death
  beat it skips the respawn screen, so a scrubber reveal (X → O) is only seen on the next screen.
  A press within 300 ms of the death is ignored (`flow.quickRedeployGuardMs`), because Space is
  also fire. Skipping the empty respawn screen (`flow.skipEmptyRespawn`) also applies to Play
  again and dev Reset (every brand-new mission). Alternatives: a quick key that prefers a fresh
  O resume, or always showing the respawn screen after the first death.
- **[Q17] Revealed map on a phone (PHASE06-b).** [D29] puts the map on the respawn screen. On a
  phone with a wide map (mission-01/02) there's no room for timeline, map and spawn list at once,
  so the map shares the timeline's area behind a **Map / Timeline** toggle (default: timeline,
  remembered while the page is open). Tall maps (a vertical strip) fit beside the spawn list, so
  they're always shown. Alternatives: default to the map on phones, or a smaller always-visible
  map that shrinks the timeline. Desktop shows all three. (`respawn.showMap` hides the map.)
- **[Q18] Fire over cover: who and how close (PHASE07-c)?** Implemented: anyone (soldiers and
  turrets) whose centre is within `cover.fireOverDistance` (30, about a soldier's width) of a
  piece below `cover.fireOverBelow` (1 = anything not solid) ignores it, for their shots and
  sight. Set `fireOverBelow` to 0.9 for the "≤ 90 %" variant. Grenade fragments never fire over.
- **[Q19] Sight past cover (PHASE07-c).** [D33] is implemented as "the sight *remaining* after
  the cover is multiplied by (1 − c)" (`cover.obscuresSight`, off = cover is see-through). The
  alternative reading, "you see range × (1 − c) past the cover", lets a turret see anyone hugging
  cover. Only turrets use sight today; the player sees the whole screen.
- **[Q20] Grenade details (PHASE07-c).** Implemented: the Grenadier carries only grenades
  (unlimited, a 0.6 s cooldown, no rifle); the throw lands at the cursor (clamped to 60–420
  units); releasing early throws the wound-up share of that distance; the fuse runs from the throw
  (2.2 s); a **rolling** grenade is always stopped by cover (only airborne grenades get the lobbed
  roll); a grenade thrown from right next to cover clears it like a shot fires over it.
  Questions: a sidearm or limited grenades? Fuse from the throw or from landing ("cook" it by
  holding)? Should grenades set off when they hit a soldier?
- **[Q21] Turret sight through partial cover in Breach.** Breach's turrets now see (and shoot) a
  soldier hugging the sandbags, with half their shots stopped; soldiers can fire over the bags.
  Breach's first turret line may feel easier or harder than before; tune `cover.materials` or the
  sandbag positions if so.
