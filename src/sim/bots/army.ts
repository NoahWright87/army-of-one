/**
 * Builds a mission's worth of bot lives the way a player would: one attempt per life, chained,
 * each deployed through the attempt runner at its spawn point's next [D7] entry slot, starting
 * from the nearest valid snapshot before its 5 s lead-in, with every earlier life replaying as
 * an echo. So the truth is real: earlier bots die (or are rescued) because the world says so.
 *
 * Incremental (`ArmyBuilder.next()` plays one life) so the browser can yield between lives and
 * the bench can measure at checkpoints (the first N lives of an army are the same whatever its
 * final size: same seeds, same chain).
 */
import type { Tuning } from '../../content/tuning';
import type { AttemptObservation, SoldierRecord, SpawnPointId } from '../../contracts/mission';
import { Attempt, type AttemptFrom, type AttemptResult } from '../attempt/attempt';
import { SnapshotStore, snapshotThinning } from '../attempt/snapshots';
import { createRng, nextFloat, nextInt, type RngState } from '../core/rng';
import { secondsToTicks, type Tick } from '../core/time';
import { addSegment, nextSoldierId } from '../recording/records';
import type { MapDef } from '../world/map';
import {
  BOT_KINDS,
  createBotDriver,
  DEFAULT_BOT_MIX,
  planBot,
  type BotKind,
  type BotMix,
  type BotPlan,
} from './bot';

export interface ArmyParams {
  map: MapDef;
  tuning: Tuning;
  /** Army seed: same seed, same army. */
  seed: number;
  mix?: BotMix;
  /** Life length range in seconds (default 30–100). */
  lifeSeconds?: [number, number];
  /** Shared snapshot cache (default: a fresh store). */
  snapshots?: SnapshotStore;
}

export interface ArmyLife {
  index: number;
  plan: BotPlan;
  soldierId: string;
  entryTick: Tick;
  result: AttemptResult;
  /** All records after this life was folded in. */
  records: SoldierRecord[];
  /** Ticks this attempt simulated (fast-forward + lead-in + life). */
  ticks: number;
}

export function pickKind(rng: RngState, mix: BotMix): BotKind {
  const total = BOT_KINDS.reduce((n, k) => n + Math.max(0, mix[k]), 0);
  let x = nextFloat(rng) * total;
  for (const k of BOT_KINDS) {
    x -= Math.max(0, mix[k]);
    if (x < 0) return k;
  }
  return BOT_KINDS[0]!;
}

export class ArmyBuilder {
  records: SoldierRecord[] = [];
  readonly snapshots: SnapshotStore;
  readonly observations: AttemptObservation[] = [];
  /** `records` right after each life (parallel to `observations`), for folding the truth. */
  readonly recordsAfter: SoldierRecord[][] = [];
  /** Ticks simulated across all attempts. */
  ticks = 0;
  private readonly rng: RngState;
  private readonly entryCounts = new Map<SpawnPointId, number>();
  private index = 0;

  constructor(private readonly p: ArmyParams) {
    this.snapshots = p.snapshots ?? new SnapshotStore(snapshotThinning(p.tuning));
    this.rng = createRng(p.seed);
  }

  get size(): number {
    return this.index;
  }

  /** Plays the next bot life (one attempt) and folds its recording in. */
  next(): ArmyLife {
    const { map, tuning } = this.p;
    const index = this.index++;
    const points = map.spawnPoints.filter((s) => s.kind === 'initial');
    const point = points[nextInt(this.rng, 0, points.length - 1)]!;
    const kind = pickKind(this.rng, this.p.mix ?? DEFAULT_BOT_MIX);
    const seed = (Math.imul(this.p.seed, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
    const plan = planBot({
      map,
      tuning,
      kind,
      seed,
      spawnPointId: point.id,
      ...(this.p.lifeSeconds ? { lifeSeconds: this.p.lifeSeconds } : {}),
    });
    const n = this.entryCounts.get(point.id) ?? 0;
    this.entryCounts.set(point.id, n + 1);
    const entryTick = n * secondsToTicks(tuning.spawn.intervalSeconds); // [D7]
    const soldierId = nextSoldierId(this.records);

    const snap = this.snapshots.nearestValidSnapshot(
      Math.max(0, entryTick - secondsToTicks(tuning.spawn.leadInSeconds)),
    );
    const from: AttemptFrom = snap ? { kind: 'snapshot', snapshot: snap } : { kind: 'start' };
    const attempt = new Attempt({
      map,
      tuning,
      soldiers: this.records,
      attempt: index + 1,
      from,
      live: { mode: 'new', soldierId, spawnPointId: point.id, entryTick },
      snapshots: this.snapshots,
    });
    const driver = createBotDriver(plan);
    const start = attempt.tick;
    while (!attempt.isOver()) {
      const me = attempt.liveSoldier();
      if (attempt.inControl && me?.alive) {
        const input = driver.input(attempt.world, me);
        if (!input) break;
        attempt.step(input);
      } else {
        attempt.step();
      }
    }
    const result = attempt.finish();
    if (result.liveSegment) {
      this.records = addSegment(
        this.records,
        { soldierId, spawnPointId: point.id },
        result.liveSegment,
      );
    }
    this.observations.push(result.observation);
    this.recordsAfter.push(this.records);
    const ticks = attempt.tick - start;
    this.ticks += ticks;
    return { index, plan, soldierId, entryTick, result, records: this.records, ticks };
  }

  /** Plays lives until the army has `count`. */
  growTo(count: number, onLife?: (life: ArmyLife) => void): void {
    while (this.index < count) {
      const life = this.next();
      onLife?.(life);
    }
  }
}

/** Counts of each kind in a plan list (for reports). */
export function kindCounts(plans: readonly BotPlan[]): Record<BotKind, number> {
  const out = { route: 0, hunter: 0, idler: 0, crowd: 0 } as Record<BotKind, number>;
  for (const p of plans) out[p.kind]++;
  return out;
}
