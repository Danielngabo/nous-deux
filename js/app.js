// Nous Deux — app shell: account, couple space, chat, invitations, game screen, notifications.
import { CFG } from './config.js';
import { $, h, toast } from './ui.js';
import { sfx, burst, confetti, shake, soundOn, setSound } from './fx.js';
import { hasPin, clearPin, showLock, choosePin, locked } from './lock.js';
import { GAMES, GAME_LIST } from './games/index.js';
import { mountDuel } from './games/duel.js';
import { pct as quizPct } from './games/quiz.js';

const APP_VERSION = '3';
const app = $('#app');
const S = {
  sb: null, user: null, profile: null, couple: null, partner: null,
  msgs: [], games: new Map(), finished: new Map(), els: new Map(), urls: new Map(),
  chan: null, online: false, typingUntil: 0, seenId: null, secretMode: false, cur: null, sheet: null,
};
const QUICK = ['😘', '😂', '😈', '😭', '🔥', '👏'];
const REACTS = ['❤️', '😂', '😮', '😢', '🔥', '👍'];
const TINT = { briques: '#ff5d73', blocs: '#b99cff', bonbons: '#ff8fc7', quiz: '#7fd0ff', dames: '#4be3b0', cartes: '#ffb627' };
const KIND = { duel: 'Sabotage en direct', turn: 'Chacun son tour' };
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
const emojiOnly = (t) => t.length <= 14 && /\p{Extended_Pictographic}/u.test(t) && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t);
const firstEmoji = (t) => (t.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/u) || ['💗'])[0];
const duo = (cls = '') => h('div', { class: `duo ${cls}` }, h('i', {}, S.profile?.name?.[0]?.toUpperCase() || ''), h('i', {}, S.partner?.name?.[0]?.toUpperCase() || ''));

/* ---------- boot ---------- */
boot();
async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
    // a new version took over: reload once so the screen shows it
    let reloaded = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      if (!S.cur) location.reload();
    });
  }
  const solo = new URLSearchParams(location.search).get('solo');
  if (solo && GAMES[solo]) return openSolo(solo, () => { location.href = location.pathname; });
  if (!window.supabase) {
    return app.replaceChildren(h('div', { class: 'center' },
      h('div', { class: 'big' }, '📡'), h('p', {}, 'Impossible de joindre le serveur.'),
      h('button', { class: 'btn', onclick: () => location.reload() }, 'Réessayer')));
  }
  S.sb = window.supabase.createClient(CFG.url, CFG.key, { realtime: { params: { eventsPerSecond: 20 } } });
  const { data } = await S.sb.auth.getSession();
  if (data.session) { S.user = data.session.user; showLock(logout); await enter(); } else renderAuth();
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); S.chan?.untrack(); return; }
    if (S.user && hasPin() && Date.now() - hiddenAt > 30000) showLock(logout);
    if (S.couple) { S.chan?.track({ at: Date.now() }); refresh(); }
  });
  window.addEventListener('nd-unlocked', markRead);
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
    h('div', { class: 'duo big-duo on drift' }, h('i'), h('i')),
    h('h1', {}, 'Nous Deux'),
    h('p', { class: 'sub' }, 'Votre coin à vous : se parler, se taquiner, jouer ensemble, même loin l’un de l’autre.'),
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
  const { data: couple } = await sb.from('couples').select('*').eq('id', mem.couple_id).single();
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
    h('div', { class: 'duo big-duo drift' }, h('i'), h('i')),
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
  clearPin();
  if (S.chan) S.sb.removeChannel(S.chan);
  await S.sb.auth.signOut();
  location.reload();
}

/* ---------- data + realtime ---------- */
async function refresh() {
  const sb = S.sb, cid = S.couple.id;
  const [mem, msgs, games, done, couple] = await Promise.all([
    sb.from('couple_members').select('user_id').eq('couple_id', cid).neq('user_id', S.user.id),
    sb.from('messages').select('*').eq('couple_id', cid).order('id', { ascending: false }).limit(150),
    sb.from('games').select('*').eq('couple_id', cid).order('created_at', { ascending: false }).limit(60),
    sb.from('games').select('id,game_type,winner').eq('couple_id', cid).eq('status', 'finished').limit(1000),
    sb.from('couples').select('*').eq('id', cid).maybeSingle(),
  ]);
  if (couple.data) S.couple = couple.data;
  if (mem.data?.length && !S.partner) {
    const { data } = await sb.from('profiles').select('id,name').eq('id', mem.data[0].user_id).maybeSingle();
    if (data) S.partner = data;
  }
  if (msgs.data) S.msgs = msgs.data.reverse();
  if (!S.loaded) { S.seenId = S.msgs.reduce((a, m) => Math.max(a, m.id), 0); S.loaded = true; }
  for (const g of done.data || []) S.finished.set(g.id, g);
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
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: f }, (p) => addMsg(p.new, true))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: f }, (p) => patchMsg(p.new))
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
    .on('broadcast', { event: 't' }, () => {
      S.typingUntil = Date.now() + 3500;
      paintHeader(); paintMsgs();
      setTimeout(() => { if (Date.now() >= S.typingUntil) { paintHeader(); paintMsgs(); } }, 3600);
    })
    .on('presence', { event: 'sync' }, () => {
      S.online = !!(S.partner && S.chan.presenceState()[S.partner.id]);
      paintHeader();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && !document.hidden) S.chan.track({ at: Date.now() });
    });
}

function addMsg(m, live) {
  if (S.msgs.some((x) => x.id === m.id)) return;
  S.msgs.push(m);
  const theirs = m.sender_id !== S.user.id;
  if (theirs && live) {
    S.typingUntil = 0;
    if (m.kind === 'nudge') { burst('💗', 18); sfx('heart'); }
    else if (m.kind !== 'system') sfx('recv');
    if (m.kind === 'text' && emojiOnly(m.body)) burst(firstEmoji(m.body), 7);
    if (S.cur && m.kind === 'text') showGameBubble(m.body);
    if (S.cur && m.kind === 'nudge') showGameBubble('💭 pense à toi');
  }
  paintHeader(); paintMsgs(true);
}

function patchMsg(n) {
  const i = S.msgs.findIndex((x) => x.id === n.id);
  if (i < 0) return;
  const old = S.msgs[i], m = { ...old, ...n };
  if (m.body === undefined) m.body = old.body;
  const pid = S.partner?.id, was = old.reactions?.[pid], now = m.reactions?.[pid];
  if (now && now !== was && old.sender_id === S.user.id) { sfx('react'); burst(now, 5); }
  S.msgs[i] = m;
  paintMsgs();
}

async function sendMsg(body, kind = 'text', meta = null) {
  body = body.trim();
  if (!body) return;
  const { data, error } = await S.sb.from('messages')
    .insert({ couple_id: S.couple.id, sender_id: S.user.id, kind, body, meta }).select().single();
  if (error) return toast('Message non envoyé');
  addMsg(data);
  if (kind === 'text') { sfx('send'); notify('msg', { text: body }); if (emojiOnly(body)) burst(firstEmoji(body), 5); }
  else if (kind === 'image' || kind === 'secret' || kind === 'nudge') { sfx('send'); notify(kind); }
}

// The server writes the notification text; we only say what happened.
function notify(type, extra = {}) {
  if (!type || !S.partner || S.online) return; // partner already has the app open
  S.sb.functions.invoke('notify', { body: { type, ...extra } }).catch(() => {});
}

let readTimer = 0;
function markRead() {
  clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    if (!S.couple || document.hidden || locked() || !$('#msgs')) return;
    navigator.clearAppBadge?.().catch(() => {});
    const unread = S.msgs.filter((m) => m.sender_id !== S.user.id && !m.read_at && !(m.kind === 'secret' && !m.meta?.burned));
    if (!unread.length) return;
    const at = new Date().toISOString();
    unread.forEach((m) => { m.read_at = at; });
    S.sb.rpc('mark_read').then(() => {});
  }, 350);
}

async function mediaUrl(path) {
  const hit = S.urls.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data } = await S.sb.storage.from('media').createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  S.urls.set(path, { url: data.signedUrl, exp: Date.now() + 3300000 });
  return data.signedUrl;
}

/* ---------- chat screen ---------- */
function renderChat() {
  const input = h('input', { placeholder: 'Message…', maxlength: 2000, autocomplete: 'off', enterkeyhint: 'send' });
  const send = h('button', { class: 'send heart', 'aria-label': 'Envoyer' }, '💗');
  const form = h('form', { class: 'composer' },
    h('button', { type: 'button', class: 'plus', 'aria-label': 'Photo ou message secret', onclick: togglePlus }, '＋'),
    h('div', { class: 'field' }, input),
    h('button', { type: 'button', class: 'play', 'aria-label': 'Jouer', onclick: () => openPicker() }, '🎮'),
    send);
  const sync = () => {
    const has = !!input.value.trim();
    send.textContent = has ? '➤' : '💗';
    send.classList.toggle('heart', !has);
    send.setAttribute('aria-label', has ? 'Envoyer' : 'Envoyer une pensée');
    form.classList.toggle('secret', S.secretMode);
    input.placeholder = S.secretMode ? 'Message secret… il disparaîtra après lecture' : 'Message…';
  };
  let lastTyping = 0, lastNudge = 0;
  input.addEventListener('input', () => {
    sync();
    if (S.partner && S.online && Date.now() - lastTyping > 2000) { lastTyping = Date.now(); S.chan?.send({ type: 'broadcast', event: 't', payload: {} }); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault(); closePlus();
    const v = input.value.trim();
    if (v) {
      input.value = '';
      const secret = S.secretMode; S.secretMode = false; sync();
      return sendMsg(v, secret ? 'secret' : 'text');
    }
    if (!S.partner) return toast('Ta moitié n’a pas encore rejoint l’espace');
    if (Date.now() - lastNudge < 8000) return shake(send);
    lastNudge = Date.now();
    burst('💗', 14); sfx('heart');
    sendMsg('💭', 'nudge');
  });
  const msgs = h('div', { class: 'msgs', id: 'msgs' });
  wireMsgs(msgs);
  app.replaceChildren(h('div', { class: 'chat' },
    h('header', { class: 'top' },
      h('button', { class: 'who', onclick: openUs }, h('span', { id: 'duo' }), h('span', { class: 'who-t' }, h('b', { id: 'pname' }), h('small', { id: 'pstate' }))),
      h('button', { class: 'icon', 'aria-label': 'Réglages', onclick: openSettings }, '⚙️')),
    h('div', { id: 'banner' }),
    msgs, form));
  S.syncComposer = sync;
  sync(); paintHeader(); paintMsgs(true);
}

function paintHeader() {
  if (!$('#pname')) return;
  const p = S.partner, typing = Date.now() < S.typingUntil;
  $('#duo').replaceChildren(duo(S.online ? 'on' : ''));
  $('#pname').textContent = p ? p.name : 'Notre espace';
  $('#pstate').textContent = p ? (typing ? 'écrit…' : S.online ? 'ensemble, là, maintenant' : 'hors ligne') : 'en attente de ta moitié';
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
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  const me = S.user.id, out = [];
  let day = '', maxId = S.seenId || 0;
  let lastMine = null;
  for (const m of S.msgs) if (m.sender_id === me && m.kind !== 'system') lastMine = m;
  S.msgs.forEach((m, i) => {
    const d = fmtDay(m.created_at);
    if (d !== day) { day = d; out.push(h('div', { class: 'day' }, d)); }
    const next = S.msgs[i + 1];
    const tail = !next || next.sender_id !== m.sender_id || next.kind === 'system' || next.kind === 'invite' || fmtDay(next.created_at) !== d;
    const g = m.kind === 'invite' ? S.games.get(m.meta?.game_id) : null;
    const sig = [m.kind, m.body, JSON.stringify(m.reactions || {}), m.meta?.burned, tail, g && g.status, g && g.winner, g && g.state?.done].join('|');
    let c = S.els.get(m.id);
    if (!c || c.sig !== sig) {
      c = { sig, el: msgEl(m, tail, g) };
      if (S.loaded && m.id > S.seenId) { const el = c.el; el.classList.add('new'); el.addEventListener('animationend', () => el.classList.remove('new'), { once: true }); }
      S.els.set(m.id, c);
    }
    out.push(c.el);
    if (m === lastMine && m.read_at) out.push(h('div', { class: 'seen' }, 'Vu'));
    if (m.id > maxId) maxId = m.id;
  });
  if (S.loaded) S.seenId = maxId;
  if (Date.now() < S.typingUntil) out.push(h('div', { class: 'row them tail' }, h('div', { class: 'bub typing' }, h('i'), h('i'), h('i'))));
  if (!S.msgs.length) out.push(h('div', { class: 'empty' }, h('div', { class: 'big' }, '💞'), h('b', {}, 'Votre histoire commence ici'), 'Écris un mot doux, envoie une pensée avec 💗 ou lance une partie avec 🎮'));
  box.replaceChildren(...out);
  if (scroll || near) box.scrollTop = box.scrollHeight;
  markRead();
}

function msgEl(m, tail, g) {
  const mine = m.sender_id === S.user.id, them = S.partner?.name || 'Ta moitié';
  if (m.kind === 'system') return h('div', { class: 'sys' }, m.body);
  if (m.kind === 'invite') return inviteCard(m, mine, g);
  if (m.kind === 'nudge') return h('div', { class: 'nudge' }, h('span', {}, '💭'), mine ? `Tu penses à ${them}` : `${them} pense à toi`, h('time', {}, fmtTime(m.created_at)));
  const row = h('div', { class: `row ${mine ? 'me' : 'them'}${tail ? ' tail' : ''}`, 'data-id': m.id });
  const time = h('time', {}, fmtTime(m.created_at));
  if (m.kind === 'secret') {
    const burned = !!m.meta?.burned, photo = m.body.includes('Photo') || !!m.meta?.path;
    const label = burned ? (mine ? 'Ouvert, puis détruit' : 'Message secret détruit')
      : mine ? (photo ? 'Photo éphémère envoyée' : 'Message secret envoyé') : (photo ? 'Photo éphémère' : 'Message secret');
    const sub = burned ? null : mine ? 'Pas encore ouvert' : 'Touche pour ouvrir. Il disparaîtra ensuite.';
    row.append(h('div', { class: `bub secret${burned ? ' burned' : ''}${!mine && !burned ? ' open-me' : ''}` },
      h('span', { class: 'secret-i' }, burned ? '🔥' : '🔒'), h('span', { class: 'secret-t' }, h('b', {}, label), sub ? h('small', {}, sub) : null), time));
  } else if (m.kind === 'image') {
    const img = h('img', { alt: 'Photo', loading: 'lazy' });
    const ratio = m.meta?.w && m.meta?.h ? m.meta.w / m.meta.h : 1;
    mediaUrl(m.meta?.path).then((u) => { if (u) img.src = u; else img.replaceWith(h('span', { class: 'muted' }, 'Photo indisponible')); });
    row.append(h('div', { class: 'bub pic', style: `aspect-ratio:${Math.min(1.8, Math.max(0.6, ratio)).toFixed(3)}` }, img, time));
  } else if (emojiOnly(m.body)) {
    row.classList.add('emo');
    row.append(h('div', { class: 'bub' }, h('span', {}, m.body), time));
  } else {
    row.append(h('div', { class: 'bub' }, h('span', {}, m.body), time));
  }
  const rs = Object.entries(m.reactions || {});
  if (rs.length) row.append(h('div', { class: `reacts${m.reactions[S.user.id] ? ' mine' : ''}` }, [...new Set(rs.map((r) => r[1]))].join('')));
  return row;
}

function inviteCard(m, mine, g) {
  const def = g && GAMES[g.game_type];
  if (!def) return h('div', { class: 'sys' }, m.body);
  const iRun = g.runner === S.user.id, them = S.partner?.name || 'L’autre';
  const role = def.kind === 'duel' ? (iRun ? 'Tu joues' : 'Tu sabotes 😈') : null;
  let foot;
  if (g.status === 'invited') {
    foot = mine
      ? [h('span', { class: 'muted' }, 'En attente de réponse…'), h('button', { class: 'btn small ghost', onclick: () => setStatus(g, 'declined') }, 'Annuler')]
      : [h('button', { class: 'btn small', onclick: () => accept(g) }, 'Rejoindre'), h('button', { class: 'btn small ghost', onclick: () => setStatus(g, 'declined') }, 'Plus tard')];
  } else if (g.status === 'active') {
    foot = [h('button', { class: 'btn small', onclick: () => openGame(g) }, def.kind === 'turn' ? 'Reprendre la partie' : 'Entrer dans la partie')];
  } else if (g.status === 'finished') {
    if (def.id === 'quiz' && g.state?.done) foot = [h('span', { class: 'muted' }, `💞 Complicité : ${quizPct(g.state)} %`), h('button', { class: 'btn small ghost', onclick: () => openGame(g) }, 'Voir les réponses')];
    else foot = [h('span', { class: 'muted' }, g.winner ? (g.winner === S.user.id ? '🏆 Tu as gagné' : `🏆 ${them} a gagné`) : g.state?.winner === 'draw' ? '🤝 Égalité' : 'Partie interrompue')];
  } else foot = [h('span', { class: 'muted' }, 'Invitation annulée')];
  return h('div', { class: `invite ${mine ? 'me' : 'them'}${g.status === 'invited' && !mine ? ' hot' : ''}`, style: `--tint:${TINT[def.id]}` },
    h('div', { class: 'invite-top' }, h('span', { class: 'invite-e' }, def.emoji),
      h('div', {}, h('b', {}, def.title), h('small', {}, mine ? 'Tu proposes une partie' : `${them} te défie`), role ? h('small', { class: 'role' }, role) : null)),
    h('div', { class: 'invite-foot' }, foot));
}

/* ---------- message interactions ---------- */
let pop = null;
function closePop() { pop?.remove(); pop = null; }

function wireMsgs(box) {
  let press = 0, sx = 0, sy = 0, tap = null, longFired = false;
  const find = (e) => {
    const row = e.target.closest('.row[data-id]');
    return row ? [row, S.msgs.find((x) => String(x.id) === row.dataset.id)] : [];
  };
  box.addEventListener('pointerdown', (e) => {
    const [row, m] = find(e);
    longFired = false;
    if (!row || !m || e.target.closest('.react-pop')) return;
    sx = e.clientX; sy = e.clientY;
    press = setTimeout(() => { longFired = true; showPop(row, m); }, 430);
  });
  const cancel = () => clearTimeout(press);
  box.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) cancel(); });
  box.addEventListener('pointerup', cancel);
  box.addEventListener('pointercancel', cancel);
  box.addEventListener('scroll', () => { cancel(); closePop(); }, { passive: true });
  box.addEventListener('contextmenu', (e) => { if (e.target.closest('.row')) e.preventDefault(); });
  box.addEventListener('click', (e) => {
    if (e.target.closest('.react-pop')) return;
    if (longFired) { longFired = false; return; }
    closePop(); closePlus();
    const [row, m] = find(e);
    if (!row || !m) return;
    if (e.target.closest('.open-me')) return openSecret(m);
    if (m.kind === 'image' && e.target.closest('img')) return viewImage(m);
    const now = Date.now();
    if (tap && tap.id === m.id && now - tap.t < 330) { tap = null; react(m, '❤️', true); } else tap = { id: m.id, t: now };
  });
}

function showPop(row, m) {
  closePop();
  if (m.kind === 'secret' && !m.meta?.burned && m.sender_id !== S.user.id) return;
  sfx('tick');
  const mine = m.reactions?.[S.user.id];
  pop = h('div', { class: 'react-pop' },
    REACTS.map((e) => h('button', { class: mine === e ? 'on' : '', onclick: () => { closePop(); react(m, e); } }, e)),
    m.kind === 'text' ? h('button', { class: 'copy', onclick: async () => { closePop(); try { await navigator.clipboard.writeText(m.body); toast('Copié'); } catch { /* not allowed */ } } }, 'Copier') : null);
  row.append(pop);
}

function react(m, emoji, onlyAdd) {
  const me = S.user.id, cur = m.reactions?.[me];
  const next = cur === emoji ? (onlyAdd ? emoji : null) : emoji;
  if (next === cur) return burst(emoji, 3);
  m.reactions = { ...(m.reactions || {}) };
  if (next) m.reactions[me] = next; else delete m.reactions[me];
  if (next) { sfx('react'); burst(next, 4); }
  paintMsgs();
  S.sb.rpc('react', { p_id: m.id, p_emoji: next || '' }).then(({ error }) => { if (error) toast('Réaction non enregistrée'); });
}

function overlay(cls, ...kids) {
  const el = h('div', { class: `overlay ${cls}` }, kids);
  document.body.append(el);
  return el;
}

async function viewImage(m) {
  const url = await mediaUrl(m.meta?.path);
  if (!url) return;
  const el = overlay('viewer', h('img', { src: url, alt: 'Photo' }));
  el.addEventListener('click', () => el.remove());
}

// Opens a secret once: the server copy is wiped first, then it stays on screen for a few seconds.
async function openSecret(m) {
  if (m.meta?.burned || m.opening) return;
  m.opening = true;
  const path = m.meta?.path, SECS = path ? 8 : 12;
  let content;
  if (path) {
    const url = await mediaUrl(path);
    content = h('img', { src: url || '', alt: 'Photo éphémère' });
    try { await content.decode(); } catch { m.opening = false; return toast('Photo indisponible pour le moment'); }
  } else content = h('p', { class: 'secret-text' }, m.body);
  const { error } = await S.sb.rpc('burn_secret', { p_id: m.id });
  m.opening = false;
  if (error) return toast('Impossible d’ouvrir, vérifie la connexion');
  m.body = '·'; m.meta = { burned: true }; m.read_at = new Date().toISOString();
  const bar = h('i');
  const el = overlay('secret-view',
    h('div', { class: 'secret-head' }, '🔥 Ce message disparaît', h('div', { class: 'bar' }, bar)),
    content,
    h('button', { class: 'btn ghost', onclick: () => close() }, 'Fermer et détruire'));
  bar.style.transition = `width ${SECS}s linear`;
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '0%'; }));
  const timer = setTimeout(() => close(), SECS * 1000);
  function close() {
    clearTimeout(timer); el.remove();
    if (path) { S.urls.delete(path); S.sb.storage.from('media').remove([path]).then(() => {}); }
    paintMsgs();
  }
}

/* ---------- photos + secret mode ---------- */
let plus = null;
function closePlus() { plus?.remove(); plus = null; }
function togglePlus() {
  if (plus) return closePlus();
  const item = (emoji, title, sub, fn) => h('button', { onclick: () => { closePlus(); fn(); } }, h('span', {}, emoji), h('span', {}, h('b', {}, title), h('small', {}, sub)));
  plus = h('div', { class: 'plus-menu' },
    item('📷', 'Photo', 'Reste dans votre conversation', () => pickPhoto(false)),
    item('🔥', 'Photo éphémère', 'Visible une seule fois, puis détruite', () => pickPhoto(true)),
    item('🔒', 'Message secret', 'Disparaît après lecture', () => { S.secretMode = !S.secretMode; S.syncComposer?.(); $('.composer input')?.focus(); }));
  $('.chat')?.append(plus);
}

function pickPhoto(secret) {
  const inp = h('input', { type: 'file', accept: 'image/*', class: 'hidden-file' });
  document.body.append(inp);
  inp.addEventListener('change', () => { if (inp.files[0]) sendPhoto(inp.files[0], secret); inp.remove(); });
  inp.click();
}

async function shrink(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
    src = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(file); });
  }
  const k = Math.min(1, 1400 / Math.max(src.width, src.height));
  const w = Math.round(src.width * k), hh = Math.round(src.height * k);
  const c = h('canvas', { width: w, height: hh });
  c.getContext('2d').drawImage(src, 0, 0, w, hh);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
  if (!blob) throw new Error('encode');
  return { blob, w, h: hh };
}

async function sendPhoto(file, secret) {
  toast('Envoi de la photo…');
  try {
    const { blob, w, h: hh } = await shrink(file);
    const path = `${S.couple.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await S.sb.storage.from('media').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    await sendMsg(secret ? '🔥 Photo éphémère' : '📷 Photo', secret ? 'secret' : 'image', { path, w, h: hh });
  } catch { toast('Photo non envoyée. Réessaie.'); }
}

/* ---------- sheets ---------- */
function sheet(title, ...content) {
  closeSheet(); closePlus(); closePop();
  const el = h('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === el) closeSheet(); } },
    h('div', { class: 'sheet' }, h('div', { class: 'sheet-top' }, h('b', {}, title), h('button', { class: 'icon', 'aria-label': 'Fermer', onclick: closeSheet }, '✕')), content));
  document.body.append(el);
  S.sheet = el;
}
function closeSheet() { S.sheet?.remove(); S.sheet = null; }

function openPicker(selected = null) {
  const duoReady = !!S.partner;
  const detail = h('div', { class: 'pick-detail' });
  const tiles = GAME_LIST.map((g) => h('button', { class: 'tile', style: `--tint:${TINT[g.id]}`, 'data-g': g.id, onclick: () => choose(g.id) },
    h('span', { class: 'tile-e' }, g.emoji), h('b', {}, g.title), h('small', {}, g.id === 'quiz' ? 'Complicité' : KIND[g.kind])));
  function choose(id) {
    const g = GAMES[id];
    sfx('tick');
    tiles.forEach((t) => t.classList.toggle('on', t.dataset.g === id));
    detail.style.setProperty('--tint', TINT[id]);
    detail.replaceChildren(...[
      h('p', {}, g.desc),
      h('div', { class: 'game-btns' },
        duoReady && g.kind === 'duel' ? [
          h('button', { class: 'btn', onclick: () => invite(id, true) }, 'Je joue'),
          h('button', { class: 'btn alt', onclick: () => invite(id, false) }, 'Je sabote 😈')] : null,
        duoReady && g.kind === 'turn' ? h('button', { class: 'btn', onclick: () => invite(id, Math.random() < 0.5) }, `Inviter ${S.partner.name}`) : null),
      h('button', { class: 'link', onclick: () => { closeSheet(); openSolo(id, renderChat); } }, g.kind === 'duel' ? 'M’entraîner contre un robot' : 'Jouer à deux sur ce téléphone'),
      duoReady ? null : h('p', { class: 'muted' }, 'Les invitations seront possibles dès que ta moitié aura rejoint l’espace.'),
    ].filter(Boolean));
  }
  sheet('À quoi on joue ?', h('div', { class: 'tiles' }, tiles), detail);
  choose(selected || GAME_LIST[0].id);
}

function tally() {
  const me = S.user.id, t = { me: 0, them: 0, by: {} };
  for (const g of S.finished.values()) {
    if (!g.winner) continue;
    const row = (t.by[g.game_type] ||= [0, 0]);
    if (g.winner === me) { t.me++; row[0]++; } else { t.them++; row[1]++; }
  }
  return t;
}

function openUs() {
  if (!S.partner) return openSettings();
  const t = tally(), since = S.couple.since;
  const days = since ? Math.max(0, Math.floor((Date.now() - new Date(`${since}T00:00:00`).getTime()) / 86400000)) : null;
  const date = h('input', { type: 'date', value: since || '', max: new Date().toISOString().slice(0, 10) });
  date.addEventListener('change', async () => {
    if (!date.value) return;
    const { error } = await S.sb.rpc('set_since', { p_date: date.value });
    if (error) return toast('Date non enregistrée');
    S.couple.since = date.value; openUs();
  });
  const lastQuiz = [...S.games.values()].find((g) => g.game_type === 'quiz' && g.state?.done);
  sheet('Nous deux',
    h('div', { class: 'us-hero' }, duo('big-duo on'),
      h('h2', {}, `${S.profile.name} & ${S.partner.name}`),
      days != null ? h('p', { class: 'us-days' }, h('b', {}, days.toLocaleString('fr-FR')), days > 1 ? ' jours ensemble' : ' jour ensemble') : h('p', { class: 'muted' }, 'Depuis quand êtes-vous ensemble ?'),
      h('label', { class: 'us-date' }, days != null ? 'Modifier la date' : 'Choisir la date', date)),
    h('div', { class: 'set' }, h('b', {}, 'Le match'),
      h('div', { class: 'score' }, h('span', {}, 'Toi'), h('b', {}, `${t.me} – ${t.them}`), h('span', {}, S.partner.name)),
      Object.keys(t.by).length ? h('div', { class: 'score-list' }, Object.entries(t.by).map(([id, [a, b]]) => GAMES[id] && h('div', {}, h('span', {}, `${GAMES[id].emoji} ${GAMES[id].title}`), h('b', {}, `${a} – ${b}`))))
        : h('small', { class: 'muted' }, 'Aucune partie terminée pour l’instant. Qui ouvre le score ?')),
    lastQuiz ? h('div', { class: 'set' }, h('b', {}, `💞 Dernière complicité : ${quizPct(lastQuiz.state)} %`), h('button', { class: 'btn small ghost', onclick: () => invite('quiz', true) }, 'Refaire le test')) : null);
}

function toggleRow(title, sub, value, onChange) {
  const b = h('button', { class: `switch${value ? ' on' : ''}`, role: 'switch', 'aria-checked': String(!!value), 'aria-label': title }, h('i'));
  b.addEventListener('click', async () => {
    const v = !b.classList.contains('on');
    b.classList.toggle('on', v); b.setAttribute('aria-checked', String(v));
    const res = await onChange(v);
    if (res === false) { b.classList.toggle('on', !v); b.setAttribute('aria-checked', String(!v)); }
  });
  return h('div', { class: 'set row-set' }, h('div', {}, h('b', {}, title), h('small', { class: 'muted' }, sub)), b);
}

function openSettings() {
  const granted = 'Notification' in window && Notification.permission === 'granted';
  const pushState = h('small', { class: 'muted' }, 'Notification' in window ? (granted ? 'Activées sur ce téléphone' : 'Sois prévenu(e) des messages, pensées et défis') : 'Disponibles une fois l’app installée sur l’écran d’accueil');
  sheet('Réglages',
    h('div', { class: 'set' }, h('b', {}, S.profile.name), h('small', { class: 'muted' }, `Code de votre espace : ${S.couple.code}`)),
    h('div', { class: 'set' }, h('button', { class: 'btn', onclick: async () => { pushState.textContent = await enablePush(); } }, granted ? '🔔 Réactiver les notifications' : '🔔 Activer les notifications'), pushState),
    toggleRow('Aperçu dans les notifications', 'Désactive pour masquer le texte de tes messages reçus sur l’écran verrouillé', S.profile.push_preview !== false, async (v) => {
      const { error } = await S.sb.from('profiles').update({ push_preview: v }).eq('id', S.user.id);
      if (error) { toast('Réglage non enregistré'); return false; }
      S.profile.push_preview = v;
    }),
    toggleRow('Verrouiller par code', 'Demande un code à 4 chiffres à l’ouverture, sur ce téléphone', hasPin(), (v) => new Promise((ok) => {
      if (!v) { clearPin(); toast('Code retiré'); return ok(true); }
      choosePin((saved) => { if (saved) toast('Code enregistré 🔒'); ok(saved); });
    })),
    toggleRow('Sons', 'Petits sons du chat et des jeux', soundOn(), (v) => { setSound(v); if (v) sfx('recv'); }),
    standalone() ? null : h('div', { class: 'set tip' }, h('b', {}, 'Installer l’app sur iPhone'),
      h('small', {}, 'Dans Safari : bouton Partager, puis « Sur l’écran d’accueil ». Ouvre ensuite l’app depuis son icône.')),
    h('div', { class: 'set' }, h('button', { class: 'btn ghost', onclick: logout }, 'Se déconnecter')),
    h('p', { class: 'muted version' }, `Version ${APP_VERSION}`));
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
    return 'Activées sur ce téléphone ✅';
  } catch { return 'Impossible d’activer les notifications sur ce téléphone.'; }
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
  sfx('send');
  notify('invite', { game: def.title });
}

async function setStatus(g, status) {
  const { data } = await S.sb.from('games').update({ status }).eq('id', g.id).eq('status', 'invited').select().maybeSingle();
  if (data) { S.games.set(data.id, data); paintMsgs(); }
}

async function accept(g) {
  const { data } = await S.sb.from('games').update({ status: 'active' }).eq('id', g.id).eq('status', 'invited').select().maybeSingle();
  if (!data) return toast('Cette invitation n’est plus valable');
  S.games.set(data.id, data);
  notify('accept', { game: GAMES[data.game_type].title });
  openGame(data);
}

function onGameRow(row, old) {
  if (row.status === 'finished') S.finished.set(row.id, { id: row.id, game_type: row.game_type, winner: row.winner });
  // my invitation was accepted → jump into the game
  if (row.status === 'active' && old?.status === 'invited' && row.created_by === S.user.id && !S.cur) return openGame(row);
  const cur = S.cur;
  if (!cur || cur.solo || cur.game.id !== row.id) return;
  cur.game = row;
  if (row.state && cur.onState) cur.onState(row.state);
  if (row.status === 'finished' && !cur.def.ownResult) showResult(row.winner ? (row.winner === S.user.id ? 'win' : 'lose') : row.state?.winner === 'draw' ? 'draw' : 'none');
}

/* ---------- game screen ---------- */
function gameShell(def, badge, onBack, withChat) {
  const stage = h('div', { class: 'stage' });
  const bubble = h('div', { class: 'gbubble' });
  const input = h('input', { placeholder: 'Message…', maxlength: 500, autocomplete: 'off', enterkeyhint: 'send' });
  app.replaceChildren(h('div', { class: 'gscreen', style: `--tint:${TINT[def.id]}` },
    h('header', { class: 'top' },
      h('button', { class: 'icon', 'aria-label': 'Retour', onclick: onBack }, '‹'),
      h('div', { class: 'gtitle' }, h('b', {}, `${def.emoji} ${def.title}`), badge ? h('small', {}, badge) : null),
      h('span', { class: 'icon ghosted' })),
    stage,
    withChat ? h('div', { class: 'gchat' }, bubble,
      h('div', { class: 'quick' }, QUICK.map((e) => h('button', { onclick: () => sendMsg(e) }, e))),
      h('form', { onsubmit: (e) => { e.preventDefault(); const v = input.value; input.value = ''; input.blur(); sendMsg(v); } }, input, h('button', { class: 'send', 'aria-label': 'Envoyer' }, '➤'))) : null));
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
  closeSheet(); closePlus(); closePop();
  const def = GAMES[game.game_type];
  const me = S.user.id, iRun = game.runner === me;
  const seat = iRun ? 0 : 1;
  const badge = def.kind === 'duel' ? (iRun ? 'Tu joues' : 'Tu sabotes 😈') : `avec ${S.partner.name}`;
  const stage = gameShell(def, badge, leaveGame, true);
  const cur = S.cur = { game, def, solo: false, listeners: {}, onState: null, done: false, inst: null };
  const ctx = {
    root: stage, solo: false, role: iRun ? 'runner' : 'saboteur', seat: () => seat,
    names: { me: S.profile.name, partner: S.partner.name }, state: game.state, toast,
    send: (ev, p) => S.chan.send({ type: 'broadcast', event: 'g', payload: { gid: game.id, ev, p } }),
    on: (ev, cb) => { cur.listeners[ev] = cb; },
    onState: (cb) => { cur.onState = cb; },
    leave: leaveGame,
    rematch: () => { leaveGame(); invite(def.id, def.kind === 'duel' ? !iRun : Math.random() < 0.5); },
    save: async (state, winnerSeat, opts) => {
      const patch = { state };
      const over = winnerSeat != null;
      const winner = !over || winnerSeat === 'draw' ? null : (winnerSeat === seat ? me : S.partner.id);
      if (over) Object.assign(patch, { status: 'finished', winner });
      const { error } = await S.sb.from('games').update(patch).eq('id', game.id);
      if (error) return toast('Coup non enregistré, vérifie la connexion');
      if (!over) { if (state.turn !== seat) notify(def.id === 'quiz' ? 'quiz' : 'turn', { game: def.title }); return; }
      const line = opts?.announce || (winner ? `🏆 ${winner === me ? S.profile.name : S.partner.name} gagne à ${def.title}` : `🤝 Égalité à ${def.title}`);
      sendMsg(line, 'system');
      if (opts?.announce) notify('msg', { text: line }); else if (winner) notify(winner === me ? 'won' : 'lost', { game: def.title });
    },
    finish: async (winnerRole) => {
      const winner = (winnerRole === 'runner') === iRun ? me : S.partner.id;
      await S.sb.from('games').update({ status: 'finished', winner }).eq('id', game.id).eq('status', 'active');
      sendMsg(`🏆 ${winner === me ? S.profile.name : S.partner.name} gagne à ${def.title}`, 'system');
    },
  };
  cur.inst = def.kind === 'duel' ? mountDuel(def, ctx) : def.mount(ctx);
  if (game.status === 'finished' && !def.ownResult) showResult(game.winner ? (game.winner === me ? 'win' : 'lose') : 'none');
}

function leaveGame() {
  const cur = S.cur;
  if (!cur) return;
  // leaving a live duel ends it for both; turn-based games stay open and can be resumed
  if (!cur.solo && cur.def.kind === 'duel' && !cur.done && cur.game.status === 'active') {
    cur.done = true;
    S.sb.from('games').update({ status: 'finished' }).eq('id', cur.game.id).eq('status', 'active').then(() => {});
  }
  cur.inst?.destroy();
  S.cur = null;
  renderChat();
}

function showResult(kind) {
  const cur = S.cur;
  if (!cur || cur.done) return;
  cur.done = true;
  const def = cur.def;
  const text = {
    win: ['🎉', 'Tu as gagné !'], lose: ['😅', cur.solo ? 'Perdu !' : `${S.partner.name} a gagné`],
    draw: ['🤝', 'Égalité'], none: ['🤝', 'Partie interrompue'], end: ['🏁', 'Partie terminée'],
  }[kind];
  if (kind === 'win') { sfx('win'); confetti(); } else if (kind === 'lose') sfx('lose');
  const t = cur.solo ? null : tally();
  const again = cur.solo
    ? h('button', { class: 'btn', onclick: () => { cur.inst.destroy(); S.cur = null; openSolo(def.id, cur.origBack); } }, 'Rejouer')
    : h('button', { class: 'btn', onclick: () => { const iRun = cur.game.runner === S.user.id; leaveGame(); invite(def.id, def.kind === 'duel' ? !iRun : Math.random() < 0.5); } },
      def.kind === 'duel' ? 'Revanche, on échange les rôles' : 'Revanche');
  $('.stage')?.append(h('div', { class: 'result' }, h('div', { class: `result-card ${kind}` },
    h('div', { class: 'big bounce' }, text[0]), h('h2', {}, text[1]),
    t ? h('p', { class: 'score' }, h('span', {}, 'Toi'), h('b', {}, `${t.me} – ${t.them}`), h('span', {}, S.partner.name)) : null,
    again,
    h('button', { class: 'btn ghost', onclick: () => (cur.solo ? cur.back() : leaveGame()) }, 'Retour'))));
}

/* ---------- solo practice / same-phone play ---------- */
function openSolo(type, back) {
  const def = GAMES[type];
  let state = def.kind === 'turn' ? def.init() : {};
  const leave = () => { cur.inst?.destroy(); S.cur = null; back(); };
  const stage = gameShell(def, def.kind === 'duel' ? 'Entraînement contre un robot saboteur 🤖' : 'À deux sur ce téléphone', () => leave(), false);
  const cur = S.cur = { def, solo: true, listeners: {}, onState: null, done: false, inst: null, back: leave, origBack: back };
  const ctx = {
    root: stage, solo: true, role: 'runner', seat: () => state.turn ?? 0,
    names: { me: 'Toi', partner: def.kind === 'duel' ? 'le saboteur' : 'l’autre joueur' }, state, toast,
    send: () => {}, on: (ev, cb) => { cur.listeners[ev] = cb; },
    onState: (cb) => { cur.onState = cb; },
    leave,
    rematch: () => { cur.inst.destroy(); S.cur = null; openSolo(type, back); },
    save: (st, winnerSeat) => { state = st; cur.onState?.(st); if (winnerSeat != null && !def.ownResult) showResult(winnerSeat === 'draw' ? 'draw' : 'end'); },
    finish: (winnerRole) => showResult(winnerRole === 'runner' ? 'win' : 'lose'),
  };
  cur.inst = def.kind === 'duel' ? mountDuel(def, ctx) : def.mount(ctx);
}
