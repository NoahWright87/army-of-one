/**
 * Entry point. Screens that don't need Phaser (`?screen=respawn`, the `?scene=editor` block
 * editor) load on their own;
 * everything else boots the game (main.ts).
 */
const params = new URLSearchParams(window.location.search);

if (params.get('scene') === 'world') {
  // (PHASE13-c) World map generator viewer: plain DOM, no Phaser.
  void import('./world-main').then((m) =>
    m.startWorldViewer(document.getElementById('ui-root') ?? document.body, params),
  );
} else if (params.get('scene') === 'editor') {
  // (PHASE13-a) Block editor: plain DOM, no Phaser.
  void import('./editor-main').then((m) =>
    m.startEditor(document.getElementById('ui-root') ?? document.body),
  );
} else if (params.get('screen') === 'respawn') {
  void import('./respawn-dev').then((m) =>
    m.startRespawnDevPage(params, document.getElementById('ui-root') ?? document.body),
  );
} else {
  void import('./main');
}
