/**
 * Draws a WorldView (+ the static MapDef) with pooled Phaser objects. Read-only with respect to
 * the sim: it never touches World, only views and events.
 *
 * Per sim step:   renderer.onStep(prevView, curView)   → effects/sounds from that tick's events
 * Per frame:      renderer.render({ alpha, nowMs, … }) → interpolated drawing
 */
import Phaser from 'phaser';
import { fitPx, type ImageKey } from '../../content/assets';
import { str, strDynamic } from '../../content/strings';
import type { Vec2 } from '../../sim/core/vec';
import type { MapDef } from '../../sim/world/map';
import type { VehicleView, WorldView } from '../../sim/view';
import type { DisplaySettings } from '../../ui/settings/display-settings';
import { DEPTH } from '../depth';
import { cueContextFromView, eventCues, type Cue, type TracerStyle } from '../event-cues';
import { rectViewCenter } from '../geometry';
import { interpPos, lerp, lerpAngle, nearById, SNAP_DISTANCE } from '../interp';
import { emptyVisual, soldierVisual } from '../soldier-style';
import { flagHeights } from '../../sim/entities/capture-point';
import { FreeList, KeyedPool } from './pool';
import type { SoundBank } from './sound-bank';

export interface RendererOptions {
  /** tuning.soldier.spriteRadius ([D14]: the largest of the three soldier sizes). */
  spriteRadius: number;
  /** Render-only: how close the live soldier must be to a lever to show the "[E]" prompt. */
  interactPromptRadius?: number;
}

export interface RenderFrame {
  /** Interpolation alpha in [0, 1) between the previous and current view. */
  alpha: number;
  /** Wall-clock ms (render time only; never fed to the sim). */
  nowMs: number;
  liveId: string | null;
  pointer: Vec2 | null;
}

interface Effect {
  obj: Phaser.GameObjects.Image;
  startMs: number;
  durationMs: number;
  baseScale: number;
  grow: number;
}

interface Tracer {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  style: TracerStyle;
  startMs: number;
}

const TRACER_MS = 110;
/** (06-c) Lever → target links: dash and gap length (world units), as the old dashed Graphics. */
const DASH = 12;
const DASH_TEXTURE = 'aoo_dash';
const HIT_FLASH_MS = 90;
const TRACER_STYLE: Record<TracerStyle, { color: number; width: number; alpha: number }> = {
  live: { color: 0xffe066, width: 2, alpha: 0.95 },
  friendly: { color: 0xcfe0ee, width: 1.5, alpha: 0.5 },
  hostile: { color: 0xff8a3d, width: 2, alpha: 0.85 },
  incoming: { color: 0xff2020, width: 4, alpha: 1 },
};

type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
type Tile = Phaser.GameObjects.TileSprite;
type MutableVec2 = { x: number; y: number };

export class WorldRenderer {
  private cur: WorldView;
  private now = 0;
  /**
   * The view before the latest step. (06-c) Entities are looked up in it by index first
   * (`nearById`: views keep a stable order), so there are no per-step id maps to build.
   */
  private prev: WorldView;
  /** (06-c) Per-frame scratch (no allocations in the soldier loop). */
  private readonly scratchVisual = emptyVisual();
  private readonly livePosBuf: MutableVec2 = { x: 0, y: 0 };

  private readonly hitFlashUntil = new Map<string, number>();
  /** turretId → targetId while a windup is in progress (TurretView has no target field). */
  private readonly windupTargets = new Map<string, string>();
  private readonly effects: Effect[] = [];
  private readonly tracers: Tracer[] = [];
  private pendingCues: Cue[] = [];
  private livePos: Vec2 | null = null;

  // Pools (keyed by entity id).
  private readonly soldiers: KeyedPool<Img>;
  private readonly liveMarkers: KeyedPool<Img>;
  private readonly shields: KeyedPool<Img>;
  private readonly staticOverlays: KeyedPool<Img>;
  private readonly icons: KeyedPool<Img>;
  private readonly labels: KeyedPool<Txt>;
  private readonly turretBases: KeyedPool<Img>;
  private readonly turretGuns: KeyedPool<Img>;
  private readonly mines: KeyedPool<Img>;
  private readonly vehicles: KeyedPool<Img>;
  private readonly gates: KeyedPool<Img>;
  private readonly levers: KeyedPool<Img>;
  private readonly bridgeBases: KeyedPool<Tile>;
  private readonly bridgeTops: KeyedPool<Tile>;
  private readonly objectives: KeyedPool<Img>;
  private readonly captureBases: KeyedPool<Img>;
  private readonly flagPoles: KeyedPool<Img>;
  private readonly flags: KeyedPool<Img>;
  private readonly captureMarkers: KeyedPool<Img>;
  private readonly captureLabels: KeyedPool<Txt>;
  private readonly prompts: KeyedPool<Txt>;
  /** (06-c) Lever links as dashed tile sprites: one quad each instead of per-frame Graphics. */
  private readonly links: KeyedPool<Tile>;
  private readonly allPools: { begin(): void; end(): void }[];
  private readonly effectImages: FreeList<Img>;

  private readonly overlayGfx: Phaser.GameObjects.Graphics;
  private readonly tracerGfx: Phaser.GameObjects.Graphics;
  private readonly hpGfx: Phaser.GameObjects.Graphics;
  private readonly reticle: Img;
  /** Hook for the scene (camera shake, HUD damage flash). */
  onCue: (cue: Cue) => void = () => {};

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapDef,
    initialView: WorldView,
    private readonly settings: DisplaySettings,
    private readonly sounds: SoundBank,
    private readonly opts: RendererOptions,
  ) {
    this.cur = initialView;
    this.prev = initialView;
    const img = (depth: number) => () =>
      skipNoOpSetters(scene.add.image(0, 0, '__DEFAULT').setDepth(depth));
    const tile = (depth: number) => () =>
      skipNoOpSetters(scene.add.tileSprite(0, 0, 64, 64, 'bridge_down').setDepth(depth));
    const text = (depth: number, size: number) => () =>
      scene.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: `${size}px`,
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(depth)
        .setResolution(2);
    this.soldiers = new KeyedPool(img(DEPTH.echoes));
    this.liveMarkers = new KeyedPool(img(DEPTH.liveMarker));
    this.shields = new KeyedPool(img(DEPTH.shield));
    this.staticOverlays = new KeyedPool(img(DEPTH.static + 0.5));
    this.icons = new KeyedPool(img(DEPTH.icons));
    this.labels = new KeyedPool(text(DEPTH.labels, 11));
    this.turretBases = new KeyedPool(img(DEPTH.turrets));
    this.turretGuns = new KeyedPool(img(DEPTH.turrets + 0.5));
    this.mines = new KeyedPool(img(DEPTH.mines));
    this.vehicles = new KeyedPool(img(DEPTH.vehicles));
    this.gates = new KeyedPool(img(DEPTH.gates));
    this.levers = new KeyedPool(img(DEPTH.levers));
    this.bridgeBases = new KeyedPool(tile(DEPTH.bridges));
    this.bridgeTops = new KeyedPool(tile(DEPTH.bridges + 0.5));
    this.objectives = new KeyedPool(img(DEPTH.objectives));
    this.captureBases = new KeyedPool(img(DEPTH.decals));
    this.flagPoles = new KeyedPool(img(DEPTH.objectives + 1));
    this.flags = new KeyedPool(img(DEPTH.objectives + 0.5));
    this.captureMarkers = new KeyedPool(img(DEPTH.spawnMarkers));
    this.captureLabels = new KeyedPool(text(DEPTH.labels, 12));
    this.prompts = new KeyedPool(text(DEPTH.prompts, 13));
    ensureDashTexture(scene);
    this.links = new KeyedPool(() =>
      scene.add
        .tileSprite(0, 0, DASH * 2, 2, DASH_TEXTURE)
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.overlays),
    );
    this.allPools = [
      this.soldiers,
      this.liveMarkers,
      this.shields,
      this.staticOverlays,
      this.icons,
      this.labels,
      this.turretBases,
      this.turretGuns,
      this.mines,
      this.vehicles,
      this.gates,
      this.levers,
      this.bridgeBases,
      this.bridgeTops,
      this.objectives,
      this.captureBases,
      this.flagPoles,
      this.flags,
      this.captureMarkers,
      this.captureLabels,
      this.prompts,
      this.links,
    ];
    this.effectImages = new FreeList(img(DEPTH.effects));
    this.overlayGfx = scene.add.graphics().setDepth(DEPTH.overlays);
    this.tracerGfx = scene.add.graphics().setDepth(DEPTH.tracers);
    this.hpGfx = scene.add.graphics().setDepth(DEPTH.hpBars);
    this.reticle = scene.add.image(0, 0, 'reticle').setDepth(DEPTH.reticle).setVisible(false);
    this.drawStatic();
  }

  /** Ground, water, walls, spawn markers: drawn once. */
  private drawStatic(): void {
    const { scene, map } = this;
    scene.add
      .tileSprite(0, 0, map.width, map.height, 'ground_tile')
      .setOrigin(0)
      .setDepth(DEPTH.ground);
    for (const w of map.water) {
      scene.add.tileSprite(w.x, w.y, w.w, w.h, 'water_tile').setOrigin(0).setDepth(DEPTH.water);
    }
    const shadow = scene.add.graphics().setDepth(DEPTH.walls - 0.5);
    shadow.fillStyle(0x000000, 0.35);
    for (const w of map.walls) shadow.fillRect(w.x + 5, w.y + 5, w.w, w.h);
    for (const w of map.walls) {
      scene.add.tileSprite(w.x, w.y, w.w, w.h, 'wall_tile').setOrigin(0).setDepth(DEPTH.walls);
    }
    const outline = scene.add.graphics().setDepth(DEPTH.walls + 0.5);
    outline.lineStyle(2, 0x15181b, 1);
    for (const w of map.walls) outline.strokeRect(w.x, w.y, w.w, w.h);
    outline.lineStyle(2, 0x0e2a44, 0.9);
    for (const w of map.water) outline.strokeRect(w.x, w.y, w.w, w.h);
    for (const sp of map.spawnPoints) {
      // Forward (capture) spawn markers are drawn with their capture point, only while ours.
      if (sp.kind === 'capture') continue;
      scene.add
        .image(sp.position.x, sp.position.y, 'spawn_marker')
        .setRotation(sp.facing)
        .setDepth(DEPTH.spawnMarkers)
        .setAlpha(0.8);
      scene.add
        .text(sp.position.x, sp.position.y + 38, strDynamic(sp.nameKey), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          color: '#bff5cf',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.spawnMarkers)
        .setResolution(2);
    }
  }

  /** Call once per sim step with the views before/after it. Queues effects for that tick. */
  onStep(prev: WorldView, cur: WorldView, liveId: string | null): void {
    this.cur = cur;
    this.prev = prev;
    for (const t of cur.turrets) if (t.state !== 'windup') this.windupTargets.delete(t.id);
    // State changes that have no event of their own.
    for (let i = 0; i < cur.mines.length; i++) {
      const m = cur.mines[i]!;
      if (m.state === 'armed' && nearById(prev.mines, i, m.id)?.state === 'idle') {
        this.pendingCues.push({ type: 'sound', key: 'sfx_mine_armed', x: m.x, y: m.y, gain: 1 });
      }
    }
    for (const e of cur.events) {
      if (e.kind !== 'captureStageChanged') continue;
      const c = cur.capturePoints.find((x) => x.id === e.id);
      if (c) this.pendingCues.push({ type: 'sound', key: 'sfx_capture', x: c.x, y: c.y, gain: 1 });
    }
    if (cur.events.length) {
      for (const c of eventCues(cur.events, cueContextFromView(cur, liveId)))
        this.pendingCues.push(c);
    }
  }

  /** Feed arbitrary cues (the gallery replays fixture events this way). */
  pushCues(cues: readonly Cue[]): void {
    this.pendingCues.push(...cues);
  }

  /** Interpolated position of the live soldier from the last render. */
  get liveRenderPos(): Vec2 | null {
    return this.livePos;
  }

  /** Where a soldier will be drawn this frame (for the camera), or null if absent. */
  soldierRenderPos(id: string, alpha: number): Vec2 | null {
    const s = this.cur.soldiers.find((x) => x.id === id);
    if (!s) return null;
    const prev = this.prev.soldiers.find((x) => x.id === id);
    return interpPos(prev, s, this.settings.interpolation ? alpha : 1);
  }

  get pooledObjectCount(): number {
    return this.allPools.reduce((n, p) => n + (p as KeyedPool<Img>).totalCount, 0);
  }

  /** (05-b) Game objects drawn last frame (pooled entity objects in use + live effects). */
  get drawnObjectCount(): number {
    return (
      this.allPools.reduce((n, p) => n + (p as KeyedPool<Img>).activeCount, 0) + this.effects.length
    );
  }

  /** (05-b) Soldiers skipped last frame because they were off screen. */
  culledSoldiers = 0;

  render(f: RenderFrame): void {
    const a = this.settings.interpolation ? f.alpha : 1;
    this.now = f.nowMs;
    this.flushCues(f.nowMs);
    for (const p of this.allPools) p.begin();
    this.overlayGfx.clear();
    this.hpGfx.clear();
    this.livePos = null;

    this.drawBridges(a);
    this.drawGates();
    this.drawLevers(f);
    this.drawMines(f.nowMs);
    this.drawObjectives();
    this.drawCapturePoints(f.nowMs);
    this.drawVehicles(a);
    this.drawTurrets(a, f);
    this.drawSoldiers(a, f);

    for (const p of this.allPools) p.end();
    this.drawEffects(f.nowMs);
    this.drawReticle(f.pointer);
    this.updateLoops();
  }

  // ---- cues ---------------------------------------------------------------------------------

  private flushCues(nowMs: number): void {
    if (this.pendingCues.length === 0) return;
    const cues = this.pendingCues;
    this.pendingCues = [];
    const r = this.opts.spriteRadius;
    for (const c of cues) {
      switch (c.type) {
        case 'tracer':
          if (this.settings.tracers || c.style === 'incoming') {
            this.tracers.push({ ...c, startMs: nowMs });
          }
          break;
        case 'muzzle': {
          const off = c.hostile ? 30 : r * 1.7;
          this.spawnEffect(
            'muzzle_flash',
            c.x + Math.cos(c.angle) * off,
            c.y + Math.sin(c.angle) * off,
            nowMs,
            70,
            c.hostile ? 1.2 : 0.8,
            0.2,
            c.angle,
          );
          break;
        }
        case 'impact':
          this.spawnEffect('impact', c.x, c.y, nowMs, 140, 0.7, 0.6);
          break;
        case 'explosion':
          this.spawnEffect('explosion', c.x, c.y, nowMs, 450, (c.radius * 2) / 128, 0.35);
          break;
        case 'hitFlash':
          this.hitFlashUntil.set(c.targetId, nowMs + HIT_FLASH_MS);
          break;
        case 'windup':
          this.windupTargets.set(c.turretId, c.targetId);
          break;
        case 'sound':
          this.sounds.play(
            c.key,
            c.gain,
            c.x !== null && c.y !== null ? { x: c.x, y: c.y } : null,
            nowMs,
          );
          break;
        case 'liveDamaged':
        case 'shake':
          break;
      }
      this.onCue(c);
    }
  }

  private spawnEffect(
    key: ImageKey,
    x: number,
    y: number,
    nowMs: number,
    durationMs: number,
    scale: number,
    grow: number,
    rotation = 0,
  ): void {
    const obj = this.effectImages.take();
    obj.setTexture(key).setPosition(x, y).setRotation(rotation).setScale(scale).setAlpha(1);
    this.effects.push({ obj, startMs: nowMs, durationMs, baseScale: scale, grow });
  }

  private drawEffects(nowMs: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!;
      const t = (nowMs - e.startMs) / e.durationMs;
      if (t >= 1) {
        this.effectImages.give(e.obj);
        this.effects.splice(i, 1);
        continue;
      }
      e.obj.setAlpha(1 - t * t).setScale(e.baseScale * (1 + e.grow * t));
    }
    const g = this.tracerGfx;
    g.clear();
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]!;
      const t = (nowMs - tr.startMs) / TRACER_MS;
      if (t >= 1) {
        this.tracers.splice(i, 1);
        continue;
      }
      const s = TRACER_STYLE[tr.style];
      const incoming = tr.style === 'incoming' && this.settings.incomingFire;
      if (incoming) {
        g.lineStyle(s.width * 3, s.color, 0.25 * (1 - t));
        g.lineBetween(tr.fromX, tr.fromY, tr.toX, tr.toY);
      }
      const st = incoming || tr.style !== 'incoming' ? s : TRACER_STYLE.hostile;
      // Dimmed echoes: their tracers fade back too, so the live soldier's and incoming fire pop.
      const dim = tr.style === 'friendly' && this.settings.dimEchoes ? 0.35 : 1;
      g.lineStyle(st.width, st.color, st.alpha * dim * (1 - t));
      g.lineBetween(tr.fromX, tr.fromY, tr.toX, tr.toY);
    }
  }

  // ---- entities -----------------------------------------------------------------------------

  private applyHitFlash(obj: Img, id: string, nowMs: number): boolean {
    const until = this.hitFlashUntil.get(id);
    if (until !== undefined && nowMs < until) {
      obj.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      return true;
    }
    if (until !== undefined) this.hitFlashUntil.delete(id);
    return false;
  }

  private clearTint(obj: Img): void {
    // (06-c) Most objects are untinted most frames: nothing to clear.
    if (!obj.isTinted) return;
    obj.clearTint();
    obj.setTintMode(Phaser.TintModes.MULTIPLY);
  }

  private hpBar(x: number, y: number, width: number, hp: number, maxHp: number, live = false) {
    const mode = this.settings.hpBars;
    if (mode === 'off' || maxHp <= 0) return;
    const frac = Math.max(0, Math.min(1, hp / maxHp));
    if (mode === 'damaged' && frac >= 1) return;
    const g = this.hpGfx;
    const h = live ? 5 : 4;
    g.fillStyle(0x000000, 0.7).fillRect(x - width / 2 - 1, y - 1, width + 2, h + 2);
    const color = frac > 0.5 ? 0x4cd964 : frac > 0.25 ? 0xff9f0a : 0xff3b30;
    g.fillStyle(color, 1).fillRect(x - width / 2, y, width * frac, h);
  }

  private drawSoldiers(a: number, f: RenderFrame): void {
    const r = this.opts.spriteRadius;
    const now = f.nowMs;
    // (05-b) Off-screen culling: anything outside the camera view (plus a margin for sprites,
    // labels and HP bars) is simply not drawn this frame; the pools hide it. The live soldier is
    // always drawn.
    const view = this.settings.cullOffscreen ? this.cameraView(r * 4) : null;
    const live = f.liveId ? this.cur.soldiers.find((x) => x.id === f.liveId) : undefined;
    const labelR = this.settings.echoLabelRadius;
    let culled = 0;
    const soldiers = this.cur.soldiers;
    const prevSoldiers = this.prev.soldiers;
    const snap2 = SNAP_DISTANCE * SNAP_DISTANCE;
    for (let i = 0; i < soldiers.length; i++) {
      const s = soldiers[i]!;
      const prev = nearById(prevSoldiers, i, s.id);
      // Interpolated position as plain locals (no object per soldier per frame).
      let px = s.x;
      let py = s.y;
      if (prev) {
        const dx = s.x - prev.x;
        const dy = s.y - prev.y;
        if (dx * dx + dy * dy <= snap2) {
          px = prev.x + dx * a;
          py = prev.y + dy * a;
        }
      }
      if (
        view &&
        s.id !== f.liveId &&
        (px < view.x0 || px > view.x1 || py < view.y0 || py > view.y1)
      ) {
        culled++;
        continue;
      }
      const facing = prev ? lerpAngle(prev.facing, s.facing, a) : s.facing;
      const v = soldierVisual(s, this.settings, now, this.scratchVisual);
      if (
        v.label !== null &&
        labelR > 0 &&
        live &&
        Math.hypot(live.x - s.x, live.y - s.y) > labelR
      ) {
        v.label = null;
      }
      const spr = this.soldiers.get(s.id);
      // (06-c) Only touch what changed: most soldiers in a crowd (corpses, statics, waiting
      // echoes) are still, and each setter call stores fresh numbers on the sprite.
      spr.setTexture(v.texture).setDepth(v.depth);
      if (spr.x !== px || spr.y !== py) spr.setPosition(px, py);
      if (spr.rotation !== facing) spr.setRotation(facing);
      const scale = (r * 2) / fitPx(v.texture);
      if (spr.scaleX !== scale || spr.scaleY !== scale) spr.setScale(scale);
      if (spr.alpha !== v.alpha) spr.setAlpha(v.alpha);
      if (!this.applyHitFlash(spr, s.id, now)) this.clearTint(spr);
      if (s.role === 'live' && s.alive && (f.liveId === null || s.id === f.liveId)) {
        this.livePosBuf.x = px;
        this.livePosBuf.y = py;
        this.livePos = this.livePosBuf;
      }
      if (v.liveMarker) {
        const m = this.liveMarkers.get(s.id);
        const pulse = 1 + 0.06 * Math.sin(now / 160);
        m.setTexture('soldier_live_marker')
          .setPosition(px, py)
          .setScale(((r * 2.6) / fitPx('soldier_live_marker')) * pulse);
      }
      if (v.shield) {
        const sh = this.shields.get(s.id);
        sh.setTexture('soldier_shield_ring')
          .setPosition(px, py)
          .setRotation(now / 700)
          .setScale((r * 2.9) / fitPx('soldier_shield_ring'))
          .setAlpha(0.7 + 0.3 * Math.sin(now / 120));
      }
      if (v.staticOverlay > 0) {
        const o = this.staticOverlays.get(s.id);
        const flip = Math.floor(now / 50 + s.ordinal) % 4;
        o.setTexture('static_overlay')
          .setPosition(px, py)
          .setScale((r * 2) / fitPx('static_overlay'))
          .setFlip(flip % 2 === 1, flip >= 2)
          .setAlpha(v.staticOverlay);
      }
      if (v.interruptedIcon) {
        const ic = this.icons.get(s.id);
        ic.setTexture('icon_interrupted')
          .setPosition(px, py - r - 14 + Math.sin(now / 200) * 2)
          .setScale(0.8);
      }
      if (v.label !== null) {
        const t = this.labels.get(s.id);
        if (t.text !== v.label) t.setText(v.label);
        t.setPosition(px + r * 0.95, py + r * 0.95).setAlpha(Math.max(0.6, v.alpha));
      }
      if (s.alive) {
        const isLive = s.role === 'live';
        if (isLive || !this.settings.dimEchoes) {
          this.hpBar(px, py - r - 9, isLive ? 34 : 26, s.hp, s.maxHp, isLive);
        }
      }
    }
    this.culledSoldiers = culled;
  }

  /** The camera's world-space view rectangle, grown by `margin`. */
  private cameraView(margin: number): { x0: number; y0: number; x1: number; y1: number } {
    const cam = this.scene.cameras.main;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    const x0 = cam.scrollX + (cam.width - vw) / 2;
    const y0 = cam.scrollY + (cam.height - vh) / 2;
    return { x0: x0 - margin, y0: y0 - margin, x1: x0 + vw + margin, y1: y0 + vh + margin };
  }

  private drawTurrets(a: number, f: RenderFrame): void {
    const g = this.overlayGfx;
    const turrets = this.cur.turrets;
    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i]!;
      const base = this.turretBases.get(t.id);
      const destroyed = t.state === 'destroyed';
      base.setTexture(destroyed ? 'turret_wreck' : 'turret_base').setPosition(t.x, t.y);
      if (!this.applyHitFlash(base, t.id, f.nowMs)) this.clearTint(base);
      if (destroyed) continue;
      const prev = nearById(this.prev.turrets, i, t.id);
      const aim = prev ? lerpAngle(prev.aim, t.aim, a) : t.aim;
      const gun = this.turretGuns.get(t.id);
      gun.setTexture('turret_gun').setPosition(t.x, t.y).setRotation(aim);
      const ranges = this.settings.turretRanges;
      const active = t.state === 'tracking' || t.state === 'windup';
      if (ranges === 'always' || (ranges === 'active' && active)) {
        g.lineStyle(1.5, 0xff5040, active ? 0.45 : 0.2).strokeCircle(t.x, t.y, t.range);
        if (active) g.fillStyle(0xff3020, 0.05).fillCircle(t.x, t.y, t.range);
      }
      if (t.state === 'windup') {
        const targetId = this.windupTargets.get(t.id);
        const atLive = targetId !== undefined && targetId === f.liveId;
        const pulse = 0.5 + 0.5 * Math.sin(f.nowMs / 40);
        gun.setTint(pulse > 0.5 ? 0xff5050 : 0xffb0b0).setTintMode(Phaser.TintModes.MULTIPLY);
        const len = t.range;
        const ex = t.x + Math.cos(aim) * len;
        const ey = t.y + Math.sin(aim) * len;
        if (atLive && this.settings.incomingFire) {
          g.lineStyle(6, 0xff2020, 0.15 + 0.15 * pulse).lineBetween(t.x, t.y, ex, ey);
          g.lineStyle(2, 0xff3030, 0.6 + 0.4 * pulse).lineBetween(t.x, t.y, ex, ey);
        } else {
          g.lineStyle(1.5, 0xff9040, 0.35 + 0.3 * pulse).lineBetween(t.x, t.y, ex, ey);
        }
      } else if (!this.applyHitFlash(gun, t.id, f.nowMs)) {
        this.clearTint(gun);
      }
      this.hpBar(t.x, t.y - 36, 40, t.hp, t.maxHp);
    }
  }

  private drawMines(nowMs: number): void {
    const g = this.overlayGfx;
    const mode = this.settings.mineRadii;
    for (const m of this.cur.mines) {
      const spr = this.mines.get(m.id);
      if (m.state === 'detonated') {
        spr
          .setTexture('mine_scorch')
          .setPosition(m.x, m.y)
          .setScale((m.blastRadius * 1.3) / fitPx('mine_scorch'))
          .setDepth(DEPTH.decals);
        continue;
      }
      const armed = m.state === 'armed';
      const blink = armed && Math.floor(nowMs / 110) % 2 === 0;
      spr
        .setTexture(blink ? 'mine_armed' : 'mine')
        .setPosition(m.x, m.y)
        .setScale(armed ? 1.1 : 0.9)
        .setDepth(DEPTH.mines);
      if (armed && mode !== 'off') {
        g.lineStyle(2, 0xff3030, blink ? 0.9 : 0.5).strokeCircle(m.x, m.y, m.blastRadius);
        g.fillStyle(0xff2020, blink ? 0.12 : 0.06).fillCircle(m.x, m.y, m.blastRadius);
      } else if (mode === 'always') {
        g.lineStyle(1, 0xffc040, 0.3).strokeCircle(m.x, m.y, m.triggerRadius);
      }
    }
  }

  private drawVehicles(a: number): void {
    const vehicles = this.cur.vehicles;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i]!;
      const prev = nearById(this.prev.vehicles, i, v.id);
      const p = interpPos(prev, v, a);
      const heading = prev ? lerpAngle(prev.heading, v.heading, a) : v.heading;
      const spr = this.vehicles.get(v.id);
      const wreck = v.state === 'wreck';
      spr
        .setTexture(wreck ? 'vehicle_wreck' : 'vehicle')
        .setPosition(p.x, p.y)
        .setRotation(heading)
        // w/h are world-axis extents; the sprite's own x axis runs along the heading.
        .setDisplaySize(...vehicleSpriteSize(v));
      if (!this.applyHitFlash(spr, v.id, this.now)) this.clearTint(spr);
      if (!wreck) this.hpBar(p.x, p.y - v.h / 2 - 10, 40, v.hp, v.maxHp);
    }
  }

  private drawGates(): void {
    for (const gt of this.cur.gates) {
      const c = rectViewCenter(gt);
      this.gates
        .get(gt.id)
        .setTexture(gt.open ? 'gate_open' : 'gate_closed')
        .setPosition(c.x, c.y)
        .setDisplaySize(gt.w, gt.h);
    }
  }

  private drawBridges(a: number): void {
    const bridges = this.cur.bridges;
    for (let i = 0; i < bridges.length; i++) {
      const b = bridges[i]!;
      const c = rectViewCenter(b);
      const prev = nearById(this.prev.bridges, i, b.id);
      const raised = prev ? lerp(prev.raised, b.raised, a) : b.raised;
      const base = this.bridgeBases.get(b.id);
      base
        .setTexture(b.state === 'destroyed' ? 'bridge_destroyed' : 'bridge_down')
        .setPosition(c.x, c.y)
        .setSize(b.w, b.h)
        .setAlpha(b.state === 'destroyed' ? 1 : 1 - raised * 0.6);
      if (b.state === 'destroyed' || raised <= 0.001) continue;
      // Raised part: hazard stripes fading in, slightly "lifted" (scaled up) as it rises.
      const top = this.bridgeTops.get(b.id);
      top
        .setTexture('bridge_up')
        .setPosition(c.x, c.y)
        .setSize(b.w, b.h)
        .setScale(1 + 0.06 * raised)
        .setAlpha(0.25 + 0.75 * raised);
    }
  }

  private drawLevers(f: RenderFrame): void {
    const promptR = this.opts.interactPromptRadius ?? 56;
    const live = f.liveId ? this.cur.soldiers.find((s) => s.id === f.liveId && s.alive) : undefined;
    for (const l of this.cur.levers) {
      this.levers
        .get(l.id)
        .setTexture(l.on ? 'lever_b' : 'lever_a')
        .setPosition(l.x, l.y);
      if (this.settings.leverLinks) {
        const target = this.targetCenter(l.targetId);
        if (target) this.drawLink(l.id, l.x, l.y, target.x, target.y, l.on ? 0x40e070 : 0xb0b6bd);
      }
      if (live && Math.hypot(live.x - l.x, live.y - l.y) <= promptR) {
        const t = this.prompts.get(l.id);
        const label = str('prompt.interact');
        if (t.text !== label) t.setText(label);
        t.setPosition(l.x, l.y - 26);
      }
    }
  }

  private drawObjectives(): void {
    for (const o of this.cur.objectives) {
      const key: ImageKey = o.destroyed ? 'objective_destroyed' : 'objective';
      const spr = this.objectives.get(o.id);
      spr
        .setTexture(key)
        .setPosition(o.x, o.y)
        .setScale((o.radius * 2) / fitPx(key));
      if (!this.applyHitFlash(spr, o.id, this.now)) this.clearTint(spr);
      if (!o.destroyed) this.hpBar(o.x, o.y - o.radius - 12, 56, o.hp, o.maxHp);
    }
  }

  /**
   * (05-a) Capture points: pad, radius circle (team colour by stage), flag pole with the enemy
   * flag lowering / our flag raising, a progress ring, and a highlight on each contributor.
   */
  private drawCapturePoints(nowMs: number): void {
    const g = this.overlayGfx;
    const STAGE_COLOR = { enemy: 0xe0533f, neutral: 0xd8d8d8, ours: 0x4ade80 } as const;
    for (const c of this.cur.capturePoints) {
      const color = STAGE_COLOR[c.stage];
      const base = this.captureBases.get(c.id);
      base
        .setTexture('capture_base')
        .setPosition(c.x, c.y)
        .setScale((Math.min(c.radius, 80) * 2) / fitPx('capture_base'))
        .setAlpha(0.9);
      g.fillStyle(color, c.contributors.length ? 0.12 : 0.06);
      g.fillCircle(c.x, c.y, c.radius);
      g.lineStyle(2, color, 0.8);
      g.strokeCircle(c.x, c.y, c.radius);
      // Progress ring around the radius (clockwise from 12 o'clock).
      if (c.stage !== 'ours' && c.progress > 0) {
        const ringColor = c.stage === 'enemy' ? 0xffd34d : 0x4ade80;
        g.lineStyle(6, ringColor, 0.95);
        g.beginPath();
        g.arc(c.x, c.y, c.radius + 6, -Math.PI / 2, -Math.PI / 2 + c.progress * Math.PI * 2);
        g.strokePath();
      }
      // Pole + flags. The pole's foot sits at the point's centre.
      const poleH = 72;
      const foot = c.y;
      this.flagPoles
        .get(c.id)
        .setTexture('flag_pole')
        .setOrigin(0.5, 1)
        .setPosition(c.x, foot)
        .setScale(poleH / 96);
      const h = flagHeights(c.stage, c.progress);
      const flagKey = h.enemy > 0 ? 'flag_enemy' : h.ours > 0 ? 'flag_ours' : null;
      if (flagKey) {
        const lift = h.enemy > 0 ? h.enemy : h.ours;
        const wave = 1 + Math.sin(nowMs / 180) * 0.06;
        this.flags
          .get(c.id)
          .setTexture(flagKey)
          .setOrigin(0, 0)
          .setPosition(c.x + 1, foot - 14 - lift * (poleH - 22))
          .setScale(0.7 * wave, 0.7);
      }
      // Contributor highlight.
      for (const id of c.contributors) {
        const s = this.cur.soldiers.find((x) => x.id === id);
        if (!s) continue;
        const r = this.opts.spriteRadius + 5 + Math.sin(nowMs / 160) * 1.5;
        g.lineStyle(2, c.stage === 'enemy' ? 0xffd34d : 0x4ade80, 0.9);
        g.strokeCircle(s.x, s.y, r);
      }
      // Label: name (+ "flag" objectives get the HQ name in caps by their string). (06-c) Text and
      // colour are set only when they change: each change re-renders the label's texture.
      const label = this.captureLabels.get(c.id);
      const name = strDynamic(c.nameKey);
      if (label.text !== name) label.setText(name);
      const labelColor =
        c.stage === 'ours' ? '#bff5cf' : c.stage === 'enemy' ? '#ffc2b8' : '#e6e6e6';
      if (label.style.color !== labelColor) label.setColor(labelColor);
      label.setPosition(c.x, c.y + c.radius + 16);
      // A forward spawn point opens while ours: show its insertion marker.
      if (c.stage === 'ours') {
        for (const spId of c.spawnPointIds) {
          const sp = this.map.spawnPoints.find((p) => p.id === spId);
          if (!sp) continue;
          this.captureMarkers
            .get(spId)
            .setTexture('spawn_marker')
            .setPosition(sp.position.x, sp.position.y)
            .setRotation(sp.facing)
            .setAlpha(0.8);
        }
      }
    }
  }

  private drawReticle(pointer: Vec2 | null): void {
    if (!pointer) {
      this.reticle.setVisible(false);
      return;
    }
    this.reticle.setVisible(true).setPosition(pointer.x, pointer.y);
  }

  /** Loops follow the nearest source: vehicle engines, static hum. */
  private updateLoops(): void {
    const cam = this.scene.cameras.main;
    const cx = cam.midPoint.x;
    const cy = cam.midPoint.y;
    this.sounds.setListener(cx, cy);
    let nearVehicle = Infinity;
    for (const v of this.cur.vehicles) {
      if (v.state === 'moving') nearVehicle = Math.min(nearVehicle, Math.hypot(v.x - cx, v.y - cy));
    }
    let nearStatic = Infinity;
    for (const s of this.cur.soldiers) {
      if (s.alive && s.role === 'static')
        nearStatic = Math.min(nearStatic, Math.hypot(s.x - cx, s.y - cy));
    }
    this.sounds.setLoop('sfx_vehicle_loop', 0.5 * this.sounds.loopGainFor(nearVehicle));
    this.sounds.setLoop('sfx_static_hum', 0.35 * this.sounds.loopGainFor(nearStatic));
  }

  /**
   * (06-c) A dashed lever → target line as one tile sprite (a repeating dash texture): the same
   * look as the old per-frame dashed Graphics, without re-tessellating it every frame.
   */
  private drawLink(id: string, x0: number, y0: number, x1: number, y1: number, color: number) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    // Dash length as before: the line split into whole 12-unit segments, every other one drawn.
    const n = Math.max(1, Math.floor(len / DASH));
    const seg = len / n;
    const t = this.links.get(id);
    if (t.width !== len) t.setSize(len, 2);
    t.setPosition(x0, y0)
      .setRotation(Math.atan2(y1 - y0, x1 - x0))
      .setTileScale(seg / DASH, 1)
      .setTint(color)
      .setAlpha(0.45);
  }

  private targetCenter(id: string): Vec2 | undefined {
    const gate = this.cur.gates.find((g) => g.id === id);
    if (gate) return rectViewCenter(gate);
    const bridge = this.cur.bridges.find((b) => b.id === id);
    if (bridge) return rectViewCenter(bridge);
    return undefined;
  }
}

/**
 * (06-c) Pooled objects are redrawn every frame with the same texture and depth most of the time.
 * Phaser's `setTexture` re-resolves the texture and frame (and resizes) and `setDepth` queues a
 * sort of the whole display list on every call, even for the same value; skip those no-ops.
 */
function skipNoOpSetters<T extends Img | Tile>(o: T): T {
  const setTexture = o.setTexture.bind(o);
  const setDepth = o.setDepth.bind(o);
  o.setTexture = ((key: string, frame?: string | number) =>
    frame === undefined && o.texture.key === key ? o : setTexture(key, frame)) as T['setTexture'];
  o.setDepth = ((value: number) => (o.depth === value ? o : setDepth(value))) as T['setDepth'];
  return o;
}

/** (06-c) A 24×2 texture: 12 px of white dash, 12 px gap (tinted per link). */
function ensureDashTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(DASH_TEXTURE)) return;
  const tex = scene.textures.createCanvas(DASH_TEXTURE, DASH * 2, 2);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, DASH, 2);
  tex.refresh();
}

/** Sprite size (length along heading, width across) from a vehicle's world-axis extents. */
export function vehicleSpriteSize(v: Pick<VehicleView, 'w' | 'h' | 'heading'>): [number, number] {
  const vertical = Math.abs(Math.sin(v.heading)) > Math.SQRT1_2;
  return vertical ? [v.h, v.w] : [v.w, v.h];
}
