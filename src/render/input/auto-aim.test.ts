import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { controlScheme } from '../../app/game-settings';
import { arena } from '../../sim/__tests__/helpers';
import { createWorld, getView, spawnSoldier } from '../../sim/sim';
import { damageShare } from '../../sim/combat/armor';
import type { WorldView } from '../../sim/view';
import { knobOffset, looksLikeTouch, stickVector } from '../../ui/touch/stick-math';
import {
  AutoAimInput,
  autoAimError,
  friendlyInBlast,
  leadPoint,
  autoAimRange,
  pickTarget,
  rankTargets,
  RETICLE_SHORT_OF_TARGET,
} from './auto-aim';
import type { InputSource } from './input-source';

const T = DEFAULT_TUNING;
const map = arena({
  walls: [{ x: 600, y: 0, w: 20, h: 300 }],
  turrets: [
    { id: 'near', position: { x: 300, y: 500 }, facing: 0 },
    { id: 'far', position: { x: 550, y: 500 }, facing: 0 },
    { id: 'walled', position: { x: 700, y: 150 }, facing: 0 },
    { id: 'out', position: { x: 900, y: 900 }, facing: 0 },
  ],
  objectives: [{ id: 'obj', position: { x: 150, y: 300 } }],
});

function viewWith(mut?: (v: WorldView) => void): {
  view: WorldView;
  me: { id: string; x: number; y: number };
} {
  const w = createWorld(map, { ...T, turret: { ...T.turret, range: 1 } });
  const id = spawnSoldier(w, 'a', { position: { x: 100, y: 500 } });
  const view = getView(w);
  mut?.(view);
  return { view, me: { id, x: 100, y: 500 } };
}

describe('auto-aim picker ([D41])', () => {
  it('ranks turrets in range with a clear line, nearest first, objectives last', () => {
    const { view, me } = viewWith();
    const ids = rankTargets(view, map, me, 520).map((c) => c.id);
    expect(ids).toEqual(['near', 'far', 'obj']);
    expect(ids).not.toContain('walled');
    expect(ids).not.toContain('out');
  });

  it('a turret winding up on you comes first', () => {
    const { view, me } = viewWith((v) => {
      const far = v.turrets.find((t) => t.id === 'far')!;
      far.state = 'windup';
      far.targetId = 'S1';
    });
    expect(pickTarget(view, map, me, 520, null)?.id).toBe('far');
  });

  it('sticks with the current target while it stays valid; switches if it dies', () => {
    const { view, me } = viewWith();
    expect(pickTarget(view, map, me, 520, 'far')?.id).toBe('far');
    view.turrets.find((t) => t.id === 'far')!.state = 'destroyed';
    expect(pickTarget(view, map, me, 520, 'far')?.id).toBe('near');
  });

  it('enemy soldiers are targets too ([D44])', () => {
    const { view, me } = viewWith((v) => {
      v.soldiers.push({ ...v.soldiers[0]!, id: 'E1', role: 'enemy', x: 180, y: 500 });
    });
    expect(pickTarget(view, map, me, 520, null)?.id).toBe('E1');
  });

  it('nothing in range → null', () => {
    const { view, me } = viewWith();
    expect(pickTarget(view, map, me, 50, null)).toBeNull();
  });

  it('range follows the role', () => {
    expect(autoAimRange(T, undefined)).toBe(T.rifle.range);
    expect(autoAimRange(T, 'gunner')).toBe(T.mg.range);
    expect(autoAimRange(T, 'grenadier')).toBe(T.grenade.maxRange);
  });

  it('the decorator aims at the target and auto-fires; without a target it passes through', () => {
    const base: InputSource = {
      read: () => ({ move: { x: 1, y: 0 }, aim: 2, fire: false, interact: false }),
      pointerWorld: () => null,
      destroy: () => {},
    };
    const a = new AutoAimInput(base, { map, tuning: T, liveId: 'S1', fireMode: () => 'auto' });
    const { view } = viewWith();
    a.observe(view);
    const input = a.read({ x: 100, y: 500 });
    expect(input.aim).toBeCloseTo(0);
    expect(input.aimDistance).toBeCloseTo(200);
    expect(input.fire).toBe(true);
    expect(input.move).toEqual({ x: 1, y: 0 });
    const hold = new AutoAimInput(base, { map, tuning: T, liveId: 'S1', fireMode: () => 'hold' });
    hold.observe(view);
    expect(hold.read({ x: 100, y: 500 }).fire).toBe(false);
    // The reticle sits on the line to the target, just short of it.
    const r = a.pointerWorld()!;
    expect(r.y).toBeCloseTo(500);
    expect(r.x).toBeCloseTo(300 - RETICLE_SHORT_OF_TARGET);
    const empty = viewWith((v) => v.turrets.forEach((t) => (t.state = 'destroyed')));
    empty.view.objectives.forEach((o) => (o.destroyed = true));
    a.observe(empty.view);
    expect(a.read({ x: 100, y: 500 }).aim).toBe(2);
  });
});

describe('touch sticks ([D41])', () => {
  const cfg = { radius: 50, deadZone: 0.2 };
  it('dead zone, ramp and clamp', () => {
    expect(stickVector({ x: 0, y: 0 }, { x: 5, y: 0 }, cfg)).toEqual({ x: 0, y: 0 });
    expect(stickVector({ x: 0, y: 0 }, { x: 30, y: 0 }, cfg).x).toBeCloseTo(0.5);
    const far = stickVector({ x: 0, y: 0 }, { x: 0, y: 500 }, cfg);
    expect(far.y).toBeCloseTo(1);
    expect(knobOffset({ x: 0, y: 0 }, { x: 0, y: 500 }, 50)).toEqual({ x: 0, y: 50 });
  });

  it('device detection and the control scheme', () => {
    expect(looksLikeTouch({ coarse: true, fine: false, maxTouchPoints: 5 })).toBe(true);
    expect(looksLikeTouch({ coarse: false, fine: true, maxTouchPoints: 10 })).toBe(false);
    expect(controlScheme('auto', 'auto', true)).toEqual({ touch: true, autoAim: true });
    expect(controlScheme('auto', 'auto', false)).toEqual({ touch: false, autoAim: false });
    expect(controlScheme('mouse', 'on', true)).toEqual({ touch: false, autoAim: true });
    expect(controlScheme('touch', 'off', false)).toEqual({ touch: true, autoAim: false });
  });
});

describe('auto-aim with the PHASE12-a weapons', () => {
  it('reaches as far as the gun in hand', () => {
    expect(autoAimRange(T, 'sniper', 'pistol')).toBe(T.pistol.range);
    expect(autoAimRange(T, 'sniper', 'sniper')).toBe(T.sniper.range);
    expect(autoAimRange(T, 'shotgun')).toBe(T.shotgun.range);
    expect(autoAimRange(T, 'bazooka')).toBe(T.rocket.range);
  });

  it('is bad with a sniper rifle against moving soldiers, and with rockets against any soldier ([D59], [D62])', () => {
    const still = { id: 'E1', soldier: true, speedFrac: 0 };
    const moving = { id: 'E1', soldier: true, speedFrac: 1 };
    const errs = (gun: 'sniper' | 'rocket' | 'rifle', tgt: typeof still) =>
      Array.from({ length: 40 }, (_, i) => Math.abs(autoAimError(T, gun, tgt, i)));
    expect(Math.max(...errs('sniper', still))).toBe(0);
    expect(Math.max(...errs('sniper', moving))).toBeGreaterThan(T.sniper.movingTargetAimError / 2);
    expect(Math.max(...errs('rocket', still))).toBeGreaterThan(T.rocket.soldierAimError / 2);
    expect(Math.max(...errs('rocket', { id: 'V1', soldier: false, speedFrac: 1 }))).toBe(0);
    expect(Math.max(...errs('rifle', moving))).toBe(0);
  });

  it('a Bazooka goes for vehicles first', () => {
    const { view, me } = viewWith((v) => {
      v.vehicles.push({
        kind: 'vehicle',
        id: 'V9',
        x: 200,
        y: 520,
        w: 60,
        h: 30,
        heading: 0,
        state: 'moving',
        hp: 100,
        maxHp: 100,
      });
    });
    expect(rankTargets(view, map, me, 1000, true)[0]!.id).toBe('V9');
    expect(rankTargets(view, map, me, 1000)[0]!.id).not.toBe('V9');
  });
});

describe('auto-aim and armor (PHASE12-b)', () => {
  it('a rifle ranks a tank behind a soldier it can hurt', () => {
    const w = createWorld(arena(), { ...T, ai: { ...T.ai, enabled: false } });
    const me = spawnSoldier(w, 'a', { position: { x: 100, y: 500 } });
    spawnSoldier(w, 'a', { position: { x: 200, y: 500 }, roleId: 'tank', team: 'enemy' });
    spawnSoldier(w, 'a', { position: { x: 400, y: 500 }, team: 'enemy' });
    const view = getView(w);
    const share = (r: (typeof view.soldiers)[number]['roleId']) => damageShare(T, 'rifle', r);
    const ranked = rankTargets(view, arena(), { id: me, x: 100, y: 500 }, 1000, false, share);
    expect(view.soldiers.find((s) => s.id === ranked[0]!.id)!.roleId).toBeUndefined();
    const rockets = rankTargets(view, arena(), { id: me, x: 100, y: 500 }, 1000, true, (r) =>
      damageShare(T, 'rocket', r),
    );
    expect(view.soldiers.find((s) => s.id === rockets[0]!.id)!.roleId).toBe('tank');
  });
});

describe('rocket auto-aim (PHASE12-d)', () => {
  it('leads a moving target so the projectile meets it', () => {
    // Target 300 to the east moving north 2/tick; projectile 10/tick: it meets it ~30 ticks on.
    const p = leadPoint({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: -2 }, 10);
    const t = Math.hypot(p.x, p.y) / 10;
    expect(p.y).toBeCloseTo(-2 * t, 1);
    expect(leadPoint({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 0 }, 10)).toEqual({
      x: 300,
      y: 0,
    });
  });

  it('holds an explosive when one of ours would be in the blast; per-role off passes through', () => {
    const w = createWorld(arena(), { ...T, ai: { ...T.ai, enabled: false } });
    spawnSoldier(w, 'a', { position: { x: 100, y: 500 }, roleId: 'bazooka' });
    spawnSoldier(w, 'a', { position: { x: 400, y: 500 }, roleId: 'tank', team: 'enemy' });
    const buddy = spawnSoldier(w, 'a', { position: { x: 420, y: 540 } });
    const base: InputSource = {
      read: () => ({ move: { x: 0, y: 0 }, aim: 2, fire: false, interact: false }),
      pointerWorld: () => null,
      destroy: () => {},
    };
    const a = new AutoAimInput(base, {
      map: arena(),
      tuning: T,
      liveId: 'S1',
      fireMode: () => 'auto',
    });
    a.observe(getView(w));
    expect(a.read({ x: 100, y: 500 }).fire).toBe(false); // the buddy is next to the tank
    w.state.soldiers.find((s) => s.id === buddy)!.x = 100; // the buddy moves well away from the target
    w.state.soldiers.find((s) => s.id === buddy)!.y = 300;
    a.observe(getView(w));
    expect(a.read({ x: 100, y: 500 }).fire).toBe(true);
    expect(friendlyInBlast(getView(w), { x: 100, y: 300 }, 30)).toBe(true);
    const off = new AutoAimInput(base, {
      map: arena(),
      tuning: T,
      liveId: 'S1',
      fireMode: () => 'auto',
      enabledFor: (r) => r !== 'bazooka',
    });
    off.observe(getView(w));
    expect(off.read({ x: 100, y: 500 }).aim).toBe(2);
  });
});
