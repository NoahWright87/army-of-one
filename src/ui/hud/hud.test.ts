import { describe, expect, it } from 'vitest';
import type { ObjectiveView, SoldierView, WorldView } from '../../sim/view';
import { countdownLabel, countdownPhase, CountdownTracker } from './countdown-model';
import { ema, entityCounts, formatDebugLines } from './debug-model';
import { buildHudModel, formatHp, hpFraction, objectiveText } from './hud-model';

const soldier = (p: Partial<SoldierView> = {}): SoldierView => ({
  kind: 'soldier',
  id: 'S1',
  ordinal: 1,
  x: 0,
  y: 0,
  facing: 0,
  hp: 100,
  maxHp: 100,
  alive: true,
  role: 'live',
  leadIn: false,
  ...p,
});

const emptyView = (p: Partial<WorldView> = {}): WorldView => ({
  tick: 0,
  soldiers: [],
  turrets: [],
  mines: [],
  vehicles: [],
  gates: [],
  levers: [],
  bridges: [],
  objectives: [],
  events: [],
  missionComplete: null,
  ...p,
});

const objective = (destroyed: boolean): ObjectiveView => ({
  kind: 'objective',
  id: 'O',
  x: 0,
  y: 0,
  radius: 10,
  hp: destroyed ? 0 : 10,
  maxHp: 10,
  destroyed,
});

describe('hud model', () => {
  it('formats hp', () => {
    expect(formatHp(73.2, 100)).toBe('74 / 100');
    expect(formatHp(-5, 100)).toBe('0 / 100');
    expect(hpFraction(50, 100)).toBe(0.5);
    expect(hpFraction(150, 100)).toBe(1);
    expect(hpFraction(5, 0)).toBe(0);
  });

  it('describes the live soldier', () => {
    const m = buildHudModel(
      emptyView({ tick: 125 * 60, soldiers: [soldier({ id: 'S3', ordinal: 3, hp: 40 })] }),
      'S3',
    );
    expect(m.clock).toBe('2:05');
    expect(m.soldierLabel).toBe('Soldier 3');
    expect(m.hpText).toBe('40 / 100');
    expect(m.hpFraction).toBeCloseTo(0.4);
    expect(m.status).toBe('alive');
  });

  it('shows lead-in and death', () => {
    expect(buildHudModel(emptyView({ soldiers: [soldier({ leadIn: true })] }), 'S1').status).toBe(
      'leadIn',
    );
    const dead = buildHudModel(emptyView({ soldiers: [soldier({ alive: false, hp: 0 })] }), 'S1');
    expect(dead.status).toBe('dead');
    expect(dead.hpText).toBe('KIA');
    expect(dead.hpFraction).toBe(0);
    expect(buildHudModel(emptyView(), null).status).toBe('none');
  });

  it('objective text', () => {
    expect(objectiveText([], false)).toMatch(/no objective/i);
    expect(objectiveText([objective(false)], false)).toBe('Destroy the objective');
    expect(objectiveText([objective(true), objective(false)], false)).toContain('1/2');
    expect(objectiveText([objective(true)], true)).toBe('Mission complete');
    expect(buildHudModel(emptyView({ missionComplete: { tick: 5 } }), null).missionComplete).toBe(
      true,
    );
  });
});

describe('countdown', () => {
  it('labels by remaining ticks', () => {
    expect(countdownLabel(300)).toBe('5');
    expect(countdownLabel(241)).toBe('5');
    expect(countdownLabel(240)).toBe('4');
    expect(countdownLabel(1)).toBe('1');
    expect(countdownLabel(0)).toBe('GO');
    expect(countdownLabel(-3)).toBe('GO');
  });

  it('phase runs 0→1 within each second', () => {
    expect(countdownPhase(300)).toBe(0);
    expect(countdownPhase(270)).toBeCloseTo(0.5);
    expect(countdownPhase(0)).toBe(0);
  });

  it('cues once per number, then GO once', () => {
    const t = new CountdownTracker();
    const cues: string[] = [];
    for (let r = 300; r >= -5; r--) {
      const { cue } = t.update(r);
      if (cue) cues.push(cue);
    }
    expect(cues).toEqual(['tick', 'tick', 'tick', 'tick', 'tick', 'go']);
    expect(t.update(null)).toEqual({ label: null, changed: true, cue: null });
  });
});

describe('debug overlay model', () => {
  it('counts entities by kind and soldier role', () => {
    const counts = entityCounts(
      emptyView({
        soldiers: [
          soldier(),
          soldier({ id: 'S2', role: 'echo' }),
          soldier({ id: 'S3', role: 'echo', alive: false }),
        ],
        objectives: [objective(false)],
      }),
    );
    expect(counts).toEqual({ live: 1, echo: 1, corpse: 1, objective: 1 });
  });

  it('formats lines', () => {
    const lines = formatDebugLines({
      fps: 59.6,
      tick: 42,
      counts: { live: 1 },
      hash: 'abc',
      stepMs: 0.12345,
    });
    expect(lines).toEqual(['FPS 60', 'Tick 42', 'ms/step 0.123', 'Hash abc', 'Entities live 1']);
  });

  it('ema', () => {
    expect(ema(null, 4)).toBe(4);
    expect(ema(4, 8, 0.5)).toBe(6);
  });
});
