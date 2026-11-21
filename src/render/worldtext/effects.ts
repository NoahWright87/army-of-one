/**
 * Text effects for in-world speech, by markup name (`[shake]INCOMING![/]`). Pure math, no Phaser:
 * the speech layer asks each glyph's effects how to move it this frame.
 *
 * To add an effect: `registerEffect('name', { frame?, enter? })`. `enter` replaces the default
 * entrance (letters flying out of the speaker); `frame` adds motion every frame after that.
 * Effects stack: a glyph inside `[big][shake][red]` gets all three.
 */

/** One glyph's offset from its laid-out slot this frame (screen px, radians). */
export interface GlyphPose {
  dx: number;
  dy: number;
  scale: number;
  rot: number;
  alpha: number;
}

export interface EffectContext {
  /** ms since the glyph started appearing (negative before it appears). */
  age: number;
  /** ms since the line started. */
  t: number;
  /** Glyph index in the line, and in its word. */
  index: number;
  /** A stable random number 0..1 for this glyph. */
  rand: number;
  /** The glyph's laid-out slot, relative to the speaker's head (px; y up is negative). */
  slotX: number;
  slotY: number;
  /** Entrance duration (ms). */
  popMs: number;
  /** Font size of this glyph (px), to scale motion. */
  sizePx: number;
}

export interface TextEffect {
  /** Pose during the entrance, `p` 0..1. Return null to keep the default. */
  enter?(pose: GlyphPose, p: number, c: EffectContext): void;
  /** Extra motion once the glyph is in (and during the entrance). */
  frame?(pose: GlyphPose, c: EffectContext): void;
  /** One line of help for the lab. */
  help: string;
}

const EFFECTS = new Map<string, TextEffect>();

export function registerEffect(name: string, effect: TextEffect): void {
  EFFECTS.set(name, effect);
}

export function getEffect(name: string): TextEffect | undefined {
  return EFFECTS.get(name);
}

export function effectNames(): string[] {
  return [...EFFECTS.keys()];
}

/** Integer hash → 0..1, for deterministic per-glyph jitter. */
export function hash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export const easeOutBack = (p: number, s = 1.9): number => {
  const q = p - 1;
  return 1 + (s + 1) * q * q * q + s * q * q;
};
export const easeOutCubic = (p: number): number => 1 - (1 - p) ** 3;

/**
 * The default entrance: the glyph pops out of the speaker's head (the origin) and flies to its
 * slot, growing as it goes, so it's always obvious who is talking.
 */
export function defaultEnter(pose: GlyphPose, p: number, c: EffectContext): void {
  const e = easeOutBack(p, 1.4);
  pose.dx = -c.slotX * (1 - e);
  pose.dy = -c.slotY * (1 - easeOutCubic(p));
  pose.scale = 0.25 + 0.75 * e;
  pose.alpha = Math.min(1, p * 3);
}

// ---- the built-in effects -----------------------------------------------------------------

registerEffect('shake', {
  help: 'Letters rattle in place (shouting, panic, anger).',
  frame(pose, c) {
    const step = Math.floor(c.t / 50);
    const a = c.sizePx * 0.06;
    pose.dx += (hash01(step * 31 + c.index * 7) - 0.5) * 2 * a;
    pose.dy += (hash01(step * 17 + c.index * 13 + 5) - 0.5) * 2 * a;
  },
});

registerEffect('wave', {
  help: 'Letters bob in a wave (sing-song, smug, dizzy).',
  frame(pose, c) {
    pose.dy += Math.sin(c.t / 120 - c.index * 0.6) * c.sizePx * 0.18;
  },
});

registerEffect('pulse', {
  help: 'Letters throb bigger and smaller (heartbeat, urgency).',
  frame(pose, c) {
    pose.scale *= 1 + 0.12 * Math.sin(c.t / 90);
  },
});

registerEffect('wobble', {
  help: 'Letters tilt back and forth (drunk, scared, silly).',
  frame(pose, c) {
    pose.rot += Math.sin(c.t / 140 + c.index) * 0.22;
  },
});

registerEffect('fly', {
  help: 'Letters fly in spinning from all around instead of out of the speaker.',
  enter(pose, p, c) {
    const ang = c.rand * Math.PI * 2;
    const dist = 60 + c.rand * 50;
    const e = easeOutCubic(p);
    pose.dx = Math.cos(ang) * dist * (1 - e);
    pose.dy = Math.sin(ang) * dist * (1 - e);
    pose.rot = (c.rand - 0.5) * 6 * (1 - e);
    pose.scale = 0.6 + 0.4 * e;
    pose.alpha = Math.min(1, p * 2);
  },
});

registerEffect('slam', {
  help: 'Huge letters slam down into place (a shout, an impact).',
  enter(pose, p) {
    const e = easeOutCubic(p);
    pose.dx = 0;
    pose.dy = 0;
    pose.scale = 3.2 - 2.2 * e;
    pose.alpha = Math.min(1, p * 2.5);
  },
});

registerEffect('drop', {
  help: 'Letters fall from above and bounce (a punchline, deadpan).',
  enter(pose, p, c) {
    // A bounce: fall, then two small hops.
    const b =
      p < 0.6 ? (p / 0.6) ** 2 : p < 0.85 ? 1 - Math.sin(((p - 0.6) / 0.25) * Math.PI) * 0.15 : 1;
    pose.dx = 0;
    pose.dy = -(1 - b) * c.sizePx * 3;
    pose.scale = 1;
    pose.alpha = Math.min(1, p * 4);
  },
});
