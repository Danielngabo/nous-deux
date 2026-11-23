// Huit américain — jeu de cartes au tour par tour.
// On pose une carte de la même couleur (♠♥♦♣) ou de la même valeur. 8 = joker (on choisit la couleur),
// 2 = l'autre pioche 2 (cumulable), As = l'autre passe son tour. Le premier sans carte gagne.
import { h, rnd } from '../ui.js?v=4';
import { sfx } from '../fx.js?v=4';

const SUITS = ['S', 'H', 'D', 'C'];
const SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const LABEL = { J: 'V', Q: 'D', K: 'R' };
const rank = (c) => c.slice(0, -1);
const suit = (c) => c.slice(-1);
const mix = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function init() {
  const deck = mix(SUITS.flatMap((s) => RANKS.map((r) => r + s)));
  const hands = [deck.splice(0, 7), deck.splice(0, 7)];
  let k = deck.findIndex((c) => !['8', '2', 'A'].includes(rank(c)));
  if (k < 0) k = 0;
  const top = deck.splice(k, 1)[0];
  return { deck, pile: [top], hands, turn: 0, suit: suit(top), draw: 0, drew: false, winner: null, n: 0, last: '' };
}

export function playable(st, c) {
  const top = st.pile[st.pile.length - 1];
  if (st.draw > 0) return rank(c) === '2';
  return rank(c) === '8' || suit(c) === st.suit || rank(c) === rank(top);
}

const clone = (st) => ({ ...st, deck: st.deck.slice(), pile: st.pile.slice(), hands: [st.hands[0].slice(), st.hands[1].slice()], n: st.n + 1 });

function take(s, seat, n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (!s.deck.length) {
      if (s.pile.length <= 1) break;
      const top = s.pile.pop();
      s.deck = mix(s.pile); s.pile = [top];
    }
    s.hands[seat].push(s.deck.pop()); got++;
  }
  return got;
}

export function playCard(st, c, chosen) {
  const s = clone(st), me = st.turn;
  s.hands[me].splice(s.hands[me].indexOf(c), 1);
  s.pile.push(c);
  s.suit = rank(c) === '8' ? chosen : suit(c);
  s.drew = false; s.last = 'play';
  if (!s.hands[me].length) { s.winner = me; return s; }
  if (rank(c) === '2') { s.draw += 2; s.turn = 1 - me; }
  else if (rank(c) === 'A') s.last = 'skip';
  else s.turn = 1 - me;
  return s;
}

export function drawCards(st) {
  const s = clone(st), me = st.turn;
  if (s.draw > 0) { take(s, me, s.draw); s.draw = 0; s.turn = 1 - me; s.drew = false; s.last = 'penalty'; }
  else { const got = take(s, me, 1); s.drew = true; s.last = 'draw'; if (!got) { s.turn = 1 - me; s.drew = false; } }
  return s;
}

export function pass(st) {
  const s = clone(st);
  s.turn = 1 - st.turn; s.drew = false; s.last = 'pass';
  return s;
}

function cardEl(c, cls = '') {
  const red = suit(c) === 'H' || suit(c) === 'D';
  const r = LABEL[rank(c)] || rank(c);
  return h('button', { class: `card ${red ? 'red' : ''} ${cls}`, 'data-c': c },
    h('span', { class: 'card-r' }, r), h('span', { class: 'card-s' }, SYM[suit(c)]));
}

export default {
  id: 'cartes',
  title: 'Huit américain',
  emoji: '🃏',
  kind: 'turn',
  desc: 'Même couleur ou même valeur. 8 = joker, 2 = +2 cartes, As = l’autre passe.',
  init,

  mount(ctx) {
    let st = ctx.state, shownFor = -1, picking = null;
    const el = h('div', { class: 'turn-game cards' });
    ctx.root.append(el);
    const commit = (s) => { st = s; picking = null; sfx('move'); render(); ctx.save(st, st.winner); };

    function render() {
      const seat = ctx.seat(), other = 1 - seat;
      const mine = st.turn === seat && st.winner == null;
      // pass-and-play (solo): hide the hand until the next player is holding the phone
      if (ctx.solo && st.winner == null && shownFor !== seat) {
        el.replaceChildren(h('div', { class: 'handover' },
          h('div', { class: 'big' }, '🃏'), `Au tour du joueur ${seat + 1}`,
          h('button', { class: 'btn', onclick: () => { shownFor = seat; render(); } }, 'Voir mes cartes')));
        return;
      }
      const top = st.pile[st.pile.length - 1];
      const hand = st.hands[seat].slice().sort((a, b) => SUITS.indexOf(suit(a)) - SUITS.indexOf(suit(b)) || RANKS.indexOf(rank(a)) - RANKS.indexOf(rank(b)));
      const canPlay = mine && hand.some((c) => playable(st, c));
      const msg = st.winner != null ? 'Partie terminée'
        : !mine ? `Au tour de ${ctx.names.partner}…`
          : st.draw > 0 ? `Pose un 2 ou pioche ${st.draw} cartes`
            : canPlay ? 'À toi de jouer' : st.drew ? 'Rien à poser : passe ton tour' : 'Rien à poser : pioche';
      const suitRed = st.suit === 'H' || st.suit === 'D';
      el.replaceChildren(...[
        h('div', { class: 'opp' }, h('span', {}, ctx.names.partner),
          h('div', { class: 'opp-cards' }, st.hands[other].slice(0, 12).map(() => h('i'))),
          h('b', {}, `${st.hands[other].length}`)),
        h('div', { class: 'table' },
          h('button', { class: 'card back', disabled: !mine || (st.drew && st.draw === 0), onclick: () => mine && commit(drawCards(st)) },
            h('span', { class: 'card-s' }, st.draw > 0 ? `+${st.draw}` : '＋'), h('span', { class: 'card-n' }, `${st.deck.length}`)),
          cardEl(top, 'top'),
          h('div', { class: `suit-now ${suitRed ? 'red' : ''}` }, SYM[st.suit])),
        h('div', { class: 'turn-info' }, msg,
          mine && st.drew && st.draw === 0 ? h('button', { class: 'btn small', onclick: () => commit(pass(st)) }, 'Passer') : null),
        picking
          ? h('div', { class: 'suit-pick' }, 'Choisis la couleur :', SUITS.map((s) =>
            h('button', { class: `suit-btn ${s === 'H' || s === 'D' ? 'red' : ''}`, onclick: () => commit(playCard(st, picking, s)) }, SYM[s])))
          : null,
        h('div', { class: 'hand' }, hand.map((c) => cardEl(c, mine && playable(st, c) ? 'ok' : 'no'))),
      ].filter(Boolean));
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('.hand .card');
      if (!b || st.turn !== ctx.seat() || st.winner != null) return;
      const c = b.dataset.c;
      if (!playable(st, c)) return;
      if (rank(c) === '8' && st.hands[st.turn].length > 1) { picking = c; return render(); }
      commit(playCard(st, c, suit(c)));
    });
    ctx.onState((s) => { if (s && s.n >= st.n) { if (s.n > st.n) sfx('move'); st = s; picking = null; render(); } });
    render();
    return { destroy: () => el.remove() };
  },
};
