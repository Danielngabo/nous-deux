// Small pleasures: synthesized sounds, floating emojis, confetti, shakes.
let ac = null;
export const soundOn = () => localStorage.getItem('nd_sound') !== '0';
export const setSound = (v) => localStorage.setItem('nd_sound', v ? '1' : '0');

function audio() {
  try {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ac = new C(); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch { return null; }
}
// iOS only lets sound start from a touch: unlock on the first one.
window.addEventListener('pointerdown', () => { if (soundOn()) audio(); }, { passive: true });

// [frequency, start, duration, wave, volume, slideTo]
const SFX = {
  send: [[520, 0, 0.06, 'sine', 0.09], [780, 0.05, 0.09, 'sine', 0.09]],
  recv: [[700, 0, 0.07, 'sine', 0.1], [930, 0.07, 0.12, 'sine', 0.1]],
  react: [[880, 0, 0.05, 'triangle', 0.09], [1320, 0.05, 0.1, 'triangle', 0.08]],
  heart: [[440, 0, 0.12, 'sine', 0.1], [660, 0.1, 0.12, 'sine', 0.1], [880, 0.2, 0.2, 'sine', 0.1]],
  hit: [[620, 0, 0.05, 'square', 0.04, 880]],
  line: [[520, 0, 0.08, 'triangle', 0.1], [660, 0.07, 0.08, 'triangle', 0.1], [990, 0.14, 0.16, 'triangle', 0.1]],
  move: [[320, 0, 0.05, 'triangle', 0.1, 220]],
  sab: [[420, 0, 0.22, 'sawtooth', 0.07, 110]],
  life: [[300, 0, 0.25, 'square', 0.06, 90]],
  tick: [[660, 0, 0.08, 'square', 0.05]],
  go: [[990, 0, 0.25, 'square', 0.06]],
  win: [[523, 0, 0.12, 'triangle', 0.11], [659, 0.11, 0.12, 'triangle', 0.11], [784, 0.22, 0.12, 'triangle', 0.11], [1047, 0.33, 0.35, 'triangle', 0.12]],
  lose: [[392, 0, 0.18, 'triangle', 0.1], [330, 0.17, 0.18, 'triangle', 0.1], [262, 0.34, 0.4, 'triangle', 0.1]],
  lock: [[240, 0, 0.09, 'square', 0.05], [180, 0.09, 0.12, 'square', 0.05]],
};

const last = {};
export function sfx(name) {
  if (!soundOn() || !SFX[name]) return;
  const now = performance.now();
  if (now - (last[name] || 0) < 45) return; // avoid machine-gun repeats
  last[name] = now;
  const a = audio();
  if (!a) return;
  for (const [f, t, d, type = 'sine', vol = 0.1, slide] of SFX[name]) {
    const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + t;
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + d + 0.03);
  }
}

function layer() {
  let l = document.getElementById('fx');
  if (!l) { l = document.createElement('div'); l.id = 'fx'; document.body.append(l); }
  return l;
}
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Emojis that rise from the bottom of the screen.
export function burst(emoji, n = 12) {
  if (calm()) n = Math.min(n, 3);
  const l = layer();
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'fly';
    s.textContent = emoji;
    s.style.left = `${6 + Math.random() * 88}%`;
    s.style.fontSize = `${22 + Math.random() * 30}px`;
    s.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
    s.style.animationDelay = `${Math.random() * 0.5}s`;
    s.style.setProperty('--dx', `${Math.random() * 80 - 40}px`);
    s.addEventListener('animationend', () => s.remove());
    l.append(s);
  }
}

export function confetti(ms = 2400) {
  if (calm()) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const d = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
  c.width = W * d; c.height = H * d;
  layer().append(c);
  const g = c.getContext('2d');
  g.scale(d, d);
  const colors = ['#ff5d73', '#ffb627', '#4be3b0', '#b99cff', '#7fd0ff', '#fff'];
  const ps = Array.from({ length: 110 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 80, y: H * 0.42,
    vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 3,
    w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  (function loop(now) {
    const t = now - t0;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.max(0, 1 - Math.max(0, t - ms + 600) / 600);
    for (const p of ps) {
      p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      g.restore();
    }
    if (t < ms) requestAnimationFrame(loop); else c.remove();
  })(t0);
}

export function shake(el, cls = 'shake') {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}
