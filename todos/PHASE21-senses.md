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

## Step 2: noise and hearing

- [ ] Stimulus events with a position, kind and loudness: `gunshot`, `bulletImpact` (wall, dirt,
      body), `whizz`, `hurt` / shout, `explosion`. Emitted by the sim; the tape records them already.
- [ ] Hearing: every soldier has a hearing range (metres), every sound a loudness; heard when
      distance ≤ hearing × loudness. Sound gives a *bearing with error that grows with distance*;
      sight gives the exact position and wins when both exist.
- [ ] Bullets hitting walls/cover near a soldier alert it (impact noise), unseen or not.
- [ ] Per-stimulus reaction delays in `tuning` (damage ~0.05 s, whizz/impact 0.1–0.2 s, distant
      shot 0.3 s+, squad shout ~0.25 s). It keeps doing what it was doing until the timer expires.
- [ ] Different outcomes by stimulus: a faint unseen shot makes it look/investigate; incoming
      fire nearby makes it take cover; covering fire only once it has a spot to fire at.

## Step 3: heat (suspicion)

- [ ] Each soldier (and squad) has a `heat` that rises with hearing/seeing dangerous or
      suspicious things (louder, closer, more numerous = more) and fades over time. Sights count
      too (seeing an enemy, seeing a friend die).
- [ ] Thresholds in tuning: low = alert and look toward it, medium = investigate / take cover,
      high = wake the squad, engage, rush or flee (the existing numbers rule still applies).
- [ ] Dormant soldiers wake from heat, not just distance (`wakeRadius`): distant fire matters as
      it gets louder, closer and more numerous.
- [ ] Headless "naive player" tests: lone distant shots don't wake a camp; a firefight does; heat
      decays back to calm.

## Step 4: make the thinking visible

- [ ] A "!" (or "?" when only suspicious) over a soldier's head when its heat crosses a threshold;
      barks on noticing ("Contact!", "Whoa!", "Where'd that come from?", "He's over there!").
      Strings in `strings.ts` (`bark.*`), within the noise budget of [D150]; not recorded ([D151]).
- [ ] More chatter in general (owner: "I'd love more chatter during the game"): idle, reloading,
      suppressed, a friend down, calling targets.
- [ ] Optional debug overlay: heat bars and the last heard/seen positions (F2 → Display).

## Later

- [ ] Walls muffle sound (owner: eventually, not now): a flag, then a per-material factor.
- [ ] Re-run `npm run sim -- --scenario pacing` and the arena win rates after each step; the AI
      gets harder and softer in different places.

## Notes from implementation

- Step 1 only: balance barely moved (pacing bots: level 1 cleared in fewer lives, the others
  about the same). The existing `reactionSeconds` (0.35 s) still only applies to first *seeing*
  a target.
- The `hearHit` function (renamed from the old instant reaction) is the single place an
  alert lands; step 2 should route every stimulus through the same queue.
