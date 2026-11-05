# PHASE12: Vehicles and heavy units (sketch)

**Goal:** very expensive, very powerful units you buy with the money from PHASE11. A vehicle
may look like a crew, but it's just you driving it ([D55]).

**Depends on:** PHASE11 (prices). Flesh out once PHASE11 lands.

## Direction
- A vehicle is a purchasable unit like a role: one live unit, bigger body and hitbox, much more
  HP, its own weapons, its own controls. It records and replays like a soldier ([E1]): timed
  waypoints with facing (hull + turret), recorded shots.
- AI threat values are already in place for this (`roles.ts` → `ai.threat`, PHASE07-d notes):
  enemies should fear a tank. Enemy tanks reuse the same unit with an AI brain ([D44]).
- Bigger bodies stress echo playback: a tank shoved off schedule, or a tank as a blocker for an
  echo's path ([D14], [E8]). Needs tests like the soldier separation ones.
- Cover vs vehicles: does a tank crush fences/sandbags? Does cover stop tank shells?

## ⛔ Decisions needed first
- Which vehicles first (a tank? a jeep? a mortar team as a "heavy unit"?), and their weapons.
- Controls: tank-style (hull turns, turret aims at the cursor) or twin-stick like a soldier?
  On touch?
- Can a vehicle capture points? Can it be repaired? Does it leave a wreck that blocks paths?
- Splash damage to our own soldiers (grenades already hurt our side, [D37])?
