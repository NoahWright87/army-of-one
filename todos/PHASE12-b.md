# PHASE12-b: Vehicles (plan; ⛔ armor and cover proposals wait for the owner)

**Goal:** a gun truck and a tank ([D63]): very expensive, very powerful units you buy with the
money from PHASE11 and drive yourself ([D55]). Enemies get them too ([D44]); the Bazooka
(PHASE12-a) is the counter.

**Depends on:** PHASE11 (prices), PHASE12-a (the Bazooka).

## Decided
- [D63] gun truck + tank. [D64] compass controls with vehicle turning (tank turns on the spot;
  truck only turns while rolling). [D65] small arms do very little, through one unified armor
  system. [D66] run-over damage from speed × weight, ours included. [D67] wrecks block paths.
  [D68] vehicles capture points (setting). [D69] longer levels.

## Proposal: unified armor ([Q39]) ⛔
One rule for every damage taker (soldiers, vehicles, turrets, cover, objectives):

    damage taken = max(hit − armor, hit × chip)

- `armor` is a flat number per target, from its role/vehicle/material. Optionally a higher
  `frontArmor` over a `frontArc` (the Shield's 135°, a tank's glacis).
- `chip` (e.g. 5 %, one tuning value) always gets through, so small arms do *very little*,
  not nothing ([D65]).
- No weapon tags or tables: a weapon's "penetration" is just its damage per hit. Big single hits
  (sniper 80, rocket 400 to vehicles, tank shell, a crush) punch through; many small hits
  (pistol 15, MG 14, pellets 14, fragments) mostly bounce.
- First numbers (TUNE): soldiers 0, Shotgunner 3, Shield front 20 (replaces the 80 % rule:
  pistols bounce off, a rifle does 20 %, a sniper still does 75 %), truck 10, tank 35 / front
  50, fence 0, sandbags 12, crate 15, half wall 25, bunker and walls unbreakable.
- Run-over damage ([D66]) = weight × speed² (TUNE), through the target's armor like any hit, so
  a slow truck bump does nothing to a soldier but a fast one hurts, and a slow tank still
  crushes because it's so heavy.

## Proposal: breakable cover ([Q40]) ⛔
- Cover pieces get HP and armor by material. A bullet stopped by cover damages it; blasts
  damage cover in their radius; a vehicle driving into cover hits it with run-over damage.
- A destroyed piece is gone (rubble drawn, no longer blocks movement, shots or sight) for the
  rest of that attempt. Because the sim is deterministic, it's destroyed again in every replay
  that does the same thing; if history changes, it may stand, and echoes that walked through
  the gap may be interrupted ([D24]). That's the timeline working, not a bug.
- Walls, bunker walls and the map edge stay unbreakable.

## Build plan (once the proposals are approved)
- Vehicle units: `VehicleRole` defs (truck, tank) next to `roles.ts`, priced ([D51]); the
  live/echo/AI unit is the same entity as a soldier with a bigger body (hitbox, wall radius),
  hull heading + turret aim, speed with acceleration and turn rate. Recorded like soldiers
  (pose + hull/turret facing, shots).
- Controls ([D64]): the move stick is a desired compass direction; tank: rotate toward it,
  throttle up once within ~30°; truck: turn rate scales with speed, a minimum crawl speed while
  turning. Turret follows the aim at its own turn rate. Touch: same sticks.
- Weapons: truck MG on the turret (the MG's stats, no mount needed); tank cannon (aim wind-up
  like the Bazooka, a shell with a blast) + a coaxial MG (TBD).
- Run-over ([D66]), wrecks as blockers ([D67]), capture setting ([D68]).
- Enemy vehicles: AI drives them (paths for big bodies need a coarser nav or clearance).
- A longer level ([D69], [Q42]).
