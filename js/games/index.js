import briques from './briques.js';
import blocs from './blocs.js';
import bonbons from './bonbons.js';
import dames from './dames.js';
import cartes from './cartes.js';
import quiz from './quiz.js';

export const GAME_LIST = [briques, blocs, bonbons, quiz, dames, cartes];
export const GAMES = Object.fromEntries(GAME_LIST.map((g) => [g.id, g]));
