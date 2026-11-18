/** Shared decorative panel treatment; controls/text remain native DOM. */
import { assetUrl } from '../render/assets/asset-urls';

export function paintedPanelCss(selector: string): string {
  return `${selector} { border: 10px solid transparent; border-image-source: url("${assetUrl('ui_panel')}"); border-image-slice: 40 fill; border-image-width: 10px; border-image-repeat: stretch; background-color: #111719; box-shadow: 0 5px 18px rgba(0,0,0,.3); }`;
}
export function tabletopBackground(key: 'ui_title_background' | 'ui_campaign_background'): string {
  return `linear-gradient(rgba(5,9,10,.3),rgba(5,9,10,.55)),url("${assetUrl(key)}") center / cover no-repeat`;
}
