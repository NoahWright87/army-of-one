import { describe, expect, it } from 'vitest';
import {
  ARENA_W,
  BARRIER_KINDS,
  PIECE_SIZE,
  arenaMap,
  arenaPieces,
  parseArenaConfig,
  runArena,
  runArenaBatch,
  type ArenaConfig,
} from '../arena';

const cfg = (left: number, right: number): ArenaConfig => ({
  left: { preset: 'normal', units: { rifleman: left } },
  right: { preset: 'normal', units: { rifleman: right } },
  barriers: { sandbags: 'left', rock: 'both' },
});

describe('dev arena (PHASE17, [D142])', () => {
  it('builds a squad per side, ours on the left, with the barriers switched on', () => {
    const m = arenaMap(cfg(2, 3), 2);
    expect(m.squads!.map((q) => [q.id, q.team ?? 'enemy', q.members.length]).sort()).toEqual([
      ['left', 'player', 2],
      ['right', 'enemy', 3],
    ]);
    // Sandbags on the left: 2 pieces; rocks on both halves: 4 walls on top of the border.
    expect(m.cover).toHaveLength(2);
    expect(m.cover!.every((c) => c.rect.x < ARENA_W / 2)).toBe(true);
    expect(m.walls.length - arenaMap({ ...cfg(2, 3), barriers: {} }).walls.length).toBe(4);
  });

  it("barrier spots don't overlap each other or the formations", () => {
    const all = arenaPieces({
      ...cfg(1, 1),
      barriers: Object.fromEntries(BARRIER_KINDS.map((k) => [k, 'both'])),
    });
    const rect = (p: (typeof all)[number]) => {
      const s = PIECE_SIZE[p.kind];
      const [w, h] = p.vertical ? [s.h, s.w] : [s.w, s.h];
      return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h / 2, y1: p.y + h / 2 };
    };
    const rs = all.map(rect);
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i]!;
        const b = rs[j]!;
        expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${i}/${j}`).toBe(
          true,
        );
      }
      // Clear of the starting blocks around x 260 and 1340 (40 soldiers fit within ±120).
      expect(rs[i]!.x0 > 260 + 120 && rs[i]!.x1 < ARENA_W - 260 - 120).toBe(true);
    }
  });

  it('reads old setups (hand-placed pieces) as no barriers', () => {
    const d = cfg(1, 1);
    const old = { left: d.left, right: d.right, pieces: [{ kind: 'rock', x: 1, y: 1 }] };
    expect(parseArenaConfig(old, d).barriers).toEqual({});
    expect(parseArenaConfig(null, d)).toBe(d);
  });

  it('fights to the end, deterministically', () => {
    const a = runArena(cfg(2, 2), 5);
    expect(a.winner).not.toBeNull();
    expect(runArena(cfg(2, 2), 5)).toEqual(a);
  });

  it('numbers win: five beat one nearly always', () => {
    const b = runArenaBatch(cfg(1, 5), 6);
    expect(b.right).toBeGreaterThanOrEqual(5);
  });
});
