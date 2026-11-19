/**
 * (PHASE18) Basic training's extras over the battle ([D155]): the drill sergeant walking along
 * the west fence, keeping level with you and yelling (speech that never leaves the screen), and
 * the course's signposts. Not part of the sim: nothing here is recorded.
 */
import type Phaser from 'phaser';
import { fitPx } from '../content/assets';
import { BT_CHEVRONS, BT_FENCE_X, BT_H, BT_SARGE_X } from '../content/maps/basic-training';
import type { SignDef } from '../content/sign-styles';
import { str, type StringKey } from '../content/strings';
import { cloneWorldText } from '../content/world-text';
import type { WorldView } from '../sim/view';
import { DEPTH } from '../render/depth';
import type { SessionOverlay } from '../render/phaser/services';
import { SignpostLayer } from '../render/worldtext/signpost-layer';
import { SpeechLayer } from '../render/worldtext/speech-layer';
import type { BasicTraining } from './basic-training';

const SARGE = 'sarge';
/** How fast he walks along the fence (units/s), and how big he's drawn. */
const SARGE_SPEED = 400; // TUNE: keeps up with a sprint
const SARGE_SIZE = 36;
/** A breath between his lines (ms). */
const LINE_GAP_MS = 250; // TUNE
/** A line still waiting this long is stale (you've moved on): dropped. */
const STALE_MS = 7000; // TUNE

export const BT_SIGNS: readonly SignDef[] = [
  { id: 'bt-s-move', x: 420, y: 4140, kind: 'wood', textKey: 'bt.sign.move', size: 44 },
  { id: 'bt-s-range', x: 420, y: 3820, kind: 'wood', textKey: 'bt.sign.range', size: 44 },
  { id: 'bt-s-flag', x: 420, y: 3300, kind: 'wood', textKey: 'bt.sign.flag', size: 44 },
  { id: 'bt-s-mg', x: 420, y: 1460, kind: 'plate', textKey: 'bt.sign.mg', size: 44 },
  { id: 'bt-s-nade', x: 420, y: 840, kind: 'plate', textKey: 'bt.sign.grenade', size: 44 },
];

/** The drill sergeant stays between lives (he's the same man): one per page. */
const sarge = { x: BT_SARGE_X, y: 4250 };

export function basicTrainingOverlay(director: BasicTraining): SessionOverlay {
  let scene: Phaser.Scene;
  let liveId = '';
  let started = false;
  let speech: SpeechLayer;
  let signs: SignpostLayer;
  let body: Phaser.GameObjects.Image;
  let tag: Phaser.GameObjects.Text;
  let floor: Phaser.GameObjects.Graphics;
  const queue: { key: StringKey; at: number }[] = [];
  let lastFrame = -1;
  let quietUntil = 0;
  let livePos: { x: number; y: number } | null = null;

  return {
    create(s, id) {
      scene = s;
      liveId = id;
      started = false;
      queue.length = 0;
      lastFrame = -1;
      const look = cloneWorldText();
      speech = new SpeechLayer(scene, look);
      signs = new SignpostLayer(scene, BT_SIGNS, look);
      floor = scene.add.graphics().setDepth(DEPTH.decals + 1);
      body = scene.add
        .image(sarge.x, sarge.y, 'npc_sarge')
        .setScale(SARGE_SIZE / fitPx('npc_sarge'))
        .setDepth(DEPTH.static);
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
        .setDepth(DEPTH.labels)
        .setResolution(2);
      scene.events.once('shutdown', () => speech.destroy());
    },
    onStep(view: WorldView) {
      const me = view.soldiers.find((x) => x.id === liveId);
      const now = scene.time.now;
      if (!started && me?.alive) {
        started = true;
        queue.push(...director.startLife(liveId, view, now).map((key) => ({ key, at: now })));
      }
      if (started) queue.push(...director.step(view, now, sarge).map((key) => ({ key, at: now })));
    },
    update(nowMs, live, input) {
      const dt = lastFrame < 0 ? 0 : Math.min(0.1, (nowMs - lastFrame) / 1000);
      lastFrame = nowMs;
      if (live) livePos = live;
      // Keep level with you, behind the fence.
      if (livePos) {
        const want = Math.max(80, Math.min(BT_H - 80, livePos.y));
        const dy = want - sarge.y;
        const stepY = Math.sign(dy) * Math.min(Math.abs(dy), SARGE_SPEED * dt);
        sarge.y += stepY;
        body.setRotation(
          Math.abs(stepY) > 0.5
            ? Math.atan2(stepY, 0)
            : Math.atan2(livePos.y - sarge.y, livePos.x - BT_SARGE_X),
        );
      }
      sarge.x = Math.min(BT_SARGE_X, BT_FENCE_X - 40);
      body.setPosition(sarge.x, sarge.y);
      tag.setPosition(sarge.x, sarge.y + 28);
      // One line at a time.
      while (queue.length && nowMs - queue[0]!.at > STALE_MS) queue.shift();
      if (queue.length && !speech.isSpeaking(SARGE) && nowMs >= quietUntil) {
        speech.say(SARGE, str(queue.shift()!.key), { keepOnScreen: true, color: '#fff3d6' });
        quietUntil = nowMs + LINE_GAP_MS;
      }
      speech.update(nowMs, (id) => (id === SARGE ? sarge : null));
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
