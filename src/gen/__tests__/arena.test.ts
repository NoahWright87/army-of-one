import { describe, expect, it } from 'vitest';
import { arenaMap, runArena, runArenaBatch, type ArenaConfig } from '../arena';

const cfg = (left: number, right: number): ArenaConfig => ({
  left: { preset: 'normal', units: { rifleman: left } },
  right: { preset: 'normal', units: { rifleman: right } },
  pieces: [
    { kind: 'sandbags', x: 800, y: 500 },
    { kind: 'rock', x: 800, y: 300, vertical: true },
  ],
});

describe('dev arena (PHASE17, [D142])', () => {
  it('builds a squad per side, ours on the left, with cover and rocks', () => {
    const m = arenaMap(cfg(2, 3), 2);
    expect(m.squads!.map((q) => [q.id, q.team ?? 'enemy', q.members.length]).sort()).toEqual([
      ['left', 'player', 2],
      ['right', 'enemy', 3],
    ]);
    expect(m.cover).toHaveLength(1);
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
