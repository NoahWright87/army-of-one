import { BLOCK_TUNING, CAMPAIGN_CAMERA } from '../content/tuning';
import { worldLevelOrigin } from '../gen/region';
import type { WorldLevel } from '../gen/world';
import type { Vec2 } from '../sim/core/vec';
import type { CampaignView } from '../ui/campaign/campaign-view';
import type { BattleProjection } from './campaign-frame';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => n * n * (3 - 2 * n);

export function animate(element: HTMLElement, frames: Keyframe[], duration: number): Promise<void> {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) duration = 0;
  const animation = element.animate(frames, { duration, easing: 'ease-in-out', fill: 'forwards' });
  return animation.finished.then(() => {
    Object.assign(element.style, frames[frames.length - 1]);
    animation.cancel();
  });
}

export class CampaignFlight {
  private readonly layer = document.createElement('div');
  private readonly board: ReturnType<CampaignView['captureBoard']>;
  private removed = false;
  private projection: BattleProjection | null = null;

  constructor(view: CampaignView, host: HTMLElement) {
    this.board = view.captureBoard();
    const { terrain, annotated, rect } = this.board;
    this.layer.style.cssText =
      'position:fixed;inset:0;z-index:20;overflow:hidden;pointer-events:none;background:#0d1014';
    for (const image of [terrain, annotated]) {
      image.style.cssText = `position:absolute;left:0;top:0;width:${rect.width}px;height:${rect.height}px;transform-origin:0 0;image-rendering:pixelated;will-change:transform,opacity`;
      image.style.transform = `translate(${rect.left}px,${rect.top}px)`;
    }
    this.layer.append(terrain, annotated);
    host.append(this.layer);
  }

  register(projection: BattleProjection): void {
    this.projection = projection;
  }

  /**
   * Both renderers share one camera. The high-detail patch is the battle's already rendered
   * viewport, registered to the same world coordinates at every step of the flight.
   */
  move(
    level: WorldLevel,
    battle: HTMLIFrameElement,
    entering: boolean,
    entry?: Vec2,
  ): Promise<void> {
    const { terrain, annotated, rect, px, pad } = this.board;
    const origin = worldLevelOrigin(level);
    const estimatedScale = BLOCK_TUNING.cellSize / px;
    const originX = pad + origin.x * px;
    const originY = pad + origin.y * px;
    const centerX = innerWidth / 2;
    const centerY = innerHeight / 2;
    const fromX = centerX - rect.left;
    const fromY = centerY - rect.top;
    const estimatedX = pad + (entry?.x ?? level.box.x + level.box.w / 2) * px;
    const estimatedY = pad + (entry?.y ?? level.box.y + level.box.h / 2) * px;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = Math.max(
      CAMPAIGN_CAMERA.minFlightMs,
      Math.abs(Math.log2((this.projection?.zoom ?? 1) * estimatedScale)) *
        CAMPAIGN_CAMERA.msPerDoubling,
    );

    const paint = (progress: number, registration: number) => {
      const t = smooth(progress);
      const projection = this.projection;
      const finalScale = (projection?.zoom ?? 1) * estimatedScale;
      const scale = estimatedScale * (finalScale / estimatedScale) ** registration;
      const targetX = projection ? originX + (centerX - projection.x) / finalScale : estimatedX;
      const targetY = projection ? originY + (centerY - projection.y) / finalScale : estimatedY;
      const toX = estimatedX + (targetX - estimatedX) * registration;
      const toY = estimatedY + (targetY - estimatedY) * registration;
      const zoom = scale ** t;
      const left = centerX - (fromX + (toX - fromX) * t) * zoom;
      const top = centerY - (fromY + (toY - fromY) * t) * zoom;
      const transform = `translate(${left}px,${top}px) scale(${zoom})`;
      terrain.style.transform = transform;
      annotated.style.transform = transform;
      this.layer.style.opacity = String(smooth(clamp(progress / 0.12)));
      annotated.style.opacity = String(1 - smooth(clamp(progress / 0.38)));

      if (!projection) return;
      const detailScale = zoom / finalScale;
      const detailX = left + originX * zoom - projection.x * detailScale;
      const detailY = top + originY * zoom - projection.y * detailScale;
      // Use flight progress for the blend so even a wide replay view fully dissolves.
      const detail = smooth(clamp((progress - 0.43) / 0.51));
      const feather = 15 * (1 - smooth(clamp((progress - 0.72) / 0.28)));
      battle.style.transformOrigin = '0 0';
      battle.style.transform = `translate(${detailX}px,${detailY}px) scale(${detailScale})`;
      battle.style.opacity = String(detail);
      battle.style.maskImage =
        feather > 0
          ? `linear-gradient(90deg, transparent, black ${feather}%, black ${100 - feather}%, transparent), linear-gradient(transparent, black ${feather}%, black ${100 - feather}%, transparent)`
          : 'none';
      battle.style.maskComposite = 'intersect';
      const ui = battle.contentDocument?.getElementById('ui-root');
      if (ui) ui.style.opacity = String(smooth(clamp((progress - 0.89) / 0.11)));
    };

    return new Promise((resolve) => {
      let last = performance.now();
      let travelled = 0;
      let registration = entering ? 0 : 1;
      let speed = 1;
      paint(entering ? 0 : 1, registration);
      const tick = (now: number) => {
        if (this.removed) {
          resolve();
          return;
        }
        const dt = Math.min(50, Math.max(0, now - last));
        last = now;
        if (this.projection) {
          registration = reduced ? 1 : clamp(registration + dt / CAMPAIGN_CAMERA.registerMs);
        }
        // On a cold load, ease toward a shallower overview while the opening frame renders.
        // Once it arrives, ease back to the same cruising pace.
        const limit = this.projection ? 1 : CAMPAIGN_CAMERA.loadingProgress;
        const pace = this.projection ? 1 : clamp((limit - travelled) / 0.12);
        speed += (pace - speed) * (1 - Math.exp(-dt / CAMPAIGN_CAMERA.accelerationMs));
        travelled = reduced
          ? this.projection
            ? 1
            : 0
          : Math.min(limit, travelled + (dt / duration) * speed);
        paint(entering ? travelled : 1 - travelled, smooth(registration));
        if (travelled < 1) requestAnimationFrame(tick);
        else {
          battle.style.transform = '';
          battle.style.maskImage = '';
          const ui = battle.contentDocument?.getElementById('ui-root');
          if (ui) ui.style.opacity = '';
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  remove(): void {
    this.removed = true;
    this.layer.remove();
  }
}
