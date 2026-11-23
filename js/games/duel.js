// Shared frame for "duel" games: one partner plays (runner), the other sabotages.
// The runner's phone owns the simulation and streams snapshots; the saboteur's
// phone redraws them and sends sabotage orders paid for with energy.
import { h, wait } from '../ui.js';
import { sfx, shake } from '../fx.js';

const MAX_ENERGY = 10;
const REGEN = 1 / 1.6; // energy per second

export function mountDuel(game, ctx) {
  const stage = h('div', { class: 'duel-stage' });
  const panel = h('div', { class: 'duel-panel' });
  const wrap = h('div', { class: 'duel' }, stage, panel);
  ctx.root.append(wrap);
  const view = game.mount(stage);
  const stops = [];
  let ended = false;
  const end = (winnerRole) => {
    if (ended) return;
    ended = true;
    ctx.finish(winnerRole);
  };

  if (ctx.role === 'runner') {
    let sim = null;
    const overlay = h('div', { class: 'wait' },
      h('div', { class: 'dots' }, h('i'), h('i'), h('i')),
      `En attente de ${ctx.names.partner}…`);
    const applySab = (id) => {
      const s = game.sabotages.find((x) => x.id === id);
      if (!sim || ended || !s) return;
      sim.sab(id);
      ctx.toast(`${s.emoji} ${s.label} !`);
      sfx('sab'); shake(stage, 'hit');
    };
    let starting = false;
    const begin = async () => {
      if (sim || starting) return;
      starting = true;
      overlay.remove();
      const count = h('div', { class: 'count' });
      stage.append(count);
      for (const n of ['3', '2', '1', 'GO']) {
        if (ended) return;
        count.textContent = n; count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop');
        sfx(n === 'GO' ? 'go' : 'tick');
        if (!ctx.solo) ctx.send('count', n);
        await wait(n === 'GO' ? 450 : 700);
      }
      count.remove();
      if (ended) return;
      sim = game.run(view, panel, { end });
      stops.push(() => sim.stop());
      if (ctx.solo) {
        stops.push(startBot(game, applySab));
      } else {
        const iv = setInterval(() => ctx.send('snap', sim.snap()), 140);
        stops.push(() => clearInterval(iv));
      }
    };
    ctx.on('ready', begin);
    ctx.on('sab', applySab);
    if (ctx.solo) begin(); else stage.append(overlay);
  } else {
    let last = null;
    let lastT = 0;
    let energy = 2;
    const uses = {};
    const fill = h('i');
    const status = h('div', { class: 'sab-status' }, `En attente de ${ctx.names.partner}…`);
    const buttons = game.sabotages.map((s) => {
      const b = h('button', {
        class: 'sab', disabled: true,
        onclick: () => {
          if (energy < s.cost || (s.max && (uses[s.id] || 0) >= s.max)) return;
          energy -= s.cost;
          uses[s.id] = (uses[s.id] || 0) + 1;
          ctx.send('sab', s.id);
          sfx('sab'); shake(stage, 'hit');
          b.classList.remove('fired'); void b.offsetWidth; b.classList.add('fired');
          tick();
        },
      }, h('span', { class: 'sab-e' }, s.emoji), h('span', { class: 'sab-l' }, s.label),
      h('span', { class: 'sab-c' }, `⚡${s.cost}`));
      return [s, b];
    });
    panel.append(
      h('div', { class: 'energy' }, h('span', {}, '⚡'), h('div', { class: 'bar' }, fill)),
      h('div', { class: 'sabs' }, buttons.map((x) => x[1])),
      status,
    );
    const tick = () => {
      fill.style.width = `${(energy / MAX_ENERGY) * 100}%`;
      for (const [s, b] of buttons) {
        const spent = s.max && (uses[s.id] || 0) >= s.max;
        b.disabled = !last || ended || energy < s.cost || spent;
        b.classList.toggle('spent', !!spent);
      }
      if (last) status.textContent = performance.now() - lastT > 4000 ? 'Connexion perdue… on patiente' : 'Mets-lui des bâtons dans les roues 😈';
    };
    const regen = setInterval(() => {
      if (last) energy = Math.min(MAX_ENERGY, energy + REGEN * 0.2);
      tick();
    }, 200);
    let counting = false;
    const ready = setInterval(() => { if (!last && !counting) ctx.send('ready', 1); }, 1000);
    ctx.send('ready', 1);
    const count = h('div', { class: 'count' });
    ctx.on('count', (n) => {
      counting = true;
      if (!count.isConnected) stage.append(count);
      count.textContent = n; count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop');
      sfx(n === 'GO' ? 'go' : 'tick');
      if (n === 'GO') setTimeout(() => count.remove(), 450);
    });
    ctx.on('snap', (s) => { last = s; lastT = performance.now(); });
    let raf = requestAnimationFrame(function loop(now) {
      if (last) view.draw(game.extrapolate ? game.extrapolate(last, (now - lastT) / 1000) : last);
      raf = requestAnimationFrame(loop);
    });
    stops.push(() => clearInterval(regen), () => clearInterval(ready), () => cancelAnimationFrame(raf));
  }

  return {
    destroy() {
      ended = true;
      stops.forEach((f) => f());
      view.destroy?.();
      wrap.remove();
    },
  };
}

// Solo practice: a simple bot plays the saboteur with the same energy rules.
function startBot(game, applySab) {
  let energy = 2;
  const uses = {};
  const iv = setInterval(() => {
    energy = Math.min(MAX_ENERGY, energy + REGEN);
    if (Math.random() > 0.22) return;
    const ok = game.sabotages.filter((s) => s.cost <= energy && !(s.max && (uses[s.id] || 0) >= s.max));
    if (!ok.length) return;
    const s = ok[Math.floor(Math.random() * ok.length)];
    energy -= s.cost;
    uses[s.id] = (uses[s.id] || 0) + 1;
    applySab(s.id);
  }, 1000);
  return () => clearInterval(iv);
}
