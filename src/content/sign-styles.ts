/**
 * Signpost kinds: what the sign looks like in the world, and the frame its text opens in. A sign
 * uses its kind's frame unless it names another (`SignDef.frame`). Add a kind by adding a post
 * image and a 9-slice frame image to the asset manifest and an entry here.
 *
 * Plain data only.
 */
import type { ImageKey } from './assets';

export interface FrameStyle {
  /** 9-slice image; `slice` px corners stay unstretched. */
  image: ImageKey;
  slice: number;
  /** Text inset from the frame's edge (px). */
  padX: number;
  padY: number;
  /** Text colour, and its outline (null: no outline, e.g. ink on paper). */
  ink: string;
  outline: string | null;
}

export const FRAME_STYLES = {
  plain: {
    image: 'frame_plain',
    slice: 24,
    padX: 16,
    padY: 12,
    ink: '#ffffff',
    outline: '#000000',
  },
  wood: { image: 'frame_wood', slice: 24, padX: 20, padY: 16, ink: '#fff3d6', outline: '#2a1a0c' },
  clipboard: {
    image: 'frame_clipboard',
    slice: 24,
    padX: 18,
    padY: 16,
    ink: '#1d232b',
    outline: null,
  },
  plate: {
    image: 'frame_plate',
    slice: 24,
    padX: 18,
    padY: 14,
    ink: '#efe6c8',
    outline: '#1d2212',
  },
} as const satisfies Record<string, FrameStyle>;

export type FrameId = keyof typeof FRAME_STYLES;

export interface SignKind {
  /** The object in the world. */
  post: ImageKey;
  /** Its frame when read. */
  frame: FrameId;
}

export const SIGN_KINDS = {
  plain: { post: 'sign_post_plain', frame: 'plain' },
  wood: { post: 'sign_post_wood', frame: 'wood' },
  clipboard: { post: 'sign_clipboard', frame: 'clipboard' },
  plate: { post: 'sign_plate', frame: 'plate' },
} as const satisfies Record<string, SignKind>;

export type SignKindId = keyof typeof SIGN_KINDS;

/** A readable sign placed in the world. */
export interface SignDef {
  id: string;
  x: number;
  y: number;
  kind: SignKindId;
  /** strings.ts key of its text (speech markup works: colours, sizes, effects). */
  textKey: string;
  /** A different frame than the kind's. */
  frame?: FrameId;
}
