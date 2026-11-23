// Tu me connais ? — chacun répond pour soi, puis devine la réponse de l'autre.
// Tour par tour : le siège 0 répond aux 7 questions, puis le siège 1, puis on compare.
import { h, rnd } from '../ui.js';
import { sfx, confetti } from '../fx.js';

const N = 7;
const Q = [
  ['🏖️ Plage', '⛰️ Montagne'], ['🌅 Lève-tôt', '🌙 Couche-tard'], ['🍫 Sucré', '🧀 Salé'], ['☕ Café', '🍵 Thé'],
  ['🎬 Film à la maison', '🍽️ Dîner dehors'], ['📞 Appeler', '💬 Écrire'], ['🐶 Chien', '🐱 Chat'], ['🌧️ Pluie au chaud', '☀️ Grand soleil'],
  ['🎁 Offrir', '🎀 Recevoir'], ['🗺️ Tout planifier', '🎲 Improviser'], ['🏙️ Grande ville', '🌿 Campagne'], ['💃 Danser', '🎤 Chanter'],
  ['😂 Faire rire', '🤗 Faire un câlin'], ['🍕 Pizza', '🍗 Poulet braisé'], ['📚 Lire', '📺 Regarder une série'], ['🚗 Road trip', '✈️ Avion direct'],
  ['🧹 Ranger tout de suite', '🛋️ Ranger plus tard'], ['💌 Mots doux', '🫶 Petits gestes'], ['🎶 Musique à fond', '🤫 Silence'], ['🍳 Cuisiner', '🧽 Faire la vaisselle'],
  ['🎉 Grande fête', '🕯️ Soirée à deux'], ['🤳 Photos de tout', '👀 Profiter du moment'], ['🏃 Sport le matin', '🧘 Détente le soir'], ['🌶️ Très pimenté', '🥛 Tout doux'],
  ['💬 Dire ce qui ne va pas', '🕰️ Laisser passer'], ['🛍️ Shopping', '🎮 Jeux'], ['🎂 Surprise', '📅 Prévenu(e) à l’avance'], ['🧊 Boisson glacée', '♨️ Boisson chaude'],
  ['🌹 Romantique', '😜 Taquin(e)'], ['🏠 Rester à la maison', '🚪 Sortir'], ['🎧 Podcast', '🎵 Playlist'], ['🥐 Petit-déj au lit', '🍹 Apéro au coucher du soleil'],
  ['🧳 Voyager léger', '🎒 Tout emporter'], ['⏰ En avance', '🏃 Pile à l’heure… ou presque'], ['🖊️ Lettre manuscrite', '🎙️ Message vocal'], ['🌊 Nager', '🏝️ Bronzer'],
  ['🎢 Sensations fortes', '🎡 Balade tranquille'], ['🍿 Comédie', '😱 Film d’horreur'], ['💤 Grasse matinée', '🌄 Lever de soleil'], ['🤝 Faire le premier pas', '⏳ Attendre l’autre'],
  ['🍰 Dessert d’abord', '🥗 Garder le meilleur pour la fin'], ['📱 Appel vidéo', '☎️ Appel vocal'], ['🧩 Jeu de réflexion', '⚡ Jeu de vitesse'], ['🎨 Couleurs vives', '🖤 Sobre et chic'],
  ['🥘 Plat de maman', '🍱 Nouveau restaurant'], ['🛏️ Dormir collés', '🌬️ Chacun son espace'], ['📝 Faire des listes', '🧠 Tout garder en tête'], ['🎊 Nouvel An en fête', '🎄 Nouvel An au calme'],
];

export function init() {
  const pool = Q.map((_, i) => i), qs = [];
  while (qs.length < N) qs.push(pool.splice(rnd(pool.length), 1)[0]);
  return { qs, a: [null, null], turn: 0, winner: null, done: false, score: [0, 0], n: 0 };
}

export function answer(st, seat, picks) {
  const s = { ...st, a: st.a.slice(), n: st.n + 1 };
  s.a[seat] = picks;
  const other = s.a[1 - seat];
  if (!other) { s.turn = 1 - seat; return s; }
  const hits = (me, them) => me.you.filter((g, i) => g === them.me[i]).length;
  s.score = [hits(s.a[0], s.a[1]), hits(s.a[1], s.a[0])];
  s.done = true;
  s.winner = s.score[0] > s.score[1] ? 0 : s.score[1] > s.score[0] ? 1 : 'draw';
  return s;
}
export const pct = (st) => Math.round(((st.score[0] + st.score[1]) / (2 * N)) * 100);

export default {
  id: 'quiz',
  title: 'Tu me connais\u00a0?',
  emoji: '💞',
  kind: 'turn',
  ownResult: true,
  desc: '7 choix : tu réponds pour toi, puis tu devines la réponse de l’autre. À la fin, votre score de complicité.',
  init,

  mount(ctx) {
    let st = ctx.state, step = 0, phase = 'me', shownFor = -1, celebrated = false;
    let picks = { me: [], you: [] };
    const el = h('div', { class: 'turn-game quiz' });
    ctx.root.append(el);
    const mySeat = () => (ctx.solo ? st.turn : ctx.seat());
    const name = (seat) => (ctx.solo ? `Joueur ${seat + 1}` : seat === ctx.seat() ? 'Toi' : ctx.names.partner);

    function choose(v) {
      sfx('move');
      picks[phase][step] = v;
      if (phase === 'me') phase = 'you'; else { phase = 'me'; step += 1; }
      if (step < N) return render();
      const seat = mySeat();
      st = answer(st, seat, picks);
      step = 0; picks = { me: [], you: [] };
      render();
      ctx.save(st, st.done ? st.winner : null, st.done ? { announce: `💞 Complicité : ${pct(st)} % à « Tu me connais ? »` } : null);
    }

    function reveal() {
      const p = pct(st), view = ctx.solo ? 0 : ctx.seat();
      const verdict = p >= 85 ? 'Deux âmes, un seul cerveau.' : p >= 65 ? 'Vous vous connaissez vraiment bien.' : p >= 45 ? 'Pas mal, et encore des surprises à découvrir.' : 'Plein de choses à vous raconter ce soir.';
      if (!celebrated) { celebrated = true; sfx(p >= 65 ? 'win' : 'heart'); if (p >= 65) confetti(); }
      const rows = st.qs.map((qi, i) => {
        const mine = st.a[view].me[i], theirs = st.a[1 - view].me[i];
        const iGuessed = st.a[view].you[i] === theirs, theyGuessed = st.a[1 - view].you[i] === mine;
        // each line: whose answer it is, the answer, and whether the other one guessed it
        const chip = (ok, guesser) => h('i', { class: ok ? 'ok' : 'ko' },
          guesser === 'Toi' ? (ok ? 'Tu as deviné' : 'Tu pensais l’inverse') : (ok ? `Deviné par ${guesser}` : `${guesser} pensait l’inverse`));
        return h('div', { class: 'qz-row' },
          h('div', { class: 'qz-line' }, h('b', {}, name(view)), h('span', {}, Q[qi][mine]), chip(theyGuessed, name(1 - view))),
          h('div', { class: 'qz-line' }, h('b', {}, name(1 - view)), h('span', {}, Q[qi][theirs]), chip(iGuessed, name(view))));
      });
      el.replaceChildren(h('div', { class: 'qz-reveal' },
        h('div', { class: 'duo big-duo on', style: `--gap:${Math.round(4 - p * 0.5)}px` }, h('i'), h('i')),
        h('h2', {}, `Complicité : ${p} %`),
        h('p', { class: 'muted' }, verdict),
        h('p', { class: 'qz-score' }, `${name(view)} : ${st.score[view]}/${N} bonnes intuitions · ${name(1 - view)} : ${st.score[1 - view]}/${N}`),
        h('div', { class: 'qz-list' }, rows),
        h('div', { class: 'qz-btns' },
          h('button', { class: 'btn', onclick: () => ctx.rematch() }, 'Rejouer avec de nouvelles questions'),
          h('button', { class: 'btn ghost', onclick: () => ctx.leave() }, 'Retour'))));
    }

    function render() {
      if (st.done) return reveal();
      const seat = mySeat();
      if (!ctx.solo && st.turn !== seat) {
        return el.replaceChildren(h('div', { class: 'handover' },
          h('div', { class: 'dots' }, h('i'), h('i'), h('i')),
          st.a[seat] ? `Tes réponses sont enregistrées. Au tour de ${ctx.names.partner}.` : `${ctx.names.partner} répond en premier…`,
          h('p', { class: 'muted' }, 'Tu peux revenir au chat : la partie t’attend.')));
      }
      if (ctx.solo && shownFor !== seat) {
        return el.replaceChildren(h('div', { class: 'handover' },
          h('div', { class: 'big' }, '💞'), `Au tour du joueur ${seat + 1}`,
          h('p', { class: 'muted' }, 'L’autre ne regarde pas l’écran.'),
          h('button', { class: 'btn', onclick: () => { shownFor = seat; render(); } }, 'Commencer')));
      }
      const q = Q[st.qs[step]];
      const other = ctx.solo ? `le joueur ${2 - seat}` : ctx.names.partner;
      el.replaceChildren(
        h('div', { class: 'qz-progress' }, st.qs.map((_, i) => h('i', { class: i < step ? 'done' : i === step ? 'cur' : '' }))),
        h('div', { class: `qz-card ${phase}` },
          h('p', { class: 'qz-ask' }, phase === 'me' ? 'Toi, tu préfères…' : `Et ${other}, à ton avis ?`),
          h('button', { class: 'qz-opt', onclick: () => choose(0) }, q[0]),
          h('span', { class: 'qz-or' }, 'ou'),
          h('button', { class: 'qz-opt', onclick: () => choose(1) }, q[1])),
        h('p', { class: 'muted' }, `Question ${step + 1} sur ${N}`));
    }

    ctx.onState((s) => { if (s && s.n >= st.n) { st = s; render(); } });
    render();
    return { destroy: () => el.remove() };
  },
};
