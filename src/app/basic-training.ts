/**
 * (PHASE18) Basic training's drill sergeant ([D155]): watches each sim step and decides what he
 * yells, which classes are unlocked, and which hint the respawn screen shows. No Phaser, no DOM:
 * storage is passed in, the overlay draws him and the coach draws the hints.
 *
 * Lines play once (progress is saved, so a hint you've satisfied never plays again), except a
 * few that may repeat after a cooldown (getting shot, nagging, shooting at him).
 */
import type { RoleId, SpawnOption } from '../contracts/mission';
import {
  BASIC_TRAINING,
  BT_CORRIDOR_X,
  BT_TARGETS,
  btRoomAt,
  type BtRoom,
} from '../content/maps/basic-training';
import type { StringKey } from '../content/strings';
import type { SoldierView, WorldView } from '../sim/view';
import type { TextStorage } from './replay-library';

const KEY = 'aoo:bt:v1';
export const BT_DONE_KEY = 'aoo:bt:done';
/** The first visit was sent to basic training (from then on `/` is the HQ). */
export const BT_SENT_KEY = 'aoo:bt:sent';

export interface BtProgress {
  /** Lines said (once-only ones). */
  said: string[];
  /** Classes unlocked so far (the Rifleman always is). */
  unlocked: RoleId[];
  /** Respawn-screen hints already followed. */
  taught: string[];
  lives: number;
  deaths: number;
  /** Deaths by room. */
  deathsIn: Partial<Record<BtRoom, number>>;
  /** The mines in R3 have been shot (that station's hints are done). */
  minesDone: boolean;
}

const fresh = (): BtProgress => ({
  said: [],
  unlocked: ['rifleman'],
  taught: [],
  lives: 0,
  deaths: 0,
  deathsIn: {},
  minesDone: false,
});

/** What the respawn screen's coach points at. */
export type BtHint =
  | { kind: 'deploy'; text: StringKey }
  | { kind: 'resume'; soldierId: string; text: StringKey }
  /**
   * Back in at your newest flag (`spawnPointId`, null: the start), as the newly unlocked class
   * if there is one (`role`).
   */
  | {
      kind: 'spawn';
      spawnPointId: string | null;
      text: StringKey;
      place: string;
      role?: RoleId;
    };

/** Flags' spawn points, newest (furthest north) first. */
const FORWARD = ['bt-sp-d', 'bt-sp-c', 'bt-sp-b', 'bt-sp-a'] as const;

/** Lines said again after this long (the repeatable ones). */
const REPEAT_MS = 15_000; // TUNE
/** Same room this long with nothing said: a nag. */
const NAG_MS = 40_000; // TUNE
const NAGS: StringKey[] = ['bt.nag.0', 'bt.nag.1', 'bt.nag.2'];

export class BasicTraining {
  progress: BtProgress;
  private liveId: string | null = null;
  private room: BtRoom | null = null;
  private roomSince = 0;
  private lastLineMs = 0;
  private readonly lastSaid = new Map<string, number>();
  private nag = 0;

  constructor(private readonly storage: TextStorage | null) {
    this.progress = this.load();
    this.applyRoles();
  }

  /** Back to the start (a new run of basic training). */
  reset(): void {
    this.progress = fresh();
    this.save();
    this.applyRoles();
  }

  /** Classes you can pick right now. */
  roles(): RoleId[] {
    return [...this.progress.unlocked];
  }

  /** A new life starts (`view` is its first). Returns lines to say. */
  startLife(liveId: string, view: WorldView, nowMs: number): StringKey[] {
    this.liveId = liveId;
    this.room = null;
    this.roomSince = nowMs;
    const p = this.progress;
    p.lives++;
    const out: StringKey[] = [];
    const me = view.soldiers.find((s) => s.id === liveId);
    if (p.lives === 1) {
      out.push(...this.once(['bt.intro.0', 'bt.intro.1', 'bt.intro.2', 'bt.intro.3']));
    } else if (me) {
      const at = (id: string) => {
        const sp = BASIC_TRAINING.spawnPoints.find((x) => x.id === id)!;
        return Math.hypot(me.x - sp.position.x, me.y - sp.position.y) < 80;
      };
      if (at('bt-start') && p.said.includes('bt.r2.done'))
        out.push(...this.again('bt.scenic', nowMs));
      if (at('bt-sp-a') && !p.minesDone && (p.deathsIn.r3 ?? 0) > 0) {
        out.push(...this.once(['bt.r3.back', 'bt.r3.minesHint']));
      }
      if (me.roleId === 'shield') out.push(...this.once(['bt.r4.shield']));
      if (me.roleId === 'gunner') out.push(...this.once(['bt.r5.mg']));
      if (me.roleId === 'grenadier') out.push(...this.once(['bt.r6.nade']));
    }
    this.save();
    return out;
  }

  /** One sim step. `sarge`: where he stands (for shots at him). Returns lines to say. */
  step(view: WorldView, nowMs: number, sarge: { x: number; y: number }): StringKey[] {
    const p = this.progress;
    const out: StringKey[] = [];
    const me = view.soldiers.find((s) => s.id === this.liveId);
    if (me?.alive) {
      const r = btRoomAt(me.x, me.y);
      if (r !== this.room) {
        this.room = r;
        this.roomSince = nowMs;
        out.push(...this.enter(r));
      }
    }
    for (const e of view.events) {
      switch (e.kind) {
        case 'objectiveDestroyed':
          if (BT_TARGETS.every((id) => view.objectives.find((o) => o.id === id)?.destroyed)) {
            out.push(...this.once(['bt.r1.done']));
          }
          break;
        case 'captureStageChanged':
          if (e.stage !== 'ours') break;
          if (e.id === 'bt-a') out.push(...this.once(['bt.r2.done', 'bt.r2.gate']));
          if (e.id === 'bt-b') {
            this.unlock('shield');
            out.push(...this.once(['bt.r4.done']));
          }
          break;
        case 'mineDetonated': {
          const by = e.by ? view.soldiers.find((s) => s.id === e.by) : undefined;
          if (!by || by.role === 'enemy' || p.minesDone) break;
          p.minesDone = true;
          out.push(...this.once([p.deaths === 0 ? 'bt.r3.minesEarly' : 'bt.r3.minesDone']));
          break;
        }
        case 'soldierDied':
          if (e.id === this.liveId) out.push(...this.died(me, e.cause, nowMs));
          else if (nestCleared(view)) out.push(...this.once(['bt.r4.cleared']));
          break;
        case 'gateChanged':
          if (!e.open) break;
          if (e.id === 'bt-g5') out.push(...this.once(['bt.r4.open']));
          if (e.id === 'bt-g6') {
            out.push(...this.once(['bt.r5.done']));
            if (me && me.hp < me.maxHp) out.push(...this.once(['bt.r5.walk']));
          }
          if (e.id === 'bt-g8') out.push(...this.once(['bt.r6.done']));
          break;
        case 'shotFired':
          if (e.by === this.liveId && passesNear(e, sarge, 40)) {
            out.push(...this.again('bt.shotAt', nowMs));
          }
          break;
        default:
          break;
      }
    }
    // Dawdling.
    if (
      me?.alive &&
      this.room !== 'r7' &&
      nowMs - this.roomSince > NAG_MS &&
      nowMs - this.lastLineMs > NAG_MS
    ) {
      out.push(...this.again(NAGS[this.nag++ % NAGS.length]!, nowMs));
    }
    if (out.length) {
      this.lastLineMs = nowMs;
      this.save();
    }
    return out;
  }

  /** The hint the respawn screen should show now (null: none). */
  respawnHint(options: readonly SpawnOption[]): BtHint | null {
    const p = this.progress;
    const taught = (k: string) => p.taught.includes(k);
    if (p.lives === 0) return { kind: 'deploy', text: 'bt.coach.deploy' };
    const resume = options.find((o) => o.kind === 'resume');
    if (resume && resume.kind === 'resume' && !taught('resume')) {
      return { kind: 'resume', soldierId: resume.soldierId, text: 'bt.coach.resume' };
    }
    const role = p.unlocked.find((r) => r !== 'rifleman' && !taught(`role:${r}`));
    const sp =
      FORWARD.find((id) => options.some((o) => o.kind === 'new' && o.spawnPointId === id)) ?? null;
    const def = sp ? BASIC_TRAINING.spawnPoints.find((x) => x.id === sp) : undefined;
    return {
      kind: 'spawn',
      spawnPointId: sp,
      text: sp === 'bt-sp-a' && !taught('spawnA') ? 'bt.coach.spawnA' : 'bt.coach.spawn',
      place: def?.nameKey ?? '',
      ...(role ? { role } : {}),
    };
  }

  /** The player deployed with this hint showing: it's been taught. */
  followed(h: BtHint): void {
    const keys: string[] = [];
    if (h.kind === 'resume') keys.push('resume');
    if (h.kind === 'spawn') {
      if (h.role) keys.push(`role:${h.role}`);
      if (h.spawnPointId === 'bt-sp-a') keys.push('spawnA');
    }
    for (const k of keys) if (!this.progress.taught.includes(k)) this.progress.taught.push(k);
    this.save();
  }

  private enter(r: BtRoom): StringKey[] {
    switch (r) {
      case 'r1':
        return this.once(['bt.r1.enter']);
      case 'r2':
        return this.once(['bt.r2.enter']);
      case 'r3':
        return this.progress.minesDone ? [] : this.once(['bt.r3.enter']);
      case 'r4':
        return this.once(['bt.r4.enter']);
      case 'r5f':
        return this.once(['bt.flag.c']);
      case 'r5':
        return this.once(['bt.r5.enter']);
      case 'r6f':
        return this.once(['bt.flag.d']);
      case 'r6':
        return this.once(['bt.r6.enter']);
      case 'r7':
        return this.once(['bt.r7.enter']);
      default:
        return [];
    }
  }

  private died(me: SoldierView | undefined, cause: string, nowMs: number): StringKey[] {
    const p = this.progress;
    p.deaths++;
    const r = me ? btRoomAt(me.x, me.y) : (this.room ?? 'r0');
    p.deathsIn[r] = (p.deathsIn[r] ?? 0) + 1;
    if (r === 'r3' && !p.minesDone) {
      return this.again(cause === 'mine' ? 'bt.r3.mine' : 'bt.r3.shot', nowMs);
    }
    if (r === 'r4' && me && me.x > BT_CORRIDOR_X) return this.once(['bt.r4.surprise']);
    if (r === 'r5') this.unlock('gunner');
    if (r === 'r6') this.unlock('grenadier');
    return [];
  }

  private unlock(role: RoleId): void {
    if (this.progress.unlocked.includes(role)) return;
    this.progress.unlocked.push(role);
    this.applyRoles();
    this.save();
  }

  /** The mission's open classes follow your progress (the respawn screen reads them). */
  private applyRoles(): void {
    (BASIC_TRAINING as { roles?: readonly RoleId[] }).roles = this.roles();
  }

  /** The keys not said yet (and marks them said). */
  private once(keys: StringKey[]): StringKey[] {
    const out = keys.filter((k) => !this.progress.said.includes(k));
    this.progress.said.push(...out);
    return out;
  }

  /** A repeatable line, at most every REPEAT_MS. */
  private again(key: StringKey, nowMs: number): StringKey[] {
    const last = this.lastSaid.get(key);
    if (last !== undefined && nowMs - last < REPEAT_MS) return [];
    this.lastSaid.set(key, nowMs);
    return [key];
  }

  private load(): BtProgress {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return fresh();
      return { ...fresh(), ...(JSON.parse(raw) as Partial<BtProgress>) };
    } catch {
      return fresh();
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.progress));
    } catch {
      // this visit only
    }
  }
}

/** The MG nest and its shotgunner (east corridor, R3/R4) are all down. */
function nestCleared(view: WorldView): boolean {
  const nest = view.soldiers.filter(
    (s) => s.role === 'enemy' && s.x > 1006 && s.y > 2120 && s.y < 2860,
  );
  return nest.length > 0 && nest.every((s) => !s.alive);
}

/** Does a shot's line pass within `r` of `p`? */
function passesNear(
  e: { fromX: number; fromY: number; hitX: number; hitY: number },
  p: { x: number; y: number },
  r: number,
): boolean {
  const dx = e.hitX - e.fromX;
  const dy = e.hitY - e.fromY;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - e.fromX) * dx + (p.y - e.fromY) * dy) / len2));
  return Math.hypot(e.fromX + dx * t - p.x, e.fromY + dy * t - p.y) <= r;
}
