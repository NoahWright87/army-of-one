# PHASE02-a: Headless world & combat sim

**Goal:** everything that can kill a soldier, and everything a soldier can do about it, running
headless and deterministically. No recording/echoes yet. This phase gives the replay system
something meaningful to replay against.

**Depends on:** PHASE01. **Parallel with:** PHASE02-b.
**Owns:** `src/sim/**` (except `view.ts` changes, see below), `src/content/maps/**`,
`src/content/tuning.ts`, `tools/sim-cli.ts`.
**Shared contract:** `src/sim/view.ts` (`WorldView`) and `SoldierInput` from PHASE01. 02-b renders
against them. If you must change a view type, make it additive and note it in the PR so 02-b can
adjust.

Relevant rulings: [D13] no friendly fire, [D14] soldier sizes/liquid crowds, [D15] threats,
[D16] interruption sources, [D17] win condition, [E2] no randomness, [E3] deaths are simulated.

## Tasks

### Events
- [x] Each `step` produces an ordered `SimEvent[]` for that tick (also retained in a ring buffer
  on the world): `shotFired {by, from, angle, hitPoint, hitId?}`, `damaged {target, amount, by}`,
  `soldierDied {id, cause, by?}`, `hazardDestroyed {id}`, `mineDetonated {id}`,
  `interacted {by, targetId}`, `gateChanged {id, open}`, `bridgeChanged {id, state}`,
  `objectiveDestroyed {by}`. Renderers use these for tracers/flashes/sounds. Later phases use
  them for timeline markers.

### Soldiers & combat
- [x] Soldier hp/death. Dead soldiers stop stepping and leave a corpse marker in the view.
- [x] **Soldier flags** the later phases will set (implement the behavior now, set them later):
  `controllable` (live), `interactive` (false for static figures: no collision, can't be hit,
  don't count for anything), `minHp` (lead-in invulnerability per [D5]: damage applies but HP
  is floored).
- [x] Rifle: hitscan from soldier position along `aim`, fire cooldown, max range, damage. The ray
  stops at the first wall/closed gate/hazard/enemy-side target. **Friendly soldiers are
  transparent to friendly shots** ([D13]).
- [x] Shots must be expressible as **"fire from (x, y) at angle θ"** (an exported function), because
  echoes will fire recorded shots that way ([E1]). The live soldier's fire input just calls it with
  its current position/aim.
- [x] Soldier separation per [D14]: tiny blocker radius, soft push-apart (spring-like with a max
  push per tick), never hard-stopping a soldier in a crowd. Hitbox radius used for damage.
  Deterministic: resolve pairs in id order.
- [x] Interact input: nearest interactable within reach (levers, see below). Edge-triggered.

### Threats ([D15]); all shootable/alterable
- [x] **Turret:** fixed position, rotates toward the nearest eligible soldier in range with line of
  sight (eligible = alive and `interactive`). Brief wind-up telegraph before each shot (readability),
  then a hitscan shot. No randomness: if it has LOS when it fires, it hits. HP; destroyed turrets
  stay as wrecks (non-blocking).
- [x] **Mine:** proximity trigger radius → short fuse → blast radius damage (hurts soldiers;
  can also damage hazards/objective, why not). Shooting a mine detonates it.
- [x] **Traffic lane (frogger):** vehicles spawn on a fixed schedule from tick 0, move along a lane
  at constant speed, and kill soldiers on contact. A vehicle shot enough times is destroyed and
  leaves a **wreck that blocks movement** (a natural interruption source for echoes that used to
  walk through that spot).

### Route-changers ([D16])
- [x] **Gate + lever:** lever toggles gate open/closed on interact. A closed gate blocks movement
  and shots/LOS.
- [x] **Drawbridge + lever:** over impassable water/chasm. Raised = impassable; lowered =
  walkable. Raise/lower takes a short time. Soldiers on it when it rises… pick the obvious thing
  (get pushed off to the nearest walkable side) and note it.
- [x] *(Stretch)* **Destructible bridge:** an explosive charge you shoot; the bridge becomes
  impassable permanently. Anyone on it dies.

### Navigation (used by echoes in 03-a)
- [x] `world/nav.ts`: a walkability grid derived from static walls + dynamic blockers (closed
  gates, raised bridges, wrecks, live hazards that block). Efficient incremental update when a
  blocker changes. A* (8-connected, no corner cutting) returning a smoothed path. Deterministic
  tie-breaking. Grid cell size in tuning.
- [x] Query helpers: `isWalkable(pos)`, `findPath(from, to)`, `pathLength(path)`.

### Objective & mission
- [x] **Objective:** a destructible target with HP (bunker/fuel depot/whatever). Destroying it emits
  `objectiveDestroyed` and sets `world.missionComplete = {tick, by}` ([D17]). (The flag-capture
  objective comes with capture points in 05-a.)
- [x] `src/content/maps/mission-01.ts`: the first real test mission. Suggested layout, which you
  can adjust as long as these opportunities exist:
  - Two initial spawn points (e.g. **Road** west, **Beach** south) with different routes.
  - A **turret** covering the obvious approach, so the first soldier probably dies there. This is
    the "watch S1 die, save S1" setup.
  - A **gate + lever** on one route and a **drawbridge + lever** on another, so a later soldier
    can block a route an echo used (interruption).
  - A **mine field** and a **traffic road** to cross.
  - The **objective** behind all of it.
  - Keep it small: crossing it unopposed should take ~60–90s.

### Tests
- [x] Unit tests per mechanic (turret LOS/target choice, mine fuse/blast, vehicle schedule +
  wreck blocking, gate blocks LOS, no friendly fire, crowd separation lets a soldier squirm through
  a 10-soldier clump, A* with dynamic blockers).
- [x] **Scenario tests:** scripted input sequences on `mission-01`, e.g. "walk the road route →
  dies to turret at about t", "shoot turret from cover → turret destroyed".
- [x] **Determinism:** each scenario run twice → identical world hash every tick.
- [x] `npm run sim -- --map mission-01 --script <name>` runs a scenario headless and prints events.

## Acceptance
- All mechanics above exist in the headless sim with tests; determinism tests pass.
- The scripted scenario "soldier walks into turret LOS and dies" and "soldier destroys turret
  from cover" both work headless.
- `WorldView` exposes everything 02-b needs to draw every entity and state.

## Notes from implementation

### Layout
- `src/sim/state.ts`: `World` / `WorldState` (moved out of `sim.ts`, re-exported from it) and
  `emit()`. `sim.ts` orchestrates; entities live in `entities/{soldier,turret,mine,traffic,gate,
  bridge,lever,objective}.ts`, combat in `combat/{shots,damage}.ts`, geometry in
  `world/{collision,blockers,separation,nav}.ts`, the event ring buffer in `event-log.ts`.
- `world.state` stays plain data (tested: `structuredClone` round trip mid-mission continues with an
  identical hash every tick). Map-defined entity arrays are parallel to their defs
  (`state.turrets[i]` ↔ `map.turrets[i]`) and hold only dynamic fields. Soldiers and vehicles are
  id-sorted. Bridge raise progress is integer ticks.
- Outside `state` on `World` (derived, never needed for outcomes): `nav` (grid), `eventLog` (ring
  buffer, `recentEvents(world)`), `stepping` flag.
- `MapDef` gained optional `turrets`, `mines`, `trafficLanes`, `gates`, `bridges`, `levers`,
  `objectives` (all plain data, see `world/map.ts`). `createWorld` runs `validateMap` (unique ids,
  lever targets, axis-aligned lanes, destructible bridges need a charge). Ids `S<n>`/`V<n>` are
  reserved for runtime soldiers/vehicles.

### Tick order (`step`)
queued events flushed → tick++ → controllable soldiers move → soft separation → soldier actions in
id order (interact on press edge, then fire) → turrets → mines → traffic → bridges → every eligible
soldier is pushed out of anything solid (closed gate, new wreck, raised bridge). `step` now returns
the tick's events (still also in `state.events`). Events emitted **between** steps (e.g.
`spawnSoldier`, or a `fireRifle` call from outside `step`) are queued and open the next tick's
events, so renderers never miss a spawn.

### For PHASE03-a
- **Spawning with flags:** `spawnSoldier(world, pointId, { controllable, interactive, minHp,
  kinematic, position, facing })`. Defaults = a live soldier. Echo: `{ controllable: false,
  kinematic: true }` while on schedule; static figure: `{ controllable: false, interactive: false }`;
  lead-in: `{ minHp: 1 }`. Change later with `setSoldierFlags(world, id, flags)`.
- `controllable: false` soldiers ignore `step` inputs entirely; an echo controller moves them by
  setting `x/y/facing` (before `step`, or by splitting `step`; additive changes to `sim.ts` are
  yours). `kinematic` soldiers push others in separation but are never pushed by it. Walls and
  closing gates still push them (the end-of-tick resolve), which is exactly the "pushed off
  schedule" signal.
- **Shots from origin:** `fireRifle(world, shooterId, from, angle)` (in `combat/shots.ts`,
  re-exported from `sim.ts`) is the one way soldier shots happen: no cooldown check, emits
  `shotFired`, applies damage. Live fire goes through `trySoldierFire` (cooldown via
  `soldier.nextFireTick`). Record `{from, angle}` from the `shotFired` event.
- **Interacts:** `interact(world, soldier, targetId?)`. With `targetId` it only triggers that lever,
  if it's within `tuning.interact.reach`; returns the id used or null. Record `targetId` from the
  `interacted` event.
- **Nav API** (`world/nav.ts`, re-exported from `sim.ts`): `findPath(world, from, to)` → smoothed
  `Vec2[]` including both endpoints, or null; `isWalkable(world, pos)`; `isSegmentWalkable(world,
  a, b)` (cheap "is the straight move obstructed?" check); `pathLength(path)`. All sync the grid
  lazily from current state (diffing active blockers), so restoring a snapshot needs no extra step.
  Start/goal in a closed cell (soldier hugging a wall) snap within `nav.snapRadiusCells`. Mines and
  moving vehicles are NOT nav blockers (they kill, they don't block). A full cross-map query on
  mission-01 costs ~60 ms (110k cells); short lookahead queries are cheap. If echo replanning gets
  heavy, cap the search region or reuse buffers (05-b).
- Death info: `soldier.deathTick`, `soldier.deathCause` (`'turret' | 'mine' | 'vehicle' |
  'bridgeCollapse'`), plus the `soldierDied` event.
- Scenario driver (`src/sim/scenarios/driver.ts`) scripts a soldier with `moveTo` (nav),
  `walkStraight`, `waitUntil`, `wait`, `interact`, `shoot`. Reuse it for "S1 dies / S2 rescues"
  scenarios.

### Contract additions (all additive)
- `view.ts`: `SoldierView.deathCause?`; `TurretView.windup?` (0..1) and `targetId?`;
  `MineView.radius?`; `VehicleView.state` gains `'stopped'` (halted behind a wreck: solid,
  harmless, shootable); `BridgeView.bridgeKind?`, `axis?`, `charge?: {x, y, radius, hp, maxHp}`
  (destructible bridges, absent once blown). `getView` fills every array and `missionComplete`.
  `LeverView.on` is derived from the target (gate open / bridge down or lowering).
- `events.ts`: unchanged. A blown bridge emits `hazardDestroyed {id: bridgeId, by}` then
  `bridgeChanged {state: 'destroyed'}`. Turrets emit `turretWindup` at each wind-up start.
  `damaged` is emitted for hazards/objectives too (`target` = entity id).

### Behaviour choices (flags in `tuning.ts`, defaults in brackets)
- `turret.trackDuringWindup` [true]: keeps tracking during the wind-up; a shot fired with LOS always
  hits. LOS lost/out of range/target dead during wind-up cancels the shot. → [Q6]
- `vehicle.blockedBehavior` ['stop' | 'passThrough']: traffic stops behind wrecks. → [Q5]
- `vehicle.prewarm` [true]: lanes start full at tick 0. → [Q7]
- `vehicle.wreckBlocksShots` [true]: wrecks are cover. `bridge.raisedBlocksShots` [false].
- `mine.damagesHazards` [true]: blasts hurt turrets, vehicles, charges and the objective too; mines
  in a blast chain after `chainFuseSeconds`. Shooting a mine detonates it at once. Soldier deaths
  from a blast are credited to the mine; hazard damage to whoever set it off.
- Drawbridge: walkable only when fully down. When it starts rising, soldiers on it are moved
  instantly just past the nearer end along its axis. Lever on a moving bridge reverses it.
- Destructible bridge: charge hp `bridge.chargeHp`; on collapse, everyone on it takes
  `collapseDamage` (dies unless HP-floored; floored survivors are pushed off). Permanent.
- Destroyed turrets are non-blocking wrecks; live turrets and objectives block movement (bounding
  square). Mission completes when **all** objectives are destroyed.
- Contact with a moving vehicle deals `contactDamage` per tick (kills; lead-ins are floored at 1).
- No friendly fire is structural: all soldiers are team `'player'`, so player rays never test
  soldiers and turret rays never test turrets/mines/charges.
- Rifle range (520) > turret range (420), so a turret can be out-ranged. That's what "destroy
  the turret from cover" means on mission-01: LOS is symmetric, so there's no "they can't see me
  but I can see them" cover except range or walls.

### mission-01
- 6400×4400. Road (west) and Beach (south) spawns. Road: switchback → highway (2 lanes, fenced,
  crossable at one gap) → either the road corridor (destructible bridge over a chasm → turret at
  (4500,1300) covering the compound's road entrance) or the north corridor (gate + levers on both
  sides). Beach: mine channel (16 staggered mines, edges covered) → dunes → drawbridge (starts up,
  levers on both banks) → south field → compound's south entrance. Objective "depot" at (5900,800).
- Pure walking time (nav path length / speed) is ~56 s (road) / ~59 s (beach); with the highway,
  lever and mines the scripted runs finish the mission in 59–69 s. Raise to taste by moving walls.
- Spawn names use keys `spawn.mission01.road` / `spawn.mission01.beach`, map name
  `map.mission01.name` (strings.ts is 02-b's).
- Scenarios: `npm run sim -- --map mission-01 --list`, `--script <name>` (`road-naive` dies to the
  turret at ~0:46; `road-snipe-turret`, `road-gate`, `beach-drawbridge` complete the mission;
  `beach-naive` dies to a mine). `--quiet`, `--all-events`.

### Perf note
Single soldier on mission-01: ~15–25k ticks/s headless. Separation is O(n²) over eligible soldiers
and `dynamicBlockers` is recomputed per ray cast. Both are fine now; candidates for 05-b.
