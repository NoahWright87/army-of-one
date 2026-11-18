/**
 * Draws a WorldView (+ the static MapDef) with pooled Phaser objects. Read-only with respect to
 * the sim: it never touches World, only views and events.
 *
 * Per sim step:   renderer.onStep(prevView, curView)   → effects/sounds from that tick's events
 * Per frame:      renderer.render({ alpha, nowMs, … }) → interpolated drawing
 */
import { DEFAULT_TUNING, PROJECTILE_VISUAL_TUNING } from '../../content/tuning';
import { TICKS_PER_SECOND } from '../../sim/core/time';
import { ProjectileTrails, projectileStyle } from '../projectile-trails';
import { coverArtLayout } from '../cover-art';
import { drawGround } from './terrain-ground';
import { isPaintedRect } from '../terrain/transition-rules';
import { TERRAIN_ART } from '../../content/terrain-art';
import Phaser from 'phaser';
import {
  PROJECTILE_ART,
  bulletArt,
  IMPACT_SHEET,
  impactAnimationKey,
  impactRow,
  type ProjectileArt,
} from '../../content/combat-art';
import {
  EXPLOSION_SHEETS,
  explosionAnimationKey,
  explosionDurationMs,
} from '../../content/explosions';
import { ICON_ROLES, roleIconDocument } from '../../content/role-icons';
import type { RoleId } from '../../contracts/mission';
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
import { pilotMiniature, corpsePose } from '../pilot-miniatures';
import { vehicleMiniature } from '../vehicle-miniatures';
import { INFANTRY_BASE_SCALE, INFANTRY_FIGURE_SCALE } from '../../content/miniatures';
import { flagHeights } from '../../sim/entities/capture-point';
import { FreeList, KeyedPool } from './pool';
import type { SoundBank } from './sound-bank';

/** (PHASE12-b) Vehicle body radii for drawing (the sim's are `tuning.drive.*.bodyRadius`). */
const VEHICLE_BODY = {
  truck: DEFAULT_TUNING.drive.truck.bodyRadius,
  tank: DEFAULT_TUNING.drive.tank.bodyRadius,
} as const;

/** Role icon textures rasterised from the shared tactical SVGs in content/role-icons. */
const ROLE_ICON_PX = 64;
const roleIconKey = (roleId: RoleId) => `role_icon_${roleId}`;
function ensureRoleIconTextures(scene: Phaser.Scene): void {
  for (const roleId of ICON_ROLES) {
    const key = roleIconKey(roleId);
    if (scene.textures.exists(key)) continue;
    const svg = roleIconDocument(roleId, ROLE_ICON_PX, '#f4f6f8');
    scene.textures.addBase64(key, `data:image/svg+xml;base64,${btoa(svg)}`);
  }
}

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
  obj: Phaser.GameObjects.Sprite;
  startMs: number;
  durationMs: number;
  baseScale: number;
  grow: number;
  animated?: boolean;
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
/** (07-c) The reticle's ring radius when exact (world units), and how big it may grow. */
const RETICLE_BASE_R = 8;
const RETICLE_MAX_R = 90;
/** (06-c) Lever → target links: dash and gap length (world units), as the old dashed Graphics. */
const DASH = 12;
const DASH_TEXTURE = 'aoo_dash';
const HIT_FLASH_MS = 90;
const TRACER_STYLE: Record<TracerStyle, { color: number; width: number; alpha: number }> = {
  live: { color: 0xffe066, width: 2, alpha: 0.95 },
  friendly: { color: 0xb5a47a, width: 1.5, alpha: 0.5 },
  hostile: { color: 0xff8a3d, width: 2, alpha: 0.85 },
  incoming: { color: 0xff2020, width: 4, alpha: 1 },
  fragment: { color: 0xffb060, width: 1.5, alpha: 0.85 }, // (07-c) always drawn
};

type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
type Tile = Phaser.GameObjects.TileSprite;
type MutableVec2 = { x: number; y: number };

export class WorldRenderer {
  /** (07-c) Cover arcs, grenades and the throw ring, redrawn each frame. */
  private coverGfx!: Phaser.GameObjects.Graphics;
  /** Static cover quads are reused when destruction/replay switches their texture. */
  private readonly coverPieces = new Map<string, { sprite: Tile; shadow: Tile }>();
  private rubbleKey = '';
  private grenadeGfx!: Phaser.GameObjects.Graphics;
  private readonly projectileTrails = new ProjectileTrails();
  private readonly projectileTrailGfx: Phaser.GameObjects.Graphics;
  private readonly projectileCoreGfx: Phaser.GameObjects.Graphics;
  /** (07-c) The aim circle (current spread cone) and the MG mount ring around the reticle. */
  private reticleGfx!: Phaser.GameObjects.Graphics;
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
  private readonly miniatureBases: KeyedPool<Img>;
  private readonly miniatureShadows: KeyedPool<Img>;
  private readonly liveMarkers: KeyedPool<Img>;
  private readonly shields: KeyedPool<Img>;
  private readonly staticOverlays: KeyedPool<Img>;
  private readonly icons: KeyedPool<Img>;
  /** (PHASE12-d) A role icon on every soldier's circle (PLACEHOLDER art, content/role-icons). */
  private readonly roleIcons: KeyedPool<Img>;
  private readonly labels: KeyedPool<Txt>;
  private readonly turretBases: KeyedPool<Img>;
  private readonly turretShadows: KeyedPool<Img>;
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
  private readonly effectImages: FreeList<Phaser.GameObjects.Sprite>;
  private readonly projectiles: KeyedPool<Img>;
  private readonly vehicleTurrets: KeyedPool<Img>;

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
    this.projectileTrails.record(initialView.tick, projectilePositions(initialView));
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
    this.projectiles = new KeyedPool(img(DEPTH.effects - 0.5));
    this.vehicleTurrets = new KeyedPool(img(DEPTH.echoes));
    this.miniatureBases = new KeyedPool(img(DEPTH.echoes));
    this.miniatureShadows = new KeyedPool(img(DEPTH.echoes));
    this.liveMarkers = new KeyedPool(img(DEPTH.liveMarker));
    this.shields = new KeyedPool(img(DEPTH.shield));
    this.staticOverlays = new KeyedPool(img(DEPTH.static + 0.5));
    this.icons = new KeyedPool(img(DEPTH.icons));
    this.roleIcons = new KeyedPool(img(DEPTH.liveMarker + 0.5));
    ensureRoleIconTextures(scene);
    this.labels = new KeyedPool(text(DEPTH.labels, 11));
    this.turretBases = new KeyedPool(img(DEPTH.turrets));
    this.turretShadows = new KeyedPool(img(DEPTH.turrets - 0.25));
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
      this.projectiles,
      this.vehicleTurrets,
      this.soldiers,
      this.miniatureBases,
      this.miniatureShadows,
      this.liveMarkers,
      this.shields,
      this.staticOverlays,
      this.icons,
      this.roleIcons,
      this.labels,
      this.turretBases,
      this.turretShadows,
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
    this.effectImages = new FreeList(() =>
      scene.add.sprite(0, 0, '__DEFAULT').setDepth(DEPTH.effects),
    );
    this.overlayGfx = scene.add.graphics().setDepth(DEPTH.overlays);
    this.coverGfx = scene.add.graphics().setDepth(DEPTH.icons);
    this.grenadeGfx = scene.add.graphics().setDepth(DEPTH.bridges + 0.5);
    this.projectileTrailGfx = scene.add.graphics().setDepth(DEPTH.effects - 1);
    this.projectileCoreGfx = scene.add.graphics().setDepth(DEPTH.effects - 0.25);
    this.reticleGfx = scene.add.graphics().setDepth(DEPTH.reticle);
    this.tracerGfx = scene.add.graphics().setDepth(DEPTH.tracers);
    this.hpGfx = scene.add.graphics().setDepth(DEPTH.hpBars);
    this.reticle = scene.add.image(0, 0, 'reticle').setDepth(DEPTH.reticle).setVisible(false);
    this.drawStatic();
  }

  /** Ground, water, walls, spawn markers: drawn once. */
  private drawStatic(): void {
    const { scene, map } = this;
    scene.add
      .tileSprite(0, 0, map.width, map.height, TERRAIN_ART.G)
      .setOrigin(0)
      .setDepth(DEPTH.ground);
    if (map.ground) drawGround(scene, map.ground);
    for (const w of map.water) {
      if (isPaintedRect(map.ground, w, ['W'])) continue;
      scene.add.tileSprite(w.x, w.y, w.w, w.h, TERRAIN_ART.W).setOrigin(0).setDepth(DEPTH.water);
    }
    // (PHASE13-d) Ground outside this level ([D109]): seen, not entered.
    if (map.bounds?.length) {
      const out = scene.add.graphics().setDepth(DEPTH.water + 0.5);
      out.fillStyle(0x05070a, 0.6);
      for (const b of map.bounds) out.fillRect(b.x, b.y, b.w, b.h);
    }
    // Neighbouring levels' ground ([D113]): walkable, a light haze.
    if (map.haze?.length) {
      const hz = scene.add.graphics().setDepth(DEPTH.water + 0.4);
      hz.fillStyle(0x0a0d12, 0.22);
      for (const b of map.haze) hz.fillRect(b.x, b.y, b.w, b.h);
    }
    const shadow = scene.add.graphics().setDepth(DEPTH.walls - 0.5);
    shadow.fillStyle(0x000000, 0.35);
    for (const w of map.walls)
      if (!isPaintedRect(map.ground, w, ['K', 'X'])) shadow.fillRect(w.x + 5, w.y + 5, w.w, w.h);
    for (const w of map.walls) {
      if (isPaintedRect(map.ground, w, ['K', 'X'])) continue;
      const kind =
        map.ground?.rows[Math.floor(w.y / map.ground.cellSize)]?.[
          Math.floor(w.x / map.ground.cellSize)
        ];
      scene.add
        .tileSprite(w.x, w.y, w.w, w.h, kind === 'K' ? TERRAIN_ART.K : TERRAIN_ART.X)
        .setOrigin(0)
        .setDepth(DEPTH.walls);
    }
    const outline = scene.add.graphics().setDepth(DEPTH.walls + 0.5);
    outline.lineStyle(2, 0x15181b, 1);
    for (const w of map.walls)
      if (!isPaintedRect(map.ground, w, ['K', 'X'])) outline.strokeRect(w.x, w.y, w.w, w.h);
    outline.lineStyle(2, 0x0e2a44, 0.9);
    for (const w of map.water)
      if (!isPaintedRect(map.ground, w, ['W'])) outline.strokeRect(w.x, w.y, w.w, w.h);
    // Tiled sections retain material proportions at every authored length/orientation.
    for (const c of map.cover ?? []) {
      const l = coverArtLayout(c, false);
      const make = (dx: number, dy: number) =>
        scene.add
          .tileSprite(l.x + dx, l.y + dy, l.width, l.height, l.key)
          .setRotation(l.rotation)
          .setTileScale(l.tileScale);
      const sprite = make(0, 0).setDepth(DEPTH.walls);
      const contact = make(3, 3)
        .setTint(0x000000)
        .setAlpha(0.28)
        .setDepth(DEPTH.walls - 0.25);
      this.coverPieces.set(c.id, { sprite, shadow: contact });
    }
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
    this.projectileTrails.record(cur.tick, projectilePositions(cur));
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
    this.drawCoverAndThrows(f);
    this.drawRubble();
    this.drawGrenades(a, f);

    for (const p of this.allPools) p.end();
    this.drawEffects(f.nowMs);
    this.drawReticle(f.pointer, f.liveId);
    this.updateLoops();
  }

  /** Texture swap only; destruction/collision still belongs entirely to the sim. */
  private drawRubble(): void {
    const down = this.cur.coverDestroyed ?? [];
    const key = down.join(',');
    if (key === this.rubbleKey) return;
    this.rubbleKey = key;
    for (const def of this.map.cover ?? []) {
      const destroyed = down.includes(def.id);
      const piece = this.coverPieces.get(def.id)!;
      const l = coverArtLayout(def, destroyed);
      piece.sprite
        .setTexture(l.key)
        .setSize(l.width, l.height)
        .setTileScale(l.tileScale)
        .setDepth(destroyed ? DEPTH.decals : DEPTH.walls);
      piece.shadow.setVisible(!destroyed);
    }
  }

  /**
   * (07-c) The live soldier's cover arcs ([D34]): one arc per nearby cover piece or wall, pointing
   * at it, thicker and darker for better cover. Plus the Grenadier's wind-up ring at the aimed
   * landing point, filling up as the throw winds up ([D37]).
   */
  private drawCoverAndThrows(f: RenderFrame): void {
    const g = this.coverGfx;
    g.clear();
    // The view's arcs belong to its live soldier.
    const live = f.liveId
      ? this.cur.soldiers.find((x) => x.id === f.liveId)
      : this.cur.soldiers.find((x) => x.role === 'live' && x.alive);
    const pos = this.livePos;
    if (!live || !live.alive || !pos) return;
    const r = this.opts.spriteRadius + 7;
    for (const arc of this.cur.coverArcs ?? []) {
      const v = Math.max(0, Math.min(1, arc.value));
      g.lineStyle(2.5 + v * 3.5, 0x101418, 0.5 + v * 0.45);
      g.beginPath();
      g.arc(pos.x, pos.y, r, arc.angle - arc.halfWidth, arc.angle + arc.halfWidth, false);
      g.strokePath();
      g.lineStyle(1.5, 0xffffff, 0.35 + v * 0.45);
      g.beginPath();
      g.arc(
        pos.x,
        pos.y,
        r + 3 + v * 2,
        arc.angle - arc.halfWidth,
        arc.angle + arc.halfWidth,
        false,
      );
      g.strokePath();
    }
    if (live.windup !== undefined && live.windupAim !== undefined) {
      const tx = pos.x + Math.cos(live.facing) * live.windupAim;
      const ty = pos.y + Math.sin(live.facing) * live.windupAim;
      const ringR = 18;
      g.lineStyle(2, 0xffffff, 0.35);
      g.strokeCircle(tx, ty, ringR);
      g.lineStyle(4, 0xffd34d, 0.95);
      g.beginPath();
      g.arc(tx, ty, ringR, -Math.PI / 2, -Math.PI / 2 + live.windup * 2 * Math.PI, false);
      g.strokePath();
    }
  }

  /** (07-c) Grenades in flight: a shadow on the ground and the grenade raised by its height. */
  private drawGrenades(a: number, f: RenderFrame): void {
    const g = this.grenadeGfx;
    g.clear();
    this.projectileTrailGfx.clear();
    this.projectileCoreGfx.clear();
    const renderTick = lerp(this.prev.tick, this.cur.tick, a);
    const zoom = Math.max(
      1 / PROJECTILE_VISUAL_TUNING.maxZoomCompensation,
      this.scene.cameras.main.zoom,
    );
    // Histories contain actual travel only; never a predicted line out to weapon range.
    const prevB = this.prev.bullets ?? [];
    const bullets = this.cur.bullets ?? [];
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i]!;
      const p = nearById(prevB, i, b.id);
      const x = p ? lerp(p.x, b.x, a) : b.x;
      const y = p ? lerp(p.y, b.y, a) : b.y;
      const id = `bullet:${b.id}`;
      const style = projectileStyle(b.hostile, b.by, f.liveId);
      const alpha = style.alpha * (style.alpha < 1 && this.settings.dimEchoes ? 0.7 : 1);
      this.drawProjectile(id, bulletArt(b.weapon), x, y, b.angle, b.hostile).setAlpha(alpha);
      this.drawProjectileTrail(id, x, y, renderTick, zoom, style, alpha, b.weapon === 'shotgun');
      this.drawProjectileCore(x, y, b.angle, zoom, style.core, alpha);
    }
    // Tank shells use the large pointed round; bazookas use the finned rocket.
    const prevR = this.prev.rockets ?? [];
    for (const r of this.cur.rockets ?? []) {
      const p = prevR.find((x) => x.id === r.id);
      const x = p ? lerp(p.x, r.x, a) : r.x;
      const y = p ? lerp(p.y, r.y, a) : r.y;
      const id = `rocket:${r.id}`;
      const style = projectileStyle(r.hostile ?? false, r.by, f.liveId);
      const alpha = style.alpha * (style.alpha < 1 && this.settings.dimEchoes ? 0.7 : 1);
      this.drawProjectile(
        id,
        r.shell ? 'rifle' : 'rocket',
        x,
        y,
        r.angle,
        r.hostile ?? false,
        r.shell ? 1.25 : 1,
      ).setAlpha(alpha);
      this.drawProjectileTrail(id, x, y, renderTick, zoom, style, alpha, false, !r.shell);
      if (r.shell) this.drawProjectileCore(x, y, r.angle, zoom, style.core, alpha);
    }
    const prev = this.prev.grenades ?? [];
    for (const gr of this.cur.grenades ?? []) {
      const p = prev.find((x) => x.id === gr.id);
      const x = p ? lerp(p.x, gr.x, a) : gr.x;
      const y = p ? lerp(p.y, gr.y, a) : gr.y;
      const z = p ? lerp(p.z, gr.z, a) : gr.z;
      const cam = this.scene.cameras.main;
      const origin = cam.getWorldPoint(0, 0);
      const shadow = cam.getWorldPoint(z * 0.15 * cam.zoom, z * 0.15 * cam.zoom);
      const raised = cam.getWorldPoint(0, -z * 0.6 * cam.zoom);
      const sx = x + shadow.x - origin.x;
      const sy = y + shadow.y - origin.y;
      const width =
        PROJECTILE_VISUAL_TUNING.grenadeShadowWidth +
        z * PROJECTILE_VISUAL_TUNING.grenadeShadowHeightSpread;
      const opacity = Math.max(0.22, 0.44 - z * 0.004);
      // Soft outer penumbra, darker contact center; higher grenades cast broader, fainter shadows.
      g.fillStyle(0x000000, opacity * 0.25);
      g.fillEllipse(sx, sy, width * 1.5, width);
      g.fillStyle(0x000000, opacity * 0.45);
      g.fillEllipse(sx, sy, width, width * 0.66);
      g.fillStyle(0x000000, opacity * 0.6);
      g.fillEllipse(sx, sy, width * 0.62, width * 0.4);
      const blink = gr.fuse > 0.7 && Math.floor(f.nowMs / 90) % 2 === 0;
      const obj = this.drawProjectile(
        `grenade:${gr.id}`,
        'grenade',
        x + raised.x - origin.x,
        y + raised.y - origin.y,
        0,
        false,
        1 + z * 0.0075,
      );
      if (blink) obj.setTint(0xff5040);
    }
  }

  private drawProjectileTrail(
    id: string,
    x: number,
    y: number,
    tick: number,
    zoom: number,
    style: ReturnType<typeof projectileStyle>,
    alpha: number,
    pellet: boolean,
    smoke = false,
  ): void {
    if (!this.settings.tracers) return;
    const t = PROJECTILE_VISUAL_TUNING;
    const segments = this.projectileTrails.segments(
      id,
      x,
      y,
      tick,
      ((smoke ? t.smokeMs : t.trailMs) / 1000) * TICKS_PER_SECOND,
      smoke ? t.smokeMaxLength : pellet ? t.pelletTrailMaxLength : t.trailMaxLength,
    );
    const g = this.projectileTrailGfx;
    for (const s of segments) {
      const fade = s.strength * alpha;
      const width = ((smoke ? 5 : t.minCorePixels) * (0.3 + 0.7 * s.strength)) / zoom;
      g.lineStyle(width + 2 / zoom, 0x171b20, fade * (smoke ? 0.18 : 0.65));
      g.lineBetween(s.x0, s.y0, s.x1, s.y1);
      g.lineStyle(width, style.color, fade * (smoke ? 0.4 : 0.9));
      g.lineBetween(s.x0, s.y0, s.x1, s.y1);
      if (!smoke) {
        g.lineStyle(width * 0.45, style.core, fade * 0.8);
        g.lineBetween(s.x0, s.y0, s.x1, s.y1);
      }
    }
  }

  private drawProjectileCore(
    x: number,
    y: number,
    angle: number,
    zoom: number,
    color: number,
    alpha: number,
  ): void {
    const g = this.projectileCoreGfx;
    const width = PROJECTILE_VISUAL_TUNING.minCorePixels / zoom;
    const dx = Math.cos(angle) * width;
    const dy = Math.sin(angle) * width;
    g.lineStyle(width + 2 / zoom, 0x171b20, alpha * 0.9);
    g.lineBetween(x - dx, y - dy, x + dx, y + dy);
    g.lineStyle(width, color, alpha);
    g.lineBetween(x - dx, y - dy, x + dx, y + dy);
  }

  private drawProjectile(
    id: string,
    art: ProjectileArt,
    x: number,
    y: number,
    angle: number,
    hostile: boolean,
    scale = 1,
  ): Img {
    const spec = PROJECTILE_ART[art];
    const obj = this.projectiles.get(id);
    obj
      .setTexture(spec.key)
      .setPosition(x, y)
      .setRotation(angle)
      .setScale((spec.displayWidth / spec.width) * scale)
      .setAlpha(1);
    obj.clearTint();
    if (hostile) obj.setTint(0xff997a);
    return obj;
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
          if (this.settings.tracers || c.style === 'incoming' || c.style === 'fragment') {
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
        case 'impact': {
          const row = impactRow(c.x, c.y, c.metal);
          const obj = this.effectImages.take();
          obj
            .stop()
            .setTexture(IMPACT_SHEET.key, row * IMPACT_SHEET.columns)
            .setPosition(c.x, c.y)
            .setRotation(0)
            .setScale(0.28)
            .setAlpha(1);
          obj.play(impactAnimationKey(row));
          this.effects.push({
            obj,
            startMs: nowMs,
            durationMs: (IMPACT_SHEET.columns / IMPACT_SHEET.frameRate) * 1000,
            baseScale: 0.28,
            grow: 0,
            animated: true,
          });
          break;
        }
        case 'explosion': {
          const spec = EXPLOSION_SHEETS[c.size];
          const obj = this.effectImages.take();
          obj
            .stop()
            .setTexture(spec.key, c.variation * spec.columns)
            .setPosition(c.x, c.y)
            .setRotation(0)
            .setScale((c.radius * 2) / spec.frameWidth)
            .setAlpha(1);
          obj.play(explosionAnimationKey(c.size, c.variation));
          this.effects.push({
            obj,
            startMs: nowMs,
            durationMs: explosionDurationMs(c.size),
            baseScale: obj.scaleX,
            grow: 0,
            animated: true,
          });
          break;
        }
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
    obj.stop().setTexture(key).setPosition(x, y).setRotation(rotation).setScale(scale).setAlpha(1);
    this.effects.push({ obj, startMs: nowMs, durationMs, baseScale: scale, grow });
  }

  private drawEffects(nowMs: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!;
      const t = (nowMs - e.startMs) / e.durationMs;
      // Native animations start on Sprite.preUpdate (one frame after a cue is flushed).
      // Let completion retire them so the last frame is never clipped by the wall-clock timer.
      if (e.animated ? !e.obj.anims.isPlaying : t >= 1) {
        e.obj.stop();
        this.effectImages.give(e.obj);
        this.effects.splice(i, 1);
        continue;
      }
      if (!e.animated) e.obj.setAlpha(1 - t * t).setScale(e.baseScale * (1 + e.grow * t));
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
    // Fixed screen-space contact shadow even when the camera turns or zooms.
    const cam = this.scene.cameras.main;
    const origin = cam.getWorldPoint(0, 0);
    const offset = cam.getWorldPoint(2, 3);
    const shadowDx = offset.x - origin.x;
    const shadowDy = offset.y - origin.y;
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
      const mini = pilotMiniature(s.roleId, s.role, s.alive);
      const vehicle = vehicleMiniature(s.roleId, s.role, s.alive);
      const vBody = s.roleId === 'truck' || s.roleId === 'tank' ? VEHICLE_BODY[s.roleId] : 0;
      const texture = vehicle?.hull ?? mini?.figure ?? v.texture;
      const opacity = mini && !s.alive ? Math.max(v.alpha, 0.55) : v.alpha;
      const pose = mini && !s.alive ? corpsePose(px, py, s.deathDirection ?? s.facing, r) : null;
      const figureX = pose?.x ?? px;
      const figureY = pose?.y ?? py;
      const figureFacing = pose?.facing ?? facing;
      if (vehicle) {
        v.label = null;
        const scale = (vBody * 2) / fitPx(vehicle.hull);
        this.miniatureBases
          .get(s.id)
          .setTexture(vehicle.base)
          .setPosition(px, py)
          .setRotation(facing)
          .setScale(scale)
          .setAlpha(opacity * (s.alive ? 1 : 0.45))
          .setDepth(v.depth - 0.1);
        this.miniatureShadows
          .get(s.id)
          .setTexture(vehicle.shadow)
          .setPosition(px + shadowDx, py + shadowDy)
          .setRotation(0)
          .setScale(scale)
          .setAlpha(opacity)
          .setDepth(v.depth - 0.2);
        if (vehicle.turret) {
          const aim = prev
            ? lerpAngle(prev.turret ?? prev.facing, s.turret ?? facing, a)
            : (s.turret ?? facing);
          const turret = this.vehicleTurrets.get(s.id);
          turret
            .setTexture(vehicle.turret)
            .setPosition(px, py)
            .setRotation(aim)
            .setScale(scale)
            .setAlpha(opacity)
            .setDepth(v.depth + 0.1);
          if (!this.applyHitFlash(turret, s.id, now)) this.clearTint(turret);
        }
      }
      if (mini) {
        v.label = null; // Numbers stay on the timeline, not the miniature.
        const scale = (r * 2) / fitPx(mini.figure);
        if (mini.base) {
          this.miniatureBases
            .get(s.id)
            .setTexture(mini.base)
            .setPosition(px, py)
            .setRotation(0)
            .setScale(scale * INFANTRY_BASE_SCALE)
            .setAlpha(opacity)
            .setDepth(v.depth - 0.1);
        }
        this.miniatureShadows
          .get(s.id)
          .setTexture('mini_shadow_infantry')
          .setPosition(figureX + shadowDx, figureY + shadowDy)
          .setRotation(0)
          .setScale(scale * (s.alive ? INFANTRY_BASE_SCALE : 0.8))
          .setAlpha(opacity)
          .setDepth(v.depth - 0.2);
      }
      const spr = this.soldiers.get(s.id);
      // (06-c) Only touch what changed: most soldiers in a crowd (corpses, statics, waiting
      // echoes) are still, and each setter call stores fresh numbers on the sprite.
      spr.setTexture(texture).setDepth(v.depth);
      if (spr.x !== figureX || spr.y !== figureY) spr.setPosition(figureX, figureY);
      if (spr.rotation !== figureFacing) spr.setRotation(figureFacing);
      const scale =
        (((vBody > 0 ? vBody : r) * 2) / fitPx(texture)) * (mini ? INFANTRY_FIGURE_SCALE : 1);
      if (spr.scaleX !== scale || spr.scaleY !== scale) spr.setScale(scale);
      if (spr.alpha !== opacity) spr.setAlpha(opacity);
      // (PHASE12-d) The role icon on the circle, upright so it reads at a glance.
      if (vBody === 0 && s.alive && !mini) {
        const key = roleIconKey(s.roleId ?? 'rifleman');
        if (this.scene.textures.exists(key)) {
          const ic = this.roleIcons.get(s.id);
          if (ic.texture.key !== key) ic.setTexture(key);
          ic.setPosition(px, py)
            .setScale((r * 1.25) / ROLE_ICON_PX)
            .setAlpha(opacity);
          if (ic.depth !== v.depth + 0.5) ic.setDepth(v.depth + 0.5); // just above its soldier
        }
      }
      if (!this.applyHitFlash(spr, s.id, now)) this.clearTint(spr);
      if (s.role === 'live' && s.alive && (f.liveId === null || s.id === f.liveId)) {
        this.livePosBuf.x = px;
        this.livePosBuf.y = py;
        this.livePos = this.livePosBuf;
      }
      if (v.liveMarker && !mini && !vehicle) {
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
        t.setPosition(px + r * 0.95, py + r * 0.95).setAlpha(Math.max(0.6, opacity));
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
      const key = destroyed ? 'turret_wreck' : 'turret_base';
      base
        .setTexture(key)
        .setPosition(t.x, t.y)
        .setScale(64 / fitPx(key));
      this.turretShadows
        .get(t.id)
        .setTexture(key)
        .setPosition(t.x + 3, t.y + 4)
        .setScale(64 / fitPx(key))
        .setTint(0x000000)
        .setAlpha(destroyed ? 0.18 : 0.28);
      if (!this.applyHitFlash(base, t.id, f.nowMs)) this.clearTint(base);
      if (destroyed) continue;
      const prev = nearById(this.prev.turrets, i, t.id);
      const aim = prev ? lerpAngle(prev.aim, t.aim, a) : t.aim;
      const gun = this.turretGuns.get(t.id);
      gun
        .setTexture('turret_gun')
        .setPosition(t.x, t.y)
        .setRotation(aim)
        .setScale(64 / fitPx('turret_gun'));
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

  /**
   * The reticle ([D39], [D43]): the only aim indicator. It grows to fit the current spread cone
   * at its distance (aiming further, moving and sustained fire all grow it). A Machine Gunner
   * mounting on cover gets a ring filling around it, and it turns cyan once the mounted bonus
   * applies ([D40]). With auto-aim, the input source puts it just short of the target.
   */
  private drawReticle(pointer: Vec2 | null, liveId: string | null): void {
    const g = this.reticleGfx;
    g.clear();
    // Drawn as thin vector lines (the same ring + four ticks as the `reticle` image), so it can
    // grow without getting blurry or heavy.
    this.reticle.setVisible(false);
    if (!pointer) return;
    const live = liveId ? this.cur.soldiers.find((x) => x.id === liveId) : undefined;
    const mounted = !!live?.mounted;
    const pos = this.livePos;
    let r = RETICLE_BASE_R;
    if (live && live.alive && pos && live.aimSpread !== undefined) {
      const d = Math.hypot(pointer.x - pos.x, pointer.y - pos.y);
      r = Math.max(
        RETICLE_BASE_R,
        Math.min(RETICLE_MAX_R, d * Math.tan(Math.min(live.aimSpread, 1.2))),
      );
    }
    const color = mounted ? 0x4dd8ff : 0xffffff;
    const { x, y } = pointer;
    const tick = 7;
    const stroke = (w: number, c: number, a: number) => {
      g.lineStyle(w, c, a);
      g.strokeCircle(x, y, r);
      g.lineBetween(x, y - r - tick, x, y - r + 3);
      g.lineBetween(x, y + r - 3, x, y + r + tick);
      g.lineBetween(x - r - tick, y, x - r + 3, y);
      g.lineBetween(x + r - 3, y, x + r + tick, y);
    };
    stroke(4, 0x000000, 0.45);
    stroke(2, color, 0.95);
    g.fillStyle(color, 0.9);
    g.fillCircle(x, y, 1.5);
    if (live?.mount !== undefined && live.mount < 1) {
      g.lineStyle(3, 0x4dd8ff, 0.9);
      g.beginPath();
      g.arc(x, y, r + tick + 5, -Math.PI / 2, -Math.PI / 2 + live.mount * 2 * Math.PI, false);
      g.strokePath();
    }
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

/** Namespaces preserve uniqueness even in hand-authored gallery fixtures. */
function projectilePositions(view: WorldView) {
  return [
    ...(view.bullets ?? []).map((b) => ({ id: `bullet:${b.id}`, x: b.x, y: b.y })),
    ...(view.rockets ?? []).map((r) => ({ id: `rocket:${r.id}`, x: r.x, y: r.y })),
  ];
}

/** Sprite size (length along heading, width across) from a vehicle's world-axis extents. */
export function vehicleSpriteSize(v: Pick<VehicleView, 'w' | 'h' | 'heading'>): [number, number] {
  const vertical = Math.abs(Math.sin(v.heading)) > Math.SQRT1_2;
  return vertical ? [v.h, v.w] : [v.w, v.h];
}
