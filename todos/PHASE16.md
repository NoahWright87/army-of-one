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

- [ ] Regeneration ([D133]): after `soldier.regen.delaySeconds` without damage, heal
  `perSecond`. Deterministic, in the sim; echoes too.
- [ ] Difficulty presets ([D134]) chosen when a campaign starts, stored in it: enemy budget ×,
  AI handicaps, regeneration on/off, starting money. Applied to the campaign's levels and battles.

## D. Pacing benchmark

- [ ] `npm run sim -- --scenario pacing` ([D135]): bots play generated levels by brute force (lives
  lean toward objectives; enemies attack) and report lives and battle time to win per level.

## Later

Concealment (bushes, trenches, running visible, sniper concealed); the phone pass (zoom out,
smaller/collapsible minimap, keep the target on screen); a Hospital point that boosts regen.
