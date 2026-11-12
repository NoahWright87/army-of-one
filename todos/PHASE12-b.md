# PHASE12-b: Vehicles, unified armor, breakable cover, a long mission

**Goal:** a gun truck and a tank ([D63]): very expensive, very powerful units you buy with the
money from PHASE11 and drive yourself ([D55]). Enemies get them too ([D44]); the Bazooka
(PHASE12-a) is the counter. Built on one armor rule for everything ([D70]) and breakable cover
([Q40]), with a long new mission to show them off ([D69]).

**Depends on:** PHASE11 (prices), PHASE12-a (the Bazooka).

## Tasks
- [x] **Unified armor** (`src/sim/combat/armor.ts`, `tuning.armor`): percentage armor by
  direction (front / side / rear arcs), pierce by damage kind ([D70]). Replaces the Shield's
  special case. Grenade blast 50 % pierce, shrapnel 0 % and longer reach ([D71]). A ricochet cue
  when armor eats most of a hit.
- [x] **Breakable cover** ([Q40]): HP + armor per material (`tuning.cover.materials`); shots it
  stops, blasts, and vehicles pushing into it damage it; destroyed pieces stop blocking
  movement, shots and sight (`standingCover`, `state.coverDestroyed`) and are drawn as rubble.
  Windows and bunker slits are unbreakable.
- [x] **Vehicles** as roles `truck` / `tank` (`roles.ts`, `tuning.drive`): compass controls with
  vehicle turning ([D64]: the tank turns on the spot and throttles up once aligned; the truck
  rolls at a crawl to turn), reverse when pulling back ([D72]), a turret that turns at its own
  rate. Truck: turret MG. Tank: a slow cannon (`tuning.shell`, a shell like the Bazooka's
  rocket, [D72]).
- [x] **Run over / ram** ([D66], `entities/run-over.ts`): weight × speed, 100 % pierce, ours
  too; ramming a vehicle hurts the rammer; vehicles batter through breakable cover.
- [x] **Wrecks block** movement and shots ([D67]). **Capture** behind `drive.canCapture` ([D68]).
- [x] Recorded and replayed like soldiers: the hull heading is the waypoint facing, shots
  (MG, `gun: 'shell'`) are actions; an echo's turret follows its shots.
- [x] **Enemy vehicles** (AI drives them; holds fire until the turret is on target). The AI and
  auto-aim prefer targets their weapon can hurt (`damageShare`, `WORTH_SHOOTING`).
- [x] **Mission 5 "Armored Push"** (`mission-05.ts`, [D69]): 1800 × 12000, four capture points
  with forward spawns, every enemy role, trucks and tanks, two gates, a river with two bridges.
- [x] Tests: `armor`, `cover-break`, `vehicles`, `mission-05`, auto-aim.

## Notes from implementation
- A vehicle is a `SoldierState` with `drive` (speed, turret, run-over memory). `facing` is the
  hull. Radii: `wallRadiusOf` / `hitRadiusOf`; separation treats a vehicle as kinematic against
  soldiers (it pushes, isn't pushed) and lets two vehicles push each other.
- Run-over speed is what the vehicle actually moved this tick (echoes crush exactly like the live
  drive); pushing into cover uses the speed it's trying to go, so it can batter through.
- Armor numbers are in `tuning.armor.roles`; pierce in `tuning.armor.pierce` keyed by damage
  kind (the death cause, or `fragment` for shrapnel). Turrets, objectives and traffic cars have
  no armor (unchanged). Traffic cars' contact damage now goes through armor (`vehicle` pierce 0).
- Not done / next: placeholder vehicle art (boxes); vehicle-aware pathfinding (big bodies use the
  soldier nav grid, and the nav grid doesn't open up when cover is destroyed, [Q44]); scripted
  autoplay stories for Mission 5; tuning by play.
