/** Screen position of the battle's origin and its scale in CSS pixels per world unit. */
export interface BattleProjection {
  x: number;
  y: number;
  zoom: number;
}

export interface CampaignBattleFrame extends HTMLIFrameElement {
  campaign: {
    ready(projection: BattleProjection | null, resume: () => void): void;
    returnToMap(projection: BattleProjection | null, save?: Promise<void>): void;
    failed(): void;
  };
}

export function campaignFrame(): CampaignBattleFrame['campaign'] | undefined {
  return (window.frameElement as CampaignBattleFrame | null)?.campaign;
}
