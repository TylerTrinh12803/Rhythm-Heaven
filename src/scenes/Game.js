// src/scenes/Game.js
// =====================================================================
//  RHYTHM ENGINE
//  ------------------------------------------------------------------
//  How judging works (Rhythm-Heaven style):
//    * Every player beat in the beatmap is judged against the music
//      clock (this.music.seek), never the wall clock.
//    * TAP   -> judged the instant you press down.
//    * HOLD  -> press near beat.time, keep holding, release near
//               beat.time + duration. Grade = the worse of press/release.
//    * SWIPE -> press then flick UP at the beat time.
//    * Grades:  PERFECT (within ±PERFECT_WINDOW)
//               OK      (within ±OK_WINDOW)
//               BAD     (within ±BAD_WINDOW, or wrong gesture)
//               MISS    (no input at all for that beat)
//    * Random mashing between beats shows "Bad" and counts against you.
//
//  Beatmap JSON format (assets/beatmaps/*.json):
//    { "beats": [
//        { "time": 12.0, "actor": "player", "type": "tap" },
//        { "time": 14.0, "actor": "player", "type": "hold",  "duration": 1.0 },
//        { "time": 16.0, "actor": "player", "type": "swipe", "label": "SWIPE!" },
//        { "time": 10.0, "actor": "npc",  "type": "cue",   "duration": 0.5 },
//        ...glee club also uses actor npc1/npc2/npc3 + animation/audioKey
//    ]}
// =====================================================================

import { getSong } from '../songs.js';
import * as pvp from '../pvp.js';

// ------- TIMING WINDOWS (seconds) - tweak difficulty here -------------
const PERFECT_WINDOW = 0.10;   // ± this = "Perfect"
const OK_WINDOW      = 0.22;   // ± this = "OK"
const BAD_WINDOW     = 0.40;   // ± this = "Bad" (sloppy but you tried)
const HOLD_LENIENCY  = 1.6;    // hold press/release windows are this x wider
const SWIPE_PIXELS   = 40;     // how far up a drag must travel to count as a swipe
const CUE_APPROACH   = 1.2;    // seconds before the beat that its ring cue appears

export class Game extends Phaser.Scene {
    constructor() {
        super('Game');
    }

    init(data) {
        this.songId = data.songId || 'glee';
        this.song = getSong(this.songId);
        this.pvp = data.pvp || null;   // { code, round, myName, isHost } when racing
    }

    preload() {
        const song = this.song;

        // Song audio + beatmap
        this.load.audio('music_' + song.id, song.audio);
        this.load.json('map_' + song.id, song.beatmap);

        // Shared UI (your art)
        this.load.image('resumeBtn', 'assets/Resume.png');  // [IMAGE] pause menu
        this.load.image('retryBtn', 'assets/Retry.png');    // [IMAGE] pause menu
        this.load.image('exitBtn', 'assets/Exit.png');      // [IMAGE] pause menu
        this.load.audio('sqek', 'assets/sqek.mp3');
        this.load.audio('selectSfx', 'assets/select.mp3');

        if (song.skin.type === 'glee') {
            // ---- your original Glee Club art ----
            this.load.image('gleebg', 'assets/gleebg.png');
            const sheets = {
                chiliglee: 'assets/chiliglee.png',
                nuggetglee: 'assets/nuggetglee.png',
                pepperglee: 'assets/pepperglee.png',
                hersheyglee: 'assets/hersheyglee.png'
            };
            Object.entries(sheets).forEach(([key, path]) =>
                this.load.spritesheet(key, path, { frameWidth: 800, frameHeight: 600 }));
            const audios = {
                gleeAhh: 'assets/ahhp.mp3',   gleeEnd: 'assets/end.mp3',
                scree: 'assets/screep.mp3',   gleeAhhn: 'assets/ahhn.mp3',
                gleeAhhc: 'assets/ahhc.mp3',  together: 'assets/together.mp3',
                screenn: 'assets/screenn.mp3', screecc: 'assets/screecc.mp3'
            };
            Object.entries(audios).forEach(([key, path]) => this.load.audio(key, path));
        } else {
            // ---- generic skin (mock art - see src/songs.js to swap) ----
            const skin = this.song.skin;
            this.load.image('bg_' + song.id, skin.bg);
            this.load.spritesheet('npc_' + song.id, skin.npcSheet, { frameWidth: 200, frameHeight: 300 });
            this.load.spritesheet('player_' + song.id, skin.playerSheet, { frameWidth: 200, frameHeight: 300 });
            this.load.audio('cue_' + song.id, skin.cueSfx);
            this.load.audio('hit_' + song.id, skin.hitSfx);
            this.load.audio('swipe_' + song.id, skin.swipeSfx);
        }
    }

    create() {
        // --- Beatmap: deep-clone from cache so a Retry starts fresh ---
        const raw = this.cache.json.get('map_' + this.song.id);
        this.beats = raw.beats.map(b => ({ ...b, judged: false, fired: false, cueSpawned: false }))
                              .sort((a, b) => a.time - b.time);
        this.playerBeats = this.beats.filter(b => b.actor === 'player');
        this.totalPlayerBeats = this.playerBeats.length;

        // --- Counters ---
        this.perfectCount = 0;
        this.okCount = 0;
        this.badCount = 0;
        this.missCount = 0;

        // --- Input state ---
        this.isPaused = false;
        this.isResuming = false;
        this.pointerIsDown = false;
        this.swipeHandled = false;
        this.activeHold = null;      // { beat, pressDelta }
        this.pendingSwipeBeat = null;

        // --- Skin (visuals + character reactions) ---
        this.skin = this.song.skin.type === 'glee' ? this.createGleeSkin() : this.createGenericSkin();

        // --- Sounds ---
        this.sqekSound = this.sound.add('sqek', { volume: 0.6 });
        this.selectSfx = this.sound.add('selectSfx', { volume: 0.2 });

        // --- Music ---
        this.music = this.sound.add('music_' + this.song.id);
        this.music.play();
        this.music.once('complete', () => this.finishSong());

        // --- UI ---
        this.scoreText = this.add.text(this.scale.width / 2, 30,
            '', { fontSize: '24px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 })
            .setOrigin(0.5).setDepth(50);
        this.updateScoreText();

        // The "hit ring" target where cues land (dark ring behind a light one
        // so it reads on both light and dark backgrounds)
        this.hitZone = { x: this.scale.width / 2, y: 470 };
        this.add.circle(this.hitZone.x, this.hitZone.y, 37)
            .setStrokeStyle(5, 0x222233, 0.85).setDepth(40);
        this.add.circle(this.hitZone.x, this.hitZone.y, 34)
            .setStrokeStyle(4, 0xffffff, 0.95).setDepth(40);

        // Pause button (mobile has no ESC key!)
        const pauseBtn = this.add.text(this.scale.width - 20, 16, '❚❚',
            { fontSize: '30px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 })
            .setOrigin(1, 0).setDepth(60).setInteractive();
        pauseBtn.on('pointerdown', (p, x, y, event) => {
            event.stopPropagation();               // don't count as a game tap
            if (!this.isPaused && !this.isResuming) this.showPauseMenu();
        });
        this.input.keyboard.on('keydown-ESC', () => {
            if (!this.isPaused && !this.isResuming) this.showPauseMenu();
        });

        // ------------------------------------------------------------
        //  INPUT
        // ------------------------------------------------------------
        this.input.on('pointerdown', pointer => {
            if (this.isPaused || this.isResuming) return;
            this.pointerIsDown = true;
            this.swipeHandled = false;
            this.pendingSwipeBeat = null;
            this.pressY = pointer.y;
            this.skin.onPress();

            const now = this.music.seek;
            const beat = this.findNearestBeat(now, BAD_WINDOW);

            if (!beat) {
                // Truly random mash (nothing anywhere near) -> Bad
                const anything = this.findNearestBeat(now, BAD_WINDOW + 0.35);
                if (!anything) this.registerStray();
                return;
            }

            if (beat.type === 'tap') {
                const delta = now - beat.time;
                this.judgeBeat(beat, this.gradeDelta(delta), delta);
                this.skin.onTapJudged(this.lastGrade);
            } else if (beat.type === 'hold') {
                beat.latched = true;                       // safe from miss-sweep while held
                this.activeHold = { beat, pressDelta: now - beat.time };
            } else if (beat.type === 'swipe') {
                this.pendingSwipeBeat = beat;              // wait for the flick
            }
        });

        this.input.on('pointermove', pointer => {
            if (!this.pointerIsDown || this.swipeHandled || this.isPaused || this.isResuming) return;
            if (this.pressY - pointer.y > SWIPE_PIXELS) this.handleSwipe();
        });

        this.input.on('pointerup', pointer => {
            if (this.isPaused || this.isResuming) { this.pointerIsDown = false; return; }
            const wasDown = this.pointerIsDown;
            this.pointerIsDown = false;
            if (!wasDown) return;

            // Last-chance swipe check (fast flicks)
            if (!this.swipeHandled && this.pressY - pointer.y > SWIPE_PIXELS) {
                this.handleSwipe();
                this.skin.onRelease(false);
                this.activeHold = null;
                return;
            }

            const now = this.music.seek;

            if (this.activeHold) {
                // ---- finish a hold: grade press AND release ----
                const { beat, pressDelta } = this.activeHold;
                const releaseDelta = now - (beat.time + (beat.duration || 0.5));
                const pressGrade = this.gradeDelta(pressDelta, HOLD_LENIENCY);
                const releaseGrade = this.gradeDelta(releaseDelta, HOLD_LENIENCY);
                const grade = this.worseGrade(pressGrade, releaseGrade);
                this.judgeBeat(beat, grade, releaseDelta);
                this.activeHold = null;
                this.skin.onRelease(true, this.lastGrade);
            } else {
                this.skin.onRelease(false);
            }
        });

        // ------------------------------------------------------------
        //  PVP MODE: upload my live accuracy + show rivals' live scores
        // ------------------------------------------------------------
        if (this.pvp) {
            this.pvpListText = this.add.text(12, 60, '', {
                fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
                lineSpacing: 4
            }).setDepth(55);
            const upload = () => {
                pvp.postScore(this.pvp.code, this.pvp.round, this.pvp.myName, this.currentPct(), false)
                    .catch(() => {});
            };
            const refresh = async () => {
                try {
                    const scores = (await pvp.readScores(this.pvp.code, this.pvp.round)) || {};
                    const rows = Object.values(scores)
                        .sort((a, b) => (b.score || 0) - (a.score || 0))
                        .slice(0, 5)
                        .map(s => `${s.name}: ${s.score || 0}%${s.done ? ' ✓' : ''}`);
                    if (this.pvpListText.scene) this.pvpListText.setText(rows.join('\n'));
                } catch (e) { /* offline blip - keep playing */ }
            };
            this.pvpUpTimer = this.time.addEvent({ delay: 2500, loop: true, callback: upload });
            this.pvpDownTimer = this.time.addEvent({ delay: 3000, loop: true, callback: refresh });
            upload(); refresh();
        }

        this.cameras.main.fadeIn(500, 0, 0, 0);
    }

    // accuracy so far, over the WHOLE song (used for pvp live scores)
    currentPct() {
        return Math.round((this.perfectCount * 100 + this.okCount * 60) /
            (Math.max(this.totalPlayerBeats, 1) * 100) * 100);
    }

    // ------------------------------------------------------------
    //  JUDGING HELPERS
    // ------------------------------------------------------------

    // nearest un-judged player beat within `window` seconds of `now`
    findNearestBeat(now, window) {
        let best = null, bestDist = Infinity;
        for (const b of this.playerBeats) {
            if (b.judged || b.latched) continue;
            const d = Math.abs(now - b.time);
            if (d <= window && d < bestDist) { best = b; bestDist = d; }
        }
        return best;
    }

    gradeDelta(delta, leniency = 1) {
        const d = Math.abs(delta);
        if (d <= PERFECT_WINDOW * leniency) return 'perfect';
        if (d <= OK_WINDOW * leniency) return 'ok';
        return 'bad';
    }

    worseGrade(a, b) {
        const order = ['perfect', 'ok', 'bad', 'miss'];
        return order[Math.max(order.indexOf(a), order.indexOf(b))];
    }

    handleSwipe() {
        this.swipeHandled = true;
        const now = this.music.seek;
        // the beat we latched on press, or any nearby swipe beat
        let beat = this.pendingSwipeBeat && !this.pendingSwipeBeat.judged ? this.pendingSwipeBeat : null;
        if (!beat) {
            const near = this.findNearestBeat(now, BAD_WINDOW);
            if (near && near.type === 'swipe') beat = near;
        }
        this.pendingSwipeBeat = null;

        if (beat) {
            const delta = now - beat.time;
            const grade = beat.type === 'swipe' ? this.gradeDelta(delta) : 'bad'; // swiped on a tap/hold = wrong gesture
            this.judgeBeat(beat, grade, delta);
            this.skin.onSwipe(this.lastGrade);
        } else {
            this.registerStray();
            this.skin.onSwipe('bad');
        }
    }

    judgeBeat(beat, grade, delta) {
        beat.judged = true;
        beat.latched = false;
        this.lastGrade = grade;

        if (grade === 'perfect') { this.perfectCount++; this.showFeedback('Perfect!', '#ffe066', delta); }
        else if (grade === 'ok') { this.okCount++; this.showFeedback('OK', '#8dfa8d', delta); }
        else if (grade === 'bad') { this.badCount++; this.showFeedback('Bad', '#ffa94d', delta); this.skin.onMiss(); }
        else { this.missCount++; this.showFeedback('Miss...', '#ff6b6b'); this.skin.onMiss(); }

        if (beat.cueObjects) this.killCue(beat);
        this.updateScoreText();
    }

    registerStray() {
        this.badCount++;
        this.showFeedback('Bad', '#ffa94d');
        this.skin.onMiss();
        this.updateScoreText();
    }

    // ------------------------------------------------------------
    //  MAIN LOOP - fires NPC beats, spawns cues, sweeps misses
    // ------------------------------------------------------------
    update() {
        if (this.isPaused || this.isResuming || !this.music) return;
        const now = this.music.seek;

        for (const beat of this.beats) {
            if (beat.time > now + CUE_APPROACH + 0.1) break; // sorted; nothing further is due

            // Spawn approach-ring cues for player beats
            if (beat.actor === 'player' && !beat.cueSpawned && now >= beat.time - CUE_APPROACH) {
                beat.cueSpawned = true;
                this.spawnCue(beat);
            }

            // Fire NPC beats exactly once at their time
            if (beat.actor !== 'player' && !beat.fired && now >= beat.time) {
                beat.fired = true;
                this.skin.onNpcBeat(beat);
            }
        }

        // Miss sweep: player beats whose whole window slid past with no input
        for (const beat of this.playerBeats) {
            if (!beat.judged && !beat.latched && now > beat.time + BAD_WINDOW) {
                this.judgeBeat(beat, 'miss');
            }
            // Held way past the end of a hold? force-finish it as Bad.
            if (beat.latched && this.activeHold && this.activeHold.beat === beat) {
                const end = beat.time + (beat.duration || 0.5);
                if (now > end + BAD_WINDOW * HOLD_LENIENCY) {
                    this.judgeBeat(beat, 'bad', now - end);
                    this.activeHold = null;
                    this.skin.onRelease(true, 'bad');
                }
            }
        }
    }

    // ------------------------------------------------------------
    //  CUE VISUALS - shrinking ring that lands exactly on the beat
    // ------------------------------------------------------------
    spawnCue(beat) {
        const colors = { tap: 0x8dfa8d, hold: 0x7ec8ff, swipe: 0xff7ee6 };
        const icons = { tap: '●', hold: '▼', swipe: '▲' };
        const color = colors[beat.type] || 0xffffff;
        const { x, y } = this.hitZone;

        const ring = this.add.circle(x, y, 34).setStrokeStyle(5, color, 1).setScale(3).setDepth(41);
        const icon = this.add.text(x, y, icons[beat.type] || '●',
            { fontSize: '28px', color: '#ffffff', stroke: '#222233', strokeThickness: 4 })
            .setOrigin(0.5).setAlpha(0).setDepth(42);
        beat.cueObjects = [ring, icon];

        this.tweens.add({ targets: ring, scale: 1, duration: CUE_APPROACH * 1000, ease: 'Linear' });
        this.tweens.add({ targets: icon, alpha: 1, duration: CUE_APPROACH * 500 });

        // Labels like "SWIPE!" (tutorial turns these on via showLabels in songs.js)
        if (beat.label || this.song.showLabels) {
            const label = beat.label || { tap: 'TAP!', hold: 'HOLD!', swipe: 'SWIPE UP!' }[beat.type];
            const t = this.add.text(x, y - 70, label,
                { fontSize: '24px', color: '#ffff88', stroke: '#000000', strokeThickness: 4 })
                .setOrigin(0.5).setDepth(42);
            beat.cueObjects.push(t);
        }

        // For holds, the ring lingers for the hold duration then fades
        const linger = beat.type === 'hold' ? (beat.duration || 0.5) * 1000 : 0;
        this.time.delayedCall(CUE_APPROACH * 1000 + linger + BAD_WINDOW * 1000, () => this.killCue(beat));
    }

    killCue(beat) {
        (beat.cueObjects || []).forEach(o => {
            if (!o.scene) return;
            this.tweens.add({ targets: o, alpha: 0, duration: 150, onComplete: () => o.destroy() });
        });
        beat.cueObjects = null;
    }

    showFeedback(text, color, delta) {
        let extra = '';
        if (delta !== undefined && Math.abs(delta) > PERFECT_WINDOW) {
            extra = delta < 0 ? ' (early)' : ' (late)';
        }
        const fb = this.add.text(this.hitZone.x, this.hitZone.y - 110, text + extra,
            { fontSize: '44px', color, stroke: '#000000', strokeThickness: 5 })
            .setOrigin(0.5).setDepth(55);
        this.tweens.add({ targets: fb, alpha: 0, y: fb.y - 50, duration: 650, ease: 'Power1', onComplete: () => fb.destroy() });
    }

    updateScoreText() {
        this.scoreText.setText(
            `Perfect: ${this.perfectCount}   OK: ${this.okCount}   Bad: ${this.badCount}   Miss: ${this.missCount}`);
    }

    finishSong() {
        // PVP round: upload the final score, then go to the versus results
        if (this.pvp) {
            const finalPct = this.currentPct();
            if (this.pvpUpTimer) this.pvpUpTimer.remove();
            if (this.pvpDownTimer) this.pvpDownTimer.remove();
            pvp.postScore(this.pvp.code, this.pvp.round, this.pvp.myName, finalPct, true).catch(() => {});
            this.cameras.main.fadeOut(800, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('PvpResults', {
                    ...this.pvp, songId: this.songId, myScore: finalPct
                });
            });
            return;
        }
        this.cameras.main.fadeOut(800, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('End', {
                songId: this.songId,
                perfect: this.perfectCount,
                ok: this.okCount,
                bad: this.badCount,
                miss: this.missCount,
                total: this.totalPlayerBeats
            });
        });
    }

    // ------------------------------------------------------------
    //  SKIN: GLEE CLUB (your original art & sounds)
    // ------------------------------------------------------------
    createGleeSkin() {
        this.add.image(400, 300, 'gleebg').setDisplaySize(800, 600);

        const player = this.add.sprite(400, 300, 'pepperglee');
        const npc1 = this.add.sprite(400, 300, 'nuggetglee');
        const npc2 = this.add.sprite(400, 300, 'chiliglee');
        const npc3 = this.add.sprite(400, 300, 'hersheyglee');
        this.npcSprites = { npc1, npc2, npc3 };

        const animConfigs = [
            { key: 'missc', sprite: 'chiliglee', start: 0, end: 2 },
            { key: 'missn', sprite: 'nuggetglee', start: 0, end: 2 },
            { key: 'idlec', sprite: 'chiliglee', start: 3, end: 5 },
            { key: 'idlen', sprite: 'nuggetglee', start: 3, end: 5 },
            { key: 'idle2', sprite: 'pepperglee', start: 0, end: 2 },
            { key: 'idleh', sprite: 'hersheyglee', start: 0, end: 2 },
            { key: 'ahhLoop', sprite: 'pepperglee', start: 3, end: 5 },
            { key: 'screeSwipe', sprite: 'pepperglee', start: 6, end: 8, frameRate: 8, repeat: 0 },
            { key: 'ahhc', sprite: 'chiliglee', start: 6, end: 8 },
            { key: 'ahhn', sprite: 'nuggetglee', start: 6, end: 8 },
            { key: 'screec', sprite: 'chiliglee', start: 9, end: 11 },
            { key: 'screen', sprite: 'nuggetglee', start: 9, end: 11 }
        ];
        animConfigs.forEach(cfg => {
            if (!this.anims.exists(cfg.key)) {
                this.anims.create({
                    key: cfg.key,
                    frames: this.anims.generateFrameNumbers(cfg.sprite, { start: cfg.start, end: cfg.end }),
                    frameRate: cfg.frameRate || 6,
                    repeat: cfg.repeat !== undefined ? cfg.repeat : -1
                });
            }
        });
        npc1.play('idlen'); npc2.play('idlec'); npc3.play('idleh'); player.play('idle2');

        // sounds
        const ahhSfxs = [this.sound.add('gleeAhh', { volume: 0 }), this.sound.add('gleeAhh', { volume: 0 })];
        const screeSfx = this.sound.add('scree');
        const endSfx = this.sound.add('gleeEnd');
        const npcSounds = {
            gleeAhhn: this.sound.add('gleeAhhn', { volume: 0.6 }),
            gleeAhhc: this.sound.add('gleeAhhc', { volume: 0.6 }),
            together: this.sound.add('together', { volume: 0.6 }),
            screenn: this.sound.add('screenn', { volume: 0.6 }),
            screecc: this.sound.add('screecc', { volume: 0.6 })
        };

        let ahhIndex = 0, ahhTimer = null;
        const fadeIn = (s, d) => { s.volume = 0; s.play(); this.tweens.add({ targets: s, volume: 0.6, duration: d * 1000 }); };
        const fadeOut = (s, d) => this.tweens.add({ targets: s, volume: 0, duration: d * 1000, onComplete: () => s.stop() });

        // --- Seamless "ahh" looper for NPC held notes ---------------------
        // The ahh clips are only ~0.65s long, so a held note has to LOOP the
        // clip. Two copies of the sound crossfade into each other so there's
        // no audible seam, for exactly the hold's duration, then fade out.
        const makeAhhLooper = (key) => {
            const insts = [this.sound.add(key, { volume: 0 }), this.sound.add(key, { volume: 0 })];
            let idx = 0, loopTimer = null, stopTimer = null;
            const stop = (hard = false) => {
                if (loopTimer) { loopTimer.remove(); loopTimer = null; }
                if (stopTimer) { stopTimer.remove(); stopTimer = null; }
                insts.forEach(s => { if (s.isPlaying) (hard ? s.stop() : fadeOut(s, 0.08)); });
            };
            const start = (duration) => {
                stop(true);                              // restart cleanly if re-triggered
                const crossfade = 0.15;                  // seconds of overlap between repeats
                fadeIn(insts[idx], crossfade);
                const clipMs = Math.max((insts[0].duration - crossfade) * 1000, 200);
                loopTimer = this.time.addEvent({
                    delay: clipMs,
                    loop: true,
                    callback: () => {
                        const next = (idx + 1) % insts.length;
                        fadeOut(insts[idx], crossfade);
                        fadeIn(insts[next], crossfade);
                        idx = next;
                    }
                });
                // sing for exactly the hold duration, then fade out
                stopTimer = this.time.delayedCall(duration * 1000, () => stop());
            };
            return { start, stop };
        };
        const npcLoopers = {
            npc1: makeAhhLooper('gleeAhhn'),
            npc2: makeAhhLooper('gleeAhhc')
        };

        const startAhh = () => {
            if (ahhTimer) return;
            player.play('ahhLoop');
            const crossfade = 0.2;
            fadeIn(ahhSfxs[ahhIndex], crossfade);
            ahhTimer = this.time.addEvent({
                delay: Math.max((ahhSfxs[0].duration - crossfade) * 1000, 200),
                loop: true,
                callback: () => {
                    const next = (ahhIndex + 1) % ahhSfxs.length;
                    fadeOut(ahhSfxs[ahhIndex], crossfade);
                    fadeIn(ahhSfxs[next], crossfade);
                    ahhIndex = next;
                }
            });
        };
        const stopAhh = () => {
            if (ahhTimer) { ahhTimer.remove(); ahhTimer = null; }
            ahhSfxs.forEach(s => { if (s.isPlaying) fadeOut(s, 0.1); });
        };

        // Don't leave voices singing if the scene restarts / exits mid-hold
        this.events.once('shutdown', () => {
            Object.values(npcLoopers).forEach(l => l.stop(true));
            stopAhh();
        });

        return {
            onPress: () => startAhh(),
            onRelease: (wasHold) => {
                stopAhh();
                player.play('idle2');
                if (wasHold) endSfx.play();
            },
            onTapJudged: () => { stopAhh(); player.play('idle2'); },
            onSwipe: () => {
                stopAhh();
                player.play('screeSwipe');
                screeSfx.stop();
                screeSfx.play({ volume: 0.6 });
                player.once('animationcomplete', () => player.play('idle2'));
            },
            onMiss: () => {
                // choir mates glare when you flub (your miss art)
                [['npc1', 'missn', 'idlen'], ['npc2', 'missc', 'idlec']].forEach(([n, missKey, idleKey]) => {
                    const s = this.npcSprites[n];
                    s.play(missKey);
                    this.time.delayedCall(1200, () => { if (s.anims.getName() === missKey) s.play(idleKey); });
                });
            },
            onNpcBeat: (beat) => {
                const npc = this.npcSprites[beat.actor];
                if (npc && beat.animation && this.anims.exists(beat.animation)) npc.play(beat.animation);

                // Held notes loop the ahh seamlessly for the full duration;
                // everything else (scree, together...) stays a one-shot.
                if (beat.type === 'hold' && npcLoopers[beat.actor]) {
                    npcLoopers[beat.actor].start(beat.duration || 0.5);
                } else if (beat.audioKey && npcSounds[beat.audioKey]) {
                    npcSounds[beat.audioKey].play();
                }

                if (npc) {
                    const idleKey = beat.actor === 'npc1' ? 'idlen' : beat.actor === 'npc2' ? 'idlec' : 'idleh';
                    this.time.delayedCall((beat.duration || 0.8) * 1000, () => npc.play(idleKey));
                }
            }
        };
    }

    // ------------------------------------------------------------
    //  SKIN: GENERIC (mock art - swap the files in src/songs.js!)
    //  NPC performer on the left gives the cue, you echo it on the right.
    // ------------------------------------------------------------
    createGenericSkin() {
        const id = this.song.id;
        const skin = this.song.skin;

        this.add.image(400, 300, 'bg_' + id).setDisplaySize(800, 600);

        // Spritesheet layout: 0-2 idle | 3-5 sing | 6-8 swipe | 9-11 miss
        const makeAnims = (sheet) => {
            const defs = { idle: [0, 2, -1], sing: [3, 5, -1], swipe: [6, 8, 0], miss: [9, 11, 0] };
            Object.entries(defs).forEach(([name, [s, e, rep]]) => {
                const key = `${sheet}_${name}`;
                if (!this.anims.exists(key)) {
                    this.anims.create({
                        key,
                        frames: this.anims.generateFrameNumbers(sheet, { start: s, end: e }),
                        frameRate: 6, repeat: rep
                    });
                }
            });
        };
        makeAnims('npc_' + id);
        makeAnims('player_' + id);

        const npc = this.add.sprite(240, 330, 'npc_' + id).play(`npc_${id}_idle`);
        const player = this.add.sprite(560, 330, 'player_' + id).play(`player_${id}_idle`);
        if (skin.playerTint && skin.playerTint !== 0xffffff) player.setTint(skin.playerTint);

        // "YOU" marker over the player's character
        this.add.text(560, 160, 'YOU', { fontSize: '20px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 })
            .setOrigin(0.5).setDepth(45);

        const cueSfx = this.sound.add('cue_' + id, { volume: 0.6 });
        const hitSfx = this.sound.add('hit_' + id, { volume: 0.6 });
        const swipeSfx = this.sound.add('swipe_' + id, { volume: 0.6 });

        const pk = (n) => `player_${id}_${n}`;
        const playerIdle = () => player.play(pk('idle'));

        return {
            onPress: () => player.play(pk('sing')),
            onRelease: () => playerIdle(),
            onTapJudged: (grade) => {
                if (grade === 'perfect' || grade === 'ok') hitSfx.play();
                this.time.delayedCall(200, playerIdle);
            },
            onSwipe: (grade) => {
                player.play(pk('swipe'));
                if (grade === 'perfect' || grade === 'ok') swipeSfx.play();
                player.once('animationcomplete', playerIdle);
            },
            onMiss: () => {
                player.play(pk('miss'));
                this.time.delayedCall(700, playerIdle);
            },
            onNpcBeat: (beat) => {
                if (beat.type === 'swipe') {
                    npc.play(`npc_${id}_swipe`);
                    swipeSfx.play();
                    npc.once('animationcomplete', () => npc.play(`npc_${id}_idle`));
                } else {
                    npc.play(`npc_${id}_sing`);
                    cueSfx.play();
                    this.time.delayedCall((beat.duration || 0.4) * 1000, () => npc.play(`npc_${id}_idle`));
                }
            }
        };
    }

    // ------------------------------------------------------------
    //  PAUSE MENU
    // ------------------------------------------------------------
    showPauseMenu() {
        this.isPaused = true;
        if (this.music) this.music.pause();

        this.pauseContainer = this.add.container(this.scale.width / 2, this.scale.height / 2).setDepth(100);
        const bg = this.add.rectangle(0, 0, 600, 400, 0x000000, 0.8);
        this.pauseContainer.add(bg);

        const createBtn = (y, key, callback) => {
            const btn = this.add.image(0, y, key).setOrigin(0.5).setScale(1.5).setInteractive();
            btn.on('pointerdown', (p, x, yy, event) => { event.stopPropagation(); callback(); });
            btn.on('pointerover', () => btn.setScale(1.6));
            btn.on('pointerout', () => btn.setScale(1.5));
            this.pauseContainer.add(btn);
        };
        createBtn(-70, 'resumeBtn', () => this.resumeGame());
        createBtn(0, 'retryBtn', () => this.fadeOutAndRestart());
        createBtn(70, 'exitBtn', () => this.fadeOutAndQuit());
    }

    resumeGame() {
        this.isPaused = false;
        this.isResuming = true;
        if (this.pauseContainer) this.pauseContainer.destroy();

        const countdownText = this.add.text(this.scale.width / 2, this.scale.height / 2, '3',
            { fontSize: '64px', color: '#ffff00', stroke: '#000000', strokeThickness: 6 })
            .setOrigin(0.5).setDepth(100);

        let countdown = 3;
        this.sqekSound.play();
        this.time.addEvent({
            delay: 1000,
            repeat: 2,
            callback: () => {
                countdown--;
                if (countdown > 0) {
                    countdownText.setText(String(countdown));
                    this.sqekSound.play();
                } else {
                    countdownText.destroy();
                    if (this.music) this.music.resume();
                    this.isResuming = false;
                }
            }
        });
    }

    fadeOutAndRestart() {
        this.selectSfx.play();
        if (this.music) this.music.stop();
        this.cameras.main.fadeOut(600, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.restart({ songId: this.songId });
        });
    }

    fadeOutAndQuit() {
        this.selectSfx.play();
        if (this.music) this.music.stop();
        this.cameras.main.fadeOut(600, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('SongSelect');
        });
    }
}
