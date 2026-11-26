/**
 * (PHASE19) The battle tape: stitching runs, blended playback, and the drift check (does a fresh
 * re-simulation from 0:00 still match what actually played, enemies included?).
 */
import { describe, expect, it } from 'vitest';
import { MISSION_03 } from '../../content/maps/mission-03';
import { DEFAULT_TUNING } from '../../content/tuning';
import { BASIC_TRAINING } from '../../content/maps/basic-training';
import { firstStrictDrift } from '../tape/drift';
import { ArmyBuilder } from '../bots/army';
import { Tape, type TapeFrame } from '../tape/tape';
import type { WorldView } from '../view';

const frame = (tick: number, x = tick): TapeFrame => ({
  tick,
  view: {
    tick,
    soldiers: [
      {
        kind: 'soldier',
        id: 'S1',
        ordinal: 1,
        x,
        y: 0,
        facing: 0,
        hp: 1,
        maxHp: 1,
        alive: true,
        role: 'echo',
        leadIn: false,
      },
    ],
    turrets: [],
    mines: [],
    vehicles: [],
    gates: [],
    levers: [],
    bridges: [],
    objectives: [],
    capturePoints: [],
    events: [{ kind: 'tick', tick } as unknown as WorldView['events'][number]],
    missionComplete: null,
  },
});

describe('battle tape', () => {
  it('a run replaces the tape from its tick on, keeps the past, and ends the tape', () => {
    const t = new Tape([0, 3, 6, 9, 12].map((k) => frame(k)));
    t.splice(6, [frame(3, 100), frame(6, 200), frame(9, 300)]);
    expect(t.all().map((f) => [f.tick, f.view.soldiers[0]!.x])).toEqual([
      [0, 0],
      [3, 3],
      [6, 200],
      [9, 300],
    ]);
    // A run starting past the end fills the gap.
    t.splice(12, [frame(9, 9), frame(12, 12), frame(15, 15)]);
    expect(t.all().map((f) => f.tick)).toEqual([0, 3, 6, 9, 12, 15]);
  });

  it('blends between frames and hands out each frame’s events once', () => {
    const t = new Tape([frame(0, 0), frame(3, 30), frame(6, 60)]);
    expect(t.viewAt(1.5)!.soldiers[0]!.x).toBeCloseTo(15);
    expect(t.viewAt(3, 0)!.events).toHaveLength(1);
    expect(t.viewAt(6, 0)!.events).toHaveLength(2);
    expect(t.viewAt(4, 3)!.events).toHaveLength(0);
    expect(t.viewAt(7)).toBeNull();
  });

  it('what played matches a fresh re-simulation (bot army, enemies on): the drift check', () => {
    for (const [map, seed] of [
      [MISSION_03, 11],
      [BASIC_TRAINING, 42],
    ] as const) {
      const tape = new Tape();
      const army = new ArmyBuilder({
        map,
        tuning: DEFAULT_TUNING,
        seed,
        lifeSeconds: [8, 25],
        tape,
      });
      army.growTo(12);
      expect(tape.all().some((f) => f.view.soldiers.some((s) => s.role === 'enemy'))).toBe(true);
      expect(firstStrictDrift(tape, map, DEFAULT_TUNING, army.records)).toBeNull();
    }
  }, 60000);
});
