import Phaser from 'phaser';
import { BattleScene } from '../render/phaser/battle-scene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#111418',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [BattleScene],
});
