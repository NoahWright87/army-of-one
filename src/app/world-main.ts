/**
 * (PHASE13-c) `?scene=world`: the world map generator viewer. No Phaser. `&seed=N` picks the
 * world; Regenerate rolls a new seed (kept in the URL so a reload shows the same world).
 * Playtest opens `?mission=world-<seed>-<level>-<budget>` in the real game.
 */
import { str } from '../content/strings';
import { worldMissionId } from '../gen/mission-id';
import { generateWorld, worldLevelMap, type GeneratedWorld } from '../gen/world';
import { clearMission } from '../persistence/mission-store';
import { openConnectionGraph } from '../ui/worldmap/connection-graph';
import { WorldView } from '../ui/worldmap/world-view';
import { blockPool } from './editor-storage';
import { openBestStore } from './storage/indexeddb-store';

export function startWorldViewer(host: HTMLElement, params: URLSearchParams): void {
  document.title = str('world.title');
  const MINE_KEY = 'army-of-one.world.includeMine';
  let includeMine = false;
  try {
    includeMine = window.localStorage.getItem(MINE_KEY) === 'true';
  } catch {
    // default
  }
  let world: GeneratedWorld | null = null;

  const view = new WorldView(host, {
    generate: (seed) => show(seed ?? Math.floor(Math.random() * 1e9)),
    levelMap: (index, budget) =>
      worldLevelMap(world!, index, {
        id: worldMissionId(world!.seed, index, budget),
        nameKey: 'map.world.name',
        budget,
      }),
    playtest: (index, budget) => {
      const id = worldMissionId(world!.seed, index, budget);
      // A fresh playtest each time (an old save of this exact level and budget is dropped).
      void openBestStore()
        .then((store) => clearMission(store, id))
        .catch(() => undefined)
        .then(() => go({ mission: id, from: 'world', ...(includeMine ? { pool: 'mine' } : {}) }));
    },
    exit: () => go({}),
    openBlock: (id) => go({ scene: 'editor', open: id }),
    includeMine: () => includeMine,
    openGraph: () =>
      openConnectionGraph(blockPool(includeMine), {
        openBlock: (id) => go({ scene: 'editor', open: id }),
      }),
    setIncludeMine: (on) => {
      includeMine = on;
      try {
        window.localStorage.setItem(MINE_KEY, String(on));
      } catch {
        // per-viewer convenience
      }
      show(world!.seed);
    },
  });

  function show(seed: number): void {
    const t0 = performance.now();
    world = generateWorld(blockPool(includeMine), { seed });
    const ms = performance.now() - t0;
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    window.history.replaceState(null, '', url.toString());
    view.show(world, ms);
  }

  function go(set: Record<string, string>): void {
    const url = new URL(window.location.href);
    for (const k of ['scene', 'mission', 'seed', 'from', 'pool', 'open']) {
      url.searchParams.delete(k);
    }
    for (const [k, v] of Object.entries(set)) url.searchParams.set(k, v);
    url.hash = '';
    window.location.assign(url.toString());
  }

  const seedParam = Number(params.get('seed'));
  show(
    Number.isFinite(seedParam) && params.get('seed') ? seedParam : Math.floor(Math.random() * 1e9),
  );
  (window as unknown as { __aoo?: unknown }).__aoo = {
    view,
    get world() {
      return world;
    },
  };
}
