/**
 * Headless sim runner. Seed of the PHASE05-b stress harness.
 *   npm run sim -- --ticks 3600                              # test-range, walk in a square
 *   npm run sim -- --map mission-01 --script road-naive      # scripted scenario, prints events
 *   npm run sim -- --map mission-01 --list                   # list scenarios
 * Flags: --quiet (no per-event lines), --all-events (include every shot/damage event).
 */
import { DEFAULT_TUNING } from '../src/content/tuning';
import { MISSION_01 } from '../src/content/maps/mission-01';
import { TEST_RANGE } from '../src/content/maps/test-range';
import { hashState } from '../src/sim/core/hash';
import { formatBattleTime } from '../src/sim/core/time';
import { createWorld, getSoldier, spawnSoldier, step } from '../src/sim/sim';
import type { SoldierInput } from '../src/sim/entities/soldier';
import type { SimEvent } from '../src/sim/events';
import { runScenario } from '../src/sim/scenarios/driver';
import { MISSION_01_SCENARIOS } from '../src/sim/scenarios/mission-01';
import type { MapDef } from '../src/sim/world/map';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const MAPS: Record<string, MapDef> = { 'test-range': TEST_RANGE, 'mission-01': MISSION_01 };
const SCENARIOS = { 'mission-01': MISSION_01_SCENARIOS } as Record<
  string,
  typeof MISSION_01_SCENARIOS
>;

const mapId = arg('map', 'test-range');
const map = MAPS[mapId];
if (!map) {
  console.error(`Unknown map ${mapId}. Maps: ${Object.keys(MAPS).join(', ')}`);
  process.exit(1);
}

const NOISY = new Set(['shotFired', 'damaged']);
function describe(e: SimEvent): string {
  const { kind, tick, ...rest } = e;
  const fields = Object.entries(rest)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`)
    .join(' ');
  return `${formatBattleTime(tick)} [${tick}] ${kind} ${fields}`;
}

if (flag('list')) {
  for (const s of SCENARIOS[mapId] ?? []) console.log(`${s.name}: ${s.description}`);
  process.exit(0);
}

const scriptName = process.argv.includes('--script') ? arg('script', '') : '';
if (scriptName) {
  const sc = (SCENARIOS[mapId] ?? []).find((s) => s.name === scriptName);
  if (!sc) {
    const names = (SCENARIOS[mapId] ?? []).map((s) => s.name).join(', ') || '(none)';
    console.error(`Unknown script ${scriptName} for ${mapId}. Scripts: ${names}`);
    process.exit(1);
  }
  const quiet = flag('quiet');
  const all = flag('all-events');
  let shots = 0;
  const started = process.hrtime.bigint();
  const res = runScenario(sc, DEFAULT_TUNING, (_w, events) => {
    for (const e of events) {
      if (e.kind === 'shotFired') shots++;
      if (!quiet && (all || !NOISY.has(e.kind))) console.log(describe(e));
    }
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const s = getSoldier(res.world, res.soldierId)!;
  const st = res.world.state;
  console.log('---');
  console.log(
    `map=${mapId} script=${sc.name} battleTime=${formatBattleTime(st.tick)} ticks=${st.tick}`,
  );
  console.log(
    `${s.id}: ${s.alive ? 'alive' : `dead (${s.deathCause}) at ${formatBattleTime(s.deathTick!)}`}` +
      ` hp=${s.hp} at (${s.x.toFixed(1)}, ${s.y.toFixed(1)}); script ${res.completed ? 'completed' : `stopped at step ${res.stepIndex}`}`,
  );
  console.log(
    `shots=${shots} missionComplete=${st.missionComplete ? formatBattleTime(st.missionComplete.tick) : 'no'}`,
  );
  console.log(`hash=${hashState(st)}`);
  console.log(`${(st.tick / (ms / 1000)).toFixed(0)} ticks/sec (${ms.toFixed(1)} ms)`);
  process.exit(0);
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

const world = createWorld(map, DEFAULT_TUNING);
const id = spawnSoldier(world, map.spawnPoints[0]!.id);
const started = process.hrtime.bigint();
for (let t = 0; t < ticks; t++) step(world, new Map([[id, square(t)]]));
const ms = Number(process.hrtime.bigint() - started) / 1e6;
const s = getSoldier(world, id)!;

console.log(`map=${map.id} ticks=${ticks} battleTime=${formatBattleTime(world.state.tick)}`);
console.log(`S1 at (${s.x.toFixed(2)}, ${s.y.toFixed(2)})`);
console.log(`hash=${hashState(world.state)}`);
console.log(`${(ticks / (ms / 1000)).toFixed(0)} ticks/sec (${ms.toFixed(1)} ms)`);
