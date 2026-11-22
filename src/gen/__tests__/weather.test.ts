import { expect, it } from 'vitest';
import { parseWorldMissionId, worldMissionId } from '../mission-id';
import { generateWeather, weatherForLevel } from '../weather';

it('rolls clear and foggy campaign levels deterministically and preserves weather in mission IDs', () => {
  const rolls = () => Array.from({ length: 30 }, (_, level) => weatherForLevel(39, level));
  expect(rolls()).toEqual(rolls());
  expect(rolls()).toContain('fog');
  expect(rolls()).toContain(undefined);
  const id = worldMissionId(39, 2, 500, { turns: 1, held: [1], weather: 'fog' });
  expect(parseWorldMissionId(id)).toEqual({
    seed: 39,
    level: 2,
    turns: 1,
    held: [1],
    budget: 500,
    weather: 'fog',
  });
  expect(parseWorldMissionId('world-39-2')?.weather).toBeUndefined();
  expect(generateWeather('fog', '39:2', 1000, 1500)).toEqual(
    generateWeather('fog', '39:2', 1000, 1500),
  );
  expect(generateWeather('fog', '39:2', 1000, 1500).banks.length).toBeGreaterThan(4);
});
