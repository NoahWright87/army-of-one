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
- **[D33] Cover also hides you.** Cover blocks the same share of vision as of bullets: you see
  clearly up to the cover, and the rest of your sight range past it is cut by its value. After
  cover of value c at distance d, sight reaches `d + (range − d) × (1 − c)`. Example: 50 m sight,
  50 % cover at 30 m → the last 20 m become 10 m, so you see 10 m past the cover. So a turret can still shoot
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
- **[D39] Spread and recoil for every gun.** Each shot goes out at a random angle within the
  gun's current cone: resting spread + a movement penalty + recoil. Every shot adds recoil and
  it recovers over time, so tapping stays accurate and holding the trigger sprays. Everything
  gets recoil (rifle, MG, turrets), all tunable (`tuning.rifle`, `tuning.mg`, `tuning.turret`).
  The MG's recoil is much larger than the rifle's, except when mounted. **The reticle is the
  cone:** the reticle itself grows to fit the current spread at its distance, so it grows when
  you aim further away, when you move, and during sustained fire ([D43]).
- **[D40] Machine Gunner.** A third role with an MG: fast fire, big spread and recoil. Standing
  still right next to non-solid cover mounts it: a ring fills around the reticle (0.6 s), then
  the spread and recoil drop sharply and the reticle turns cyan. The bonus only applies when
  firing **across** the cover you're braced on. Moving unmounts at once. No ammo or reloading
  yet (they come later, for every gun).
- **[D41] Phone controls and auto-aim (PHASE07-b).** Touch devices default to touch controls
  plus auto-aim; desktop to keyboard/mouse with manual aim. Both are settings (Controls group).
  Touch: a floating move stick on the left, an aim stick on the right when auto-aim is off
  (pushed far, it fires), a fire button, an interact button only near a lever, a settings
  button. Auto-aim picks a target in weapon range with a clear line (a turret winding up on you
  first, then the nearest), sticks with it, and fires by itself or while you hold fire
  (setting). What's recorded is still the actual shot ([E1]).
- **[D43] One aim indicator, a calm camera.** The reticle is the only aim indicator: no range
  ring around the soldier, no separate spread circle, no target brackets. It grows with the
  spread ([D39]). With auto-aim it slides out along the line to the target and stops just short
  of it, which shows who's targeted. The MG mount ring and cyan tint stay ([D40]). Under
  auto-aim the camera's look-ahead eases toward the aim (~0.6 s) instead of snapping when the
  target changes.
- **[D42] Results screen with the whole mission replaying (PHASE07-a).** When a mission is won,
  the stats, a play-style radar and personal bests show over a replay of the whole battle with
  every life at once. The camera frames every soldier in action and zooms with the group. Play/
  pause, 1×/2×/4×, a scrub bar marked with deaths, captures, kills and the win, skip to end,
  Watch again, Play again. Quiet stretches fast-forward (setting).
- **[D44] Enemy soldiers are our soldiers, AI-driven (PHASE07-d).** Same roles, same stats,
  same code: an enemy soldier is a soldier on the other team whose input comes from an AI brain
  instead of a player (ready for human opponents later). **No respawns**: that's what makes the
  player different. You are vastly outnumbered: lots of enemies to slog through. Enemies far from
  any of our soldiers are dormant (cheap), so maps can hold a lot of them.
- **[D45] Enemy soldiers retake capture points.** Alone on a point, they take it back a stage at a
  time at the same rate we capture; anyone of both sides present contests it.
- **[D46] AI behaviour, by role.** One brain, a personality per role (`roles.ts` → `ai`): cover
  preference, preferred range, aggression, bravery (danger tolerance), retreat HP, **chase
  leash** (per role), burst discipline, and the threat it poses. It paths through the level,
  scatters from grenades, retreats/regroups when badly hurt or outnumbered, takes nearby cover
  (or keeps fighting if cover is far), stops to steady its aim in range, approaches targets out
  of range within its leash. Threat values make overwhelming danger (e.g. tanks later) scary.
- **[D47] Deliberately imperfect AI, tunable.** A reaction delay before firing at a new target
  and a small aim error on top of the gun's own spread (`tuning.ai`).
- **[D48] Traffic is a finite loop.** Each lane has a fixed pool of cars driving a big hidden
  loop (same rhythm as before); a destroyed car never comes back.
- **[D49] Sprint (PHASE07-e).** Hold Shift (touch: the RUN button) to move 1.6× faster. While
  sprinting you can't fire or throw, and your reticle blooms. Enemy soldiers sprint too (same
  rules): to cover while under fire, away from grenades, and on a retreat.
- **[D50] AI aim suffers against moving targets.** On top of its base aim error, an AI soldier's
  aim jitters by `ai.movingTargetError` × how fast its target moves (a walk = 1, a sprint more).
  Sprinting to cover, or sprinting across an MG's view to draw its fire, are real options.
- **[D38] An indoor mission as a cover proof of concept.** mission-04 "Compound": a yard with a
  fence, crates and sandbags, a building with windows, a door and half walls, and a bunker with
  an armored slit. A separate playable mission (more missions are coming); Breach stays the
  default and the template. Machine guns (steadied on cover), mortars and enemy soldiers come
  after cover.

## Economy, vehicles, generation, sharing (owner session 2026-11)

- **[D51] Money lives on the timeline.** Every level has a starting amount and a base income per
  second of battle time (both may come from campaign progress, [D57]). Capturing a point raises
  the income rate for as long as the point is ours in the current truth. Spending happens at a
  soldier's spawn tick. So the balance at battle time t is: start + income up to t + bounties up
  to t − spending up to t, in the latest truth ([D2]). Example: $100 start, $1/s, one spawn
  every 2 s; a $50 Machine Gunner as soldier #10 (18 s) leaves $68; a point captured at 60 s
  worth $2/s means $110 at 60 s and $3/s from then on. Free Riflemen keep [D18] intact: you can
  always throw another soldier in.
- **[D52] Income is pure battle time.** It doesn't depend on anyone of ours being alive. What
  earns money is capturing objectives and taking out enemies, not survival.
- **[D53] Bounties: every enemy death counts, once, at its tick.** An enemy soldier or structure
  that dies pays a one-time bounty at that point on the timeline, whatever killed it: our shot,
  an echo's grenade, or an enemy stepping on its own mine. It pays once in the truth, not once
  per attempt. If a later attempt changes when (or whether) it dies, the bounty moves (or goes)
  with it. Cheap early enemies and an early capture point should make players feel they're
  getting somewhere, and the money that piles up by later capture points is what pays for heavy
  units there.
- **[D54] Debt, not un-spawning.** A soldier you bought stays bought. If history changes and
  takes money away (a capture no longer happens, a bounty disappears), the balance may go
  negative; you can't buy anything that would need the missing money until it recovers.
  Soldiers never vanish for lack of money.
- **[D55] Vehicles are big units you drive.** A vehicle (a tank, say) may look like a crew, but
  it's just you driving it as the player: one live unit with its own controls, a bigger body,
  far more HP and firepower. Very expensive, very powerful. It records and replays like any
  soldier ([E1]).
- **[D56] Seeded generation of levels and the world map.** Generation builds both the levels
  and the meta/world map that connects them, from a seed, deterministically. There may be a
  hand-made campaign first (tutorial through to a final boss); after it, endless generated
  campaigns and missions. Same seed, same campaign, for everyone.
- **[D57] Campaign progress raises your income.** Between levels in a campaign, your income
  (and possibly starting money) goes up.
- **[D58] Sharing without multiplayer.** Seeds make runs comparable: a **weekly campaign** (one
  seed per week), leaderboards, high scores and watching each other's replays. Beyond that,
  **asynchronous co-op**: playing alongside another player's lives as echoes, which affect your
  playthrough like your own echoes do.

## More roles (PHASE12-a, owner session 2026-11)

- **[D59] Sniper.** A pistol while moving. Standing still swaps to a long rifle (after a short
  set-up, with or without cover) that aims further than average. Cover makes it even more
  accurate and adds a little range. Like the Machine Gunner's mount ([D40]), but it doesn't need
  cover. Balance: auto-aim (the player's and the AI's) is very bad against moving targets with
  the rifle, and the pistol is weak up close and on the move.
- **[D60] Shield (heavy).** Blocks a share of damage (80 %, tunable) coming from the 135° it
  faces. Only a basic pistol. Used to guard other troops.
- **[D61] Shotgunner.** The opposite of the Sniper: useless at long range, more HP than average,
  powerful up close. Fires a random spread of pellets, deterministic on replay: each pellet's
  trajectory is recorded.
- **[D62] Bazooka.** For blowing up vehicles. Takes longer to fire, very inaccurate against
  people, more accurate against vehicles (for auto-aim and the AI), friendly-fire damage from
  the blast. Slower than average: bazookas are heavy.

## Vehicles (PHASE12-b, owner session 2026-11)

- **[D63] Vehicles: a gun truck and a tank.** Both are driven by you as one unit ([D55]); enemies
  get them too ([D44]).
- **[D64] Simple compass controls, vehicle-style turning.** Push north, go north; push east, go
  east. The vehicle has to turn to face that way first. A **tank** turns on the spot and only
  accelerates once it points roughly the right way. A **truck** can't turn on the spot: it
  rolls forward slowly while turning, and reaches full speed once it points the right way.
- **[D65] Small arms do very little to vehicles,** through **one unified armor system** shared
  with soldiers (the Shotgunner, the Shield) and anything else: no per-unit special cases.
  (How it works: [Q39].)
- **[D66] Vehicles run people over,** ours included. The damage comes from speed and weight: the
  tank crushes slowly, the truck has to hit hard and only hurts at low speed.
- **[D67] Vehicle wrecks block paths.**
- **[D68] Vehicles can capture points,** behind a setting so it can be turned off later.
- **[D69] Longer levels.** Missions need more room for vehicles and everything else. A new,
  longer mission shows vehicles off (Breach stays the short template): wider (1.5–2 phone
  screens), much taller, more enemy variety, several capture points (to test money too).
- **[D70] Unified armor (was Q39).** Armor reduces damage by a percentage and can be
  directional; some weapons pierce armor. One rule for everything:
  `damage taken = hit × (1 − max(0, armor from that direction − pierce))`. Shotgunner 10 %,
  Shield 80 % (front), truck 60 %, tank 99 % (front and sides) / 90 % (rear). Pierce: sniper
  5 %, rockets and tank shells 50 %, being run over 100 % (armor doesn't stop a tank running you
  over; a truck smashing into a tank damages the truck too).
- **[D71] Grenades have two damage sets.** The explosion: small area, decent damage, 50 % pierce
  (a Shield right next to it gets hurt). The shrapnel: reaches much further, many pieces, a
  little damage each, 0 % pierce (a grenade going off well in front of a Shield does little).
- **[D72] The tank has just a cannon,** for now. It fires slowly, giving people a chance to kill
  the tank. Vehicles reverse when you pull back.
- **[E12] Bullets through walls, later.** The armor rule can cover it (a wall's armor and a
  weapon's pierce; walls themselves stay unbreakable). Deferred; every damage path already goes
  through `src/sim/combat/armor.ts`, so it stays open.

## Respawn screen (owner session 2026-11)

- **[D73] A lean respawn screen that gets you back in fast.** No header (attempt number,
  soldiers used, time reached, objective), no "History changed" captions, the key behind an ℹ️
  button. Spawn points are the first timeline rows (short), with a marker at each point's next
  entry that moves right as soldiers spawn there; soldier rows show a role icon and number
  (placeholder icons, real ones from the owner later), and inert rows are shorter. One role
  button sits beside DEPLOY (same height, narrower) and opens a menu of roles; on an existing
  soldier it's locked (🔒) and DEPLOY reads REDEPLOY. The map runs full height beside the
  timeline. The screen opens on the quick-redeploy choice, so DEPLOY is one tap back in. (The
  role menu is where "certain roles only at certain spawn points" would go, if wanted later.)

## Owner playtest gripes (2026-11)

- **[D74] Doors are open-only (was Q8).** Opening only opens; closing is its own recorded action.
  If two soldiers open the same door, the second keeps it open. (`echo.replayInteract:
  'restoreState'`, now the default: an echo's replayed press only brings the door to the state
  its original press produced.)
- **[D75] No endless sideways traffic.** It wasted time. Roads get enemy gun trucks driving a
  patrol loop instead (an oval or a figure 8): Breach's road two, Mission 5's highway two and
  its service road one. (The traffic code stays for maps that want it; none use it now.)
- **[D76] Resume HP.** The respawn screen shows how much HP a saved soldier has where their
  recording ends (a bar under the O, and its tooltip). A soldier with less than 10 % left
  (`spawn.minResumeHp`) doesn't count as saved: their O shows dimmed and isn't offered.
- **[D77] The timeline groups soldiers under their spawn point,** with branch lines from the
  spawn row down to each soldier (like a git graph). Within a spawn point, soldiers you can
  resume come first, earliest resume first; the rest follow (by spawn time). Each spawn point
  can be folded: its soldiers become thin unlabeled lines with a dot for how they end.
- **[D78] Readable soldiers, safer rockets.** Every soldier wears its role icon on its circle.
  Rocket and tank-shell auto-aim go for vehicles first and lead moving vehicles (the AI too).
  Auto-aim never fires an explosive (rocket, shell, grenade) when one of ours would be in the
  blast. Auto-aim can be turned off per role (Controls settings), and on touch you can aim by
  hand: touch the battlefield where you want to aim and hold to fire (it overrides auto-aim
  while you hold it; the old aim stick is a setting).

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
- **[E11] Seeds carry a version (PHASE13/15).** A seed fixes the map, but a recording replays
  correctly only on the same generator, sim and tuning. Every seed, save and shared recording
  stores a content version (generator + sim + tuning). A weekly challenge is locked to the
  version it shipped with; old generator versions stay runnable (or old builds stay hosted) so
  last week's recordings still replay.

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
- **[Q8] (Resolved: [D74], 'restoreState' is the default.)** How does an echo replay a lever press (PHASE03-a)? `tuning.echo.replayInteract`:
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
- **[Q20] Grenade details (PHASE07-c).** Implemented: the Grenadier carries only grenades
  (unlimited, a 0.6 s cooldown, no rifle); the throw lands at the cursor (clamped to 60–420
  units); releasing early throws the wound-up share of that distance; the fuse runs from the throw
  (2.2 s); a **rolling** grenade is always stopped by cover (only airborne grenades get the lobbed
  roll); a grenade thrown from right next to cover clears it like a shot fires over it.
  Questions: a sidearm or limited grenades? Fuse from the throw or from landing ("cook" it by
  holding)? Should grenades set off when they hit a soldier?
- **[Q22] Auto-aim echoes (PHASE07-b).** An auto-aimed life replays its recorded shots like any
  echo (`echo.autoAimReplay: 'recorded'`, the only value). Design doc §05 floats the
  alternative: auto-aim echoes re-target whatever is valid now. Not built.
- **[Q23] Radar axes (PHASE07-a, [D18]).** Provisional, each 0–1: Speed (1 at ≤ 60 s battle
  time, 0 at ≥ 6 min), Economy (1 soldier → 1, 40+ → 0), Teamwork (rescues per soldier, 1 at ≥
  0.5), Aggression (hazards destroyed per life, 1 at ≥ 2), Survival (average life, 1 at ≥ 60 s),
  Tactics (captures + lever uses per life, 1 at ≥ 1). All in `src/ui/results/results-model.ts`;
  the radar can be turned off (`results.radar`). Redefine as you like.
- **[Q24] Replay framing (PHASE07-a).** The camera frames soldiers still following their
  recording (echoes); soldiers who already ended alive (O statics) aren't framed, so it follows
  the action. Deaths, captures and the win stay in frame for 1.5 s; the objective joins the
  framing in the last 3 s. A seek is a cut (no glide).
- **[Q25] Lost capture points in the timeline (PHASE07-d).** Enemy soldiers retake points in
  the sim ([D45]): the forward spawn closes then, and recorded soldiers due to spawn there after
  the loss never spawn ([D26]). The capture truth and the respawn screen don't show losses yet
  (they assume a captured point stays captured), so a forward spawn may still be offered after
  the point would be lost; deploying there bounces with "History shifted". Wanted: a "point
  lost at t" entry that closes the forward option from that tick. *(PHASE11: built; a forward
  spawn and its income now end when the point is lost. A point retaken later doesn't reopen
  yet.)*
- **[Q26] Dormancy is by distance, not camera (PHASE07-d).** "Inactive when far off camera" is
  implemented as "no soldier of ours (live or echo) within `ai.wakeRadius` (900)", sleeping
  again beyond `ai.sleepRadius` (1300). The camera isn't part of the sim, and background resolves
  (which have no camera) must agree with what you saw. Echoes far ahead wake enemies there too.
- **[Q27] Scripted dev stories and enemies.** The Breach autoplay stories and the older scripted
  tests were written before enemies; they run with `ai.enabled: false` (`&enemies=1` keeps the
  squads in autoplay). New stories with enemies would need new scripts.
- **[Q28] Sprint limits (PHASE07-e).** Sprint is unlimited for now. Options: stamina (a few
  seconds, then recover), a slower turn rate while sprinting, or louder (wakes enemies further).
- **[Q29] Turrets vs moving targets (PHASE07-e).** Only AI soldiers get the moving-target penalty
  ([D50]); turrets still track and hit perfectly (their telegraph is the counterplay). Should
  turrets miss moving targets too?
- **[Q30] What can you spend at time t (PHASE11)?** Built as proposed: the **lowest balance from t to
  the end of the mission**, not the balance at t. With a forward point, purchases aren't in
  time order: buy a $100 tank at 60 s, then a new beach soldier at 26 s sees $126 at that
  moment, but spending $50 there would leave the tank unpaid. So the respawn screen shows
  "$76 available" while the line reads $126. (Debt, [D54], still covers money lost to history
  changes.)
- **[Q31] Who pays for a soldier who never spawns (PHASE11)?** Built as proposed: you're only charged
  for soldiers who actually spawn in the current truth. A soldier from a lost capture point
  ([D26]) is refunded automatically, and charged again if the point is retaken in time.
- **[Q32] Money in the score (PHASE11/14).** Economy is part of scoring ([Q23]'s Economy axis),
  but how (money spent, left over, soldiers used) is still open. Owner: discuss later.
- **[Q33] Weekly challenge fairness (PHASE15).** Campaign progress raises income ([D57]), so two
  players on the same weekly seed aren't equal. Proposed: the weekly challenge has a fixed
  starting state that is part of the seed.
- **[Q34] Another player's echoes and your money (PHASE15).** In async co-op ([D58]), do their
  bounties and captures fund you? Do their purchases spend from your pool, or come free?
- **[Q35] Sniper set-up details (PHASE12-a).** Implemented: set-up takes 0.8 s of standing
  still; while it fills, the Sniper can fire its pistol; firing doesn't interrupt it; any
  movement drops back to the pistol at once. The rifle's camera looks 1.8× further ahead.
  Alternatives: no firing while setting up, or a slower turn rate with the rifle up.
- **[Q36] (Resolved by [D70]/[D71]: pierce decides; the `shield.blocksExplosions` flag is
  gone.)** Does the Shield block explosions (PHASE12-a)? [D60] says damage from the arc it
  faces; implemented literally, so a grenade or rocket going off in front is blocked too
  (`shield.blocksExplosions`, default on). Off makes explosives the counter to a Shield.
  The Shield only protects others by standing in the way (shots stop at the first soldier);
  a wider "moving cover" shield would be a new mechanic.
- **[Q37] Bazooka accuracy by target (PHASE12-a).** "Very inaccurate against people, accurate
  against vehicles" is implemented as aim error for the AI and auto-aim (`rocket.soldierAimError`
  against soldiers, none against vehicles/structures; auto-aim goes for vehicles first). A
  player aiming by hand gets the rocket's plain spread whatever the target. Rockets pass through
  our own soldiers; only the blast hurts them.
- **[Q38] Shotgunner "armor" (PHASE12-a).** Implemented as more HP (1.5×), not damage
  reduction. Say if you want armor as its own number (e.g. less damage from pistols/fragments).
- **[Q39] (Became [D70].)** Unified armor (PHASE12-b) — the first proposal, kept for history. See the PHASE12-b doc.
  One rule for everything that takes damage: `damage = max(hit − armor, hit × chip)`, where
  `armor` is a flat number per target (optionally higher in a front arc) and `chip` is a small
  share (e.g. 5 %) that always gets through. Soldiers 0, Shotgunner 3, Shield 20 front, truck
  ~10, tank ~35 (front 50), cover by material. Big single hits (sniper, rocket, shell, crush)
  punch through; many small ones (pistol, MG, pellets, fragments) barely scratch.
- **[Q40] Breakable cover (PHASE12-b) — built as proposed.** Cover pieces get HP and armor by material;
  bullets they stop and blasts damage them; vehicles crush light cover by driving into it; a
  destroyed piece is gone for the rest of that attempt. Walls and bunkers stay unbreakable.
- **[Q41] (Resolved: reverse, [D72].)** Reversing (PHASE12-b). Pulling the stick opposite to the vehicle's heading: turn
  all the way round ([D64] read literally), or reverse when it's nearly behind you?
- **[Q42] (Resolved: a new mission, [D69].)** Longer levels: extend Breach or add a mission? Extending Breach moves
  its objective (the scripted dev stories would need re-recording); a new, longer mission
  keeps Breach as the short template.
- **[Q43] "1.5–2 phone screens wide" (PHASE12-b).** At camera zoom 1 the view is as wide in
  world units as the screen in CSS pixels: a landscape phone shows ~850, a portrait one ~390.
  Mission 5 is 1800 wide (~2 landscape phone screens; Breach is 1600) and 12000 tall (Breach
  5450). Say if you meant something else; `M5_W` / `M5_H` in `mission-05.ts`.
- **[Q44] Vehicle details (PHASE12-b).** Implemented, all tunable: vehicles are round for
  collisions (truck r 26, tank r 32) and drawn as boxes; they spawn at the normal spawn points
  and cost $120 / $250 (Mission 5 starts with $150, so a truck early and a tank after a capture
  or two); traffic cars can't hurt a tank much (their contact damage goes through armor) and
  aren't hurt by being rammed; the enemy AI drives with the soldiers' pathfinding (it doesn't
  know a vehicle is wider, and it doesn't path through cover it has destroyed).
- **[Q45] Playtest-gripe details (PHASE12-d).** Implemented: tap-to-aim is the default touch
  aiming (`input.touchAim`), and the move stick shrinks to the bottom-left corner so the rest
  of the screen is "aim here"; folded soldiers can't be tapped to resume (unfold first); the
  friendly-fire guard counts our live soldier and echoes (not static figures) within the blast
  radius plus a soldier's width; patrols ignore their leash along their own route.
- **[Q21] Turret sight through partial cover in Breach.** Breach's turrets now see (and shoot) a
  soldier hugging the sandbags, with half their shots stopped; soldiers can fire over the bags.
  Breach's first turret line may feel easier or harder than before; tune `cover.materials` or the
  sandbag positions if so.
