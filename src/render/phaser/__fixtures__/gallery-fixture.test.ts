import { describe, expect, it } from 'vitest';
import type { BridgeState, SimEvent } from '../../../sim/events';
import type { MineState, SoldierRole, TurretState, WorldView } from '../../../sim/view';
import { GALLERY_LIVE_ID, galleryEvents, galleryView } from './gallery-fixture';

/** Every value of each state union. `satisfies Record<…>` breaks the build if a union grows. */
const ROLES = Object.keys({ live: 1, echo: 1, static: 1, interrupted: 1 } satisfies Record<
  SoldierRole,
  1
>);
const TURRET = Object.keys({ idle: 1, tracking: 1, windup: 1, destroyed: 1 } satisfies Record<
  TurretState,
  1
>);
const MINE = Object.keys({ idle: 1, armed: 1, detonated: 1 } satisfies Record<MineState, 1>);
const BRIDGE = Object.keys({
  down: 1,
  raising: 1,
  up: 1,
  lowering: 1,
  destroyed: 1,
} satisfies Record<BridgeState, 1>);
const ENTITY_LISTS = Object.keys({
  soldiers: 1,
  turrets: 1,
  mines: 1,
  vehicles: 1,
  gates: 1,
  levers: 1,
  bridges: 1,
  objectives: 1,
} satisfies Record<Exclude<keyof WorldView, 'tick' | 'events' | 'missionComplete'>, 1>);

describe('gallery fixture', () => {
  const v = galleryView(30);

  it('has at least one of every entity kind', () => {
    for (const k of ENTITY_LISTS) {
      expect((v[k as keyof WorldView] as unknown[]).length, k).toBeGreaterThan(0);
    }
  });

  it('covers every soldier role, plus corpse, lead-in and damaged', () => {
    for (const r of ROLES)
      expect(
        v.soldiers.some((s) => s.alive && s.role === r),
        r,
      ).toBe(true);
    expect(v.soldiers.some((s) => !s.alive)).toBe(true);
    expect(v.soldiers.some((s) => s.leadIn && s.role === 'live')).toBe(true);
    expect(v.soldiers.some((s) => s.leadIn && s.role === 'echo')).toBe(true);
    expect(v.soldiers.some((s) => s.alive && s.hp < s.maxHp && s.role === 'echo')).toBe(true);
  });

  it('covers every turret, mine and bridge state, gates/levers both ways, wrecks', () => {
    for (const s of TURRET)
      expect(
        v.turrets.some((t) => t.state === s),
        s,
      ).toBe(true);
    for (const s of MINE)
      expect(
        v.mines.some((m) => m.state === s),
        s,
      ).toBe(true);
    for (const s of BRIDGE)
      expect(
        v.bridges.some((b) => b.state === s),
        s,
      ).toBe(true);
    expect(new Set(v.gates.map((g) => g.open))).toEqual(new Set([true, false]));
    expect(new Set(v.levers.map((l) => l.on))).toEqual(new Set([true, false]));
    expect(new Set(v.vehicles.map((x) => x.state))).toEqual(new Set(['moving', 'wreck']));
    expect(new Set(v.objectives.map((o) => o.destroyed))).toEqual(new Set([true, false]));
  });

  it('ids are unique and the live id exists', () => {
    const ids = ENTITY_LISTS.flatMap((k) =>
      (v[k as keyof WorldView] as { id: string }[]).map((e) => e.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(v.soldiers.some((s) => s.id === GALLERY_LIVE_ID && s.role === 'live')).toBe(true);
  });

  it('replays every visual event kind over one loop', () => {
    const kinds = new Set<SimEvent['kind']>();
    for (let t = 0; t < 120; t++) for (const e of galleryEvents(t)) kinds.add(e.kind);
    for (const k of [
      'shotFired',
      'damaged',
      'mineDetonated',
      'hazardDestroyed',
      'turretWindup',
    ] as const) {
      expect(kinds.has(k), k).toBe(true);
    }
  });
});
