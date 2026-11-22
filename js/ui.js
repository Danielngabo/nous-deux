// Tiny DOM helpers shared by the app and the games.
export const $ = (s, r = document) => r.querySelector(s);

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function toast(text, ms = 2200) {
  const box = $('#toasts');
  const t = h('div', { class: 'toast' }, text);
  box.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 350);
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rnd = (n) => Math.floor(Math.random() * n);

// A canvas with a fixed logical size (W×H) that scales to fill its container.
export function fitCanvas(stage, W, H) {
  const c = h('canvas', { class: 'cv' });
  stage.append(c);
  const g = c.getContext('2d');
  const fit = () => {
    const r = stage.getBoundingClientRect();
    const s = Math.min(r.width / W, r.height / H) || 1;
    const d = Math.min(window.devicePixelRatio || 1, 3);
    c.style.width = `${Math.floor(W * s)}px`;
    c.style.height = `${Math.floor(H * s)}px`;
    c.width = Math.max(1, Math.round(W * s * d));
    c.height = Math.max(1, Math.round(H * s * d));
    g.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  return {
    c, g,
    off: () => ro.disconnect(),
    toLocal: (e) => {
      const r = c.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
    },
  };
}

export function roundRect(g, x, y, w, hh, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + hh, r);
  g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
