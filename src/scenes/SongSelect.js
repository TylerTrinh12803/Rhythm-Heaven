// src/scenes/SongSelect.js
// Song select screen, Rhythm-Heaven style: a grid of game "cards".
// The song list + all card art paths live in src/songs.js.
// Best rank for each song is remembered (localStorage) and shown on its card.

import { SONGS } from '../songs.js';
import { RANKS } from './End.js';

export class SongSelect extends Phaser.Scene {
    constructor() {
        super('SongSelect');
    }

    preload() {
        // Menu music + SFX (your audio)
        this.load.audio('selectSfx', 'assets/select.mp3');
        this.load.audio('songSelectBgm', 'assets/selection.mp3');
        this.load.audio('soundsfx', 'assets/song.mp3');

        // [IMAGE] scrolling background + your dancing sprite
        this.load.image('introBg', 'assets/introbg.png');
        this.load.spritesheet('dance', 'assets/dance.png', { frameWidth: 800, frameHeight: 600 });

        // [IMAGE] buttons (your art)
        this.load.image('exitBtn', 'assets/Exit.png');
        this.load.image('startBtn', 'assets/Start.png');

        // Song preview audio + card art for every song in the registry
        SONGS.forEach(song => {
            this.load.audio('music_' + song.id, song.audio);
            this.load.image('card_' + song.id, song.card);   // [IMAGE - 240x180] set in songs.js
        });
    }

    create() {
        this.cameras.main.fadeIn(600, 0, 0, 0);
        this.popupOpen = false;
        this.currentPreview = null;

        // SFX
        this.buttonSfx = this.sound.add('selectSfx', { volume: 0.3 });
        this.buttonSfx2 = this.sound.add('soundsfx', { volume: 0.3 });

        // BGM
        this.bgm = this.sound.add('songSelectBgm', { loop: true, volume: 0 });
        this.bgm.play();
        this.tweens.add({ targets: this.bgm, volume: 0.4, duration: 1000 });

        // Scrolling background (your art)
        this.bg = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'introBg').setOrigin(0);

        // Your dancing character, faded behind the cards
        this.anims.exists('danceAnim') || this.anims.create({
            key: 'danceAnim',
            frames: this.anims.generateFrameNumbers('dance', { start: 0, end: 9 }),
            frameRate: 6,
            repeat: -1
        });
        this.add.sprite(this.scale.width / 2, this.scale.height / 2, 'dance')
            .play('danceAnim').setAlpha(0.35).setDepth(1);

        // Title
        this.add.text(this.scale.width / 2, 42, 'Select a Song', {
            fontSize: '44px', color: '#000000', stroke: '#ffffff', strokeThickness: 6
        }).setOrigin(0.5).setDepth(5);

        // Online PVP mode (up to 5 players race on the same song)
        const pvpBtn = this.add.text(this.scale.width - 20, 20, 'PVP!', {
            fontSize: '26px', color: '#ffffff', backgroundColor: '#845ef7',
            padding: { x: 14, y: 8 }
        }).setOrigin(1, 0).setDepth(6).setInteractive();
        pvpBtn.on('pointerover', () => pvpBtn.setScale(1.08));
        pvpBtn.on('pointerout', () => pvpBtn.setScale(1));
        pvpBtn.on('pointerdown', () => {
            if (this.popupOpen) return;
            this.buttonSfx.play();
            this.stopPreview();
            this.tweens.add({ targets: this.bgm, volume: 0, duration: 400, onComplete: () => this.bgm.stop() });
            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('PvpLobby'));
        });

        // ---- Card grid (2 columns up to 4 songs, 3 columns beyond) ----
        const cols = SONGS.length <= 4 ? 2 : 3;
        const cardScale = SONGS.length <= 4 ? 1 : 0.72;
        const cardW = 240 * cardScale, cardH = 180 * cardScale;
        const gapX = SONGS.length <= 4 ? 60 : 36, gapY = SONGS.length <= 4 ? 64 : 52;
        const gridW = cols * cardW + (cols - 1) * gapX;
        const startX = (this.scale.width - gridW) / 2 + cardW / 2;
        const startY = SONGS.length <= 4 ? 170 : 160;

        SONGS.forEach((song, i) => {
            const col = i % cols, row = Math.floor(i / cols);
            const x = startX + col * (cardW + gapX);
            const y = startY + row * (cardH + gapY);

            const card = this.add.image(x, y, 'card_' + song.id).setScale(cardScale).setDepth(5).setInteractive();
            const nameText = this.add.text(x, y + cardH / 2 + 12, song.name, {
                fontSize: SONGS.length <= 4 ? '24px' : '19px',
                color: '#000000', stroke: '#ffffff', strokeThickness: 5
            }).setOrigin(0.5).setDepth(5);

            // If this song has been finished on this device, show the rank it
            // earned (Try Again... / OK / Perfect! / SUPERB!!) on the title,
            // plus the best score % in the card corner. (localStorage)
            try {
                const best = localStorage.getItem('bestRank_' + song.id);
                const bestScore = localStorage.getItem('bestScore_' + song.id);
                if (best !== null && RANKS[best]) {
                    this.add.text(x, y + cardH / 2 + 31, RANKS[best].name, {
                        fontSize: '15px', color: RANKS[best].color,
                        stroke: '#000000', strokeThickness: 4
                    }).setOrigin(0.5).setDepth(5);
                }
                if (bestScore !== null) {
                    this.add.text(x - cardW / 2 + 6, y + cardH / 2 - 6, bestScore + '%', {
                        fontSize: '16px', color: '#ffe066',
                        backgroundColor: '#000000', padding: { x: 5, y: 2 }
                    }).setOrigin(0, 1).setDepth(6);
                }
            } catch (e) { /* storage unavailable - no badges */ }

            card.on('pointerover', () => { card.setScale(cardScale * 1.06); nameText.setScale(1.06); });
            card.on('pointerout', () => { card.setScale(cardScale); nameText.setScale(1); });
            card.on('pointerdown', () => {
                if (this.popupOpen) return;
                this.buttonSfx2.play();
                this.tweens.add({ targets: this.bgm, volume: 0, duration: 600, onComplete: () => this.bgm.pause() });
                this.showConfirmPopup(song);
            });
        });

        // Back to title
        const exitBtn = this.add.image(60, this.scale.height - 40, 'exitBtn')
            .setOrigin(0.5).setScale(1.5).setInteractive().setDepth(5);
        exitBtn.on('pointerover', () => exitBtn.setScale(1.6));
        exitBtn.on('pointerout', () => exitBtn.setScale(1.5));
        exitBtn.on('pointerdown', () => {
            if (this.popupOpen) return;
            this.buttonSfx.play();
            this.stopPreview();
            this.tweens.add({
                targets: this.bgm, volume: 0, duration: 600,
                onComplete: () => {
                    this.bgm.stop();
                    this.cameras.main.fadeOut(600, 0, 0, 0);
                    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Start'));
                }
            });
        });

        this.bgScrollX = 0.3;
        this.bgScrollY = 0.2;
    }

    update() {
        if (this.bg) {
            this.bg.tilePositionX += this.bgScrollX;
            this.bg.tilePositionY += this.bgScrollY;
        }
    }

    stopPreview() {
        if (this.currentPreview) {
            this.currentPreview.stop();
            this.currentPreview.destroy();
            this.currentPreview = null;
        }
    }

    showConfirmPopup(song) {
        this.popupOpen = true;

        // Preview the song quietly while the popup is open
        this.stopPreview();
        this.currentPreview = this.sound.add('music_' + song.id, { volume: 0, loop: true });
        this.currentPreview.play();
        this.tweens.add({ targets: this.currentPreview, volume: 0.5, duration: 400 });

        const cx = this.scale.width / 2, cy = this.scale.height / 2;
        const parts = [];
        parts.push(this.add.rectangle(cx, cy, 520, 320, 0x000000, 0.85).setDepth(10));
        parts.push(this.add.image(cx, cy - 60, 'card_' + song.id).setScale(0.7).setDepth(11));
        parts.push(this.add.text(cx, cy + 30, `Start "${song.name}"?`,
            { fontSize: '28px', color: '#ffffff' }).setOrigin(0.5).setDepth(11));

        const startBtn = this.add.image(cx, cy + 95, 'startBtn').setScale(1.5).setInteractive().setDepth(11);
        const closeBtn = this.add.text(cx + 235, cy - 140, 'X',
            { fontSize: '32px', color: '#ff5555', backgroundColor: '#000000', padding: { x: 8, y: 4 } })
            .setOrigin(0.5).setInteractive().setDepth(11);
        parts.push(startBtn, closeBtn);

        const closePopup = () => {
            this.popupOpen = false;
            this.stopPreview();
            parts.forEach(p => p.destroy());
        };

        closeBtn.on('pointerdown', () => {
            this.buttonSfx2.play();
            closePopup();
            this.bgm.resume();
            this.tweens.add({ targets: this.bgm, volume: 0.4, duration: 800 });
        });

        startBtn.on('pointerover', () => startBtn.setScale(1.6));
        startBtn.on('pointerout', () => startBtn.setScale(1.5));
        startBtn.on('pointerdown', () => {
            this.buttonSfx.play();
            closePopup();
            this.bgm.stop();
            this.cameras.main.fadeOut(700, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('Game', { songId: song.id });
            });
        });
    }
}
