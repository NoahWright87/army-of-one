/**
 * (PHASE18) The interpreter for Sarge's script (`src/content/sarge-script.ts`, [D160]): turns the
 * text of a beat's `when` into checks, and decides what he says and where he stands. No Phaser, no
 * DOM, no clock of its own: everything it knows comes in through `SargeCtx`.
 */
import {
  SARGE_ROOMS,
  type SargeBeat,
  type SargePlace,
  type SargeScript,
  type SargeSpot,
} from '../content/sarge-script';

/** What the engine knows about the moment (built by the director). */
export interface SargeCtx {
  nowMs: number;
  /** Edges that happened in this step ("enter:r1", "captured:bt-a", …). */
  edges: ReadonlySet<string>;
  /** The live soldier (in a `died` step, the dead one); undefined on the respawn view. */
  me?: { x: number; y: number; hp: number; maxHp: number; alive: boolean; roleId?: string };
  room: string | null;
  inRoomS: number;
  quietS: number;
  /** Everything that has happened (edges, and beat ids that were said). */
  had: ReadonlySet<string>;
  lives: number;
  deaths: number;
  deathsIn: Readonly<Record<string, number>>;
  taught: readonly string[];
  cause: string | null;
  gateOpen: (id: string) => boolean;
  nextTarget: string | null;
  targetsLeft: boolean;
  inCorridor: boolean;
  atSpawn: (id: string) => boolean;
  nearSpot: (spot: SargeSpot) => boolean;
  respawn: null | {
    hint: 'deploy' | 'spawn' | 'resume' | null;
    spawnPointId: string | null;
    hasRole: boolean;
    afterDeath: boolean;
  };
}

/** One condition of a beat. `edge`: true only at the moment it happens. */
interface Tok {
  raw: string;
  neg: boolean;
  name: string;
  arg: string;
  edge: boolean;
  /** `waited:N` is handled by the runner. */
  waitS?: number;
  test: (c: SargeCtx, spots: ReadonlyMap<string, SargeSpot>) => boolean;
}

const num = (s: string) => (s !== '' && Number.isFinite(Number(s)) ? Number(s) : null);

/** Builds the check for one token, or an error message. */
function makeTok(raw: string): Tok | string {
  let text = raw.trim();
  const neg = text.startsWith('!');
  if (neg) text = text.slice(1).trim();
  const gt = /^deaths>(\d+)$/.exec(text);
  if (gt) {
    const n = Number(gt[1]);
    return tok(raw, neg, 'deaths>', gt[1]!, false, (c) => c.deaths > n);
  }
  const i = text.indexOf(':');
  const name = i < 0 ? text : text.slice(0, i);
  const arg = i < 0 ? '' : text.slice(i + 1);
  const need = (what: string) => `"${raw.trim()}" needs ${what} (like ${name}:…)`;
  const room = () =>
    (SARGE_ROOMS as readonly string[]).includes(arg)
      ? null
      : `"${raw.trim()}": there's no room called "${arg}"`;
  switch (name) {
    // Edges.
    case 'lifeStart':
    case 'targetsDown':
    case 'minesShot':
    case 'nestCleared':
    case 'rangeCleared':
    case 'shotAtSarge':
    case 'respawnOpen':
      return tok(raw, neg, name, arg, true, (c) => c.edges.has(name));
    case 'died':
      if (arg && room()) return room()!;
      return tok(raw, neg, name, arg, true, (c) => c.edges.has(arg ? `died:${arg}` : 'died'));
    case 'enter':
      if (room()) return room()!;
      return tok(raw, neg, name, arg, true, (c) => c.edges.has(`enter:${arg}`));
    case 'captured':
    case 'gateOpened':
      if (!arg) return need('a name');
      return tok(raw, neg, name, arg, true, (c) => c.edges.has(`${name}:${arg}`));
    // States.
    case 'room':
      if (room()) return room()!;
      return tok(raw, neg, name, arg, false, (c) => c.room === arg);
    case 'alive':
      return tok(raw, neg, name, arg, false, (c) => !!c.me?.alive);
    case 'firstLife':
      return tok(raw, neg, name, arg, false, (c) => c.lives === 1);
    case 'role':
      return tok(raw, neg, name, arg, false, (c) => c.me?.roleId === arg);
    case 'deaths':
      if (num(arg) === null) return need('a number');
      return tok(raw, neg, name, arg, false, (c) => c.deaths === Number(arg));
    case 'diedIn':
      if (room()) return room()!;
      return tok(raw, neg, name, arg, false, (c) => (c.deathsIn[arg] ?? 0) > 0);
    case 'had':
      if (!arg) return need('an edge or a beat id');
      return tok(raw, neg, name, arg, false, (c) => c.had.has(arg));
    case 'gate':
      if (!arg) return need('a gate');
      return tok(raw, neg, name, arg, false, (c) => c.gateOpen(arg));
    case 'near':
      if (!arg) return need('a spot');
      return tok(raw, neg, name, arg, false, (c, spots) => {
        const s = spots.get(arg);
        return !!s && !!c.me?.alive && c.nearSpot(s);
      });
    case 'nextTarget':
      return tok(raw, neg, name, arg, false, (c) => c.nextTarget === arg);
    case 'targetsLeft':
      return tok(raw, neg, name, arg, false, (c) => c.targetsLeft);
    case 'hurt':
      return tok(raw, neg, name, arg, false, (c) => !!c.me && c.me.hp < c.me.maxHp);
    case 'corridor':
      return tok(raw, neg, name, arg, false, (c) => c.inCorridor);
    case 'atSpawn':
      if (!arg) return need('a spawn id');
      return tok(raw, neg, name, arg, false, (c) => c.atSpawn(arg));
    case 'cause':
      return tok(raw, neg, name, arg, false, (c) => c.cause === arg);
    case 'inRoom':
      if (num(arg) === null) return need('seconds');
      return tok(raw, neg, name, arg, false, (c) => c.inRoomS >= Number(arg));
    case 'quiet':
      if (num(arg) === null) return need('seconds');
      return tok(raw, neg, name, arg, false, (c) => c.quietS >= Number(arg));
    case 'waited': {
      const n = num(arg);
      if (n === null) return need('seconds');
      const t = tok(raw, neg, name, arg, false, () => true);
      t.waitS = n;
      return t;
    }
    case 'respawn':
      return tok(raw, neg, name, arg, false, (c) => !!c.respawn);
    case 'afterDeath':
      return tok(raw, neg, name, arg, false, (c) => !!c.respawn?.afterDeath);
    case 'hint':
      return tok(raw, neg, name, arg, false, (c) => c.respawn?.hint === arg);
    case 'hintSpawn':
      return tok(raw, neg, name, arg, false, (c) => c.respawn?.spawnPointId === arg);
    case 'hintRole':
      return tok(raw, neg, name, arg, false, (c) => !!c.respawn?.hasRole);
    case 'taught':
      return tok(raw, neg, name, arg, false, (c) => c.taught.includes(arg));
    default:
      return `"${raw.trim()}" isn't a token I know`;
  }
}

function tok(
  raw: string,
  neg: boolean,
  name: string,
  arg: string,
  edge: boolean,
  test: Tok['test'],
): Tok {
  return {
    raw,
    neg,
    name,
    arg,
    edge,
    test: neg ? (c, s) => !test(c, s) : test,
  };
}

export interface Compiled {
  toks: Tok[];
  errors: string[];
}

const cache = new Map<string, Compiled>();

/** The checks for a `when` string (cached), with a message for each token that isn't valid. */
export function compileWhen(when: string): Compiled {
  const hit = cache.get(when);
  if (hit) return hit;
  const out: Compiled = { toks: [], errors: [] };
  for (const part of when.split(',')) {
    if (part.trim() === '') continue;
    const t = makeTok(part);
    if (typeof t === 'string') out.errors.push(t);
    else out.toks.push(t);
  }
  if (cache.size > 2000) cache.clear();
  cache.set(when, out);
  return out;
}

/** Everything wrong with a script, as readable messages (empty: fine). */
export function validateScript(script: SargeScript): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const spots = new Set(script.spots.map((s) => s.id));
  for (const beat of script.beats) {
    if (ids.has(beat.id)) problems.push(`Two beats are called "${beat.id}"`);
    ids.add(beat.id);
    for (const e of compileWhen(beat.when).errors) problems.push(`${beat.id}: ${e}`);
    for (const t of compileWhen(beat.when).toks) {
      if (t.name === 'near' && !spots.has(t.arg)) problems.push(`${beat.id}: no spot "${t.arg}"`);
    }
  }
  for (const p of script.places) {
    for (const e of compileWhen(p.when).errors) problems.push(`place ${p.id}: ${e}`);
    if ('spot' in p.at && !spots.has(p.at.spot))
      problems.push(`place ${p.id}: no spot "${p.at.spot}"`);
  }
  return problems;
}

/** Problems with one `when` string, for the editor to show next to the field. */
export function checkWhen(when: string, script: SargeScript): string[] {
  const spots = new Set(script.spots.map((s) => s.id));
  const c = compileWhen(when);
  return [
    ...c.errors,
    ...c.toks
      .filter((t) => t.name === 'near' && !spots.has(t.arg))
      .map((t) => `no spot "${t.arg}"`),
  ];
}

/** What a beat said (the text is picked from its variants). */
export interface Fired {
  beat: SargeBeat;
  text: string;
}

interface Runtime {
  /** The whole condition held at the last look. */
  was: boolean;
  /** Since when everything but `waited` has held (ms), or null. */
  holdSince: number | null;
  lastMs: number;
  variant: number;
}

/** Decides what fires. Keeps per-beat bookkeeping; `said` is the persisted list of once-only beats. */
export class SargeRunner {
  private readonly rt = new Map<string, Runtime>();

  constructor(
    private script: SargeScript,
    /** Beat ids already said once (shared with the saved progress). */
    private said: string[],
  ) {}

  /** The list of once-said beats changed (a reset): use the new one. */
  setSaid(said: string[]): void {
    this.said = said;
  }

  setScript(script: SargeScript): void {
    this.script = script;
  }

  /** Forget the per-beat timers (a new life, or the script changed). */
  resetTimers(): void {
    this.rt.clear();
  }

  private runtime(id: string): Runtime {
    let r = this.rt.get(id);
    if (!r) {
      r = { was: false, holdSince: null, lastMs: -1e12, variant: 0 };
      this.rt.set(id, r);
    }
    return r;
  }

  private spots(): Map<string, SargeSpot> {
    return new Map(this.script.spots.map((s) => [s.id, s]));
  }

  /** The beats that fire now, in script order. */
  run(c: SargeCtx): Fired[] {
    const out: Fired[] = [];
    const spots = this.spots();
    let stopped = false;
    for (const beat of this.script.beats) {
      if (beat.off) continue;
      const rt = this.runtime(beat.id);
      const { toks, errors } = compileWhen(beat.when);
      if (errors.length) continue;
      let wait: number | null = null;
      let ok = true;
      for (const t of toks) {
        if (t.waitS !== undefined) wait = t.waitS;
        else if (!t.test(c, spots)) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        rt.was = false;
        rt.holdSince = null;
        continue;
      }
      let fire: boolean;
      if (wait !== null) {
        rt.holdSince ??= c.nowMs;
        fire = c.nowMs - rt.holdSince >= wait * 1000;
      } else {
        fire = !rt.was;
      }
      rt.was = true;
      if (!fire || stopped) continue;
      if (!beat.repeat && this.said.includes(beat.id)) continue;
      if (beat.cooldownS && c.nowMs - rt.lastMs < beat.cooldownS * 1000) continue;
      const lines = beat.say.filter((s) => s.trim() !== '');
      if (!lines.length) continue;
      const text = lines[rt.variant++ % lines.length]!;
      rt.lastMs = c.nowMs;
      if (wait !== null) rt.holdSince = c.nowMs;
      if (!beat.repeat) this.said.push(beat.id);
      out.push({ beat, text });
      if (beat.stop) stopped = true;
    }
    return out;
  }

  /** Where he should stand (the first place that holds), or null to tag along. */
  place(c: SargeCtx): SargePlace | null {
    const spots = this.spots();
    for (const p of this.script.places) {
      const { toks, errors } = compileWhen(p.when);
      if (errors.length) continue;
      if (toks.every((t) => t.waitS !== undefined || t.test(c, spots))) return p;
    }
    return null;
  }
}

/** How long a line takes to say (ms): the word reveal, then it holds, then it fades. For the editor. */
export function lineDurationMs(
  text: string,
  t: { holdMs: number; holdPerCharMs: number; wordMs: number; wordPerCharMs: number },
): number {
  const plain = text.replace(/\[[^\]]*\]/g, '');
  const words = plain.split(/\s+/).filter(Boolean);
  const pauses = [...text.matchAll(/\[p(?:=(\d+))?\]/g)].reduce(
    (n, m) => n + (m[1] ? Number(m[1]) : 300),
    0,
  );
  const reveal = words.reduce((n, w) => n + t.wordMs + t.wordPerCharMs * w.length, 0);
  return reveal + pauses + t.holdMs + t.holdPerCharMs * plain.length + 350;
}
