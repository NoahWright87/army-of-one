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
  /** (05-b) Average sim milliseconds per rendered frame (steps × step cost). */
  simFrameMs?: number;
  /** (05-b) Average milliseconds spent drawing the world per frame (renderer CPU side). */
  renderMs?: number;
  /** (05-b) Game objects drawn last frame, and soldiers culled off screen. */
  sprites?: number;
  culled?: number;
  /** (06-c) Mean frame interval (ms), and the worst one over about the last second. */
  frameMs?: number;
  frameMaxMs?: number;
  /** (06-c) JS ms of the battle scene's update per frame (sim + renderer CPU + HUD). */
  updateMs?: number;
  /** (06-c) Canvas render scale in use (display.renderScale). */
  renderScale?: number;
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
    `${str('debug.fps')} ${Math.round(s.fps)}` +
      (s.frameMs !== undefined
        ? ` · ${str('debug.frame')} ${s.frameMs.toFixed(1)} (max ${(s.frameMaxMs ?? s.frameMs).toFixed(0)})`
        : '') +
      (s.updateMs !== undefined ? ` · update ${s.updateMs.toFixed(2)} ms` : '') +
      (s.renderScale !== undefined && s.renderScale !== 1
        ? ` · ${str('debug.renderScale')} ${s.renderScale}`
        : ''),
    `${str('debug.tick')} ${s.tick}`,
    `${str('debug.stepMs')} ${s.stepMs.toFixed(3)}` +
      (s.simFrameMs !== undefined ? ` · sim/frame ${s.simFrameMs.toFixed(2)}` : ''),
    ...(s.renderMs !== undefined ? [`${str('debug.renderMs')} ${s.renderMs.toFixed(2)}`] : []),
    ...(s.sprites !== undefined
      ? [`${str('debug.sprites')} ${s.sprites}${s.culled ? ` (−${s.culled} off-screen)` : ''}`]
      : []),
    `${str('debug.hash')} ${s.hash}`,
    `${str('debug.entities')} ${counts || '-'}`,
    `${str('debug.echoes')} ${echoLine(s.counts)}`,
  ];
}

/** Soldier counts by role: live · echo · static · interrupted · corpse. */
function echoLine(c: Readonly<Record<string, number>>): string {
  const roles = ['live', 'echo', 'static', 'interrupted', 'corpse'];
  return roles.map((r) => `${r} ${c[r] ?? 0}`).join(' · ');
}

/** Exponential moving average; first sample seeds it. */
export function ema(prev: number | null, sample: number, k = 0.1): number {
  return prev === null ? sample : prev + (sample - prev) * k;
}
