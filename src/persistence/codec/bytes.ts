/** Growable byte buffer with zigzag-varint helpers, plus a matching reader. */
export class ByteWriter {
  private buf = new Uint8Array(256);
  private len = 0;

  private ensure(extra: number): void {
    if (this.len + extra <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + extra) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  byte(b: number): void {
    this.ensure(1);
    this.buf[this.len++] = b & 0xff;
  }

  /** Unsigned varint (LEB128). Safe for integers up to 2^53. */
  uvarint(n: number): void {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`uvarint: bad value ${n}`);
    while (n >= 0x80) {
      this.byte((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    this.byte(n);
  }

  /** Signed varint via zigzag encoding. */
  svarint(n: number): void {
    if (!Number.isSafeInteger(n)) throw new Error(`svarint: bad value ${n}`);
    this.uvarint(n >= 0 ? n * 2 : -n * 2 - 1);
  }

  bytes(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

export class ByteReader {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  get done(): boolean {
    return this.pos >= this.buf.length;
  }

  byte(): number {
    if (this.pos >= this.buf.length) throw new Error('ByteReader: unexpected end of data');
    return this.buf[this.pos++]!;
  }

  uvarint(): number {
    let result = 0;
    let mul = 1;
    for (;;) {
      const b = this.byte();
      result += (b & 0x7f) * mul;
      if (b < 0x80) return result;
      mul *= 0x80;
      if (mul > 2 ** 56) throw new Error('ByteReader: varint too long');
    }
  }

  svarint(): number {
    const z = this.uvarint();
    return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += b === undefined ? '=' : B64[(n >> 6) & 63]!;
    out += c === undefined ? '=' : B64[n & 63]!;
  }
  return out;
}

export function fromBase64(s: string): Uint8Array {
  if (s.length % 4 !== 0) throw new Error('base64: bad length');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const ch = s[i + j]!;
      const v = ch === '=' ? 0 : B64_INDEX.get(ch);
      if (v === undefined) throw new Error('base64: bad character');
      n = (n << 6) | v;
    }
    if (o < out.length) out[o++] = (n >> 16) & 0xff;
    if (o < out.length) out[o++] = (n >> 8) & 0xff;
    if (o < out.length) out[o++] = n & 0xff;
  }
  return out;
}
