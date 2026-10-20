/**
 * Maps SimEvents to presentation cues (effects, sounds, shake, hit flashes). Pure, so "incoming
 * fire toward the live soldier is obvious" is a tested rule, not a hope.
 */
import type { SoundKey } from '../content/assets';
import type { SimEvent } from '../sim/events';
import type { WorldView } from '../sim/view';
import { rectViewCenter } from './geometry';
import { pointSegmentDistance } from './interp';

export type TracerStyle = 'live' | 'friendly' | 'hostile' | 'incoming';

export type Cue =
  | {
      type: 'tracer';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      style: TracerStyle;
    }
  | { type: 'muzzle'; x: number; y: number; angle: number; hostile: boolean; byId: string }
  | { type: 'impact'; x: number; y: number }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'hitFlash'; targetId: string }
  | { type: 'liveDamaged'; amount: number }
  | { type: 'windup'; turretId: string; targetId: string }
  | { type: 'sound'; key: SoundKey; x: number | null; y: number | null; gain: number }
  | { type: 'shake'; intensity: number; durationMs: number };

export type EntityKind =
  'soldier' | 'turret' | 'mine' | 'vehicle' | 'gate' | 'lever' | 'bridge' | 'objective';

/** Lookups the cue builder needs about the current view. */
export interface CueContext {
  liveId: string | null;
  kindOf(id: string): EntityKind | undefined;
  positionOf(id: string): { x: number; y: number } | undefined;
}

/** Shots passing within this distance of the live soldier count as incoming fire. */
export const NEAR_MISS_DISTANCE = 40;
/** Explosions closer than this to the live soldier shake the camera. */
export const SHAKE_DISTANCE = 500;

export function cueContextFromView(view: WorldView, liveId: string | null): CueContext {
  const kinds = new Map<string, EntityKind>();
  const pos = new Map<string, { x: number; y: number }>();
  const add = (list: readonly { id: string; x: number; y: number }[], kind: EntityKind) => {
    for (const e of list) {
      kinds.set(e.id, kind);
      pos.set(e.id, { x: e.x, y: e.y });
    }
  };
  add(view.soldiers, 'soldier');
  add(view.turrets, 'turret');
  add(view.mines, 'mine');
  add(view.vehicles, 'vehicle');
  add(view.levers, 'lever');
  add(view.objectives, 'objective');
  for (const g of [...view.gates, ...view.bridges]) {
    kinds.set(g.id, g.kind);
    pos.set(g.id, rectViewCenter(g));
  }
  return { liveId, kindOf: (id) => kinds.get(id), positionOf: (id) => pos.get(id) };
}

const EXPLOSION_RADIUS: Partial<Record<EntityKind, number>> = {
  turret: 40,
  vehicle: 48,
  bridge: 60,
  objective: 90,
};

export function eventCues(events: readonly SimEvent[], ctx: CueContext): Cue[] {
  const out: Cue[] = [];
  const live = ctx.liveId ? ctx.positionOf(ctx.liveId) : undefined;
  const nearLive = (x: number, y: number) =>
    live !== undefined && Math.hypot(x - live.x, y - live.y) < SHAKE_DISTANCE;
  const sound = (key: SoundKey, at?: { x: number; y: number }, gain = 1) =>
    out.push({ type: 'sound', key, x: at?.x ?? null, y: at?.y ?? null, gain });

  for (const e of events) {
    switch (e.kind) {
      case 'shotFired': {
        const shooterKind = ctx.kindOf(e.by);
        const friendly = shooterKind === 'soldier';
        const byLive = e.by === ctx.liveId;
        let style: TracerStyle = byLive ? 'live' : friendly ? 'friendly' : 'hostile';
        if (!friendly && live) {
          const hitsLive = e.hitId !== undefined && e.hitId === ctx.liveId;
          const near =
            pointSegmentDistance(live, { x: e.fromX, y: e.fromY }, { x: e.hitX, y: e.hitY }) <
            NEAR_MISS_DISTANCE;
          if (hitsLive || near) style = 'incoming';
        }
        out.push({
          type: 'tracer',
          fromX: e.fromX,
          fromY: e.fromY,
          toX: e.hitX,
          toY: e.hitY,
          style,
        });
        out.push({
          type: 'muzzle',
          x: e.fromX,
          y: e.fromY,
          angle: e.angle,
          hostile: !friendly,
          byId: e.by,
        });
        out.push({ type: 'impact', x: e.hitX, y: e.hitY });
        const from = { x: e.fromX, y: e.fromY };
        if (shooterKind === 'turret')
          sound('sfx_turret_shot', from, style === 'incoming' ? 1 : 0.8);
        else sound('sfx_rifle_shot', from, byLive ? 0.7 : 0.35);
        break;
      }
      case 'damaged': {
        out.push({ type: 'hitFlash', targetId: e.target });
        const isLive = e.target === ctx.liveId;
        if (isLive) {
          out.push({ type: 'liveDamaged', amount: e.amount });
          out.push({ type: 'shake', intensity: 0.004, durationMs: 90 });
        }
        if (ctx.kindOf(e.target) === 'soldier')
          sound('sfx_hit', ctx.positionOf(e.target), isLive ? 1 : 0.5);
        break;
      }
      case 'soldierDied': {
        const p = ctx.positionOf(e.id);
        sound('sfx_death', p, e.id === ctx.liveId ? 1 : 0.6);
        if (e.id === ctx.liveId) out.push({ type: 'shake', intensity: 0.01, durationMs: 250 });
        break;
      }
      case 'mineDetonated': {
        out.push({ type: 'explosion', x: e.x, y: e.y, radius: e.radius });
        sound('sfx_explosion', e, 1);
        if (nearLive(e.x, e.y)) out.push({ type: 'shake', intensity: 0.012, durationMs: 300 });
        break;
      }
      case 'hazardDestroyed':
      case 'objectiveDestroyed': {
        const p = ctx.positionOf(e.id);
        if (!p) break;
        const kind = ctx.kindOf(e.id);
        const radius = (kind && EXPLOSION_RADIUS[kind]) ?? 40;
        out.push({ type: 'explosion', x: p.x, y: p.y, radius });
        sound('sfx_explosion', p, 1);
        if (e.kind === 'objectiveDestroyed') sound('sfx_mission_complete', undefined, 1);
        if (nearLive(p.x, p.y) || e.kind === 'objectiveDestroyed') {
          out.push({
            type: 'shake',
            intensity: e.kind === 'objectiveDestroyed' ? 0.02 : 0.01,
            durationMs: 350,
          });
        }
        break;
      }
      case 'turretWindup': {
        out.push({ type: 'windup', turretId: e.id, targetId: e.targetId });
        sound('sfx_turret_windup', ctx.positionOf(e.id), e.targetId === ctx.liveId ? 1 : 0.5);
        break;
      }
      case 'interacted':
        sound('sfx_lever', ctx.positionOf(e.targetId) ?? ctx.positionOf(e.by), 1);
        break;
      case 'gateChanged':
        sound('sfx_gate', ctx.positionOf(e.id), 0.9);
        break;
      case 'bridgeChanged':
        if (e.state === 'destroyed') break; // the hazardDestroyed explosion covers it
        sound('sfx_gate', ctx.positionOf(e.id), 0.9);
        break;
      case 'soldierSpawned':
        break;
    }
  }
  return out;
}
