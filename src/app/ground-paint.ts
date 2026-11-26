/**
 * (PHASE18) Instructions "spray-painted" on the ground in basic training ([D161]): a picture of
 * the keys (or, on a touch screen, the thumbstick) with one word. The words are device-neutral so
 * the drill sergeant can stay in-universe and never name a button. Plain Phaser drawing.
 */
import type Phaser from 'phaser';
import { DEPTH } from '../render/depth';
import { str, type StringKey } from '../content/strings';

export interface Paint {
  x: number;
  y: number;
  kind: 'move' | 'sprint' | 'fire' | 'brace';
}

/** Where the paint is (world units; the text under each picture is in strings.ts). */
export const BT_PAINT: readonly Paint[] = [
  { x: 600, y: 5900, kind: 'move' },
  { x: 640, y: 5540, kind: 'fire' },
  { x: 2042, y: 4850, kind: 'brace' },
  { x: 860, y: 2925, kind: 'sprint' },
];

const WORD: Record<Paint['kind'], StringKey> = {
  move: 'bt.paint.move',
  sprint: 'bt.paint.sprint',
  fire: 'bt.paint.fire',
  brace: 'bt.paint.brace',
};

const PAINT = 0xf3efe0;
const ALPHA = 0.6;

/** Is this a touch screen (so: thumbsticks, not keys)? */
export const isTouchScreen = (): boolean => {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

/** Draws every paint mark; returns what to destroy later. */
export function drawGroundPaint(
  scene: Phaser.Scene,
  marks: readonly Paint[] = BT_PAINT,
  touch = isTouchScreen(),
): Phaser.GameObjects.GameObject[] {
  const g = scene.add.graphics().setDepth(DEPTH.decals + 0.5);
  const made: Phaser.GameObjects.GameObject[] = [g];
  const text = (x: number, y: number, s: string, size: number) => {
    const t = scene.add
      .text(x, y, s, {
        fontFamily: '"Black Ops One", system-ui, sans-serif',
        fontSize: `${size}px`,
        color: '#f3efe0',
      })
      .setOrigin(0.5)
      .setAlpha(ALPHA)
      .setDepth(DEPTH.decals + 0.5)
      .setResolution(2);
    made.push(t);
    return t;
  };
  const key = (x: number, y: number, w: number, h: number, label: string) => {
    g.lineStyle(5, PAINT, ALPHA);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    text(x, y, label, Math.round(h * 0.55));
  };
  for (const m of marks) {
    const { x, y } = m;
    if (m.kind === 'move') {
      if (touch) {
        // A thumbstick: a ring, the knob, and four arrows.
        g.lineStyle(5, PAINT, ALPHA);
        g.strokeCircle(x, y, 52);
        g.fillStyle(PAINT, ALPHA);
        g.fillCircle(x, y, 20);
        for (const [dx, dy] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ] as const) {
          const cx = x + dx * 40;
          const cy = y + dy * 40;
          g.fillTriangle(
            cx + dx * 9,
            cy + dy * 9,
            cx - dy * 8 - dx * 4,
            cy + dx * 8 - dy * 4,
            cx + dy * 8 - dx * 4,
            cy - dx * 8 - dy * 4,
          );
        }
      } else {
        key(x, y - 26, 46, 46, 'W');
        key(x - 52, y + 26, 46, 46, 'A');
        key(x, y + 26, 46, 46, 'S');
        key(x + 52, y + 26, 46, 46, 'D');
      }
      text(x, y + 100, str(WORD.move), 38);
    } else if (m.kind === 'sprint') {
      if (touch) {
        g.lineStyle(5, PAINT, ALPHA);
        g.strokeCircle(x, y, 40);
        text(x, y, 'RUN', 22);
      } else {
        key(x, y, 130, 46, 'SHIFT');
      }
      text(x, y + 56, str(WORD.sprint), 34);
    } else if (m.kind === 'brace') {
      // Settle in against cover: the stance key, or (touch) a tap on the stance icon.
      if (touch) {
        g.lineStyle(5, PAINT, ALPHA);
        g.strokeCircle(x, y, 30);
        g.strokeCircle(x, y, 44);
        g.fillStyle(PAINT, ALPHA);
        g.fillCircle(x, y, 8);
      } else {
        key(x, y, 56, 56, 'Z');
      }
      text(x, y + 62, str(WORD.brace), 34);
    } else {
      // Fire: a mouse with its left button filled, or a fingertip.
      g.lineStyle(5, PAINT, ALPHA);
      if (touch) {
        g.strokeCircle(x, y, 18);
        g.strokeCircle(x, y, 38);
        g.fillStyle(PAINT, ALPHA);
        g.fillCircle(x, y, 8);
      } else {
        g.strokeRoundedRect(x - 24, y - 38, 48, 76, 22);
        g.lineBetween(x - 24, y - 6, x + 24, y - 6);
        g.lineBetween(x, y - 38, x, y - 6);
        g.fillStyle(PAINT, ALPHA);
        g.fillRoundedRect(x - 22, y - 36, 22, 28, { tl: 20, tr: 0, bl: 0, br: 0 });
      }
      text(x, y + 74, str(WORD.fire), 38);
    }
  }
  return made;
}
