/**
 * PHASE16 ([D135]): `npm run sim -- --scenario pacing [--seeds 11,42] [--levels 3]
 * [--difficulty easy,normal,hard] [--cap 120] [--json]`.
 *
 * Brute-forces generated campaign levels the way the game is meant to be played: bot lives, one
 * per attempt, each replaying every earlier life as an echo (`ArmyBuilder`). Most bots assault
 * the objective flags and shoot enemy soldiers; the rest wander. Reports, per level, the lives
 * and battle time it took to win and an estimate of real play time.
 *
 * Bots are much worse than people (they deploy at the latest slot from the entries, never
 * rewind, never resume an O, never use forward spawns), so the numbers are an upper bound to
 * compare tunings, not a prediction of a player's session.
 */
import { DIFFICULTY, isDifficulty, type Difficulty } from '../src/content/difficulty';
import { OFFICIAL_BLOCKS } from '../src/content/blocks';
import { DEFAULT_TUNING, withTuning } from '../src/content/tuning';
import { campaignBudget, levelGraph, newCampaign, withDifficulty } from '../src/gen/campaign';
import { generateWorld, worldLevelMap } from '../src/gen/world';
import { ArmyBuilder } from '../src/sim/bots/army';
import { TICKS_PER_SECOND, formatBattleTime } from '../src/sim/core/time';

export interface PacingRow {
  seed: number;
  difficulty: Difficulty;
  level: number;
  /** Position on the way to the HQ (1 = the first level). */
  step: number;
  enemies: number;
  won: boolean;
  lives: number;
  /** Battle time of the win (or reached). */
  battleSeconds: number;
  /** Lives × (lead-in + time alive) + a few seconds on the respawn screen each. */
  realMinutes: number;
  simMs: number;
}

/** Seconds a player spends on the respawn screen per life, for the real-time estimate. */
const RESPAWN_SCREEN_SECONDS = 6;

export function runPacing(o: {
  seeds: number[];
  levels: number;
  difficulties: Difficulty[];
  cap: number;
}): PacingRow[] {
  const rows: PacingRow[] = [];
  for (const seed of o.seeds) {
    const world = generateWorld(OFFICIAL_BLOCKS, { seed });
    const route = levelGraph(world).route.slice(0, o.levels);
    for (const difficulty of o.difficulties) {
      const c = withDifficulty(newCampaign(seed), difficulty);
      const tuning = withTuning(DEFAULT_TUNING, DIFFICULTY[difficulty].tuning);
      route.forEach((level, k) => {
        const budget = campaignBudget(world, c, level);
        const map = worldLevelMap(world, level, {
          id: `pacing-${seed}-${level}`,
          nameKey: 'map.world.name',
          budget,
        }).map;
        const enemies = (map.squads ?? []).reduce((n, q) => n + q.members.length, 0);
        const army = new ArmyBuilder({
          map,
          tuning,
          seed: seed ^ (level * 7919),
          mix: { assault: 75, route: 10, crowd: 10, hunter: 5 },
          lifeSeconds: [20, 70],
        });
        const t0 = performance.now();
        let won = false;
        let battle = 0;
        let alive = 0;
        while (army.size < o.cap && !won) {
          const life = army.next();
          const obs = life.result.observation;
          battle = Math.max(battle, obs.toTick);
          alive += Math.max(0, obs.toTick - life.entryTick);
          if (obs.missionComplete) {
            won = true;
            battle = obs.missionComplete.tick;
          }
        }
        const lives = army.size;
        const real =
          (alive / TICKS_PER_SECOND +
            lives * (tuning.spawn.leadInSeconds + RESPAWN_SCREEN_SECONDS)) /
          60;
        rows.push({
          seed,
          difficulty,
          level,
          step: k + 1,
          enemies,
          won,
          lives,
          battleSeconds: battle / TICKS_PER_SECOND,
          realMinutes: Math.round(real * 10) / 10,
          simMs: Math.round(performance.now() - t0),
        });
      });
    }
  }
  return rows;
}

export function runPacingCli(argv: string[]): void {
  const arg = (name: string, fallback: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
  };
  const difficulties = arg('difficulty', 'normal').split(',').filter(isDifficulty);
  const rows = runPacing({
    seeds: arg('seeds', '11,42').split(',').map(Number),
    levels: Number(arg('levels', '3')),
    difficulties: difficulties.length ? difficulties : ['normal'],
    cap: Number(arg('cap', '120')),
  });
  if (argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log(
    'seed       diff    step level enemies  result      lives  battle  ~real min  sim ms',
  );
  for (const r of rows) {
    console.log(
      [
        String(r.seed).padEnd(10),
        r.difficulty.padEnd(7),
        String(r.step).padStart(4),
        String(r.level).padStart(5),
        String(r.enemies).padStart(7),
        (r.won ? 'won' : `no win`).padStart(8),
        String(r.lives).padStart(8),
        formatBattleTime(r.battleSeconds * TICKS_PER_SECOND).padStart(7),
        String(r.realMinutes).padStart(10),
        String(r.simMs).padStart(7),
      ].join(' '),
    );
  }
}
