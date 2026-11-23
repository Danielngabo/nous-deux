// Casse-briques saboteur — the runner clears the wall, the saboteur rebuilds it.
import { h, fitCanvas, roundRect, clamp, rnd } from '../ui.js?v=4';
import { sfx, shake } from '../fx.js?v=4';

const W = 320, H = 440, COLS = 8, BW = 36, BH = 14, GAP = 4, OX = 2, OY = 44, PITCH = 18;
const PY = H - 28, R = 5, MAXROW = 17, PW = 70, PW_MINI = 42;
const COLORS = ['#ff5d73', '#ffb627', '#4be3b0', '#7fd0ff', '#b99cff'];
const newRow = () => Array.from({ length: COLS }, () => 1 + rnd(COLORS.length));
const r1 = (v) => Math.round(v * 10) / 10;

function draw(g, s, fxs) {
  g.clearRect(0, 0, W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#24163a'); bg.addColorStop(1, '#170f26');
  g.fillStyle = bg; roundRect(g, 0, 0, W, H, 14); g.fill();
  // danger line: bricks reaching it lose the game
  g.strokeStyle = 'rgba(255,93,115,.4)'; g.setLineDash([4, 6]);
  g.beginPath(); g.moveTo(8, OY + MAXROW * PITCH); g.lineTo(W - 8, OY + MAXROW * PITCH); g.stroke();
  g.setLineDash([]);
  for (let r = 0; r < s.g.length; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = s.g[r][c];
      if (!v) continue;
      const x = OX + c * (BW + GAP), y = OY + r * PITCH;
      g.fillStyle = COLORS[v - 1]; roundRect(g, x, y, BW, BH, 4); g.fill();
      g.fillStyle = 'rgba(255,255,255,.28)'; roundRect(g, x + 2, y + 2, BW - 4, 3, 1.5); g.fill();
    }
  }
  for (const p of fxs.parts) {
    g.globalAlpha = Math.max(0, p.life); g.fillStyle = p.c;
    g.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  g.globalAlpha = 1;
  const ballColor = s.fx[0] > 0 ? '#ffb627' : '#ffffff';
  fxs.trail.forEach((t, i) => {
    g.globalAlpha = ((i + 1) / fxs.trail.length) * 0.3; g.fillStyle = ballColor;
    g.beginPath(); g.arc(t[0], t[1], R * ((i + 1) / fxs.trail.length), 0, Math.PI * 2); g.fill();
  });
  g.globalAlpha = 1;
  g.shadowBlur = 12;
  g.shadowColor = g.fillStyle = s.fx[2] > 0 ? '#b99cff' : s.fx[1] > 0 ? '#ff5d73' : '#f6efe9';
  roundRect(g, s.px - s.pw / 2, PY, s.pw, 9, 4.5); g.fill();
  g.shadowColor = g.fillStyle = ballColor;
  g.beginPath(); g.arc(s.b[0], s.b[1], R, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0;
  g.font = '15px system-ui'; g.textBaseline = 'top'; g.textAlign = 'left';
  g.fillText('❤️'.repeat(Math.max(0, s.l)), 10, 12);
  const tags = [];
  if (s.fx[0] > 0) tags.push('⚡ rapide');
  if (s.fx[1] > 0) tags.push('🤏 mini');
  if (s.fx[2] > 0) tags.push('🙃 inversé');
  g.textAlign = 'right'; g.fillStyle = '#ffb627'; g.font = '600 12px system-ui';
  g.fillText(tags.join('  '), W - 10, 15);
}

export default {
  id: 'briques',
  title: 'Casse-briques',
  emoji: '🧱',
  kind: 'duel',
  desc: 'L’un casse le mur, l’autre le reconstruit et sabote la balle.',
  sabotages: [
    { id: 'row', label: 'Rangée', emoji: '🧱', cost: 4, max: 4 },
    { id: 'fast', label: 'Balle rapide', emoji: '⚡', cost: 3 },
    { id: 'mini', label: 'Mini raquette', emoji: '🤏', cost: 3 },
    { id: 'inv', label: 'Inversion', emoji: '🙃', cost: 4 },
  ],

  mount(stage) {
    const cv = fitCanvas(stage, W, H);
    // view-local effects (sparks, ball trail) are derived from successive states,
    // so they also play on the saboteur's phone
    const fxs = { parts: [], trail: [] };
    let prev = null, lives = 3, t0 = performance.now();
    return {
      cv,
      draw(s) {
        const now = performance.now(), dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
        if (prev && s.g.length <= prev.length) {
          for (let r = 0; r < prev.length; r++) for (let c = 0; c < COLS; c++) {
            if (!prev[r][c] || (s.g[r] && s.g[r][c])) continue;
            sfx('hit');
            for (let k = 0; k < 7; k++) fxs.parts.push({ x: OX + c * (BW + GAP) + BW / 2, y: OY + r * PITCH + BH / 2, vx: (Math.random() - 0.5) * 170, vy: (Math.random() - 0.6) * 170, life: 1, c: COLORS[prev[r][c] - 1] });
          }
        }
        prev = s.g.map((row) => row.slice());
        if (s.l < lives) { sfx('life'); shake(cv.c); }
        lives = s.l;
        for (const p of fxs.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; p.life -= dt * 2.2; }
        fxs.parts = fxs.parts.filter((p) => p.life > 0);
        if (s.stuck > 0) fxs.trail.length = 0; else { fxs.trail.push([s.b[0], s.b[1]]); if (fxs.trail.length > 9) fxs.trail.shift(); }
        draw(cv.g, s, fxs);
      },
      destroy: () => cv.off(),
    };
  },

  extrapolate(s, dt) {
    if (s.stuck > 0) return s;
    const t = Math.min(dt, 0.2);
    return { ...s, b: [clamp(s.b[0] + s.b[2] * t, R, W - R), Math.max(R, s.b[1] + s.b[3] * t), s.b[2], s.b[3]] };
  },

  run(view, panel, io) {
    const s = { px: W / 2, pw: PW, b: [W / 2, PY - R - 1, 0, 0], g: [newRow(), newRow(), newRow(), newRow(), newRow()], l: 3, fx: [0, 0, 0], stuck: 1.4 };
    let target = W / 2, over = false, raf = 0, prev = performance.now();
    const c = view.cv.c;
    c.style.touchAction = 'none';
    const move = (e) => { target = view.cv.toLocal(e)[0]; e.preventDefault(); };
    c.addEventListener('pointerdown', move);
    c.addEventListener('pointermove', move);
    const hint = h('div', { class: 'hint' }, 'Glisse ton doigt pour déplacer la raquette');
    panel.append(hint);

    const speed = () => 235 * (s.fx[0] > 0 ? 1.45 : 1);
    const finish = (who) => { if (!over) { over = true; io.end(who); } };
    const trim = () => { while (s.g.length && s.g[s.g.length - 1].every((v) => !v)) s.g.pop(); };

    function step(dt) {
      for (let i = 0; i < 3; i++) s.fx[i] = Math.max(0, s.fx[i] - dt);
      s.pw = s.fx[1] > 0 ? PW_MINI : PW;
      s.px = clamp(s.fx[2] > 0 ? W - target : target, s.pw / 2, W - s.pw / 2);
      const b = s.b;
      if (s.stuck > 0) {
        s.stuck -= dt; b[0] = s.px; b[1] = PY - R - 1;
        if (s.stuck <= 0) { const a = Math.random() * 0.8 - 0.4; b[2] = speed() * Math.sin(a); b[3] = -speed() * Math.cos(a); }
        return;
      }
      const sp = speed(), v = Math.hypot(b[2], b[3]) || 1;
      b[2] *= sp / v; b[3] *= sp / v;
      if (Math.abs(b[3]) < sp * 0.25) { b[3] = Math.sign(b[3] || -1) * sp * 0.25; }
      const ox = b[0], oy = b[1];
      b[0] += b[2] * dt; b[1] += b[3] * dt;
      if (b[0] < R) { b[0] = R; b[2] = Math.abs(b[2]); }
      if (b[0] > W - R) { b[0] = W - R; b[2] = -Math.abs(b[2]); }
      if (b[1] < R) { b[1] = R; b[3] = Math.abs(b[3]); }
      if (b[3] > 0 && b[1] + R >= PY && oy + R <= PY + 7 && Math.abs(b[0] - s.px) <= s.pw / 2 + R) {
        const a = clamp((b[0] - s.px) / (s.pw / 2), -1, 1) * (Math.PI / 3);
        b[2] = sp * Math.sin(a); b[3] = -sp * Math.cos(a); b[1] = PY - R;
      }
      if (b[1] > H + 12) {
        s.l -= 1;
        if (s.l <= 0) return finish('saboteur');
        s.stuck = 1; b[2] = 0; b[3] = 0;
        return;
      }
      const r0 = Math.floor((b[1] - R - OY) / PITCH), r1_ = Math.floor((b[1] + R - OY) / PITCH);
      const c0 = Math.floor((b[0] - R - OX) / (BW + GAP)), c1 = Math.floor((b[0] + R - OX) / (BW + GAP));
      hit:
      for (let r = Math.max(0, r0); r <= Math.min(s.g.length - 1, r1_); r++) {
        for (let cc = Math.max(0, c0); cc <= Math.min(COLS - 1, c1); cc++) {
          if (!s.g[r][cc]) continue;
          const x = OX + cc * (BW + GAP), y = OY + r * PITCH;
          const nx = clamp(b[0], x, x + BW), ny = clamp(b[1], y, y + BH);
          if ((b[0] - nx) ** 2 + (b[1] - ny) ** 2 > R * R) continue;
          s.g[r][cc] = 0;
          if (ox < x || ox > x + BW) b[2] = -b[2]; else b[3] = -b[3];
          b[0] = ox; b[1] = oy;
          break hit;
        }
      }
      trim();
      if (!s.g.length) finish('runner');
    }

    function loop(now) {
      let dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      while (dt > 0 && !over) { const d = Math.min(dt, 1 / 120); step(d); dt -= d; }
      view.draw(s);
      if (!over) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return {
      stop() { over = true; cancelAnimationFrame(raf); c.removeEventListener('pointerdown', move); c.removeEventListener('pointermove', move); hint.remove(); },
      snap: () => ({ px: r1(s.px), pw: s.pw, b: s.b.map(r1), g: s.g, l: s.l, fx: s.fx.map(r1), stuck: s.stuck > 0 ? 1 : 0 }),
      sab(id) {
        if (over) return;
        if (id === 'row') {
          s.g.unshift(newRow());
          trim();
          if (s.g.length > MAXROW) finish('saboteur');
        } else if (id === 'fast') s.fx[0] = 6;
        else if (id === 'mini') s.fx[1] = 7;
        else if (id === 'inv') s.fx[2] = 5;
      },
    };
  },
};
