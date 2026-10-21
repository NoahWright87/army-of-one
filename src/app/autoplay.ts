/**
 * Dev autoplay: plays a list of scripted lives through the real game flow, deploying each from
 * the respawn screen as soon as it opens. `?autoplay=road-slow,road-snipe-die` (see
 * autoplay-lives.ts for names; `name*3` repeats), or `__aoo.autoplay('…')` in the console.
 * Options: `&autowait=1` waits for the scrubber to finish before each deploy; `&fast=1` plays
 * the lives headless (not drawn); `&continue=1` continues the saved mission instead of starting
 * a new one.
 */
import type { InputSource } from '../render/input/input-source';
import { pickOption, type AutoLife } from './autoplay-lives';
import type { GameController, GameEvent } from './game';
import type { LiveRun } from './live-run';
import { ScriptedInput } from './scripted-input';

export interface AutopilotOptions {
  waitResolve: boolean;
  fast: boolean;
  continueMission: boolean;
  /** Pause on each respawn screen before deploying. */
  delayMs: number;
}

export class Autopilot {
  private queue: AutoLife[] = [];
  private pending: AutoLife | null = null;
  private game: GameController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  onChange: () => void = () => {};

  constructor(
    readonly opts: AutopilotOptions,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  attach(game: GameController): void {
    this.game = game;
  }

  /** Queues lives; starts at once if the respawn screen is open. */
  play(lives: AutoLife[]): void {
    this.queue.push(...lives);
    this.onChange();
    this.kick();
  }

  get left(): number {
    return this.queue.length + (this.pending ? 1 : 0);
  }

  get active(): boolean {
    return this.left > 0;
  }

  /** A scripted life is about to be shown and should be played headless. */
  get playHeadless(): boolean {
    return this.opts.fast && this.pending !== null;
  }

  onEvent(e: GameEvent): void {
    if (!this.active) return;
    if (e.type === 'flow' && e.state.kind === 'title') {
      setTimeout(() => {
        const g = this.game!;
        if (this.opts.continueMission && e.state.kind === 'title' && e.state.canContinue)
          void g.continueMission();
        else void g.newMission();
      }, 0);
    }
    if (e.type === 'respawnShown') {
      // A deploy that never reached the battle (history shifted) leaves its life unused.
      this.pending = null;
      this.kick();
    }
  }

  /** The input source for a run this autopilot deployed (null: the player's keyboard). */
  inputFor(run: LiveRun): InputSource | null {
    const life = this.pending;
    if (!life) return null;
    this.pending = null;
    this.onChange();
    return new ScriptedInput(run, life.steps, life.end, life.name);
  }

  stop(): void {
    this.queue = [];
    this.pending = null;
    if (this.timer) clearTimeout(this.timer);
    this.onChange();
  }

  private kick(): void {
    if (this.timer || !this.queue.length) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tryDeploy();
    }, this.opts.delayMs);
  }

  private tryDeploy(): void {
    const g = this.game;
    if (!g || g.flow.kind !== 'respawn' || !this.queue.length) return;
    if (this.opts.waitResolve && g.resolving) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.tryDeploy();
      }, 100);
      return;
    }
    const life = this.queue.shift()!;
    const option = pickOption(life, g.options());
    if (!option) {
      this.log(`autoplay: '${life.name}' has no option to deploy; stopping`);
      this.stop();
      return;
    }
    this.pending = life;
    this.onChange();
    void g.deploy(option);
  }
}
