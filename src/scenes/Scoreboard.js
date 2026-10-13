// src/scenes/Scoreboard.js
// Shown after the results screen: tap on the End screen brings you here.
//   1. If you just set a score, you're asked for a nickname (duplicate
//      nicknames are rejected - first device to use a name owns it).
//   2. The TOP 5 for the song is shown (your entry highlighted).
//   3. Tap anywhere -> back to Song Select.
// The rank's end-credit music keeps playing through this screen.

import { getSong } from '../songs.js';
import { claimName, submitScore, topScores, getSavedName, nameKey, isGlobal } from '../scoreboard.js';
import { promptText } from '../overlay.js';

export class Scoreboard extends Phaser.Scene {
    constructor() {
        super('Scoreboard');
    }

    init(data) {
        this.songId = data.songId;
        this.song = getSong(this.songId) || { name: this.songId };
        this.score = data.score;          // % from the run just played (undefined if just browsing)
        this.canLeave = false;
        this.myKey = null;
    }

    create() {
        this.cameras.main.setBackgroundColor(0x14122a);
        this.cameras.main.fadeIn(400, 0, 0, 0);

        this.add.text(400, 60, 'TOP 5', {
            fontSize: '52px', color: '#ffe066', stroke: '#000000', strokeThickness: 8
        }).setOrigin(0.5);
        this.add.text(400, 110, this.song.name, {
            fontSize: '28px', color: '#ffffff', stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5);
        if (!isGlobal()) {
            this.add.text(400, 142, '(scores on this device)', {
                fontSize: '15px', color: '#8888aa'
            }).setOrigin(0.5);
        }

        this.rowsContainer = this.add.container(0, 0);
        this.statusText = this.add.text(400, 320, 'Loading scores...', {
            fontSize: '22px', color: '#aaaacc'
        }).setOrigin(0.5);

        this.continueText = this.add.text(400, 560, '', {
            fontSize: '22px', color: '#ffffff', stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5);

        this.input.on('pointerdown', () => {
            if (!this.canLeave) return;
            this.leave();
        });

        // OFFLINE + global board configured -> can't reach the server: tell
        // the player and let them move on (their run is still saved on-device
        // by the results screen; the game itself is fully playable offline).
        if (isGlobal() && typeof navigator !== 'undefined' && navigator.onLine === false) {
            this.showOffline();
            return;
        }

        // Fresh score? ask for a nickname first. Otherwise just show the board.
        if (typeof this.score === 'number') {
            this.promptName();
        } else {
            this.refreshBoard();
        }
    }

    // ---------------- nickname entry (shared overlay helper) ----------------
    async promptName() {
        const name = await promptText({
            title: 'Enter your nickname!',
            placeholder: '2-12 letters',
            initial: getSavedName(),
            validate: async (v) => {
                const claim = await claimName(v);
                if (claim === 'invalid') return 'Use 2-12 letters or numbers!';
                if (claim === 'taken') return `"${v}" is taken - pick another nickname!`;
                if (claim === 'error') return 'Could not reach the scoreboard - try again?';
                return null;
            }
        });
        if (name) {
            this.myKey = nameKey(name);
            this.statusText.setText('Saving score...');
            await submitScore(this.songId, name, this.score);
        }
        this.refreshBoard();
    }

    // ---------------- board rendering ----------------
    async refreshBoard() {
        this.statusText.setText('Loading scores...');
        const rows = await topScores(this.songId, 5);
        this.rowsContainer.removeAll(true);

        if (rows === null) {
            // fetch failed mid-session (connection dropped)
            this.statusText.setText('Could not load the scoreboard -\nconnect to WiFi to upload or view scores!')
                .setAlign('center');
        } else if (rows.length === 0) {
            this.statusText.setText('No scores yet - be the first!');
        } else {
            this.statusText.setText('');
            const medals = ['#ffd700', '#c0c0c0', '#cd7f32', '#9ad6ff', '#9ad6ff'];
            rows.forEach((r, i) => {
                const y = 200 + i * 62;
                const mine = this.myKey && nameKey(r.name) === this.myKey;
                if (mine) {
                    this.rowsContainer.add(this.add.rectangle(400, y, 480, 52, 0xff8de1, 0.18));
                }
                this.rowsContainer.add(this.add.text(190, y, `${i + 1}.`, {
                    fontSize: '30px', color: medals[i], stroke: '#000000', strokeThickness: 5
                }).setOrigin(0, 0.5));
                this.rowsContainer.add(this.add.text(250, y, r.name, {
                    fontSize: '30px', color: mine ? '#ffe066' : '#ffffff',
                    stroke: '#000000', strokeThickness: 5
                }).setOrigin(0, 0.5));
                this.rowsContainer.add(this.add.text(610, y, `${r.score}%`, {
                    fontSize: '30px', color: mine ? '#ffe066' : '#8dfa8d',
                    stroke: '#000000', strokeThickness: 5
                }).setOrigin(1, 0.5));
            });
        }

        this.canLeave = true;
        this.continueText.setText('tap to continue');
        this.tweens.add({ targets: this.continueText, alpha: 0.4, yoyo: true, repeat: -1, duration: 600 });
    }

    showOffline() {
        this.statusText.setText(
            "You're offline!\n\nConnect to WiFi to upload your score\nor view the scoreboard.\n\n(the game still works offline!)")
            .setAlign('center').setColor('#ffa94d');
        this.canLeave = true;
        this.continueText.setText('tap to continue');
        this.tweens.add({ targets: this.continueText, alpha: 0.4, yoyo: true, repeat: -1, duration: 600 });
    }

    leave() {
        this.canLeave = false;
        // fade the end-credit jingle out with the screen, then hard-stop it
        const jingles = this.sound.sounds.filter(s => s.key && s.key.startsWith('jingle_'));
        jingles.forEach(s => this.tweens.add({ targets: s, volume: 0, duration: 320 }));
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            jingles.forEach(s => s.stop());          // guaranteed stop, no race
            this.scene.start('SongSelect');
        });
    }
}
