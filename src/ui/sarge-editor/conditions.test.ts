import { describe, expect, it } from 'vitest';
import { BASIC_TRAINING } from '../../content/maps/basic-training';
import { applyGateDelays, gateRules } from '../../content/maps/basic-training-stations';
import { DEFAULT_SARGE_SCRIPT } from '../../content/sarge-script';
import {
  COND_TYPES,
  describeWhen,
  newRow,
  parseWhen,
  paramOptions,
  rowsToWhen,
} from './conditions';

const norm = (when: string) =>
  when
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .join(', ');

describe('the Sarge editor’s friendly conditions', () => {
  it('every condition in the default script has a friendly sentence, and round-trips', () => {
    const whens = [
      ...DEFAULT_SARGE_SCRIPT.rules.map((r) => r.when),
      ...DEFAULT_SARGE_SCRIPT.prefs.map((p) => p.when),
    ];
    for (const when of whens) {
      const { rows } = parseWhen(when);
      expect(
        rows.filter((r) => 'raw' in r),
        `typed-only tokens in "${when}"`,
      ).toEqual([]);
      expect(rowsToWhen(rows)).toBe(norm(when));
    }
  });

  it('puts conditions into words', () => {
    const s = DEFAULT_SARGE_SCRIPT;
    expect(describeWhen('enter:r1', s)).toBe('you walk into Range: open field');
    expect(describeWhen('!in:bags, alive', s)).toBe("you're not in By the sandbags · you're alive");
    expect(describeWhen('had:captured:bt-a, !gate:bt-g2', s)).toBe(
      'you captured Alpha flag has happened · Gate 2 is shut',
    );
    expect(describeWhen('inFor:bags:5', s)).toBe("you've been in By the sandbags for 5 seconds");
    expect(describeWhen('', s)).toBe('always');
  });

  it('every kind of condition can be added, and gives a valid token', () => {
    const script = { ...DEFAULT_SARGE_SCRIPT, flags: ['f'] }; // flag conditions need a flag to pick
    for (const t of COND_TYPES) {
      const row = newRow(t, script);
      const back = parseWhen(rowsToWhen([row])).rows[0]!;
      expect('raw' in back, t.id).toBe(false);
    }
  });

  it('a typed token the list does not know stays as typed text', () => {
    expect(parseWhen('bogus:1, enter:r1').rows[0]).toEqual({ raw: 'bogus:1' });
  });

  it('offers the map’s own flags, gates and spawns', () => {
    const s = DEFAULT_SARGE_SCRIPT;
    expect(paramOptions('cp', s).map((o) => o.label)).toContain('Alpha flag');
    expect(paramOptions('gate', s).map((o) => o.value)).toContain('bt-g2');
    expect(paramOptions('zone', s).map((o) => o.value)).toEqual(
      expect.arrayContaining(['r0', 'r7', 'bags']),
    );
  });
});

describe('gate delays', () => {
  it('are in the script and change how long a gate waits', () => {
    const rules = gateRules(BASIC_TRAINING);
    expect(rules.find((r) => r.gate === 'bt-g2')!.delayS).toBe(6);
    const before = BASIC_TRAINING.triggers!;
    try {
      applyGateDelays(BASIC_TRAINING, { 'bt-g2': 2, 'bt-g1': 1.5 });
      const after = gateRules(BASIC_TRAINING);
      expect(after.find((r) => r.gate === 'bt-g2')!.delayS).toBe(2);
      expect(after.find((r) => r.gate === 'bt-g1')!.delayS).toBe(1.5);
      expect(after.find((r) => r.gate === 'bt-g5b')!.delayS).toBe(0); // untouched
    } finally {
      (BASIC_TRAINING as { triggers?: typeof before }).triggers = before;
    }
  });
});
