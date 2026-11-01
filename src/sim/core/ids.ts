/** Deterministic id allocation. Ids sort in allocation order when compared with `compareIds`. */
export interface IdCounters {
  [prefix: string]: number;
}

export function allocateId(counters: IdCounters, prefix: string): string {
  const next = (counters[prefix] ?? 0) + 1;
  counters[prefix] = next;
  return `${prefix}${next}`;
}

/** Orders ids like "S2" < "S10" (prefix, then numeric suffix). Use for stable iteration. */
export function compareIds(a: string, b: string): number {
  const ma = /^(.*?)(\d+)$/.exec(a);
  const mb = /^(.*?)(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) return Number(ma[2]) - Number(mb[2]);
  return a < b ? -1 : a > b ? 1 : 0;
}
