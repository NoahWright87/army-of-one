/**
 * (PHASE21, step 2) Enemy hearing and heat ([D161], [Q71]).
 *
 * The sim already says what happened (`shotFired`, `bulletStopped`, `damaged`, explosions…).
 * Here each of those becomes a *sound* at a place with a kind, and every AI soldier within that
 * kind's audible range hears it (the louder and closer, the more it counts). Hearing gives a
 * direction rather than a spot: the guessed place is off by a bearing error that grows with
 * distance. What a soldier hears, and what it sees, raises its *heat*: suspicion that fades over
 * time. Heat is what wakes a dormant soldier, sends an idle one to investigate, and (very high)
 * alarms its squad. A lone distant shot barely registers; more, closer fire adds up.
 *
 * Pure sim code: deterministic (integer ticks, hashed rolls, stable id order), no randomness.
 */
import { roleDef } from '../../content/roles';
import { meters, toMeters } from '../../content/units';
import { hash01 } from '../core/hash';
import { secondsToTicks, type Tick } from '../core/time';
import { distance, type Vec2 } from '../core/vec';
import type { SimEvent } from '../events';
import { teamOf, type SoldierState, type SoldierTeam } from '../entities/soldier';
import { soldierIndex } from '../soldier-index';
import type { World } from '../state';

/** What makes a noise. One tuning row each (`tuning.senses.sounds`). */
export type SoundKind =
  | 'rifle'
  | 'mg'
  | 'pistol'
  | 'sniper'
  | 'shotgun'
  | 'rocket'
  | 'shell'
  | 'explosion'
  | 'impact'
  | 'shout';

export const SOUND_KINDS: readonly SoundKind[] = [
  'rifle',
  'mg',
  'pistol',
  'sniper',
  'shotgun',
  'rocket',
  'shell',
  'explosion',
  'impact',
  'shout',
];

export interface Sound {
  kind: SoundKind;
  x: number;
  y: number;
  /** Who made it (never hears itself), if a soldier. */
  by?: string;
  /** Whose side made it; 'none': nobody's (a mine). */
  team: SoldierTeam | 'none';
}

/** Plain-data heat on a soldier (rides in `AiState`, so snapshots carry it). */
export interface HeatState {
  /** Heat at `tick` (0..1); it fades from there. */
  value: number;
  tick: Tick;
  /** It reacts to what it has heard from this tick on (not before: nobody reacts instantly). */
  reactAt?: Tick;
  /** Where the latest sound seemed to come from (a guess), and whether it has acted on it. */
  spot?: { x: number; y: number; tick: Tick; used: boolean };
}

/** Heat right now (it decays linearly, `senses.heat.decayPerSecond`). */
export function heatNow(world: World, heat: HeatState | undefined, tick: Tick): number {
  if (!heat) return 0;
  const decay = world.tuning.senses.heat.decayPerSecond;
  return Math.max(0, heat.value - (decay * (tick - heat.tick)) / 60);
}

/** The sounds in a tick's events, in event order. */
export function soundsOf(world: World, events: readonly SimEvent[]): Sound[] {
  const out: Sound[] = [];
  let idx: ReturnType<typeof soldierIndex> | null = null;
  const soldier = (id: string | undefined) => {
    if (!id) return undefined;
    idx ??= soldierIndex(world.state.soldiers);
    return idx.get(id);
  };
  // Things that aren't soldiers (turrets, mines) are the enemy's, unless it says otherwise.
  const teamOfShooter = (id: string | undefined): SoldierTeam => {
    const s = soldier(id);
    return s ? teamOf(s) : 'enemy';
  };
  for (const e of events) {
    switch (e.kind) {
      case 'shotFired': {
        const by = soldier(e.by);
        // The weapon it was actually fired with (a Sniper's pistol is quieter than its rifle).
        const w = e.weapon ?? (by ? roleDef(by.roleId).weapon : 'rifle');
        const kind: SoundKind = w === 'grenade' ? 'rifle' : w;
        if (kind === 'rocket' || kind === 'shell') break; // the launch has its own event
        out.push({ kind, x: e.fromX, y: e.fromY, by: e.by, team: teamOfShooter(e.by) });
        break;
      }
      case 'rocketLaunched':
        out.push({
          kind: e.shell ? 'shell' : 'rocket',
          x: e.fromX,
          y: e.fromY,
          by: e.by,
          team: teamOfShooter(e.by),
        });
        break;
      case 'bulletStopped':
        out.push({ kind: 'impact', x: e.x, y: e.y, by: e.by, team: teamOfShooter(e.by) });
        break;
      case 'grenadeExploded':
      case 'rocketExploded':
        out.push({ kind: 'explosion', x: e.x, y: e.y, by: e.by, team: teamOfShooter(e.by) });
        break;
      case 'mineDetonated':
        out.push({ kind: 'explosion', x: e.x, y: e.y, team: 'none' });
        break;
      case 'damaged':
      case 'soldierDied': {
        // A cry: a friend hurt or killed calls out where it is.
        const id = e.kind === 'damaged' ? e.target : e.id;
        const s = soldier(id);
        if (s && s.ai) out.push({ kind: 'shout', x: s.x, y: s.y, by: s.id, team: teamOf(s) });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Shouts are heard by the shouter's own side; everything else by the other one (and mines by all). */
function suspicious(sound: Sound, hearer: SoldierState): boolean {
  if (sound.by === hearer.id) return false;
  if (sound.kind === 'shout') return sound.team === teamOf(hearer);
  return sound.team === 'none' || sound.team !== teamOf(hearer);
}

function salt(world: World): string {
  return world.map.aiSeed !== undefined ? `${world.map.aiSeed}/` : '';
}

/**
 * Adds heat to `ai` (capped at 1) and notes where it seemed to come from. `react`: it will act on
 * what it heard after `senses.reactSeconds` (what it sees, it reacts to through perception).
 */
export function addHeat(
  world: World,
  ai: { heat?: HeatState },
  gain: number,
  tick: Tick,
  spot?: Vec2,
  react = true,
): void {
  const t = world.tuning.senses;
  const prev = ai.heat;
  const reactAt =
    prev?.reactAt !== undefined && prev.reactAt > tick
      ? prev.reactAt
      : react
        ? tick + Math.max(1, secondsToTicks(t.reactSeconds))
        : undefined;
  const keepSpot = spot ? { x: spot.x, y: spot.y, tick, used: false } : prev?.spot;
  ai.heat = {
    value: Math.min(1, heatNow(world, prev, tick) + gain),
    tick,
    ...(reactAt !== undefined ? { reactAt } : {}),
    ...(keepSpot ? { spot: keepSpot } : {}),
  };
}

/**
 * Everything AI soldiers hear this tick: `events` are last tick's (as `stepAi` is given them).
 * Each hearer gets heat (and a guess where it came from) in proportion to how loud and close.
 */
export function listen(world: World, events: readonly SimEvent[]): void {
  const t = world.tuning.senses;
  if (!t.enabled || events.length === 0) return;
  const sounds = soundsOf(world, events);
  if (sounds.length === 0) return;
  const tick = world.state.tick;
  for (const s of world.state.soldiers) {
    const ai = s.ai;
    if (!ai || !s.alive) continue;
    for (const sound of sounds) {
      if (!suspicious(sound, s)) continue;
      const row = t.sounds[sound.kind];
      const reach = meters(row.audibleMeters * t.hearingScale);
      const d = distance(s, sound);
      if (d >= reach) continue;
      const gain = row.heat * (1 - d / reach);
      // A direction, not a place: the farther, the worse the guess.
      const err = Math.min(
        t.bearingErrorMax,
        t.bearingErrorBase + t.bearingErrorPerMeter * toMeters(d),
      );
      const roll = hash01(`${salt(world)}${s.id}@${tick}:${sound.kind}:hear`) * 2 - 1;
      const bearing = Math.atan2(sound.y - s.y, sound.x - s.x) + roll * err;
      addHeat(world, ai, gain, tick, {
        x: s.x + Math.cos(bearing) * d,
        y: s.y + Math.sin(bearing) * d,
      });
    }
  }
}

/** Seeing opposition raises heat too (`senses.heat.seenPerThink` each, per foe in view). */
export function noteSeen(world: World, ai: { heat?: HeatState }, foes: number): void {
  const t = world.tuning.senses;
  if (!t.enabled || foes <= 0) return;
  addHeat(world, ai, t.heat.seenPerThink * foes, world.state.tick, undefined, false);
}

/** How worked up a soldier looks, for the renderer ("?" / "!" / "!!", and its chatter). */
export type AlertLevel = 1 | 2 | 3;

/**
 * What a soldier is showing: 1 uneasy (heard or half-saw something), 2 contact (has a foe in
 * view now), 3 alarm (so much heat its squad is up). Undefined: calm. Read-only (the view).
 */
export function alertOf(
  world: World,
  s: SoldierState,
  ai: { heat?: HeatState; targetId: string | null; lastSeen: { tick: Tick } | null },
): AlertLevel | undefined {
  if (!s.alive) return undefined;
  const t = world.tuning.senses;
  const tick = world.state.tick;
  const h = heatNow(world, ai.heat, tick);
  if (h >= t.heat.alarm) return 3;
  if (ai.targetId && ai.lastSeen && tick - ai.lastSeen.tick <= secondsToTicks(t.contactSeconds)) {
    return 2;
  }
  return h >= t.heat.uneasy ? 1 : undefined;
}
