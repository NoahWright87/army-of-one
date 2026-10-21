/**
 * Headless sim runner. Seed of the PHASE05-b stress harness.
 *   npm run sim -- --ticks 3600
 */
import { DEFAULT_TUNING } from '../src/content/tuning';
import { TEST_RANGE } from '../src/content/maps/test-range';
import { hashState } from '../src/sim/core/hash';
import { formatBattleTime } from '../src/sim/core/time';
import { createWorld, getSoldier, spawnSoldier, step } from '../src/sim/sim';
import type { SoldierInput } from '../src/sim/entities/soldier';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const ticks = Number(arg('ticks', '3600'));
const dirs = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
const square = (t: number): SoldierInput => ({
  move: dirs[Math.floor(t / 90) % 4]!,
  aim: t * 0.05,
  fire: false,
  interact: false,
});

const world = createWorld(TEST_RANGE, DEFAULT_TUNING);
const id = spawnSoldier(world, 'west');
const started = process.hrtime.bigint();
for (let t = 0; t < ticks; t++) step(world, new Map([[id, square(t)]]));
const ms = Number(process.hrtime.bigint() - started) / 1e6;
const s = getSoldier(world, id)!;

console.log(`map=${TEST_RANGE.id} ticks=${ticks} battleTime=${formatBattleTime(world.state.tick)}`);
console.log(`S1 at (${s.x.toFixed(2)}, ${s.y.toFixed(2)})`);
console.log(`hash=${hashState(world.state)}`);
console.log(`${(ticks / (ms / 1000)).toFixed(0)} ticks/sec (${ms.toFixed(1)} ms)`);
