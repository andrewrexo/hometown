import { Boot } from './scenes/boot';
import { Game as GameScene } from './scenes/game';
import { MainMenu } from './scenes/main-menu';
import { AUTO, CANVAS, Game, WEBGL } from 'phaser';
import Preloader from './scenes/preloader';
import { NativeUI } from './scenes/native-ui';

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Phaser.Types.Core.GameConfig = {
	type: AUTO,
	width: 800,
	height: 600,
	parent: 'game-container',
	scale: {
		width: 800,
		height: 600,
		autoCenter: Phaser.Scale.CENTER_BOTH
	},
	zoom: 1.5,
	backgroundColor: '#000',
	scene: [Boot, Preloader, MainMenu, GameScene, NativeUI],
	render: {
		powerPreference: 'high-performance',
		pixelArt: true,
		roundPixels: true
	},
	input: {
		windowEvents: false
	},
	physics: {
		default: 'arcade',
		arcade: {
			gravity: { x: 0, y: 300 },
			debug: true
		}
	}
};

const StartGame = (parent: string) => {
	return new Game({ ...config, parent });
};

export default StartGame;
