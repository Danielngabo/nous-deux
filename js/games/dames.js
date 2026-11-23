// Dames (10×10, règles internationales simplifiées) — tour par tour.
// Pièces : 1 pion blanc, 2 pion noir, 3 dame blanche, 4 dame noire. Les blancs (siège 0) montent.
import { h } from '../ui.js';
import { sfx } from '../fx.js';

const N = 10;
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const owner = (p) => (p ? (p % 2 ? 0 : 1) : -1);
const king = (p) => p >= 3;
const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

export function init() {
  const b = Array(N * N).fill(0);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if ((r + c) % 2 === 0) continue;
    if (r < 4) b[r * N + c] = 2; else if (r > 5) b[r * N + c] = 1;
  }
  return { b, turn: 0, chain: null, winner: null, n: 0 };
}

function captures(b, i) {
  const p = b[i], me = owner(p), r = Math.floor(i / N), c = i % N, out = [];
  for (const [dr, dc] of DIRS) {
    let rr = r + dr, cc = c + dc;
    if (king(p)) while (inside(rr, cc) && !b[rr * N + cc]) { rr += dr; cc += dc; }
    if (!inside(rr, cc) || owner(b[rr * N + cc]) !== 1 - me) continue;
    const over = rr * N + cc;
    rr += dr; cc += dc;
    while (inside(rr, cc) && !b[rr * N + cc]) {
      out.push({ from: i, to: rr * N + cc, over });
      if (!king(p)) break;
      rr += dr; cc += dc;
    }
  }
  return out;
}

function steps(b, i) {
  const p = b[i], r = Math.floor(i / N), c = i % N, out = [];
  for (const [dr, dc] of DIRS) {
    if (!king(p) && dr !== (owner(p) === 0 ? -1 : 1)) continue;
    let rr = r + dr, cc = c + dc;
    while (inside(rr, cc) && !b[rr * N + cc]) {
      out.push({ from: i, to: rr * N + cc });
      if (!king(p)) break;
      rr += dr; cc += dc;
    }
  }
  return out;
}

export function legal(st) {
  if (st.winner != null) return [];
  if (st.chain != null) return captures(st.b, st.chain);
  const mine = st.b.map((p, i) => (owner(p) === st.turn ? i : -1)).filter((i) => i >= 0);
  const caps = mine.flatMap((i) => captures(st.b, i));
  return caps.length ? caps : mine.flatMap((i) => steps(st.b, i));
}

export function play(st, mv) {
  const b = st.b.slice();
  const s = { b, turn: st.turn, chain: null, winner: null, n: st.n + 1, lm: [mv.from, mv.to] };
  b[mv.to] = b[mv.from]; b[mv.from] = 0;
  if (mv.over != null) {
    b[mv.over] = 0;
    if (captures(b, mv.to).length) { s.chain = mv.to; return s; }
  }
  const row = Math.floor(mv.to / N);
  if (b[mv.to] === 1 && row === 0) b[mv.to] = 3;
  if (b[mv.to] === 2 && row === N - 1) b[mv.to] = 4;
  s.turn = 1 - st.turn;
  if (!legal(s).length) s.winner = st.turn;
  return s;
}

export default {
  id: 'dames',
  title: 'Dames',
  emoji: '⚫',
  kind: 'turn',
  desc: 'Le grand classique, chacun son tour. La prise est obligatoire.',
  init,

  mount(ctx) {
    let st = ctx.state, sel = st.chain;
    const info = h('div', { class: 'turn-info' });
    const board = h('div', { class: 'dm-board' });
    const el = h('div', { class: 'turn-game' }, info, board);
    ctx.root.append(el);

    function render() {
      const seat = ctx.seat(), mine = st.turn === seat && st.winner == null;
      const moves = mine ? legal(st) : [];
      const count = (o) => st.b.filter((p) => owner(p) === o).length;
      info.replaceChildren(
        h('span', { class: `dm-dot ${seat === 0 ? 'w' : 'b'}` }),
        st.winner != null ? 'Partie terminée'
          : mine ? (st.chain != null ? 'Continue la prise !' : moves.some((m) => m.over != null) ? 'À toi — prise obligatoire' : 'À toi de jouer')
            : `Au tour de ${ctx.names.partner}…`,
        h('span', { class: 'dm-count' }, `⚪ ${count(0)} · ⚫ ${count(1)}`));
      const targets = new Set(moves.filter((m) => m.from === sel).map((m) => m.to));
      const movable = new Set(moves.map((m) => m.from));
      const kids = [];
      for (let k = 0; k < N * N; k++) {
        const i = seat === 1 ? N * N - 1 - k : k;
        const r = Math.floor(i / N), c = i % N, p = st.b[i];
        const sq = h('button', {
          class: `dm-sq ${(r + c) % 2 ? 'dark' : 'light'}${targets.has(i) ? ' target' : ''}${sel === i ? ' sel' : ''}${st.lm && st.lm.includes(i) ? ' last' : ''}`,
          'data-i': i,
        }, p ? h('span', { class: `dm-pc ${owner(p) === 0 ? 'w' : 'b'}${king(p) ? ' king' : ''}${movable.has(i) ? ' can' : ''}` }) : null);
        kids.push(sq);
      }
      board.replaceChildren(...kids);
    }

    board.addEventListener('click', (e) => {
      const sq = e.target.closest('.dm-sq');
      if (!sq || st.turn !== ctx.seat() || st.winner != null) return;
      const i = +sq.dataset.i, moves = legal(st);
      const mv = moves.find((m) => m.from === sel && m.to === i);
      if (mv) {
        st = play(st, mv); sel = st.chain; sfx('move'); render();
        ctx.save(st, st.winner);
      } else {
        sel = moves.some((m) => m.from === i) ? i : st.chain;
        render();
      }
    });
    ctx.onState((s) => { if (s && s.n >= st.n) { if (s.n > st.n) sfx('move'); st = s; sel = st.chain; render(); } });
    render();
    return { destroy: () => el.remove() };
  },
};
