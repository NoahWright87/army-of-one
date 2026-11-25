/**
 * (PHASE18) The HQ's world ([D153]): a real map you walk and shoot in like a battle, without the
 * timeline. Range targets get back up, you get back up (on the range, or in the lobby), the class
 * rack swaps your role on the spot, and walking out through an open gate leaves the HQ.
 *
 * No Phaser here: the battle scene drives it as a SessionDriver, tests drive it headless.
 */
import type { RoleId } from '../contracts/mission';
import {
  HUB_ARRIVAL_SPAWNS,
  HUB_EXITS,
  HUB_MAP,
  HUB_RANGE_SPAWN,
  HUB_RANGE_Y,
  HUB_TARGETS,
  type HubExitId,
} from '../content/hub';
import { withTuning, type Tuning } from '../content/tuning';
import { secondsToTicks } from '../sim/core/time';
import type { Vec2 } from '../sim/core/vec';
import {
  createWorld,
  getSoldier,
  getView,
  resetSoldier,
  setGateOpen,
  setSoldierFlags,
  spawnSoldier,
  step,
  type SoldierId,
  type SoldierInput,
  type World,
} from '../sim/sim';
import type { WorldView } from '../sim/view';
import type { PendingArrival, SessionDriver } from '../render/phaser/services';

/** Seconds before a fallen target / you get back up. */
export const HUB_TARGET_RESPAWN_S = 2; // TUNE
export const HUB_LIVE_RESPAWN_S = 1; // TUNE

export type DrillWave = 'single' | 'few' | 'many';

const DRILL_WAVE: Record<DrillWave, readonly number[]> = {
  single: [1, 1, 1, 0, 0],
  few: [2, 2, 2, 0, 0],
  many: [4, 8, 4, 4, 4],
};

/** The HQ runs without the AI (targets stand still) and without money. */
export function hubTuning(base: Tuning): Tuning {
  return withTuning(base, { ai: { enabled: false }, economy: { enabled: false } });
}

export class HubDriver implements SessionDriver {
  readonly world: World;
  readonly liveId: SoldierId;
  readonly targets: { id: SoldierId; home: Vec2 }[] = [];
  readonly willHonorInput = true;
  readonly cameraHome: Vec2;
  ended = false;
  /** Which exits are open (a choice was made at the sign). */
  private readonly open = new Set<HubExitId>();
  private pendingRole: RoleId | null = null;
  private current: WorldView;
  private readonly drill: {
    spawn: (typeof HUB_ARRIVAL_SPAWNS)[number];
    group: number;
    passenger: number;
    position: Vec2;
    active: boolean;
    id?: SoldierId;
    tick?: number;
  }[] = HUB_ARRIVAL_SPAWNS.flatMap((spawn, group) =>
    Array.from({ length: DRILL_WAVE.many[group] ?? 0 }, (_, passenger) => {
      const air = !spawn.transport;
      const column = air ? (passenger % 3) - 1 : (passenger % 2) - 0.5;
      const row = Math.floor(passenger / (air ? 3 : 2));
      return {
        spawn,
        group,
        passenger,
        active: false,
        position: {
          x: spawn.position.x + column * (air ? 65 : 46),
          y: spawn.position.y + (air ? (row - 1) * 58 : -row * 46),
        },
      };
    }),
  );

  constructor(
    base: Tuning,
    private readonly onExit: (id: HubExitId) => void,
    roleId: RoleId = 'rifleman',
  ) {
    this.world = createWorld(HUB_MAP, hubTuning(base));
    const sp = HUB_MAP.spawnPoints[0]!;
    this.cameraHome = { ...sp.position };
    this.liveId = spawnSoldier(this.world, sp.id, { roleId });
    for (const home of HUB_TARGETS) {
      const id = spawnSoldier(this.world, sp.id, {
        position: home,
        facing: -Math.PI / 2,
        team: 'enemy',
        controllable: false,
      });
      this.targets.push({ id, home });
    }
    this.current = getView(this.world);
  }

  /** Play the three entrances together, reusing the same practice enemies on repeat. */
  launchArrivals(wave: DrillWave = 'single'): void {
    const now = this.world.state.tick;
    const tick = now + this.arrivalLead();
    for (const target of this.drill) {
      target.active = target.passenger < (DRILL_WAVE[wave][target.group] ?? 0);
      if (target.active) target.tick = tick;
      else delete target.tick;
      if (target.id) setSoldierFlags(this.world, target.id, { interactive: false });
    }
    this.updateView();
  }

  arrivals(): PendingArrival[] {
    return this.drill.flatMap(({ spawn, tick, passenger, position }) =>
      tick === undefined
        ? []
        : [
            {
              id: `${spawn.id}:${passenger}`,
              spawnPointId: spawn.id,
              spawnTick: tick,
              team: 'enemy' as const,
              passenger,
              position,
            },
          ],
    );
  }

  private arrivalLead(): number {
    return secondsToTicks(this.world.tuning.spawn.leadInSeconds);
  }

  private updateView(): void {
    this.current = getView(this.world);
    this.current.soldiers = this.current.soldiers.filter(
      (s) =>
        !this.drill.some(
          (target) => target.id === s.id && (!target.active || target.tick !== undefined),
        ),
    );
  }

  /** Opens an exit's gate (the sign's choice was made). */
  openExit(id: HubExitId): void {
    const exit = HUB_EXITS.find((e) => e.id === id);
    if (!exit) return;
    this.open.add(id);
    setGateOpen(this.world, exit.gateId, true);
  }

  isOpen(id: HubExitId): boolean {
    return this.open.has(id);
  }

  /** Swaps your class at the next step (you keep your spot). */
  setRole(roleId: RoleId): void {
    this.pendingRole = roleId;
  }

  get roleId(): RoleId {
    return getSoldier(this.world, this.liveId)?.roleId ?? 'rifleman';
  }

  step(input: SoldierInput): boolean {
    if (this.ended) return false;
    const w = this.world;
    if (this.pendingRole) {
      resetSoldier(w, this.liveId, { roleId: this.pendingRole });
      this.pendingRole = null;
    }
    step(w, new Map([[this.liveId, input]]));
    const tick = w.state.tick;
    // Back on your feet: on the range if that's where you fell, else in the lobby.
    const me = getSoldier(w, this.liveId)!;
    if (!me.alive && me.deathTick !== null) {
      if (tick - me.deathTick >= secondsToTicks(HUB_LIVE_RESPAWN_S)) {
        const onRange = me.y > HUB_RANGE_Y;
        resetSoldier(w, this.liveId, {
          position: onRange ? HUB_RANGE_SPAWN : this.cameraHome,
          facing: onRange ? Math.PI / 2 : -Math.PI / 2,
        });
      }
    }
    for (const t of this.targets) {
      const s = getSoldier(w, t.id);
      if (s && !s.alive && s.deathTick !== null) {
        if (tick - s.deathTick >= secondsToTicks(HUB_TARGET_RESPAWN_S)) {
          resetSoldier(w, t.id, { position: t.home, facing: -Math.PI / 2 });
        }
      }
    }
    for (const target of this.drill) {
      if (!target.active) continue;
      const { spawn, id, position } = target;
      const soldier = id ? getSoldier(w, id) : undefined;
      if (target.tick === undefined && soldier && soldier.deathTick !== null) {
        target.tick = soldier.deathTick + secondsToTicks(HUB_TARGET_RESPAWN_S) + this.arrivalLead();
      }
      if (target.tick === undefined || tick < target.tick) continue;
      if (id) {
        resetSoldier(w, id, { position, facing: spawn.facing });
        setSoldierFlags(w, id, { interactive: true });
      } else {
        target.id = spawnSoldier(w, spawn.id, { position, team: 'enemy', controllable: false });
      }
      delete target.tick;
    }
    this.updateView();
    // Out through an open gate.
    if (me.alive) {
      for (const e of HUB_EXITS) {
        if (!this.open.has(e.id)) continue;
        const z = e.zone;
        if (me.x >= z.x && me.x <= z.x + z.w && me.y >= z.y && me.y <= z.y + z.h) {
          this.ended = true;
          this.onExit(e.id);
          break;
        }
      }
    }
    return true;
  }

  view(): WorldView {
    return this.current;
  }

  countdown(): number | null {
    return null;
  }
}
