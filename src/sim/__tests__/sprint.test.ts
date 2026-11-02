/**
 * (07-e) Sprint ([D49]) and the AI's moving-target penalty ([D50]).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { createWorld, getSoldier } from '../sim';
import { Attempt } from '../attempt/attempt';
import { addSegment, recordedTo } from '../recording/records';
import { arena, CLASSIC_TUNING, idle, ofKind, run, soldierAt, world } from './helpers';

const T = DEFAULT_TUNING;
const sprintRight = { move: { x: 1, y: 0 }, aim: 0, fire: false, interact: false, sprint: true };

describe('sprint ([D49])', () => {
  it('is faster than walking by sprintMultiplier', () => {
    const w = world(arena());
    const a = soldierAt(w, { x: 100, y: 300 });
    const b = soldierAt(w, { x: 100, y: 600 });
    run(w, 60, { [a]: sprintRight, [b]: { ...sprintRight, sprint: false } });
    const da = getSoldier(w, a)!.x - 100;
    const db = getSoldier(w, b)!.x - 100;
    expect(da / db).toBeCloseTo(T.soldier.sprintMultiplier, 1);
  });

  it('no firing while sprinting; standing with sprint held still fires', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 100, y: 500 });
    expect(ofKind(run(w, 30, { [id]: { ...sprintRight, fire: true } }), 'shotFired')).toHaveLength(
      0,
    );
    expect(
      ofKind(run(w, 30, { [id]: { ...idle(0), fire: true, sprint: true } }), 'shotFired').length,
    ).toBeGreaterThan(0);
  });

  it('a sprinting life replays as an echo on schedule (same end position)', () => {
    const map = arena();
    const live = new Attempt({
      map,
      tuning: CLASSIC_TUNING,
      soldiers: [],
      attempt: 1,
      from: { kind: 'start' },
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0 },
    });
    for (let i = 0; i < 120; i++) {
      live.step({ ...sprintRight, move: { x: 1, y: i < 60 ? 0.3 : -0.3 } });
    }
    const end = { x: live.liveSoldier()!.x, y: live.liveSoldier()!.y };
    const res = live.finish('suspended');
    const records = addSegment([], { soldierId: 'S1', spawnPointId: 'a' }, res.liveSegment!);
    const replay = new Attempt({
      map,
      tuning: CLASSIC_TUNING,
      soldiers: records,
      attempt: 2,
      from: { kind: 'start' },
      live: null,
    });
    const divergences = [];
    while (replay.tick < recordedTo(records[0]!)) {
      const r = replay.step();
      divergences.push(...ofKind(r.events, 'echoDivergence'));
    }
    const echo = getSoldier(replay.world, 'S1')!;
    expect(echo.x).toBeCloseTo(end.x, 3);
    expect(echo.y).toBeCloseTo(end.y, 3);
    expect(replay.echoes.echo('S1')?.mode).not.toBe('interrupted');
    expect(divergences).toHaveLength(0);
  });
});

describe('AI vs moving targets ([D50])', () => {
  /** Share of an enemy rifleman's shots that hit a target moving at `move` (0 = still). */
  function hitRate(move: number, sprint: boolean): number {
    const w = createWorld(
      arena({
        squads: [
          {
            id: 'sq',
            members: [{ position: { x: 800, y: 500 }, facing: Math.PI }],
            order: { kind: 'guard' },
          },
        ],
      }),
      { ...T, ai: { ...T.ai, aimError: 0, sprints: false } },
    );
    const id = soldierAt(w, { x: 450, y: 150 }, { minHp: 1 });
    let shots = 0;
    let hits = 0;
    let dir = 1;
    for (let i = 0; i < 1800; i++) {
      const s = getSoldier(w, id)!;
      if (s.y > 850) dir = -1;
      if (s.y < 150) dir = 1;
      const evs = run(w, 1, {
        [id]: { move: { x: 0, y: dir * move }, aim: 0, fire: false, interact: false, sprint },
      });
      for (const e of ofKind(evs, 'shotFired')) {
        if (e.by !== 'E1') continue;
        shots++;
        if (e.hitId === id) hits++;
      }
    }
    return shots ? hits / shots : 0;
  }

  it('hits a still target more often than a walking one, and a walking one more than a sprinter', () => {
    const still = hitRate(0, false);
    const walking = hitRate(1, false);
    const sprinting = hitRate(1, true);
    expect(still).toBeGreaterThan(walking);
    expect(walking).toBeGreaterThan(sprinting);
  });
});
