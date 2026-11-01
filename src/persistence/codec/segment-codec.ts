import { FACING_QUANTUM, POSITION_QUANTUM } from '../../contracts/quantize';
import type {
  RecordedAction,
  RecordingSegment,
  SegmentEndReason,
  Waypoint,
} from '../../contracts/mission';
import { ByteReader, ByteWriter, fromBase64, toBase64 } from './bytes';

/**
 * Compact, lossless encoding of a RecordingSegment.
 *
 * Mode 'q' (normal): waypoints are integer multiples of the quantization steps. Each waypoint
 * stores Δt (omitted when there's one waypoint per tick) plus the *second-order* delta (change in velocity) of x, y and facing as zigzag
 * varints. Steady movement compresses to ~1 byte per axis per tick.
 * Mode 'f' (fallback): any value isn't exactly quantized, so store raw floats. JSON numbers
 * round-trip doubles exactly, so this is lossless too, just bigger.
 */
export const SEGMENT_CODEC_VERSION = 1;

const FLAG_CONTIGUOUS = 1;

interface EncodedSegmentV1 {
  v: 1;
  s: number;
  e: number;
  r: SegmentEndReason;
  m: 'q' | 'f';
  w: string | number[];
  a: RecordedAction[];
}

const toUnits = (v: number, q: number): number | undefined => {
  const n = Math.round(v / q) + 0;
  // -0 would decode as 0; send it down the exact float path instead.
  return n * q === v && !Object.is(v, -0) && Number.isSafeInteger(n) ? n : undefined;
};

function encodeQuantized(seg: RecordingSegment): string | undefined {
  const w = new ByteWriter();
  // One waypoint per tick from startTick is the normal case; then Δt is implicit.
  const contiguous = seg.waypoints.every((p, i) => p.t === seg.startTick + i);
  w.byte(contiguous ? FLAG_CONTIGUOUS : 0);
  w.uvarint(seg.waypoints.length);
  let prevT = seg.startTick;
  const prev = [0, 0, 0];
  const vel = [0, 0, 0];
  for (const wp of seg.waypoints) {
    const units = [
      toUnits(wp.x, POSITION_QUANTUM),
      toUnits(wp.y, POSITION_QUANTUM),
      toUnits(wp.facing, FACING_QUANTUM),
    ];
    if (units.some((u) => u === undefined) || wp.t < prevT) return undefined;
    if (!contiguous) w.uvarint(wp.t - prevT);
    prevT = wp.t;
    for (let i = 0; i < 3; i++) {
      const d = units[i]! - prev[i]!;
      w.svarint(d - vel[i]!);
      vel[i] = d;
      prev[i] = units[i]!;
    }
  }
  return toBase64(w.bytes());
}

function decodeQuantized(b64: string, startTick: number): Waypoint[] {
  const r = new ByteReader(fromBase64(b64));
  const contiguous = (r.byte() & FLAG_CONTIGUOUS) !== 0;
  const n = r.uvarint();
  const out: Waypoint[] = [];
  let t = startTick;
  const prev = [0, 0, 0];
  const vel = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    t = contiguous ? startTick + k : t + r.uvarint();
    for (let i = 0; i < 3; i++) {
      vel[i] = vel[i]! + r.svarint();
      prev[i] = prev[i]! + vel[i]!;
    }
    out.push({
      t,
      x: prev[0]! * POSITION_QUANTUM,
      y: prev[1]! * POSITION_QUANTUM,
      facing: prev[2]! * FACING_QUANTUM,
    });
  }
  if (!r.done) throw new Error('segment codec: trailing bytes');
  return out;
}

export function encodeSegment(seg: RecordingSegment): string {
  const q = encodeQuantized(seg);
  const enc: EncodedSegmentV1 = {
    v: SEGMENT_CODEC_VERSION,
    s: seg.startTick,
    e: seg.endTick,
    r: seg.endReason,
    m: q === undefined ? 'f' : 'q',
    w: q ?? seg.waypoints.flatMap((p) => [p.t, p.x, p.y, p.facing]),
    a: seg.actions,
  };
  return JSON.stringify(enc);
}

/** Throws on malformed or unknown-version input; callers convert that into a load error. */
export function decodeSegment(encoded: string): RecordingSegment {
  const enc = JSON.parse(encoded) as Partial<EncodedSegmentV1>;
  if (enc.v !== SEGMENT_CODEC_VERSION) throw new Error(`segment codec: unknown version ${enc.v}`);
  if (typeof enc.s !== 'number' || typeof enc.e !== 'number' || !Array.isArray(enc.a)) {
    throw new Error('segment codec: malformed segment');
  }
  let waypoints: Waypoint[];
  if (enc.m === 'q' && typeof enc.w === 'string') {
    waypoints = decodeQuantized(enc.w, enc.s);
  } else if (enc.m === 'f' && Array.isArray(enc.w) && enc.w.length % 4 === 0) {
    const w = enc.w;
    waypoints = [];
    for (let i = 0; i < w.length; i += 4) {
      waypoints.push({ t: w[i]!, x: w[i + 1]!, y: w[i + 2]!, facing: w[i + 3]! });
    }
  } else {
    throw new Error('segment codec: malformed waypoints');
  }
  if (enc.r !== 'death' && enc.r !== 'missionComplete' && enc.r !== 'suspended') {
    throw new Error('segment codec: bad end reason');
  }
  return { startTick: enc.s, endTick: enc.e, endReason: enc.r, waypoints, actions: enc.a };
}
