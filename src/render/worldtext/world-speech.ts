/**
 * Glue between the sim view and speech: runs the bark director every sim step, fills names into
 * the chosen lines, and draws them with the speech layer. Owned by the WorldRenderer, so every
 * scene that draws a battle (game, arena, replay) gets chatter.
 */
import type Phaser from 'phaser';
import { str } from '../../content/strings';
import { EMOTE_COUNTDOWN_BEAT_SECONDS } from '../../content/tuning';
import { secondsToTicks, type Tick } from '../../sim/core/time';
import { fillVars, identityVars, soldierIdentity } from '../../content/soldier-names';
import { DEFAULT_WORLD_TEXT, type WorldTextTuning } from '../../content/world-text';
import type { SoldierView, WorldView } from '../../sim/view';
import { BarkDirector } from './barks';
import { SpeechLayer } from './speech-layer';

/** Enemies' words get a faint red tint so you can tell the sides apart at a glance. */
export const ENEMY_SPEECH_COLOR = '#ffc2b8';

export function identityOf(s: Pick<SoldierView, 'id' | 'roleId'>) {
  return soldierIdentity(s.id, s.roleId ?? 'rifleman');
}

const COUNTDOWN = ['emote.three', 'emote.two', 'emote.one', 'emote.go'] as const;
const BEAT_TICKS = secondsToTicks(EMOTE_COUNTDOWN_BEAT_SECONDS);

export class WorldSpeech {
  readonly layer: SpeechLayer;
  readonly director: BarkDirector;
  enabled = true;
  private readonly countdowns = new Map<string, { start: Tick; beat: number }>();

  constructor(scene: Phaser.Scene, tuning: WorldTextTuning = DEFAULT_WORLD_TEXT) {
    this.layer = new SpeechLayer(scene, tuning);
    this.director = new BarkDirector(tuning.barks);
  }

  setTuning(t: WorldTextTuning): void {
    this.layer.tuning = t;
    this.director.tuning = t.barks;
  }

  /** Once per sim step. */
  onStep(
    view: WorldView,
    liveId: string | null,
    aim: { x: number; y: number } | null,
    nowMs: number,
  ): void {
    if (this.enabled && view.events.length) this.barkOnStep(view, liveId, aim, nowMs);

    for (const e of view.events) {
      if (e.kind !== 'emote') continue;
      if (e.emote === 'countdown') {
        this.countdowns.set(e.by, { start: e.tick, beat: -1 });
      } else {
        this.countdowns.delete(e.by);
        const speaker = view.soldiers.find((s) => s.id === e.by);
        if (speaker?.alive && (e.emote === 'ready' || e.emote === 'hold')) {
          this.say(speaker, str(`emote.${e.emote}`));
        }
      }
    }
    for (const [id, countdown] of this.countdowns) {
      const speaker = view.soldiers.find((s) => s.id === id);
      const elapsed = view.tick - countdown.start;
      const beat = Math.floor(elapsed / BEAT_TICKS);
      if (!speaker?.alive || elapsed < 0 || beat >= COUNTDOWN.length) {
        this.countdowns.delete(id);
      } else if (beat !== countdown.beat) {
        countdown.beat = beat;
        this.say(speaker, str(COUNTDOWN[beat]!));
      }
    }
  }

  resetEmotes(): void {
    this.countdowns.clear();
  }

  private barkOnStep(
    view: WorldView,
    liveId: string | null,
    aim: { x: number; y: number } | null,
    nowMs: number,
  ): void {
    const reqs = this.director.step({
      nowMs,
      view,
      liveId,
      aim,
      activeLines: this.layer.activeCount,
      isSpeaking: (id) => this.countdowns.has(id) || this.layer.isSpeaking(id),
    });
    for (const r of reqs) {
      const sp = view.soldiers.find((s) => s.id === r.speakerId);
      if (!sp) continue;
      const about = r.aboutId ? view.soldiers.find((s) => s.id === r.aboutId) : undefined;
      this.say(sp, fillVars(r.template, identityVars(identityOf(sp), about && identityOf(about))));
    }
  }

  /** Says a line (markup, names filled) over a soldier. */
  say(sp: SoldierView, text: string): void {
    this.layer.say(sp.id, text, {
      echo: sp.role === 'echo',
      ...(sp.role === 'enemy' ? { color: ENEMY_SPEECH_COLOR } : {}),
    });
  }

  render(nowMs: number, posOf: (id: string) => { x: number; y: number } | null): void {
    this.layer.update(nowMs, posOf);
  }

  destroy(): void {
    this.layer.destroy();
  }
}
