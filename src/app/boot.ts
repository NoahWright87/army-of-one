/**
 * Entry point. Dev screens that don't need Phaser (`?screen=respawn`) load on their own;
 * everything else boots the game (main.ts).
 */
const params = new URLSearchParams(window.location.search);

if (params.get('screen') === 'respawn') {
  void import('./respawn-dev').then((m) =>
    m.startRespawnDevPage(params, document.getElementById('ui-root') ?? document.body),
  );
} else {
  void import('./main');
}
