# PHASE12-a: More roles: Sniper, Shield, Shotgunner, Bazooka

**Goal:** four new soldier types before vehicles ([D59]–[D62]), each with a clear job and a clear
weakness. Same soldiers for us and the enemy AI ([D44]).

**Depends on:** PHASE11 (prices). **Before:** PHASE12-b (vehicles: the Bazooka is the counter).

## Tasks
- [x] Roles in `roles.ts` (prices, AI personalities), `RoleId`, strings, respawn picker keys 1–7.
- [x] Per-role HP and speed (`tuning.roleStats`): Shotgunner 1.5× HP, Shield 1.2× HP and 0.9×
  speed, Bazooka 0.8× speed.
- [x] **Sniper** ([D59]): pistol while moving; standing still for `sniper.setupSeconds` raises
  the rifle (no cover needed); braced on cover and firing across it, tighter spread and more
  range. Bad auto-aim and AI aim against moving targets with the rifle. The camera looks further
  ahead with the rifle up.
- [x] **Shield** ([D60]): blocks `shield.block` (80 %) of damage from the 135° it faces; pistol.
- [x] **Shotgunner** ([D61]): `pellets` hitscan pellets per shot at hashed angles, damage falling
  off with distance, short range. Each pellet is recorded as its own shot.
- [x] **Bazooka** ([D62]): hold fire to aim (`rocket.aimSeconds`), then a rocket flies and
  explodes on contact or at full range; the blast hurts everyone (friendly fire) and wrecks
  vehicles. Very inaccurate against people for AI and auto-aim; auto-aim goes for vehicles first.
- [x] Recordings: shot actions carry `gun` when it isn't a plain rifle/MG shot (pistol, sniper,
  shotgun pellet, rocket), so echoes replay the same weapon. Older recordings are unchanged.
- [x] Renderer: role badges, rockets, rocket blasts; set-up / aim ring around the reticle.
- [x] Tests: `sim/__tests__/roles-12a.test.ts`, auto-aim, codec.

## Notes from implementation
- **Weapons.** `GunKind` is now rifle | mg | pistol | sniper | shotgun (`guns.ts`); `gunOf(s,
  tuning)` returns the gun in hand (a Sniper's depends on its set-up). Rockets are their own
  entity (`entities/rocket.ts`, `state.rockets`, ids `R…`, reserved in `validateMap`).
- **Sniper set-up** reuses the MG's `mountTicks`/`braceId`. It isn't interrupted by firing;
  while it fills the Sniper still fires its pistol. The cover range bonus is worked out from the
  shooter's position and angle (`gunRange`), so echoes get the same range without state.
- **Shield.** `damageSoldier` takes the damage's source point (a shot's origin, a blast's
  centre). Contact damage (cars, a collapsing bridge) has no source, so no block.
  `shield.blocksExplosions` (default on, [Q36]) decides whether blasts in front are blocked.
  The Shield protects others only by standing in the way: shots stop at the first soldier.
- **Shotgun.** Pellet `i` of a shot rolls cover with key `S@tick:p<i>`; an echo fires its
  recorded pellets in order with the same keys, so cover rolls match ([E10]).
- **Rocket.** Passes through its own side (no direct friendly hit), stops on walls, cover (by
  the bullet roll), enemies, vehicles, turrets, objectives. Blast: soldiers (everyone),
  vehicles (`vehicleDamage`), objectives; turrets, mines and charges only for our rockets.
  Manual aim uses the rocket's own spread whatever the target ("inaccurate against people" is
  AI/auto-aim aim error, [Q37]).
- AI: weapon range by role; a Sniper engages standing still, so it sets up; it only fires its
  pistol at pistol range. Shotgunners close in; Bazookas don't fire onto their own squad.
- Not done: no placeholder art beyond badge colours; no autoplay stories for the new roles.
