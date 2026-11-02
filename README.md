# SuiViD — Suivi sportif & nutrition

Application web de suivi sportif, nutritionnel et de progression
physique. **Google Sheets reste la source de vérité** — aucune base
SQL n'est utilisée. Un mode démo hors-ligne permet de tester toute
l'interface sans compte Google.

## Démarrage rapide (développement local, sans Docker)

```bash
npm install
cp .env.example .env.development   # optionnel — valeurs par défaut = mode démo
npm run dev
```

- Frontend : http://localhost:5173
- API : http://localhost:3001 (`/api` proxifié par Vite)
- Compte démo : `demo@suivid.app` / `dev` (créé automatiquement si aucun compte)

> Windows : `npm run dev` lance les deux serveurs via `concurrently`.
> Si besoin, ouvrez deux terminaux : `npm run dev:api` + `npm run dev:web`.

Le mode **démo** (`DATA_MODE=mock`, défaut) charge un classeur fictif
(bannière « Mode démo ») — rien n'est synchronisé vers Google.

## Mode connecté (Google Sheets)

```env
DATA_MODE=sheets
AUTH_SECRET=<chaîne aléatoire longue>
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

**Multi-utilisateur** : chaque compte a son propre classeur. À la
première connexion, l'application demande le lien Google Sheets de
l'utilisateur — provisionnement automatique des onglets manquants,
sans jamais écraser les données existantes (classeur fourni par le
coach).

Préparation côté utilisateur :

1. Recevoir/copier le classeur du coach dans son Drive.
2. Le partager avec l'e-mail du compte de service (affiché sur la
   page de configuration).
3. Coller le lien dans l'application.

Un `GOOGLE_SPREADSHEET_ID` global reste possible comme valeur par
défaut pour les comptes sans classeur lié.

Voir [docs/GOOGLE_SHEETS.md](docs/GOOGLE_SHEETS.md) pour créer le
compte de service et [docs/ANALYSE.md](docs/ANALYSE.md) pour le plan
de correspondance des données.

## Production (Docker)

```bash
cp .env.example .env       # renseignez les valeurs
docker compose up -d --build
docker compose logs -f
docker compose down
```

Application servie sur `http://<hôte>:8080` — voir
[docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) pour HTTPS / reverse proxy /
Portainer.

## Structure

```
suivi-raphael/
├── apps/
│   ├── web/        React + Vite + Tailwind (PWA)
│   └── api/        Fastify + Google Sheets API v4
├── packages/
│   └── shared/     Types + schémas Zod partagés
├── docker/         Dockerfile.web / Dockerfile.api / nginx.conf
├── docs/           Analyse, Google Sheets, déploiement
├── e2e/            Tests Playwright
└── docker-compose.yml
```

## Scripts utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | dev local (api + web) |
| `npm run dev:api` / `dev:web` | un seul serveur |
| `npm run build` | build prod (web + bundle api) |
| `npm run test` | tests Vitest (api + web) |
| `npm run test:e2e` | tests Playwright |
| `npm run typecheck` | vérification TypeScript |
| `npm run api:setup-sheets` | provisionne les onglets (sheets) |

## Règles de sécurité des données

- Journal : seules les cellules **C..K de la ligne du jour** (fuseau
  Europe/Paris) sont modifiables — vérifié côté serveur, relecture
  avant écriture, détection de conflit + confirmation d'écrasement.
- `Liste`, `Full body`, `Bilan` : jamais écrits (whitelist provider).
- Séances : append-only avec identifiants stables.
- Nouveaux onglets : créés uniquement par provisionnement explicite.
- Les secrets Google ne quittent jamais le serveur.

## Captures d'écran

Rendus mobile (Pixel 7) et desktop (1440 px) dans [`docs/screenshots/`](docs/screenshots/)
— régénérables avec `node scripts/screenshots.mjs` (serveurs dev requis).
