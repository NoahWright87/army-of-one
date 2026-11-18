/**
 * A signpost's read state (pure). Walk up to a sign: a ring fills; when it's full the sign's
 * frame grows up out of the post (as if the soldier leaned in to read it). Walk away, or fire,
 * and it shrinks back into the post.
 */
import type { SignTuning } from '../../content/world-text';

export type SignPhase = 'idle' | 'reading' | 'opening' | 'open' | 'closing';

export interface SignState {
  phase: SignPhase;
  /** The read ring, 0..1. */
  ring: number;
  /** How far the frame has grown out of the post, 0..1. */
  open: number;
}

export const SIGN_IDLE: SignState = { phase: 'idle', ring: 0, open: 0 };

/**
 * One frame. `dist` is the reader's distance to the sign (null: no reader), `fired` whether the
 * reader fired this frame.
 */
export function stepSign(
  s: SignState,
  dtMs: number,
  dist: number | null,
  fired: boolean,
  t: Pick<
    SignTuning,
    'readRadius' | 'closeRadius' | 'readMs' | 'openMs' | 'closeMs' | 'closeOnFire'
  >,
): SignState {
  const near = dist !== null && dist <= t.readRadius;
  const gone = dist === null || dist > t.closeRadius || (fired && t.closeOnFire);
  switch (s.phase) {
    case 'idle':
    case 'reading': {
      if (near && !(fired && t.closeOnFire)) {
        const ring = Math.min(1, s.ring + dtMs / t.readMs);
        return ring >= 1
          ? { phase: 'opening', ring: 1, open: 0 }
          : { phase: 'reading', ring, open: 0 };
      }
      // Stepping away (or firing) drains the ring quickly.
      const ring = fired && t.closeOnFire ? 0 : Math.max(0, s.ring - (2 * dtMs) / t.readMs);
      return { phase: ring > 0 ? 'reading' : 'idle', ring, open: 0 };
    }
    case 'opening':
    case 'open': {
      if (gone) return { phase: 'closing', ring: 0, open: s.open };
      const open = Math.min(1, s.open + dtMs / t.openMs);
      return { phase: open >= 1 ? 'open' : 'opening', ring: 0, open };
    }
    case 'closing': {
      const open = Math.max(0, s.open - dtMs / t.closeMs);
      return open <= 0 ? { ...SIGN_IDLE } : { phase: 'closing', ring: 0, open };
    }
  }
}
