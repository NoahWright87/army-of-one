/**
 * (PHASE18) Basic training's drill sergeant ([D155], [D160]): watches each sim step and decides
 * what he says (by running his script, `src/content/sarge-script.ts`, through `sarge-engine.ts`),
 * where he stands, which classes are unlocked, and which hint the respawn view shows. The game's
 * own rules stay here in code (unlocks, what counts as a death); the words and when he says them
 * are the script's. No Phaser, no DOM: storage is passed in.
 */
import type { RoleId, SpawnOption } from '../contracts/mission';
import { roleDef } from '../content/roles';
import {
  BASIC_TRAINING,
  BT_CORRIDOR_X,
  BT_BAGS,
  BT_TARGETS_A,
  BT_TARGETS_B,
  BT_ROOM_RECTS,
  BT_TARGETS,
  btRoomAt,
  type BtRoom,
} from '../content/maps/basic-training';
import { DEFAULT_SARGE_SCRIPT, type SargeScript } from '../content/sarge-script';
import { str, strDynamic, type StringKey } from '../content/strings';
import type { SoldierView, WorldView } from '../sim/view';
import type { Rect } from '../sim/world/map';
import { SargeRunner, type SargeCtx } from './sarge-engine';
import type { TextStorage } from './replay-library';

const KEY = 'aoo:bt:v3';
export const BT_DONE_KEY = 'aoo:bt:done';
/** The first visit was sent to basic training (from then on `/` is the HQ). */
export const BT_SENT_KEY = 'aoo:bt:sent';
/**
 * (sessionStorage) Basic training is in progress in this tab: a reload carries on where you were.
 * Leaving for the HQ (or closing the tab) ends it; the next time it loads it starts over.
 */
export const BT_ACTIVE_KEY = 'aoo:bt:active';

export interface BtProgress {
  /** Rules that have run (the once-only ones). */
  said: string[];
  /** The script's own flags that are set. */
  flags: string[];
  /** Things that have happened ("captured:bt-a", "minesShot", …): the script's `had:` tokens. */
  had: string[];
  /** Classes unlocked so far (the Rifleman always is). */
  unlocked: RoleId[];
  /** Respawn-screen hints already followed. */
  taught: string[];
  lives: number;
  deaths: number;
  /** Deaths by room. */
  deathsIn: Partial<Record<BtRoom, number>>;
}

const fresh = (): BtProgress => ({
  said: [],
  flags: [],
  had: [],
  unlocked: ['rifleman'],
  taught: [],
  lives: 0,
  deaths: 0,
  deathsIn: {},
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

/** The in-world respawn view has Sarge lead the way, so its dimming coach stays off. */
export const BT_COACH_IN_WORLD = false;

/** One thing Sarge says. `urgent`: it cuts him off. */
export interface BtSay {
  /** The beat's id. */
  id: string;
  text: string;
  urgent?: boolean;
}

/** Where the ghost Sarge wants to be right now (null: no opinion: near you). */
export interface BtGuide {
  /** A place on the map… */
  at?: { x: number; y: number };
  /** …or near you (an offset from where you are). */
  player?: { dx: number; dy: number };
  /** The way he faces once there (radians); null: toward you. */
  face: number | null;
}

const startSpawn = () => BASIC_TRAINING.spawnPoints.find((x) => x.id === 'bt-start')!;
const fill = (text: string, params: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m);

export class BasicTraining {
  progress: BtProgress;
  script: SargeScript;
  private readonly runner: SargeRunner;
  private liveId: string | null = null;
  private room: BtRoom | null = null;
  private roomSince = 0;
  private lastLineMs = 0;
  /** The latest time the director has seen (for flag timers). */
  private nowMs = 0;
  private cause: string | null = null;
  /** Zones your soldier is in, and since when (ms). */
  private zones = new Map<string, number>();
  /** Shots fired in this room, hits on targets among them, and when you last fired / moved. */
  private shotsHere = 0;
  private hitsHere = 0;
  private lastFireMs = 0;
  private lastMoveMs = 0;
  private lastPos: { x: number; y: number } | null = null;
  private readonly targetHp = new Map<string, number>();
  /** When each flag was set (ms; a flag set before this page loaded counts from its first look). */
  private readonly flagSince = new Map<string, number>();
  /** The respawn view: where he's walking, and what it asks of the script. */
  private rs: {
    spot: { x: number; y: number };
    hint: BtHint | null;
    afterDeath: boolean;
    opened: boolean;
  } | null = null;
  /** Lines to say now whatever the script thinks (the editor's ▶ button). */
  private previews: BtSay[] = [];

  constructor(
    private readonly storage: TextStorage | null,
    script: SargeScript = DEFAULT_SARGE_SCRIPT,
  ) {
    this.script = script;
    this.progress = this.load();
    this.runner = new SargeRunner(script, this.progress.said, this.progress.flags, (f, on) => {
      if (on) this.flagSince.set(f, this.nowMs);
      else this.flagSince.delete(f);
    });
    this.applyRoles();
  }

  /** A new script (from the editor): takes effect at once. */
  setScript(script: SargeScript): void {
    this.script = script;
    this.runner.setScript(script);
  }

  /** Back to the start (a new run of basic training). */
  reset(): void {
    this.progress = fresh();
    this.runner.resetTimers();
    this.runner.setLists(this.progress.said, this.progress.flags);
    this.flagSince.clear();
    this.zones.clear();
    this.save();
    this.applyRoles();
  }

  /**
   * Begin partway through ([D160]'s "start here"): everything before this station has happened.
   * `had` are the edges that have fired, `roles` the classes unlocked by then.
   */
  startAt(had: string[], roles: RoleId[]): void {
    this.progress.had = [...had, 'station'];
    for (const r of roles) if (!this.progress.unlocked.includes(r)) this.progress.unlocked.push(r);
    this.applyRoles();
    this.save();
  }

  /** The overlay says he's speaking now: his silence counts from here (for `quiet:`). */
  spoke(nowMs: number): void {
    this.lastLineMs = nowMs;
  }

  /** Classes you can pick right now. */
  roles(): RoleId[] {
    return [...this.progress.unlocked];
  }

  /** Say this now (the editor's ▶): it cuts in and doesn't count as said. */
  preview(text: string): void {
    this.previews.push({ id: 'preview', text, urgent: true });
  }

  // --- The run -----------------------------------------------------------------------------

  /** A new life starts (`view` is its first). Returns lines to say. */
  startLife(liveId: string, view: WorldView, nowMs: number): BtSay[] {
    this.liveId = liveId;
    this.room = null;
    this.roomSince = nowMs;
    this.zones.clear();
    this.nowMs = nowMs;
    this.shotsHere = 0;
    this.hitsHere = 0;
    this.lastFireMs = nowMs;
    this.lastMoveMs = nowMs;
    this.lastPos = null;
    this.targetHp.clear();
    this.progress.lives++;
    // You start in whatever zones you stand in: that's an "enter" for each.
    const edges = new Set(['lifeStart']);
    const me = view.soldiers.find((x) => x.id === liveId);
    if (me) {
      for (const z of this.zonesAt(me.x, me.y)) {
        this.zones.set(z, nowMs);
        edges.add(`enter:${z}`);
      }
    }
    const out = this.say(this.ctx(view, nowMs, edges));
    this.save();
    return out;
  }

  /** One sim step. `sarge`: where he stands (for shots at him). Returns lines to say. */
  step(view: WorldView, nowMs: number, sarge: { x: number; y: number }): BtSay[] {
    const edges = new Set<string>();
    this.nowMs = nowMs;
    const me = view.soldiers.find((s) => s.id === this.liveId);
    if (me?.alive) {
      const r = btRoomAt(me.x, me.y);
      if (r !== this.room) {
        this.room = r;
        this.roomSince = nowMs;
        this.shotsHere = 0;
        this.hitsHere = 0;
        this.lastFireMs = nowMs;
      }
      if (!this.lastPos || Math.hypot(me.x - this.lastPos.x, me.y - this.lastPos.y) > 6) {
        this.lastPos = { x: me.x, y: me.y };
        this.lastMoveMs = nowMs;
      }
      // Zones (the room, and the script's own rectangles): who came in, who went out.
      const now = this.zonesAt(me.x, me.y);
      for (const z of now) {
        if (!this.zones.has(z)) {
          this.zones.set(z, nowMs);
          edges.add(`enter:${z}`);
        }
      }
      for (const z of [...this.zones.keys()]) {
        if (!now.has(z)) {
          this.zones.delete(z);
          edges.add(`leave:${z}`);
        }
      }
    }
    // A target that lost hit points was hit (so a shot that hit nothing was a miss).
    for (const o of view.objectives) {
      if (!o.target) continue;
      const before = this.targetHp.get(o.id);
      if (before !== undefined && o.hp < before) this.hitsHere++;
      this.targetHp.set(o.id, o.hp);
    }
    this.cause = null;
    for (const e of view.events) {
      switch (e.kind) {
        case 'objectiveDestroyed':
          for (const [stall, ids] of [
            ['a', BT_TARGETS_A],
            ['b', BT_TARGETS_B],
          ] as const) {
            const down = (id: string) => view.objectives.find((o) => o.id === id)?.destroyed;
            if ((ids as readonly string[]).includes(e.id) && ids.every(down)) {
              edges.add(`stallDone:${stall}`);
            }
          }
          break;
        case 'captureStageChanged':
          if (e.stage !== 'ours') break;
          edges.add(`captured:${e.id}`);
          if (e.id === 'bt-b') this.unlock('shield');
          break;
        case 'mineDetonated': {
          const by = e.by ? view.soldiers.find((s) => s.id === e.by) : undefined;
          if (by && by.role !== 'enemy') edges.add('minesShot');
          break;
        }
        case 'soldierDied':
          if (e.id === this.liveId) {
            this.cause = e.cause;
            this.died(me, edges);
          } else if (mgsCleared(view)) edges.add('mgsDown');
          else if (nestCleared(view)) edges.add('nestCleared');
          else if (rangeCleared(view)) edges.add('rangeCleared');
          break;
        case 'gateChanged':
          if (e.open) edges.add(`gateOpened:${e.id}`);
          break;
        case 'shotFired':
          if (e.by === this.liveId) {
            edges.add('fired');
            this.shotsHere++;
            this.lastFireMs = nowMs;
            if (passesNear(e, sarge, 40)) edges.add('shotAtSarge');
          }
          break;
        default:
          break;
      }
    }
    const out = this.say(this.ctx(view, nowMs, edges));
    if (out.length || edges.size) this.save();
    return out;
  }

  /**
   * Where Sarge should be right now (null: tag along). Worked out afresh every frame from what the
   * player is doing, so he reacts to the moment (the script's `places` say where).
   */
  guide(view: WorldView, nowMs = 0): BtGuide | null {
    const pref = this.runner.pref(this.ctx(view, nowMs, new Set()));
    if (!pref) return null;
    const face = pref.face === null ? null : (pref.face * Math.PI) / 180;
    const at = pref.at;
    switch (at.kind) {
      case 'point':
        return { at: { x: at.x, y: at.y }, face };
      case 'player':
        return { player: { dx: at.dx, dy: at.dy }, face };
      case 'zone': {
        const z = this.script.zones.find((x) => x.id === at.zone);
        if (z) return { at: { x: z.x + z.w / 2, y: z.y + z.h / 2 }, face };
        const room = (BT_ROOM_RECTS as Record<string, Rect | undefined>)[at.zone];
        return room ? { at: { x: room.x + room.w / 2, y: room.y + room.h / 2 }, face } : null;
      }
      case 'nextTarget': {
        const next = this.nextTarget(view);
        return next ? { at: { x: at.x, y: Math.max(BT_BAGS.y + 40, next.y) }, face } : null;
      }
    }
  }

  /** The script's zones (and the room) that contain this point. */
  private zonesAt(x: number, y: number): Set<string> {
    const out = new Set<string>([btRoomAt(x, y)]);
    for (const z of this.script.zones) {
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) out.add(z.id);
    }
    return out;
  }

  // --- The respawn view --------------------------------------------------------------------

  /**
   * The respawn view opens (`died`: after a death). Sarge walks to where you should deploy; what he
   * says there is the script's (`respawnOpen` beats).
   */
  enterRespawn(hint: BtHint | null, died: boolean, nowMs: number): void {
    let spot = startSpawn().position;
    if (hint?.kind === 'spawn') {
      const sp = BASIC_TRAINING.spawnPoints.find((x) => x.id === hint.spawnPointId);
      if (sp) spot = sp.position;
    }
    this.rs = { spot: { ...spot }, hint, afterDeath: died, opened: false };
    this.lastLineMs = nowMs;
    this.runner.resetTimers();
  }

  leaveRespawn(): void {
    this.rs = null;
    this.save();
  }

  /** Where he stands on the respawn view (null: not on it). */
  respawnGuide(): BtGuide | null {
    return this.rs ? { at: { x: this.rs.spot.x - 50, y: this.rs.spot.y - 40 }, face: 0 } : null;
  }

  /** What he says on the respawn view right now (the first call after it opens gives the opening lines). */
  respawnSays(nowMs: number): BtSay[] {
    const rs = this.rs;
    if (!rs) return this.takePreviews();
    const edges = new Set<string>();
    if (!rs.opened) {
      rs.opened = true;
      edges.add('respawnOpen');
    }
    const out = this.say(this.ctx(null, nowMs, edges));
    return out;
  }

  // --- The context the script is judged against -------------------------------------------

  private ctx(view: WorldView | null, nowMs: number, edges: ReadonlySet<string>): SargeCtx {
    const p = this.progress;
    const me = view?.soldiers.find((s) => s.id === this.liveId);
    const room = me ? btRoomAt(me.x, me.y) : null;
    const had = new Set([...p.had, ...p.said]);
    const hint = this.rs?.hint ?? null;
    return {
      nowMs,
      edges,
      ...(me
        ? {
            me: {
              x: me.x,
              y: me.y,
              hp: me.hp,
              maxHp: me.maxHp,
              alive: me.alive,
              ...(me.roleId ? { roleId: me.roleId } : {}),
            },
          }
        : {}),
      room,
      inRoomS: Math.max(0, (nowMs - this.roomSince) / 1000),
      quietS: Math.max(0, (nowMs - this.lastLineMs) / 1000),
      had,
      lives: p.lives,
      deaths: p.deaths,
      deathsIn: p.deathsIn,
      taught: p.taught,
      cause: edges.has('died') || [...edges].some((e) => e.startsWith('died:')) ? this.cause : null,
      zonesIn: new Set(this.zones.keys()),
      zoneSinceS: (z) => {
        const t = this.zones.get(z);
        return t === undefined ? null : (nowMs - t) / 1000;
      },
      flags: new Set(p.flags),
      flagSinceS: (f) => {
        if (!p.flags.includes(f)) return null;
        let t = this.flagSince.get(f);
        if (t === undefined) {
          t = nowMs;
          this.flagSince.set(f, t);
        }
        return (nowMs - t) / 1000;
      },
      gateOpen: (id) => view?.gates.find((g) => g.id === id)?.open ?? false,
      nextTarget: view ? (this.nextTarget(view)?.id ?? null) : null,
      targetsLeft: (stall) => {
        const ids = stall === 'a' ? BT_TARGETS_A : stall === 'b' ? BT_TARGETS_B : [];
        return (
          !!view &&
          (ids as readonly string[]).some(
            (id) => !view.objectives.find((o) => o.id === id)?.destroyed,
          )
        );
      },
      holdFireS: Math.max(0, (nowMs - Math.max(this.lastFireMs, this.roomSince)) / 1000),
      stillS: Math.max(0, (nowMs - this.lastMoveMs) / 1000),
      misses: Math.max(0, this.shotsHere - this.hitsHere),
      inCorridor: !!me && me.x > BT_CORRIDOR_X && btRoomAt(me.x, me.y) === 'r4',
      atSpawn: (id) => {
        const sp = BASIC_TRAINING.spawnPoints.find((x) => x.id === id);
        return !!me && !!sp && Math.hypot(me.x - sp.position.x, me.y - sp.position.y) < 80;
      },
      respawn: this.rs
        ? {
            hint: hint ? hint.kind : null,
            spawnPointId: hint?.kind === 'spawn' ? hint.spawnPointId : null,
            hasRole: hint?.kind === 'spawn' && !!hint.role,
            afterDeath: this.rs.afterDeath,
          }
        : null,
    };
  }

  private nextTarget(view: WorldView) {
    for (const id of BT_TARGETS) {
      const o = view.objectives.find((x) => x.id === id);
      if (o && !o.destroyed) return o;
    }
    return undefined;
  }

  /** Runs the script, remembers what happened, and returns what he says. */
  private say(c: SargeCtx): BtSay[] {
    const fired = this.runner.run(c);
    // What happened now counts as having happened for the next look (not this one).
    for (const e of c.edges) if (!this.progress.had.includes(e)) this.progress.had.push(e);
    const hint = this.rs?.hint;
    const params: Record<string, string> = {};
    if (hint?.kind === 'spawn') {
      params.place = strDynamic(hint.place);
      if (hint.role) params.role = str(roleDef(hint.role).nameKey);
    }
    const out: BtSay[] = [
      ...this.takePreviews(),
      ...fired.map((f) => ({
        id: f.rule.id,
        text: fill(f.text, params),
        ...(f.rule.urgent ? { urgent: true } : {}),
      })),
    ];
    if (fired.length) this.lastLineMs = c.nowMs;
    return out;
  }

  private takePreviews(): BtSay[] {
    const out = this.previews;
    this.previews = [];
    return out;
  }

  // --- The game's own rules ----------------------------------------------------------------

  /** Your soldier died: counts, and the classes a death unlocks. */
  private died(me: SoldierView | undefined, edges: Set<string>): void {
    const p = this.progress;
    p.deaths++;
    const r = me ? btRoomAt(me.x, me.y) : (this.room ?? 'r0');
    p.deathsIn[r] = (p.deathsIn[r] ?? 0) + 1;
    edges.add('died');
    edges.add(`died:${r}`);
    if (r === 'r5') this.unlock('gunner');
    if (r === 'r6') this.unlock('grenadier');
    if (r === 'r7') this.unlock('sniper');
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

/** The three machine guns of the live-fire stall (east of its concrete wall) are all down. */
function mgsCleared(view: WorldView): boolean {
  const mgs = view.soldiers.filter(
    (s) => s.role === 'enemy' && s.x > 1100 && s.y > 3380 && s.y < 4020,
  );
  return mgs.length > 0 && mgs.every((s) => !s.alive);
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
