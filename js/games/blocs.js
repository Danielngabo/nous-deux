// Blocs — the runner stacks falling blocks to clear lines, the saboteur makes it harder.
import { h, fitCanvas, roundRect, rnd } from '../ui.js?v=4';
import { sfx } from '../fx.js?v=4';

const COLS = 10, ROWS = 18, CS = 20, SIDE = 84, W = COLS * CS + SIDE, H = ROWS * CS, GOAL = 12;
const TYPES = 'IOTSZJL';
const BASE = {
  I: [4, [[0, 1], [1, 1], [2, 1], [3, 1]]],
  O: [2, [[0, 0], [1, 0], [0, 1], [1, 1]]],
  T: [3, [[1, 0], [0, 1], [1, 1], [2, 1]]],
  S: [3, [[1, 0], [2, 0], [0, 1], [1, 1]]],
  Z: [3, [[0, 0], [1, 0], [1, 1], [2, 1]]],
  J: [3, [[0, 0], [0, 1], [1, 1], [2, 1]]],
  L: [3, [[2, 0], [0, 1], [1, 1], [2, 1]]],
};
const COLORS = ['', '#6fd3ff', '#ffc857', '#c58bff', '#5ee0b5', '#ff6b5e', '#6f8cff', '#ff9d5c', '#6b5f7d'];

function cells(p) {
  const [n, base] = BASE[p.t];
  let out = base;
  for (let i = 0; i < p.r % 4; i++) out = out.map(([x, y]) => [n - 1 - y, x]);
  return out.map(([x, y]) => [x + p.x, y + p.y]);
}
const collide = (g, p) => cells(p).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && g[y][x]));

function block(g, x, y, color, alpha = 1) {
  g.globalAlpha = alpha; g.fillStyle = color;
  roundRect(g, x + 1, y + 1, CS - 2, CS - 2, 5); g.fill();
  g.globalAlpha = alpha * 0.28; g.fillStyle = '#fff';
  roundRect(g, x + 3, y + 3, CS - 6, 4, 2); g.fill();
  g.globalAlpha = 1;
}

function draw(g, s, flash = 0) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#1d1230'; roundRect(g, 0, 0, COLS * CS, H, 10); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.04)';
  for (let x = 1; x < COLS; x++) { g.beginPath(); g.moveTo(x * CS, 0); g.lineTo(x * CS, H); g.stroke(); }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (s.g[y][x]) block(g, x * CS, y * CS, COLORS[s.g[y][x]]);
  if (s.cur) {
    const ghost = { ...s.cur };
    while (!collide(s.g, { ...ghost, y: ghost.y + 1 })) ghost.y++;
    const col = COLORS[TYPES.indexOf(s.cur.t) + 1];
    for (const [x, y] of cells(ghost)) if (y >= 0) block(g, x * CS, y * CS, col, 0.22);
    for (const [x, y] of cells(s.cur)) if (y >= 0) block(g, x * CS, y * CS, col);
  }
  if (s.fx[1] > 0) {
    g.fillStyle = 'rgba(27,20,38,.96)'; g.fillRect(0, (ROWS - 8) * CS, COLS * CS, 8 * CS);
    g.font = '28px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('🌫️', (COLS * CS) / 2, (ROWS - 4) * CS);
  }
  if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash * 0.5})`; roundRect(g, 0, 0, COLS * CS, H, 10); g.fill(); }
  const sx = COLS * CS + 10;
  g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillStyle = '#a99bb8'; g.font = '600 11px system-ui'; g.fillText('SUIVANTE', sx, 6);
  g.fillStyle = '#221933'; roundRect(g, sx, 22, 70, 56, 8); g.fill();
  if (s.next) {
    const [n, base] = BASE[s.next];
    const col = COLORS[TYPES.indexOf(s.next) + 1], q = 14;
    const ox = sx + (70 - n * q) / 2, oy = 22 + (56 - (s.next === 'I' ? 3 : 2) * q) / 2;
    g.fillStyle = col;
    for (const [x, y] of base) { roundRect(g, ox + x * q + 1, oy + y * q + 1, q - 2, q - 2, 3); g.fill(); }
  }
  g.fillStyle = '#a99bb8'; g.font = '600 11px system-ui'; g.fillText('LIGNES', sx, 96);
  g.fillStyle = '#f6efe9'; g.font = '700 22px system-ui'; g.fillText(`${Math.min(s.lines, GOAL)}/${GOAL}`, sx, 110);
  g.font = '600 11px system-ui'; g.fillStyle = '#ffc857';
  if (s.fx[0] > 0) g.fillText('⚡ accéléré', sx, 146);
  if (s.trap) g.fillText('🪤 piégée', sx, 162);
}

export default {
  id: 'blocs',
  title: 'Blocs',
  emoji: '🟪',
  kind: 'duel',
  desc: `L’un empile pour faire ${GOAL} lignes, l’autre envoie pièges et lignes en trop.`,
  sabotages: [
    { id: 'garbage', label: 'Ligne piège', emoji: '🧱', cost: 4 },
    { id: 'fast', label: 'Accélérer', emoji: '⚡', cost: 3 },
    { id: 'trap', label: 'Pièce piège', emoji: '🪤', cost: 3 },
    { id: 'fog', label: 'Brouillard', emoji: '🌫️', cost: 3 },
  ],

  mount(stage) {
    const cv = fitCanvas(stage, W, H);
    let lines = 0, flashAt = 0;
    return {
      cv,
      draw(s) {
        if (s.lines > lines) { flashAt = performance.now(); sfx('line'); }
        lines = s.lines;
        draw(cv.g, s, Math.max(0, 1 - (performance.now() - flashAt) / 260));
      },
      destroy: () => cv.off(),
    };
  },

  run(view, panel, io) {
    const pick = () => TYPES[rnd(7)];
    const s = { g: Array.from({ length: ROWS }, () => Array(COLS).fill(0)), cur: null, next: pick(), lines: 0, fx: [0, 0], trap: false };
    let over = false, raf = 0, prev = performance.now(), acc = 0;
    const finish = (who) => { if (!over) { over = true; io.end(who); } };

    function spawn() {
      s.cur = { t: s.next, r: 0, x: s.next === 'O' ? 4 : 3, y: 0 };
      s.next = pick(); s.trap = false;
      if (collide(s.g, s.cur)) finish('saboteur');
    }
    function lock() {
      for (const [x, y] of cells(s.cur)) {
        if (y < 0) { finish('saboteur'); return; }
        s.g[y][x] = TYPES.indexOf(s.cur.t) + 1;
      }
      const keep = s.g.filter((row) => row.some((v) => !v));
      const n = ROWS - keep.length;
      while (keep.length < ROWS) keep.unshift(Array(COLS).fill(0));
      s.g = keep; s.lines += n;
      if (s.lines >= GOAL) { s.cur = null; return finish('runner'); }
      spawn();
    }
    const tryMove = (dx, dy, dr = 0) => {
      if (over || !s.cur) return false;
      const kicks = dr ? [0, -1, 1, -2, 2] : [0];
      for (const k of kicks) {
        const p = { ...s.cur, x: s.cur.x + dx + k, y: s.cur.y + dy, r: s.cur.r + dr };
        if (!collide(s.g, p)) { s.cur = p; return true; }
      }
      return false;
    };
    const down = () => { if (!tryMove(0, 1)) lock(); acc = 0; };
    const drop = () => { if (over || !s.cur) return; while (tryMove(0, 1)); sfx('move'); lock(); acc = 0; };
    const acts = { left: () => tryMove(-1, 0), right: () => tryMove(1, 0), rot: () => tryMove(0, 0, 1), down, drop };

    // touch controls (hold to repeat for moves)
    const timers = new Set();
    const btn = (label, act, repeat) => {
      let t1 = 0, t2 = 0;
      const stop = () => { clearTimeout(t1); clearInterval(t2); timers.delete(stop); };
      const b = h('button', { class: 'pad', 'aria-label': act }, label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); acts[act]();
        if (repeat) { stop(); timers.add(stop); t1 = setTimeout(() => { t2 = setInterval(acts[act], 70); }, 230); }
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
      return b;
    };
    const pads = h('div', { class: 'pads' }, btn('◀', 'left', true), btn('⟳', 'rot'), btn('▶', 'right', true), btn('▼', 'down', true), btn('⤓', 'drop'));
    panel.append(pads);
    const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rot', ArrowDown: 'down', ' ': 'drop' };
    const onKey = (e) => { if (keys[e.key]) { e.preventDefault(); acts[keys[e.key]](); } };
    window.addEventListener('keydown', onKey);

    spawn();
    function loop(now) {
      const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
      s.fx[0] = Math.max(0, s.fx[0] - dt); s.fx[1] = Math.max(0, s.fx[1] - dt);
      acc += dt;
      const interval = s.fx[0] > 0 ? 0.16 : Math.max(0.26, 0.72 - s.lines * 0.03);
      if (acc >= interval && !over) down();
      view.draw(s);
      if (!over) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return {
      stop() { over = true; cancelAnimationFrame(raf); timers.forEach((f) => f()); window.removeEventListener('keydown', onKey); pads.remove(); },
      snap: () => ({ g: s.g, cur: s.cur, next: s.next, lines: s.lines, fx: s.fx.map((v) => (v > 0 ? 1 : 0)), trap: s.trap }),
      sab(id) {
        if (over) return;
        if (id === 'garbage') {
          if (s.g[0].some((v) => v)) return finish('saboteur');
          s.g.shift();
          const row = Array(COLS).fill(8); row[rnd(COLS)] = 0;
          s.g.push(row);
          if (s.cur && collide(s.g, s.cur)) s.cur.y -= 1;
        } else if (id === 'fast') s.fx[0] = 8;
        else if (id === 'trap') { s.next = Math.random() < 0.5 ? 'S' : 'Z'; s.trap = true; }
        else if (id === 'fog') s.fx[1] = 7;
      },
    };
  },
};
