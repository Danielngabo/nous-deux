// Bonbons — the runner lines up sweets to reach a score, the saboteur freezes and scrambles.
import { h, wait, rnd } from '../ui.js';
import { sfx } from '../fx.js';

export const C = 7, R = 8, T = 6, STONE = 6, TARGET = 1400, MOVES = 20;
const EMOJI = ['🍓', '🍋', '🍇', '🍏', '🫐', '🍊', '🪨'];
const ty = (v) => v % 10;
const fz = (v) => Math.floor(v / 10);
const free = (v) => v != null && ty(v) < STONE && fz(v) === 0;

export function findMatches(g) {
  const out = new Set();
  const scan = (len, at) => {
    let run = 1;
    for (let i = 1; i <= len; i++) {
      const a = i < len ? g[at(i)] : null, b = g[at(i - 1)];
      if (a != null && b != null && ty(a) === ty(b) && ty(a) < STONE) { run++; continue; }
      if (run >= 3) for (let k = i - run; k < i; k++) out.add(at(k));
      run = 1;
    }
  };
  for (let r = 0; r < R; r++) scan(C, (i) => r * C + i);
  for (let c = 0; c < C; c++) scan(R, (i) => i * C + c);
  return out;
}

export function newBoard() {
  const g = [];
  for (let i = 0; i < R * C; i++) {
    let t;
    do { t = rnd(T); } while (
      (i % C >= 2 && ty(g[i - 1]) === t && ty(g[i - 2]) === t) ||
      (i >= 2 * C && ty(g[i - C]) === t && ty(g[i - 2 * C]) === t));
    g.push(t);
  }
  return hasMove(g) ? g : newBoard();
}

export function hasMove(g) {
  for (let i = 0; i < R * C; i++) {
    for (const j of [i % C < C - 1 ? i + 1 : -1, i + C < R * C ? i + C : -1]) {
      if (j < 0 || !free(g[i]) || !free(g[j])) continue;
      [g[i], g[j]] = [g[j], g[i]];
      const ok = findMatches(g).size > 0;
      [g[i], g[j]] = [g[j], g[i]];
      if (ok) return true;
    }
  }
  return false;
}

// Removes matched cells (and stones touching them), returns how many sweets were matched.
export function clearMatches(g, m) {
  for (const i of m) {
    for (const j of [i % C ? i - 1 : -1, i % C < C - 1 ? i + 1 : -1, i - C, i + C]) {
      if (j >= 0 && j < R * C && g[j] != null && ty(g[j]) === STONE) g[j] = null;
    }
  }
  for (const i of m) g[i] = null;
  return m.size;
}

export function collapse(g) {
  for (let c = 0; c < C; c++) {
    const col = [];
    for (let r = R - 1; r >= 0; r--) if (g[r * C + c] != null) col.push(g[r * C + c]);
    for (let r = R - 1, k = 0; r >= 0; r--, k++) g[r * C + c] = k < col.length ? col[k] : rnd(T);
  }
}

export function shuffle(g) {
  for (let n = 0; n < 200; n++) {
    for (let i = g.length - 1; i > 0; i--) { const j = rnd(i + 1); [g[i], g[j]] = [g[j], g[i]]; }
    if (!findMatches(g).size && hasMove(g)) return;
  }
  g.splice(0, g.length, ...newBoard());
}

export default {
  id: 'bonbons',
  title: 'Bonbons',
  emoji: '🍬',
  kind: 'duel',
  desc: `L’un aligne les fruits pour marquer ${TARGET} points en ${MOVES} coups, l’autre gèle et mélange.`,
  sabotages: [
    { id: 'freeze', label: 'Geler', emoji: '❄️', cost: 3 },
    { id: 'stones', label: 'Cailloux', emoji: '🪨', cost: 3 },
    { id: 'shuffle', label: 'Mélanger', emoji: '🌀', cost: 4 },
    { id: 'steal', label: 'Voler 2 coups', emoji: '🫳', cost: 6, max: 2 },
  ],

  mount(stage) {
    const fill = h('i');
    const score = h('b', {}, '0');
    const moves = h('b', {}, String(MOVES));
    const cellsEl = Array.from({ length: R * C }, (_, i) => h('button', { class: 'bb', 'data-i': i }));
    const grid = h('div', { class: 'bb-grid' }, cellsEl);
    const combo = h('div', { class: 'bb-combo' });
    let lastPop = '';
    const el = h('div', { class: 'bb-wrap' },
      h('div', { class: 'bb-hud' },
        h('div', { class: 'bb-score' }, '⭐ ', score, h('span', {}, ` / ${TARGET}`)),
        h('div', { class: 'bb-moves' }, moves, h('span', {}, ' coups'))),
      h('div', { class: 'bar' }, fill),
      h('div', { class: 'bb-board' }, grid, combo));
    stage.append(el);
    const view = {
      onTap: null,
      draw(s) {
        score.textContent = s.sc; moves.textContent = s.m;
        fill.style.width = `${Math.min(100, (s.sc / TARGET) * 100)}%`;
        const key = s.pop && s.pop.length ? s.pop.join() : '';
        if (key && key !== lastPop) {
          sfx(s.combo > 1 ? 'line' : 'hit');
          if (s.combo > 1) { combo.textContent = `Combo ×${s.combo}`; combo.classList.remove('show'); void combo.offsetWidth; combo.classList.add('show'); }
        }
        lastPop = key;
        for (let i = 0; i < R * C; i++) {
          const v = s.g[i], b = cellsEl[i];
          const txt = v == null ? '' : EMOJI[ty(v)];
          if (b.textContent !== txt) b.textContent = txt;
          b.className = `bb${v != null && fz(v) ? ' frozen' : ''}${s.sel === i ? ' sel' : ''}${s.pop && s.pop.includes(i) ? ' pop' : ''}`;
        }
      },
      destroy: () => el.remove(),
    };
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.bb');
      if (b && view.onTap) view.onTap(+b.dataset.i);
    });
    return view;
  },

  run(view, panel, io) {
    const s = { g: newBoard(), sc: 0, m: MOVES, sel: -1, pop: [], combo: 0 };
    let busy = false, over = false;
    const queue = [];
    const hint = h('div', { class: 'hint' }, 'Touche un fruit puis son voisin pour les échanger');
    panel.append(hint);
    const finish = (who) => { if (!over) { over = true; io.end(who); } };
    const paint = () => view.draw(s);

    async function resolve() {
      let combo = 1;
      for (;;) {
        const m = findMatches(s.g);
        if (!m.size) break;
        s.pop = [...m]; s.combo = combo; s.sc += m.size * 10 * combo; paint();
        await wait(190);
        clearMatches(s.g, m); s.pop = []; collapse(s.g); paint();
        await wait(170);
        combo++;
      }
      if (!hasMove(s.g)) { shuffle(s.g); paint(); }
    }

    function settle() {
      if (over) return;
      if (s.sc >= TARGET) return finish('runner');
      if (s.m <= 0) return finish('saboteur');
      while (queue.length) apply(queue.shift());
      paint();
    }

    function apply(id) {
      const pickCells = (n) => {
        const pool = s.g.map((v, i) => (free(v) ? i : -1)).filter((i) => i >= 0);
        const out = [];
        while (out.length < n && pool.length) out.push(pool.splice(rnd(pool.length), 1)[0]);
        return out;
      };
      if (id === 'freeze') for (const i of pickCells(6)) s.g[i] += 30;
      else if (id === 'stones') for (const i of pickCells(4)) s.g[i] = STONE;
      else if (id === 'shuffle') shuffle(s.g);
      else if (id === 'steal') s.m = Math.max(1, s.m - 2);
      if (!hasMove(s.g)) shuffle(s.g);
      s.sel = -1;
    }

    view.onTap = async (i) => {
      if (busy || over) return;
      const a = s.sel;
      const adjacent = a >= 0 && ((Math.abs(a - i) === 1 && Math.floor(a / C) === Math.floor(i / C)) || Math.abs(a - i) === C);
      if (!adjacent) { s.sel = free(s.g[i]) && a !== i ? i : -1; return paint(); }
      s.sel = -1;
      if (!free(s.g[i])) return paint();
      busy = true;
      [s.g[a], s.g[i]] = [s.g[i], s.g[a]]; paint();
      await wait(150);
      if (!findMatches(s.g).size) {
        [s.g[a], s.g[i]] = [s.g[i], s.g[a]]; paint();
      } else {
        s.m -= 1;
        for (let k = 0; k < s.g.length; k++) if (fz(s.g[k])) s.g[k] -= 10;
        await resolve();
      }
      busy = false;
      settle();
    };
    paint();

    return {
      stop() { over = true; view.onTap = null; hint.remove(); },
      snap: () => ({ g: s.g, sc: s.sc, m: s.m, sel: s.sel, pop: s.pop, combo: s.combo }),
      sab(id) {
        if (over) return;
        if (busy) queue.push(id); else { apply(id); paint(); }
      },
    };
  },
};
