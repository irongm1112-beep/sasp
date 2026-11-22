/* SASP Effectif — liaison Firebase (connexion Google, base Firestore, gestion des accès).
   Fournit à la page la même interface que sur claude.ai : window.claude.use('db' | 'user'). */
(function () {
  const cfg = window.SASP_CONFIG || {};
  const OWNER = String(cfg.ownerEmail || '').toLowerCase().trim();
  const ROLES = { pending: 'En attente', refuse: 'Refusé', viewer: 'Consultation', contrib: 'Contributor', editor: 'Éditeur', owner: 'Propriétaire' };

  // ---------- styles de l'écran de connexion et du panneau Accès ----------
  const st = document.createElement('style');
  st.textContent = `
  #fbGate{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;background:radial-gradient(900px 500px at 80% -10%,rgba(245,197,66,.25),transparent 70%),#0a0a0a;color:#fff;font:16px/1.5 Barlow,system-ui,sans-serif}
  #fbGate[hidden]{display:none}
  #fbGate .card{width:min(440px,100%);background:#141414;border:1px solid #333;border-top:5px solid #f5c400;border-radius:14px;padding:28px;display:grid;gap:14px;text-align:center}
  #fbGate img{width:110px;height:auto;margin:0 auto}
  #fbGate h2{margin:0;font:700 34px/1.05 "Barlow Condensed",sans-serif}
  #fbGate p{margin:0;color:#c9c9c9}
  #fbGate .gbtn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:48px;border-radius:8px;border:0;background:#fff;color:#111;font:600 16px Barlow,sans-serif;cursor:pointer}
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

  if (!window.firebase || !cfg.firebase || String(cfg.firebase.apiKey || '').includes('COLLE')) {
    G(`<h2>Configuration manquante</h2><p>Ouvre le fichier <b>config.js</b> et colle la configuration Firebase de ton projet, puis ton e-mail Google dans <b>ownerEmail</b>.</p>`);
    window.claude = { use: () => new Promise(() => {}) };
    return;
  }

  firebase.initializeApp(cfg.firebase);
  const auth = firebase.auth();
  const fs = firebase.firestore();
  try { fs.settings({ ignoreUndefinedProperties: true, merge: true }); } catch (e) {}
  firebase.firestore.DocumentReference.prototype.acquire = async function () { return { acquired: true }; };

  const S = { user: null, role: null };
  let resolveReady; const ready = new Promise((r) => (resolveReady = r));

  const loginUI = (msg) => G(`<h2>SASP — Effectif</h2><p>Connecte-toi pour accéder à l’effectif de la San Andreas State Police.</p>
    <button class="gbtn" id="fbG"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Se connecter avec Google</button>
    <p class="err" id="fbErr">${msg || ''}</p>`);

  const pendingUI = (u, refused) => G(`<h2>${refused ? 'Accès refusé' : 'Demande envoyée'}</h2>
    <p>${refused ? 'Ton accès a été refusé par un responsable.' : 'Ton compte doit être validé par un responsable avant d’accéder au site. Reviens un peu plus tard : la page s’ouvrira toute seule dès la validation.'}</p>
    <p style="color:#888">${esc(u.displayName || '')} · ${esc(u.email || '')}</p>
    <button class="lnk" id="fbOut">Se déconnecter</button>`);

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  gate.addEventListener('click', async (e) => {
    if (e.target.closest('#fbG')) {
      try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
      catch (er) {
        if (er && (er.code === 'auth/popup-blocked' || er.code === 'auth/operation-not-supported-in-this-environment')) auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
        else { const x = document.getElementById('fbErr'); if (x) x.textContent = 'Connexion impossible : ' + (er && er.code || 'erreur'); }
      }
    }
    if (e.target.closest('#fbOut')) auth.signOut();
  });

  let unsubRole = null, started = false;
  auth.onAuthStateChanged(async (u) => {
    if (unsubRole) { unsubRole(); unsubRole = null; }
    if (!u) { S.user = null; if (started) location.reload(); else loginUI(); return; }
    S.user = u;
    const email = String(u.email || '').toLowerCase();
    const owner = !!OWNER && email === OWNER;
    const ref = fs.doc('roles/' + u.uid);
    const prof = { email: u.email || '', name: u.displayName || u.email || '', photo: u.photoURL || '' };
    try {
      const snap = await ref.get();
      if (!snap.exists) await ref.set({ ...prof, role: owner ? 'owner' : 'pending', cree: new Date().toISOString() });
      else await ref.update(prof).catch(() => {});
    } catch (e) { loginUI('Accès à la base refusé. Vérifie les règles Firestore et ton e-mail dans config.js.'); return; }
    unsubRole = ref.onSnapshot((s) => {
      const r = owner ? 'owner' : (s.exists ? s.data().role : 'pending');
      if (S.role && r !== S.role) { location.reload(); return; }
      S.role = r;
      if (r === 'pending' || r === 'refuse' || !ROLES[r]) { pendingUI(u, r === 'refuse'); return; }
      gate.hidden = true;
      if (!started) { started = true; resolveReady(); setupAccess(); }
    }, () => loginUI('Lecture de ton rôle impossible.'));
  });

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
        try { const s = await fs.doc('roles/' + id).get(); d = s.exists ? s.data() : {}; } catch (e) {}
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
    dlg.innerHTML = `<header><h3>Accès au site</h3><button class="x" type="button" aria-label="Fermer">×</button></header>
      <div class="body"><p class="hint">Chaque personne qui se connecte avec Google arrive « En attente ». Choisis son niveau : <b>Consultation</b> (lecture seule), <b>Contributor</b> (agents et heures ; grades/primes/divisions si son grade est en supervision ou état-major), <b>Éditeur</b> (tout + page Équipe et cet écran).</p>
      <div id="fbList"></div>
      ${S.role === 'owner' ? `<div><h3 style="font:700 20px 'Barlow Condensed',sans-serif;margin:0 0 6px">Importer des données</h3>
      <p class="hint">Colle ici le texte copié avec « Exporter les données » (page Équipe de l’ancien site). Les éléments existants avec le même identifiant sont remplacés.</p>
      <textarea id="fbImp" placeholder='{"format":"sasp-export", ...}'></textarea>
      <p style="margin:6px 0 0"><button class="b" type="button" id="fbImpGo">Importer</button> <span class="hint" id="fbImpInfo"></span></p></div>` : ''}
      </div>`;
    document.body.append(btn, dlg);
    btn.addEventListener('click', () => dlg.showModal());
    dlg.querySelector('.x').addEventListener('click', () => dlg.close());
    fs.collection('roles').onSnapshot((sn) => {
      const L = sn.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.role === 'pending' ? -1 : 0) - (b.role === 'pending' ? -1 : 0) || String(a.name).localeCompare(String(b.name)));
      const np = L.filter((x) => x.role === 'pending').length; const pb = document.getElementById('fbPend'); pb.hidden = !np; pb.textContent = np;
      document.getElementById('fbList').innerHTML = L.map((x) => `<div class="row${x.role === 'pending' ? ' pend' : ''}"><img src="${esc(x.photo || initials(x.name, x.id))}" alt="">
        <div><b>${esc(x.name || 'Sans nom')}</b><small>${esc(x.email || '')}</small></div>
        ${x.role === 'owner' ? '<span><b>Propriétaire</b></span><span></span>' : `<select data-uid="${esc(x.id)}" aria-label="Niveau d’accès">${['pending', 'refuse', 'viewer', 'contrib', 'editor'].map((r) => `<option value="${r}"${r === x.role ? ' selected' : ''}>${ROLES[r]}</option>`).join('')}</select>
        <button class="b g" type="button" data-del="${esc(x.id)}">Supprimer</button>`}</div>`).join('') || '<p class="hint">Personne pour l’instant.</p>';
    });
    dlg.addEventListener('change', async (e) => { const s = e.target.closest('[data-uid]'); if (!s) return; try { await fs.doc('roles/' + s.dataset.uid).update({ role: s.value }); } catch (er) { alert0('Modification refusée.'); } });
    dlg.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-del]');
      if (d) { if (d.dataset.armed !== '1') { d.dataset.armed = '1'; d.textContent = 'Confirmer ?'; setTimeout(() => { d.dataset.armed = ''; d.textContent = 'Supprimer'; }, 4000); return; }
        try { await fs.doc('roles/' + d.dataset.del).delete(); await fs.doc('membres/' + d.dataset.del).delete().catch(() => {}); } catch (er) { alert0('Suppression refusée.'); } }
      if (e.target.closest('#fbImpGo')) importData();
    });
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
