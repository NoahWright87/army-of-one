/**
 * Draws speech over soldiers' heads: text only (no bubble), with a heavy outline for contrast.
 * Letters pop out of the speaker and fly up into place, so it's always clear who is talking, and
 * the line follows the speaker (or stays where they fell). Sizes are screen pixels at any zoom.
 */
import Phaser from 'phaser';
import type { CaptionVoiceProfile } from '../../content/caption-voices';
import type { WorldTextTuning } from '../../content/world-text';
import type { DisplaySettings } from '../../ui/settings/display-settings';
import { DEPTH } from '../depth';
import {
  captionVoice,
  CaptionVoicePlayer,
  type PlayingVoice,
  type VoiceCue,
} from './caption-voice';
import { defaultEnter, getEffect, hash01, type GlyphPose } from './effects';
import { fontStack, loadWorldTextFonts } from './fonts';
import { layoutGlyphs, parseLine, type ParsedLine, type Placed } from './markup';

const OUTLINE = '#0b0d10';

export interface SayOptions {
  voice?: CaptionVoiceProfile;
  /** An echo's line: drawn fainter. */
  echo?: boolean;
  /** Default text colour (markup colours win). */
  color?: string;
  /** (PHASE18) Never off screen: slides to the edge if the speaker is out of view. */
  keepOnScreen?: boolean;
}

interface LiveLine {
  speakerId: string;
  parsed: ParsedLine;
  placed: Placed[];
  /** Per glyph: its outline (below) and its fill (above). */
  texts: (Phaser.GameObjects.Text[] | null)[];
  /** Outlines, then fills on top (two containers so the order can't interleave). */
  layers: Phaser.GameObjects.Container[];
  startMs: number;
  endMs: number;
  alpha: number;
  seed: number;
  cuesFired: number;
  voice: VoiceCue[];
  playingVoice?: PlayingVoice;
  voiceAttempted: boolean;
  x: number;
  y: number;
  /** Text bounds around the anchor (screen px; y up is negative, from the head gap). */
  box: { minX: number; maxX: number; minY: number };
  /** Lifted this far (screen px, ≤ 0) so it doesn't cover an older line. */
  shift: number;
  keepOnScreen: boolean;
}

export class SpeechLayer {
  /** A `[quake]` was reached. */
  onQuake: () => void = () => {};
  private readonly lines: LiveLine[] = [];
  private readonly widths = new Map<string, number>();
  private measurer: Phaser.GameObjects.Text | null = null;
  private readonly voicePlayer = new CaptionVoicePlayer();
  private now = 0;
  private seq = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    public tuning: WorldTextTuning,
    public audio?: Pick<DisplaySettings, 'volume' | 'muted' | 'voiceVolume'>,
  ) {
    loadWorldTextFonts();
    // Widths measured with a fallback font are wrong once the real one arrives.
    const reset = () => this.widths.clear();
    document.fonts?.addEventListener('loadingdone', reset);
    const silence = () => this.voicePlayer.clear();
    scene.events.on(Phaser.Scenes.Events.PAUSE, silence);
    scene.events.on(Phaser.Scenes.Events.SLEEP, silence);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.fonts?.removeEventListener('loadingdone', reset);
      scene.events.off(Phaser.Scenes.Events.PAUSE, silence);
      scene.events.off(Phaser.Scenes.Events.SLEEP, silence);
      silence();
    });
  }

  get activeCount(): number {
    return this.lines.filter((l) => this.now < l.endMs).length;
  }

  isSpeaking(id: string): boolean {
    return this.lines.some((l) => l.speakerId === id && this.now < l.endMs);
  }

  /** Starts a line over `speakerId` (markup, variables already filled). */
  say(speakerId: string, markup: string, opts: SayOptions = {}): void {
    const t = this.tuning.speech;
    // A soldier says one thing at a time: the old line hurries off.
    for (const l of this.lines) {
      if (l.speakerId === speakerId) {
        l.endMs = Math.min(l.endMs, this.now);
        l.playingVoice?.stop();
      }
    }
    const parsed = parseLine(markup, t);
    const voice = captionVoice(speakerId, parsed, opts.voice);
    const font = fontStack(t.font);
    const measure = (ch: string, size: number) => {
      if (ch === ' ') return t.fontPx * size * 0.32;
      const key = `${font}|${size}|${ch}`;
      let w = this.widths.get(key);
      if (w === undefined) {
        this.measurer ??= this.scene.add.text(0, 0, '', {}).setVisible(false);
        this.measurer.setStyle({ fontFamily: font, fontSize: `${t.fontPx * size}px` });
        this.measurer.setText(ch);
        w = this.measurer.width;
        this.widths.set(key, w);
      }
      return w;
    };
    const placed = layoutGlyphs(
      parsed.glyphs,
      (g) => measure(g.ch, g.size) + (g.ch === ' ' ? 0 : t.letterSpacingPx),
      (size) => t.fontPx * size * 1.08,
      t.maxWidthPx,
    );
    const res = Math.max(2, window.devicePixelRatio || 1);
    // Two layers: every outline (+ shadow) under every fill, so a letter's outline never covers
    // its neighbour and the line reads as one outlined shape.
    const make = (g: (typeof parsed.glyphs)[number], back: boolean) =>
      this.scene.add
        .text(0, 0, g.ch, {
          fontFamily: font,
          fontSize: `${t.fontPx * g.size}px`,
          // Slanted fonts overhang their advance width: pad so letters aren't clipped.
          padding: { x: t.fontPx * g.size * 0.3, y: t.fontPx * g.size * 0.15 },
          color: back ? OUTLINE : (g.color ?? opts.color ?? '#ffffff'),
          ...(back ? { stroke: OUTLINE, strokeThickness: t.strokePx } : {}),
          ...(back && t.shadowPx > 0
            ? {
                shadow: {
                  offsetX: 0,
                  offsetY: t.shadowPx,
                  color: '#000000',
                  blur: t.shadowPx * 1.5,
                  stroke: true,
                  fill: true,
                },
              }
            : {}),
        })
        .setOrigin(0.5)
        .setResolution(res)
        .setVisible(false);
    const backs = parsed.glyphs.map((g) => (g.ch.trim() ? make(g, true) : null));
    const fronts = parsed.glyphs.map((g) => (g.ch.trim() ? make(g, false) : null));
    const only = (xs: (Phaser.GameObjects.Text | null)[]) =>
      xs.filter((x): x is Phaser.GameObjects.Text => !!x);
    const layers = [
      this.scene.add.container(0, 0, only(backs)).setDepth(DEPTH.speech),
      this.scene.add.container(0, 0, only(fronts)).setDepth(DEPTH.speech + 0.5),
    ];
    const texts = backs.map((b, i) => (b ? [b, fronts[i]!] : null));
    const hold = t.holdMs + t.holdPerCharMs * parsed.chars;
    this.lines.push({
      speakerId,
      parsed,
      placed,
      texts,
      layers,
      startMs: this.now,
      endMs: this.now + Math.max(parsed.revealEndMs + hold, (voice.at(-1)?.atMs ?? 0) + 150),
      alpha: opts.echo ? t.echoAlpha : 1,
      seed: ++this.seq * 977,
      cuesFired: 0,
      voice,
      voiceAttempted: false,
      x: NaN,
      y: NaN,
      box: {
        minX: Math.min(
          0,
          ...placed.map(
            (pl, i) => pl.x - measure(parsed.glyphs[i]!.ch, parsed.glyphs[i]!.size) / 2,
          ),
        ),
        maxX: Math.max(
          0,
          ...placed.map(
            (pl, i) => pl.x + measure(parsed.glyphs[i]!.ch, parsed.glyphs[i]!.size) / 2,
          ),
        ),
        minY: Math.min(0, ...placed.map((pl, i) => pl.y - (t.fontPx * parsed.glyphs[i]!.size) / 2)),
      },
      shift: 0,
      keepOnScreen: !!opts.keepOnScreen,
    });
  }

  /** Every frame: follow the speakers, animate, retire finished lines. */
  update(nowMs: number, posOf: (id: string) => { x: number; y: number } | null): void {
    this.now = nowMs;
    const t = this.tuning.speech;
    const camera = this.scene.cameras.main;
    const zoom = camera.zoom || 1;
    const sound = this.scene.sound;
    const audioManager = sound instanceof Phaser.Sound.WebAudioSoundManager ? sound : null;
    const voiceBank = audioManager
      ? (this.scene.cache.audio.get('sfx_caption_voices') as AudioBuffer | undefined)
      : undefined;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i]!;
      if (nowMs - l.endMs >= t.fadeMs) {
        l.playingVoice?.stop();
        for (const c of l.layers) c.destroy();
        this.lines.splice(i, 1);
        continue;
      }
      const p = posOf(l.speakerId);
      if (p) {
        l.x = p.x;
        l.y = p.y;
      }
      if (Number.isNaN(l.x)) l.endMs = Math.min(l.endMs, nowMs);
    }
    this.unstack(zoom);
    for (const l of this.lines) {
      if (Number.isNaN(l.x)) continue;
      const lt = nowMs - l.startMs;
      const fade = Math.max(0, Math.min(1, (nowMs - l.endMs) / t.fadeMs));
      let px = l.x;
      let py = l.y + l.shift / zoom;
      if (l.keepOnScreen) {
        const v = this.scene.cameras.main.worldView;
        const m = 12 / zoom;
        const lo = v.x - l.box.minX / zoom + m;
        const hi = v.right - l.box.maxX / zoom - m;
        px = Math.max(lo, Math.min(px, Math.max(lo, hi)));
        // Clear of the HUD along the top edge.
        const top = v.y + (t.headGapPx - l.box.minY + 64) / zoom + m;
        py = Math.max(top, Math.min(py, v.bottom - m));
      }
      for (const c of l.layers) c.setPosition(px, py).setScale(1 / zoom);
      while (l.cuesFired < l.parsed.cues.length && l.parsed.cues[l.cuesFired]!.atMs <= lt) {
        l.cuesFired++;
        this.onQuake();
      }
      if (audioManager && voiceBank && this.audio && nowMs < l.endMs) {
        const volume = this.audio.volume * this.audio.voiceVolume;
        if (!l.voiceAttempted && volume > 0 && !this.audio.muted) {
          l.playingVoice = this.voicePlayer.play(
            audioManager.context,
            audioManager.destination,
            voiceBank,
            l.voice,
          );
        }
        const distance = l.keepOnScreen
          ? 0
          : Math.hypot(l.x - camera.midPoint.x, l.y - camera.midPoint.y);
        l.playingVoice?.mix(distance, volume, this.audio.muted);
      }
      l.voiceAttempted = true;
      const rise = -t.fadeRisePx * fade;
      const alpha = l.alpha * (1 - fade);
      for (let g = 0; g < l.parsed.glyphs.length; g++) {
        const pair = l.texts[g];
        if (!pair) continue;
        const glyph = l.parsed.glyphs[g]!;
        const age = lt - glyph.appearMs;
        if (age < 0) {
          for (const txt of pair) txt.setVisible(false);
          continue;
        }
        const slot = l.placed[g]!;
        const slotX = slot.x;
        const slotY = slot.y - t.headGapPx;
        const ctx = {
          age,
          t: lt,
          index: g,
          rand: hash01(l.seed + g),
          slotX,
          slotY,
          popMs: t.popMs,
          sizePx: t.fontPx * glyph.size,
        };
        const pose: GlyphPose = { dx: 0, dy: 0, scale: 1, rot: 0, alpha: 1 };
        const pIn = Math.min(1, age / t.popMs);
        if (pIn < 1) {
          const enter = glyph.effects.map((e) => getEffect(e)?.enter).find((f) => !!f);
          (enter ?? defaultEnter)(pose, pIn, ctx);
        }
        for (const e of glyph.effects) getEffect(e)?.frame?.(pose, ctx);
        for (const txt of pair) {
          txt
            .setVisible(true)
            .setPosition(slotX + pose.dx, slotY + pose.dy + rise)
            .setScale(pose.scale)
            .setRotation(pose.rot)
            .setAlpha(alpha * pose.alpha);
        }
      }
    }
  }

  /** Older lines stay put; a newer line that would cover one moves up above it. */
  private unstack(zoom: number): void {
    const gap = this.tuning.speech.headGapPx;
    const placed: { l: number; r: number; top: number; bottom: number }[] = [];
    for (const line of this.lines) {
      if (Number.isNaN(line.x)) continue;
      const left = line.x * zoom + line.box.minX;
      const right = line.x * zoom + line.box.maxX;
      const bottom = line.y * zoom - gap;
      const top = bottom + line.box.minY;
      let shift = 0;
      for (let moved = true; moved;) {
        moved = false;
        for (const o of placed) {
          if (right > o.l && left < o.r && top + shift < o.bottom && bottom + shift > o.top) {
            shift = o.top - bottom - 4;
            moved = true;
          }
        }
      }
      line.shift += (shift - line.shift) * 0.25;
      placed.push({ l: left, r: right, top: top + shift, bottom: bottom + shift });
    }
  }

  clear(): void {
    this.voicePlayer.clear();
    for (const l of this.lines) for (const c of l.layers) c.destroy();
    this.lines.length = 0;
  }

  destroy(): void {
    this.clear();
    this.measurer?.destroy();
    this.measurer = null;
  }
}
