/**
 * (PHASE18) Basic training's extras over the battle ([D155]): the drill sergeant walking along
 * the west fence, keeping level with you and yelling (speech that never leaves the screen), and
 * the course's signposts. Not part of the sim: nothing here is recorded.
 */
import type Phaser from 'phaser';
import { fitPx } from '../content/assets';
import { DRILL_SERGEANT_VOICE } from '../content/caption-voices';
import { BT_CHEVRONS, BT_H, BT_W } from '../content/maps/basic-training';
import type { SignDef } from '../content/sign-styles';
import { str } from '../content/strings';
import { cloneWorldText } from '../content/world-text';
import type { Vec2 } from '../sim/core/vec';
import type { World } from '../sim/sim';
import { findPath } from '../sim/world/nav';
import type { WorldView } from '../sim/view';
import { DEPTH } from '../render/depth';
import type { SessionOverlay } from '../render/phaser/services';
import { SignpostLayer } from '../render/worldtext/signpost-layer';
import { SpeechLayer } from '../render/worldtext/speech-layer';
import type { BasicTraining, BtSay } from './basic-training';

const SARGE = 'sarge';
/** How big he's drawn, and how see-through. */
const SARGE_SIZE = 36;
const GHOST_ALPHA = 0.6; // TUNE
const GHOST_TINT = 0xbfe3ff;
/** Tagging along: he stays about here from you (behind-left), and only moves when you leave it. */
const FOLLOW_OFFSET = { x: -90, y: 70 }; // TUNE
const FOLLOW_SLACK = 70; // TUNE

export const BT_SIGNS: readonly SignDef[] = [
  { id: 'bt-s-move', x: 420, y: 4140, kind: 'wood', textKey: 'bt.sign.move', size: 44 },
  { id: 'bt-s-range', x: 420, y: 3820, kind: 'wood', textKey: 'bt.sign.range', size: 44 },
  { id: 'bt-s-flag', x: 420, y: 3300, kind: 'wood', textKey: 'bt.sign.flag', size: 44 },
  { id: 'bt-s-mg', x: 420, y: 1460, kind: 'plate', textKey: 'bt.sign.mg', size: 44 },
  { id: 'bt-s-nade', x: 420, y: 840, kind: 'plate', textKey: 'bt.sign.grenade', size: 44 },
  { id: 'bt-s-sniper', x: 520, y: 450, kind: 'plate', textKey: 'bt.sign.sniper', size: 44 },
];

/**
 * The drill sergeant is a ghost outside the timelines: he can't be hurt, nothing collides with
 * him, and he's not in the sim or the tape. The same man between lives: one per page.
 */
const sarge = { x: 520, y: 4300 };

export function basicTrainingOverlay(director: BasicTraining): SessionOverlay {
  let scene: Phaser.Scene;
  let liveId = '';
  let started = false;
  let speech: SpeechLayer;
  let signs: SignpostLayer;
  let body: Phaser.GameObjects.Image;
  let tag: Phaser.GameObjects.Text;
  let floor: Phaser.GameObjects.Graphics;
  const queue: (BtSay & { at: number; keep?: boolean })[] = [];
  const timing = () => director.script.timing;
  let lastFrame = -1;
  let quietUntil = 0;
  let livePos: { x: number; y: number } | null = null;
  let lastView: WorldView | null = null;
  let world: World;
  let look = cloneWorldText();
  /** The way he's running (around walls, like any soldier), and what it was worked out for. */
  let route: Vec2[] = [];
  let routeFor: Vec2 | null = null;
  let routeAt = -1e9;

  /** Queues lines; an urgent one cuts him off and drops what he hadn't said yet. */
  const enqueue = (says: BtSay[], keep = false) => {
    const now = scene.time.now;
    for (const say of says) {
      if (say.urgent) {
        queue.length = 0;
        speech.clear();
        quietUntil = 0;
      }
      queue.push({ ...say, at: now, ...(keep ? { keep } : {}) });
    }
  };

  /** Next point on his way to `goal` (a path round the walls; gates count as walls while shut). */
  const waypoint = (nowMs: number, goal: Vec2): Vec2 => {
    const moved = !routeFor || Math.hypot(goal.x - routeFor.x, goal.y - routeFor.y) > 30;
    if (moved || nowMs - routeAt > 700) {
      route = findPath(world, { x: sarge.x, y: sarge.y }, goal) ?? [goal];
      routeFor = { x: goal.x, y: goal.y };
      routeAt = nowMs;
    }
    while (route.length > 1 && Math.hypot(route[0]!.x - sarge.x, route[0]!.y - sarge.y) < 12) {
      route.shift();
    }
    return route[0] ?? goal;
  };

  /**
   * Runs him toward `goal` along the map's paths (or just turns to `face`) and draws him. He
   * moves like a soldier but is a ghost: nothing he does touches the game.
   */
  const move = (nowMs: number, dt: number, goal: Vec2 | null, face: number | null) => {
    if (goal) {
      const to = waypoint(nowMs, goal);
      const left = Math.hypot(goal.x - sarge.x, goal.y - sarge.y);
      const dx = to.x - sarge.x;
      const dy = to.y - sarge.y;
      const d = Math.hypot(dx, dy);
      const step = Math.min(d, timing().speed * dt);
      if (d > 1) {
        sarge.x += (dx / d) * step;
        sarge.y += (dy / d) * step;
      }
      // Running: face the way he goes; arrived: face where the lesson says.
      body.setRotation(left > 6 || face === null ? Math.atan2(dy, dx) : face);
    } else {
      route = [];
      routeFor = null;
      if (face !== null) body.setRotation(face);
    }
    sarge.x = Math.max(60, Math.min(BT_W - 60, sarge.x));
    sarge.y = Math.max(60, Math.min(BT_H - 60, sarge.y));
    body.setPosition(sarge.x, sarge.y);
    tag.setPosition(sarge.x, sarge.y + 28);
  };

  /** One line at a time. */
  const talk = (nowMs: number) => {
    // His pacing is the script's (and the editor changes it live).
    const t = timing();
    look.speech.holdMs = t.holdMs;
    look.speech.holdPerCharMs = t.holdPerCharMs;
    look.speech.wordMs = t.wordMs;
    look.speech.wordPerCharMs = t.wordPerCharMs;
    while (queue.length && !queue[0]!.keep && nowMs - queue[0]!.at > timing().staleMs)
      queue.shift();
    if (queue.length || speech.isSpeaking(SARGE)) director.spoke(nowMs);
    if (queue.length && !speech.isSpeaking(SARGE) && nowMs >= quietUntil) {
      const say = queue.shift()!;
      speech.say(SARGE, say.text, {
        keepOnScreen: true,
        color: '#fff3d6',
        voice: DRILL_SERGEANT_VOICE,
      });
      quietUntil = nowMs + timing().lineGapMs;
    }
    speech.update(nowMs, (id) => (id === SARGE ? sarge : null));
  };

  return {
    create(s, id, display, w) {
      scene = s;
      world = w;
      route = [];
      routeFor = null;
      liveId = id;
      started = false;
      queue.length = 0;
      lastFrame = -1;
      look = cloneWorldText();
      speech = new SpeechLayer(scene, look, display);
      signs = new SignpostLayer(scene, BT_SIGNS, look);
      floor = scene.add.graphics().setDepth(DEPTH.decals + 1);
      body = scene.add
        .image(sarge.x, sarge.y, 'npc_sarge')
        .setScale(SARGE_SIZE / fitPx('npc_sarge'))
        .setAlpha(GHOST_ALPHA)
        .setTint(GHOST_TINT)
        .setDepth(DEPTH.labels - 1);
      tag = scene.add
        .text(sarge.x, sarge.y + 28, str('bt.sarge.name'), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#e8dfbd',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setAlpha(GHOST_ALPHA + 0.2)
        .setDepth(DEPTH.labels)
        .setResolution(2);
      scene.events.once('shutdown', () => speech.destroy());
    },
    destroy() {
      speech.destroy();
      signs.destroy();
      body.destroy();
      tag.destroy();
      floor.destroy();
    },
    onStep(view: WorldView) {
      lastView = view;
      const me = view.soldiers.find((x) => x.id === liveId);
      const now = scene.time.now;
      if (!started && me?.alive) {
        started = true;
        enqueue(director.startLife(liveId, view, now));
      }
      if (started) enqueue(director.step(view, now, sarge));
    },
    respawnUpdate(nowMs, view) {
      const dt = lastFrame < 0 ? 0 : Math.min(0.1, (nowMs - lastFrame) / 1000);
      lastFrame = nowMs;
      enqueue(director.respawnSays(nowMs), true); // nothing to run from: he says it all
      const g = director.respawnGuide();
      let goal: { x: number; y: number } | null = null;
      if (g) {
        // Never off screen: if where he should be is out of view, he waits at the edge nearest it.
        const cx = view.x + view.width / 2;
        const cy = view.y + view.height / 2;
        const hw = Math.max(40, view.width / 2 - 90);
        const hh = Math.max(40, view.height / 2 - 90);
        const dx = g.at.x - cx;
        const dy = g.at.y - cy;
        const t = Math.min(1, hw / (Math.abs(dx) || 1e-6), hh / (Math.abs(dy) || 1e-6));
        goal = { x: cx + dx * t, y: cy + dy * t };
      }
      move(nowMs, dt, goal, g ? g.face : null);
      talk(nowMs);
    },
    update(nowMs, live, input) {
      const dt = lastFrame < 0 ? 0 : Math.min(0.1, (nowMs - lastFrame) / 1000);
      lastFrame = nowMs;
      if (live) livePos = live;
      // Where he wants to be: where the lesson is, else tagging along with you.
      const guide = lastView ? director.guide(lastView, nowMs) : null;
      let face: number | null = null;
      let goal: { x: number; y: number } | null = null;
      if (guide) {
        goal = guide.at;
        face = guide.face;
      } else if (livePos) {
        const want = { x: livePos.x + FOLLOW_OFFSET.x, y: livePos.y + FOLLOW_OFFSET.y };
        if (Math.hypot(want.x - sarge.x, want.y - sarge.y) > FOLLOW_SLACK) goal = want;
        face = Math.atan2(livePos.y - sarge.y, livePos.x - sarge.x);
      }
      move(nowMs, dt, goal, face);
      talk(nowMs);
      signs.update(nowMs, live, input.fire);
      drawChevrons(floor, nowMs);
    },
  };
}

/** Spacing and size of the floor chevrons (world units). */
const CHEVRON_GAP = 46;
const CHEVRON_SIZE = 16;

/**
 * Where to go: chevrons on the floor, marching along each path (a brighter pulse runs from start
 * to end). The sprint lane's are bigger and red.
 */
function drawChevrons(g: Phaser.GameObjects.Graphics, nowMs: number): void {
  g.clear();
  for (const c of BT_CHEVRONS) {
    const dx = c.to.x - c.from.x;
    const dy = c.to.y - c.from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const ux = dx / len;
    const uy = dy / len;
    const size = c.sprint ? CHEVRON_SIZE * 1.8 : CHEVRON_SIZE;
    const gap = c.sprint ? CHEVRON_GAP * 1.3 : CHEVRON_GAP;
    const n = Math.max(1, Math.floor(len / gap));
    const color = c.sprint ? 0xff5a3c : 0xffd34d;
    const speed = c.sprint ? 0.004 : 0.0025;
    for (let i = 0; i <= n; i++) {
      const x = c.from.x + ux * i * gap;
      const y = c.from.y + uy * i * gap;
      // The pulse: each chevron lights up as it passes.
      const phase = (nowMs * speed - i * 0.35) % 3;
      const lit = Math.max(0, 1 - Math.abs(((phase + 3) % 3) - 0.5));
      g.lineStyle(c.sprint ? 7 : 5, color, 0.25 + 0.6 * lit);
      // A "V" pointing along (ux, uy).
      const bx = x - ux * size;
      const by = y - uy * size;
      g.beginPath();
      g.moveTo(bx - uy * size, by + ux * size);
      g.lineTo(x, y);
      g.lineTo(bx + uy * size, by - ux * size);
      g.strokePath();
    }
  }
}
