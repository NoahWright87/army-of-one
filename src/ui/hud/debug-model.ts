/** Pure helpers for the debug overlay (backtick). */
import { str } from '../../content/strings';
import type { WorldView } from '../../sim/view';

export interface DebugStats {
  fps: number;
  tick: number;
  counts: Readonly<Record<string, number>>;
  hash: string;
  /** Average milliseconds per sim step. */
  stepMs: number;
}

/** Entity counts by kind, with soldiers split by role (and dead ones counted as corpses). */
export function entityCounts(view: WorldView): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of view.soldiers) {
    const k = s.alive ? s.role : 'corpse';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const lists = {
    turret: view.turrets,
    mine: view.mines,
    vehicle: view.vehicles,
    gate: view.gates,
    lever: view.levers,
    bridge: view.bridges,
    objective: view.objectives,
  };
  for (const [k, list] of Object.entries(lists)) if (list.length) counts[k] = list.length;
  return counts;
}

export function formatDebugLines(s: DebugStats): string[] {
  const counts = Object.entries(s.counts)
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
  return [
    `${str('debug.fps')} ${Math.round(s.fps)}`,
    `${str('debug.tick')} ${s.tick}`,
    `${str('debug.stepMs')} ${s.stepMs.toFixed(3)}`,
    `${str('debug.hash')} ${s.hash}`,
    `${str('debug.entities')} ${counts || '-'}`,
  ];
}

/** Exponential moving average; first sample seeds it. */
export function ema(prev: number | null, sample: number, k = 0.1): number {
  return prev === null ? sample : prev + (sample - prev) * k;
}
