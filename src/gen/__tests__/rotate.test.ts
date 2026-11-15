import { describe, expect, it } from 'vitest';
import { OFFICIAL_BLOCKS } from '../../content/blocks';
import { validateMap } from '../../sim/world/map';
import { parseWorldMissionId, worldMissionId } from '../mission-id';
import { fitTurns, rotateMap } from '../rotate-map';
import { generateWorld, worldLevelMap } from '../world';

const world = generateWorld(OFFICIAL_BLOCKS, { seed: 5 });
const { map } = worldLevelMap(world, 1, { id: 'x', nameKey: 'x' });

/** Differences between two maps beyond rounding (facings compared modulo a full turn). */
function diffs(a: unknown, b: unknown, path = 'map', out: string[] = []): string[] {
  if (typeof a === 'number' && typeof b === 'number') {
    const d = path.endsWith('facing') ? Math.abs(Math.sin((a - b) / 2)) : Math.abs(a - b);
    if (d > 1e-6) out.push(`${path}: ${a} vs ${b}`);
  } else if (a && typeof a === 'object' && b && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    for (const k of new Set([...ka, ...kb])) {
      diffs(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${path}.${k}`,
        out,
      );
    }
  } else if (a !== b) out.push(`${path}: ${String(a)} vs ${String(b)}`);
  return out;
}

describe('rotateMap ([D107])', () => {
  it('four quarter turns give the same map back', () => {
    let m = map;
    for (let i = 0; i < 4; i++) m = rotateMap(m, 1);
    expect(diffs(m, map)).toEqual([]);
  });

  it('a quarter turn swaps the sides and keeps the map valid', () => {
    const m = rotateMap(map, 1);
    expect(m.width).toBe(map.height);
    expect(m.height).toBe(map.width);
    expect(m.ground!.rows.length).toBe(map.ground!.rows[0]!.length);
    expect(() => validateMap(m)).not.toThrow();
    // The top-left corner goes to the top-right; a spawn turns with its facing.
    const s = map.spawnPoints[0]!;
    const t = m.spawnPoints[0]!;
    expect(t.position.x).toBeCloseTo(map.height - s.position.y);
    expect(t.position.y).toBeCloseTo(s.position.x);
    expect(t.facing).toBeCloseTo(s.facing + Math.PI / 2);
  });

  it('fits the long side to the screen, the way in at the bottom or left', () => {
    expect(fitTurns(50, 150, 'portrait', 'south')).toBe(0);
    expect(fitTurns(50, 150, 'landscape', 'south')).toBe(1); // south → west
    expect(fitTurns(50, 150, 'landscape', 'north')).toBe(3); // north → west
    expect(fitTurns(150, 50, 'portrait', 'east')).toBe(1); // east → south
    expect(fitTurns(150, 50, 'portrait', 'west')).toBe(3); // west → south
    expect(fitTurns(150, 50, 'landscape', 'west')).toBe(0);
  });

  it('mission ids carry the held neighbours and the turns', () => {
    const id = worldMissionId(7, 3, 500, { held: [9, 2], turns: 3 });
    expect(id).toBe('world-7-3-500-h2.9-r3');
    expect(parseWorldMissionId(id)).toEqual({
      seed: 7,
      level: 3,
      budget: 500,
      held: [2, 9],
      turns: 3,
    });
    expect(parseWorldMissionId('world-7-3-h')).toEqual({ seed: 7, level: 3, held: [] });
    expect(parseWorldMissionId('world-7-3')).toEqual({ seed: 7, level: 3 });
  });
});
