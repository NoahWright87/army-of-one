/**
 * Glue between the sim view and speech: runs the bark director every sim step, fills names into
 * the chosen lines, and draws them with the speech layer. Owned by the WorldRenderer, so every
 * scene that draws a battle (game, arena, replay) gets chatter.
 */
import type Phaser from 'phaser';
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

export class WorldSpeech {
  readonly layer: SpeechLayer;
  readonly director: BarkDirector;
  enabled = true;

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
    if (!this.enabled || !view.events.length) return;
    const reqs = this.director.step({
      nowMs,
      view,
      liveId,
      aim,
      activeLines: this.layer.activeCount,
      isSpeaking: (id) => this.layer.isSpeaking(id),
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
