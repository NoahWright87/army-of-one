/**
 * Headless adapters for the game controller: a battle host that steps lives without rendering,
 * a manual clock, and a recording UI. Used by the flow tests and by the browser's fast
 * autoplay (`?autoplay=…&fast=1`), which plays scripted lives without drawing them.
 */
import type { SpawnOption } from '../contracts/mission';
import { secondsToTicks } from '../sim/core/time';
import { IDLE_INPUT } from '../sim/entities/soldier';
import type { InputSource } from '../render/input/input-source';
import type { RespawnProps, RespawnUpdate } from '../ui/respawn/respawn-model';
import type { FlowNotice } from './flow';
import type { BattleHost, Clock, GameUi, MissionStats, RespawnHandle } from './game';
import type { LiveRun } from './live-run';

/** Steps each life to its end on the clock (one macrotask), feeding it `input(run)`. */
export class HeadlessBattleHost implements BattleHost {
  active: LiveRun | null = null;
  ticksRun = 0;

  constructor(
    private readonly clock: Clock,
    private readonly input: (run: LiveRun) => InputSource | null,
    private readonly maxTicks = secondsToTicks(600),
  ) {}

  start(run: LiveRun): void {
    this.active = run;
    this.clock.after(0, () => {
      const src = this.input(run);
      let n = 0;
      while (!run.ended && this.active === run && n < this.maxTicks) {
        const me = run.attempt.liveSoldier();
        run.step(src ? src.read(me ?? run.cameraHome) : IDLE_INPUT);
        n++;
      }
      this.ticksRun += n;
      src?.destroy();
    });
  }

  stop(): void {
    this.active = null;
  }
}

/** A clock you advance by hand (tests). Timers scheduled while running also run if due. */
export class ManualClock implements Clock {
  now = 0;
  private timers: { at: number; seq: number; fn: () => void }[] = [];
  private seq = 0;

  after(ms: number, fn: () => void): () => void {
    const t = { at: this.now + Math.max(0, ms), seq: this.seq++, fn };
    this.timers.push(t);
    return () => {
      this.timers = this.timers.filter((x) => x !== t);
    };
  }

  /** Runs every timer due within `ms` from now, in order. Returns how many ran. */
  advance(ms: number): number {
    const end = this.now + ms;
    let ran = 0;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const t = this.timers[0];
      if (!t || t.at > end) break;
      this.timers.shift();
      this.now = Math.max(this.now, t.at);
      t.fn();
      ran++;
    }
    this.now = end;
    return ran;
  }

  get pending(): number {
    return this.timers.length;
  }
}

export interface RecordedRespawn {
  props: RespawnProps;
  notice: FlowNotice;
  updates: RespawnUpdate[];
  destroyed: boolean;
  deploy(option: SpawnOption): void;
}

/** A GameUi that just records what it was asked to show. */
export class RecordingUi implements GameUi {
  title: { canContinue: boolean; onNew(): void; onContinue(): void } | null = null;
  respawns: RecordedRespawn[] = [];
  complete: { stats: MissionStats; playAgain(): void } | null = null;
  captions: ('kia' | 'complete' | null)[] = [];
  busy = false;

  showTitle(p: { canContinue: boolean; onNew(): void; onContinue(): void }): void {
    this.title = p;
  }

  showRespawn(
    props: RespawnProps,
    onDeploy: (o: SpawnOption) => void,
    notice: FlowNotice,
  ): RespawnHandle {
    const rec: RecordedRespawn = {
      props,
      notice,
      updates: [],
      destroyed: false,
      deploy: onDeploy,
    };
    this.respawns.push(rec);
    return {
      update: (u) => rec.updates.push(u),
      destroy: () => {
        rec.destroyed = true;
      },
    };
  }

  /** The respawn screen currently open, with its updates folded in. */
  get current(): (RecordedRespawn & { latest: RespawnProps }) | null {
    const r = this.respawns[this.respawns.length - 1];
    if (!r || r.destroyed) return null;
    let latest = r.props;
    for (const u of r.updates) {
      latest = {
        ...latest,
        ...Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)),
      };
    }
    return { ...r, latest };
  }

  showComplete(stats: MissionStats, onPlayAgain: () => void): void {
    this.complete = { stats, playAgain: onPlayAgain };
  }

  hideScreens(): void {
    this.title = null;
    this.complete = null;
  }

  showCaption(text: 'kia' | 'complete' | null): void {
    this.captions.push(text);
  }

  showBusy(on: boolean): void {
    this.busy = on;
    if (on) this.busyShown++;
  }

  /** (06-c) Times the spinner was asked for. */
  busyShown = 0;
  /** (06-c) The quick-redeploy hint's option (null = hidden). */
  quickHint: SpawnOption | null = null;

  showQuickRedeploy(option: SpawnOption | null): void {
    this.quickHint = option;
  }
}
