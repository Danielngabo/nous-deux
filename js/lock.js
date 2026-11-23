// Optional 4-digit code that hides the app on this phone. Stored hashed, on this device only.
import { h } from './ui.js?v=4';
import { sfx, shake } from './fx.js?v=4';

const KEY = 'nd_pin';
export const hasPin = () => !!localStorage.getItem(KEY);
export const clearPin = () => localStorage.removeItem(KEY);

async function digest(pin) {
  const data = new TextEncoder().encode(`nous-deux:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function keypad(title, sub, onCode, footer) {
  let code = '';
  const dots = h('div', { class: 'pin-dots' }, [0, 1, 2, 3].map(() => h('i')));
  const msg = h('p', { class: 'muted' }, sub);
  const paint = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < code.length));
  const press = async (k) => {
    if (k === '⌫') code = code.slice(0, -1); else if (code.length < 4) code += k;
    paint();
    if (code.length === 4) {
      const c = code; code = '';
      const res = await onCode(c);
      if (res) { msg.textContent = res; shake(dots); sfx('lock'); }
      setTimeout(paint, 160);
    }
  };
  const el = h('div', { class: 'lock' },
    h('div', { class: 'duo big-duo on' }, h('i'), h('i')),
    h('h2', {}, title), msg, dots,
    h('div', { class: 'pin-pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) =>
      (k ? h('button', { onclick: () => press(k) }, k) : h('span')))),
    footer || null);
  document.body.append(el);
  return { el, say: (t) => { msg.textContent = t; } };
}

let open = null;
// Shows the lock screen until the right code is entered.
export function showLock(onForgot) {
  if (open || !hasPin()) return;
  open = keypad('Nous Deux', 'Entre ton code pour ouvrir', async (c) => {
    if ((await digest(c)) !== localStorage.getItem(KEY)) return 'Code incorrect';
    open.el.remove(); open = null;
    window.dispatchEvent(new Event('nd-unlocked'));
    return '';
  }, h('button', { class: 'link', onclick: onForgot }, 'Code oublié ? Se déconnecter'));
}
export const locked = () => !!open;

// Asks for a new code twice, then saves it.
export function choosePin(done) {
  let first = '';
  const k = keypad('Nouveau code', 'Choisis un code à 4 chiffres', async (c) => {
    if (!first) { first = c; k.say('Entre-le une seconde fois'); return ''; }
    if (c !== first) { first = ''; return 'Les deux codes sont différents. Recommence.'; }
    localStorage.setItem(KEY, await digest(c));
    k.el.remove(); done(true);
    return '';
  }, h('button', { class: 'link', onclick: () => { k.el.remove(); done(false); } }, 'Annuler'));
}
