// src/scenes/PvpResults.js
// After a PVP round: waits for every player to finish, then shows
//   1) the ranking for THIS SONG (accuracy %)
//   2) the OVERALL standings (points across all rounds: 1st=5, 2nd=4, ...)
// The host computes+publishes results (avoids write races) and can start
// the next round; everyone else follows automatically.

import { getSong } from '../songs.js';
import { nameKey } from '../scoreboard.js';
import * as pvp from '../pvp.js';

export class PvpResults extends Phaser.Scene {
    constructor() {
        super('PvpResults');
    }

    init(data) {
        this.code = data.code;
        this.round = data.round || 1;
        this.songId = data.songId;
        this.myName = data.myName;
        this.isHost = data.isHost;
        this.myScore = data.myScore;
    }

    create() {
        this.cameras.main.setBackgroundColor(0x141a2e);
        this.cameras.main.fadeIn(400, 0, 0, 0);
        const song = getSong(this.songId);

        this.add.text(400, 44, 'PVP RESULTS', {
            fontSize: '40px', color: '#7ec8ff', stroke: '#000000', strokeThickness: 6
        }).setOrigin(0.5);
        this.add.text(400, 84, song ? song.name : this.songId, {
            fontSize: '22px', color: '#ffffff'
        }).setOrigin(0.5);

        this.statusText = this.add.text(400, 300, 'Waiting for everyone to finish...', {
            fontSize: '22px', color: '#aaaacc', align: 'center'
        }).setOrigin(0.5);
        this.rows = this.add.container(0, 0);

        const leave = this.add.text(20, 16, '< leave', {
            fontSize: '20px', color: '#aaaacc', stroke: '#000000', strokeThickness: 4
        }).setInteractive();
        leave.on('pointerdown', () => {
            if (this.pollTimer) this.pollTimer.remove();
            pvp.leaveRoom(this.code, this.myName);
            this.scene.start('SongSelect');
        });

        this.waitForResults();
    }

    async waitForResults() {
        const startedAt = Date.now();
        this.pollTimer = this.time.addEvent({
            delay: 1500, loop: true,
            callback: async () => {
                // results already published? show them.
                let results = null;
                try { results = await pvp.readResults(this.code, this.round); } catch (e) { return; }
                if (results && results.ranking) {
                    this.pollTimer.remove();
                    this.showResults(results.ranking);
                    this.watchForNextRound();
                    return;
                }
                if (!this.isHost) return;

                // host: publish once everyone is done (or after 30s grace)
                let room, scores;
                try {
                    room = await pvp.readRoom(this.code);
                    scores = (await pvp.readScores(this.code, this.round)) || {};
                } catch (e) { return; }
                const nPlayers = Object.keys((room && room.players) || {}).length;
                const doneCount = Object.values(scores).filter(s => s && s.done).length;
                this.statusText.setText(`Waiting for everyone to finish...\n${doneCount}/${nPlayers} done`);
                if ((nPlayers > 0 && doneCount >= nPlayers) || Date.now() - startedAt > 30000) {
                    try {
                        await pvp.publishResults(this.code, this.round);
                    } catch (e) { /* retry next tick */ }
                }
            }
        });
    }

    showResults(ranking) {
        this.statusText.setText('');
        this.rows.removeAll(true);
        const myKey = nameKey(this.myName || '');
        const medals = ['#ffd700', '#c0c0c0', '#cd7f32', '#9ad6ff', '#9ad6ff'];

        this.rows.add(this.add.text(240, 130, 'THIS SONG', { fontSize: '20px', color: '#8dfa8d' }).setOrigin(0.5));
        ranking.slice(0, 5).forEach((r, i) => {
            const mine = r.key === myKey;
            this.rows.add(this.add.text(110, 168 + i * 40, `${i + 1}.`, {
                fontSize: '24px', color: medals[i] || '#ffffff', stroke: '#000000', strokeThickness: 4
            }).setOrigin(0, 0.5));
            this.rows.add(this.add.text(150, 168 + i * 40, r.name, {
                fontSize: '24px', color: mine ? '#ffe066' : '#ffffff', stroke: '#000000', strokeThickness: 4
            }).setOrigin(0, 0.5));
            this.rows.add(this.add.text(370, 168 + i * 40, `${r.score}%`, {
                fontSize: '24px', color: '#8dfa8d', stroke: '#000000', strokeThickness: 4
            }).setOrigin(1, 0.5));
        });

        // overall standings (by accumulated points)
        const overall = [...ranking].sort((a, b) => (b.total || 0) - (a.total || 0));
        this.rows.add(this.add.text(560, 130, 'OVERALL', { fontSize: '20px', color: '#ffe066' }).setOrigin(0.5));
        overall.slice(0, 5).forEach((r, i) => {
            const mine = r.key === myKey;
            this.rows.add(this.add.text(450, 168 + i * 40, `${i + 1}.`, {
                fontSize: '24px', color: medals[i] || '#ffffff', stroke: '#000000', strokeThickness: 4
            }).setOrigin(0, 0.5));
            this.rows.add(this.add.text(490, 168 + i * 40, r.name, {
                fontSize: '24px', color: mine ? '#ffe066' : '#ffffff', stroke: '#000000', strokeThickness: 4
            }).setOrigin(0, 0.5));
            this.rows.add(this.add.text(710, 168 + i * 40, `${r.total || 0} pts`, {
                fontSize: '24px', color: '#ffe066', stroke: '#000000', strokeThickness: 4
            }).setOrigin(1, 0.5));
        });

        if (this.isHost) {
            const btn = this.add.text(400, 480, 'NEXT SONG!', {
                fontSize: '30px', color: '#ffffff', backgroundColor: '#2f9e44', padding: { x: 26, y: 12 }
            }).setOrigin(0.5).setInteractive();
            btn.on('pointerdown', async () => {
                btn.disableInteractive().setAlpha(0.6);
                try { await pvp.nextRound(this.code, this.round); } catch (e) {}
                this.goToLobby();
            });
            this.rows.add(btn);
        } else {
            this.rows.add(this.add.text(400, 480, 'Waiting for the host to pick the next song...', {
                fontSize: '18px', color: '#8899bb'
            }).setOrigin(0.5));
        }
    }

    // non-hosts: when the host opens the next round, follow to the lobby
    watchForNextRound() {
        if (this.isHost) return;
        this.nextTimer = this.time.addEvent({
            delay: 2000, loop: true,
            callback: async () => {
                let room;
                try { room = await pvp.readRoom(this.code); } catch (e) { return; }
                if (room && room.state === 'lobby' && (room.round || 1) > this.round) {
                    this.nextTimer.remove();
                    this.goToLobby();
                }
            }
        });
    }

    goToLobby() {
        if (this.pollTimer) this.pollTimer.remove();
        if (this.nextTimer) this.nextTimer.remove();
        this.scene.start('PvpLobby', { code: this.code, myName: this.myName, isHost: this.isHost });
    }
}
