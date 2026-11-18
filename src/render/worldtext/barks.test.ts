import { describe, expect, it } from 'vitest';
import { cloneWorldText } from '../../content/world-text';
import type { SimEvent } from '../../sim/events';
import type { SoldierView, WorldView } from '../../sim/view';
import { BarkDirector, type BarkCategory, type BarkFrame } from './barks';

const sol = (id: string, x: number, y: number, more: Partial<SoldierView> = {}): SoldierView => ({
  kind: 'soldier',
  id,
  ordinal: 0,
  x,
  y,
  facing: 0,
  hp: 100,
  maxHp: 100,
  alive: true,
  role: 'static',
  leadIn: false,
  ...more,
});

const view = (soldiers: SoldierView[], events: SimEvent[]): WorldView =>
  ({ soldiers, events, tick: 0 }) as unknown as WorldView;

const lines = (c: BarkCategory) => [c];

function director(rand = () => 0) {
  const t = cloneWorldText().barks;
  return new BarkDirector(t, rand, lines);
}

const frame = (v: WorldView, nowMs: number, more: Partial<BarkFrame> = {}): BarkFrame => ({
  nowMs,
  view: v,
  liveId: null,
  aim: null,
  activeLines: 0,
  isSpeaking: () => false,
  ...more,
});

describe('BarkDirector', () => {
  it('the soldier nearest a landing grenade shouts a warning', () => {
    const d = director();
    const v = view(
      [sol('p1', 0, 0), sol('e1', 300, 0, { role: 'enemy' }), sol('e2', 360, 0, { role: 'enemy' })],
      [
        {
          kind: 'grenadeThrown',
          tick: 0,
          id: 'g',
          by: 'p1',
          fromX: 0,
          fromY: 0,
          angle: 0,
          distance: 290,
        },
      ],
    );
    const out = d.step(frame(v, 1000));
    expect(out.find((r) => r.category === 'grenadeWarn')?.speakerId).toBe('e1');
  });

  it('a nearby friend mourns the fallen by name', () => {
    const d = director();
    const v = view(
      [sol('a', 0, 0, { alive: false }), sol('b', 50, 0), sol('e', 400, 0, { role: 'enemy' })],
      [{ kind: 'soldierDied', tick: 0, id: 'a', cause: 'shot', by: 'e' }],
    );
    const out = d.step(frame(v, 1000));
    const mourn = out.find((r) => r.category === 'allyDown');
    expect(mourn).toMatchObject({ speakerId: 'b', aboutId: 'a' });
  });

  it('killing the last enemy: the killer calls it, then the others cheer', () => {
    const d = director(() => 0);
    const soldiers = [
      sol('k', 0, 0),
      sol('f1', 30, 0),
      sol('f2', 60, 0),
      sol('e', 200, 0, { role: 'enemy', alive: false }),
    ];
    const out = d.step(
      frame(
        view(soldiers, [{ kind: 'soldierDied', tick: 0, id: 'e', cause: 'shot', by: 'k' }]),
        1000,
      ),
    );
    expect(out.map((r) => r.category)).toContain('lastKill');
    const later = d.step(frame(view(soldiers, []), 5000));
    expect(
      later
        .filter((r) => r.category === 'cheer')
        .map((r) => r.speakerId)
        .sort(),
    ).toEqual(['f1', 'f2']);
  });

  it('in a fight, flavour near the player is held back but warnings get through', () => {
    const d = director(() => 0);
    const live = sol('live', 0, 0, { role: 'live' });
    const buddy = sol('b', 40, 0);
    const shots: SimEvent[] = [
      {
        kind: 'shotFired',
        tick: 0,
        by: 'e',
        fromX: 100,
        fromY: 0,
        angle: Math.PI,
        hitX: 0,
        hitY: 0,
      },
    ];
    const enemy = sol('e', 100, 0, { role: 'enemy' });
    d.step(frame(view([live, buddy, enemy], shots), 1000, { liveId: 'live' }));
    // The buddy (40 units from the player) sees someone die: held back.
    const dead = sol('x', 45, 0, { alive: false });
    const out = d.step(
      frame(
        view(
          [live, buddy, enemy, dead],
          [{ kind: 'soldierDied', tick: 1, id: 'x', cause: 'shot', by: 'e' }],
        ),
        1100,
        { liveId: 'live' },
      ),
    );
    expect(out).toEqual([]);
    // A grenade landing on the buddy: warned.
    const warn = d.step(
      frame(
        view(
          [live, buddy, enemy],
          [
            {
              kind: 'grenadeThrown',
              tick: 2,
              id: 'g',
              by: 'e',
              fromX: 100,
              fromY: 0,
              angle: Math.PI,
              distance: 60,
            },
          ],
        ),
        1200,
        { liveId: 'live' },
      ),
    );
    expect(warn.map((r) => r.category)).toContain('grenadeWarn');
  });

  it('an echo shooting at nothing wonders where the enemy went', () => {
    const d = director(() => 0);
    const v = view(
      [sol('echo', 0, 0, { role: 'echo' })],
      [
        {
          kind: 'shotFired',
          tick: 0,
          by: 'echo',
          fromX: 0,
          fromY: 0,
          angle: 0,
          hitX: 300,
          hitY: 0,
        },
      ],
    );
    // No player soldier, so "hot" is global; the echo is peripheral (no player).
    expect(d.step(frame(v, 1000)).map((r) => r.category)).toEqual(['ghostShot']);
  });

  it('respects the on-screen limit', () => {
    const d = director(() => 0);
    const v = view(
      [sol('a', 0, 0, { alive: false }), sol('b', 50, 0), sol('e', 400, 0, { role: 'enemy' })],
      [{ kind: 'soldierDied', tick: 0, id: 'a', cause: 'shot', by: 'e' }],
    );
    expect(d.step(frame(v, 1000, { activeLines: 99 }))).toEqual([]);
  });
});
