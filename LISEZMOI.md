# SASP — Effectif : mise en ligne sur GitHub

Le site tourne sur **GitHub Pages** (gratuit) avec **Firebase** (gratuit) pour la base de données et la connexion Google.

## 1. Firebase (base de données + connexion)

1. Va sur **console.firebase.google.com** → **Créer un projet** (ex. `sasp-effectif`). Google Analytics : inutile.
2. **Firestore** : menu *Databases & Storage → Firestore* (ou *Build → Firestore Database*) → **Create database** → édition **Standard**, ID `(default)`, emplacement **europe-west1**, mode **production**.
3. **Règles** : dans Firestore, onglet **Règles / Rules** → efface tout → colle le contenu du fichier `firestore.rules` → remplace `OWNER_EMAIL` par **ton e-mail Google en minuscules** → **Publier**.
4. **Connexion** : menu **Authentication** → *Get started* → onglet **Sign-in method** → active **Google**.
5. **Configuration** : roue dentée ⚙️ → **Paramètres du projet** → *Vos applications* → icône **Web `</>`** → nom `site` → **Enregistrer** → copie le bloc `firebaseConfig`.

## 2. Le fichier `config.js`

Ouvre `config.js` et remplace :
- `ownerEmail` par ton e-mail Google (le même que dans les règles) ;
- chaque `COLLE_ICI` par les valeurs de ton `firebaseConfig`.

## 3. GitHub Pages

1. Sur **github.com** → **New repository** → nom `sasp` → **Public** → *Create repository*.
2. Clique **uploading an existing file** → glisse **tous les fichiers** de ce dossier (index.html, shim.js, config.js, logo.png, guignol.png, junior.png…) → **Commit changes**.
3. Onglet **Settings** → **Pages** → *Source* : **Deploy from a branch** → branche **main**, dossier **/ (root)** → **Save**.
4. Après 1–2 minutes, ton site est à : `https://TON-PSEUDO.github.io/sasp/`
5. Retourne dans Firebase → **Authentication → Settings → Authorized domains** → **Add domain** → `TON-PSEUDO.github.io`.

## 4. Première connexion et transfert des données

1. Ouvre ton site → **Se connecter avec Google** avec le compte de `ownerEmail` → tu es **Propriétaire**.
2. Sur l’ancien site (claude.ai) : page **Équipe** → **Exporter les données** → **Copier**.
3. Sur le nouveau site : bouton **Accès** (en bas à gauche) → **Importer des données** → colle → **Importer**.

## 5. Donner l’accès aux agents

- Envoie le lien du site à tes agents. Ils se connectent avec Google et arrivent **« En attente »**.
- Bouton **Accès** (un badge rouge indique les demandes) → choisis pour chacun :
  - **Consultation** : lecture seule ;
  - **Contributor** : agents et heures ; s’il choisit un agent du corps de supervision ou de l’état-major, il peut aussi modifier grades, primes et divisions ;
  - **Éditeur** : tout, + page Équipe + écran Accès.
- À sa première visite validée, chacun choisit son agent dans la liste (ou crée sa fiche).

## Mettre à jour le site plus tard

Remplace `index.html` (ou un autre fichier) dans le dépôt GitHub → **Commit**. Les données restent dans Firebase.
