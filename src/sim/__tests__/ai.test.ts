/**
 * (07-d) Enemy soldier AI ([D44]–[D47]): same soldiers, AI-driven, deterministic.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, withTuning } from '../../content/tuning';
import { hashState } from '../core/hash';
import { throwGrenade } from '../entities/grenade';
import { createWorld, getSoldier, getView } from '../sim';
import type { MapDef, SquadDef } from '../world/map';
import { arena, idle, ofKind, run, soldierAt } from './helpers';

const T = DEFAULT_TUNING;

function squadMap(squads: SquadDef[], extra: Partial<MapDef> = {}): MapDef {
  return arena({ squads, ...extra });
}

const guard = (id: string, members: SquadDef['members'], extra: Partial<SquadDef> = {}) => ({
  id,
  members,
  order: { kind: 'guard' as const },
  ...extra,
});

describe('enemy squads ([D44])', () => {
  it('spawn as enemy-team soldiers E1…, with the role, shown as enemies', () => {
    const w = createWorld(
      squadMap([
        guard('sq', [
          { position: { x: 800, y: 500 } },
          { role: 'gunner', position: { x: 850, y: 500 } },
        ]),
      ]),
      T,
    );
    const e = w.state.soldiers.filter((s) => s.team === 'enemy');
    expect(e.map((s) => s.id)).toEqual(['E1', 'E2']);
    expect(e[1]!.roleId).toBe('gunner');
    expect(getView(w).soldiers.filter((s) => s.role === 'enemy')).toHaveLength(2);
  });

  it('ai.enabled false: no enemies', () => {
    const w = createWorld(
      squadMap([guard('sq', [{ position: { x: 800, y: 500 } }])]),
      withTuning(T, { ai: { enabled: false } }),
    );
    expect(w.state.soldiers).toHaveLength(0);
  });

  it('dormant until one of ours comes near; then wakes', () => {
    const w = createWorld(squadMap([guard('sq', [{ position: { x: 900, y: 900 } }])]), {
      ...T,
      ai: { ...T.ai, wakeRadius: 300 },
    });
    soldierAt(w, { x: 100, y: 100 });
    run(w, 60);
    expect(getSoldier(w, 'E1')!.ai!.awake).toBe(false);
    getSoldier(w, 'S1')!.x = 800;
    getSoldier(w, 'S1')!.y = 800;
    run(w, 60);
    expect(getSoldier(w, 'E1')!.ai!.awake).toBe(true);
  });

  it('an enemy rifleman spots, waits its reaction time, then shoots and kills one of ours', () => {
    const w = createWorld(
      squadMap([guard('sq', [{ position: { x: 600, y: 500 }, facing: Math.PI }])]),
      T,
    );
    const id = soldierAt(w, { x: 250, y: 500 });
    const events = run(w, 600, { [id]: idle(0) });
    const shots = ofKind(events, 'shotFired').filter((e) => e.by === 'E1');
    expect(shots.length).toBeGreaterThan(0);
    expect(shots[0]!.tick).toBeGreaterThanOrEqual(Math.round(T.ai.reactionSeconds * 60));
    const s = getSoldier(w, id)!;
    expect(s.alive).toBe(false);
    expect(s.deathCause).toBe('rifle');
  });

  it('their shots pass through each other (no friendly fire) and hit ours', () => {
    const w = createWorld(
      squadMap([
        guard('sq', [
          { position: { x: 700, y: 500 }, facing: Math.PI },
          { position: { x: 600, y: 500 }, facing: Math.PI },
        ]),
      ]),
      T,
    );
    const id = soldierAt(w, { x: 300, y: 500 }, { minHp: 1 });
    const events = run(w, 400, { [id]: idle(0) });
    expect(ofKind(events, 'shotFired').some((e) => e.by === 'E1')).toBe(true);
    expect(getSoldier(w, 'E2')!.hp).toBe(T.soldier.maxHp);
    expect(getSoldier(w, id)!.hp).toBeLessThan(T.soldier.maxHp);
  });

  it('our shots hurt enemy soldiers', () => {
    const w = createWorld(squadMap([guard('sq', [{ position: { x: 600, y: 500 } }])]), {
      ...T,
      ai: { ...T.ai, sightRange: 1 },
    });
    const id = soldierAt(w, { x: 200, y: 500 });
    run(w, 3, { [id]: { ...idle(0), fire: true } });
    expect(getSoldier(w, 'E1')!.hp).toBeLessThan(T.soldier.maxHp);
  });

  it('approaches a target out of range, but not beyond its leash', () => {
    const w = createWorld(
      squadMap([guard('sq', [{ position: { x: 900, y: 500 }, facing: Math.PI }])]),
      {
        ...T,
        ai: { ...T.ai, sightRange: 900 },
        rifle: { ...T.rifle, range: 200 },
      },
    );
    soldierAt(w, { x: 100, y: 500 }, { controllable: false, kinematic: true });
    run(w, 240);
    const e = getSoldier(w, 'E1')!;
    expect(e.x).toBeLessThan(880); // moved toward us
    expect(900 - e.x).toBeLessThanOrEqual(650 + 30); // rifleman leash
  });

  it('a machine gunner under fire runs to nearby cover', () => {
    const map = squadMap(
      [guard('sq', [{ role: 'gunner', position: { x: 600, y: 600 }, facing: Math.PI }])],
      {
        cover: [{ id: 'bags', rect: { x: 500, y: 480, w: 160, h: 26 }, material: 'sandbags' }],
      },
    );
    const w = createWorld(map, T);
    const id = soldierAt(w, { x: 600, y: 250 });
    run(w, 120, { [id]: { ...idle(Math.PI / 2), fire: true } });
    const e = getSoldier(w, 'E1')!;
    expect(e.ai!.behavior === 'cover' || e.y > 500).toBe(true);
    // Ended up behind the bags (below them, the threat is above).
    run(w, 120, { [id]: idle(Math.PI / 2) });
    expect(getSoldier(w, 'E1')!.y).toBeGreaterThan(506);
  });

  it('scatters away from a grenade', () => {
    const w = createWorld(squadMap([guard('sq', [{ position: { x: 600, y: 500 } }])]), T);
    soldierAt(w, { x: 100, y: 100 });
    getSoldier(w, 'E1')!.ai!.awake = true;
    const g = throwGrenade(w, 'S9', { x: 610, y: 505 }, 0, 0);
    g.vx = 0;
    g.vy = 0;
    run(w, 40);
    const e = getSoldier(w, 'E1')!;
    expect(Math.hypot(e.x - 610, e.y - 505)).toBeGreaterThan(60);
  });

  it('retreats when badly outnumbered', () => {
    const w = createWorld(
      squadMap([guard('sq', [{ position: { x: 600, y: 500 } }], { fallback: { x: 900, y: 500 } })]),
      T,
    );
    for (let i = 0; i < 4; i++)
      soldierAt(w, { x: 350, y: 440 + i * 40 }, { controllable: false, kinematic: true, minHp: 1 });
    run(w, 120);
    expect(getSoldier(w, 'E1')!.ai!.behavior).toBe('retreat');
    expect(getSoldier(w, 'E1')!.x).toBeGreaterThan(610);
  });

  it('enemy soldiers retake a capture point that was ours ([D45])', () => {
    const map = squadMap([guard('sq', [{ position: { x: 500, y: 500 } }])], {
      capturePoints: [
        { id: 'cp', nameKey: 'x', position: { x: 500, y: 500 }, initialStage: 'neutral' },
      ],
    });
    const w = createWorld(map, T);
    w.state.capturePoints[0]!.stage = 'ours';
    const events = run(w, 60 * 10);
    const lost = ofKind(events, 'captureStageChanged').filter((e) => e.lost);
    expect(lost.map((e) => e.stage)).toEqual(['neutral', 'enemy']);
  });

  it('is deterministic (same world hash twice)', () => {
    const play = () => {
      const w = createWorld(
        squadMap(
          [
            guard('a', [
              { position: { x: 600, y: 400 } },
              { role: 'gunner', position: { x: 650, y: 450 } },
              { role: 'grenadier', position: { x: 620, y: 520 } },
            ]),
          ],
          { cover: [{ id: 'c', rect: { x: 520, y: 300, w: 160, h: 26 }, material: 'sandbags' }] },
        ),
        T,
      );
      const id = soldierAt(w, { x: 200, y: 500 });
      run(w, 600, { [id]: { move: { x: 0.2, y: 0 }, aim: 0, fire: true, interact: false } });
      return hashState(w.state);
    };
    expect(play()).toBe(play());
  });
});
