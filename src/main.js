import Phaser from "phaser";
import { io } from "socket.io-client";

// Connect to server
const socket = io();
socket.on("connect", () => {
  console.log("Connected with id:", socket.id);
  // We will emit 'raccoonJoined' from the GameScene once it's ready.
});

// Mobile detection function
function isOnMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) ||
            window.innerWidth <= 768;
}

// Colours
const colours = {
    ui: {
        sage: '#8BBC35',
        creamLight: '#ffefc8',
        charcoal: '#545454ff',
        blushPink: '#ffbec4'
    },
    world: {
        blue: '#6B8EB5',
        lightGrey: '#efe6d8',
        grey: '#b9b0a3',
        warmCream: '#F5E6C8'
    }

}

// Convert from hex string to hex number
function hs2hn(hs) {
    return Phaser.Display.Color.HexStringToColor(hs).color;
}

class MainMenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainMenuScene' });
    }

    preload() {
        this.load.image('background', 'assets/main_menu_bg.jpg');
        this.load.image('hearts', 'assets/hearts.png');
    }

    create(data) {
        // Show UI and reset elements
        document.getElementById('main-menu-ui-div').style.display = 'flex';
        const codeTextField = document.getElementById('code-text-field');
        const codeProceedButton = document.getElementById('code-proceed-button');
        const joinRandomButton = document.getElementById('join-random-button');
        const supportingTextElement = document.querySelector('.code-supporting-text');

        codeTextField.disabled = false;
        codeTextField.value = '';
        codeProceedButton.disabled = false;
        joinRandomButton.disabled = false;
        
        // If arriving from a game that ended, display the message
        if (data && data.endMessage) {
            supportingTextElement.textContent = data.endMessage;
            supportingTextElement.style.color = 'red';
        } else {
            supportingTextElement.textContent = '';
        }

        this.add.image(300, 400, 'background');

        const graphics = this.add.graphics();
        graphics.fillStyle(hs2hn(colours.ui.blushPink), 0.5); // Color and alpha
        graphics.fillRoundedRect(
            300 - (450 / 2), // x (centered)
            200 - (150 / 2), // y (centered)
            450, // width
            150, // height
            20 // border radius
        );
        this.add.text(300, 200, 'DeeWee', { fontSize: '128px', fill: colours.ui.sage, fontFamily: 'Roboto, sans-serif', fontStyle: 'bold' }).setOrigin(0.5);
        const text2 = this.add.text(540, 150, '(2)', { fontSize: '64px', fill: colours.ui.sage, fontFamily: 'Roboto, sans-serif', fontStyle: 'bold' }).setOrigin(0.5);
        text2.angle = -10;
        text2.alpha = 0.8;

        const hearts = this.add.image(300, 450, 'hearts');
        this.tweens.add({
            targets: hearts,
            y: 500,
            scale: 0.5,
            duration: 2500,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });

        // --- Event Listeners ---
        this.roomCode = null; // To store the joined room code

        this.inputHandler = () => {
            if (supportingTextElement && supportingTextElement.textContent !== "") {
                supportingTextElement.textContent = "";
                supportingTextElement.style.color = '';
            }
        };
        codeTextField.addEventListener('input', this.inputHandler);
        
        // This handler attempts to join a room and then waits
        this.proceedHandler = () => {
            const code = codeTextField.value.trim();
            if (!code) {
                if (supportingTextElement) {
                    supportingTextElement.textContent = 'Maybe try entering a room code first? 🤦';
                    supportingTextElement.style.color = 'red';
                }
                return;
            }
            
            socket.emit("joinRoom", code, (response) => {
                if (response && response.error) {
                    if (supportingTextElement) {
                        supportingTextElement.textContent = response.error;
                        supportingTextElement.style.color = 'red';
                    }
                } else if (response && response.joined) {
                    this.roomCode = code; // Store the room code for the scene transition
                    if (supportingTextElement) {
                        supportingTextElement.textContent = 'Waiting for Wee...';
                        supportingTextElement.style.color = colours.ui.sage;
                    }
                    // Disable inputs while waiting
                    codeTextField.disabled = true;
                    codeProceedButton.disabled = true;
                    joinRandomButton.disabled = true;
                }
            });
        };
        codeProceedButton.addEventListener('click', this.proceedHandler);

        this.joinRandomHandler = () => {
            socket.emit("joinRandom", (response) => {
                if (response && response.error) {
                    if (supportingTextElement) {
                        supportingTextElement.textContent = response.error;
                        supportingTextElement.style.color = 'red';
                    }
                } else if (response && response.joined) {
                    this.roomCode = "random"; // Use a placeholder to signify we are in a room.
                    if (supportingTextElement) {
                        supportingTextElement.textContent = 'Waiting for Wee...';
                        supportingTextElement.style.color = colours.ui.sage;
                    }
                    // Disable inputs while waiting
                    codeTextField.disabled = true;
                    codeProceedButton.disabled = true;
                    joinRandomButton.disabled = true;
                }
            });
        };
        joinRandomButton.addEventListener('click', this.joinRandomHandler);

        // This handler listens for the server's signal to start the game
        this.startGameListener = (allRaccoons) => {
            // The roomCode from the server isn't available on the client when joining randomly,
            // so we just check if we are in *any* room.
            if (this.roomCode) {
                console.log('Server sent startGame. Transitioning to GameScene.');
                // Pass the full player data which includes the definitive roomCode.
                this.scene.start('GameScene', { allRaccoons: allRaccoons });
            }
        };
        socket.on('startGame', this.startGameListener);

        // Set up the official shutdown event listener to clean up
        this.events.on('shutdown', () => {
            console.log('MainMenuScene shutdown event fired.');
            document.getElementById('main-menu-ui-div').style.display = 'none';
            // Clean up the DOM event listeners to prevent memory leaks
            codeProceedButton.removeEventListener('click', this.proceedHandler);
            codeTextField.removeEventListener('input', this.inputHandler);
            joinRandomButton.removeEventListener('click', this.joinRandomHandler);
            socket.off('startGame', this.startGameListener); // Important: clean up the start listener
        });
    }
}

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.joyStickData = null; // To hold joystick data
        this.isMapMode = false; // For map design mode
        this.otherRaccoons = {}; // To hold other player sprites
        this.coordsText = null; // For map mode coordinate display
        this.actionButton = null; // To hold the action button element
    }

    preload() {
        this.load.spritesheet('dee', 'assets/sprites/dee_sprite_sheet.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('wee', 'assets/sprites/wee_sprite_sheet.png', { frameWidth: 32, frameHeight: 32 });
        this.load.json('firstFloorData', 'assets/jsons/firstFloor.json');
    }

    create() {
        document.getElementById('game-controls-div').style.display = 'flex';
        this.actionButton = document.getElementById('action-button');
        this.cameras.main.setBackgroundColor(colours.world.lightGrey);

        // Set up world, grid, and animations (things that don't depend on player data)
        this.physics.world.setBounds(0, 0, 5000, 5000);
        const worldBorder = this.add.graphics();
        worldBorder.lineStyle(50, hs2hn(colours.world.blue), 1);
        worldBorder.strokeRect(0, 0, this.physics.world.bounds.width, this.physics.world.bounds.height);
        const gridLines = this.add.graphics();
        gridLines.lineStyle(1, hs2hn(colours.world.grey), 0.5);
        const worldWidth = this.physics.world.bounds.width;
        const worldHeight = this.physics.world.bounds.height;
        const gridSize = 64;
        for (let x = 0; x < worldWidth; x += gridSize) {
            gridLines.beginPath();
            gridLines.moveTo(x, 0);
            gridLines.lineTo(x, worldHeight);
            gridLines.strokePath();
        }
        for (let y = 0; y < worldHeight; y += gridSize) {
            gridLines.beginPath();
            gridLines.moveTo(0, y);
            gridLines.lineTo(worldWidth, y);
            gridLines.strokePath();
        }
        this.anims.create({ key: 'dee_idle', frames: this.anims.generateFrameNumbers('dee', { start: 0, end: 1 }), frameRate: 1, repeat: -1 });
        this.anims.create({ key: 'dee_walk', frames: this.anims.generateFrameNumbers('dee', { start: 2, end: 3 }), frameRate: 4, repeat: -1 });
        this.anims.create({ key: 'wee_idle', frames: this.anims.generateFrameNumbers('wee', { start: 0, end: 1 }), frameRate: 1, repeat: -1 });
        this.anims.create({ key: 'wee_walk', frames: this.anims.generateFrameNumbers('wee', { start: 2, end: 3 }), frameRate: 4, repeat: -1 });
        this.cursors = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });
        const gameControlsDiv = document.getElementById('game-controls-div');
        const gameControlsDivWidth = gameControlsDiv.clientWidth;
        const joystickSize = gameControlsDivWidth * 0.4;
        const joyStickOptions = { title: 'joystick', width: joystickSize, height: joystickSize, internalFillColor: colours.ui.creamLight, internalStrokeColor: colours.world.grey, externalStrokeColor: colours.world.grey, autoReturnToCenter: true };
        if (!this.joyStick) this.joyStick = new JoyStick('game-controls-div', joyStickOptions, (stickData) => { this.joyStickData = stickData; });
        this.mapModeKey = this.input.keyboard.addKey('M');

        // Coordinate display text for map mode
        this.coordsText = this.add.text(10, 10, 'X: 0\nY: 0', {
            font: '160px Arial',
            fill: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.6)'
        })
        .setDepth(100)      // Ensure it's on top of other game elements
        .setVisible(false); // Initially hidden

        // --- Multiplayer Logic ---
        const allRaccoons = this.sys.settings.data.allRaccoons;
        console.log('GameScene received allRaccoons:', allRaccoons);

        const floorData = this.cache.json.get('firstFloorData');
        const wallGroup = this.physics.add.staticGroup();
        floorData.walls.forEach(wallDef => {
            const wall = this.add.rectangle(wallDef.x, wallDef.y, wallDef.width, wallDef.height, hs2hn(colours.world.blue));
            wallGroup.add(wall);
        });

        allRaccoons.forEach(raccoon => {
            if (raccoon.id === socket.id) {
                // This is our raccoon. CREATE IT NOW at the correct spawn point.
                this.localRaccoon = this.physics.add.sprite(raccoon.x, raccoon.y, raccoon.character.toLowerCase());
                this.localRaccoon.setCollideWorldBounds(true);
                this.localRaccoon.setScale(3);

                // Now that the local raccoon exists, set up camera and colliders for it.
                this.physics.add.collider(this.localRaccoon, wallGroup);
                this.cameras.main.setBounds(0, 0, 5000, 5000);
                this.cameras.main.startFollow(this.localRaccoon, true, 0.1, 0.1);
            } else {
                // These are the other players already in the game.
                console.log('Creating existing raccoon:', raccoon.character);
                const otherRaccoon = this.physics.add.sprite(raccoon.x, raccoon.y, raccoon.character.toLowerCase());
                otherRaccoon.setScale(3);
                this.otherRaccoons[raccoon.id] = otherRaccoon;
            }
        });

        // Listen for another player joining after us
        socket.on('raccoonJoined', (newRaccoon) => {
            if (newRaccoon.id !== socket.id && !this.otherRaccoons[newRaccoon.id]) {
                console.log('Other raccoon joined:', newRaccoon.id);
                const otherRaccoon = this.physics.add.sprite(newRaccoon.x, newRaccoon.y, newRaccoon.character.toLowerCase());
                otherRaccoon.setScale(3);
                this.otherRaccoons[newRaccoon.id] = otherRaccoon;
            }
        });
        socket.on('raccoonMoved', (data) => {
            const otherRaccoon = this.otherRaccoons[data.id];
            if (otherRaccoon) {
                if (otherRaccoon.x > data.x) { otherRaccoon.flipX = true; }
                else if (otherRaccoon.x < data.x) { otherRaccoon.flipX = false; }

                this.tweens.add({
                    targets: otherRaccoon,
                    x: data.x,
                    y: data.y,
                    duration: 100,
                    ease: 'Linear'
                });

                const character = otherRaccoon.texture.key;
                otherRaccoon.anims.play(`${character}_walk`, true);
                if (otherRaccoon.moveTimer) { clearTimeout(otherRaccoon.moveTimer); }
                otherRaccoon.moveTimer = setTimeout(() => {
                    otherRaccoon.anims.play(`${character}_idle`, true);
                }, 200);
            }
        });
        socket.on('raccoonLeft', (id) => {
            console.log('Raccoon left:', id);
            if (this.otherRaccoons[id]) {
                this.otherRaccoons[id].destroy();
                delete this.otherRaccoons[id];
            }
        });

        // Listener for when the other player disconnects, ending the game
        this.gameEndedListener = (data) => {
            console.log('Game ended by server:', data.message);
            this.scene.start('MainMenuScene', { endMessage: data.message });
        };
        socket.on('gameEnded', this.gameEndedListener);

        // Clean up all scene-specific listeners on shutdown
        this.events.on('shutdown', () => {
            console.log('GameScene shutdown event fired.');
            document.getElementById('game-controls-div').style.display = 'none';
            socket.off('raccoonJoined');
            socket.off('raccoonMoved');
            socket.off('raccoonLeft');
            socket.off('gameEnded', this.gameEndedListener);
        });
    }

    update() {
        // Map Mode Toggle Logic
        if (Phaser.Input.Keyboard.JustDown(this.mapModeKey)) {
            this.isMapMode = !this.isMapMode;

            if (this.isMapMode) {
                // Enter map mode
                this.cameras.main.stopFollow();
                const world = this.physics.world.bounds;
                this.cameras.main.pan(world.centerX, world.centerY, 500, 'Sine.easeInOut');

                const zoomX = this.cameras.main.width / world.width;
                const zoomY = this.cameras.main.height / world.height;
                const zoomLevel = Math.min(zoomX, zoomY);

                this.cameras.main.zoomTo(zoomLevel, 500, 'Sine.easeInOut');
                this.localRaccoon.setVisible(false);
                this.coordsText.setVisible(true);
            } else {
                // Exit map mode
                this.cameras.main.startFollow(this.localRaccoon, true, 0.1, 0.1);
                this.cameras.main.zoomTo(1, 500, 'Sine.easeInOut');
                this.localRaccoon.setVisible(true);
                this.coordsText.setVisible(false);
            }
        }

        // Player Movement Logic
        if (this.localRaccoon) {
            if (this.isMapMode) {
                this.localRaccoon.setVelocity(0, 0);

                // Update coordinate display
                const pointer = this.input.activePointer;
                const worldX = Math.round(pointer.worldX);
                const worldY = Math.round(pointer.worldY);
                this.coordsText.setText(`X: ${worldX}\nY: ${worldY}`);
            } else {
                const speed = 500;
            
                let velocityX = 0;
                let velocityY = 0;
    
                // Joystick controls
                if (this.joyStickData) {
                    const joyX = parseFloat(this.joyStickData.x) / 100;
                    const joyY = parseFloat(this.joyStickData.y) / -100; // Invert Y for Phaser coords
    
                    if (Math.abs(joyX) > 0.1) velocityX = joyX;
                    if (Math.abs(joyY) > 0.1) velocityY = joyY;
                }
    
                // Keyboard controls (fallback)
                if (velocityX === 0 && velocityY === 0) {
                    if (this.cursors.left.isDown) velocityX = -1;
                    else if (this.cursors.right.isDown) velocityX = 1;
    
                    if (this.cursors.up.isDown) velocityY = -1;
                    else if (this.cursors.down.isDown) velocityY = 1;
                }
                
                // Flip sprite
                if (velocityX < -0.1) {
                    this.localRaccoon.flipX = true;
                } else if (velocityX > 0.1) {
                    this.localRaccoon.flipX = false;
                }
                
                // Movement
                const direction = new Phaser.Math.Vector2(velocityX, velocityY);
                if (direction.length() > 0) {
                    direction.normalize();
                }
                this.localRaccoon.setVelocity(direction.x * speed, direction.y * speed);
                
                // Animation
                const character = this.localRaccoon.texture.key;
                if (Math.abs(velocityX) > 0.1 || Math.abs(velocityY) > 0.1) {
                    this.localRaccoon.anims.play(`${character}_walk`, true);
                } else {
                    this.localRaccoon.anims.play(`${character}_idle`, true);
                }
            }
        }

        // Emit player movement
        if (this.localRaccoon && this.localRaccoon.body) {
            const x = this.localRaccoon.x;
            const y = this.localRaccoon.y;
            if (this.localRaccoon.oldPosition && (x !== this.localRaccoon.oldPosition.x || y !== this.localRaccoon.oldPosition.y)) {
                socket.emit('raccoonMove', { x, y });
            }
            this.localRaccoon.oldPosition = { x, y };
        }
    }
}

new Phaser.Game({
    type: Phaser.AUTO,
    width: 600,
    height: 800,
    scale: {
        mode: Phaser.Scale.FIT,
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 } // No gravity for top-down
        }
    },
  backgroundColor: colours.ui.creamLight,
  scene: [
    MainMenuScene,
    GameScene
  ]
});
