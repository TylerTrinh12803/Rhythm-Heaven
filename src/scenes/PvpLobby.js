// src/scenes/PvpLobby.js
// Online PVP lobby: host a room (4-letter code) or join a friend's.
// The host picks the song and starts the round; everyone's device polls the
// room and launches the same song together. Up to 5 players.

import { SONGS, getSong } from '../songs.js';
import { getSavedName, claimName } from '../scoreboard.js';
import { promptText } from '../overlay.js';
import * as pvp from '../pvp.js';

export class PvpLobby extends Phaser.Scene {
    constructor() {
        super('PvpLobby');
    }

    init(data) {
        this.code = data.code || null;       // returning from a finished round
        this.myName = data.myName || getSavedName();
        this.isHost = data.isHost || false;
    }

    create() {
        this.cameras.main.setBackgroundColor(0x101a2e);
        this.cameras.main.fadeIn(400, 0, 0, 0);
        this.pollTimer = null;
        this.starting = false;

        this.add.text(400, 50, 'ONLINE PVP', {
            fontSize: '46px', color: '#7ec8ff', stroke: '#000000', strokeThickness: 7
        }).setOrigin(0.5);

        this.statusText = this.add.text(400, 300, '', {
            fontSize: '22px', color: '#ffffff', align: 'center'
        }).setOrigin(0.5);

        // back to song select
        const back = this.add.text(20, 16, '< back', {
            fontSize: '22px', color: '#aaaacc', stroke: '#000000', strokeThickness: 4
        }).setInteractive();
        back.on('pointerdown', async () => {
            if (this.code && this.myName) pvp.leaveRoom(this.code, this.myName);
            this.exitTo('SongSelect');
        });

        this.uiGroup = this.add.container(0, 0);

        if (!pvp.pvpAvailable()) {
            this.statusText.setText(
                (typeof navigator !== 'undefined' && navigator.onLine === false)
                    ? "You're offline!\nConnect to WiFi to play online PVP."
                    : 'PVP needs the online scoreboard set up first\n(see the top of src/scoreboard.js).');
            return;
        }

        if (this.code) { this.enterLobby(); return; }
        this.showMenu();
    }

    // ---------- host / join menu ----------
    showMenu() {
        this.uiGroup.removeAll(true);
        const mkBtn = (y, label, color, cb) => {
            const t = this.add.text(400, y, label, {
                fontSize: '34px', color: '#ffffff', backgroundColor: color,
                padding: { x: 28, y: 14 }
            }).setOrigin(0.5).setInteractive();
            t.on('pointerdown', cb);
            t.on('pointerover', () => t.setScale(1.06));
            t.on('pointerout', () => t.setScale(1));
            this.uiGroup.add(t);
        };
        mkBtn(220, 'HOST A GAME', '#2f9e44', () => this.hostFlow());
        mkBtn(320, 'JOIN A GAME', '#845ef7', () => this.joinFlow());
        this.statusText.setText('');
        this.add.text(400, 420, 'Up to 5 players - everyone plays the same\nsong at once, highest accuracy wins!', {
            fontSize: '18px', color: '#8899bb', align: 'center'
        }).setOrigin(0.5);
    }

    async ensureName() {
        if (this.myName) return this.myName;
        const name = await promptText({
            title: 'Enter your nickname!',
            placeholder: '2-12 letters',
            initial: getSavedName(),
            skipLabel: 'Cancel',
            validate: async (v) => {
                const claim = await claimName(v);
                if (claim === 'invalid') return 'Use 2-12 letters or numbers!';
                if (claim === 'taken') return `"${v}" is taken - pick another nickname!`;
                if (claim === 'error') return 'Could not reach the server - try again?';
                return null;
            }
        });
        if (name) this.myName = name;
        return name;
    }

    async hostFlow() {
        if (!(await this.ensureName())) return;
        this.statusText.setText('Creating room...');
        try {
            this.code = await pvp.createRoom(this.myName);
            this.isHost = true;
            this.enterLobby();
        } catch (e) {
            this.statusText.setText('Could not create the room -\ncheck your connection and try again!');
        }
    }

    async joinFlow() {
        if (!(await this.ensureName())) return;
        const code = await promptText({
            title: "Enter the host's room code!",
            placeholder: 'e.g. ABCD',
            maxLength: 4,
            okLabel: 'Join!',
            skipLabel: 'Cancel',
            validate: async (v) => {
                if (!/^[a-zA-Z]{4}$/.test(v.trim())) return 'Codes are 4 letters!';
                const res = await pvp.joinRoom(v, this.myName).catch(() => ({ error: 'Could not reach the server!' }));
                if (res.error) return res.error;
                this._joined = res.code;
                return null;
            }
        });
        if (!code) return;
        this.code = this._joined;
        this.isHost = false;
        this.enterLobby();
    }

    // ---------- inside the lobby ----------
    enterLobby() {
        this.uiGroup.removeAll(true);
        this.statusText.setText('');

        this.add.text(400, 105, 'ROOM CODE', { fontSize: '18px', color: '#8899bb' }).setOrigin(0.5);
        this.add.text(400, 145, this.code, {
            fontSize: '56px', color: '#ffe066', stroke: '#000000', strokeThickness: 6, letterSpacing: 12
        }).setOrigin(0.5);

        this.songText = this.add.text(400, 200, '', { fontSize: '22px', color: '#8dfa8d' }).setOrigin(0.5);
        this.playerTexts = this.add.container(0, 0);
        this.hintText = this.add.text(400, 545, '', { fontSize: '18px', color: '#8899bb', align: 'center' }).setOrigin(0.5);

        if (this.isHost) {
            // song picker row
            this.songIdx = 0;
            const prev = this.add.text(180, 200, '<', { fontSize: '30px', color: '#ffffff' }).setOrigin(0.5).setInteractive();
            const next = this.add.text(620, 200, '>', { fontSize: '30px', color: '#ffffff' }).setOrigin(0.5).setInteractive();
            const updateSong = () => {
                const song = SONGS[this.songIdx];
                this.songText.setText('Song: ' + song.name);
                pvp.setSong(this.code, song.id).catch(() => {});
            };
            prev.on('pointerdown', () => { this.songIdx = (this.songIdx + SONGS.length - 1) % SONGS.length; updateSong(); });
            next.on('pointerdown', () => { this.songIdx = (this.songIdx + 1) % SONGS.length; updateSong(); });
            updateSong();

            this.startBtn = this.add.text(400, 480, 'START!', {
                fontSize: '34px', color: '#ffffff', backgroundColor: '#2f9e44', padding: { x: 30, y: 12 }
            }).setOrigin(0.5).setInteractive();
            this.startBtn.on('pointerdown', () => pvp.startRound(this.code).catch(() => {}));
            this.hintText.setText('Friends join with the room code on their phone.\nPick the song with < >, then hit START!');
        } else {
            this.hintText.setText('Waiting for the host to start the game...');
        }

        this.poll();
        this.pollTimer = this.time.addEvent({ delay: 1500, loop: true, callback: () => this.poll() });
    }

    async poll() {
        let room;
        try { room = await pvp.readRoom(this.code); } catch (e) { return; }
        if (!room) return;
        this.room = room;

        // player list
        this.playerTexts.removeAll(true);
        const players = Object.values(room.players || {});
        players.forEach((p, i) => {
            this.playerTexts.add(this.add.text(400, 250 + i * 34,
                `${p.name}${room.host && pvpKey(p.name) === room.host ? '  (host)' : ''}   ${p.points || 0} pts`, {
                    fontSize: '22px', color: '#ffffff'
                }).setOrigin(0.5));
        });

        if (!this.isHost && room.songId) {
            const song = getSong(room.songId);
            this.songText.setText('Song: ' + (song ? song.name : room.songId));
        }

        // host pressed start -> countdown -> play (everyone, host included)
        if (room.state === 'playing' && !this.starting && room.songId) {
            this.starting = true;
            if (this.pollTimer) this.pollTimer.remove();
            this.countdownAndPlay(room);
        }
    }

    countdownAndPlay(room) {
        const big = this.add.text(400, 380, '3', {
            fontSize: '80px', color: '#ffe066', stroke: '#000000', strokeThickness: 8
        }).setOrigin(0.5);
        let n = 3;
        this.time.addEvent({
            delay: 1000, repeat: 2,
            callback: () => {
                n--;
                if (n > 0) big.setText(String(n));
                else {
                    this.scene.start('Game', {
                        songId: room.songId,
                        pvp: { code: this.code, round: room.round || 1, myName: this.myName, isHost: this.isHost }
                    });
                }
            }
        });
    }

    exitTo(key) {
        if (this.pollTimer) this.pollTimer.remove();
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(key));
    }
}

// tiny local copy to avoid importing nameKey twice
function pvpKey(name) {
    return String(name).trim().toLowerCase().replace(/[^a-z0-9 _-]/g, '').replace(/\s+/g, '_');
}
