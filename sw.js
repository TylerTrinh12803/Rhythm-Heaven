// sw.js - service worker: makes the game PLAYABLE OFFLINE.
// On the first (online) visit every game file below is saved to the browser
// cache; after that the whole game loads and plays with no internet at all.
// Only the online scoreboard needs a connection.
//
// >>> WHEN YOU UPDATE GAME FILES: bump this version number and re-upload
//     sw.js too - that makes every player's browser fetch the new files.
const CACHE_VERSION = 'rhythm-heaven-v1';

const ASSETS = [
    './',
    './assets/Exit.png',
    './assets/Resume.png',
    './assets/Retry.png',
    './assets/Start.png',
    './assets/ahhc.mp3',
    './assets/ahhn.mp3',
    './assets/ahhp.mp3',
    './assets/beatmaps/blue_bird.json',
    './assets/beatmaps/fan_club.json',
    './assets/beatmaps/glee_club.json',
    './assets/beatmaps/hole_in_one.json',
    './assets/beatmaps/karate_man.json',
    './assets/beatmaps/remix_9.json',
    './assets/bluebirds.mp3',
    './assets/chiliglee.png',
    './assets/dance.png',
    './assets/dogfight.png',
    './assets/end.mp3',
    './assets/fanclub.mp3',
    './assets/gleebad.png',
    './assets/gleebg.png',
    './assets/gleeclub.mp3',
    './assets/gleeok.png',
    './assets/gleeperfect.png',
    './assets/hersheyglee.png',
    './assets/holeinone.mp3',
    './assets/intro.mp3',
    './assets/introbg.png',
    './assets/karateman.mp3',
    './assets/mock/bg_birds.png',
    './assets/mock/bg_dojo.png',
    './assets/mock/bg_golf.png',
    './assets/mock/bg_neon.png',
    './assets/mock/bg_remix.png',
    './assets/mock/bird.png',
    './assets/mock/card_bluebirds.png',
    './assets/mock/card_fanclub.png',
    './assets/mock/card_glee.png',
    './assets/mock/card_golf.png',
    './assets/mock/card_karate.png',
    './assets/mock/card_remix.png',
    './assets/mock/idol.png',
    './assets/mock/kpop_cue.mp3',
    './assets/mock/kpop_hit.mp3',
    './assets/mock/kpop_swipe.mp3',
    './assets/nuggetglee.png',
    './assets/pepperglee.png',
    './assets/rank_ok.mp3',
    './assets/rank_perfect.mp3',
    './assets/rank_superb.mp3',
    './assets/rank_tryagain.mp3',
    './assets/remix9.mp3',
    './assets/screecc.mp3',
    './assets/screenn.mp3',
    './assets/screep.mp3',
    './assets/select.mp3',
    './assets/selection.mp3',
    './assets/song.mp3',
    './assets/sqek.mp3',
    './assets/title.png',
    './assets/together.mp3',
    './icon-192.png',
    './icon-512.png',
    './index.html',
    './manifest.json',
    './phaser.js',
    './src/main.js',
    './src/overlay.js',
    './src/pvp.js',
    './src/scenes/End.js',
    './src/scenes/Game.js',
    './src/scenes/PvpLobby.js',
    './src/scenes/PvpResults.js',
    './src/scenes/Scoreboard.js',
    './src/scenes/SongSelect.js',
    './src/scenes/Start.js',
    './src/scoreboard.js',
    './src/songs.js'
];

// Install: pre-download everything into the cache (best-effort per file)
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_VERSION);
        await Promise.allSettled(ASSETS.map(a => cache.add(a)));
        self.skipWaiting();
    })());
});

// Activate: delete caches from older versions
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
        self.clients.claim();
    })());
});

// Fetch: cache-first for our own files; scoreboard/Firebase requests always
// go to the network (never cached - live data).
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        try {
            const res = await fetch(event.request);
            if (res.ok) {
                const cache = await caches.open(CACHE_VERSION);
                cache.put(event.request, res.clone());
            }
            return res;
        } catch (e) {
            // offline and not cached - nothing we can do
            return new Response('offline', { status: 503 });
        }
    })());
});
