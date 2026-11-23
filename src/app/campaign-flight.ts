import { BLOCK_TUNING, CAMPAIGN_CAMERA } from '../content/tuning';
import { worldLevelOrigin } from '../gen/region';
import type { WorldLevel } from '../gen/world';
import type { CampaignView } from '../ui/campaign/campaign-view';

import type { BattleProjection } from './campaign-frame';

const FULL = 'inset(0px 0px 0px 0px)';

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
  private readonly image: HTMLCanvasElement;
  private readonly board: ReturnType<CampaignView['captureBoard']>;
  private readonly mapView: Keyframe;
  private readonly approach: Keyframe;
  private readonly clip: string;

  constructor(view: CampaignView, level: WorldLevel, host: HTMLElement) {
    this.board = view.captureBoard();
    const { image, rect, stage, px, pad } = this.board;
    this.image = image;
    this.clip = `inset(${Math.max(0, stage.top)}px ${Math.max(0, innerWidth - stage.right)}px ${Math.max(0, innerHeight - stage.bottom)}px ${Math.max(0, stage.left)}px)`;
    this.layer.style.cssText =
      'position:fixed;inset:0;z-index:20;overflow:hidden;pointer-events:none;background:#111418';
    image.style.cssText = `position:absolute;left:0;top:0;width:${rect.width}px;height:${rect.height}px;transform-origin:0 0;image-rendering:pixelated`;
    this.mapView = { transform: this.transform(rect.left, rect.top, 1) };
    const { x, y, w, h } = level.box;
    const scale = Math.max(1, Math.min(innerWidth / (px * w), innerHeight / (px * h)));
    this.approach = {
      transform: this.transform(
        innerWidth / 2 - (pad + (x + w / 2) * px) * scale,
        innerHeight / 2 - (pad + (y + h / 2) * px) * scale,
        scale,
      ),
    };
    this.place(this.mapView, this.clip);
    this.layer.append(image);
    host.append(this.layer);
  }

  flyIn(): Promise<unknown> {
    return this.move(this.mapView, this.approach, this.clip, FULL, CAMPAIGN_CAMERA.approachMs);
  }

  land(level: WorldLevel, projection: BattleProjection): Promise<unknown> {
    return this.move(
      this.approach,
      this.battleView(level, projection),
      FULL,
      FULL,
      CAMPAIGN_CAMERA.handoffMs,
    );
  }

  align(level: WorldLevel, projection: BattleProjection | null): void {
    this.place(projection ? this.battleView(level, projection) : this.approach, FULL);
  }

  flyOut(): Promise<unknown> {
    return this.move(
      { transform: this.image.style.transform },
      this.mapView,
      FULL,
      this.clip,
      CAMPAIGN_CAMERA.pullbackMs,
    );
  }

  remove(): void {
    this.layer.remove();
  }

  private battleView(level: WorldLevel, projection: BattleProjection): Keyframe {
    const { px, pad } = this.board;
    const origin = worldLevelOrigin(level);
    const scale = (projection.zoom * BLOCK_TUNING.cellSize) / px;
    return {
      transform: this.transform(
        projection.x - (pad + origin.x * px) * scale,
        projection.y - (pad + origin.y * px) * scale,
        scale,
      ),
    };
  }

  private transform(x: number, y: number, scale: number): string {
    return `translate(${x}px, ${y}px) scale(${scale})`;
  }

  private place(frame: Keyframe, clip: string): void {
    Object.assign(this.image.style, frame);
    this.layer.style.clipPath = clip;
  }

  private move(from: Keyframe, to: Keyframe, clipFrom: string, clipTo: string, ms: number) {
    return Promise.all([
      animate(this.image, [from, to], ms),
      animate(this.layer, [{ clipPath: clipFrom }, { clipPath: clipTo }], ms),
    ]);
  }
}
