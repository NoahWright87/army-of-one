/**
 * (PHASE18) Basic training's drill sergeant ([D155]): watches each sim step and decides what he
 * yells, which classes are unlocked, and which hint the respawn screen shows. No Phaser, no DOM:
 * storage is passed in, the overlay draws him and the coach draws the hints.
 *
 * Lines play once (progress is saved, so a hint you've satisfied never plays again), except a
 * few that may repeat after a cooldown (getting shot, nagging, shooting at him).
 */
import type { RoleId, SpawnOption } from '../contracts/mission';
import { roleDef } from '../content/roles';
import {
  BASIC_TRAINING,
  BT,
  BT_CORRIDOR_X,
  BT_R1_BAGS,
  BT_TARGETS,
  btRoomAt,
  type BtRoom,
} from '../content/maps/basic-training';
import { strDynamic, type StringKey } from '../content/strings';
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
/** Sarge asked you to come over and you haven't: he heckles again after this long. */
const HECKLE_MS = 7_000; // TUNE
const HECKLES: StringKey[] = ['bt.r1.ignore.0', 'bt.r1.ignore.1', 'bt.r1.ignore.2'];
/** (Other places Sarge waits for you.) */
const DOOR_HECKLES: StringKey[] = ['bt.r0.ignore.0', 'bt.r0.ignore.1'];
const RUN_HECKLES: StringKey[] = ['bt.r2.ignore.0', 'bt.r2.ignore.1'];
const RESPAWN_HECKLES: StringKey[] = ['bt.rs.ignore.0', 'bt.rs.ignore.1', 'bt.rs.ignore.2'];
const DEATH_LINES: StringKey[] = ['bt.death.0', 'bt.death.1', 'bt.death.2'];
/** On the respawn view he heckles after this long without you deploying. */
const RESPAWN_HECKLE_MS = 10_000; // TUNE
/**
 * Lines that cut him off mid-sentence: the moment changed (you died, the gate opened, you shot
 * at him), so what he was saying no longer matters.
 */
export const BT_URGENT: ReadonlySet<StringKey> = new Set<StringKey>([
  'bt.death.first',
  'bt.death.0',
  'bt.death.1',
  'bt.death.2',
  'bt.r2.sprint',
  'bt.r2.go',
  'bt.shotAt',
]);
/** The in-world respawn view has Sarge lead the way, so its dimming coach stays off. */
export const BT_COACH_IN_WORLD = false;

/** One thing Sarge says on the respawn view (with the values its text needs). */
export interface BtSay {
  key: StringKey;
  params?: Record<string, string>;
}
/** You're "at the sandbags" this close to them (a little more than fire-over distance). */
const AT_BAGS = 40; // TUNE

/** Where the ghost Sarge wants to be right now (null: just tag along with you). */
export interface BtGuide {
  at: { x: number; y: number };
  /** The way he faces once there (radians). */
  face: number;
}

const NORTH = -Math.PI / 2;
const startSpawn = () => BASIC_TRAINING.spawnPoints.find((x) => x.id === 'bt-start')!;

/** Per-target lessons in R1 (said once, when that target is next and you're at the sandbags). */
const TARGET_LINES: Record<string, StringKey> = {
  'bt-t1': 'bt.r1.t1',
  'bt-t2': 'bt.r1.t2',
  'bt-t3': 'bt.r1.t3',
  'bt-t4': 'bt.r1.t4',
};

export class BasicTraining {
  progress: BtProgress;
  private liveId: string | null = null;
  private room: BtRoom | null = null;
  private roomSince = 0;
  private lastLineMs = 0;
  private readonly lastSaid = new Map<string, number>();
  private nag = 0;
  /** R1: since when has Sarge been waiting for you at the sandbags (null: not waiting)? */
  private waitingSince: number | null = null;
  private heckle = 0;
  /** Waiting for you at the start door / the sprint gate (null: not waiting). */
  private doorSince: number | null = null;
  private runSince: number | null = null;
  private doorHeckle = 0;
  private runHeckle = 0;
  private deathLine = 0;
  /** The respawn view: where he's walking, what he still has to say, and when he last spoke. */
  private rs: {
    spot: { x: number; y: number };
    pending: BtSay[];
    lastMs: number | null;
    heckle: number;
  } | null = null;

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
      if (me.roleId === 'sniper') out.push(...this.once(['bt.r7.sniper']));
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
    if (me?.alive && this.room === 'r1' && this.progress.said.includes('bt.r1.enter')) {
      out.push(...this.bags(view, me, nowMs));
    }
    if (me?.alive) out.push(...this.plans(view, me, nowMs));
    for (const e of view.events) {
      switch (e.kind) {
        case 'objectiveDestroyed':
          if (BT_TARGETS.every((id) => view.objectives.find((o) => o.id === id)?.destroyed)) {
            out.push(...this.once(['bt.r1.done']));
          }
          break;
        case 'captureStageChanged':
          if (e.stage !== 'ours') break;
          if (e.id === 'bt-a') out.push(...this.once(['bt.r2.done']));
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
          else if (rangeCleared(view)) out.push(...this.once(['bt.r7.clear']));
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
      this.room !== 'r1' &&
      this.room !== 'r0' &&
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

  /**
   * Where Sarge should be right now (null: tag along). Worked out afresh every frame from what the
   * player is doing, so he reacts to the moment: he gets to the next thing before you do and waits
   * there. ([`step`] says the lines that go with it.)
   */
  guide(view: WorldView): BtGuide | null {
    const me = view.soldiers.find((s) => s.id === this.liveId);
    if (!me?.alive) return null;
    const room = btRoomAt(me.x, me.y);
    if (room === 'r0') return { at: { x: 600, y: BT.r0 + 40 }, face: NORTH };
    if (room === 'r1') {
      const next = this.nextTarget(view);
      if (!next) return null;
      return {
        at: { x: BT_R1_BAGS.x - 30, y: Math.max(BT_R1_BAGS.y + 40, next.y) },
        face: 0,
      };
    }
    if (room === 'r2') {
      if (!this.progress.said.includes('bt.r2.done'))
        return { at: { x: 930, y: 3030 }, face: Math.PI };
      // Flag taken: he's at the gate before it opens, then runs ahead of you through it.
      if (!this.gateOpen(view, 'bt-g2')) return { at: { x: 860, y: BT.r2 + 50 }, face: NORTH };
      return { at: { x: 860, y: BT.r2 - 120 }, face: NORTH };
    }
    if (room === 'r3' && !this.progress.minesDone) return { at: { x: 860, y: 2090 }, face: NORTH };
    return null;
  }

  private gateOpen(view: WorldView, id: string): boolean {
    return view.gates.find((g) => g.id === id)?.open ?? false;
  }

  /** The start door and the sprint gate: he waits, then heckles if you don't come. */
  private plans(view: WorldView, me: SoldierView, nowMs: number): StringKey[] {
    const room = btRoomAt(me.x, me.y);
    if (room === 'r0') {
      this.doorSince ??= nowMs;
      if (nowMs - this.doorSince > HECKLE_MS * 1.5) {
        this.doorSince = nowMs;
        return [DOOR_HECKLES[this.doorHeckle++ % DOOR_HECKLES.length]!];
      }
    } else this.doorSince = null;
    if (room === 'r2' && this.progress.said.includes('bt.r2.done')) {
      if (this.gateOpen(view, 'bt-g2')) {
        const first = this.once(['bt.r2.go']);
        if (first.length) this.runSince = nowMs;
        this.runSince ??= nowMs;
        if (!first.length && nowMs - this.runSince > HECKLE_MS) {
          this.runSince = nowMs;
          return [RUN_HECKLES[this.runHeckle++ % RUN_HECKLES.length]!];
        }
        return first;
      }
      return this.once(['bt.r2.sprint']);
    }
    this.runSince = null;
    return [];
  }

  private nextTarget(view: WorldView) {
    for (const id of BT_TARGETS) {
      const o = view.objectives.find((x) => x.id === id);
      if (o && !o.destroyed) return o;
    }
    return undefined;
  }

  /** R1's coaching: Sarge waits at the bags; heckles if you don't come; says what each cover is. */
  private bags(view: WorldView, me: SoldierView, nowMs: number): StringKey[] {
    const next = this.nextTarget(view);
    if (!next) {
      this.waitingSince = null;
      return [];
    }
    const dx = Math.max(BT_R1_BAGS.x - me.x, 0, me.x - (BT_R1_BAGS.x + BT_R1_BAGS.w));
    const dy = Math.max(BT_R1_BAGS.y - me.y, 0, me.y - (BT_R1_BAGS.y + BT_R1_BAGS.h));
    if (Math.hypot(dx, dy) <= AT_BAGS) {
      this.waitingSince = null;
      const key = TARGET_LINES[next.id];
      return [...this.once(['bt.r1.near']), ...(key ? this.once([key]) : [])];
    }
    if (!this.progress.said.includes('bt.r1.bags')) {
      this.waitingSince = nowMs;
      return this.once(['bt.r1.bags']);
    }
    this.waitingSince ??= nowMs;
    if (nowMs - this.waitingSince > HECKLE_MS) {
      this.waitingSince = nowMs;
      return [HECKLES[this.heckle++ % HECKLES.length]!];
    }
    return [];
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
    // The newest class first: it's the one for the room you're stuck in (the Grenadier at the
    // parapet, not an MG lesson you skipped earlier).
    const role = [...p.unlocked].reverse().find((r) => r !== 'rifleman' && !taught(`role:${r}`));
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

  /**
   * The respawn view opens (`died`: after a death). Sarge walks to where you should deploy and
   * says what to do there; if you just sit, [`respawnSays`] heckles.
   */
  enterRespawn(hint: BtHint | null, died: boolean, nowMs: number): void {
    const pending: BtSay[] = [];
    let spot = startSpawn().position;
    if (hint?.kind === 'deploy') pending.push({ key: 'bt.rs.deploy' });
    else if (hint) {
      if (died) pending.push(...this.onceSays(['bt.rs.explain']));
      if (hint.kind === 'resume') pending.push({ key: 'bt.coach.resume' });
      if (hint.kind === 'spawn') {
        const sp = BASIC_TRAINING.spawnPoints.find((x) => x.id === hint.spawnPointId);
        if (sp) spot = sp.position;
        pending.push({
          key: hint.text,
          params: { place: strDynamic(hint.place) },
        });
        if (hint.role) {
          pending.push({
            key: 'bt.coach.role',
            params: { role: strDynamic(roleDef(hint.role).nameKey) },
          });
        }
      }
    }
    this.rs = { spot: { ...spot }, pending, lastMs: nowMs, heckle: 0 };
  }

  leaveRespawn(): void {
    this.rs = null;
    this.save();
  }

  /** Where he stands on the respawn view (null: not on it). */
  respawnGuide(): BtGuide | null {
    return this.rs ? { at: { x: this.rs.spot.x - 50, y: this.rs.spot.y - 40 }, face: 0 } : null;
  }

  /** What he says on the respawn view right now (the first call gives the opening lines). */
  respawnSays(nowMs: number): BtSay[] {
    const rs = this.rs;
    if (!rs) return [];
    if (rs.pending.length) {
      const out = rs.pending;
      rs.pending = [];
      rs.lastMs = nowMs;
      return out;
    }
    if (rs.lastMs !== null && nowMs - rs.lastMs > RESPAWN_HECKLE_MS) {
      rs.lastMs = nowMs;
      return [{ key: RESPAWN_HECKLES[rs.heckle++ % RESPAWN_HECKLES.length]! }];
    }
    return [];
  }

  private onceSays(keys: StringKey[]): BtSay[] {
    return this.once(keys).map((key) => ({ key }));
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
    // He laughs first (the first time he explains what dying is for once you're on the
    // respawn view), then says what went wrong.
    const laugh: StringKey[] =
      p.deaths === 1 ? ['bt.death.first'] : this.again(DEATH_LINES[this.deathLine++ % 3]!, nowMs);
    if (r === 'r5') this.unlock('gunner');
    if (r === 'r6') this.unlock('grenadier');
    if (r === 'r7') this.unlock('sniper');
    if (r === 'r3' && !p.minesDone) {
      return [...laugh, ...this.again(cause === 'mine' ? 'bt.r3.mine' : 'bt.r3.shot', nowMs)];
    }
    if (r === 'r4' && me && me.x > BT_CORRIDOR_X) {
      return [...laugh, ...this.once(['bt.r4.surprise'])];
    }
    return laugh;
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

/** The far guns in R7 (east of its fence) are all down. */
function rangeCleared(view: WorldView): boolean {
  const far = view.soldiers.filter((s) => s.role === 'enemy' && s.x > 1250 && s.y < 400);
  return far.length > 0 && far.every((s) => !s.alive);
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
