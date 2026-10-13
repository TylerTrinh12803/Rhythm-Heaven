// src/scoreboard.js
// =====================================================================
//  SCOREBOARD DATA LAYER
//  ------------------------------------------------------------------
//  Two modes:
//
//  1) DEVICE-ONLY (default): scores live in this browser's localStorage.
//     Works immediately, but each phone/computer has its own board.
//
//  2) GLOBAL (everyone sees the same top 5): set SCOREBOARD_URL below to
//     a Firebase Realtime Database URL. Free 5-minute setup:
//       a. console.firebase.google.com -> Add project (any name, no analytics)
//       b. Build -> Realtime Database -> Create database -> Start in TEST mode
//       c. Copy the URL it shows (like https://xxxx-default-rtdb.firebaseio.com)
//       d. Paste it below and re-upload this file to your site. Done!
//     (Test-mode rules are open for 30 days; for a hobby game you can set
//      rules to {".read": true, ".write": true} afterwards - it's a game
//      leaderboard, nothing sensitive.)
//
//  Nicknames are CLAIMED per device: the first device to use a name owns
//  it, and other players typing the same name are told to pick another.
// =====================================================================

// >>> PASTE YOUR FIREBASE DATABASE URL HERE (or leave '' for device-only):
const SCOREBOARD_URL = (typeof window !== 'undefined' && window.SCOREBOARD_URL !== undefined)
    ? window.SCOREBOARD_URL   // (test hook - ignore)
    : '';

const GLOBAL = () => !!SCOREBOARD_URL;

// ---- small helpers --------------------------------------------------
function deviceId() {
    let id = null;
    try {
        id = localStorage.getItem('deviceId');
        if (!id) {
            id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem('deviceId', id);
        }
    } catch (e) { id = 'dev_anon'; }
    return id;
}

// "Pepper!" -> "pepper" : the key used to detect duplicate nicknames
export function nameKey(name) {
    return String(name).trim().toLowerCase().replace(/[^a-z0-9 _-]/g, '').replace(/\s+/g, '_');
}

export function validName(name) {
    const n = String(name).trim();
    return n.length >= 2 && n.length <= 12 && nameKey(n).length >= 2;
}

export function getSavedName() {
    try { return localStorage.getItem('playerName') || ''; } catch (e) { return ''; }
}
function saveName(name) {
    try { localStorage.setItem('playerName', name); } catch (e) {}
}

// ---- storage backends ----------------------------------------------
// fetch with a timeout so a flaky connection never freezes the scoreboard
function fetchT(url, options = {}, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function dbGet(path) {
    if (GLOBAL()) {
        const res = await fetchT(`${SCOREBOARD_URL}/${path}.json`);
        if (!res.ok) throw new Error('scoreboard fetch failed');
        return await res.json();
    }
    try {
        // exact key first...
        const exact = localStorage.getItem('db_' + path);
        if (exact !== null) return JSON.parse(exact);
        // ...otherwise aggregate children (e.g. reading "scores/glee" collects
        // every "scores/glee/<player>" entry into one object, like Firebase does)
        const prefix = 'db_' + path + '/';
        const out = {};
        let found = false;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
                out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k));
                found = true;
            }
        }
        return found ? out : null;
    } catch (e) { return null; }
}
async function dbSet(path, value) {
    if (GLOBAL()) {
        const res = await fetchT(`${SCOREBOARD_URL}/${path}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(value)
        });
        if (!res.ok) throw new Error('scoreboard save failed');
        return;
    }
    try { localStorage.setItem('db_' + path, JSON.stringify(value)); } catch (e) {}
}

// ---- public API -----------------------------------------------------

// Try to claim `name` for this device.
// Returns: 'ok' (claimed / already yours) | 'taken' | 'invalid' | 'error'
export async function claimName(name) {
    if (!validName(name)) return 'invalid';
    const key = nameKey(name);
    try {
        const owner = await dbGet(`names/${key}`);
        if (owner && owner !== deviceId()) return 'taken';
        if (!owner) await dbSet(`names/${key}`, deviceId());
        saveName(name.trim());
        return 'ok';
    } catch (e) {
        return 'error';
    }
}

// Submit a score (0-100). Keeps each player's BEST score per song.
export async function submitScore(songId, name, score) {
    const key = nameKey(name);
    try {
        const existing = await dbGet(`scores/${songId}/${key}`);
        if (existing && existing.score >= score) return 'kept';   // old score was better
        await dbSet(`scores/${songId}/${key}`, {
            name: name.trim(), score: Math.round(score), ts: Date.now()
        });
        return 'ok';
    } catch (e) {
        return 'error';
    }
}

// Top `n` scores for a song: [{name, score}] sorted best-first.
export async function topScores(songId, n = 5) {
    try {
        const all = await dbGet(`scores/${songId}`);
        if (!all) return [];
        return Object.values(all)
            .filter(e => e && typeof e.score === 'number')
            .sort((a, b) => b.score - a.score || (a.ts || 0) - (b.ts || 0))
            .slice(0, n);
    } catch (e) {
        return null;   // null = couldn't load (offline?)
    }
}

export function isGlobal() {
    return GLOBAL();
}
