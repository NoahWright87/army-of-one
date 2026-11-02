# PHASE07-d: Enemy soldiers (AI)

**Goal:** lots of enemy soldiers to slog through, built as the same soldiers the player controls,
driven by AI ([D44]–[D48]). Ready for competitive multiplayer later (a human is just another
controller).

## Tasks
- [x] Teams: soldiers have a team; shots hit the other team; no friendly fire; turrets and mines
  only react to ours; observation markers only for ours (an enemy soldier killed by one of ours is
  a `kill` marker); enemy soldiers retake capture points ([D45], sim only, [Q25]).
- [x] Map squads (`map.squads`): members (role, position, facing), order (guard / patrol route),
  fallback point, capture point to hold. Spawned at tick 0 as `E1…` in map order. No respawns.
- [x] Brain (`src/sim/ai/brain.ts`): perception → utility decision → execution, producing a
  `SoldierInput` per tick for each awake enemy soldier (merged into `step`'s inputs, so movement,
  guns, recoil, MG mount and grenades are the player's code).
  - Behaviours: evade (grenade), retreat/regroup (low HP, or overwhelmed: stays shaken 4 s),
    cover (spot behind a cover piece away from the threat), engage (stand, steady, burst fire),
    approach (path toward the target, clamped to the role's leash), hold / patrol.
  - Role personalities in `roles.ts` (`AiProfile`); tuning in `tuning.ai`.
  - Reaction delay and aim error ([D47]); bursts come from recoil (fires while the cone at the
    target is tight enough); Grenadiers don't throw onto their own squad.
  - Dormancy by distance to our soldiers ([Q26]); squad members share sightings (and wake).
- [x] Traffic: finite pool per lane on a hidden loop ([D48]).
- [x] Breach ~36 enemies (8 squads), Compound ~17 (4 squads).
- [x] Auto-aim targets enemy soldiers.
- [x] Placeholder sprite `soldier_enemy`.

## Notes from implementation
- Determinism: the brain runs inside the sim on the previous tick's world, in id order, with
  hashed rolls. Enemies are not recorded; they're re-simulated every attempt, so history changes
  change how they fight.
- Perf (Node, 100 of ours, all enemies awake): 36 enemies ≈ 0.5 ms/tick, 144 ≈ 1.3 ms/tick.
  Pathfinding is the main cost; re-planning is throttled (`REPLAN_MOVE`, `ai.replanSeconds`,
  failed searches wait, `PATH_MAX_LENGTH`). If maps grow to many hundreds of awake enemies:
  flow fields per squad, or cheaper perception (spatial grid for "ours").
- The older scripted Breach stories (sim tests, app flow tests, respawn fixtures, dev autoplay)
  run with `ai.enabled: false` ([Q27]); `CLASSIC_TUNING` in `src/sim/__tests__/helpers.ts`.
- Not built yet: tanks (the threat model is ready: give a unit a big `threat`), squad-level
  tactics (flanking, suppression), enemies using levers/gates.
