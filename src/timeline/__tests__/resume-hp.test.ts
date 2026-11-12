/** (PHASE12-d) Resume HP ([D76]): an O remembers how hurt the soldier is; too hurt = not offered. */
import { describe, expect, it } from 'vitest';
import { MISSION_03 } from '../../content/maps/mission-03';
import type { LaneTruth } from '../../contracts/mission';
import { deriveSpawnOptions } from '../spawn-options';

const lane = (id: string, hp?: number): LaneTruth => ({
  soldierId: id,
  recordedFrom: 0,
  recordedTo: 600,
  spans: [],
  end: { kind: 'open', tick: 600, ...(hp !== undefined ? { hp } : {}) },
  markers: [],
});

describe('resume HP', () => {
  it('offers a saved soldier only with at least minResumeHp left', () => {
    const rules = { spawnIntervalTicks: 120, leadInTicks: 300, minResumeHp: 0.1 };
    const opts = deriveSpawnOptions(
      MISSION_03,
      [],
      [lane('S1', 0.05), lane('S2', 0.5), lane('S3')],
      rules,
    );
    const resumes = opts
      .filter((o) => o.kind === 'resume')
      .map((o) => o.kind === 'resume' && o.soldierId);
    expect(resumes).toEqual(['S2', 'S3']); // S3: older truth without HP still counts
  });
});
