# PHASE17: Making fights matter

**Goal:** one soldier shouldn't win a level alone; a few echoes working together should. Competent
enemies, a balance arena, a stricter win rule, glanceable icons, tech points, better touch
controls, flying bullets. Decisions: [D137]–[D145]. Each part is independently testable.

## Parts (in order)

1. [x] Competent, aggressive AI + regen + regroup ([D137], [D138]).
2. [x] Dev arena ([D142]): footer Dev link; sides, roles, counts, HUMAN/CPU presets, cover, GO.
3. [x] Win rule ([D139]): every exit + a prominent position, entries held start ours; or kill all.
4. [x] Objective HUD icons ([D140]).
5. [x] Generator ([D143]): no objective next to an entry; walled bases playable.
6. [x] Tech points and buying roles on the map; map icons ([D141]).
7. [x] Touch controls ([D144]).
8. [x] Projectile bullets ([D145]).

Target to tune toward: on Normal a lone soldier usually loses at a guarded objective; a level
takes about 4–8 lives working together.

## Notes from implementation

1. **AI** (`src/sim/ai/brain.ts`, `tuning.ai`): sight 600, reaction 0.35 s, `distanceAimError`
   0.02, bursts 1.5 s / pauses 0.4 s, `enemyHpScale`/`enemyDamageScale` 1. Numbers: awake allies
   within `numbersRadius` (+1) vs our soldiers near its target; ≥ `rushRatio` (2) rush (sprint
   in, then stop and shoot within 0.6 × range, leash ×2), ≤ 1/`fleeRatio` flee unless in cover.
   Cover sprint only within `coverSprintRadius`. Enemies regenerate (`soldier.regen.enemies`);
   a wounded one healed to `regroupHp` joins the best squad within `regroupRadius` (living
   soldiers + 3 if it holds a point − distance/1000). Sprint 1.9× for everyone. Budgets per
   block 18→50. Pacing (bots, Normal): 2–24 lives per level, was 1–10.
2. **Arena** (`src/gen/arena.ts`, `src/render/phaser/arena-scene.ts`, `src/ui/arena/`,
   `?scene=arena`, title-screen "Dev" link): the AI fights for either side (`SquadDef.team`,
   allies/foes by team everywhere in the brain); `SquadDef.skill` per side (HUMAN preset: sight
   900, reaction 0.25, no aim error or burst pauses; CPU: the difficulty's AI patch).
   `map.aiSeed` salts the AI's and guns' rolls in arena fights only, and the side that spawns
   first alternates by seed: mirror matches come out roughly even (5v5 HUMAN still leans a little
   to one side, 12–28 over 40; noted, not chased). Config saved in localStorage.
   Baseline (CPU Normal, ×3 of a role vs 3 Riflemen, 20 fights): open field — Rifleman 11-9,
   Grenadier 0-20, Gunner 9-11, Sniper 3-17, Shield 0-20, Shotgunner 0-20, Bazooka 2-18; with
   sandbags — Gunner 15-5, Sniper 11-9, the rest about the same. Grenadier, Shield and Shotgunner
   need work (and cover content).
3. **Win rule**: every exit, the HQ, a key position (`src/gen/key-position.ts`) and green
   entry flags (`initialStage: 'ours'`, enemies can retake them); or kill every enemy
   (`map.winByKillAll`, checked in `damageSoldier`). The majority grouping is still in the sim
   but no level uses it.
4. **HUD**: `flagIcons` / `enemiesLeft` in `hud-model.ts`; SVG flags, 🪖×N → single helmets at
   ≤ 10. The objective text stays for maps without flags or enemies.
5. **Generator**: `breachPockets` cuts a way into walled-in ground (not islands) of
   `carve.pocketMinTiles`+ via `connect`; those levels are Elite. Objective-next-to-spawn is
   covered by the win rule (the key position keeps `carve.keyKeepAway` tiles away).
6. **Tech points**: `campaign.techBase/techDeadEnd/techElite` per level taken,
   `campaign.roleTech` prices, `buyRole`. Level unlock tags are gone (dead ends and walled bases
   are Elite instead). The map labels show 💀 💰 🔬n; the panel is chips plus a role bar.
7. **Touch**: tap mode is one full-screen zone: first finger = stick, second = aim + fire; the
   stick's dashed outer ring (`SPRINT_RING` 1.45 × radius) sprints. The stick mode (aim stick)
   is unchanged.
8. **Bullets**: `tuning.bullets` (on; per-gun speeds). `fireShot` with `speed` spawns a
   `BulletEntity` (`state.bullets`), `stepBullets` resolves hits through the same code as
   hitscan (`applyShotHit`). `shotFired` still fires at the trigger pull (`flying: true`) so the
   recorder and echoes are unchanged. Turrets and fragments stay hitscan. ~10–15% more sim time
   (`docs/perf.md`).
9. **Arena barriers** (owner follow-up): no more tapping to place. Each kind (sandbags, crate,
   fence, half wall, rock) has two fixed spots per half (`BARRIER_SPOTS`, mirrored, tested not
   to overlap each other or the starting blocks); its button cycles off → left → right → both.
   Setups saved with hand-placed pieces load with no barriers (`parseArenaConfig`).

10. **Retreats ran at the enemy** (owner, arena 10v10 with barriers): a retreat went to the
    squad's best rally point with no regard for where the shooter was (and "rear" assumed the
    enemy is down the map). In the arena the rally points are mid-field, so hurt soldiers
    sprinted into the fight (22 of 25 retreats moved toward the enemy). Now `retreatSpot`: the
    nearest cover that guards it, else a rally point `ai.retreatMargin` further from the threat,
    else behind friends further back, else `ai.retreatDistance` straight away; the threat is the
    middle of the foes within `ai.dangerRadius`. `findCoverSpot` also skips cover that's more
    than `ai.coverAdvance` closer to the shooter or doesn't actually block the shooter. After: 3
    of 54.
