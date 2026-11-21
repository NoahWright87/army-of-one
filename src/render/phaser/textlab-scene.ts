/**
 * `?scene=textlab`: a playground for in-world text. Walk up to signposts (WASD, click fires),
 * make soldiers talk, and stage situations (a grenade, a man down, the last enemy falling) that
 * run through the real bark director. The DOM panel (`src/ui/textlab/`) drives it and edits the
 * look live. No sim: the soldiers here are puppets.
 */
import Phaser from 'phaser';
import { fitPx } from '../../content/assets';
import type { CaptionVoiceProfile } from '../../content/caption-voices';
import type { RoleId } from '../../contracts/mission';
import type { SignDef } from '../../content/sign-styles';
import { fillVars, identityVars } from '../../content/soldier-names';
import { stringsWithPrefix } from '../../content/strings';
import { cloneWorldText, type WorldTextTuning } from '../../content/world-text';
import type { SimEvent } from '../../sim/events';
import type { SoldierView, WorldView } from '../../sim/view';
import { DEPTH } from '../depth';
import { BarkDirector } from '../worldtext/barks';
import { SignpostLayer } from '../worldtext/signpost-layer';
import type { DisplaySettings } from '../../ui/settings/display-settings';
import { SpeechLayer } from '../worldtext/speech-layer';
import { ENEMY_SPEECH_COLOR, identityOf } from '../worldtext/world-speech';

export const LAB_W = 1400;
export const LAB_H = 900;
export const LAB_PLAYER = 'you';
const SPEED = 190;
const R = 12;
/** Touch stick: full speed this far (screen px) from where the finger went down; dead zone. */
const STICK_R = 60;
const STICK_DEAD = 8;

export const LAB_SIGNS: readonly SignDef[] = [
  { id: 's1', x: 220, y: 170, kind: 'plain', textKey: 'sign.lab.plain' },
  { id: 's2', x: 460, y: 170, kind: 'wood', textKey: 'sign.lab.wood' },
  { id: 's3', x: 700, y: 170, kind: 'clipboard', textKey: 'sign.lab.clipboard' },
  { id: 's4', x: 940, y: 170, kind: 'plate', textKey: 'sign.lab.stencil' },
  { id: 's5', x: 1180, y: 170, kind: 'wood', frame: 'clipboard', textKey: 'sign.lab.override' },
];

/** Effect showcases (the panel's presets; the auto demo says them too). */
export const LAB_DEMOS = [
  '[all][shake][big]INCOMING!![p=400][words] Get behind the [gold]sandbags[/]!',
  'Hold the line... [p][slam]NOW![/]',
  '[fly]Surprise![/] [p]Did you miss me?',
  '[wave]La la la[/], [p]nobody here but us [small]ghosts[/].',
  "[letters]I've got a bad feeling about this...",
  '[pulse][red]Medic![/] [p]I need a medic!',
  '[wobble]Too... much... coffee...[/]',
  '[drop]Oops.[/]',
  '[shake]CEASE FIRE! [quake][big]CEASE FIRE!![/]',
  '[all]{rankShort}! [p=300][words]{theirFull} needs backup!',
];

export type LabSituation =
  'grenade' | 'manDown' | 'enemyDown' | 'pinned' | 'ghost' | 'corpse' | 'reset';

interface Puppet {
  id: string;
  x: number;
  y: number;
  facing: number;
  role: SoldierView['role'];
  roleId: RoleId;
  alive: boolean;
  hp: number;
  goal: { x: number; y: number };
  /** Running away from something until this time. */
  fleeUntil: number;
  sprite: Phaser.GameObjects.Image;
}

const ROSTER: { id: string; role: SoldierView['role']; roleId: RoleId; x: number; y: number }[] = [
  { id: 'f1', role: 'static', roleId: 'rifleman', x: 380, y: 620 },
  { id: 'f2', role: 'static', roleId: 'gunner', x: 460, y: 680 },
  { id: 'f3', role: 'static', roleId: 'shield', x: 540, y: 610 },
  { id: 'f4', role: 'echo', roleId: 'grenadier', x: 620, y: 700 },
  { id: 'f5', role: 'echo', roleId: 'sniper', x: 300, y: 720 },
  { id: 'e1', role: 'enemy', roleId: 'rifleman', x: 1020, y: 600 },
  { id: 'e2', role: 'enemy', roleId: 'shotgun', x: 1120, y: 680 },
  { id: 'e3', role: 'enemy', roleId: 'tank', x: 1200, y: 590 },
];

export class TextLabScene extends Phaser.Scene {
  tuning: WorldTextTuning = cloneWorldText();
  playerVoice?: CaptionVoiceProfile;
  /** Called whenever the speaker list changes (deaths, reset). */
  onRoster: (list: { id: string; label: string; alive: boolean }[]) => void = () => {};
  private speech!: SpeechLayer;
  private signs!: SignpostLayer;
  private director!: BarkDirector;
  private player!: Puppet;
  private puppets: Puppet[] = [];
  private keys!: Record<
    'w' | 'a' | 's' | 'd' | 'up' | 'down' | 'left' | 'right',
    Phaser.Input.Keyboard.Key
  >;
  private fired = false;
  private pending: SimEvent[] = [];
  private fx!: Phaser.GameObjects.Graphics;
  private effects: {
    until: number;
    draw: (g: Phaser.GameObjects.Graphics, p: number) => void;
    start: number;
  }[] = [];
  private firefightUntil = 0;
  private nextFirefightShot = 0;
  /** Soldiers talk on their own every few seconds (the lab's demo; not a game rule). */
  autoDemo = true;
  private nextAuto = 1500;
  private zoom = 1;
  /** Touch: the movement stick (screen px), and where the last tap fired. */
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private stickGfx!: Phaser.GameObjects.Graphics;
  private touchAim: { x: number; y: number; until: number } | null = null;

  constructor(private readonly display: DisplaySettings) {
    super('textlab');
  }

  create(): void {
    this.add.tileSprite(0, 0, LAB_W, LAB_H, 'ground_tile').setOrigin(0).setDepth(DEPTH.ground);
    const g = this.add.graphics().setDepth(DEPTH.walls);
    g.lineStyle(4, 0x000000, 0.5).strokeRect(0, 0, LAB_W, LAB_H);
    // A few sandbag lines so it reads like a battlefield.
    g.fillStyle(0x8a7a52, 1);
    for (const [x, y, w] of [
      [340, 560, 220],
      [960, 540, 200],
      [640, 430, 120],
    ] as const) {
      g.fillRoundedRect(x, y, w, 18, 6);
    }
    this.fx = this.add.graphics().setDepth(DEPTH.effects);
    this.speech = new SpeechLayer(this, this.tuning, this.display);
    this.speech.onQuake = () => this.cameras.main.shake(220, 0.008);
    this.signs = new SignpostLayer(this, LAB_SIGNS, this.tuning);
    this.director = new BarkDirector(this.tuning.barks);
    this.player = this.makePuppet({
      id: LAB_PLAYER,
      role: 'live',
      roleId: 'rifleman',
      x: 700,
      y: 330,
    });
    this.resetPuppets();
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({
      w: K.W,
      a: K.A,
      s: K.S,
      d: K.D,
      up: K.UP,
      down: K.DOWN,
      left: K.LEFT,
      right: K.RIGHT,
    }) as typeof this.keys;
    // Mouse: click fires. Touch ([D144]): the first finger is a movement stick (drag from
    // where it went down), a second finger taps to fire at that spot.
    this.input.addPointer(2);
    this.stickGfx = this.add.graphics().setDepth(DEPTH.reticle);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) {
        if (!this.stick) this.stick = { id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y };
        else this.fire(p.x, p.y);
        return;
      }
      if (p.button !== 0) return;
      this.fire(p.x, p.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.stick && p.id === this.stick.id) {
        this.stick.x = p.x;
        this.stick.y = p.y;
      }
    });
    const lift = (p: Phaser.Input.Pointer) => {
      if (this.stick && p.id === this.stick.id) this.stick = null;
    };
    this.input.on('pointerup', lift);
    this.input.on('pointerupoutside', lift);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) =>
      this.setZoom(this.zoom * (dy > 0 ? 0.9 : 1.1)),
    );
    this.cameras.main.setBounds(-200, -200, LAB_W + 400, LAB_H + 400);
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
    this.setZoom(this.zoom);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.setZoom(this.zoom));
  }

  setZoom(z: number): void {
    this.zoom = Math.max(0.4, Math.min(2.5, z));
    const cam = this.cameras.main;
    cam.setZoom(this.zoom);
    // The panel covers the right 340 px (the bottom on narrow screens): centre the player in the rest.
    const wide = this.scale.width >= 720;
    cam.setFollowOffset(
      wide ? -170 / this.zoom : 0,
      wide ? 0 : (-0.22 * this.scale.height) / this.zoom,
    );
  }

  /** The look changed: rebuild what caches sizes. */
  applyTuning(): void {
    this.speech.tuning = this.tuning;
    this.signs.tuning = this.tuning;
    this.director.tuning = this.tuning.barks;
    this.signs.rebuild();
  }

  /** Says a line (markup; `{name}` etc. are filled for the speaker) over a soldier. */
  say(id: string, markup: string): void {
    const p = this.find(id);
    if (!p) return;
    const text = fillVars(markup, identityVars(identityOf(p), identityOf(this.pickOther(p))));
    this.speech.say(p.id, text, {
      voice: p.id === LAB_PLAYER ? this.playerVoice : undefined,
      echo: p.role === 'echo',
      ...(p.role === 'enemy' ? { color: ENEMY_SPEECH_COLOR } : {}),
    });
  }

  /** Someone to talk about: a friend of the speaker. */
  private pickOther(p: Puppet): Puppet {
    const mates = this.puppets.filter(
      (q) => q.id !== p.id && (q.role === 'enemy') === (p.role === 'enemy'),
    );
    return mates[0] ?? p;
  }

  speakers(): { id: string; label: string; alive: boolean }[] {
    return [this.player, ...this.puppets].map((p) => {
      const who = identityOf(p);
      const side =
        p.id === LAB_PLAYER
          ? 'you'
          : p.role === 'enemy'
            ? 'enemy'
            : p.role === 'echo'
              ? 'echo'
              : 'friend';
      return {
        id: p.id,
        label: `${who.rank.abbr} ${who.name} (${side}, ${p.roleId})`,
        alive: p.alive,
      };
    });
  }

  /** A few seconds of shooting near you, so the noise budget switches to "in a fight". */
  /** Someone says something, or something happens, so the lab is never silent. */
  private demoTick(): void {
    const alive = (enemy: boolean) =>
      this.puppets.filter((p) => p.alive && (p.role === 'enemy') === enemy);
    if (alive(true).length < 1 || alive(false).length < 2) {
      this.situation('reset');
      return;
    }
    const r = Math.random();
    if (r < 0.35) {
      const sits: LabSituation[] = ['grenade', 'pinned', 'ghost', 'manDown', 'enemyDown', 'corpse'];
      this.situation(sits[Math.floor(Math.random() * sits.length)]!);
      return;
    }
    const speakers = [...alive(false), ...alive(true)].filter((p) => !this.speech.isSpeaking(p.id));
    const sp = speakers[Math.floor(Math.random() * speakers.length)];
    if (!sp) return;
    const lines = [...LAB_DEMOS, ...stringsWithPrefix('bark.')];
    this.say(sp.id, lines[Math.floor(Math.random() * lines.length)]!);
  }

  firefight(seconds: number): void {
    this.firefightUntil = this.time.now + seconds * 1000;
  }

  situation(s: LabSituation): void {
    const living = (enemy: boolean) =>
      this.puppets.filter((p) => p.alive && (p.role === 'enemy') === enemy);
    const any = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
    switch (s) {
      case 'reset':
        this.resetPuppets();
        this.speech.clear();
        break;
      case 'grenade': {
        const thrower = any(living(true));
        const target = any(living(false));
        if (!thrower || !target) break;
        const angle = Math.atan2(target.y - thrower.y, target.x - thrower.x);
        const distance = Math.hypot(target.x - thrower.x, target.y - thrower.y) - 10;
        this.pending.push({
          kind: 'grenadeThrown',
          tick: 0,
          id: 'g',
          by: thrower.id,
          fromX: thrower.x,
          fromY: thrower.y,
          angle,
          distance,
        });
        const lx = thrower.x + Math.cos(angle) * distance;
        const ly = thrower.y + Math.sin(angle) * distance;
        const now = this.time.now;
        // Everyone close scatters.
        for (const p of living(false)) {
          if (Math.hypot(p.x - lx, p.y - ly) > 140) continue;
          const away = Math.atan2(p.y - ly, p.x - lx);
          p.goal = { x: p.x + Math.cos(away) * 160, y: p.y + Math.sin(away) * 160 };
          p.fleeUntil = now + 1100;
        }
        this.effects.push({
          start: now,
          until: now + 1300,
          draw: (gfx, p) => {
            const fx = thrower.x + (lx - thrower.x) * Math.min(1, p * 1.3);
            const fy = thrower.y + (ly - thrower.y) * Math.min(1, p * 1.3);
            gfx
              .fillStyle(0x2b3a1f, 1)
              .fillCircle(fx, fy - Math.sin(Math.min(1, p * 1.3) * Math.PI) * 40, 5);
            if (p > 0.85)
              gfx.fillStyle(0xffa020, 1 - (p - 0.85) / 0.15).fillCircle(lx, ly, 60 * (p - 0.7) * 3);
          },
        });
        break;
      }
      case 'manDown': {
        const victim = any(living(false));
        const killer = any(living(true));
        if (victim) this.kill(victim, killer?.id);
        break;
      }
      case 'enemyDown': {
        const victim = any(living(true));
        const killer = any(living(false)) ?? this.player;
        if (victim) this.kill(victim, killer.id);
        break;
      }
      case 'pinned': {
        const p = any(living(false));
        const shooter = any(living(true));
        if (!p || !shooter) break;
        for (let i = 0; i < this.tuning.barks.pinnedHits; i++) {
          this.pending.push({
            kind: 'nearMiss',
            tick: 0,
            target: p.id,
            by: shooter.id,
            fromX: shooter.x,
            fromY: shooter.y,
          });
        }
        this.tracer(shooter.x, shooter.y, p.x + 14, p.y - 10);
        break;
      }
      case 'ghost':
      case 'corpse': {
        const echo = this.puppets.find((p) => p.alive && p.role === 'echo');
        if (!echo) break;
        let tx = echo.x + 260;
        let ty = echo.y - 200;
        if (s === 'corpse') {
          const dead = this.puppets.find((p) => !p.alive && p.role === 'enemy') ?? living(true)[0];
          if (!dead) break;
          if (dead.alive) this.kill(dead, echo.id);
          tx = dead.x;
          ty = dead.y;
        } else {
          // Shoot where nobody stands.
          for (const p of living(true)) {
            if (Math.hypot(p.x - tx, p.y - ty) < 200) ty -= 300;
          }
        }
        const angle = Math.atan2(ty - echo.y, tx - echo.x);
        echo.facing = angle;
        this.tracer(echo.x, echo.y, tx, ty);
        this.pending.push({
          kind: 'shotFired',
          tick: 0,
          by: echo.id,
          fromX: echo.x,
          fromY: echo.y,
          angle,
          hitX: tx,
          hitY: ty,
        });
        break;
      }
    }
  }

  private kill(p: Puppet, by: string | undefined): void {
    p.alive = false;
    p.hp = 0;
    p.sprite.setTint(0x777777).setRotation(1.2).setAlpha(0.7);
    const killer = by ? this.find(by) : undefined;
    if (killer) this.tracer(killer.x, killer.y, p.x, p.y);
    this.pending.push({
      kind: 'soldierDied',
      tick: 0,
      id: p.id,
      cause: 'shot',
      ...(by ? { by } : {}),
    });
    this.onRoster(this.speakers());
  }

  private tracer(x0: number, y0: number, x1: number, y1: number): void {
    const now = this.time.now;
    this.effects.push({
      start: now,
      until: now + 140,
      draw: (gfx, p) => gfx.lineStyle(2, 0xfff2a8, 1 - p).lineBetween(x0, y0, x1, y1),
    });
  }

  private fire(sx: number, sy: number): void {
    const at = this.cameras.main.getWorldPoint(sx, sy);
    this.touchAim = { x: at.x, y: at.y, until: this.time.now + 600 };
    const angle = Math.atan2(at.y - this.player.y, at.x - this.player.x);
    this.fired = true;
    this.tracer(
      this.player.x,
      this.player.y,
      this.player.x + Math.cos(angle) * 500,
      this.player.y + Math.sin(angle) * 500,
    );
    this.pending.push({
      kind: 'shotFired',
      tick: 0,
      by: LAB_PLAYER,
      fromX: this.player.x,
      fromY: this.player.y,
      angle,
      hitX: at.x,
      hitY: at.y,
    });
  }

  private find(id: string): Puppet | undefined {
    return id === LAB_PLAYER ? this.player : this.puppets.find((p) => p.id === id);
  }

  private makePuppet(r: (typeof ROSTER)[number]): Puppet {
    const key =
      r.role === 'enemy'
        ? 'soldier_enemy'
        : r.role === 'echo'
          ? 'soldier_echo'
          : r.role === 'live'
            ? 'soldier_live'
            : 'soldier_live';
    const sprite = this.add
      .image(r.x, r.y, key)
      .setScale((R * 2) / fitPx(key))
      .setDepth(r.role === 'live' ? DEPTH.live : DEPTH.echoes);
    if (r.role === 'static') sprite.setTint(0x9fd0ff);
    if (r.role === 'echo') sprite.setAlpha(0.75);
    return {
      ...r,
      facing: 0,
      alive: true,
      hp: 100,
      goal: { x: r.x, y: r.y },
      fleeUntil: 0,
      sprite,
    };
  }

  private resetPuppets(): void {
    for (const p of this.puppets) p.sprite.destroy();
    this.puppets = ROSTER.map((r) => this.makePuppet(r));
    this.onRoster(this.speakers());
  }

  private view(): WorldView {
    const soldiers: SoldierView[] = [this.player, ...this.puppets].map((p, i) => ({
      kind: 'soldier',
      id: p.id,
      ordinal: i,
      x: p.x,
      y: p.y,
      facing: p.facing,
      hp: p.hp,
      maxHp: 100,
      alive: p.alive,
      role: p.role,
      leadIn: false,
      roleId: p.roleId,
    }));
    const events = this.pending;
    this.pending = [];
    return { soldiers, events, tick: 0 } as unknown as WorldView;
  }

  override update(time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    // You.
    const k = this.keys;
    let mx = Number(k.d.isDown || k.right.isDown) - Number(k.a.isDown || k.left.isDown);
    let my = Number(k.s.isDown || k.down.isDown) - Number(k.w.isDown || k.up.isDown);
    let speed = 1;
    this.stickGfx.clear();
    if (this.stick) {
      const st = this.stick;
      const dx = st.x - st.ox;
      const dy = st.y - st.oy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_DEAD) {
        mx = dx;
        my = dy;
        speed = Math.min(1, d / STICK_R);
      }
      const kx = st.ox + (d > STICK_R ? (dx / d) * STICK_R : dx);
      const ky = st.oy + (d > STICK_R ? (dy / d) * STICK_R : dy);
      // Drawn in world space (a scroll-factor-0 object would still be zoomed by the camera).
      const cam = this.cameras.main;
      const o = cam.getWorldPoint(st.ox, st.oy);
      const kn = cam.getWorldPoint(kx, ky);
      this.stickGfx
        .lineStyle(3 / cam.zoom, 0xffffff, 0.35)
        .strokeCircle(o.x, o.y, STICK_R / cam.zoom);
      this.stickGfx.fillStyle(0xffffff, 0.45).fillCircle(kn.x, kn.y, 18 / cam.zoom);
    }
    const len = Math.hypot(mx, my) || 1;
    const step = SPEED * speed * dt;
    this.player.x = Phaser.Math.Clamp(this.player.x + (mx / len) * step, R, LAB_W - R);
    this.player.y = Phaser.Math.Clamp(this.player.y + (my / len) * step, R, LAB_H - R);
    const ptr = this.input.activePointer;
    let aim: { x: number; y: number } = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    if (ptr.wasTouch || this.stick) {
      // Touch: face the last tap for a moment, else where you're walking.
      if (this.touchAim && time < this.touchAim.until) aim = this.touchAim;
      else if (mx || my) aim = { x: this.player.x + mx, y: this.player.y + my };
      else
        aim = {
          x: this.player.x + Math.cos(this.player.facing),
          y: this.player.y + Math.sin(this.player.facing),
        };
    }
    this.player.facing = Math.atan2(aim.y - this.player.y, aim.x - this.player.x);
    // Puppets wander (or flee).
    for (const p of this.puppets) {
      if (!p.alive) continue;
      const fleeing = time < p.fleeUntil;
      const dx = p.goal.x - p.x;
      const dy = p.goal.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 4 && !fleeing) {
        if (Math.random() < 0.01) {
          const home = ROSTER.find((r) => r.id === p.id)!;
          p.goal = {
            x: home.x + (Math.random() - 0.5) * 160,
            y: home.y + (Math.random() - 0.5) * 100,
          };
        }
      } else if (d >= 1) {
        const v = (fleeing ? 230 : 45) * dt;
        p.x += (dx / d) * Math.min(v, d);
        p.y += (dy / d) * Math.min(v, d);
        p.facing = Math.atan2(dy, dx);
      }
    }
    for (const p of [this.player, ...this.puppets]) {
      p.sprite.setPosition(p.x, p.y);
      if (p.alive) p.sprite.setRotation(p.facing);
    }
    // A staged firefight: enemies shoot near you.
    if (time < this.firefightUntil && time >= this.nextFirefightShot) {
      this.nextFirefightShot = time + 220;
      const shooter = this.puppets.find((p) => p.alive && p.role === 'enemy');
      if (shooter) {
        const tx = this.player.x + (Math.random() - 0.5) * 80;
        const ty = this.player.y + (Math.random() - 0.5) * 80;
        this.tracer(shooter.x, shooter.y, tx, ty);
        this.pending.push({
          kind: 'shotFired',
          tick: 0,
          by: shooter.id,
          fromX: shooter.x,
          fromY: shooter.y,
          angle: Math.atan2(ty - shooter.y, tx - shooter.x),
          hitX: tx,
          hitY: ty,
        });
      }
    }
    if (this.autoDemo && time >= this.nextAuto) {
      this.nextAuto = time + 2200 + Math.random() * 1600;
      this.demoTick();
    }
    // Barks.
    const view = this.view();
    const reqs = this.director.step({
      nowMs: time,
      view,
      liveId: LAB_PLAYER,
      aim,
      activeLines: this.speech.activeCount,
      isSpeaking: (id) => this.speech.isSpeaking(id),
    });
    for (const r of reqs) {
      const sp = this.find(r.speakerId);
      if (!sp) continue;
      const about = r.aboutId ? this.find(r.aboutId) : undefined;
      const text = fillVars(r.template, identityVars(identityOf(sp), about && identityOf(about)));
      this.speech.say(sp.id, text, {
        echo: sp.role === 'echo',
        ...(sp.role === 'enemy' ? { color: ENEMY_SPEECH_COLOR } : {}),
      });
    }
    this.speech.update(time, (id) => {
      const p = this.find(id);
      return p ? { x: p.x, y: p.y } : null;
    });
    this.signs.update(time, this.player, this.fired);
    this.fired = false;
    this.fx.clear();
    this.effects = this.effects.filter((e) => time < e.until);
    for (const e of this.effects) e.draw(this.fx, (time - e.start) / (e.until - e.start));
  }

  /** Is the director treating it as a fight right now? (for the panel) */
  get hot(): boolean {
    return this.director.isHot({
      nowMs: this.time.now,
      view: {
        soldiers: [{ id: LAB_PLAYER, x: this.player.x, y: this.player.y, alive: true }],
      } as unknown as WorldView,
      liveId: LAB_PLAYER,
      aim: null,
      activeLines: 0,
      isSpeaking: () => false,
    });
  }
}
