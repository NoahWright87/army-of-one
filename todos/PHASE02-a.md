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
- [ ] Each `step` produces an ordered `SimEvent[]` for that tick (also retained in a ring buffer
  on the world): `shotFired {by, from, angle, hitPoint, hitId?}`, `damaged {target, amount, by}`,
  `soldierDied {id, cause, by?}`, `hazardDestroyed {id}`, `mineDetonated {id}`,
  `interacted {by, targetId}`, `gateChanged {id, open}`, `bridgeChanged {id, state}`,
  `objectiveDestroyed {by}`. Renderers use these for tracers/flashes/sounds. Later phases use
  them for timeline markers.

### Soldiers & combat
- [ ] Soldier hp/death. Dead soldiers stop stepping and leave a corpse marker in the view.
- [ ] **Soldier flags** the later phases will set (implement the behavior now, set them later):
  `controllable` (live), `interactive` (false for static figures: no collision, can't be hit,
  don't count for anything), `minHp` (lead-in invulnerability per [D5]: damage applies but HP
  is floored).
- [ ] Rifle: hitscan from soldier position along `aim`, fire cooldown, max range, damage. The ray
  stops at the first wall/closed gate/hazard/enemy-side target. **Friendly soldiers are
  transparent to friendly shots** ([D13]).
- [ ] Shots must be expressible as **"fire from (x, y) at angle θ"** (an exported function), because
  echoes will fire recorded shots that way ([E1]). The live soldier's fire input just calls it with
  its current position/aim.
- [ ] Soldier separation per [D14]: tiny blocker radius, soft push-apart (spring-like with a max
  push per tick), never hard-stopping a soldier in a crowd. Hitbox radius used for damage.
  Deterministic: resolve pairs in id order.
- [ ] Interact input: nearest interactable within reach (levers, see below). Edge-triggered.

### Threats ([D15]); all shootable/alterable
- [ ] **Turret:** fixed position, rotates toward the nearest eligible soldier in range with line of
  sight (eligible = alive and `interactive`). Brief wind-up telegraph before each shot (readability),
  then a hitscan shot. No randomness: if it has LOS when it fires, it hits. HP; destroyed turrets
  stay as wrecks (non-blocking).
- [ ] **Mine:** proximity trigger radius → short fuse → blast radius damage (hurts soldiers;
  can also damage hazards/objective, why not). Shooting a mine detonates it.
- [ ] **Traffic lane (frogger):** vehicles spawn on a fixed schedule from tick 0, move along a lane
  at constant speed, and kill soldiers on contact. A vehicle shot enough times is destroyed and
  leaves a **wreck that blocks movement** (a natural interruption source for echoes that used to
  walk through that spot).

### Route-changers ([D16])
- [ ] **Gate + lever:** lever toggles gate open/closed on interact. A closed gate blocks movement
  and shots/LOS.
- [ ] **Drawbridge + lever:** over impassable water/chasm. Raised = impassable; lowered =
  walkable. Raise/lower takes a short time. Soldiers on it when it rises… pick the obvious thing
  (get pushed off to the nearest walkable side) and note it.
- [ ] *(Stretch)* **Destructible bridge:** an explosive charge you shoot; the bridge becomes
  impassable permanently. Anyone on it dies.

### Navigation (used by echoes in 03-a)
- [ ] `world/nav.ts`: a walkability grid derived from static walls + dynamic blockers (closed
  gates, raised bridges, wrecks, live hazards that block). Efficient incremental update when a
  blocker changes. A* (8-connected, no corner cutting) returning a smoothed path. Deterministic
  tie-breaking. Grid cell size in tuning.
- [ ] Query helpers: `isWalkable(pos)`, `findPath(from, to)`, `pathLength(path)`.

### Objective & mission
- [ ] **Objective:** a destructible target with HP (bunker/fuel depot/whatever). Destroying it emits
  `objectiveDestroyed` and sets `world.missionComplete = {tick, by}` ([D17]). (The flag-capture
  objective comes with capture points in 05-a.)
- [ ] `src/content/maps/mission-01.ts`: the first real test mission. Suggested layout, which you
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
- [ ] Unit tests per mechanic (turret LOS/target choice, mine fuse/blast, vehicle schedule +
  wreck blocking, gate blocks LOS, no friendly fire, crowd separation lets a soldier squirm through
  a 10-soldier clump, A* with dynamic blockers).
- [ ] **Scenario tests:** scripted input sequences on `mission-01`, e.g. "walk the road route →
  dies to turret at about t", "shoot turret from cover → turret destroyed".
- [ ] **Determinism:** each scenario run twice → identical world hash every tick.
- [ ] `npm run sim -- --map mission-01 --script <name>` runs a scenario headless and prints events.

## Acceptance
- All mechanics above exist in the headless sim with tests; determinism tests pass.
- The scripted scenario "soldier walks into turret LOS and dies" and "soldier destroys turret
  from cover" both work headless.
- `WorldView` exposes everything 02-b needs to draw every entity and state.

## Notes from implementation
_(append here)_
