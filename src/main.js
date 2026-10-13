import { Start } from './scenes/Start.js';
import { SongSelect } from './scenes/SongSelect.js';
import { Game } from './scenes/Game.js';
import { End } from './scenes/End.js';
import { Scoreboard } from './scenes/Scoreboard.js';
import { PvpLobby } from './scenes/PvpLobby.js';
import { PvpResults } from './scenes/PvpResults.js';

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    pixelArt: true,       // sharp pixel graphics
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    input: {
        activePointers: 2   // smoother multi-touch on phones
    },
    scene: [Start, SongSelect, Game, End, Scoreboard, PvpLobby, PvpResults]
};

const game = new Phaser.Game(config);
window.game = game;   // handy for debugging in the browser console
