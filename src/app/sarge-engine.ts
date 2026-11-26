/**
 * (PHASE18) The interpreter for Sarge's script (`src/content/sarge-script.ts`, [D161]): turns the
 * text of a rule's `when` into checks, runs the steps of the rules that fire, and says where he
 * likes to stand. No Phaser, no DOM, no clock of its own: everything it knows comes in through
 * `SargeCtx`.
 */
import {
  SARGE_ROOMS,
  type SargePref,
  type SargeRule,
  type SargeScript,
  type SargeStep,
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
  /** Everything that has happened (edges, and ids of rules that ran once). */
  had: ReadonlySet<string>;
  lives: number;
  deaths: number;
  deathsIn: Readonly<Record<string, number>>;
  taught: readonly string[];
  cause: string | null;
  /** Zones (and the room) your soldier is in now. */
  zonesIn: ReadonlySet<string>;
  /** Seconds in that zone so far (null: not in it). */
  zoneSinceS: (zone: string) => number | null;
  /** Your flags that are set. */
  flags: ReadonlySet<string>;
  /** Seconds since a flag was set (null: not set). */
  flagSinceS: (flag: string) => number | null;
  /** Seconds since a rule last ran (null: never). Filled in by the runner. */
  firedSinceS?: (rule: string) => number | null;
  gateOpen: (id: string) => boolean;
  nextTarget: string | null;
  /** Does that range stall ('a' or 'b') still have targets up? */
  targetsLeft: (stall: string) => boolean;
  /** Seconds since you last fired (from walking into the room, if later). */
  holdFireS: number;
  /** Seconds since you last moved. */
  stillS: number;
  /** Shots fired in this room that hit nothing. */
  misses: number;
  inCorridor: boolean;
  atSpawn: (id: string) => boolean;
  respawn: null | {
    hint: 'deploy' | 'spawn' | 'resume' | null;
    spawnPointId: string | null;
    hasRole: boolean;
    afterDeath: boolean;
  };
}

/** One condition of a rule. `edge`: true only at the moment it happens. */
export interface Tok {
  raw: string;
  neg: boolean;
  name: string;
  /** The parts after the name, split at ':' ("inFor:bags:5" → ["bags", "5"]). */
  args: string[];
  edge: boolean;
  /** `waited:N` is handled by the runner. */
  waitS?: number;
  test: (c: SargeCtx) => boolean;
}

const num = (s: string | undefined) =>
  s !== undefined && s !== '' && Number.isFinite(Number(s)) ? Number(s) : null;

/** Builds the check for one token, or an error message. */
function makeTok(raw: string): Tok | string {
  let text = raw.trim();
  const neg = text.startsWith('!');
  if (neg) text = text.slice(1).trim();
  const gt = /^deaths>(\d+)$/.exec(text);
  if (gt) {
    const n = Number(gt[1]);
    return tok(raw, neg, 'deaths>', [gt[1]!], false, (c) => c.deaths > n);
  }
  const ms = /^misses>(\d+)$/.exec(text);
  if (ms) {
    const n = Number(ms[1]);
    return tok(raw, neg, 'misses>', [ms[1]!], false, (c) => c.misses > n);
  }
  const parts = text.split(':');
  const name = parts[0]!;
  const args = parts.slice(1);
  const arg = args.join(':');
  const need = (what: string) => `"${raw.trim()}" needs ${what} (like ${name}:…)`;
  const room = () =>
    (SARGE_ROOMS as readonly string[]).includes(arg)
      ? null
      : `"${raw.trim()}": there's no room called "${arg}"`;
  const edge = (test: (c: SargeCtx) => boolean) => tok(raw, neg, name, args, true, test);
  const state = (test: (c: SargeCtx) => boolean) => tok(raw, neg, name, args, false, test);
  switch (name) {
    // Events.
    case 'lifeStart':
    case 'mgsDown':
    case 'fired':
    case 'minesShot':
    case 'nestCleared':
    case 'rangeCleared':
    case 'shotAtSarge':
    case 'respawnOpen':
      return edge((c) => c.edges.has(name));
    case 'stallDone':
      if (arg !== 'a' && arg !== 'b') return need('a stall (a or b)');
      return edge((c) => c.edges.has(`stallDone:${arg}`));
    case 'died':
      if (arg && room()) return room()!;
      return edge((c) => c.edges.has(arg ? `died:${arg}` : 'died'));
    case 'enter':
    case 'leave':
      if (!arg) return need('a zone');
      return edge((c) => c.edges.has(`${name}:${arg}`));
    case 'captured':
    case 'gateOpened':
      if (!arg) return need('a name');
      return edge((c) => c.edges.has(`${name}:${arg}`));
    // States.
    case 'in':
      if (!arg) return need('a zone');
      return state((c) => c.zonesIn.has(arg));
    case 'room':
      if (room()) return room()!;
      return state((c) => c.room === arg);
    case 'alive':
      return state((c) => !!c.me?.alive);
    case 'firstLife':
      return state((c) => c.lives === 1);
    case 'role':
      return state((c) => c.me?.roleId === arg);
    case 'deaths':
      if (num(arg) === null) return need('a number');
      return state((c) => c.deaths === Number(arg));
    case 'diedIn':
      if (room()) return room()!;
      return state((c) => (c.deathsIn[arg] ?? 0) > 0);
    case 'had':
      if (!arg) return need('an event or a rule id');
      return state((c) => c.had.has(arg));
    case 'flag':
      if (!arg) return need('a flag name');
      return state((c) => c.flags.has(arg));
    case 'gate':
      if (!arg) return need('a gate');
      return state((c) => c.gateOpen(arg));
    case 'nextTarget':
      return state((c) => c.nextTarget === arg);
    case 'targetsLeft':
      if (arg !== 'a' && arg !== 'b') return need('a stall (a or b)');
      return state((c) => c.targetsLeft(arg));
    case 'holdFire':
      if (num(arg) === null) return need('seconds');
      return state((c) => c.holdFireS >= Number(arg));
    case 'still':
      if (num(arg) === null) return need('seconds');
      return state((c) => c.stillS >= Number(arg));
    case 'hurt':
      return state((c) => !!c.me && c.me.hp < c.me.maxHp);
    case 'corridor':
      return state((c) => c.inCorridor);
    case 'atSpawn':
      if (!arg) return need('a spawn id');
      return state((c) => c.atSpawn(arg));
    case 'cause':
      return state((c) => c.cause === arg);
    case 'inRoom':
      if (num(arg) === null) return need('seconds');
      return state((c) => c.inRoomS >= Number(arg));
    case 'inFor': {
      const n = num(args[1]);
      if (!args[0] || n === null) return need('a zone and seconds');
      return state((c) => (c.zoneSinceS(args[0]!) ?? -1) >= n);
    }
    case 'flagFor': {
      const n = num(args[1]);
      if (!args[0] || n === null) return need('a flag and seconds');
      return state((c) => (c.flagSinceS(args[0]!) ?? -1) >= n);
    }
    case 'firedFor': {
      const n = num(args[1]);
      if (!args[0] || n === null) return need('a rule and seconds');
      return state((c) => (c.firedSinceS?.(args[0]!) ?? -1) >= n);
    }
    case 'quiet':
      if (num(arg) === null) return need('seconds');
      return state((c) => c.quietS >= Number(arg));
    case 'waited': {
      const n = num(arg);
      if (n === null) return need('seconds');
      const t = state(() => true);
      t.waitS = n;
      return t;
    }
    case 'respawn':
      return state((c) => !!c.respawn);
    case 'afterDeath':
      return state((c) => !!c.respawn?.afterDeath);
    case 'hint':
      return state((c) => c.respawn?.hint === arg);
    case 'hintSpawn':
      return state((c) => c.respawn?.spawnPointId === arg);
    case 'hintRole':
      return state((c) => !!c.respawn?.hasRole);
    case 'taught':
      return state((c) => c.taught.includes(arg));
    default:
      return `"${raw.trim()}" isn't a token I know`;
  }
}

function tok(
  raw: string,
  neg: boolean,
  name: string,
  args: string[],
  edge: boolean,
  test: Tok['test'],
): Tok {
  return { raw, neg, name, args, edge, test: neg ? (c) => !test(c) : test };
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

/** The ids of every zone a script can talk about: the rooms and its own. */
export const zoneIds = (script: SargeScript): Set<string> =>
  new Set([...SARGE_ROOMS, ...script.zones.map((z) => z.id)]);

/** Problems with one `when` string: wrong words, and zones, flags and rules that don't exist. */
export function checkWhen(when: string, script: SargeScript): string[] {
  const zones = zoneIds(script);
  const flags = new Set(script.flags);
  const rules = new Set(script.rules.map((r) => r.id));
  const out = [...compileWhen(when).errors];
  for (const t of compileWhen(when).toks) {
    const a = t.args[0] ?? '';
    if (['in', 'enter', 'leave', 'inFor'].includes(t.name) && !zones.has(a)) {
      out.push(`there's no zone called "${a}"`);
    }
    if (['flag', 'flagFor'].includes(t.name) && !flags.has(a)) {
      out.push(`there's no flag called "${a}"`);
    }
    if (t.name === 'firedFor' && !rules.has(a)) out.push(`there's no rule called "${a}"`);
  }
  return out;
}

/** Everything wrong with a script, as readable messages (empty: fine). */
export function validateScript(script: SargeScript): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const zones = new Set<string>();
  for (const z of script.zones) {
    if ((SARGE_ROOMS as readonly string[]).includes(z.id)) {
      problems.push(`Zone "${z.id}" has a room's name`);
    }
    if (zones.has(z.id)) problems.push(`Two zones are called "${z.id}"`);
    zones.add(z.id);
  }
  for (const r of script.rules) {
    if (ids.has(r.id)) problems.push(`Two rules are called "${r.id}"`);
    ids.add(r.id);
    for (const e of checkWhen(r.when, script)) problems.push(`${r.id}: ${e}`);
    for (const st of r.steps) {
      if (st.k === 'set' || st.k === 'clear') {
        if (!script.flags.includes(st.flag)) problems.push(`${r.id}: there's no flag "${st.flag}"`);
      }
    }
  }
  for (const p of script.prefs) {
    for (const e of checkWhen(p.when, script)) problems.push(`position ${p.id}: ${e}`);
    if (p.at.kind === 'zone' && !zoneIds(script).has(p.at.zone)) {
      problems.push(`position ${p.id}: there's no zone "${p.at.zone}"`);
    }
  }
  return problems;
}

/** What a rule said (the text is picked from the step's variants). */
export interface Fired {
  rule: SargeRule;
  text: string;
}

interface Runtime {
  /** The whole condition held at the last look. */
  was: boolean;
  /** Since when everything but `waited` has held (ms), or null. */
  holdSince: number | null;
  lastMs: number;
  /** Per say step: which variant is next. */
  variant: number[];
}

/** A rule that is partway through its steps (it had a wait in it). */
interface Active {
  rule: SargeRule;
  idx: number;
  due: number;
}

/** Decides what runs. Keeps per-rule bookkeeping; `done` and `flags` are the persisted lists. */
export class SargeRunner {
  private readonly rt = new Map<string, Runtime>();
  private active: Active[] = [];

  constructor(
    private script: SargeScript,
    /** Rules already run once (shared with the saved progress). */
    private done: string[],
    /** Flags that are set (shared with the saved progress). */
    private flags: string[],
    /** Called when a rule sets or clears a flag (so the director can time it). */
    private readonly onFlag: (flag: string, on: boolean) => void = () => {},
  ) {}

  setScript(script: SargeScript): void {
    this.script = script;
  }

  /** The persisted lists changed (a reset): use the new ones. */
  setLists(done: string[], flags: string[]): void {
    this.done = done;
    this.flags = flags;
  }

  /** Forget the per-rule timers (a new life, or the script changed). */
  resetTimers(): void {
    this.rt.clear();
    this.active = [];
  }

  private runtime(id: string): Runtime {
    let r = this.rt.get(id);
    if (!r) {
      r = { was: false, holdSince: null, lastMs: -1e12, variant: [] };
      this.rt.set(id, r);
    }
    return r;
  }

  /** The rules that run now (lines come out in the order they're said). */
  run(ctx: SargeCtx): Fired[] {
    const out: Fired[] = [];
    const c: SargeCtx = {
      ...ctx,
      firedSinceS: (id) => {
        const last = this.rt.get(id)?.lastMs ?? -1e12;
        return last < -1e11 ? null : (ctx.nowMs - last) / 1000;
      },
    };
    // Rules that are partway through their steps carry on first.
    for (const a of [...this.active]) this.advance(a, c, out);
    let stopped = false;
    for (const rule of this.script.rules) {
      if (rule.off) continue;
      const rt = this.runtime(rule.id);
      const { toks, errors } = compileWhen(rule.when);
      if (errors.length) continue;
      let wait: number | null = null;
      let ok = true;
      for (const t of toks) {
        if (t.waitS !== undefined) wait = t.waitS;
        else if (!t.test(c)) {
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
      if (!rule.repeat && this.done.includes(rule.id)) continue;
      if (rule.cooldownS && c.nowMs - rt.lastMs < rule.cooldownS * 1000) continue;
      if (!rule.steps.some((s) => s.k !== 'say' || s.say.some((t) => t.trim() !== ''))) continue;
      rt.lastMs = c.nowMs;
      if (wait !== null) rt.holdSince = c.nowMs;
      if (!rule.repeat) this.done.push(rule.id);
      const a: Active = { rule, idx: 0, due: c.nowMs };
      this.active.push(a);
      this.advance(a, c, out);
      if (rule.stop) stopped = true;
    }
    return out;
  }

  /** Runs a rule's steps until it has to wait. */
  private advance(a: Active, c: SargeCtx, out: Fired[]): void {
    const rt = this.runtime(a.rule.id);
    while (a.idx < a.rule.steps.length && c.nowMs >= a.due) {
      const step: SargeStep = a.rule.steps[a.idx]!;
      const i = a.idx++;
      switch (step.k) {
        case 'say': {
          const lines = step.say.filter((t) => t.trim() !== '');
          if (!lines.length) break;
          const n = rt.variant[i] ?? 0;
          rt.variant[i] = n + 1;
          out.push({ rule: a.rule, text: lines[n % lines.length]! });
          break;
        }
        case 'wait':
          a.due = c.nowMs + Math.max(0, step.s) * 1000;
          break;
        case 'set':
          if (!this.flags.includes(step.flag)) {
            this.flags.push(step.flag);
            this.onFlag(step.flag, true);
          }
          break;
        case 'clear': {
          const at = this.flags.indexOf(step.flag);
          if (at >= 0) {
            this.flags.splice(at, 1);
            this.onFlag(step.flag, false);
          }
          break;
        }
      }
    }
    if (a.idx >= a.rule.steps.length) this.active = this.active.filter((x) => x !== a);
  }

  /** Where he likes to stand (the first pref that holds), or null: no opinion. */
  pref(c: SargeCtx): SargePref | null {
    for (const p of this.script.prefs) {
      const { toks, errors } = compileWhen(p.when);
      if (errors.length) continue;
      if (toks.every((t) => t.waitS !== undefined || t.test(c))) return p;
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
