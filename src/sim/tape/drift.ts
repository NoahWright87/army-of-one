/**
 * (PHASE19) Drift checks: does the sim agree with the tape (what actually played)? Used at the
 * handoff (the tick the player takes control, logged in dev builds), by `__aoo.checkDrift()`
 * (re-simulates the whole mission from 0:00 and reports the first disagreement), and in tests.
 */
import type { Tuning } from '../../content/tuning';
import type { SoldierRecord } from '../../contracts/mission';
import { Attempt } from '../attempt/attempt';
import type { Tape } from './tape';
import type { WorldView } from '../view';
import type { MapDef } from '../world/map';

/** The first difference between what the tape shows and what the sim has, or null. */
export function compareViews(tape: WorldView, sim: WorldView, posTolerance = 0.5): string | null {
  for (const s of tape.soldiers) {
    const r = sim.soldiers.find((x) => x.id === s.id);
    if (!r) return `${s.id} (${s.role}) is missing from the sim`;
    if (r.alive !== s.alive)
      return `${s.id} (${s.role}) tape alive=${s.alive}, sim alive=${r.alive}`;
    const d = Math.hypot(r.x - s.x, r.y - s.y);
    if (s.alive && d > posTolerance) return `${s.id} (${s.role}) is ${d.toFixed(1)} px off`;
    if (s.alive && Math.abs(r.hp - s.hp) > 1e-6) {
      return `${s.id} (${s.role}) tape hp ${s.hp.toFixed(1)}, sim hp ${r.hp.toFixed(1)}`;
    }
  }
  for (const o of tape.objectives) {
    const r = sim.objectives.find((x) => x.id === o.id);
    if (!r || r.destroyed !== o.destroyed || Math.abs(r.hp - o.hp) > 1e-6) {
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
 */
export function firstDrift(
  tape: Tape,
  map: MapDef,
  tuning: Tuning,
  records: readonly SoldierRecord[],
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
    const what = compareViews(f.view, sim.view());
    if (what) return { tick: f.tick, what };
  }
  return null;
}
