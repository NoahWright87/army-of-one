/**
 * Soldiers' chatter ("barks"): watches the sim's events and decides who says what. Pure (no
 * Phaser); randomness is injected. Barks are NOT recorded: echoes react to what happens in this
 * run, so a replayed fight can sound different (and an echo may mourn someone else).
 *
 * The noise budget keeps words out of the player's way:
 * - In a fight (shots or blasts near the player lately), only a couple of lines at once.
 *   Warnings ("INCOMING!") always get through; flavour only from soldiers away from the player
 *   and from where they're aiming.
 * - When it's calm (no fighting near the player), many lines at once: cheering after the last
 *   enemy falls can be a chorus.
 */
import type { BarkTuning } from '../../content/world-text';
import { stringsWithPrefix } from '../../content/strings';
import type { SoldierView, WorldView } from '../../sim/view';

export type BarkCategory =
  | 'grenadeWarn'
  | 'fragOut'
  | 'allyDown'
  | 'kill'
  | 'lastKill'
  | 'cheer'
  | 'pinned'
  | 'hurt'
  | 'save'
  | 'spawn'
  | 'echoSpawn'
  | 'ghostShot'
  | 'corpseShot'
  // (PHASE21) What the AI is thinking, out loud ([D161]).
  | 'whoa'
  | 'uneasy'
  | 'contact'
  | 'alarm'
  | 'standDown';

interface CategoryRule {
  /** A warning: always allowed (within the on-screen limit), wherever the speaker is. */
  info?: boolean;
  /** Only when it's calm. */
  calmOnly?: boolean;
  /** Chance it's said at all (else `flavourChance`; info lines are always said). */
  chance?: number;
  /** Overrides the category cooldown (ms). */
  cooldownMs?: number;
  /** Said even if this soldier spoke a moment ago (the end of a fight). */
  anySpeaker?: boolean;
}

export const CATEGORY_RULES: Record<BarkCategory, CategoryRule> = {
  grenadeWarn: { info: true, cooldownMs: 800 },
  fragOut: { chance: 0.5 },
  allyDown: { chance: 0.8 },
  kill: { chance: 0.35 },
  lastKill: { info: true, cooldownMs: 0, anySpeaker: true },
  cheer: { chance: 1, cooldownMs: 0, anySpeaker: true },
  pinned: { chance: 0.9 },
  hurt: { chance: 0.6 },
  save: { info: true },
  spawn: { calmOnly: true, chance: 0.5 },
  echoSpawn: { calmOnly: true, chance: 0.2 },
  ghostShot: { chance: 0.25, cooldownMs: 8000 },
  corpseShot: { chance: 0.5, cooldownMs: 8000 },
  // (PHASE21) Showing what a soldier notices must get through, even mid-fight, but not as a wall.
  whoa: { info: true, cooldownMs: 600 },
  uneasy: { info: true, cooldownMs: 1200 },
  contact: { info: true, cooldownMs: 350 },
  alarm: { info: true, cooldownMs: 1500 },
  standDown: { chance: 0.7, cooldownMs: 4000 },
};

export interface BarkRequest {
  speakerId: string;
  category: BarkCategory;
  /** Markup template with `{var}` slots (filled by the caller with names). */
  template: string;
  /** Who the line is about (the fallen, the saved), for `{their…}` variables. */
  aboutId?: string;
}

export interface BarkFrame {
  nowMs: number;
  view: WorldView;
  /** The player's soldier, if any (null in the arena). */
  liveId: string | null;
  /** Where the player is aiming (world units). */
  aim: { x: number; y: number } | null;
  /** Lines on screen now, and whether a soldier is mid-line. */
  activeLines: number;
  isSpeaking(id: string): boolean;
}

type Team = 'player' | 'enemy';
const teamOf = (s: SoldierView): Team => (s.role === 'enemy' ? 'enemy' : 'player');
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Templates per category (strings.ts `bark.<category>.<n>`). */
export const defaultLines = (c: BarkCategory): string[] => stringsWithPrefix(`bark.${c}.`);

export class BarkDirector {
  private readonly lastSpoke = new Map<string, number>();
  private readonly lastCategory = new Map<BarkCategory, number>();
  private readonly lastLine = new Map<BarkCategory, number>();
  /** Recent hits / near misses per soldier (ms), for "pinned". */
  private readonly pressure = new Map<string, number[]>();
  /** Who last hurt each soldier, and when (for "I got you"). */
  private readonly hurtBy = new Map<string, { by: string; atMs: number }>();
  /** Recent fighting (ms + where) for hot / calm. */
  private readonly fighting: { atMs: number; x: number; y: number }[] = [];
  private readonly queued: { dueMs: number; req: BarkRequest }[] = [];
  /** (PHASE21) Each soldier's alert level at the last step, to speak when it changes. */
  private readonly alerts = new Map<string, number>();

  constructor(
    public tuning: BarkTuning,
    private readonly rand: () => number = Math.random,
    private readonly lines: (c: BarkCategory) => readonly string[] = defaultLines,
  ) {}

  /** Is it a fight near the player (or anywhere, without one)? */
  isHot(f: BarkFrame): boolean {
    const t = this.tuning;
    const live = f.liveId ? f.view.soldiers.find((s) => s.id === f.liveId && s.alive) : undefined;
    return this.fighting.some(
      (e) =>
        f.nowMs - e.atMs <= t.hotMs && (!live || dist(e.x, e.y, live.x, live.y) <= t.hotRadius),
    );
  }

  /** Call once per sim step. Returns the lines to say now. */
  step(f: BarkFrame): BarkRequest[] {
    if (!this.tuning.enabled) return [];
    const now = f.nowMs;
    const soldiers = new Map(f.view.soldiers.map((s) => [s.id, s] as const));
    const wants: BarkRequest[] = [];
    const want = (category: BarkCategory, speakerId: string, aboutId?: string) => {
      const template = this.pick(category);
      if (template) wants.push({ speakerId, category, template, ...(aboutId ? { aboutId } : {}) });
    };
    const nearestOf = (
      x: number,
      y: number,
      ok: (s: SoldierView) => boolean,
      radius: number,
    ): SoldierView | undefined => {
      let best: SoldierView | undefined;
      let bd = radius;
      for (const s of f.view.soldiers) {
        if (!s.alive || !ok(s)) continue;
        const d = dist(s.x, s.y, x, y);
        if (d <= bd) {
          bd = d;
          best = s;
        }
      }
      return best;
    };
    const t = this.tuning;

    for (const e of f.view.events) {
      switch (e.kind) {
        case 'shotFired': {
          this.fighting.push({ atMs: now, x: e.fromX, y: e.fromY });
          const shooter = soldiers.get(e.by);
          if (shooter?.role === 'echo' && !e.hitId) this.echoShot(shooter, e, f, want);
          break;
        }
        case 'grenadeExploded':
        case 'rocketExploded':
        case 'mineDetonated':
          this.fighting.push({ atMs: now, x: e.x, y: e.y });
          break;
        case 'grenadeThrown': {
          const thrower = soldiers.get(e.by);
          if (!thrower) break;
          want('fragOut', thrower.id);
          const lx = e.fromX + Math.cos(e.angle) * e.distance;
          const ly = e.fromY + Math.sin(e.angle) * e.distance;
          const victim = nearestOf(
            lx,
            ly,
            (s) => teamOf(s) !== teamOf(thrower),
            t.grenadeWarnRadius,
          );
          if (victim) want('grenadeWarn', victim.id);
          break;
        }
        case 'nearMiss':
          // Caught off guard: a bullet past someone who wasn't worked up yet.
          if (!this.alerts.get(e.target)) want('whoa', e.target);
          this.addPressure(e.target, now, f, want);
          break;
        case 'damaged': {
          const target = soldiers.get(e.target);
          if (e.by) this.hurtBy.set(e.target, { by: e.by, atMs: now });
          if (target) this.fighting.push({ atMs: now, x: target.x, y: target.y });
          this.addPressure(e.target, now, f, want);
          if (target?.alive && target.maxHp > 0) {
            const after = target.hp / target.maxHp;
            const before = (target.hp + e.amount) / target.maxHp;
            if (after < 0.3 && before >= 0.3) want('hurt', target.id);
          }
          break;
        }
        case 'soldierDied': {
          const victim = soldiers.get(e.id);
          if (!victim) break;
          const vt = teamOf(victim);
          const mourner = nearestOf(
            victim.x,
            victim.y,
            (s) => teamOf(s) === vt && s.id !== victim.id && s.id !== f.liveId,
            t.hearRadius,
          );
          if (mourner) want('allyDown', mourner.id, victim.id);
          const killer = e.by ? soldiers.get(e.by) : undefined;
          if (!killer || !killer.alive || teamOf(killer) === vt) break;
          const left = f.view.soldiers.some((s) => s.alive && teamOf(s) === vt);
          if (!left) {
            // It's over: calm from here on, so the winners can celebrate.
            this.fighting.length = 0;
            want('lastKill', killer.id);
            this.cheer(killer, f, now);
            break;
          }
          // Did that kill save a friend who was just being shot by the victim?
          const saved = f.view.soldiers.find(
            (s) =>
              s.alive &&
              s.id !== killer.id &&
              teamOf(s) === teamOf(killer) &&
              this.hurtBy.get(s.id)?.by === victim.id &&
              now - this.hurtBy.get(s.id)!.atMs < 3000,
          );
          if (saved) want('save', killer.id, saved.id);
          else want('kill', killer.id);
          break;
        }
        case 'soldierSpawned': {
          const s = soldiers.get(e.id);
          if (!s) break;
          if (s.id === f.liveId) want('spawn', s.id);
          else if (s.role === 'echo') want('echoSpawn', s.id);
          break;
        }
        default:
          break;
      }
    }
    this.alertChanges(f, want);
    // Forget old fighting.
    while (this.fighting.length && now - this.fighting[0]!.atMs > t.hotMs) this.fighting.shift();

    for (let i = this.queued.length - 1; i >= 0; i--) {
      if (this.queued[i]!.dueMs <= now) {
        wants.push(this.queued[i]!.req);
        this.queued.splice(i, 1);
      }
    }
    return this.gate(wants, f, soldiers);
  }

  /**
   * (PHASE21) Soldiers say what they've noticed when their alert level rises ("?", "!", an
   * alarm) and, a while after a false alarm, that it was nothing.
   */
  private alertChanges(f: BarkFrame, want: (c: BarkCategory, s: string) => void): void {
    for (const s of f.view.soldiers) {
      const before = this.alerts.get(s.id) ?? 0;
      const now = s.alive ? (s.alert ?? 0) : 0;
      if (now === before) continue;
      if (now === 0) this.alerts.delete(s.id);
      else this.alerts.set(s.id, now);
      if (now > before) {
        // Skipping a level (a firefight starts at "contact") says the stronger thing only.
        want(now === 3 ? 'alarm' : now === 2 ? 'contact' : 'uneasy', s.id);
      } else if (now === 0 && before === 1) {
        want('standDown', s.id);
      }
    }
  }

  /** Lines that pass the noise budget, in priority order (warnings first). */
  private gate(
    wants: BarkRequest[],
    f: BarkFrame,
    soldiers: ReadonlyMap<string, SoldierView>,
  ): BarkRequest[] {
    const t = this.tuning;
    const hot = this.isHot(f);
    const cap = hot ? t.maxHot : t.maxCalm;
    let active = f.activeLines;
    const live = f.liveId ? soldiers.get(f.liveId) : undefined;
    const out: BarkRequest[] = [];
    const taken = new Set<string>();
    wants.sort(
      (a, b) =>
        Number(!!CATEGORY_RULES[b.category].info) - Number(!!CATEGORY_RULES[a.category].info),
    );
    for (const w of wants) {
      const rule = CATEGORY_RULES[w.category];
      const sp = soldiers.get(w.speakerId);
      if (!sp || !sp.alive || taken.has(sp.id)) continue;
      // Warnings interrupt the speaker and get one slot over the limit.
      if (!rule.info && f.isSpeaking(sp.id)) continue;
      if (active >= cap + (rule.info ? 1 : 0)) continue;
      if (!rule.info) {
        if (rule.calmOnly && hot) continue;
        const rested = (this.lastSpoke.get(sp.id) ?? -Infinity) + t.speakerCooldownMs <= f.nowMs;
        if (!rested && !rule.anySpeaker) continue;
        const cd = rule.cooldownMs ?? t.categoryCooldownMs;
        if ((this.lastCategory.get(w.category) ?? -Infinity) + cd > f.nowMs) continue;
        if (hot && !this.peripheral(sp, live, f.aim)) continue;
        if (this.rand() >= (rule.chance ?? t.flavourChance)) continue;
      } else {
        const cd = rule.cooldownMs ?? t.categoryCooldownMs;
        if ((this.lastCategory.get(w.category) ?? -Infinity) + cd > f.nowMs) continue;
      }
      taken.add(sp.id);
      this.lastSpoke.set(sp.id, f.nowMs);
      this.lastCategory.set(w.category, f.nowMs);
      out.push(w);
      active++;
    }
    return out;
  }

  /** Far enough from the player and from where they're aiming not to get in the way. */
  private peripheral(
    s: SoldierView,
    live: SoldierView | undefined,
    aim: { x: number; y: number } | null,
  ): boolean {
    const t = this.tuning;
    if (live && s.id === live.id) return false;
    if (live && dist(s.x, s.y, live.x, live.y) < t.peripheryRadius) return false;
    if (aim && dist(s.x, s.y, aim.x, aim.y) < t.aimClearRadius) return false;
    return true;
  }

  private addPressure(
    id: string,
    now: number,
    f: BarkFrame,
    want: (c: BarkCategory, s: string) => void,
  ): void {
    const list = this.pressure.get(id) ?? [];
    list.push(now);
    while (list.length && now - list[0]! > this.tuning.pinnedMs) list.shift();
    this.pressure.set(id, list);
    if (list.length >= this.tuning.pinnedHits && id !== f.liveId) {
      want('pinned', id);
      list.length = 0;
    }
  }

  /** An echo fired at nothing: the enemy it shot at last time isn't there any more. */
  private echoShot(
    shooter: SoldierView,
    e: { fromX: number; fromY: number; angle: number; hitX: number; hitY: number },
    f: BarkFrame,
    want: (c: BarkCategory, s: string) => void,
  ): void {
    const foe = (s: SoldierView) => teamOf(s) !== teamOf(shooter);
    const living = f.view.soldiers.some((s) => {
      if (!s.alive || !foe(s)) return false;
      const d = dist(s.x, s.y, e.fromX, e.fromY);
      if (d > 600) return false;
      let da = Math.atan2(s.y - e.fromY, s.x - e.fromX) - e.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      return Math.abs(da) < 0.5;
    });
    if (living) return;
    const corpse = f.view.soldiers.some(
      (s) => !s.alive && foe(s) && dist(s.x, s.y, e.hitX, e.hitY) < 30,
    );
    want(corpse ? 'corpseShot' : 'ghostShot', shooter.id);
  }

  /** After the last enemy falls: the killer's side cheers, staggered. */
  private cheer(killer: SoldierView, f: BarkFrame, now: number): void {
    const team = teamOf(killer);
    for (const s of f.view.soldiers) {
      if (!s.alive || s.id === killer.id || teamOf(s) !== team) continue;
      const template = this.pick('cheer');
      if (!template) continue;
      this.queued.push({
        dueMs: now + 700 + this.rand() * 2200,
        req: { speakerId: s.id, category: 'cheer', template, aboutId: killer.id },
      });
    }
  }

  /** A random variant, not the same as last time when there's a choice. */
  private pick(c: BarkCategory): string | null {
    const list = this.lines(c);
    if (!list.length) return null;
    let i = Math.floor(this.rand() * list.length);
    if (list.length > 1 && i === this.lastLine.get(c)) i = (i + 1) % list.length;
    this.lastLine.set(c, i);
    return list[i]!;
  }
}
