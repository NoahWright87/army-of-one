import { describe, expect, it } from 'vitest';
import { ByteReader, ByteWriter, fromBase64, toBase64 } from '../codec/bytes';
import { decodeSegment, encodeSegment } from '../codec/segment-codec';
import { syntheticSegment } from './fixtures';

describe('bytes', () => {
  it('round-trips varints, including large and negative values', () => {
    const values = [0, 1, -1, 63, -64, 127, 128, 300, -300, 2 ** 31, -(2 ** 31), 2 ** 51];
    const w = new ByteWriter();
    for (const v of values) w.svarint(v);
    w.uvarint(2 ** 53 - 1);
    const r = new ByteReader(w.bytes());
    expect(values.map(() => r.svarint())).toEqual(values);
    expect(r.uvarint()).toBe(2 ** 53 - 1);
    expect(r.done).toBe(true);
  });

  it('round-trips base64 for every padding length', () => {
    for (let n = 0; n < 10; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + 13) & 0xff);
      expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    }
    expect(toBase64(Uint8Array.from([0xfb, 0xff]))).toBe('+/8=');
  });

  it('rejects truncated data', () => {
    const r = new ByteReader(Uint8Array.from([0x80]));
    expect(() => r.uvarint()).toThrow();
  });
});

describe('segment codec', () => {
  it('losslessly round-trips quantized segments', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const seg = syntheticSegment(seed, seed * 37, 600);
      const enc = encodeSegment(seg);
      expect(JSON.parse(enc).m).toBe('q');
      expect(decodeSegment(enc)).toEqual(seg);
    }
  });

  it('falls back to lossless floats for unquantized data', () => {
    const seg = syntheticSegment(3, 0, 50);
    seg.waypoints[10] = { ...seg.waypoints[10]!, x: Math.PI };
    const enc = encodeSegment(seg);
    expect(JSON.parse(enc).m).toBe('f');
    expect(decodeSegment(enc)).toEqual(seg);
  });

  it('handles empty and non-contiguous waypoints', () => {
    const empty = {
      startTick: 5,
      endTick: 5,
      waypoints: [],
      actions: [],
      endReason: 'suspended' as const,
    };
    expect(decodeSegment(encodeSegment(empty))).toEqual(empty);
    const seg = syntheticSegment(9, 100, 30);
    seg.waypoints = seg.waypoints.filter((_, i) => i % 7 === 0);
    expect(decodeSegment(encodeSegment(seg))).toEqual(seg);
  });

  it('is compact: steady movement costs only a few characters per tick', () => {
    const seg = syntheticSegment(1, 0, 7200); // 2 minutes
    const bytesPerTick = encodeSegment(seg).length / 7200;
    expect(bytesPerTick).toBeLessThan(8); // ~6 chars (≈4.7 bytes) per tick today
  });

  it('fails cleanly on unknown versions or garbage', () => {
    const enc = JSON.parse(encodeSegment(syntheticSegment(1, 0, 10)));
    expect(() => decodeSegment(JSON.stringify({ ...enc, v: 99 }))).toThrow(/version/);
    expect(() => decodeSegment(JSON.stringify({ ...enc, w: 'AAAA' }))).toThrow();
    expect(() => decodeSegment('not json')).toThrow();
  });
});
