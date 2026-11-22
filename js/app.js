// Nous Deux — app shell: account, couple space, chat, invitations, game screen, notifications.
import { CFG } from './config.js';
import { $, h, toast } from './ui.js';
import { GAMES, GAME_LIST } from './games/index.js';
import { mountDuel } from './games/duel.js';

const app = $('#app');
const S = { sb: null, user: null, profile: null, couple: null, partner: null, msgs: [], games: new Map(), chan: null, online: false, cur: null, sheet: null };
const QUICK = ['😘', '😂', '😈', '😭', '🔥', '👏'];
const ERR = {
  bad_pseudo: 'Pseudo : 3 à 20 caractères (lettres, chiffres, . _ -).',
  bad_password: 'Mot de passe : 6 caractères minimum.',
  bad_name: 'Indique ton prénom.',
  pseudo_taken: 'Ce pseudo est déjà pris.',
  code_not_found: 'Code introuvable. Vérifie les 6 caractères.',
  couple_full: 'Cet espace a déjà deux personnes.',
  already_in_couple: 'Tu es déjà dans un espace.',
};
const explain = (e) => {
  const m = String(e?.message || e || '');
  for (const k of Object.keys(ERR)) if (m.includes(k)) return ERR[k];
  if (/Invalid login/i.test(m)) return 'Pseudo ou mot de passe incorrect.';
  if (/fetch|network/i.test(m)) return 'Pas de connexion. Réessaie.';
  return 'Une erreur est survenue. Réessaie.';
};
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => {
  const d = new Date(iso), t = new Date();
  if (d.toDateString() === t.toDateString()) return 'Aujourd’hui';
  t.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

/* ---------- boot ---------- */
boot();
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const solo = new URLSearchParams(location.search).get('solo');
  if (solo && GAMES[solo]) return openSolo(solo, () => { location.href = location.pathname; });
  if (!window.supabase) {
    return app.replaceChildren(h('div', { class: 'center' },
      h('div', { class: 'big' }, '📡'), h('p', {}, 'Impossible de joindre le serveur.'),
      h('button', { class: 'btn', onclick: () => location.reload() }, 'Réessayer')));
  }
  S.sb = window.supabase.createClient(CFG.url, CFG.key, { realtime: { params: { eventsPerSecond: 20 } } });
  const { data } = await S.sb.auth.getSession();
  if (data.session) { S.user = data.session.user; await enter(); } else renderAuth();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.couple) refresh(); });
}

/* ---------- account ---------- */
function renderAuth(mode = 'in') {
  const err = h('p', { class: 'err' });
  const name = h('input', { placeholder: 'Ton prénom', maxlength: 30, autocomplete: 'given-name' });
  const pseudo = h('input', { placeholder: 'Pseudo', maxlength: 20, autocapitalize: 'none', autocorrect: 'off', autocomplete: 'username' });
  const pass = h('input', { placeholder: 'Mot de passe', type: 'password', autocomplete: mode === 'in' ? 'current-password' : 'new-password' });
  const go = h('button', { class: 'btn', type: 'submit' }, mode === 'in' ? 'Se connecter' : 'Créer mon compte');
  const form = h('form', { class: 'card-form', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; go.disabled = true;
    try {
      const p = pseudo.value.trim().toLowerCase();
      if (mode === 'up') {
        const r = await fetch(`${CFG.url}/functions/v1/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: CFG.key, Authorization: `Bearer ${CFG.key}` },
          body: JSON.stringify({ pseudo: p, password: pass.value, name: name.value }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'signup_failed');
      }
      const { data, error } = await S.sb.auth.signInWithPassword({ email: `${p}@${CFG.emailDomain}`, password: pass.value });
      if (error) throw error;
      S.user = data.user; await enter();
    } catch (ex) { err.textContent = explain(ex); go.disabled = false; }
  } }, mode === 'up' ? name : null, pseudo, pass, err, go);
  app.replaceChildren(h('div', { class: 'auth' },
    h('div', { class: 'logo' }, h('i'), h('i')),
    h('h1', {}, 'Nous Deux'),
    h('p', { class: 'sub' }, 'Discuter et jouer ensemble, même loin l’un de l’autre.'),
    h('div', { class: 'tabs' },
      h('button', { class: mode === 'in' ? 'on' : '', onclick: () => renderAuth('in') }, 'Connexion'),
      h('button', { class: mode === 'up' ? 'on' : '', onclick: () => renderAuth('up') }, 'Créer un compte')),
    form));
}

async function enter() {
  const sb = S.sb, uid = S.user.id;
  const { data: prof } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (!prof) { await sb.auth.signOut(); return renderAuth(); }
  S.profile = prof;
  const { data: mem } = await sb.from('couple_members').select('couple_id').eq('user_id', uid).maybeSingle();
  if (!mem) return renderPair();
  const { data: couple } = await sb.from('couples').select('id,code').eq('id', mem.couple_id).single();
  S.couple = couple;
  renderChat();
  await refresh();
  subscribe();
}

function renderPair() {
  const err = h('p', { class: 'err' });
  const code = h('input', { placeholder: 'CODE', maxlength: 6, autocapitalize: 'characters', autocorrect: 'off', class: 'code-in' });
  const run = async (fn) => { err.textContent = ''; const { error } = await fn(); if (error) err.textContent = explain(error); else enter(); };
  app.replaceChildren(h('div', { class: 'auth' },
    h('div', { class: 'logo' }, h('i'), h('i')),
    h('h1', {}, `Bienvenue ${S.profile.name}`),
    h('p', { class: 'sub' }, 'Crée votre espace à deux, ou rejoins celui de ta moitié avec son code.'),
    h('div', { class: 'card-form' },
      h('button', { class: 'btn', onclick: () => run(() => S.sb.rpc('create_couple')) }, 'Créer notre espace'),
      h('div', { class: 'or' }, 'ou'),
      code,
      h('button', { class: 'btn ghost', onclick: () => run(() => S.sb.rpc('join_couple', { p_code: code.value })) }, 'Rejoindre avec ce code'),
      err),
    h('button', { class: 'link', onclick: logout }, 'Se déconnecter')));
}

async function logout() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) { await S.sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  } catch { /* best effort */ }
  if (S.chan) S.sb.removeChannel(S.chan);
  await S.sb.auth.signOut();
  location.reload();
}

/* ---------- data + realtime ---------- */
async function refresh() {
  const sb = S.sb, cid = S.couple.id;
  const [mem, msgs, games] = await Promise.all([
    sb.from('couple_members').select('user_id').eq('couple_id', cid).neq('user_id', S.user.id),
    sb.from('messages').select('*').eq('couple_id', cid).order('id', { ascending: false }).limit(150),
    sb.from('games').select('*').eq('couple_id', cid).order('created_at', { ascending: false }).limit(60),
  ]);
  if (mem.data?.length && !S.partner) {
    const { data } = await sb.from('profiles').select('id,name').eq('id', mem.data[0].user_id).maybeSingle();
    if (data) S.partner = data;
  }
  if (msgs.data) S.msgs = msgs.data.reverse();
  for (const g of games.data || []) {
    const old = S.games.get(g.id);
    S.games.set(g.id, g);
    if (S.cur && !S.cur.solo && S.cur.game.id === g.id && old) onGameRow(g, old);
  }
  paintHeader(); paintMsgs(true);
}

function subscribe() {
  const cid = S.couple.id, f = `couple_id=eq.${cid}`;
  S.chan = S.sb.channel(`couple:${cid}`, { config: { broadcast: { self: false }, presence: { key: S.user.id } } })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: f }, (p) => addMsg(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: f }, (p) => {
      if (!p.new?.id) return;
      const old = S.games.get(p.new.id);
      const row = { ...old, ...p.new };
      if (row.state === undefined && old) row.state = old.state;
      S.games.set(row.id, row);
      onGameRow(row, old);
      paintMsgs();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'couple_members', filter: f }, () => refresh())
    .on('broadcast', { event: 'g' }, ({ payload }) => {
      if (S.cur && !S.cur.solo && payload.gid === S.cur.game.id) S.cur.listeners[payload.ev]?.(payload.p);
    })
    .on('presence', { event: 'sync' }, () => {
      S.online = !!(S.partner && S.chan.presenceState()[S.partner.id]);
      paintHeader();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') S.chan.track({ at: Date.now() });
    });
}

function addMsg(m) {
  if (S.msgs.some((x) => x.id === m.id)) return;
  S.msgs.push(m);
  paintMsgs(true);
  if (m.sender_id !== S.user.id && S.cur && m.kind === 'text') showGameBubble(m.body);
}

async function sendMsg(body, kind = 'text', meta = null) {
  body = body.trim();
  if (!body) return;
  const { data, error } = await S.sb.from('messages')
    .insert({ couple_id: S.couple.id, sender_id: S.user.id, kind, body, meta }).select().single();
  if (error) return toast('Message non envoyé');
  addMsg(data);
  if (kind === 'text') notify(S.profile.name, body, 'msg');
}

function notify(title, body, tag) {
  if (!S.partner || S.online) return; // partner already has the app open
  S.sb.functions.invoke('notify', { body: { title, body, tag } }).catch(() => {});
}

/* ---------- chat screen ---------- */
function renderChat() {
  const input = h('input', { placeholder: 'Message…', maxlength: 2000, autocomplete: 'off', enterkeyhint: 'send' });
  app.replaceChildren(h('div', { class: 'chat' },
    h('header', { class: 'top' },
      h('div', { class: 'who' }, h('div', { class: 'avatar', id: 'avatar' }), h('div', {}, h('b', { id: 'pname' }), h('small', { id: 'pstate' }))),
      h('button', { class: 'icon', 'aria-label': 'Réglages', onclick: openSettings }, '⚙️')),
    h('div', { id: 'banner' }),
    h('div', { class: 'msgs', id: 'msgs' }),
    h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); const v = input.value; input.value = ''; sendMsg(v); } },
      h('button', { type: 'button', class: 'play', 'aria-label': 'Jouer', onclick: openPicker }, '🎮'),
      input,
      h('button', { class: 'send', 'aria-label': 'Envoyer' }, '➤'))));
  paintHeader(); paintMsgs(true);
}

function paintHeader() {
  if (!$('#pname')) return;
  const p = S.partner;
  $('#avatar').textContent = p ? p.name[0].toUpperCase() : '♡';
  $('#pname').textContent = p ? p.name : 'Notre espace';
  $('#pstate').textContent = p ? (S.online ? 'en ligne' : 'hors ligne') : 'en attente de ta moitié';
  $('#pstate').className = S.online ? 'on' : '';
  const banner = $('#banner');
  if (p) return banner.replaceChildren();
  banner.replaceChildren(h('div', { class: 'invite-code' },
    h('p', {}, 'Envoie ce code à ta moitié pour qu’elle te rejoigne :'),
    h('div', { class: 'code' }, S.couple.code),
    h('button', { class: 'btn small', onclick: shareCode }, 'Partager le code')));
}

async function shareCode() {
  const text = `Rejoins-moi sur Nous Deux 💞 ${location.origin}${location.pathname}\nCrée ton compte puis entre le code : ${S.couple.code}`;
  try {
    if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Copié !'); }
  } catch { /* cancelled */ }
}

function paintMsgs(scroll) {
  const box = $('#msgs');
  if (!box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const out = [];
  let day = '';
  for (const m of S.msgs) {
    const d = fmtDay(m.created_at);
    if (d !== day) { day = d; out.push(h('div', { class: 'day' }, d)); }
    const mine = m.sender_id === S.user.id;
    if (m.kind === 'system') out.push(h('div', { class: 'sys' }, m.body));
    else if (m.kind === 'invite') out.push(inviteCard(m, mine));
    else out.push(h('div', { class: `msg ${mine ? 'me' : 'them'}` }, h('span', {}, m.body), h('time', {}, fmtTime(m.created_at))));
  }
  if (!S.msgs.length) out.push(h('div', { class: 'empty' }, h('div', { class: 'big' }, '💞'), 'Dis bonjour, ou lance une partie avec 🎮'));
  box.replaceChildren(...out);
  if (scroll || near) box.scrollTop = box.scrollHeight;
}

function inviteCard(m, mine) {
  const g = S.games.get(m.meta?.game_id);
  const def = g && GAMES[g.game_type];
  if (!def) return h('div', { class: 'sys' }, m.body);
  const iRun = g.runner === S.user.id;
  const role = def.kind === 'duel' ? (iRun ? 'Tu joues' : 'Tu sabotes 😈') : null;
  let foot;
  if (g.status === 'invited') {
    foot = mine
      ? [h('span', { class: 'muted' }, 'En attente de réponse…'), h('button', { class: 'btn small ghost', onclick: () => setStatus(g, 'declined') }, 'Annuler')]
      : [h('button', { class: 'btn small', onclick: () => accept(g) }, 'Rejoindre'), h('button', { class: 'btn small ghost', onclick: () => setStatus(g, 'declined') }, 'Plus tard')];
  } else if (g.status === 'active') {
    foot = [h('button', { class: 'btn small', onclick: () => openGame(g) }, def.kind === 'turn' ? 'Reprendre la partie' : 'Entrer dans la partie')];
  } else if (g.status === 'finished') {
    foot = [h('span', { class: 'muted' }, g.winner ? (g.winner === S.user.id ? '🏆 Tu as gagné' : `🏆 ${S.partner?.name || 'L’autre'} a gagné`) : 'Partie interrompue')];
  } else foot = [h('span', { class: 'muted' }, 'Invitation annulée')];
  return h('div', { class: `invite ${mine ? 'me' : 'them'}` },
    h('div', { class: 'invite-top' }, h('span', { class: 'invite-e' }, def.emoji),
      h('div', {}, h('b', {}, def.title), h('small', {}, mine ? 'Tu proposes une partie' : `${S.partner?.name || ''} t’invite à jouer`), role ? h('small', { class: 'role' }, role) : null)),
    h('div', { class: 'invite-foot' }, foot));
}

/* ---------- sheets ---------- */
function sheet(title, ...content) {
  closeSheet();
  const el = h('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === el) closeSheet(); } },
    h('div', { class: 'sheet' }, h('div', { class: 'sheet-top' }, h('b', {}, title), h('button', { class: 'icon', onclick: closeSheet }, '✕')), content));
  document.body.append(el);
  S.sheet = el;
}
function closeSheet() { S.sheet?.remove(); S.sheet = null; }

function openPicker() {
  const duo = !!S.partner;
  sheet('Choisir un jeu', h('div', { class: 'games' }, GAME_LIST.map((g) =>
    h('div', { class: 'game-row' },
      h('div', { class: 'game-e' }, g.emoji),
      h('div', { class: 'game-t' }, h('b', {}, g.title), h('small', {}, g.desc),
        h('div', { class: 'game-btns' },
          duo && g.kind === 'duel' ? [
            h('button', { class: 'btn small', onclick: () => invite(g.id, true) }, 'Je joue'),
            h('button', { class: 'btn small alt', onclick: () => invite(g.id, false) }, 'Je sabote 😈')] : null,
          duo && g.kind === 'turn' ? h('button', { class: 'btn small', onclick: () => invite(g.id, Math.random() < 0.5) }, 'Inviter') : null,
          h('button', { class: 'btn small ghost', onclick: () => { closeSheet(); openSolo(g.id, renderChatBack); } }, g.kind === 'duel' ? 'M’entraîner' : 'Sur ce téléphone')))))),
  duo ? null : h('p', { class: 'muted pad' }, 'Les invitations seront possibles dès que ta moitié aura rejoint l’espace.'));
}

function openSettings() {
  const pushState = h('small', { class: 'muted' }, 'Notification' in window ? (Notification.permission === 'granted' ? 'Activées sur cet appareil' : 'Pour être prévenu(e) des messages et invitations') : 'Disponibles une fois l’app installée sur l’écran d’accueil');
  sheet('Réglages',
    h('div', { class: 'set' }, h('b', {}, S.profile.name), h('small', { class: 'muted' }, `Code de votre espace : ${S.couple.code}`)),
    h('div', { class: 'set' }, h('button', { class: 'btn', onclick: async () => { pushState.textContent = await enablePush(); } }, '🔔 Activer les notifications'), pushState),
    standalone() ? null : h('div', { class: 'set tip' }, h('b', {}, 'Installer l’app sur iPhone'),
      h('small', {}, 'Dans Safari : bouton Partager, puis « Sur l’écran d’accueil ». Ouvre ensuite l’app depuis son icône.')),
    h('div', { class: 'set' }, h('button', { class: 'btn ghost', onclick: logout }, 'Se déconnecter')));
}

async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'Installe d’abord l’app sur l’écran d’accueil (Partager → Sur l’écran d’accueil), puis réessaie ici.';
  }
  try {
    if ((await Notification.requestPermission()) !== 'granted') return 'Notifications refusées. Tu peux les autoriser dans les réglages du téléphone.';
    const reg = await navigator.serviceWorker.ready;
    const pad = '='.repeat((4 - (CFG.vapid.length % 4)) % 4);
    const key = Uint8Array.from(atob((CFG.vapid + pad).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    const j = sub.toJSON();
    const { error } = await S.sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: S.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth });
    if (error) throw error;
    return 'Activées sur cet appareil ✅';
  } catch { return 'Impossible d’activer les notifications sur cet appareil.'; }
}

/* ---------- invitations ---------- */
async function invite(type, iRun) {
  closeSheet();
  const def = GAMES[type];
  const { data: g, error } = await S.sb.from('games').insert({
    couple_id: S.couple.id, game_type: type, created_by: S.user.id,
    runner: iRun ? S.user.id : S.partner.id,
    state: def.kind === 'turn' ? def.init() : {},
  }).select().single();
  if (error) return toast('Invitation non envoyée');
  S.games.set(g.id, g);
  await sendMsg(`🎮 ${def.title}`, 'invite', { game_id: g.id });
  S.online ? null : S.sb.functions.invoke('notify', { body: { title: `${S.profile.name} t’invite à jouer 🎮`, body: def.title, tag: 'invite' } }).catch(() => {});
}

async function setStatus(g, status) {
  const { data } = await S.sb.from('games').update({ status }).eq('id', g.id).eq('status', 'invited').select().maybeSingle();
  if (data) { S.games.set(data.id, data); paintMsgs(); }
}

async function accept(g) {
  const { data } = await S.sb.from('games').update({ status: 'active' }).eq('id', g.id).eq('status', 'invited').select().maybeSingle();
  if (!data) return toast('Cette invitation n’est plus valable');
  S.games.set(data.id, data);
  openGame(data);
}

function onGameRow(row, old) {
  // my invitation was accepted → jump into the game
  if (row.status === 'active' && old?.status === 'invited' && row.created_by === S.user.id && !S.cur) return openGame(row);
  const cur = S.cur;
  if (!cur || cur.solo || cur.game.id !== row.id) return;
  cur.game = row;
  if (row.state && cur.onState) cur.onState(row.state);
  if (row.status === 'finished') showResult(row.winner ? (row.winner === S.user.id ? 'win' : 'lose') : 'none');
}

/* ---------- game screen ---------- */
function gameShell(def, badge, onBack, withChat) {
  const stage = h('div', { class: 'stage' });
  const bubble = h('div', { class: 'gbubble' });
  const input = h('input', { placeholder: 'Message…', maxlength: 500, autocomplete: 'off', enterkeyhint: 'send' });
  app.replaceChildren(h('div', { class: 'gscreen' },
    h('header', { class: 'top' },
      h('button', { class: 'icon', 'aria-label': 'Retour', onclick: onBack }, '‹'),
      h('div', { class: 'gtitle' }, h('b', {}, `${def.emoji} ${def.title}`), badge ? h('small', {}, badge) : null),
      h('span', { class: 'icon ghosted' })),
    stage,
    withChat ? h('div', { class: 'gchat' }, bubble,
      h('div', { class: 'quick' }, QUICK.map((e) => h('button', { onclick: () => sendMsg(e) }, e))),
      h('form', { onsubmit: (e) => { e.preventDefault(); const v = input.value; input.value = ''; input.blur(); sendMsg(v); } }, input, h('button', { class: 'send' }, '➤'))) : null));
  return stage;
}

let bubbleTimer = 0;
function showGameBubble(text) {
  const b = $('.gbubble');
  if (!b) return;
  b.textContent = `${S.partner?.name || ''} : ${text}`;
  b.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => b.classList.remove('show'), 5000);
}

function openGame(game) {
  if (S.cur) return;
  closeSheet();
  const def = GAMES[game.game_type];
  const me = S.user.id, iRun = game.runner === me;
  const seat = iRun ? 0 : 1;
  const badge = def.kind === 'duel' ? (iRun ? 'Tu joues' : 'Tu sabotes 😈') : `avec ${S.partner.name}`;
  const stage = gameShell(def, badge, leaveGame, true);
  const cur = S.cur = { game, def, solo: false, listeners: {}, onState: null, done: false, inst: null };
  const announce = (winnerId) => sendMsg(`🏆 ${winnerId === me ? S.profile.name : S.partner.name} gagne à ${def.title}`, 'system');
  const ctx = {
    root: stage, solo: false, role: iRun ? 'runner' : 'saboteur', seat: () => seat,
    names: { me: S.profile.name, partner: S.partner.name }, state: game.state, toast,
    send: (ev, p) => S.chan.send({ type: 'broadcast', event: 'g', payload: { gid: game.id, ev, p } }),
    on: (ev, cb) => { cur.listeners[ev] = cb; },
    onState: (cb) => { cur.onState = cb; },
    save: async (state, winnerSeat) => {
      const patch = { state };
      const winner = winnerSeat == null ? null : (winnerSeat === seat ? me : S.partner.id);
      if (winner) Object.assign(patch, { status: 'finished', winner });
      const { error } = await S.sb.from('games').update(patch).eq('id', game.id);
      if (error) return toast('Coup non enregistré, vérifie la connexion');
      if (winner) announce(winner);
    },
    finish: async (winnerRole) => {
      const winner = (winnerRole === 'runner') === iRun ? me : S.partner.id;
      await S.sb.from('games').update({ status: 'finished', winner }).eq('id', game.id).eq('status', 'active');
      announce(winner);
    },
  };
  cur.inst = def.kind === 'duel' ? mountDuel(def, ctx) : def.mount(ctx);
  if (game.status === 'finished') showResult(game.winner ? (game.winner === me ? 'win' : 'lose') : 'none');
}

async function leaveGame() {
  const cur = S.cur;
  if (!cur) return;
  // leaving a live duel ends it for both; turn-based games stay open and can be resumed
  if (!cur.solo && cur.def.kind === 'duel' && !cur.done && cur.game.status === 'active') {
    cur.done = true;
    S.sb.from('games').update({ status: 'finished' }).eq('id', cur.game.id).eq('status', 'active').then(() => {});
  }
  cur.inst?.destroy();
  S.cur = null;
  renderChatBack();
}
function renderChatBack() { renderChat(); }

function showResult(kind) {
  const cur = S.cur;
  if (!cur || cur.done) return;
  cur.done = true;
  const def = cur.def;
  const text = { win: ['🎉', 'Tu as gagné !'], lose: ['😅', cur.solo ? 'Perdu !' : `${S.partner.name} a gagné`], none: ['🤝', 'Partie interrompue'], end: ['🏁', 'Partie terminée'] }[kind];
  const again = cur.solo
    ? h('button', { class: 'btn', onclick: () => { cur.inst.destroy(); S.cur = null; openSolo(def.id, cur.origBack); } }, 'Rejouer')
    : h('button', { class: 'btn', onclick: () => { const iRun = cur.game.runner === S.user.id; leaveGame(); invite(def.id, def.kind === 'duel' ? !iRun : Math.random() < 0.5); } },
      def.kind === 'duel' ? 'Revanche (on échange les rôles)' : 'Revanche');
  $('.stage')?.append(h('div', { class: 'result' }, h('div', { class: 'result-card' },
    h('div', { class: 'big' }, text[0]), h('h2', {}, text[1]), again,
    h('button', { class: 'btn ghost', onclick: () => (cur.solo ? cur.back() : leaveGame()) }, 'Retour'))));
}

/* ---------- solo practice / same-phone play ---------- */
function openSolo(type, back) {
  const def = GAMES[type];
  let state = def.kind === 'turn' ? def.init() : {};
  const leave = () => { cur.inst?.destroy(); S.cur = null; back(); };
  const stage = gameShell(def, def.kind === 'duel' ? 'Entraînement contre un saboteur 🤖' : 'À deux sur ce téléphone', () => leave(), false);
  const cur = S.cur = { def, solo: true, listeners: {}, onState: null, done: false, inst: null, back: leave, origBack: back };
  const ctx = {
    root: stage, solo: true, role: 'runner', seat: () => state.turn ?? 0,
    names: { me: 'Toi', partner: def.kind === 'duel' ? 'le saboteur' : 'l’autre joueur' }, state, toast,
    send: () => {}, on: (ev, cb) => { cur.listeners[ev] = cb; },
    onState: (cb) => { cur.onState = cb; },
    save: (st, winnerSeat) => { state = st; cur.onState?.(st); if (winnerSeat != null) showResult('end'); },
    finish: (winnerRole) => showResult(winnerRole === 'runner' ? 'win' : 'lose'),
  };
  cur.inst = def.kind === 'duel' ? mountDuel(def, ctx) : def.mount(ctx);
}
