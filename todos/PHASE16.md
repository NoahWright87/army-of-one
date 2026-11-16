# PHASE16: Pacing and difficulty

**Goal:** progress in a ~30-minute session ([D127]): shorter levels, less waiting, weaker enemies,
and Easy / Normal / Hard per campaign. Decisions: [D127]–[D135] (owner session 2026-11).

**Depends on:** PHASE14-a (campaign state). Runs alongside 14-b/14-c (different files).

## Where the time went (measured before this phase)

| | Breach | First campaign level | Middle | HQ level |
|---|---|---|---|---|
| Length to run | ~29 s | 29–61 s | 41–93 s | 45–82 s |
| Enemy soldiers | 38 | 34–72 | 54–92 | 140–230 |
| Flags needed | 1 | 1–6 | 2–6 | 2–10 |
| Levels to the HQ | – | 6–9 | | |

Enemy sight (600) beat the rifle's range (520); every life began with a 5 s lead-in.

## A. Tuning pass

- [x] Lead-in 5 s → 2 s ([D128]); flag stage 4 s → 3.25 s.
- [x] Enemy budgets per block much lower ([D131]).
- [x] AI handicaps ([D132]): sight under the rifle's range, slower reactions, aim error that grows
  with distance, pauses between bursts. All in `tuning.ai`.

## B. Generation

- [x] Smaller levels ([D127]): carve target ~10 blocks of ground (was 20); the board keeps its size.
- [x] Win by a majority of exits ([D129]): `map.objectiveGroups` (sim) — exits into other levels
  form one group needing ⌊n/2⌋ + 1; the HQ / far-end flag stays required.
- [x] Taking a level takes all of it: already true for spawns (held levels' crossings are entries).
- [x] Ingress capture points ([D130]): along the way from the entries to the exits, every so often
  a capture point + forward spawn on a road, clearing, corner or building edge (a field only if
  nothing else is near).
- [x] Content ([D131]): starter blocks put snipers and vehicles at low priority.

## C. Difficulty and regeneration

- [x] Regeneration ([D133]): after `soldier.regen.delaySeconds` without damage, heal
  `perSecond`. Deterministic, in the sim; echoes too.
- [x] Difficulty presets ([D134]) chosen when a campaign starts, stored in it: enemy budget ×,
  AI handicaps, regeneration on/off, starting money. Applied to the campaign's levels and battles.

## D. Pacing benchmark

- [x] `npm run sim -- --scenario pacing` ([D135]): bots play generated levels by brute force (lives
  lean toward objectives; enemies attack) and report lives and battle time to win per level.

## Later

Concealment (bushes, trenches, running visible, sniper concealed); the phone pass (zoom out,
smaller/collapsible minimap, keep the target on screen); a Hospital point that boosts regen.

## Notes from implementation

- **A (tuning):** lead-in 2 s, flag stage 3.25 s, world budget per block 10→35 (was 30→80), random
  levels 15 (was 45). AI: sight 450, reaction 0.7 s, `ai.distanceAimError` 0.06 rad per 500
  units, bursts of 1.2 s with 0.8 s pauses (`ai.burstSeconds` / `burstPauseSeconds`, offset per
  soldier). Scripted tests keep the old lead-in and capture time (`CLASSIC_TUNING`).
- **B (generation):** `carve.bandBlocks` [3, 6], `levelBlocks` 10, `minLevelBlocks` 3,
  `mergeBelowBlocks` 5, `minGap` 2. Over 5 seeds: 14–33 levels, 11–16 on the way to the HQ, each
  25–55 s to run across, mostly 6–40 enemies (the HQ up to ~70).
  - Majority win: `CapturePointDef.group` + `MapDef.objectiveGroups` (sim,
    `allObjectivesDone`); `majorityOf(n)` = ⌊n/2⌋ + 1. Only exits into other levels are
    grouped; the HQ and a no-exit level's far-end flag stay required.
  - Ingress points (`src/gen/ingress.ts`): one per `carve.ingressEvery` (18) steps from the
    entries, none within `ingressKeepAway` (10) tiles of another capture point or within
    `ingressEndMargin` (6) of the far end. Score: road/bridge +3, building corner (inside or
    diagonal outside) +2, wall edge +1.5, clearing +1, field 0; needs open tiles on four sides.
    Each gets a forward spawn two tiles back toward the entries. Big levels can get a lot of
    them (up to ~14); `ingressEvery` is the knob.
  - Official blocks: unit priority floors (grenadier/gunner 2, shield 3, shotgun/sniper 4,
    bazooka/truck/tank 5) and turrets ≥ 3. Content, not a tier rule ([D131]).
- **C:** `soldier.regen` {2/s after 5 s}; ours only, not vehicles or enemies; in the sim, so echoes
  heal the same. `src/content/difficulty.ts`: Easy (budget ×0.6, $150, regen 4/s after 3 s,
  sight 400, reaction 0.9), Normal (defaults), Hard (×1.4, regen off, sight 560, reaction 0.5,
  shorter pauses). Picked on the campaign map until the first attack; old campaigns are Normal.
- **D (pacing):** `npm run sim -- --scenario pacing`. Bot armies (75% "assault": flags first,
  sometimes via a forward point, shooting enemies) on the first 8 levels of the way to the HQ, at
  a fresh campaign's budgets. 3 seeds × 3 difficulties (`--cap 80`):

  | | Typical lives to win | Typical ~real minutes |
  |---|---|---|
  | Easy | 1–6 | 1–5 |
  | Normal | 1–11 | 1–9 |
  | Hard | 2–24 | 1–18 |

  One outlier (seed 42, level 8: 76 lives on every difficulty) is a bot limit, not the level:
  one entry, two exits ~4,600 units apart (both needed), and bots always deploy at the entry and
  never use forward spawns. Bots also never rewind or resume O's, so people should do better.
  Not done: budgets grown by battle time in later levels (the run uses a fresh campaign), and
  enemies that attack instead of holding.

## Notes: second pass ([D136], owner playtest: too easy)

- Too few enemies, capture points everywhere and unguarded. Levers pulled, no refactor:
  - `carve.extraCapturePoints` false: no ingress points and no blocks' own capture points
    (their forward spawns and squad holds go too). Capture points = exits + island outposts.
    `src/gen/ingress.ts` stays for when it's wanted again.
  - Budgets per block 25→70 (were 10→35): about 2.3× the enemies (13–107 per level over 5 seeds).
  - `ai.enemyHpScale` 0.6 and `ai.enemyDamageScale` 0.7 (enemy soldiers only; turrets and
    mines unchanged). `soldierMaxHp(tuning, role, team)`.
  - Guarded exits: a block holding an exit gets `carve.exitGuardWeight` (3)× its budget share,
    and the nearest squad within `carve.exitHoldRadius` (1500) holds each exit flag (the AI
    already holds and retakes a squad's `capturePointId`).

- Pacing after [D136] (Normal, seeds 11 and 42, 6 levels): 1–10 bot lives per level (the seed-42
  outlier still 76), about the same as before despite ~2.3× the enemies. The bots rush the
  nearest flag and many enemies are still asleep (`ai.wakeRadius`) when they arrive, so the
  benchmark isn't sensitive to enemy numbers yet; the owner's playtest is the real check.
