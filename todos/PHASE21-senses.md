# PHASE21: Enemy senses

Owner session 2026-11-26 ([D161], [Q71]). Trigger: "enemies dodge the moment I fire, even though
they couldn't see me": the AI reacted to the bullet (a geometric near-miss test) on the very next
tick, with the shooter's exact position. The aim: soldiers that notice things the way a person
would (hear, see, get suspicious, react after a beat) and show it, so the player can *see* what
the AI is thinking.

**Owns:** `src/sim/ai/` (senses), `src/sim/events.ts` (stimulus events), `src/content/tuning.ts`
(`ai` / new `senses` block), `src/content/strings.ts` + `src/render/worldtext/` (barks, "!").

## Step 1: stop the Spider-Man effect (built)

- [x] `src/content/units.ts`: `UNITS_PER_METER = 44`, `meters()`, `toMeters()`.
- [x] Near-miss radius moved into `tuning.ai.nearMissRadius` (0.9 m, was a hard-coded 70 units).
- [x] Reaction delays: `hurtReactSeconds` 0.05, `nearMissReactSeconds` 0.15
      (`AiState.heard`, `queueHear` / `hearHit` in `brain.ts`).
- [x] A whizz gives a direction, not a position: the guess is off by up to
      `nearMissBearingError` (≈ ±20°) at the soldier's end; a guess never replaces a fresh sighting.
- [x] Tests: `src/sim/__tests__/senses-step1.test.ts`.

## Step 2: noise and hearing (built)

- [x] Sounds from events, not new sim events: `soundsOf` in `src/sim/ai/senses.ts` turns
      `shotFired` (by the weapon actually fired, so a Sniper's pistol is quieter than its rifle),
      `rocketLaunched`, `bulletStopped` (impacts: walls, ground, bodies), explosions (grenade,
      rocket, mine) and `damaged` / `soldierDied` (a cry, heard by its own side) into
      sounds. Kinds, audible range (metres) and heat are `tuning.senses.sounds`.
- [x] Hearing: within a kind's audible range (× `senses.hearingScale`) a soldier gains
      heat × (1 − distance / range). Own side's gunfire isn't suspicious; the other side's is.
- [x] Direction, not position: the guessed spot is off by `bearingErrorBase +
      bearingErrorPerMeter × metres` radians (capped), so far sounds smear. Sight is exact.
- [x] A beat before it acts: `senses.reactSeconds` (0.25 s) after the first unheard sound.
- [x] Impacts count: bullets hitting walls and dirt near a soldier raise heat (quietly).
- [ ] Different outcomes by stimulus: today a heard sound can wake, investigate or alarm; "take
      cover when bullets land near but nothing is seen" is not separate yet (it happens through
      near misses, step 1).

## Step 3: heat (built)

- [x] `AiState.heat` (`HeatState`): value, tick, react time and the last guessed spot. Fades
      linearly (`senses.heat.decayPerSecond`, ten seconds from full). Seeing foes adds
      `seenPerThink` each at every decision.
- [x] Thresholds in `tuning.senses.heat`: `wake` (a dormant soldier wakes; one woken this way
      doesn't go back to sleep until it cools to `sleepBelow`), `investigate` (an idle soldier
      with no target goes to where it heard it, as a last-seen spot that is a guess, so no shots
      at it), `alarm` (its whole squad hears).
- [x] Tests: `src/sim/__tests__/senses-step2.test.ts` (a lone distant shot does nothing; a
      firefight within earshot wakes them after a beat; out of earshot never; heat cools and they
      go back to their post; closer/louder count for more; own side ignored; cries; guess gets
      worse with distance; seeing raises heat).
- [ ] The headless "naive player" version through a real mission (does a player who shoots from
      far away now wake the base too early?). Needs a playtest.

## Step 4: make the thinking visible (built, first pass)

- [x] The view carries each AI soldier's alert level (`SoldierView.alert`: 1 uneasy, 2 contact,
      3 alarm; `alertOf` in `senses.ts`), so replays and the tape show it too.
- [x] The bark director speaks when it rises (`BarkDirector.alertChanges`): `uneasy` ("?",
      "Did you hear that?"), `contact` ("!", "Enemy!", "There he is!"), `alarm` ("CONTACT!!",
      "Wake up!"), `whoa` (a bullet past someone calm), `standDown` after a false alarm ("Must
      have been nothing."). All `info` lines except `standDown`, so they get through a fight but
      are rate-limited per category (`CATEGORY_RULES`). Lines in `strings.ts` (`bark.<category>.<n>`),
      enemies' words are tinted red as before ([D148]); not recorded ([D151]).
- [x] Checked in the browser: scripted Breach life with enemies on, five enemies reach contact,
      "ENEMY!" / "THERE HE IS!" show over their heads.
- [x] More chatter, first batch (owner: "I'd love more chatter"): a friend nearby says who is hit
      (`allyHit`), the soldier a rocket or shell is heading for shouts (`rocketWarn`), a mine going
      off (`mineBoom`) and cover breaking (`coverBlown`) get a word from whoever is close.
- [ ] More chatter, later: reloading and suppressed (the sim has no event for either yet), calling
      targets, idle talk. Add categories + lines the same way.
- [ ] Optional debug overlay: heat bars and the last heard/seen positions (F2 → Display).
- [ ] Look at how it reads with many enemies at once (the per-category cooldown means a group
      spotting you together shows one or two "!", not a wall of them): tune `cooldownMs`.

## Later

- [ ] Walls muffle sound (owner: eventually, not now): a flag, then a per-material factor.
- [ ] Re-run `npm run sim -- --scenario pacing` and the arena win rates after each step; the AI
      gets harder and softer in different places.

## Notes from implementation

- Step 1: balance barely moved (pacing bots: level 1 cleared in fewer lives, the others
  about the same). The existing `reactionSeconds` (0.35 s) still only applies to first *seeing*
  a target.
- The `hearHit` function (renamed from the old instant reaction) is the single place an
  alert lands; step 2 should route every stimulus through the same queue.
- Steps 2 and 3 (built together, since sounds need heat to mean anything): sounds are derived in
  the AI from events the sim already emits, so the sim, the tape and recordings are untouched
  (no new recorded data). Pacing bots are within the noise of step 1 (the bots rarely stand and
  shoot from afar); the army benchmark is unchanged (~0.4 ms per tick with 200 echoes).
- **Stances**: nothing in senses depends on stance yet. The AI's own stance is still auto. A
  prone or braced soldier is harder to *hit* ([D160]), not harder to *spot* or *hear*; see
  [Q71] before changing that. What does carry over: the weapon a Sniper actually fires (rifle
  or the swapped-to pistol) decides how loud the shot is.
- Known: `src/app/tape-flow.test.ts` pins `nearMissRadius` to the old 70 units because a fresh
  re-simulation drifts from the tape at other radii (it does on the old code too). Task filed.
