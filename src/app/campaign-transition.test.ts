import { afterEach, expect, it, vi } from 'vitest';
import { BLOCK_TUNING } from '../content/tuning';
import { parseWorldMissionId } from '../gen/mission-id';
import { worldLevelOrigin } from '../gen/region';
import { generatedMap, worldFor, worldLevelMissionId } from './editor-storage';

afterEach(() => vi.unstubAllGlobals());

it('keeps the campaign mission id and terrain aligned across screen orientations', () => {
  const world = worldFor(19, false);
  const level = world.levels[0]!;
  const held = new Set<number>();
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800 });
  const landscape = worldLevelMissionId(world, level.index, level.budget, held);
  vi.stubGlobal('window', { innerWidth: 390, innerHeight: 844 });
  const portrait = worldLevelMissionId(world, level.index, level.budget, held);

  expect(portrait).toBe(landscape);
  expect(parseWorldMissionId(portrait)?.turns).toBeUndefined();

  const map = generatedMap(portrait, { world })!;
  const origin = worldLevelOrigin(level);
  const ground = map.ground!;
  const cols = map.width / BLOCK_TUNING.cellSize;
  for (const [y, row] of ground.rows.entries()) {
    const boardY = Math.min(world.tiles.h - 1, origin.y + y);
    expect(row).toEqual(world.tiles.ground[boardY]!.slice(origin.x, origin.x + cols));
  }

  const legacy = generatedMap(portrait.replace(/(-fog)?$/, '-r1$1'), { world })!;
  expect(legacy.width).toBe(map.height);
  expect(legacy.height).toBe(map.width);
});
