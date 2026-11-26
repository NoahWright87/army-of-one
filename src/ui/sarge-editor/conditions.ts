/**
 * (PHASE18) The Sarge editor's friendly names for the script's condition tokens ([D161]). A
 * condition is a sentence with blanks ("you enter [zone]"); this turns a token string
 * ("enter:r1, !in:bags") into rows of those sentences and back. Pure data and functions.
 */
import { roleDef, ROLES } from '../../content/roles';
import { BASIC_TRAINING, BT_TARGETS } from '../../content/maps/basic-training';
import { SARGE_ROOM_NAMES, SARGE_ROOMS, type SargeScript } from '../../content/sarge-script';
import { strDynamic } from '../../content/strings';

export type ParamKind =
  | 'zone'
  | 'room'
  | 'flag'
  | 'cp'
  | 'gate'
  | 'role'
  | 'rule'
  | 'spawn'
  | 'target'
  | 'stall'
  | 'happened'
  | 'cause'
  | 'hint'
  | 'num';

export interface CondType {
  /** Unique. */
  id: string;
  /** The token's name. */
  name: string;
  group: 'happens' | 'timer' | 'state';
  /** The sentence: text, and numbers for the blanks (index into `params`). */
  label: (string | number)[];
  /** What "not" says instead (states and timers only). */
  notLabel?: (string | number)[];
  params: ParamKind[];
}

const T = (
  id: string,
  group: CondType['group'],
  label: (string | number)[],
  params: ParamKind[] = [],
  more: Partial<CondType> = {},
  name = id,
): CondType => ({ id, name, group, label, params, ...more });

export const COND_TYPES: readonly CondType[] = [
  // Things that happen (for one moment).
  T('lifeStart', 'happens', ["a new soldier's life begins"]),
  T('enter', 'happens', ['you walk into ', 0], ['zone']),
  T('leave', 'happens', ['you walk out of ', 0], ['zone']),
  T('captured', 'happens', ['you capture ', 0], ['cp']),
  T('gateOpened', 'happens', [0, ' opens'], ['gate']),
  T('stallDone', 'happens', ['every target in ', 0, ' is down'], ['stall']),
  T('mgsDown', 'happens', ['the machine guns are down']),
  T('fired', 'happens', ['you fire a shot']),
  T('minesShot', 'happens', ['you set off a mine']),
  T('died', 'happens', ['you die']),
  T('diedAt', 'happens', ['you die in ', 0], ['room'], {}, 'died'),
  T('nestCleared', 'happens', ['the MG nest is cleared']),
  T('rangeCleared', 'happens', ['the sniper range guns are cleared']),
  T('shotAtSarge', 'happens', ['you shoot at Sarge']),
  T('respawnOpen', 'happens', ['the respawn view opens']),
  // Timers.
  T('inFor', 'timer', ["you've been in ", 0, ' for ', 1, ' seconds'], ['zone', 'num'], {
    notLabel: ["you haven't been in ", 0, ' for ', 1, ' seconds'],
  }),
  T('inRoom', 'timer', ["you've been in this room for ", 0, ' seconds'], ['num'], {
    notLabel: ["you haven't been in this room for ", 0, ' seconds'],
  }),
  T('flagFor', 'timer', [0, ' has been set for ', 1, ' seconds'], ['flag', 'num'], {
    notLabel: [0, " hasn't been set for ", 1, ' seconds'],
  }),
  T('firedFor', 'timer', [0, ' ran ', 1, ' seconds ago'], ['rule', 'num'], {
    notLabel: [0, " didn't run ", 1, ' seconds ago'],
  }),
  T('quiet', 'timer', ["Sarge hasn't said anything for ", 0, ' seconds'], ['num'], {
    notLabel: ['Sarge has spoken within ', 0, ' seconds'],
  }),
  T('holdFire', 'timer', ["you haven't fired for ", 0, ' seconds'], ['num'], {
    notLabel: ['you fired within ', 0, ' seconds'],
  }),
  T('still', 'timer', ["you've stood still for ", 0, ' seconds'], ['num'], {
    notLabel: ["you haven't stood still for ", 0, ' seconds'],
  }),
  T('waited', 'timer', ['all of the above is still true after ', 0, ' seconds'], ['num']),
  // Things that are true.
  T('in', 'state', ["you're in ", 0], ['zone'], { notLabel: ["you're not in ", 0] }),
  T('alive', 'state', ["you're alive"], [], { notLabel: ["you're dead"] }),
  T('flag', 'state', [0, ' is set'], ['flag'], { notLabel: [0, ' is not set'] }),
  T('had', 'state', [0, ' has happened'], ['happened'], { notLabel: [0, " hasn't happened yet"] }),
  T('gate', 'state', [0, ' is open'], ['gate'], { notLabel: [0, ' is shut'] }),
  T('firstLife', 'state', ["it's your first life"], [], { notLabel: ["it's not your first life"] }),
  T('deaths', 'state', ["you've died exactly ", 0, ' times'], ['num']),
  T('deaths>', 'state', ["you've died more than ", 0, ' times'], ['num'], {
    notLabel: ["you've died ", 0, ' times or fewer'],
  }),
  T('diedIn', 'state', ["you've died in ", 0], ['room'], {
    notLabel: ["you've never died in ", 0],
  }),
  T('role', 'state', ['your class is ', 0], ['role'], { notLabel: ["your class isn't ", 0] }),
  T('hurt', 'state', ["you're wounded"], [], { notLabel: ["you're at full health"] }),
  T('targetsLeft', 'state', ['targets are left in ', 0], ['stall'], {
    notLabel: ['no targets are left in ', 0],
  }),
  T('misses>', 'state', ["you've missed more than ", 0, ' shots here'], ['num'], {
    notLabel: ["you've missed ", 0, ' shots or fewer here'],
  }),
  T('nextTarget', 'state', ['the next target to shoot is ', 0], ['target'], {
    notLabel: ["the next target isn't ", 0],
  }),
  T('corridor', 'state', ["you're in the MG corridor"], [], {
    notLabel: ["you're not in the MG corridor"],
  }),
  T('atSpawn', 'state', ['you stand at ', 0], ['spawn'], { notLabel: ["you don't stand at ", 0] }),
  T('cause', 'state', ['what killed you was ', 0], ['cause'], {
    notLabel: ["what killed you wasn't ", 0],
  }),
  T('respawn', 'state', ['the respawn view is open'], [], {
    notLabel: ['the respawn view is closed'],
  }),
  T('afterDeath', 'state', ['the respawn view opened after a death'], [], {
    notLabel: ["the respawn view didn't open after a death"],
  }),
  T('hint', 'state', ['the respawn hint is ', 0], ['hint'], {
    notLabel: ["the respawn hint isn't ", 0],
  }),
  T('hintSpawn', 'state', ['the respawn hint points at ', 0], ['spawn'], {
    notLabel: ["the respawn hint doesn't point at ", 0],
  }),
  T('hintRole', 'state', ['the respawn hint has a new class'], [], {
    notLabel: ['the respawn hint has no new class'],
  }),
  T('taught', 'state', ['the hint "', 0, '" was already followed'], ['happened'], {}),
];

export const GROUP_LABELS: Record<CondType['group'], string> = {
  happens: 'When this happens…',
  timer: 'After a while…',
  state: 'And this is true…',
};

/** One row of a condition list. */
export interface CondRow {
  neg: boolean;
  type: CondType;
  args: string[];
}

/** The token a row stands for. */
export function rowToToken(row: CondRow): string {
  const { type, args } = row;
  const body =
    type.name === 'deaths>' || type.name === 'misses>'
      ? `${type.name}${args[0] ?? '0'}`
      : [type.name, ...args].join(':').replace(/:+$/, '');
  return `${row.neg ? '!' : ''}${body}`;
}

/** The row a token stands for, or null (a token the friendly list doesn't know). */
export function tokenToRow(raw: string): CondRow | null {
  let t = raw.trim();
  const neg = t.startsWith('!');
  if (neg) t = t.slice(1).trim();
  const gt = /^(deaths|misses)>(\d+)$/.exec(t);
  if (gt) return { neg, type: COND_TYPES.find((c) => c.name === `${gt[1]}>`)!, args: [gt[2]!] };
  const [name, ...args] = t.split(':');
  const matches = COND_TYPES.filter((c) => c.name === name);
  if (!matches.length) return null;
  // `died` and `died:<room>` share a token name: the number of blanks tells them apart.
  const type = matches.find((c) => c.params.length === args.length) ?? matches[0]!;
  // `inFor:<zone>:<n>` has two blanks; a "had" blank holds the rest ("captured:bt-a").
  if (type.params.length === 1 && type.params[0] === 'happened') {
    return { neg, type, args: [args.join(':')] };
  }
  if (type.params.length !== args.length) return null;
  return { neg, type, args };
}

/** Splits a `when` into rows; tokens it can't show come back as `raw`. */
export function parseWhen(when: string): { rows: (CondRow | { raw: string })[] } {
  const rows = when
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => tokenToRow(p) ?? { raw: p });
  return { rows };
}

export function rowsToWhen(rows: readonly (CondRow | { raw: string })[]): string {
  return rows.map((r) => ('raw' in r ? r.raw : rowToToken(r))).join(', ');
}

/** A row's sentence as plain text (for lists and the "used by" notes). */
export function describeRow(row: CondRow, script: SargeScript): string {
  const label = row.neg && row.type.notLabel ? row.type.notLabel : row.type.label;
  const text = label
    .map((p) => {
      if (typeof p === 'string') return p;
      const kind = row.type.params[p]!;
      return optionLabel(kind, row.args[p] ?? '', script);
    })
    .join('');
  return row.neg && !row.type.notLabel ? `not: ${text}` : text;
}

export const describeWhen = (when: string, script: SargeScript): string =>
  parseWhen(when)
    .rows.map((r) => ('raw' in r ? r.raw : describeRow(r, script)))
    .join(' · ') || 'always';

// --- What goes in each blank ---------------------------------------------------------------

export interface Option {
  value: string;
  label: string;
}

/** "open-field target 3", "lane target 5 (far: 3 hits)". */
const targetName = (id: string): string => {
  const n = id.slice(-1);
  if (id.startsWith('bt-a')) return `open-field target ${n}`;
  return Number(n) >= 4 ? `lane target ${n} (far: 3 hits)` : `lane target ${n} (near)`;
};

const gateName = (id: string) => `Gate ${id.replace('bt-g', '')}`;

export function paramOptions(kind: ParamKind, script: SargeScript): Option[] {
  switch (kind) {
    case 'zone':
      return [
        ...SARGE_ROOMS.map((r) => ({ value: r, label: SARGE_ROOM_NAMES[r] })),
        ...script.zones.map((z) => ({ value: z.id, label: z.name || z.id })),
      ];
    case 'room':
      return SARGE_ROOMS.map((r) => ({ value: r, label: SARGE_ROOM_NAMES[r] }));
    case 'flag':
      return script.flags.map((f) => ({ value: f, label: f }));
    case 'cp':
      return (BASIC_TRAINING.capturePoints ?? []).map((c) => ({
        value: c.id,
        label: strDynamic(c.nameKey),
      }));
    case 'gate':
      return (BASIC_TRAINING.gates ?? []).map((g) => ({ value: g.id, label: gateName(g.id) }));
    case 'role':
      return ROLES.map((r) => ({ value: r.id, label: strDynamic(roleDef(r.id).nameKey) }));
    case 'rule':
      return script.rules.map((r) => ({ value: r.id, label: r.id }));
    case 'spawn':
      return BASIC_TRAINING.spawnPoints.map((s) => ({
        value: s.id,
        label: strDynamic(s.nameKey),
      }));
    case 'target':
      return BT_TARGETS.map((t) => ({ value: t, label: targetName(t) }));
    case 'stall':
      return [
        { value: 'a', label: 'the open field' },
        { value: 'b', label: 'the sandbag lane' },
      ];
    case 'happened':
      return [
        ...(BASIC_TRAINING.capturePoints ?? []).map((c) => ({
          value: `captured:${c.id}`,
          label: `you captured ${strDynamic(c.nameKey)}`,
        })),
        ...(BASIC_TRAINING.gates ?? []).map((g) => ({
          value: `gateOpened:${g.id}`,
          label: `${gateName(g.id)} opened`,
        })),
        { value: 'stallDone:a', label: 'the open field was cleared' },
        { value: 'stallDone:b', label: 'the sandbag lane was cleared' },
        { value: 'mgsDown', label: 'the machine guns were silenced' },
        { value: 'minesShot', label: 'you set off a mine' },
        { value: 'nestCleared', label: 'the MG nest was cleared' },
        { value: 'rangeCleared', label: 'the sniper range guns were cleared' },
        { value: 'station', label: 'you started partway ("start here")' },
        { value: 'spawnA', label: 'the Alpha spawn hint (for "hint followed")' },
        ...script.rules.map((r) => ({ value: r.id, label: `rule "${r.id}" ran` })),
      ];
    case 'cause':
      return [
        { value: 'mine', label: 'a mine' },
        { value: 'shot', label: 'a bullet' },
      ];
    case 'hint':
      return [
        { value: 'deploy', label: 'deploy (the first screen)' },
        { value: 'spawn', label: 'spawn (pick a flag)' },
        { value: 'resume', label: 'resume (a saved soldier)' },
      ];
    case 'num':
      return [];
  }
}

export function optionLabel(kind: ParamKind, value: string, script: SargeScript): string {
  if (kind === 'num') return value;
  return paramOptions(kind, script).find((o) => o.value === value)?.label ?? `${value} (?)`;
}

/** A starting row for a condition type (the first choice in each blank). */
export function newRow(type: CondType, script: SargeScript): CondRow {
  const args = type.params.map((k) =>
    k === 'num' ? '5' : (paramOptions(k, script)[0]?.value ?? ''),
  );
  return { neg: false, type, args };
}
