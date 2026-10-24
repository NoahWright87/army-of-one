import { describe, expect, it } from 'vitest';
import { buildFixture } from '../__fixtures__/respawn-fixtures';
import {
  isTallMap,
  mapMarkers,
  revealFor,
  sharedRevealGrid,
  tallMapWidth,
  unitsPerPx,
} from '../map-panel-model';
import { optionKey, type RespawnProps } from '../respawn-model';

function props(name: string): RespawnProps {
  const f = buildFixture(name);
  if (!f) throw new Error(name);
  return f.props;
}

describe('respawn map (real-recording fixtures)', () => {
  const p = props('map');
  const { grid, known } = revealFor(p);

  it('mission-01: reveals the explored routes, shows X/O and the destroyed turret', () => {
    const summary = {
      revealed: Math.round(grid.fraction * 100),
      ends: known.ends.map((e) => `${e.soldierId}:${e.kind}`),
      threats: known.threats.map(
        (t) => `${t.kind}:${t.id}${'destroyed' in t && t.destroyed ? '†' : ''}`,
      ),
    };
    console.log('[map fixture]', JSON.stringify(summary));
    expect(summary.revealed).toBeGreaterThan(5);
    expect(summary.revealed).toBeLessThan(90);
    expect(known.ends.some((e) => e.kind === 'death')).toBe(true);
    expect(known.ends.find((e) => e.soldierId === 'S1')?.kind).toBe('open');
    expect(known.threats.find((t) => t.id === 'turret-1')).toMatchObject({
      kind: 'turret',
      destroyed: expect.objectContaining({ by: expect.any(String) }),
    });
    // Spawns are where the map says; the objective is always known.
    expect(known.spawns.map((s) => s.id)).toEqual(['road', 'beach']);
    expect(known.objectives).toHaveLength(1);
  });

  it('markers: spawns and O are selectable and track the selection', () => {
    const sel = optionKey(p.options[0]!);
    const ms = mapMarkers(p, known, sel);
    const spawn = ms.find((m) => m.kind === 'spawn' && m.select === sel);
    expect(spawn?.selected).toBe(true);
    const o = ms.find((m) => m.kind === 'open' && m.id === 'S1');
    expect(o?.select).toBe('resume:S1');
    expect(o?.selected).toBe(false);
    expect(
      mapMarkers(p, known, 'resume:S1').find((m) => m.id === 'S1' && m.kind === 'open'),
    ).toMatchObject({ selected: true });
    expect(ms.filter((m) => m.kind === 'death').every((m) => !m.select)).toBe(true);
    // X markers aren't selectable; X draws above spawns, O on top of everything.
    const firstX = ms.findIndex((m) => m.kind === 'death');
    expect(ms.slice(firstX).every((m) => m.kind === 'death' || m.kind === 'open')).toBe(true);
    expect(ms.findIndex((m) => m.kind === 'spawn')).toBeLessThan(firstX);
    for (const m of ms) expect(m.tip.length).toBeGreaterThan(0);
  });

  it('mission-02: the captured Outpost shows as an open forward spawn', () => {
    const q = props('map-outpost');
    const r = revealFor(q);
    const fwd = r.known.spawns.find((s) => s.kind === 'capture');
    expect(fwd).toMatchObject({ open: true });
    const ms = mapMarkers(q, r.known, null);
    expect(ms.find((m) => m.kind === 'spawn' && m.id === fwd!.id)?.select).toBe(`new:${fwd!.id}`);
    expect(ms.some((m) => m.kind === 'flag')).toBe(true);
  });

  it('tall strip: a tall layout, spawns at the bottom', () => {
    const q = props('map-tall');
    expect(isTallMap(q.map)).toBe(true);
    expect(isTallMap(p.map)).toBe(false);
    const r = revealFor(q);
    expect(r.known.spawns.every((s) => s.y > q.map.height * 0.9)).toBe(true);
    expect(r.grid.isRevealedAt(700, 5800)).toBe(true);
    expect(r.grid.isRevealedAt(700, 300)).toBe(false);
  });

  it('the shared grid is reused per map and options', () => {
    const a = sharedRevealGrid(p.map, p.reveal);
    expect(sharedRevealGrid(p.map, p.reveal)).toBe(a);
    expect(sharedRevealGrid(p.map, { ...p.reveal!, radius: 100 })).not.toBe(a);
  });
});

describe('map layout maths', () => {
  it('sizes a tall map column from the height, clamped', () => {
    const m = { width: 1400, height: 6000 };
    expect(tallMapWidth(m, 600, 150, 320)).toBe(150); // 140 → min
    expect(tallMapWidth(m, 1200, 150, 320)).toBe(280);
    expect(tallMapWidth(m, 3000, 150, 320)).toBe(320);
  });

  it('units per px fits the longer side', () => {
    expect(unitsPerPx({ width: 6400, height: 4400 }, 320, 320, 0)).toBe(20);
    expect(unitsPerPx({ width: 1400, height: 6000 }, 200, 600, 0)).toBe(10);
  });
});
