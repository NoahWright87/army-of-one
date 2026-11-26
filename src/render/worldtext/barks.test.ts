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

  describe('what the AI notices (PHASE21)', () => {
    const enemy = (alert?: 1 | 2 | 3) =>
      sol('e1', 300, 0, { role: 'enemy', ...(alert ? { alert } : {}) });
    const say = (
      d: BarkDirector,
      alert: 1 | 2 | 3 | undefined,
      nowMs: number,
      ev: SimEvent[] = [],
    ) => d.step(frame(view([sol('p1', 0, 0), enemy(alert)], ev), nowMs)).map((r) => r.category);

    it('says something when it gets uneasy, again when it makes contact, and on alarm', () => {
      const d = director();
      expect(say(d, undefined, 0)).toEqual([]);
      expect(say(d, 1, 1000)).toEqual(['uneasy']);
      expect(say(d, 1, 1100)).toEqual([]); // unchanged: quiet
      expect(say(d, 2, 3000)).toEqual(['contact']);
      expect(say(d, 3, 6000)).toEqual(['alarm']);
    });

    it('a firefight that starts with contact says contact only, not "uneasy" first', () => {
      const d = director();
      expect(say(d, 2, 1000)).toEqual(['contact']);
    });

    it('says it was nothing only after a false alarm (uneasy, then calm)', () => {
      const d = director();
      say(d, 1, 1000);
      expect(say(d, undefined, 9000)).toEqual(['standDown']);
      const d2 = director();
      say(d2, 2, 1000);
      expect(say(d2, undefined, 9000)).toEqual([]);
    });

    it('a bullet past someone who was calm makes them say whoa', () => {
      const d = director();
      const miss: SimEvent = {
        kind: 'nearMiss',
        tick: 0,
        target: 'e1',
        by: 'p1',
        fromX: 0,
        fromY: 0,
      };
      expect(say(d, undefined, 1000, [miss])).toContain('whoa');
    });
  });

  describe('more chatter (PHASE21)', () => {
    it('a friend nearby says someone is hit; the one hit and the player do not', () => {
      const d = director();
      const v = view(
        [sol('a', 0, 0), sol('b', 100, 0), sol('c', 150, 0, { role: 'enemy' })],
        [{ kind: 'damaged', tick: 0, target: 'a', amount: 5, by: 'c' }],
      );
      const out = d.step(frame(v, 1000, { liveId: 'zz' }));
      expect(out).toEqual([
        expect.objectContaining({ category: 'allyHit', speakerId: 'b', aboutId: 'a' }),
      ]);
    });

    it('the soldier a rocket is heading for shouts', () => {
      const d = director();
      const v = view(
        [sol('p', 0, 0), sol('e', 300, 0, { role: 'enemy' })],
        [{ kind: 'rocketLaunched', tick: 0, id: 'r', by: 'p', fromX: 0, fromY: 0, angle: 0 }],
      );
      expect(d.step(frame(v, 1000)).map((r) => [r.category, r.speakerId])).toEqual([
        ['rocketWarn', 'e'],
      ]);
    });

    it('a mine going off and cover breaking get a word from whoever is close', () => {
      const d = director();
      const v = view(
        [sol('a', 0, 0)],
        [{ kind: 'mineDetonated', tick: 0, id: 'm', x: 50, y: 0, radius: 10 }],
      );
      expect(d.step(frame(v, 1000)).map((r) => r.category)).toEqual(['mineBoom']);
      const v2 = view(
        [sol('a', 0, 0)],
        [{ kind: 'coverDestroyed', tick: 0, id: 'c', x: 50, y: 0 }],
      );
      expect(d.step(frame(v2, 9000)).map((r) => r.category)).toEqual(['coverBlown']);
    });
  });
});
