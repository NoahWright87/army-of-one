/**
 * Stable hash of plain data (objects, arrays, numbers, strings, booleans, null).
 * Object keys are visited in sorted order, so insertion order never matters.
 * Used by determinism tests and the debug overlay; not cryptographic.
 */
export function hashState(value: unknown): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    }
  };
  const visit = (v: unknown): void => {
    if (v === null || v === undefined) return feed('n');
    switch (typeof v) {
      case 'number':
        // Object.is distinguishes -0; normalize so -0 and 0 hash the same.
        return feed(`#${v === 0 ? 0 : v}`);
      case 'string':
        return feed(`"${v}`);
      case 'boolean':
        return feed(v ? 't' : 'f');
      case 'object': {
        if (Array.isArray(v)) {
          feed('[');
          v.forEach(visit);
          return feed(']');
        }
        feed('{');
        for (const key of Object.keys(v as object).sort()) {
          feed(key);
          visit((v as Record<string, unknown>)[key]);
        }
        return feed('}');
      }
      default:
        throw new Error(`hashState: unsupported type ${typeof v}`);
    }
  };
  visit(value);
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
