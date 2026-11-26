import { fitPx, imageAsset, type ImageKey } from '../content/assets';
import { HUB_DECOR, HUB_MAP, HUB_SIGNS, HUB_TARGETS } from '../content/hub';
import { BASIC_TRAINING, BT_SIGNS } from '../content/maps/basic-training';
import { SIGN_KINDS } from '../content/sign-styles';
import type { Vec2 } from '../sim/core/vec';
import type { MapDef, Rect } from '../sim/world/map';
import {
  SCENARIO_CELL,
  newScenarioLayout,
  scaleScenarioRect,
  type LayoutItem,
  type ScenarioLayout,
} from './scenario-layout';

export type ScenarioTemplate = 'hq' | 'basic-training';

const cs = SCENARIO_CELL;
const cells = (rect: Rect) => scaleScenarioRect(rect, 1 / cs);
const centered = (at: Vec2, w: number, h: number): Rect => ({
  x: at.x - w / 2,
  y: at.y - h / 2,
  w,
  h,
});

function prop(at: Vec2, image: ImageKey, size: number, id?: string): LayoutItem {
  const scale = size / fitPx(image);
  const { w, h } = imageAsset(image).size;
  return { kind: 'prop', id, image, rect: cells(centered(at, w * scale, h * scale)) };
}

function geometry(map: MapDef): ScenarioLayout {
  const { width, height } = map;
  const raised = map.raisedGround ?? [];
  const surface = (rect?: Rect) => {
    if (!rect) return {};
    const n = raised.findIndex(
      (r) => r.x === rect.x && r.y === rect.y && r.w === rect.w && r.h === rect.h,
    );
    return n < 0 ? {} : { firingSurface: `surface-${n}` };
  };
  const spawn = map.spawnPoints.find((sp) => sp.kind === 'initial')?.position;
  return {
    ...newScenarioLayout(),
    ground: Array.from({ length: Math.ceil(height / cs) }, () => 'G'.repeat(Math.ceil(width / cs))),
    extent: { width, height },
    spawn: spawn ? { x: spawn.x / cs - 0.5, y: spawn.y / cs - 0.5 } : null,
    items: [
      ...map.water.map((rect): LayoutItem => ({ kind: 'water', rect: cells(rect) })),
      ...(map.concealment ?? []).map(({ id, rect, kind }): LayoutItem => ({
        id,
        kind,
        rect: cells(rect),
      })),
      ...(map.groundMist ?? []).map((rect): LayoutItem => ({ kind: 'mist', rect: cells(rect) })),
      ...raised.map((rect, i): LayoutItem => ({
        kind: 'raised',
        id: `surface-${i}`,
        rect: cells(rect),
      })),
      ...map.walls.map((rect): LayoutItem => ({
        kind: 'wall',
        rect: cells(rect),
        ...surface(rect.fireOverFrom),
      })),
      ...(map.cover ?? []).map(({ rect, fireOverFrom, ...cover }): LayoutItem => ({
        kind: 'cover',
        ...cover,
        rect: cells(rect),
        ...surface(fireOverFrom),
      })),
      ...(map.gates ?? []).map(({ id, rect, initiallyOpen }): LayoutItem => ({
        kind: 'gate',
        id,
        rect: cells(rect),
        open: initiallyOpen,
      })),
      ...(map.ladders ?? []).map(({ id, bottom, top }): LayoutItem => {
        const rect = {
          x: Math.min(bottom.x, top.x) - 9,
          y: Math.min(bottom.y, top.y) - 9,
          w: Math.abs(bottom.x - top.x) + 18,
          h: Math.abs(bottom.y - top.y) + 18,
        };
        const relative = (at: Vec2) => ({
          x: (at.x - rect.x) / rect.w,
          y: (at.y - rect.y) / rect.h,
        });
        return {
          kind: 'ladder',
          id,
          rect: cells(rect),
          bottom: relative(bottom),
          top: relative(top),
        };
      }),
    ],
  };
}

export function scenarioTemplate(template: ScenarioTemplate): ScenarioLayout {
  if (template === 'hq') {
    const layout = geometry(HUB_MAP);
    layout.items.push(
      ...HUB_DECOR.map((d) => prop(d, d.image, d.w)),
      ...HUB_SIGNS.map((sign) => prop(sign, SIGN_KINDS[sign.kind].post, sign.size ?? 30, sign.id)),
      ...HUB_TARGETS.map((at): LayoutItem => ({
        kind: 'target',
        rect: cells(centered(at, 40, 40)),
      })),
    );
    return layout;
  }
  const layout = geometry(BASIC_TRAINING);
  layout.items.push(
    ...BT_SIGNS.map((sign) => prop(sign, SIGN_KINDS[sign.kind].post, sign.size ?? 30, sign.id)),
    ...(BASIC_TRAINING.objectives ?? []).map(
      ({ id, position, radius = 18, maxHp }): LayoutItem => ({
        id,
        kind: 'target',
        rect: cells(centered(position, radius * 2, radius * 2)),
        hp: maxHp,
      }),
    ),
    ...(BASIC_TRAINING.levers ?? []).map((lever) => prop(lever.position, 'lever_a', 32, lever.id)),
    ...(BASIC_TRAINING.mines ?? []).map((mine) => prop(mine.position, 'mine', 32, mine.id)),
    ...(BASIC_TRAINING.capturePoints ?? []).map((flag) =>
      prop(flag.position, 'capture_base', 110, flag.id),
    ),
  );
  return layout;
}
