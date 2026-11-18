/**
 * Signposts in the world. Stand by one and a ring fills around it; then its frame grows up out
 * of the post, as if the soldier leaned in to read it. Walk away (or fire) and it shrinks back
 * into the post. The frame is the sign kind's (wood → wooden frame, clipboard → paper) unless the
 * sign names another.
 *
 * (PHASE18) A sign's text can come from the app (`content`), and it can carry buttons: tap or
 * click them once the sign is open, or press 1–9 (E / Enter for the first). Buttons are DOM
 * elements laid over the frame, so taps work above the touch controls and a click never fires
 * the gun.
 */
import type Phaser from 'phaser';
import { fitPx } from '../../content/assets';
import { FRAME_STYLES, SIGN_KINDS, type SignDef } from '../../content/sign-styles';
import { strDynamic } from '../../content/strings';
import type { WorldTextTuning } from '../../content/world-text';
import { injectStyle } from '../../ui/dom';
import { DEPTH } from '../depth';
import { easeOutBack, getEffect, hash01, type GlyphPose } from './effects';
import { fontStack, loadWorldTextFonts } from './fonts';
import { layoutGlyphs, parseLine } from './markup';
import { SIGN_IDLE, stepSign, type SignState } from './signpost-model';

/** World size of a signpost sprite (unless the sign says otherwise). */
const POST_SIZE = 30;
/** Button rows inside a frame (screen px). */
const BTN_H = 30;
const BTN_GAP = 6;
const BTN_MIN_W = 190;

export interface SignButton {
  label: string;
  run(): void;
}

export interface SignContent {
  /** Speech markup. */
  text: string;
  buttons?: readonly SignButton[];
}

export interface SignpostOptions {
  /** The sign's text and buttons when it opens (default: its `textKey`, no buttons). */
  content?: (def: SignDef) => SignContent | null;
  /** Where the buttons go (default: document.body). */
  domRoot?: HTMLElement;
}

interface Sign {
  def: SignDef;
  post: Phaser.GameObjects.Image;
  state: SignState;
  /** Built each time it opens (its content may have changed). */
  frame: Phaser.GameObjects.Container | null;
  frameW: number;
  frameH: number;
  glyphs: { txt: Phaser.GameObjects.Text; x: number; y: number; effects: string[] }[];
  buttons: { el: HTMLButtonElement; y: number }[];
  /** Button area width and left edge (frame-local px). */
  btnX: number;
  btnW: number;
}

const css = `
.aoo-signbtns { position: fixed; inset: 0; pointer-events: none; z-index: 30; }
.aoo-signbtns button { position: absolute; pointer-events: auto; box-sizing: border-box;
  font: 600 13px/1 system-ui, sans-serif; color: #f4efe0; background: #3d4628;
  border: 2px solid #c8c0a0; border-radius: 6px; cursor: pointer; padding: 0 8px;
  text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  touch-action: manipulation; }
.aoo-signbtns button:hover { background: #56623a; border-color: #ffd34d; }
.aoo-signbtns button .k { color: #ffd34d; margin-right: 6px; }
`;

export class SignpostLayer {
  private readonly signs: Sign[] = [];
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly btnRoot: HTMLElement;
  private readonly onKey: (e: KeyboardEvent) => void;
  private lastMs = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    defs: readonly SignDef[],
    public tuning: WorldTextTuning,
    private readonly opts: SignpostOptions = {},
  ) {
    loadWorldTextFonts();
    injectStyle('aoo-signbtns-style', css);
    this.btnRoot = document.createElement('div');
    this.btnRoot.className = 'aoo-signbtns';
    (opts.domRoot ?? document.body).appendChild(this.btnRoot);
    this.ring = scene.add.graphics().setDepth(DEPTH.signs);
    for (const def of defs) {
      const key = SIGN_KINDS[def.kind].post;
      const post = scene.add
        .image(def.x, def.y, key)
        .setScale((def.size ?? POST_SIZE) / fitPx(key))
        .setDepth(DEPTH.objectives);
      this.signs.push({
        def,
        post,
        state: { ...SIGN_IDLE },
        frame: null,
        frameW: 0,
        frameH: 0,
        glyphs: [],
        buttons: [],
        btnX: 0,
        btnW: 0,
      });
    }
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey);
    scene.events.once('shutdown', () => this.destroy());
  }

  /** Rebuild every sign's frame (after the look or the content changed). Open ones stay open. */
  rebuild(): void {
    for (const s of this.signs) this.drop(s);
  }

  /**
   * Every frame. `reader`: the soldier who reads (null: nobody), `fired`: they fired this frame.
   */
  update(nowMs: number, reader: { x: number; y: number } | null, fired: boolean): void {
    const dt = this.lastMs < 0 ? 0 : Math.min(100, nowMs - this.lastMs);
    this.lastMs = nowMs;
    const t = this.tuning.sign;
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom || 1;
    this.ring.clear();
    for (const s of this.signs) {
      const size = s.def.size ?? POST_SIZE;
      const readR = s.def.radius ?? t.readRadius + Math.max(0, (size - POST_SIZE) / 2);
      const tt = { ...t, readRadius: readR, closeRadius: t.closeRadius + (readR - t.readRadius) };
      const d = reader ? Math.hypot(reader.x - s.def.x, reader.y - s.def.y) : null;
      s.state = stepSign(s.state, dt, d, fired, tt);
      if (s.state.phase === 'reading' && s.state.ring > 0) {
        const r = Math.max(22, size * 0.6);
        this.ring.lineStyle(2, 0xffffff, 0.35);
        this.ring.strokeCircle(s.def.x, s.def.y, r);
        this.ring.lineStyle(4, 0xffd34d, 0.95);
        this.ring.beginPath();
        this.ring.arc(s.def.x, s.def.y, r, -Math.PI / 2, -Math.PI / 2 + s.state.ring * Math.PI * 2);
        this.ring.strokePath();
      }
      if (s.state.open <= 0) {
        if (s.frame) this.drop(s);
        s.post.setAlpha(1);
        continue;
      }
      if (!s.frame) this.build(s);
      const f = s.frame!;
      // Grow from the post (its size on screen) to full size above it.
      const p = s.state.phase === 'closing' ? s.state.open ** 2 : easeOutBack(s.state.open, 1.3);
      const postPx = Math.min(size, 60) * zoom;
      const startScale = Math.min(1, postPx / Math.max(s.frameW, s.frameH));
      const scale = startScale + (1 - startScale) * p;
      const base = s.def.y - (size > 60 ? size * 0.3 : 0);
      const lift = (t.hoverPx + s.frameH / 2) * p;
      const fx = s.def.x;
      const fy = base - lift / zoom;
      f.setVisible(true)
        .setPosition(fx, fy)
        .setScale(scale / zoom)
        .setAlpha(Math.min(1, s.state.open * 3));
      s.post.setAlpha(size > 60 ? 1 : 1 - 0.4 * Math.min(1, s.state.open));
      this.placeButtons(s, fx, fy, s.state.phase === 'open');
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

  /** Lays the DOM buttons over the frame's button slots (only once it's fully open). */
  private placeButtons(s: Sign, fx: number, fy: number, show: boolean): void {
    if (!s.buttons.length) return;
    const cam = this.scene.cameras.main;
    const canvas = this.scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const k = rect.width / (this.scene.scale.width || 1);
    const zoom = cam.zoom || 1;
    const midX = cam.scrollX + cam.width / 2;
    const midY = cam.scrollY + cam.height / 2;
    // Frame centre on the canvas, then each slot in screen px (the frame is drawn at 1/zoom).
    const cx = ((fx - midX) * zoom + cam.width / 2) * k + rect.left;
    const cy = ((fy - midY) * zoom + cam.height / 2) * k + rect.top;
    for (const b of s.buttons) {
      b.el.style.display = show ? '' : 'none';
      if (!show) continue;
      b.el.style.left = `${cx + (s.btnX - s.frameW / 2) * k}px`;
      b.el.style.top = `${cy + (b.y - s.frameH / 2) * k}px`;
      b.el.style.width = `${s.btnW * k}px`;
      b.el.style.height = `${BTN_H * k}px`;
    }
  }

  private key(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const open = this.signs.find((s) => s.state.phase === 'open' && s.buttons.length);
    if (!open) return;
    let i = -1;
    if (/^[1-9]$/.test(e.key)) i = Number(e.key) - 1;
    else if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') i = 0;
    const b = open.buttons[i];
    if (!b) return;
    e.preventDefault();
    b.el.click();
  }

  private drop(s: Sign): void {
    s.frame?.destroy();
    s.frame = null;
    s.glyphs = [];
    for (const b of s.buttons) b.el.remove();
    s.buttons = [];
  }

  private build(s: Sign): void {
    const t = this.tuning.sign;
    const style = FRAME_STYLES[s.def.frame ?? SIGN_KINDS[s.def.kind].frame];
    const content = this.opts.content?.(s.def) ?? { text: strDynamic(s.def.textKey) };
    const parsed = parseLine(content.text, {
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
    const buttons = content.buttons ?? [];
    const tw = Math.max(maxX - minX, buttons.length ? BTN_MIN_W : 0);
    const th = -minY;
    const btnBlock = buttons.length ? buttons.length * (BTN_H + BTN_GAP) + BTN_GAP : 0;
    const w = Math.max(style.slice * 2 + 8, tw + style.padX * 2);
    const h = Math.max(style.slice * 2, th + btnBlock + style.padY * 2);
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
    // Text at the top of the frame, buttons under it.
    const textTop = -h / 2 + style.padY;
    made.forEach((txt, i) => {
      if (!txt) return;
      const x = placed[i]!.x - (minX + maxX) / 2;
      const y = placed[i]!.y + th + textTop;
      txt.setPosition(x, y);
      c.add(txt);
      s.glyphs.push({ txt, x, y, effects: parsed.glyphs[i]!.effects });
    });
    s.btnX = style.padX;
    s.btnW = w - style.padX * 2;
    s.buttons = buttons.map((b, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      if (i < 9) {
        const kEl = document.createElement('span');
        kEl.className = 'k';
        kEl.textContent = String(i + 1);
        el.append(kEl);
      }
      el.append(document.createTextNode(b.label));
      el.style.display = 'none';
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        b.run();
      });
      this.btnRoot.appendChild(el);
      return { el, y: style.padY + th + BTN_GAP + i * (BTN_H + BTN_GAP) };
    });
    s.frame = c;
    s.frameW = w;
    s.frameH = h;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    for (const s of this.signs) {
      this.drop(s);
      s.post.destroy();
    }
    this.ring.destroy();
    this.btnRoot.remove();
  }
}
