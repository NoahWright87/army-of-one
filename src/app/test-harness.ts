/**
 * Builds a GameController on headless adapters (memory store, manual clock, recording UI,
 * inline resolve, scripted lives). Shared by the flow tests; also handy in a Node REPL.
 */
import { MISSION_01 } from '../content/maps/mission-01';
import { DEFAULT_TUNING, type Tuning } from '../content/tuning';
import type { SpawnOption } from '../contracts/mission';
import type { MapDef } from '../sim/world/map';
import { MemoryStore } from '../persistence/storage';
import type { InputSource } from '../render/input/input-source';
import { findAutoLife, pickOption, type AutoLife } from './autoplay-lives';
import { GameController, type BattleHost, type GameEvent } from './game';
import { HeadlessBattleHost, ManualClock, RecordingUi } from './headless';
import type { LiveRun } from './live-run';
import { createInlineResolveRunner } from './resolve-runner';
import { ScriptedInput } from './scripted-input';

export interface Harness {
  game: GameController;
  clock: ManualClock;
  ui: RecordingUi;
  store: MemoryStore;
  events: GameEvent[];
  runs: { run: LiveRun; countdownAtStart: number | null }[];
  /** Lives the host will play, in order (each `start` takes the next). */
  lives: AutoLife[];
  /** Runs timers and microtasks until nothing is left (or `maxMs` of clock time passes). */
  settle(maxMs?: number): Promise<void>;
  /** Deploys the option `life` picks from the open respawn screen and queues its script. */
  play(name: string): Promise<SpawnOption>;
}

export interface HarnessOptions {
  store?: MemoryStore;
  tuning?: Tuning;
  /** Replace the headless host (e.g. to stop a life mid-way). */
  battle?: (clock: ManualClock, input: (run: LiveRun) => InputSource | null) => BattleHost;
  /** Inline resolve: ticks per slice (small = many progress reports). */
  resolveSlice?: number;
  /** Inline resolve: clock delay between slices (0 = a whole pass runs in one `advance`). */
  resolveDelayMs?: number;
  /** Map to play (default mission-01). */
  map?: MapDef;
}

export function createHarness(o: HarnessOptions = {}): Harness {
  const clock = new ManualClock();
  const ui = new RecordingUi();
  const store = o.store ?? new MemoryStore();
  const events: GameEvent[] = [];
  const runs: Harness['runs'] = [];
  const lives: AutoLife[] = [];
  const input = (run: LiveRun): InputSource | null => {
    const life = lives.shift();
    return life ? new ScriptedInput(run, life.steps, life.end, life.name) : null;
  };
  const battle = o.battle ? o.battle(clock, input) : new HeadlessBattleHost(clock, input);
  const game = new GameController({
    map: o.map ?? MISSION_01,
    tuning: () => o.tuning ?? DEFAULT_TUNING,
    store,
    ui,
    battle,
    clock,
    resolver: createInlineResolveRunner(
      (delay) => (run) => clock.after(o.resolveDelayMs ?? delay, run),
      o.resolveSlice ?? 600,
    ),
    options: { resolvePace: () => null, resumeOnReload: true },
    onEvent: (e) => {
      events.push(e);
      if (e.type === 'runStarted') runs.push({ run: e.run, countdownAtStart: e.run.countdown() });
    },
  });

  const settle = async (maxMs = 60_000) => {
    for (let guard = 0; guard < 100_000; guard++) {
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
      if (clock.pending === 0) {
        await game.flushSaves();
        if (clock.pending === 0) return;
      }
      if (clock.now >= maxMs) return;
      clock.advance(clock.pending ? 16 : 0);
    }
  };

  const play = async (name: string) => {
    const life = findAutoLife(name);
    if (!life) throw new Error(`no life ${name}`);
    const screen = ui.current;
    if (!screen) throw new Error(`no respawn screen open (flow: ${game.flow.kind})`);
    const option = pickOption(life, screen.latest.options);
    if (!option) throw new Error(`${name}: option not offered`);
    lives.push(life);
    await game.deploy(option);
    return option;
  };

  return { game, clock, ui, store, events, runs, lives, settle, play };
}
