/**
 * (06-b) Reveal perf: 100 soldiers × 2 min of lossless recordings on mission-01. Prints the
 * numbers (see PHASE06-b notes); asserts loose bounds so slow CI machines don't flake.
 */
import { describe, expect, it } from 'vitest';
import { MISSION_01 } from '../../content/maps/mission-01';
import { DEFAULT_TUNING } from '../../content/tuning';
import type { LaneFate, LaneTruth, SoldierRecord, Waypoint } from '../../contracts/mission';
import { createRng, nextFloat } from '../../sim/core/rng';
import { secondsToTicks } from '../../sim/core/time';
import { knownThings, RevealGrid, revealOptions } from '../reveal';
import { applyObservation } from '../truth';

const N = 100;
const LIFE = secondsToTicks(120);

/** A soldier wandering at walking speed with random heading changes, one waypoint per tick. */
function wanderer(n: number, rng: ReturnType<typeof createRng>): SoldierRecord {
  const sp = MISSION_01.spawnPoints[n % MISSION_01.spawnPoints.length]!;
  const start = (n % 20) * 120;
  let x = sp.position.x;
  let y = sp.position.y;
  let heading = nextFloat(rng) * Math.PI * 2;
  const v = DEFAULT_TUNING.soldier.speed / 60;
  const wps: Waypoint[] = [];
  for (let t = start; t <= start + LIFE; t++) {
    if (t % 90 === 0) heading += (nextFloat(rng) - 0.5) * 2;
    x = Math.max(50, Math.min(MISSION_01.width - 50, x + Math.cos(heading) * v));
    y = Math.max(50, Math.min(MISSION_01.height - 50, y + Math.sin(heading) * v));
    wps.push({ t, x, y, facing: heading });
  }
  return {
    id: `S${n}`,
    ordinal: n,
    spawnPointId: sp.id,
    spawnTick: start,
    segments: [
      { startTick: start, endTick: start + LIFE, waypoints: wps, actions: [], endReason: 'death' },
    ],
  };
}

const ms = (t0: bigint) => Number(process.hrtime.bigint() - t0) / 1e6;

describe('reveal perf', () => {
  it(`full recompute for ${N} soldiers × 2 min, then incremental`, () => {
    const rng = createRng(42);
    const soldiers = Array.from({ length: N }, (_, i) => wanderer(i + 1, rng));
    const fates: Record<string, LaneFate> = {};
    for (const s of soldiers) fates[s.id] = { kind: 'static', tick: s.segments[0]!.endTick };
    const toTick = Math.max(...soldiers.map((s) => s.segments[0]!.endTick));
    let lanes: LaneTruth[] = applyObservation([], soldiers, {
      kind: 'attempt',
      attempt: 1,
      fromTick: 0,
      toTick,
      lanes: fates,
      markers: [],
      endReason: 'death',
    }).lanes;
    const opts = revealOptions(DEFAULT_TUNING);

    // Warm up the JIT, then time the best of a few runs.
    let full = Infinity;
    let grid!: RevealGrid;
    for (let i = 0; i < 5; i++) {
      const t0 = process.hrtime.bigint();
      grid = new RevealGrid(MISSION_01, opts);
      grid.update(soldiers, lanes);
      full = Math.min(full, ms(t0));
    }

    // One soldier now dies at 30 s (a typical scrubber step changes a few lanes).
    lanes = applyObservation(lanes, soldiers, {
      kind: 'resolve',
      attempt: 2,
      fromTick: 0,
      toTick,
      lanes: {
        S7: { kind: 'died', tick: soldiers[6]!.spawnTick + secondsToTicks(30), cause: 'x' },
      },
      markers: [],
      endReason: 'resolved',
    }).lanes;
    const t1 = process.hrtime.bigint();
    const changed = grid.update(soldiers, lanes);
    const incremental = ms(t1);
    const t2 = process.hrtime.bigint();
    knownThings(MISSION_01, grid, soldiers, lanes);
    const known = ms(t2);

    let occluded = Infinity;
    for (let i = 0; i < 3; i++) {
      const t3 = process.hrtime.bigint();
      new RevealGrid(MISSION_01, { ...opts, occludeByWalls: true }).update(soldiers, lanes);
      occluded = Math.min(occluded, ms(t3));
    }

    console.log(
      `[reveal perf] ${N} soldiers × 2 min, ${grid.cols}×${grid.rows} cells: full ${full.toFixed(2)} ms, ` +
        `incremental (1 lane) ${incremental.toFixed(2)} ms, knownThings ${known.toFixed(2)} ms, ` +
        `full with occludeByWalls ${occluded.toFixed(2)} ms; revealed ${(grid.fraction * 100).toFixed(0)}%`,
    );
    expect(changed).toBe(1);
    expect(full).toBeLessThan(50);
    expect(incremental).toBeLessThan(10);
  });
});
