// src/pvp.js
// =====================================================================
//  ONLINE PVP - up to 5 players race for accuracy on the same song.
//  ------------------------------------------------------------------
//  How it works (uses the same Firebase database as the scoreboard, so
//  it needs SCOREBOARD_URL configured in src/scoreboard.js + internet):
//
//   * A HOST creates a room -> gets a 4-letter ROOM CODE.
//   * Up to 4 more players type that code on their own phones to join.
//   * The host picks the song and hits START -> everyone's device counts
//     down and plays the SAME song at the same time.
//   * While playing, each device uploads its live accuracy % every 2.5s.
//   * When everyone finishes: ranking for the song, plus OVERALL
//     standings (1st place = 5 pts, 2nd = 4 pts ... across rounds).
//   * The host can start another round with a new song - points add up.
//
//  Data lives under rooms/<CODE> in the database and is polled over REST
//  (simple + reliable; a 1-2s lobby delay is fine for a party game).
// =====================================================================

import { nameKey } from './scoreboard.js';

export const MAX_PLAYERS = 5;

// --- tiny REST helpers (same database as the scoreboard) --------------
function baseUrl() {
    // read the URL the scoreboard module was configured with
    return (typeof window !== 'undefined' && window.SCOREBOARD_URL !== undefined)
        ? window.SCOREBOARD_URL
        : '';
}
export function pvpAvailable() {
    return !!baseUrl() && (typeof navigator === 'undefined' || navigator.onLine !== false);
}

function fetchT(url, options = {}, ms = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(t));
}
async function get(path) {
    const res = await fetchT(`${baseUrl()}/rooms/${path}.json`);
    if (!res.ok) throw new Error('pvp fetch failed');
    return res.json();
}
async function put(path, value) {
    const res = await fetchT(`${baseUrl()}/rooms/${path}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value)
    });
    if (!res.ok) throw new Error('pvp save failed');
}

// --- rooms ------------------------------------------------------------
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';   // no confusing I/L/O
function makeCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
}

export async function createRoom(hostName) {
    const code = makeCode();
    await put(code, {
        state: 'lobby',
        round: 1,
        songId: null,
        host: nameKey(hostName),
        created: Date.now(),
        players: { [nameKey(hostName)]: { name: hostName, points: 0 } }
    });
    return code;
}

export async function joinRoom(code, name) {
    code = code.trim().toUpperCase();
    const room = await get(code);
    if (!room || !room.players) return { error: 'That room code was not found!' };
    if (room.state !== 'lobby') return { error: 'That game already started!' };
    const key = nameKey(name);
    const count = Object.keys(room.players).length;
    if (!room.players[key] && count >= MAX_PLAYERS) return { error: 'Room is full (5 players max)!' };
    await put(`${code}/players/${key}`, { name, points: room.players[key]?.points || 0 });
    return { code };
}

export function readRoom(code) { return get(code); }

export function setSong(code, songId) { return put(`${code}/songId`, songId); }

// host presses start
export function startRound(code) { return put(`${code}/state`, 'playing'); }

// live + final score upload during a round
export function postScore(code, round, name, score, done) {
    return put(`${code}/scores/${round}/${nameKey(name)}`,
        { name, score: Math.round(score), done: !!done, ts: Date.now() });
}

export function readScores(code, round) { return get(`${code}/scores/${round}`); }

// HOST ONLY: compute the round ranking + updated totals, publish for everyone
export async function publishResults(code, round) {
    const room = await get(code);
    const scores = (await get(`${code}/scores/${round}`)) || {};
    const entries = Object.entries(scores)
        .map(([k, v]) => ({ key: k, name: v.name, score: v.score || 0 }))
        .sort((a, b) => b.score - a.score);
    // points: 1st gets MAX_PLAYERS, next one fewer, ... minimum 1
    entries.forEach((e, i) => { e.points = Math.max(MAX_PLAYERS - i, 1); });

    const players = room.players || {};
    entries.forEach(e => {
        if (players[e.key]) players[e.key].points = (players[e.key].points || 0) + e.points;
        else players[e.key] = { name: e.name, points: e.points };
        e.total = players[e.key].points;
    });
    await put(`${code}/players`, players);
    await put(`${code}/results/${round}`, { ranking: entries, ts: Date.now() });
    return entries;
}

export function readResults(code, round) { return get(`${code}/results/${round}`); }

// host: back to the lobby for another song
export async function nextRound(code, round) {
    await put(`${code}/round`, round + 1);
    await put(`${code}/songId`, null);
    await put(`${code}/state`, 'lobby');
}

export async function leaveRoom(code, name) {
    try { await put(`${code}/players/${nameKey(name)}`, null); } catch (e) {}
}
