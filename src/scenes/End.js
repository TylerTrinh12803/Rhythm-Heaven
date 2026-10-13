// src/scenes/End.js
// Results screen with ranks + end-credit jingles.
//
// Rank order (lowest -> highest), per Brandon's spec:
//   TRY AGAIN  (bad score)
//   OK         (ok score)
//   PERFECT    (pretty good score)
//   SUPERB     (all Perfects except a few OKs - no Bads, no Misses)
//
// Each rank plays its own end-credit music (the files you provided).
// Best score + rank are saved per device via localStorage.

import { getSong } from '../songs.js';

// rank index doubles as the saved "best" value (higher = better)
export const RANKS = [
    { name: 'Try Again...', short: 'X',  color: '#ff6b6b', jingle: 'assets/rank_tryagain.mp3' }, // [AUDIO] bad-score credits
    { name: 'OK',           short: 'OK', color: '#8dfa8d', jingle: 'assets/rank_ok.mp3' },       // [AUDIO] ok-score credits
    { name: 'Perfect!',     short: 'P',  color: '#ffd700', jingle: 'assets/rank_perfect.mp3' },  // [AUDIO] good-score credits
    { name: 'SUPERB!!',     short: 'S',  color: '#ff8de1', jingle: 'assets/rank_superb.mp3' }    // [AUDIO] top-score credits
];

// Compute rank from the round's results. Exported so tests can check it.
export function computeRank(perfect, ok, bad, miss, total) {
    const score = (perfect * 100 + ok * 60) / (Math.max(total, 1) * 100); // 0..1
    // SUPERB: every beat hit, nothing Bad/Missed, and only a few OKs
    if (miss === 0 && bad === 0 && ok <= Math.max(2, Math.round(total * 0.12))) return { rankIdx: 3, score };
    if (score >= 0.80) return { rankIdx: 2, score };   // Perfect ("pretty good")
    if (score >= 0.55) return { rankIdx: 1, score };   // OK
    return { rankIdx: 0, score };                      // Try Again
}

export class End extends Phaser.Scene {
    constructor() {
        super('End');
    }

    init(data) {
        this.songId = data.songId;
        this.song = getSong(this.songId);
        this.perfect = data.perfect || 0;
        this.ok = data.ok || 0;
        this.bad = data.bad || 0;
        this.miss = data.miss || 0;
        this.total = data.total || 1;
    }

    preload() {
        // Per-song result art comes from songs.js (resultPerfect / resultOk / resultBad).
        // Songs without result art fall back to a text screen.
        if (this.song.resultPerfect) {
            this.load.image('result_top_' + this.songId, this.song.resultPerfect); // [IMAGE 800x600]
            this.load.image('result_ok_' + this.songId, this.song.resultOk);       // [IMAGE 800x600]
            this.load.image('result_bad_' + this.songId, this.song.resultBad);     // [IMAGE 800x600]
        }
        // End-credit jingles (one per rank)
        RANKS.forEach((r, i) => this.load.audio('jingle_' + i, r.jingle));
        this.load.audio('selectSfx', 'assets/select.mp3');
        this.load.image('retryBtn', 'assets/Retry.png');  // [IMAGE] your button art
        this.load.image('exitBtn', 'assets/Exit.png');    // [IMAGE] your button art
    }

    create() {
        this.buttonSfx = this.sound.add('selectSfx', { volume: 0.3 });

        const { rankIdx, score } = computeRank(this.perfect, this.ok, this.bad, this.miss, this.total);
        const rank = RANKS[rankIdx];

        // ---- Play this rank's end-credit music ----
        this.jingle = this.sound.add('jingle_' + rankIdx, { volume: 0.6 });
        this.jingle.play();

        // ---- Save best score & rank for this device (localStorage) ----
        const pct = Math.round(score * 100);
        let newBest = false;
        try {
            const prevRank = parseInt(localStorage.getItem('bestRank_' + this.songId) ?? '-1', 10);
            const prevScore = parseInt(localStorage.getItem('bestScore_' + this.songId) ?? '-1', 10);
            if (rankIdx > prevRank) localStorage.setItem('bestRank_' + this.songId, String(rankIdx));
            if (pct > prevScore) { localStorage.setItem('bestScore_' + this.songId, String(pct)); newBest = true; }
        } catch (e) { /* storage unavailable (rare) - just don't save */ }

        // ---- Background: song's result art, or a generic colored screen ----
        if (this.song.resultPerfect) {
            const img = rankIdx >= 2 ? 'result_top_' : rankIdx === 1 ? 'result_ok_' : 'result_bad_';
            this.add.image(400, 300, img + this.songId).setDisplaySize(800, 600);
        } else {
            // Generic fallback (used until you add result art in songs.js)
            const bgColors = [0x3a2230, 0x22383a, 0x3a3522, 0x2c223a];
            this.cameras.main.setBackgroundColor(bgColors[rankIdx]);
            this.add.text(400, 140, this.song.name, { fontSize: '36px', color: '#ffffff' }).setOrigin(0.5);
        }

        // ---- Rank + breakdown ----
        const rankText = this.add.text(400, 250, rank.name, {
            fontSize: '72px', color: rank.color, stroke: '#000000', strokeThickness: 8
        }).setOrigin(0.5).setScale(0).setDepth(10);
        this.tweens.add({ targets: rankText, scale: 1, duration: 500, ease: 'Back.Out', delay: 300 });

        this.add.text(400, 340,
            `Perfect: ${this.perfect}   OK: ${this.ok}   Bad: ${this.bad}   Miss: ${this.miss}`,
            { fontSize: '26px', color: '#ffffff', stroke: '#000000', strokeThickness: 5 })
            .setOrigin(0.5).setDepth(10);

        let bestStr = `Score: ${pct}%`;
        try {
            const best = localStorage.getItem('bestScore_' + this.songId);
            if (best !== null && !newBest) bestStr += `   (Best: ${best}%)`;
        } catch (e) {}
        this.add.text(400, 380, bestStr,
            { fontSize: '24px', color: '#ffffff', stroke: '#000000', strokeThickness: 5 })
            .setOrigin(0.5).setDepth(10);

        if (newBest) {
            const nb = this.add.text(400, 420, 'NEW BEST!', {
                fontSize: '28px', color: '#ffe066', stroke: '#000000', strokeThickness: 5
            }).setOrigin(0.5).setDepth(10);
            this.tweens.add({ targets: nb, scale: 1.15, yoyo: true, repeat: -1, duration: 400 });
        }

        // ---- Retry button ----
        const retry = this.add.image(400, 480, 'retryBtn').setScale(1.5).setInteractive().setDepth(10);
        retry.on('pointerover', () => retry.setScale(1.6));
        retry.on('pointerout', () => retry.setScale(1.5));
        retry.on('pointerdown', (p, x, y, event) => {
            event.stopPropagation();               // don't also trigger "continue"
            this.buttonSfx.play();
            this.tweens.add({ targets: this.jingle, volume: 0, duration: 400, onComplete: () => this.jingle.stop() });
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () =>
                this.scene.start('Game', { songId: this.songId }));
        });

        // ---- Tap anywhere -> Scoreboard (then tap again -> Song Select) ----
        // Short delay so an accidental tap right at song-end doesn't skip it.
        this.leaveEnabled = false;
        this.time.delayedCall(900, () => {
            this.leaveEnabled = true;
            const hint = this.add.text(400, 560, 'tap to continue', {
                fontSize: '22px', color: '#ffffff', stroke: '#000000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(10);
            this.tweens.add({ targets: hint, alpha: 0.4, yoyo: true, repeat: -1, duration: 600 });
        });
        this.input.on('pointerdown', () => {
            if (!this.leaveEnabled) return;
            this.leaveEnabled = false;
            // jingle keeps playing on the scoreboard screen (it stops there)
            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () =>
                this.scene.start('Scoreboard', { songId: this.songId, score: pct }));
        });

        this.cameras.main.fadeIn(500, 0, 0, 0);
    }
}
