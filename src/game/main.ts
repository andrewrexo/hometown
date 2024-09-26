import { Boot } from './scenes/boot';
import { Game as GameScene } from './scenes/game';
import { AUTO } from 'phaser';
import Preloader from './scenes/preloader';
import { NativeUI } from './scenes/native-ui';

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Phaser.Types.Core.GameConfig = {
	type: AUTO,
	width: 800,
	height: 600,
	parent: 'app',
	scale: {
		width: 800,
		height: 600,
		autoCenter: Phaser.Scale.CENTER_BOTH,
		autoRound: true
	},
	dom: {
		createContainer: true
	},
	zoom: 1,
	disableContextMenu: true,
	backgroundColor: '#000',
	scene: [Boot, Preloader, GameScene, NativeUI],
	render: {
		powerPreference: 'high-performance',
		pixelArt: true
	},
	input: {
		windowEvents: false
	}
};

export default config;
