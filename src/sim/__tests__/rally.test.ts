/**
 * (PHASE13) Rally points ([Q54]): idle squads wander between them (even asleep), spread out on
 * arrival, go to help, and retreat to them; retreating depends on position as well as health.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { bestRallyPoint, coveredFrom } from '../ai/brain';
import { hashState } from '../core/hash';
import type { Vec2 } from '../core/vec';
import { soldierMaxHp } from '../entities/soldier';
import { createWorld, getSoldier } from '../sim';
import type { MapDef, SquadDef } from '../world/map';
import { arena, idle, run, soldierAt } from './helpers';

const T = DEFAULT_TUNING;
const CORNERS: Vec2[] = [
  { x: 250, y: 250 },
  { x: 750, y: 250 },
  { x: 750, y: 750 },
  { x: 250, y: 750 },
];

function rallySquad(
  id: string,
  members: SquadDef['members'],
  rally: Vec2[],
  extra: Partial<SquadDef> = {},
): SquadDef {
  return { id, members, order: { kind: 'guard' }, rally, ...extra };
}

const at = (p: Vec2, dx = 0, dy = 0) => ({ position: { x: p.x + dx, y: p.y + dy } });

function enemies(w: ReturnType<typeof createWorld>) {
  return w.state.soldiers.filter((s) => s.team === 'enemy');
}

describe('rally points: idle roaming ([Q54])', () => {
  it('a squad wanders between its points while asleep (nobody of ours anywhere near)', () => {
    const map: MapDef = arena({
      squads: [rallySquad('sq', [at(CORNERS[0]!), at(CORNERS[1]!), at(CORNERS[2]!)], CORNERS)],
    });
    const w = createWorld(map, T);
    const visited = new Map<string, Set<number>>();
    const start = enemies(w).map((s) => ({ x: s.x, y: s.y }));
    for (let sec = 0; sec < 60; sec++) {
      run(w, 60);
      for (const s of enemies(w)) {
        expect(s.ai!.awake).toBe(false);
        CORNERS.forEach((c, i) => {
          if (Math.hypot(s.x - c.x, s.y - c.y) < 140) {
            const v = visited.get(s.id) ?? new Set<number>();
            v.add(i);
            visited.set(s.id, v);
          }
        });
      }
    }
    const moved = enemies(w).filter((s, i) => Math.hypot(s.x - start[i]!.x, s.y - start[i]!.y) > 1);
    expect(moved.length).toBeGreaterThan(0);
    // Riflemen float: at least one of them has been to two or more points in a minute.
    expect(Math.max(...[...visited.values()].map((v) => v.size))).toBeGreaterThanOrEqual(2);
  });

  it('settling at a point, soldiers spread out instead of stacking', () => {
    const p = { x: 500, y: 500 };
    const map: MapDef = arena({
      squads: [
        rallySquad(
          'sq',
          [at(p, -30), at(p, 30), at(p, 0, -30), at(p, 0, 30)].map((m) => ({
            ...m,
            role: 'gunner' as const,
          })),
          [p, { x: 520, y: 480 }],
        ),
      ],
    });
    const w = createWorld(map, T);
    run(w, 60 * 40);
    const es = enemies(w);
    let closest = Infinity;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        closest = Math.min(closest, Math.hypot(es[i]!.x - es[j]!.x, es[i]!.y - es[j]!.y));
      }
    }
    expect(closest).toBeGreaterThan(T.ai.roamSpacing * 0.5);
  });

  it('goes to help where its side is under attack, sprinting', () => {
    const a = { x: 200, y: 500 };
    const b = { x: 800, y: 500 };
    const map: MapDef = arena({
      squads: [rallySquad('sq', [at(a), at(b)], [a, b])],
    });
    const w = createWorld(map, T);
    run(w, 30);
    const hurt = getSoldier(w, 'E1')!;
    hurt.ai!.hurtTick = w.state.tick; // someone at A just got hit
    run(w, 60);
    const helper = getSoldier(w, 'E2')!;
    expect(helper.ai!.roamIdx).toBe(0);
    expect(helper.ai!.reinforce).toBe(true);
    expect(helper.x).toBeLessThan(b.x - 20);
  });

  it('is deterministic', () => {
    const make = () => {
      const w = createWorld(
        arena({
          squads: [
            rallySquad(
              'sq',
              [at(CORNERS[0]!), at(CORNERS[1]!), { ...at(CORNERS[2]!), role: 'truck' as const }],
              CORNERS,
            ),
          ],
        }),
        T,
      );
      run(w, 60 * 30);
      return hashState(w.state);
    };
    expect(make()).toBe(make());
  });
});

describe('rally points: retreat ([Q54])', () => {
  it('falls back to the point away from our soldiers', () => {
    const near = { x: 300, y: 500 };
    const far = { x: 850, y: 500 };
    const w = createWorld(arena({ squads: [rallySquad('sq', [at(near, 40)], [near, far])] }), T);
    soldierAt(w, { x: 150, y: 500 });
    const e = getSoldier(w, 'E1')!;
    const ours = w.state.soldiers.filter((s) => s.team !== 'enemy');
    const squad = w.map.squads![0]!;
    expect(bestRallyPoint(w, e, e.ai!, squad, ours, 'flee')).toBe(1);
  });

  it('dug in behind cover it holds on at an HP that sends it running in the open', () => {
    const outcome = (withCover: boolean) => {
      const enemyAt = { x: 620, y: 500 };
      const map: MapDef = arena({
        squads: [
          rallySquad('sq', [{ ...at(enemyAt), facing: Math.PI }], [enemyAt, { x: 900, y: 150 }]),
        ],
        cover: withCover
          ? [{ id: 'bags', rect: { x: 580, y: 440, w: 24, h: 120 }, material: 'sandbags' }]
          : [],
      });
      const w = createWorld(map, T);
      const ourId = soldierAt(w, { x: 250, y: 500 });
      const e = getSoldier(w, 'E1')!;
      e.hp = soldierMaxHp(T, 'rifleman') * 0.3; // below a rifleman's retreatHp (0.35)
      e.ai!.lastHp = e.hp;
      const behaviors = new Set<string>();
      for (let i = 0; i < 90; i++) {
        run(w, 1, { [ourId]: idle(0) });
        behaviors.add(e.ai!.behavior);
      }
      return { behaviors, covered: coveredFrom(w, e, { x: 250, y: 500 }) };
    };
    const open = outcome(false);
    expect(open.behaviors.has('retreat')).toBe(true);
    const dug = outcome(true);
    expect(dug.covered).toBe(true);
    expect(dug.behaviors.has('retreat')).toBe(false);
  });
});
