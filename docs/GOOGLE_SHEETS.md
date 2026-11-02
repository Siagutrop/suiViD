# Connexion Google Sheets

L'API lit et écrit dans votre classeur via **Google Sheets API v4**.
Le classeur reste la source de vérité — aucune base SQL.

## ⚠️ Règle d'or

**Ne branchez jamais l'application sur le classeur original pendant le
développement.** Travaillez sur une **copie** (Fichier → Créer une
copie) et récupérez son ID dans l'URL :
`https://docs.google.com/spreadsheets/d/<ID>/edit`.

## Option A — Compte de service (recommandé : serveur/Docker)

1. [Google Cloud Console](https://console.cloud.google.com) → créez un
   projet (ex. `suivid`).
2. **APIs et services → Bibliothèque** → activez *Google Sheets API*.
3. **Identifiants → Créer → Compte de service** → nommez-le (ex.
   `suivid-api`). Aucun rôle projet nécessaire.
4. Compte de service → **Clés → Ajouter → JSON** → téléchargez le
   fichier `*.json`.
5. Dans Google Sheets (la **copie**) → **Partager** → ajoutez
   l'e-mail `xxxx@projet.iam.gserviceaccount.com` en **Éditeur**.

Configuration `.env` — trois variantes équivalentes :

```env
# A) chemin vers le fichier téléchargé (dev local)
GOOGLE_SERVICE_ACCOUNT_FILE=C:/chemin/vers/cle.json

# B) contenu JSON sur une ligne (Portainer / variable d'env)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...",...}

# C) champs séparés
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxxx@projet.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Option B — OAuth 2.0 utilisateur (dev personnel)

Utile si le compte de service ne convient pas (ex. Sheets non
partageables à un compte externe).

1. Cloud Console → activez *Google Sheets API*.
2. **Identifiants → Créer → ID client OAuth** → type *Application
   bureau*.
3. Générez un refresh token avec le scope
   `https://www.googleapis.com/auth/spreadsheets` via
   [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
   (roue crantée → *Use your own OAuth credentials*).

```env
GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
GOOGLE_OAUTH_REFRESH_TOKEN=1//0g...
```

| | Compte de service | OAuth utilisateur |
|---|---|---|
| Identité | robot `@iam.gserviceaccount.com` | votre compte Google |
| Partage requis | oui (e-mail du SA en éditeur) | non |
| Révocation | supprimer la clé | révoquer l'accès app |
| Recommandé | **prod / Docker** | dev perso |

## Variables complètes

```env
DATA_MODE=sheets
AUTH_SECRET=<chaîne aléatoire ≥ 32 caractères>
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# GOOGLE_SPREADSHEET_ID=<id>   # optionnel : repli par défaut
# ALLOW_SIGNUP=true            # ouvrir l'inscription
# DEMO_PASSWORD=...            # mdp du compte démo seedé (défaut : dev)
```

## Liaison d'un classeur par utilisateur

Chaque compte utilise son propre classeur. À la première connexion
(ou Paramètres → Mon classeur), l'application demande le lien :

1. L'utilisateur partage son classeur (copie du fichier du coach)
   avec l'**e-mail du compte de service** — affiché dans l'app.
2. Il colle le lien `docs.google.com/spreadsheets/d/…`.
3. L'API vérifie l'accès puis **provisionne automatiquement** les
   onglets manquants : `Programmes`, `ProgrammeExercices`, `Seances`,
   `SeanceSeries`, `Parametres` (+ en-têtes `Suivi`/`Liste`/`Full
   body` si et seulement si ces zones sont vides).

Les données existantes du classeur du coach ne sont **jamais
écrasées** : le provisionnement n'écrit que dans des onglets absents
ou des zones entièrement vides.

## Provisionnement manuel (outil admin)

Pour provisionner un classeur par ID hors de l'app :

```bash
DATA_MODE=sheets npm run api:setup-sheets <id-du-classeur>
```

Le script crée les onglets manquants + leurs en-têtes et **importe le
modèle « Full body »** comme premier programme. Les onglets `Suivi`,
`Liste`, `Full body`, `Bilan` ne sont jamais modifiés par ce script
(ni par quoi que ce soit d'autre — whitelist serveur).

## Portée et limites

- Scope unique : `.../auth/spreadsheets` (lecture+écriture du classeur
  partagé). Pas de Drive, pas d'autres API.
- Les restrictions « onglet/colonne/date » sont appliquées par l'API
  applicative — les permissions Google seules ne les garantissent pas.
- Quotas : l'app fait des lectures plages et des écritures ciblées ;
  une erreur 429 se traduit par « Quota atteint, réessayez ».
