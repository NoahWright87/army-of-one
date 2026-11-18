/**
 * Signposts in the world. Stand by one and a ring fills around it; then its frame grows up out
 * of the post, as if the soldier leaned in to read it. Walk away (or fire) and it shrinks back
 * into the post. The frame is the sign kind's (wood → wooden frame, clipboard → paper) unless the
 * sign names another.
 */
import type Phaser from 'phaser';
import { fitPx } from '../../content/assets';
import { FRAME_STYLES, SIGN_KINDS, type SignDef } from '../../content/sign-styles';
import { strDynamic } from '../../content/strings';
import type { WorldTextTuning } from '../../content/world-text';
import { DEPTH } from '../depth';
import { easeOutBack, getEffect, hash01, type GlyphPose } from './effects';
import { fontStack, loadWorldTextFonts } from './fonts';
import { layoutGlyphs, parseLine } from './markup';
import { SIGN_IDLE, stepSign, type SignState } from './signpost-model';

/** World size of a signpost sprite. */
const POST_SIZE = 30;
/** The read ring around a post (world units). */
const RING_R = 22;

interface Sign {
  def: SignDef;
  post: Phaser.GameObjects.Image;
  state: SignState;
  /** Built on first open (the font has loaded by then). */
  frame: Phaser.GameObjects.Container | null;
  frameW: number;
  frameH: number;
  glyphs: { txt: Phaser.GameObjects.Text; x: number; y: number; effects: string[] }[];
}

export class SignpostLayer {
  private readonly signs: Sign[] = [];
  private readonly ring: Phaser.GameObjects.Graphics;
  private lastMs = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    defs: readonly SignDef[],
    public tuning: WorldTextTuning,
  ) {
    loadWorldTextFonts();
    this.ring = scene.add.graphics().setDepth(DEPTH.signs);
    for (const def of defs) {
      const key = SIGN_KINDS[def.kind].post;
      const post = scene.add
        .image(def.x, def.y, key)
        .setScale(POST_SIZE / fitPx(key))
        .setDepth(DEPTH.objectives);
      this.signs.push({
        def,
        post,
        state: { ...SIGN_IDLE },
        frame: null,
        frameW: 0,
        frameH: 0,
        glyphs: [],
      });
    }
  }

  /** Drop every built frame (after the text tuning changed). */
  rebuild(): void {
    for (const s of this.signs) {
      s.frame?.destroy();
      s.frame = null;
      s.glyphs = [];
    }
  }

  /**
   * Every frame. `reader`: the soldier who reads (null: nobody), `fired`: they fired this frame.
   */
  update(nowMs: number, reader: { x: number; y: number } | null, fired: boolean): void {
    const dt = this.lastMs < 0 ? 0 : Math.min(100, nowMs - this.lastMs);
    this.lastMs = nowMs;
    const t = this.tuning.sign;
    const zoom = this.scene.cameras.main.zoom || 1;
    this.ring.clear();
    for (const s of this.signs) {
      const d = reader ? Math.hypot(reader.x - s.def.x, reader.y - s.def.y) : null;
      s.state = stepSign(s.state, dt, d, fired, t);
      if (s.state.phase === 'reading' && s.state.ring > 0) {
        this.ring.lineStyle(2, 0xffffff, 0.35);
        this.ring.strokeCircle(s.def.x, s.def.y, RING_R);
        this.ring.lineStyle(4, 0xffd34d, 0.95);
        this.ring.beginPath();
        this.ring.arc(
          s.def.x,
          s.def.y,
          RING_R,
          -Math.PI / 2,
          -Math.PI / 2 + s.state.ring * Math.PI * 2,
        );
        this.ring.strokePath();
      }
      if (s.state.open <= 0) {
        s.frame?.setVisible(false);
        s.post.setAlpha(1);
        continue;
      }
      if (!s.frame) this.build(s);
      const f = s.frame!;
      // Grow from the post (its size on screen) to full size above it.
      const p = s.state.phase === 'closing' ? s.state.open ** 2 : easeOutBack(s.state.open, 1.3);
      const postPx = POST_SIZE * zoom;
      const startScale = Math.min(1, postPx / Math.max(s.frameW, s.frameH));
      const scale = startScale + (1 - startScale) * p;
      const lift = (t.hoverPx + s.frameH / 2) * p;
      f.setVisible(true)
        .setPosition(s.def.x, s.def.y - lift / zoom)
        .setScale(scale / zoom)
        .setAlpha(Math.min(1, s.state.open * 3));
      s.post.setAlpha(1 - 0.4 * Math.min(1, s.state.open));
      for (let i = 0; i < s.glyphs.length; i++) {
        const g = s.glyphs[i]!;
        if (!g.effects.length) continue;
        const pose: GlyphPose = { dx: 0, dy: 0, scale: 1, rot: 0, alpha: 1 };
        const ctx = {
          age: 1e9,
          t: nowMs,
          index: i,
          rand: hash01(i),
          slotX: g.x,
          slotY: g.y,
          popMs: 1,
          sizePx: t.fontPx,
        };
        for (const e of g.effects) getEffect(e)?.frame?.(pose, ctx);
        g.txt
          .setPosition(g.x + pose.dx, g.y + pose.dy)
          .setScale(pose.scale)
          .setRotation(pose.rot);
      }
    }
  }

  private build(s: Sign): void {
    const t = this.tuning.sign;
    const style = FRAME_STYLES[s.def.frame ?? SIGN_KINDS[s.def.kind].frame];
    const parsed = parseLine(strDynamic(s.def.textKey), {
      ...this.tuning.speech,
      autoAllWords: 999,
    });
    const font = fontStack(t.font);
    const made = parsed.glyphs.map((g) =>
      g.ch.trim()
        ? this.scene.add
            .text(0, 0, g.ch, {
              fontFamily: font,
              fontSize: `${t.fontPx * g.size}px`,
              padding: { x: t.fontPx * g.size * 0.3, y: t.fontPx * g.size * 0.15 },
              color: g.color ?? style.ink,
              ...(style.outline ? { stroke: style.outline, strokeThickness: 3 } : {}),
            })
            .setOrigin(0.5)
            .setResolution(Math.max(2, window.devicePixelRatio || 1))
        : null,
    );
    const placed = layoutGlyphs(
      parsed.glyphs,
      (g) => {
        const i = parsed.glyphs.indexOf(g);
        return made[i]
          ? made[i]!.width - t.fontPx * g.size * 0.6 - (style.outline ? 3 : 0)
          : t.fontPx * g.size * 0.32;
      },
      (size) => t.fontPx * size * 1.15,
      t.maxWidthPx,
    );
    // Bounds of the laid-out text (anchored bottom-centre at 0,0).
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    placed.forEach((p, i) => {
      if (!made[i]) return;
      const sz = t.fontPx * parsed.glyphs[i]!.size;
      const hw = (made[i]!.width - sz * 0.6) / 2;
      minX = Math.min(minX, p.x - hw);
      maxX = Math.max(maxX, p.x + hw);
      minY = Math.min(minY, p.y - (made[i]!.height - sz * 0.3) / 2);
    });
    const tw = maxX - minX;
    const th = -minY;
    const w = Math.max(style.slice * 2 + 8, tw + style.padX * 2);
    const h = Math.max(style.slice * 2, th + style.padY * 2);
    const box = this.scene.add.nineslice(
      0,
      0,
      style.image,
      undefined,
      w,
      h,
      style.slice,
      style.slice,
      style.slice,
      style.slice,
    );
    const c = this.scene.add.container(0, 0, [box]).setDepth(DEPTH.signs);
    s.glyphs = [];
    made.forEach((txt, i) => {
      if (!txt) return;
      const x = placed[i]!.x - (minX + maxX) / 2;
      const y = placed[i]!.y + th / 2;
      txt.setPosition(x, y);
      c.add(txt);
      s.glyphs.push({ txt, x, y, effects: parsed.glyphs[i]!.effects });
    });
    s.frame = c;
    s.frameW = w;
    s.frameH = h;
  }

  destroy(): void {
    for (const s of this.signs) {
      s.frame?.destroy();
      s.post.destroy();
    }
    this.ring.destroy();
  }
}
