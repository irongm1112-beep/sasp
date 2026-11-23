/* SASP Effectif — liaison Firebase (connexion Google, base Firestore, gestion des accès).
   Fournit à la page la même interface que sur claude.ai : window.claude.use('db' | 'user'). */
(function () {
  const cfg = window.SASP_CONFIG || {};
  const ROLES = { viewer: 'Consultation', contrib: 'Contributor', editor: 'Éditeur', owner: 'Propriétaire' };
  const REDIRECT = location.origin + location.pathname;
  const REAUTH_MS = 12 * 3600 * 1000;

  // ---------- styles de l'écran de connexion et du panneau Accès ----------
  const st = document.createElement('style');
  st.textContent = `
  #fbGate{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;background:radial-gradient(900px 500px at 80% -10%,rgba(245,197,66,.25),transparent 70%),#0a0a0a;color:#fff;font:16px/1.5 Barlow,system-ui,sans-serif}
  #fbGate[hidden]{display:none}
  #fbGate .card{width:min(440px,100%);background:#141414;border:1px solid #333;border-top:5px solid #f5c400;border-radius:14px;padding:28px;display:grid;gap:14px;text-align:center}
  #fbGate img{width:110px;height:auto;margin:0 auto}
  #fbGate h2{margin:0;font:700 34px/1.05 "Barlow Condensed",sans-serif}
  #fbGate p{margin:0;color:#c9c9c9}
  #fbGate .gbtn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:48px;border-radius:8px;border:0;background:#5865F2;color:#fff;font:600 16px Barlow,sans-serif;cursor:pointer}
  #fbGate .gbtn:focus-visible,#fbAcc button:focus-visible,#fbAcc select:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}
  #fbGate .lnk{background:none;border:0;color:#9ab;text-decoration:underline;cursor:pointer;font:500 14px Barlow,sans-serif;min-height:40px}
  #fbGate .err{color:#ff6b6b;font-size:14px;min-height:1em}
  #fbAccBtn{position:fixed;left:16px;bottom:16px;z-index:46;min-height:44px;padding:0 16px;border-radius:99px;border:2px solid #0a0a0a;background:#fff;color:#0a0a0a;font:700 15px Barlow,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3)}
  #fbAccBtn[hidden]{display:none}
  #fbAccBtn b{display:inline-block;min-width:20px;height:20px;border-radius:99px;background:#c62828;color:#fff;font-size:12px;line-height:20px;margin-left:6px}
  #fbAcc{border:0;border-radius:12px;padding:0;width:min(720px,96vw);max-height:90vh;overflow:auto;background:#fff;color:#111;font:16px/1.5 Barlow,sans-serif}
  #fbAcc::backdrop{background:rgba(0,0,0,.6)}
  #fbAcc header{background:#0a0a0a;color:#fff;padding:16px 20px;border-bottom:3px solid #f5c400;display:flex;justify-content:space-between;align-items:center}
  #fbAcc h3{margin:0;font:700 26px "Barlow Condensed",sans-serif}
  #fbAcc .body{padding:16px 20px;display:grid;gap:16px}
  #fbAcc .row{display:grid;grid-template-columns:40px minmax(0,1fr) 170px auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #e5e5e5}
  #fbAcc .row img{width:36px;height:36px;border-radius:50%;object-fit:cover;background:#ddd}
  #fbAcc .row small{display:block;color:#666}
  #fbAcc select,#fbAcc textarea{font:15px Barlow,sans-serif;min-height:40px;border:1px solid #ccc;border-radius:6px;padding:0 8px;background:#fff;color:#111}
  #fbAcc textarea{width:100%;min-height:110px;padding:8px;font:12px ui-monospace,monospace}
  #fbAcc .b{min-height:40px;padding:0 14px;border-radius:6px;border:0;background:#f5c400;color:#0a0a0a;font:700 15px Barlow,sans-serif;cursor:pointer}
  #fbAcc .g{background:transparent;border:1px solid #ccc}
  #fbAcc .x{background:none;border:0;color:#fff;font-size:26px;cursor:pointer;min-width:44px;min-height:44px}
  #fbAcc .pend{background:#fff6d6}
  #fbAcc .hint{color:#666;font-size:14px;margin:0}
  @media(max-width:560px){#fbAcc .row{grid-template-columns:36px minmax(0,1fr)}#fbAcc .row select,#fbAcc .row .g{grid-column:2}}`;
  document.head.appendChild(st);

  const gate = document.createElement('div');
  gate.id = 'fbGate';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(gate));
  if (document.body) document.body.appendChild(gate);
  const G = (html) => { gate.innerHTML = `<div class="card"><img src="logo.png" alt="Insigne SASP">${html}</div>`; gate.hidden = false; };

  if (!window.firebase || !cfg.firebase || String(cfg.firebase.apiKey || '').includes('COLLE') || !cfg.discordClientId || String(cfg.discordClientId).includes('COLLE') || !cfg.workerUrl || String(cfg.workerUrl).includes('COLLE')) {
    G(`<h2>Configuration manquante</h2><p>Ouvre le fichier <b>config.js</b> et remplis la configuration Firebase, l’ID de l’application Discord et l’adresse du Worker Cloudflare.</p>`);
    window.claude = { use: () => new Promise(() => {}) };
    return;
  }

  firebase.initializeApp(cfg.firebase);
  const auth = firebase.auth();
  const fs = firebase.firestore();
  try { fs.settings({ ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
  firebase.firestore.DocumentReference.prototype.acquire = async function () { return { acquired: true }; };
  // Prévenir la page aussi quand Firebase confirme les données avec le serveur (sinon : faux message « La base ne répond pas »).
  for (const C of [firebase.firestore.Query, firebase.firestore.DocumentReference]) {
    const P = C && C.prototype; const orig = P && P.onSnapshot; if (!orig) continue;
    P.onSnapshot = function (...a) { return typeof a[0] === 'function' ? orig.call(this, { includeMetadataChanges: true }, ...a) : orig.apply(this, a); };
  }

  const S = { user: null, role: null };
  let resolveReady; const ready = new Promise((r) => (resolveReady = r));

  const DISCORD_SVG = '<svg width="22" height="22" viewBox="0 0 127 96" aria-hidden="true"><path fill="#fff" d="M107.7 8.1A105 105 0 0 0 81.5 0a72 72 0 0 0-3.4 6.8 97.7 97.7 0 0 0-29.1 0A72 72 0 0 0 45.6 0a105.9 105.9 0 0 0-26.3 8.1C2.8 32.6-1.7 56.6.5 80.2a105.7 105.7 0 0 0 32.2 16.2 77.7 77.7 0 0 0 6.9-11.2 68.4 68.4 0 0 1-10.9-5.2l2.7-2.1a75.6 75.6 0 0 0 64.3 0l2.7 2.1a68.7 68.7 0 0 1-10.9 5.2 77 77 0 0 0 6.9 11.2 105.3 105.3 0 0 0 32.2-16.2c2.6-27.3-4.5-51.1-18.9-72.1ZM42.5 65.7c-6.3 0-11.4-5.7-11.4-12.8s5-12.8 11.4-12.8S53.9 45.9 53.8 52.9c0 7.1-5 12.8-11.3 12.8Zm42 0c-6.3 0-11.4-5.7-11.4-12.8s5-12.8 11.4-12.8 11.5 5.8 11.4 12.8c0 7.1-5 12.8-11.4 12.8Z"/></svg>';
  const loginUI = (msg) => G(`<h2>SASP — Effectif</h2><p>Connecte-toi avec ton compte Discord. L’accès est réservé aux membres du serveur Discord de la SASP.</p>
    <button class="gbtn" id="fbD">${DISCORD_SVG}Se connecter avec Discord</button>
    <p class="err" id="fbErr">${msg || ''}</p>`);
  function goDiscord(silent) {
    const st = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { sessionStorage.setItem('sasp_state', st); sessionStorage.setItem('sasp_silent', silent ? '1' : ''); } catch (e) {}
    const q = new URLSearchParams({ client_id: cfg.discordClientId, response_type: 'code', redirect_uri: REDIRECT, scope: 'identify guilds.members.read', state: st });
    if (silent) q.set('prompt', 'none');
    location.href = 'https://discord.com/oauth2/authorize?' + q.toString();
  }
  const deniedUI = (title, text) => G(`<h2>${title}</h2><p>${text}</p><button class="lnk" id="fbD">Réessayer avec un autre compte Discord</button>`);

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  gate.addEventListener('click', (e) => {
    if (e.target.closest('#fbD')) goDiscord(false);
    if (e.target.closest('#fbOut')) { auth.signOut(); }
  });

  // Retour de Discord : ?code=…&state=…
  async function handleReturn() {
    const p = new URLSearchParams(location.search);
    if (!p.has('code') && !p.has('error')) return false;
    let st = '', silent = '';
    try { st = sessionStorage.getItem('sasp_state') || ''; silent = sessionStorage.getItem('sasp_silent') || ''; sessionStorage.removeItem('sasp_state'); } catch (e) {}
    history.replaceState(null, '', REDIRECT);
    if (p.has('error')) { if (silent) { await auth.signOut().catch(() => {}); } loginUI(silent ? '' : 'Connexion Discord annulée.'); return true; }
    if (!st || p.get('state') !== st) { loginUI('Connexion expirée, réessaie.'); return true; }
    G('<h2>Connexion…</h2><p>Vérification de ton compte Discord sur le serveur SASP.</p>');
    try {
      const r = await fetch(cfg.workerUrl.replace(/\/$/, '') + '/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: p.get('code'), redirect_uri: REDIRECT }) });
      const j = await r.json();
      if (j.error === 'not_member') { await auth.signOut().catch(() => {}); deniedUI('Accès réservé', 'Ce compte Discord n’est pas membre du serveur Discord de la SASP.'); return true; }
      if (j.error === 'no_role') { await auth.signOut().catch(() => {}); deniedUI('Accès réservé', 'Tu es bien sur le serveur SASP, mais aucun de tes rôles Discord ne donne accès au site. Demande à un responsable.<br><small style="color:#777">ID Discord : ' + esc(j.discordId || '') + '</small>'); return true; }
      if (!j.token) { loginUI('Connexion impossible (' + esc(j.error || 'erreur') + (j.detail ? ' : ' + esc(j.detail) : '') + ').'); return true; }
      try { localStorage.setItem('sasp_profile', JSON.stringify(j.profile)); localStorage.setItem('sasp_auth_at', String(Date.now())); } catch (e) {}
      await auth.signInWithCustomToken(j.token);
    } catch (e) { loginUI('Serveur de connexion injoignable. Vérifie l’adresse du Worker dans config.js.'); }
    return true;
  }

  let started = false, returning = true, pending = undefined;
  auth.onAuthStateChanged((u) => { if (returning) { pending = u; return; } onUser(u); });
  async function onUser(u) {
    if (!u) { S.user = null; if (started) location.reload(); else loginUI(); return; }
    let at = 0; try { at = +localStorage.getItem('sasp_auth_at') || 0; } catch (e) {}
    if (Date.now() - at > REAUTH_MS) { goDiscord(true); return; }       // rafraîchit les rôles Discord toutes les 12 h
    let tok; try { tok = await u.getIdTokenResult(); } catch (e) { loginUI(); return; }
    const role = tok.claims.role;
    if (!ROLES[role]) { await auth.signOut(); loginUI(); return; }
    let prof = {}; try { prof = JSON.parse(localStorage.getItem('sasp_profile') || '{}'); } catch (e) {}
    S.user = { uid: u.uid, displayName: prof.name || '', photoURL: prof.avatar || '', email: null };
    S.role = role; S.profile = prof;
    fs.doc('profils/' + u.uid).set({ name: prof.name || '', photo: prof.avatar || '', discordId: prof.discordId || '', username: prof.username || '', role, vu: new Date().toISOString() }, { merge: true }).catch(() => {});
    gate.hidden = true;
    if (!started) { started = true; resolveReady(); setupAccess(); }
  }
  (async () => {
    const handled = await handleReturn();
    returning = false;
    if (handled) { if (auth.currentUser) onUser(auth.currentUser); }
    else if (pending !== undefined) onUser(pending);
  })();

  // ---------- interface attendue par la page ----------
  const DB = { doc: (p) => fs.doc(p), collection: (p) => fs.collection(p) };
  const color = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 55% 45%)`; };
  const initials = (n, id) => { const t = (n || '?').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="${color(id)}"/><text x="20" y="25" font-family="Arial" font-size="15" fill="#fff" text-anchor="middle">${t}</text></svg>`); };
  const USER = {
    isOwner: async () => S.role === 'owner',
    canEdit: async () => S.role === 'owner' || S.role === 'editor',
    can: async (n) => (n === 'data.write' ? ['owner', 'editor', 'contrib'].includes(S.role) : false),
    id: async () => (S.user ? S.user.uid : null),
    me: async () => ({ id: S.user ? S.user.uid : null, name: S.user ? (S.user.displayName || '') : '', email: S.user ? S.user.email : null,
      avatarUrl: (S.user && S.user.photoURL) || initials(S.user && S.user.displayName, S.user && S.user.uid), color: color(S.user && S.user.uid),
      isOwner: S.role === 'owner', canEdit: S.role === 'owner' || S.role === 'editor' }),
    profiles: async (ids) => {
      const out = {};
      await Promise.all([].concat(ids).map(async (id) => {
        let d = {};
        try { const s = await fs.doc('profils/' + id).get(); d = s.exists ? s.data() : {}; } catch (e) {}
        out[id] = { id, name: d.name || '', avatarUrl: d.photo || initials(d.name, id), color: color(id), email: null, isMe: S.user && id === S.user.uid, guest: false };
      }));
      return out;
    },
    name: async () => (S.user ? S.user.displayName || '' : ''),
    search: async () => [],
  };
  window.claude = { use: async (name) => { await ready; return name === 'db' ? DB : name === 'user' ? USER : null; } };

  // ---------- panneau « Accès » (propriétaire et Éditeurs) ----------
  function setupAccess() {
    if (!(S.role === 'owner' || S.role === 'editor')) return;
    const btn = document.createElement('button');
    btn.id = 'fbAccBtn'; btn.type = 'button'; btn.innerHTML = 'Accès<b id="fbPend" hidden>0</b>';
    const dlg = document.createElement('dialog'); dlg.id = 'fbAcc';
    const myRoles = (S.profile && S.profile.roles) || [];
    dlg.innerHTML = `<header><h3>Accès au site</h3><button class="x" type="button" aria-label="Fermer">×</button></header>
      <div class="body"><p class="hint">Les accès viennent des <b>rôles Discord</b> du serveur SASP (réglés dans le Worker Cloudflare, variable <b>ROLE_MAP</b>). Pour retirer un accès : retire le rôle sur Discord ; il s’applique à la prochaine connexion (au plus tard 12 h).</p>
      <div id="fbList"></div>
      ${S.role === 'owner' ? `<div><h3 style="font:700 20px 'Barlow Condensed',sans-serif;margin:0 0 6px">Tes rôles Discord (IDs)</h3>
      <p class="hint">Pour remplir ROLE_MAP : ${myRoles.length ? myRoles.map((r) => `<code>${esc(r)}</code>`).join(' · ') : 'aucun rôle'}</p></div>
      <div><h3 style="font:700 20px 'Barlow Condensed',sans-serif;margin:0 0 6px">Importer des données</h3>
      <p class="hint">Colle ici le texte copié avec « Exporter les données » (page Équipe de l’ancien site). Les éléments existants avec le même identifiant sont remplacés.</p>
      <textarea id="fbImp" placeholder='{"format":"sasp-export", ...}'></textarea>
      <p style="margin:6px 0 0"><button class="b" type="button" id="fbImpGo">Importer</button> <span class="hint" id="fbImpInfo"></span></p></div>` : ''}
      </div>`;
    document.body.append(btn, dlg);
    btn.addEventListener('click', () => dlg.showModal());
    dlg.querySelector('.x').addEventListener('click', () => dlg.close());
    btn.innerHTML = 'Accès';
    fs.collection('profils').onSnapshot((sn) => {
      const L = sn.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.vu || '').localeCompare(String(a.vu || '')));
      document.getElementById('fbList').innerHTML = L.map((x) => `<div class="row"><img src="${esc(x.photo || initials(x.name, x.id))}" alt="">
        <div><b>${esc(x.name || 'Sans nom')}</b><small>@${esc(x.username || '')} · vu le ${esc(String(x.vu || '').slice(0, 10))}</small></div>
        <span><b>${esc(ROLES[x.role] || x.role || '')}</b></span><span></span></div>`).join('') || '<p class="hint">Personne pour l’instant.</p>';
    });
    dlg.addEventListener('click', (e) => { if (e.target.closest('#fbImpGo')) importData(); });
    function alert0(t) { const i = document.getElementById('fbImpInfo'); if (i) i.textContent = t; }
    async function importData() {
      const info = document.getElementById('fbImpInfo');
      let o; try { o = JSON.parse(document.getElementById('fbImp').value); } catch (e) { info.textContent = 'Texte invalide : colle exactement le bloc exporté.'; return; }
      if (!o || o.format !== 'sasp-export' || !o.docs) { info.textContent = 'Ce n’est pas un export SASP.'; return; }
      const ent = Object.entries(o.docs).filter(([p]) => /^(agents|config|eow|partis)\/[^/]+$|^semaines\/[^/]+\/heures\/[^/]+$/.test(p));
      info.textContent = `Import de ${ent.length} éléments…`;
      try {
        for (let i = 0; i < ent.length; i += 400) { const b = fs.batch(); for (const [p, d] of ent.slice(i, i + 400)) b.set(fs.doc(p), d); await b.commit(); }
        info.textContent = `${ent.length} éléments importés.`;
      } catch (e) { info.textContent = 'Import interrompu : ' + (e.code || e.message); }
    }
  }
})();
