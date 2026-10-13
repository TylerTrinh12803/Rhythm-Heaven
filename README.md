# Rhythm Heaven ~Christmas Edition~

A Rhythm-Heaven-style browser rhythm game (Phaser 3). Tap, hold, and swipe in
time with the music. Runs on desktop and mobile (touch works).

## How to play
- **TAP** the screen exactly on the beat (green cue ●)
- **HOLD** press on the beat, release when the hold ends (blue cue ▼)
- **SWIPE UP** flick upward on the beat (pink cue ▲)
- Every hit is graded **Perfect / OK / Bad**, missing a beat is a **Miss**
- At the end you get a rank with its own end-credit music:
  **Try Again... → OK → Perfect! → SUPERB!!**
  (SUPERB = every beat hit, no Bads/Misses, only a couple of OKs)
- Your best score and rank for each song are saved **on this device**
  (browser localStorage) and shown on the song-select cards
- Mashing randomly between beats counts as **Bad** - play clean!
- Pause with the ❚❚ button (top-right) or ESC.

## Running it
Serve the folder with any static server (modules don't load from file://):
```
python -m http.server 8000        # then open http://localhost:8000
```

## Putting it ONLINE (GitHub Pages - free, no download for players)
1. Go to github.com and log in (TylerTrinh12803), click **New repository**.
2. Name it exactly **Rhythm-Heaven** (must match, the QR code points to it),
   set it Public, click Create.
3. On the empty repo page click **"uploading an existing file"**, then drag
   the ENTIRE contents of this folder in (all files + the assets/ and src/
   folders - drag the folders themselves so the structure is kept).
   Commit the upload.
4. Repo **Settings -> Pages** -> under "Build and deployment" pick
   **Deploy from a branch**, branch **main**, folder **/ (root)** -> Save.
5. Wait ~2 minutes. Your game is live at:
   **https://tylertrinh12803.github.io/Rhythm-Heaven/**

`qr_code.png` in this folder is a ready-to-print QR code that opens that
exact URL - anyone who scans it plays instantly on their phone, nothing to
download. (If you name the repo something else, tell Claude to regenerate
the QR.)

**Updating the game later:** keep editing the files here on your computer
like always, then re-upload the changed files to the repo (same drag &
drop, or the GitHub Desktop app) - the site updates itself in a minute.

## Scoreboard (top 5 players)
After finishing a song: results screen -> tap -> **scoreboard** (enter your
nickname, see the top 5) -> tap -> song select.

- Nicknames are claimed by the first device that uses them - if someone
  else already took "pepper", the game asks you to pick another name.
- Each player keeps their BEST score per song.
- Out of the box the board is **per-device** (localStorage). To make ONE
  GLOBAL board that every phone sees, do the free 5-minute Firebase setup
  described at the top of `src/scoreboard.js`, paste your database URL into
  that file, and re-upload it.

## Where everything lives
```
src/songs.js            <-- THE song list. Add/edit songs + all art paths here.
src/scenes/Game.js      <-- rhythm engine (timing windows at the top of the file)
src/scenes/SongSelect.js   song select grid (built automatically from songs.js)
src/scenes/End.js          results screen + rank thresholds
assets/beatmaps/*.json     one beatmap per song
assets/mock/*              PLACEHOLDER art & sfx - replace with your own!
```

## Swapping in your own art
Every placeholder is marked with an `[IMAGE ...]` comment in `src/songs.js`.
Keep the same size (noted in each comment) or update the size where it's loaded.

- **Song cards**: 240x180 px each (`assets/mock/card_*.png`)
- **Level backgrounds**: 800x600 px (`assets/mock/bg_*.png`)
- **Performer spritesheets**: horizontal strip of **12 frames, 200x300 px each**
  (2400x300 total). Frame layout:
  `0-2 idle | 3-5 sing/tap | 6-8 swipe up | 9-11 miss`
- **Result screens**: 800x600, set `resultPerfect / resultOk / resultBad`
  per song in songs.js (Glee Club already uses your art for these).

## Music & beatmaps
The five songs use the audio files you supplied. Their beatmaps were
**extracted automatically from your "perfect version" recordings**: both
recordings were aligned by cross-correlation, and the extra hit-sounds present
in the perfect version became the player beats. If a section feels off, open
the song's JSON in `assets/beatmaps/` and nudge the times - they're plain
seconds. (The old chiptune files neonheart/midnightdrive/seoul2009.mp3 are
unused now and safe to delete.)

Rank jingles: `assets/rank_tryagain.mp3`, `rank_ok.mp3`, `rank_perfect.mp3`,
`rank_superb.mp3` - swap paths in `src/scenes/End.js` (RANKS list).

## Making beatmaps
A beatmap is a JSON list of beats. Times are **seconds into the mp3**:
```json
{ "beats": [
  { "time": 10.0, "actor": "npc",    "type": "cue" },
  { "time": 12.0, "actor": "player", "type": "tap" },
  { "time": 14.0, "actor": "player", "type": "hold",  "duration": 1.0 },
  { "time": 16.0, "actor": "player", "type": "swipe", "label": "SWIPE!" }
]}
```
- `actor: "npc"` beats make the left character demonstrate (cue/swipe) -
  in Glee Club they can also be `npc1/npc2/npc3` with `animation`/`audioKey`.
- `actor: "player"` beats are the ones YOU must hit.
- To stay on beat: `time = first_beat_offset + beat_number * (60 / BPM)`.
- `"label": "..."` shows text over the cue (the Practice song uses this).

## Difficulty tuning
Top of `src/scenes/Game.js`:
```js
const PERFECT_WINDOW = 0.10;  // tighter = harder
const OK_WINDOW      = 0.22;
const BAD_WINDOW     = 0.40;
```
Rank thresholds live in `src/scenes/End.js` (computeRank()).

## Mobile
Works with touch (tap / press-hold / flick up). Audio unlocks on the first
tap (browser rule). Best played in landscape; the game letterboxes to fit.

## Online PVP (up to 5 players)
Hit the purple **PVP!** button on the song select. One player HOSTS (gets a
4-letter room code), up to 4 friends JOIN with that code on their own
phones. The host picks the song and hits START - everyone plays it at the
same time on their own device, with live rival scores in the corner. When
everyone finishes: the ranking for that song, plus OVERALL standings
(1st place = 5 pts, 2nd = 4, ...) that add up as the host keeps picking
next songs. Uses the same Firebase database as the scoreboard, so it needs
that setup (src/scoreboard.js) + internet; offline players get a notice.

## Offline play
The game is a PWA: on the first (online) visit, `sw.js` saves every game
file into the browser cache, so afterwards it loads and plays with **no
internet at all** - songs, scoring, ranks, device-saved bests all work.
A red banner appears while offline: "connect to WiFi to upload or view the
scoreboard" (the online top-5 is the only thing that needs a connection;
the scoreboard screen shows the same notice and lets players continue).
Players can also "Add to Home Screen" on their phone to install it like an
app (icon-192/512.png - replace with your art if you like).

**IMPORTANT when you update the game:** open `sw.js` and bump
`CACHE_VERSION` (v1 -> v2 -> ...) and re-upload sw.js along with your
changed files, otherwise returning players may keep seeing cached old
files.
