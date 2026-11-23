import briques from './briques.js?v=4';
import blocs from './blocs.js?v=4';
import bonbons from './bonbons.js?v=4';
import dames from './dames.js?v=4';
import cartes from './cartes.js?v=4';
import quiz from './quiz.js?v=4';

export const GAME_LIST = [briques, blocs, bonbons, quiz, dames, cartes];
export const GAMES = Object.fromEntries(GAME_LIST.map((g) => [g.id, g]));
