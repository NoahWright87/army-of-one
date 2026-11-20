/**
 * Entry point. Screens that don't need Phaser (`?screen=respawn`, the `?scene=editor` block
 * editor) load on their own;
 * everything else boots the game (main.ts).
 */
import { str } from '../content/strings';
import {
  installErrorHandling,
  reportFatalError,
  showLoading,
  watchForStall,
} from './runtime-errors';

installErrorHandling();
showLoading(str('loading.opening'));
const startup = watchForStall('application startup', 60_000);
const params = new URLSearchParams(window.location.search);

async function boot(): Promise<void> {
  if (params.get('scene') === 'campaign') {
    // (PHASE13-d) The campaign map: plain DOM, no Phaser.
    const m = await import('./campaign-main');
    await m.startCampaignMap(document.getElementById('ui-root') ?? document.body);
  } else if (params.get('scene') === 'world') {
    // (PHASE13-c) World map generator viewer: plain DOM, no Phaser.
    const m = await import('./world-main');
    await m.startWorldViewer(document.getElementById('ui-root') ?? document.body, params);
  } else if (params.get('scene') === 'editor') {
    // (PHASE13-a) Block editor: plain DOM, no Phaser.
    const m = await import('./editor-main');
    await m.startEditor(document.getElementById('ui-root') ?? document.body, params);
  } else if (params.get('screen') === 'respawn') {
    const m = await import('./respawn-dev');
    await m.startRespawnDevPage(params, document.getElementById('ui-root') ?? document.body);
  } else {
    const m = await import('./main');
    await m.appReady;
  }
}

void boot().then(
  () => {
    startup.stop();
    showLoading(null);
  },
  (error: unknown) => {
    startup.stop();
    reportFatalError(error);
  },
);
