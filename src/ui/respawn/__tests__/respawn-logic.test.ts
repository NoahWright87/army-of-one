import { describe, expect, it } from 'vitest';
import { MISSION_01 } from '../../../content/maps/mission-01';
import type { LaneSpan, SpawnOption } from '../../../contracts/mission';
import { secondsToTicks } from '../../../sim/core/time';
import { MemoryStorage, SettingsStore } from '../../settings/registry';
import { buildFixture } from '../__fixtures__/respawn-fixtures';
import { mapThumbSvg } from '../map-thumb';
import {
  captionList,
  changeCaption,
  changedRanges,
  cycleSelection,
  defaultSelection,
  displaySpans,
  endStyle,
  endTooltip,
  findOption,
  headerItems,
  isEventMarker,
  isUnconfirmed,
  laneRows,
  markerTooltip,
  optionKey,
  optionLabel,
  reconcileSelection,
  resumeOptionFor,
  screenKeyAction,
  spanClass,
  timelineDomain,
  unconfirmedRange,
} from '../respawn-model';
import {
  DEFAULT_RESPAWN_SETTINGS,
  readRespawnSettings,
  RESPAWN_SETTING_IDS,
  respawnSettingDefs,
} from '../respawn-settings';
import {
  axisStepTicks,
  axisTicks,
  clampView,
  FIT_PAD_PX,
  fitView,
  isFitted,
  MAX_PX_PER_TICK,
  MIN_DOMAIN_TICKS,
  panBy,
  pinchFactor,
  tickToX,
  wheelZoomFactor,
  xToTick,
  zoomAt,
} from '../time-scale';

const s = secondsToTicks;
const domain = { from: 0, to: s(120) };

describe('time scale', () => {
  it('tick ↔ x round-trips', () => {
    const v = { startTick: 100, pxPerTick: 0.5, width: 800 };
    expect(tickToX(v, 100)).toBe(0);
    expect(tickToX(v, 300)).toBe(100);
    expect(xToTick(v, tickToX(v, 1234))).toBeCloseTo(1234);
  });

  it('fit shows the whole domain with padding', () => {
    const v = fitView(domain, 1000);
    expect(tickToX(v, domain.from)).toBeCloseTo(FIT_PAD_PX);
    expect(tickToX(v, domain.to)).toBeCloseTo(1000 - FIT_PAD_PX);
    expect(isFitted(v, domain)).toBe(true);
  });

  it('zooming keeps the anchor tick under the pointer', () => {
    const v = fitView(domain, 1000);
    const anchor = xToTick(v, 400);
    const z = zoomAt(v, 400, 4, domain);
    expect(z.pxPerTick).toBeCloseTo(v.pxPerTick * 4);
    expect(xToTick(z, 400)).toBeCloseTo(anchor);
    expect(isFitted(z, domain)).toBe(false);
  });

  it('zoom is clamped between fit and the max scale', () => {
    const v = fitView(domain, 1000);
    expect(zoomAt(v, 500, 0.1, domain)).toEqual(v);
    expect(zoomAt(v, 500, 1e6, domain).pxPerTick).toBe(MAX_PX_PER_TICK);
  });

  it('pan moves time opposite to the drag and stops at the ends', () => {
    const z = zoomAt(fitView(domain, 1000), 500, 4, domain);
    const p = panBy(z, -100, domain);
    expect(p.startTick).toBeCloseTo(z.startTick + 100 / z.pxPerTick);
    const far = panBy(z, -1e7, domain);
    expect(xToTick(far, far.width)).toBeCloseTo(domain.to + FIT_PAD_PX / far.pxPerTick);
    const back = panBy(z, 1e7, domain);
    expect(back.startTick).toBeCloseTo(domain.from - FIT_PAD_PX / back.pxPerTick);
  });

  it('a fitted view cannot be panned', () => {
    const v = fitView(domain, 1000);
    expect(panBy(v, 300, domain)).toEqual(v);
    expect(clampView({ ...v, pxPerTick: v.pxPerTick / 3 }, domain)).toEqual(v);
  });

  it('axis labels are evenly spaced, readable and start at 0:00', () => {
    const v = fitView(domain, 1000);
    const step = axisStepTicks(v, 64);
    expect(step * v.pxPerTick).toBeGreaterThanOrEqual(64);
    const ticks = axisTicks(v, 64);
    expect(ticks[0]).toMatchObject({ tick: 0, label: '0:00' });
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!.tick - ticks[i - 1]!.tick).toBe(step);
  });

  it('pinch and wheel factors', () => {
    expect(pinchFactor(100, 200)).toBe(2);
    expect(pinchFactor(0, 200)).toBe(1);
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1);
  });
});

describe('span and end styling', () => {
  it('maps every span kind to its style', () => {
    expect(spanClass('alive')).toBe('sp-alive');
    expect(spanClass('lost')).toBe('sp-lost');
    expect(spanClass('frozen')).toBe('sp-frozen');
    expect(spanClass('unresolved')).toBe('sp-unresolved');
  });

  it('end glyphs: only O is selectable', () => {
    expect(endStyle({ kind: 'death', tick: 5 })).toMatchObject({ glyph: 'X', selectable: false });
    expect(endStyle({ kind: 'open', tick: 5 })).toMatchObject({ glyph: 'O', selectable: true });
    expect(endStyle({ kind: 'interrupted', tick: 5 })).toMatchObject({
      glyph: '!',
      selectable: false,
    });
    expect(endStyle({ kind: 'complete', tick: 5 })).toMatchObject({
      glyph: '✓',
      selectable: false,
    });
    expect(endStyle({ kind: 'neverSpawned' }).glyph).toBeNull();
    expect(endStyle({ kind: 'unresolved' }).glyph).toBeNull();
  });

  it('tooltips name the soldier and time', () => {
    expect(endTooltip({ kind: 'death', tick: s(72) }, 3)).toContain('Soldier 3');
    expect(endTooltip({ kind: 'death', tick: s(72) }, 3)).toContain('1:12');
    const m = {
      soldierId: 'S2',
      tick: s(50),
      kind: 'hazardDestroyed' as const,
      stringKey: 'marker.hazardDestroyed',
    };
    expect(markerTooltip(m, 2)).toBe('Destroyed a hazard · Soldier 2 · 0:50');
    expect(isEventMarker(m)).toBe(true);
    expect(isEventMarker({ ...m, kind: 'death' })).toBe(false);
  });

  it('joins adjacent same-kind spans from different attempts', () => {
    const spans: LaneSpan[] = [
      { from: 0, to: 9, kind: 'alive', observedInAttempt: 1 },
      { from: 10, to: 19, kind: 'alive', observedInAttempt: 2 },
      { from: 20, to: 29, kind: 'lost', observedInAttempt: 2 },
    ];
    expect(displaySpans(spans)).toEqual([
      { from: 0, to: 19, kind: 'alive' },
      { from: 20, to: 29, kind: 'lost' },
    ]);
  });

  it('finds the ranges whose kind changed (for the pass-by animation)', () => {
    const prev: LaneSpan[] = [{ from: 0, to: 99, kind: 'alive', observedInAttempt: 1 }];
    const next: LaneSpan[] = [
      { from: 0, to: 49, kind: 'alive', observedInAttempt: 2 },
      { from: 50, to: 99, kind: 'lost', observedInAttempt: 2 },
    ];
    expect(changedRanges(prev, next)).toEqual([{ from: 50, to: 99, kind: 'lost' }]);
    expect(changedRanges(prev, prev)).toEqual([]);
    expect(changedRanges(undefined, next)).toEqual([]);
    // Extension past the old recording counts as changed.
    const longer: LaneSpan[] = [{ from: 0, to: 149, kind: 'alive', observedInAttempt: 2 }];
    expect(changedRanges(prev, longer)).toEqual([{ from: 100, to: 149, kind: 'alive' }]);
  });
});

describe('captions, header, rows', () => {
  it('history-changed captions', () => {
    expect(
      changeCaption(
        { soldierId: 'S1', before: { kind: 'death', tick: 5 }, after: { kind: 'open', tick: 5 } },
        1,
      ),
    ).toBe('Soldier 1 survived!');
    expect(
      changeCaption(
        {
          soldierId: 'S1',
          before: { kind: 'open', tick: 5 },
          after: { kind: 'death', tick: s(72) },
        },
        1,
      ),
    ).toBe('Soldier 1 now dies at 1:12');
    expect(
      changeCaption(
        { soldierId: 'S4', before: { kind: 'death', tick: 5 }, after: { kind: 'neverSpawned' } },
        4,
      ),
    ).toContain('never spawns');
    expect(captionList(['a', 'b', 'c', 'd', 'e'], 3)).toEqual(['e', 'd', 'c', '+2 more']);
  });

  it('header: next attempt, soldiers, time reached, objective', () => {
    const p = buildFixture('rescue')!.props;
    const h = headerItems(p);
    expect(h.title).toBe('Attempt 3');
    expect(h.items.map((i) => i.value)).toEqual(['2', '1:10', 'Not destroyed']);
    expect(headerItems(buildFixture('empty')!.props).items[1]!.value).toBe('Not started');
  });

  it('rows are ordered by ordinal and carry the spawn point name', () => {
    const p = buildFixture('twelve')!.props;
    const rows = laneRows([...p.lanes].reverse(), p.soldiers, p.map);
    expect(rows.map((r) => r.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(rows[0]!.label).toBe('Soldier 1');
    expect(rows[0]!.spawnName).toBe('Road');
  });
});

describe('domain and scrubber dimming', () => {
  it('domain covers lanes, options and the scrubber, with a minimum', () => {
    expect(timelineDomain({ lanes: [], options: [], reachedTick: null })).toEqual({
      from: 0,
      to: MIN_DOMAIN_TICKS,
    });
    const p = buildFixture('twelve')!.props;
    const d = timelineDomain(p);
    for (const l of p.lanes) expect(d.to).toBeGreaterThan(l.recordedTo);
  });

  it('dims everything right of the scrubber, nothing when idle', () => {
    expect(unconfirmedRange(null, domain)).toBeNull();
    expect(unconfirmedRange(undefined, domain)).toBeNull();
    expect(unconfirmedRange(s(40), domain)).toEqual({ from: s(40), to: domain.to });
    expect(unconfirmedRange(domain.to, domain)).toBeNull();
    expect(isUnconfirmed(s(50), s(40))).toBe(true);
    expect(isUnconfirmed(s(30), s(40))).toBe(false);
    expect(isUnconfirmed(s(50), null)).toBe(false);
  });
});

describe('options and selection', () => {
  const options: SpawnOption[] = [
    { kind: 'new', spawnPointId: 'road', entryTick: s(6) },
    { kind: 'new', spawnPointId: 'beach', entryTick: 0 },
    { kind: 'resume', soldierId: 'S1', resumeTick: s(48), leadInFromTick: s(43) },
  ];

  it('labels: name + entry time, resume time', () => {
    const p = { map: MISSION_01, soldiers: [], resolvedUntil: null };
    expect(optionLabel(options[0]!, p).title).toBe('Road: enters at 0:06');
    expect(optionLabel(options[2]!, p).title).toBe('Resume Soldier 1 at 0:48');
    expect(optionLabel(options[2]!, { ...p, resolvedUntil: s(40) }).unconfirmed).toBe(true);
  });

  it('keys are unique and stable', () => {
    expect(options.map(optionKey)).toEqual(['new:road', 'new:beach', 'resume:S1']);
  });

  it('arrows/Tab cycle and wrap; deploying returns the exact option object', () => {
    let k = defaultSelection(options);
    expect(k).toBe('new:road');
    k = cycleSelection(options, k, 1);
    expect(k).toBe('new:beach');
    k = cycleSelection(options, k, 1);
    expect(findOption(options, k)).toBe(options[2]);
    expect(cycleSelection(options, k, 1)).toBe('new:road');
    expect(cycleSelection(options, 'new:road', -1)).toBe('resume:S1');
    expect(cycleSelection(options, null, -1)).toBe('resume:S1');
    expect(cycleSelection([], null, 1)).toBeNull();
  });

  it('the O on a lane maps to its resume option', () => {
    expect(resumeOptionFor(options, 'S1')).toBe(options[2]);
    expect(resumeOptionFor(options, 'S2')).toBeNull();
  });

  it('a vanished selection is cleared, never silently replaced', () => {
    expect(reconcileSelection('resume:S1', options)).toBe('resume:S1');
    expect(reconcileSelection('resume:S1', options.slice(0, 2))).toBeNull();
    expect(reconcileSelection(null, options)).toBeNull();
  });

  it('keyboard map', () => {
    expect(screenKeyAction('ArrowDown', false)).toBe('next');
    expect(screenKeyAction('ArrowUp', false)).toBe('prev');
    expect(screenKeyAction('Tab', false)).toBe('next');
    expect(screenKeyAction('Tab', true)).toBe('prev');
    expect(screenKeyAction('Enter', false)).toBe('deploy');
    expect(screenKeyAction('0', false)).toBe('fit');
    expect(screenKeyAction('w', false)).toBeNull();
  });

  it('a fixture deploy picks the real derived option', () => {
    const p = buildFixture('rescue')!.props;
    const k = cycleSelection(
      p.options,
      cycleSelection(p.options, defaultSelection(p.options), 1),
      1,
    );
    expect(findOption(p.options, k)).toEqual({
      kind: 'resume',
      soldierId: 'S1',
      resumeTick: s(58),
      leadInFromTick: s(53),
    });
  });
});

describe('map thumbnail', () => {
  it('draws walls, water and marks the chosen point', () => {
    const svg = mapThumbSvg(MISSION_01, { pointId: 'beach', width: 84, height: 58 });
    expect(svg.match(/class="th-wall"/g)?.length).toBe(MISSION_01.walls.length);
    expect(svg.match(/class="th-water"/g)?.length).toBe(MISSION_01.water.length);
    expect(svg.match(/th-pt on/g)?.length).toBe(1);
    expect(svg).toContain('cx="2700" cy="4200"');
  });
});

describe('respawn settings', () => {
  it('registers with defaults and reads back typed values', () => {
    const store = new SettingsStore(new MemoryStorage(), 'k');
    store.register(respawnSettingDefs());
    expect(readRespawnSettings(store)).toEqual(DEFAULT_RESPAWN_SETTINGS);
    store.set(RESPAWN_SETTING_IDS.rowHeight, 999);
    store.set(RESPAWN_SETTING_IDS.wheel, 'scroll');
    const r = readRespawnSettings(store);
    expect(r.rowHeight).toBe(72);
    expect(r.wheel).toBe('scroll');
  });
});
