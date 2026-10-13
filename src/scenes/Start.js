// src/scenes/Start.js  (title screen - mostly your original code)
export class Start extends Phaser.Scene {
    constructor() {
        super('Start');
    }

    preload() {
        // Images (your art)
        this.load.image('title', 'assets/title.png');       // [IMAGE] title logo
        this.load.image('startBtn', 'assets/Start.png');    // [IMAGE] start button
        this.load.image('menuBg', 'assets/introbg.png');    // [IMAGE] scrolling bg

        // Audio
        this.load.audio('menuMusic', 'assets/intro.mp3');
        this.load.audio('buttonSfx', 'assets/select.mp3');

        // Dogfight animation (your art)
        this.load.spritesheet('dogfight', 'assets/dogfight.png', {
            frameWidth: 800,
            frameHeight: 600
        });
    }

    create() {
        // --- Background setup ---
        this.menuBg = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'menuBg')
            .setOrigin(0);

        this.bgAnim = this.add.sprite(this.scale.width / 2, this.scale.height / 2, 'dogfight')
            .setOrigin(0.5);

        if (!this.anims.exists('dogfightLoop')) {
            this.anims.create({
                key: 'dogfightLoop',
                frames: this.anims.generateFrameNumbers('dogfight', { start: 0, end: 53 }),
                frameRate: 6,
                repeat: -1
            });
        }
        this.bgAnim.play('dogfightLoop');

        // --- Music & SFX ---
        // On phones the browser blocks audio until the first touch. Phaser
        // unlocks automatically on the first tap - we just (re)start the music
        // then, and show a small hint until it happens.
        this.menuMusic = this.sound.add('menuMusic', { loop: true, volume: 0.5 });
        if (this.sound.locked) {
            const hint = this.add.text(this.scale.width / 2, this.scale.height - 24,
                'tap anywhere for sound', { fontSize: '18px', color: '#000000' })
                .setOrigin(0.5).setAlpha(0.7);
            this.sound.once('unlocked', () => {
                hint.destroy();
                if (!this.menuMusic.isPlaying) this.menuMusic.play();
            });
        } else {
            this.menuMusic.play();
        }
        this.buttonSfx = this.sound.add('buttonSfx', { volume: 0.2 });

        // --- Title float animation ---
        // title.png is 1280x720 - scale it down so the logo fits the 800x600 screen
        this.title = this.add.image(this.scale.width / 2, 175, 'title')
            .setOrigin(0.5)
            .setDisplaySize(720, 405);
        this.titleOriginalY = this.title.y;
        this.titleFloatAmplitude = 10;
        this.titleFloatSpeed = 2;

        // --- Start button ---
        const startBtn = this.add.image(this.scale.width / 2, this.scale.height * 0.75, 'startBtn')
            .setOrigin(0.5)
            .setInteractive()
            .setScale(1.5);
        startBtn.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

        startBtn.on('pointerdown', () => {
            this.buttonSfx.play();
            this.tweens.add({
                targets: this.menuMusic,
                volume: 0,
                duration: 800,
                onComplete: () => {
                    this.menuMusic.stop();
                    this.cameras.main.fadeOut(800, 0, 0, 0);
                    this.cameras.main.once('camerafadeoutcomplete', () => {
                        this.scene.start('SongSelect');
                    });
                }
            });
        });
        startBtn.on('pointerover', () => startBtn.setScale(1.6));
        startBtn.on('pointerout', () => startBtn.setScale(1.5));

        // Background scroll speed
        this.bgScrollX = 0.3;
        this.bgScrollY = 0.2;
    }

    update(time) {
        if (this.title) {
            this.title.y = this.titleOriginalY +
                this.titleFloatAmplitude * Math.sin((time / 500) * this.titleFloatSpeed);
        }
        if (this.menuBg) {
            this.menuBg.tilePositionX += this.bgScrollX;
            this.menuBg.tilePositionY += this.bgScrollY;
        }
    }
}
