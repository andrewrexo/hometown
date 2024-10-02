import { EventBus } from '../event-bus';
import { Scene } from 'phaser';
import { MapRenderer } from '../render/map';
import { centerX as scaleCenterX, centerY as scaleCenterY } from '../scale';
import { PlayerSprite } from '../entities/player-sprite';
import { NPC } from '../entities/npc';
import { action } from '../../components/ui/main/action.svelte';
import type { NativeUI } from './native-ui';

export class Game extends Scene {
	map!: MapRenderer; // Add the '!' to fix the initialization error
	cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	player!: PlayerSprite;
	currentPath: { x: number; y: number }[] = [];
	private attackKey!: Phaser.Input.Keyboard.Key;
	private pendingDestination: { x: number; y: number } | null = null;
	private keyPressStartTime: number = 0;
	private keyPressThreshold: number = 80; // milliseconds
	private mapToggled: boolean = false;
	public npcs: NPC[] = [];
	public players: PlayerSprite[] = [];
	public minimapObjectLayer!: Phaser.GameObjects.Container;
	public minimapCamera!: Phaser.Cameras.Scene2D.Camera;
	private inputEnabled: boolean = true;
	private isAttackKeyDown: boolean = false;
	private lastAttackTime: number = 0;
	private contextMenu: Phaser.GameObjects.DOMElement | null = null;
	private lastUpdate: number = 0;
	private frameTime: number = 0;
	private fixedUpdateRate: number = 1000 / 60; // Fixed update rate for 60 FPS
	private accumulatedTime: number = 0;
	private minimapShape!: Phaser.GameObjects.Shape;
	private minimapMask!: Phaser.Display.Masks.GeometryMask;

	constructor() {
		super('Game');
	}

	create() {
		// Create and initialize the map
		this.map = new MapRenderer(this, 0, 0);
		this.map.create();

		const mapWidth = this.map.mapWidth;
		const mapHeight = this.map.mapHeight;
		// const centerTileX = Math.floor(mapWidth / 2) - 1;
		// const centerTileY = Math.floor(mapHeight / 2) - 1;
		const centerTileX = 4;
		const centerTileY = 3;

		const startPos = this.map.layer.getTileAt(centerTileX, centerTileY);
		const username = 'shrube'; // Replace with actual username retrieval

		this.player = this.createPlayer(startPos.x, startPos.y, username);
		this.player.faceDirection('left', { update: true });

		// Adjust the player's initial position to be centered on the tile
		this.player.setPosition(startPos.pixelX, startPos.pixelY - this.player.offsetY);
		this.player.setDepth(this.player.tileY + 1);

		// Update player's tile coordinates
		this.player.tileX = centerTileX;
		this.player.tileY = centerTileY;

		this.cameras.main.setZoom(1);
		this.cameras.main.startFollow(this.player, false, 1, 1);
		this.cameras.main.setRoundPixels(true);
		this.cameras.main.fadeIn(500, 0, 0, 0);

		// Render UI
		this.scene.launch('NativeUI');

		this.cursors = this.input.keyboard!.createCursorKeys();
		this.input.setPollOnMove();
		this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

		this.map.on('tileclick', this.handleTileClick, this);
		this.map.on('interactableclick', this.handleInteractableClick, this);
		this.map.on(
			'contextmenu',
			(this.game.scene.getScene('NativeUI') as NativeUI)!.handleContextMenu,
			this
		);

		EventBus.emit('current-scene-ready', this);
		EventBus.on('chatbox:send', this.sendMessage.bind(this));
		EventBus.on('refreshScene', this.reloadScene.bind(this), this);
		EventBus.on('minimap:toggle', this.toggleMinimap.bind(this), this);

		this.createNPC('mage', 2, 2, 'Mage');
		this.addMinimap();
	}

	toggleMinimap() {
		if (this.mapToggled) {
			this.cameras.remove(this.minimapCamera, false);
			this.mapToggled = false;
		} else {
			this.cameras.addExisting(this.minimapCamera, false);
			this.mapToggled = true;
		}
	}

	alignMinimapToPlayer() {}

	addMinimap() {
		this.minimapObjectLayer = this.add.container(0, 0);
		this.minimapObjectLayer.setDepth(1);
		this.cameras.main.ignore(this.minimapObjectLayer);

		this.minimapCamera = this.cameras.add(640, 50, 150, 150, false, 'minimap');
		this.minimapCamera.startFollow(this.player, true);
		this.minimapCamera.setZoom(0.2);
		this.minimapCamera.fadeIn(500, 0, 0, 0);

		// Create a circular mask for the minimap
		this.minimapShape = this.add.circle(0, 0, 350, 0x242933, 0.9);
		this.minimapMask = this.minimapShape.createGeometryMask();
		this.minimapObjectLayer.setMask(this.minimapMask);
		this.cameras.main.ignore(this.minimapShape);

		this.map.initMinimap();

		this.npcs.forEach((npc) => {
			this.minimapObjectLayer.add(npc.mapIcon);
			this.minimapCamera.ignore(npc);
		});

		this.minimapObjectLayer.add(this.player.mapIcon);
		this.minimapObjectLayer.bringToTop(this.player.mapIcon);

		this.cameras.main.ignore(this.minimapObjectLayer);
		this.cameras.remove(this.minimapCamera, false);

		this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
			if (!p.isDown) return;

			// Check if the cursor is within the minimap bounds
			if (
				p.x >= this.minimapCamera.x &&
				p.x <= this.minimapCamera.x + this.minimapCamera.width &&
				p.y >= this.minimapCamera.y &&
				p.y <= this.minimapCamera.y + this.minimapCamera.height
			) {
				this.minimapCamera.x += p.x - p.prevPosition.x;
				this.minimapCamera.y += p.y - p.prevPosition.y;
			}
		});
	}

	reloadScene() {
		this.scene.restart();
	}

	updateActionText = (actionName: string, actionDescription: string) => {
		action.action = { action: actionName, text: actionDescription };
	};

	onWindowFocus() {
		this.cursors = this.input.keyboard!.createCursorKeys();
		this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
	}

	onWindowBlur() {
		// Remove active keydown events when the window loses focus
		// this.input.keyboard?.resetKeys();
	}

	createNPC(spriteKey: string, tileX: number, tileY: number, name: string) {
		const npc = new NPC(this, spriteKey, tileX, tileY, name, this.map);
		this.npcs.push(npc);
		this.map.addEntity(npc, tileX, tileY);
		return npc;
	}

	createPlayer(tileX: number, tileY: number, name: string) {
		const player = new PlayerSprite(this, tileX, tileY, name, this.map.tileHeight);
		this.players.push(player);
		this.map.addEntity(player, tileX, tileY);
		return player;
	}

	update(time: number, delta: number) {
		this.accumulatedTime += delta;

		while (this.accumulatedTime >= this.fixedUpdateRate) {
			this.accumulatedTime -= this.fixedUpdateRate;

			if (this.inputEnabled) {
				this.player.update();
				this.handlePlayerInput(time * 1);
			}

			this.updatePlayerMovement();

			if (!this.player.isMoving) {
				this.movePlayerAlongPath();
			}

			if (
				this.map.activeTile &&
				this.map.activeTile.x === this.player.tileX &&
				this.map.activeTile.y === this.player.tileY
			) {
				this.map.emit('navigationend');
			}

			if (this.minimapShape.x !== this.player.x && this.minimapShape.y !== this.player.y) {
				this.minimapShape.setPosition(this.player.x, this.player.y);
			}

			this.npcs.forEach((npc) => npc.update());
		}
	}

	handleInteractableClick = ({ npc, tile }: { npc: NPC; tile: { x: number; y: number } }) => {
		console.log('Interactable clicked:', tile);

		const closestTile = this.findClosestTile(tile);

		if (this.player.isMoving) {
			console.log('Player is moving, setting pending destination');
			this.pendingDestination = { x: closestTile.x, y: closestTile.y };
			return;
		}

		this.setNewDestination(closestTile);
	};

	findClosestTile = (tile: { x: number; y: number }) => {
		const { x, y } = tile;

		return { x, y };
	};

	handleTileClick = (tile: { x: number; y: number }) => {
		console.log('Tile clicked:', tile);

		if (this.contextMenu) {
			this.contextMenu.setVisible(false);
		}

		if (this.player.isMoving) {
			console.log('Player is moving, setting pending destination');
			this.pendingDestination = { x: tile.x, y: tile.y };
			return;
		}

		this.setNewDestination(tile);
	};

	setNewDestination(tile: { x: number; y: number }) {
		const startX = this.player.tileX;
		const startY = this.player.tileY;
		const endX = tile.x;
		const endY = tile.y;

		const path = this.map.findPath(startX, startY, endX, endY);

		console.log('Path found:', path);
		if (path.length > 1) {
			this.currentPath = path.slice(1); // Remove the first element (current position)
			console.log('Setting current path:', this.currentPath);
		} else {
			console.log('No valid path found');
		}
	}

	movePlayerAlongPath() {
		if (this.currentPath.length > 0 && !this.player.isMoving) {
			const nextTile = this.currentPath[0];
			console.log('Moving to next tile:', nextTile);
			const dx = Math.floor(nextTile.x - this.player.tileX);
			const dy = Math.floor(nextTile.y - this.player.tileY);
			this.player.startMovement(dx, dy);
			this.currentPath.shift();
		}
	}

	handlePlayerInput(fixedTime: number) {
		if (!this.inputEnabled || this.player.isMoving || this.currentPath.length > 0) return;

		let dx = 0;
		let dy = 0;
		let keyPressed = false;

		if (this.cursors.left.isDown) {
			dx = -1;
			keyPressed = true;
		} else if (this.cursors.right.isDown) {
			dx = 1;
			keyPressed = true;
		} else if (this.cursors.up.isDown) {
			dy = -1;
			keyPressed = true;
		} else if (this.cursors.down.isDown) {
			dy = 1;
			keyPressed = true;
		}

		if (keyPressed) {
			if (this.keyPressStartTime === 0) {
				this.keyPressStartTime = fixedTime;
			}

			const keyPressDuration = fixedTime - this.keyPressStartTime;
			const direction = dx === -1 ? 'left' : dx === 1 ? 'right' : dy === -1 ? 'up' : 'down';

			if (keyPressDuration >= this.keyPressThreshold) {
				// Key held long enough, initiate movement
				const targetTileX = this.player.tileX + dx;
				const targetTileY = this.player.tileY + dy;
				if (this.map.isValidTile(targetTileX, targetTileY)) {
					this.player.startMovement(dx, dy);
				}
			} else if (keyPressDuration && this.player.direction != direction) {
				this.player.faceDirection(direction, { update: true });
			}
		} else {
			// No key pressed, reset the start time
			this.keyPressStartTime = 0;
		}
	}

	updatePlayerMovement() {
		if (!this.player.isMoving) {
			if (!this.player.isAttacking && !this.player.isIdling) {
				this.player.isIdling = true;
				this.player.playIdleAnimation();
			}
			return;
		}

		this.player.updateMovement(this.map.tileWidth);

		const startPos = this.map.getTilePosition(this.player.tileX, this.player.tileY);
		const endPos = this.map.getTilePosition(this.player.targetTileX, this.player.targetTileY);
		const progress = this.player.movementProgress / this.map.tileWidth;

		this.player.x = Math.round(startPos.x + (endPos.x - startPos.x) * progress);
		this.player.y = Math.round(
			startPos.y + (endPos.y - startPos.y) * progress - this.player.offsetY
		);

		if (!this.player.isMoving) {
			// Check for pending destination after movement is complete
			if (this.pendingDestination) {
				console.log('Processing pending destination after movement');
				const newDestination = this.pendingDestination;
				this.pendingDestination = null;
				this.setNewDestination(newDestination);
			}
		}
	}

	sendMessage(message: string) {
		this.player.showChatBubble(message);
	}

	changeScene() {
		this.scene.start('MainMenu');
	}

	centerX() {
		return scaleCenterX(this.scale);
	}

	centerY() {
		return scaleCenterY(this.scale);
	}

	destroy() {
		EventBus.off('tile-clicked', this.handleTileClick, this);
		// ... other cleanup code ...
		window.removeEventListener('focus', this.onWindowFocus);
		window.removeEventListener('blur', this.onWindowBlur);
	}

	handleShooting() {
		const currentTime = this.time.now;
		if (this.attackKey.isDown) {
			if (currentTime - this.lastAttackTime >= this.player.attackCooldown) {
				this.player.attack();
			}
		}
	}
}
