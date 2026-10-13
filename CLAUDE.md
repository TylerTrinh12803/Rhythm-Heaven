# Rhythm Heaven ~Christmas Edition~ (Brandon's gift game)

Rhythm-Heaven-style browser rhythm game. Phaser 3 (vendored `phaser.js`), plain ES modules,
no build step. Serve the folder with any static server: `python -m http.server 8000`.
Live site: https://tylertrinh12803.github.io/Rhythm-Heaven/ (GitHub Pages, repo
TylerTrinh12803/Rhythm-Heaven, branch main, root). `qr_code.png` points there.

## Layout
- `src/songs.js` – song registry: audio, beatmap, card art, level skin. All placeholder art
  paths carry `[IMAGE WxH]` comments. Add songs here; SongSelect builds itself from it.
- `src/scenes/Game.js` – rhythm engine. Timing windows at top (PERFECT 0.10 / OK 0.22 /
  BAD 0.40 s). Judges on the music clock (`music.seek`). tap = press, hold = press+release
  (worse of the two), swipe = flick up > 40px. Two skins: `glee` (Brandon's art, NPC ahh
  crossfade looper) and `generic` (spritesheets 12 frames of 200x300:
  0-2 idle, 3-5 sing, 6-8 swipe, 9-11 miss). Also PVP live-score upload.
- `src/scenes/End.js` – `computeRank()`. Rank order LOW->HIGH is Brandon's custom order:
  Try Again -> OK -> Perfect -> SUPERB. Each plays `assets/rank_*.mp3`. Saves best
  rank/score to localStorage (`bestRank_<id>`, `bestScore_<id>`).
- Flow: Start -> SongSelect -> Game -> End -(tap)-> Scoreboard -(tap)-> SongSelect.
- `src/scoreboard.js` – top-5 + nickname claiming (first device owns a name; dupes are
  re-prompted). localStorage by default; global when `SCOREBOARD_URL` (Firebase Realtime
  DB REST URL) is set at the top of the file.
- `src/pvp.js`, `scenes/PvpLobby.js`, `scenes/PvpResults.js` – online PVP, up to 5 players,
  4-letter room codes under `rooms/<CODE>` in the same Firebase DB, polled over REST.
  Host publishes results; points 1st=5, 2nd=4, ... accumulate across rounds.
- `src/overlay.js` – `promptText()` for the HTML `#name-overlay` in index.html (native
  input so phone keyboards work).
- `sw.js` + `manifest.json` – PWA/offline. **Bump `CACHE_VERSION` in sw.js whenever game
  files change**, and add any new file the game loads to the `ASSETS` list.
  `#offline-banner` in index.html shows when offline.
- `assets/beatmaps/*.json` – `{beats:[{time, actor:'player'|'npc'|'npc1..3', type:
  'tap'|'hold'|'swipe'|'cue', duration?, label?}]}`, times in seconds into the mp3.
  Five of them were auto-extracted from "perfect version" gameplay recordings.
- `assets/mock/` – placeholder art/sfx to be replaced by Brandon's own art.

## Conventions
- Keep it mobile-first: touch input, landscape 800x600 scaled with Phaser FIT.
- Phaser 3 listens to mouse/touch events, not PointerEvents (matters for test scripts).
- Unused leftovers safe to delete: neonheart/midnightdrive/seoul2009/practice.mp3,
  beatmaps neon_heart/midnight_drive/seoul_2009/tutorial/blue_birds.json,
  mock card_neon/card_midnight/card_seoul/card_tutorial.png, bg_practice.png, `_to_delete/`.
