import { describe, expect, it } from 'vitest';
import { fireShot } from '../combat/shots';
import { atmosphericTransmission, fogBanksAt } from '../world/atmosphere';
import { addSmoke, perceivedVisibility } from '../world/concealment';
import { getSoldier } from '../sim';
import { arena, soldierAt, world } from './helpers';

describe('atmospheric concealment', () => {
  it('scales with distance and stacks layers and temporary smoke', () => {
    const mist = { x: 200, y: 400, w: 150, h: 200 };
    const from = { x: 100, y: 500 };
    const target = { x: 450, y: 500 };
    const w = world(arena({ mist: [mist] }), { bullets: { enabled: false } });
    const id = soldierAt(w, target);
    const s = getSoldier(w, id)!;
    const single = perceivedVisibility(w, from, s);
    expect(single).toBeCloseTo(Math.exp(-150 * w.tuning.concealment.mistAttenuation));
    w.map.mist!.push(mist);
    expect(perceivedVisibility(w, from, s)).toBeCloseTo(single ** 2);
    const inside = { x: 250, y: 500 };
    const close = { x: 260, y: 500 };
    const t = w.tuning.concealment;
    expect(
      atmosphericTransmission(
        inside,
        close,
        { map: w.map, tick: 0 },
        t.mistAttenuation,
        t.fogAttenuation,
      ),
    ).toBeGreaterThan(0.9);
    addSmoke(w, 'smoke', { x: 325, y: 500 }, 45);
    expect(perceivedVisibility(w, from, s)).toBeLessThan(single ** 2);
    const hit = fireShot(w, {
      by: 'test',
      from,
      angle: 0,
      range: 500,
      team: 'enemy',
      damage: 10,
      cause: 'rifle',
    });
    expect(hit.hitId).toBe(id);
  });

  it('uses battle time to drift fog, which obscures long shots more than nearby targets', () => {
    const weather = { kind: 'fog' as const, banks: [{ x: 350, y: 500, radius: 310 }] };
    expect(fogBanksAt(weather, 60)).not.toEqual(fogBanksAt(weather, 0));
    expect(fogBanksAt(structuredClone(weather), 60)).toEqual(fogBanksAt(weather, 60));
    const map = arena({ weather });
    const context = { map, tick: 60 };
    const from = { x: 130, y: 500 };
    const fog = (x: number) => atmosphericTransmission(from, { x, y: 500 }, context, 0, 0.002);
    expect(fog(160)).toBeGreaterThan(0.9);
    expect(fog(750)).toBeLessThan(0.45);
  });
});
