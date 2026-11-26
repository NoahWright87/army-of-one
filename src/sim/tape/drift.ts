/**
 * (PHASE19) Drift checks: does the sim agree with the tape (what actually played)? Used at the
 * handoff (the tick the player takes control, logged in dev builds), by `__aoo.checkDrift()`
 * (re-simulates the whole mission from 0:00 and reports the first disagreement), and in tests.
 */
import type { Tuning } from '../../content/tuning';
import type { SoldierRecord } from '../../contracts/mission';
import { Attempt } from '../attempt/attempt';
import { alignToFrame } from './align';
import type { Tape } from './tape';
import type { WorldView } from '../view';
import type { MapDef } from '../world/map';

/** The first difference between what the tape shows and what the sim has, or null. */
export function compareViews(
  tape: WorldView,
  sim: WorldView,
  posTolerance = 0.5,
  /** Don't compare HP (soldiers' and objectives'): "who is alive / destroyed" still is. */
  ignoreHp = false,
): string | null {
  for (const s of tape.soldiers) {
    const r = sim.soldiers.find((x) => x.id === s.id);
    if (!r) return `${s.id} (${s.role}) is missing from the sim`;
    if (r.alive !== s.alive)
      return `${s.id} (${s.role}) tape alive=${s.alive}, sim alive=${r.alive}`;
    const d = Math.hypot(r.x - s.x, r.y - s.y);
    if (s.alive && d > posTolerance) return `${s.id} (${s.role}) is ${d.toFixed(1)} px off`;
    if (!ignoreHp && s.alive && Math.abs(r.hp - s.hp) > 1e-6) {
      return `${s.id} (${s.role}) tape hp ${s.hp.toFixed(1)}, sim hp ${r.hp.toFixed(1)}`;
    }
  }
  for (const o of tape.objectives) {
    const r = sim.objectives.find((x) => x.id === o.id);
    if (!r || r.destroyed !== o.destroyed || (!ignoreHp && Math.abs(r.hp - o.hp) > 1e-6)) {
      return `objective ${o.id} tape hp ${o.hp}, sim hp ${r?.hp}`;
    }
  }
  for (const g of tape.gates) {
    const r = sim.gates.find((x) => x.id === g.id);
    if (!r || r.open !== g.open) return `gate ${g.id} tape open=${g.open}, sim open=${r?.open}`;
  }
  for (const c of tape.capturePoints) {
    const r = sim.capturePoints.find((x) => x.id === c.id);
    if (!r || r.stage !== c.stage) return `flag ${c.id} tape ${c.stage}, sim ${r?.stage}`;
  }
  return null;
}

/**
 * Re-simulates `records` from 0:00 and walks the tape: the first tick where they disagree, with
 * what differs, or null if every frame matches.
 *
 * What this really guarantees: the sim is deterministic, so the same snapshot + records always
 * play out the same. The tape is not "one run from 0:00", though. It is stitched together from
 * runs that started at snapshots of earlier runs, and before control each of those is only
 * *glued* to the tape (`alignToFrame`: every soldier's pose, HP and facing, objectives' HP).
 * Hidden state (enemy AI memory, bullets in flight, recoil) is whatever the run before left, and
 * a live soldier's real physics differs a little from the same soldier replayed as an echo. A
 * fresh run from 0:00 therefore matches the tape's poses to a fraction of a pixel but not its
 * hidden state, and some tuning (a wider near-miss alert, say) turns that into one shot
 * hitting or missing a few seconds later. So `strict` is a diagnostic, not an invariant: use
 * it to find where a replay left the tape, and `firstDrift` (glued) as the test of the guarantee.
 */
export function firstStrictDrift(
  tape: Tape,
  map: MapDef,
  tuning: Tuning,
  records: readonly SoldierRecord[],
): { tick: number; what: string } | null {
  return walkTape(tape, map, tuning, records, false);
}

/**
 * The guarantee the game keeps: a fresh re-simulation from 0:00, glued to the tape at every
 * frame the way every real run is (poses and HP set to the tape's, see `alignToFrame`), never
 * disagrees about anything the glue can't fix. That is: who is alive, which gates are open,
 * every flag's stage, which objectives are destroyed, and a soldier's position after one
 * frame of simulating from the tape's previous pose (more than `posTolerance` px off means the
 * sim and the tape move differently, not just that a bullet landed differently). HP is
 * deliberately not compared, because it is exactly what the glue sets: a hit that lands in the
 * re-sim but not on the tape is absorbed here, and one that matters (it kills) shows up as a
 * disagreement about who is alive.
 */
export function firstDrift(
  tape: Tape,
  map: MapDef,
  tuning: Tuning,
  records: readonly SoldierRecord[],
): { tick: number; what: string } | null {
  return walkTape(tape, map, tuning, records, true);
}

function walkTape(
  tape: Tape,
  map: MapDef,
  tuning: Tuning,
  records: readonly SoldierRecord[],
  glued: boolean,
): { tick: number; what: string } | null {
  const sim = new Attempt({
    map,
    tuning,
    soldiers: records,
    attempt: Number.MAX_SAFE_INTEGER,
    from: { kind: 'start' },
    live: null,
    kind: 'resolve',
  });
  for (const f of tape.all()) {
    while (sim.tick < f.tick && !sim.isOver()) sim.step();
    if (sim.tick !== f.tick) return null;
    const what = compareViews(f.view, sim.view(), 0.5, glued);
    if (what) return { tick: f.tick, what };
    if (glued) alignToFrame(sim.world, f.view);
  }
  return null;
}
