# Déploiement

## 1. Préparer `.env`

```bash
cp .env.example .env
```

Valeurs obligatoires en production :

```env
DATA_MODE=sheets
AUTH_SECRET=<64 caractères aléatoires — ex: openssl rand -hex 32>
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
WEB_PORT=8080
CORS_ORIGIN=https://suivid.mondomaine.fr
ALLOW_SIGNUP=true        # ouvrir l'inscription aux amis
# GOOGLE_SPREADSHEET_ID= # classeur par défaut (optionnel)
```

Le fichier `.env` n'est **jamais commité** (`.gitignore`). Sur
Portainer, collez ces variables dans *Environment variables*.

## 2. Lancer

```bash
docker compose up -d --build
docker compose ps          # les 2 services doivent être « healthy »
docker compose logs -f     # suivi des logs
docker compose down        # arrêt
```

- `web` (nginx) sert le frontend et proxyfie `/api` → `api:3001`.
- `api` n'expose **aucun port public** (`expose` interne uniquement).
- App disponible sur `http://<serveur>:8080`.

## 3. HTTPS via reverse proxy

Le conteneur `web` écoute en HTTP — terminez TLS devant.

### Caddy (le plus simple)

```
suivid.mondomaine.fr {
    reverse_proxy localhost:8080
}
```

### Traefik (docker-compose.override.yml)

```yaml
services:
  web:
    labels:
      - traefik.enable=true
      - traefik.http.routers.suivid.rule=Host(`suivid.mondomaine.fr`)
      - traefik.http.routers.suivid.entrypoints=websecure
      - traefik.http.routers.suivid.tls.certresolver=le
      - traefik.http.services.suivid.loadbalancer.server.port=80
    networks: [traefik, suivid]
networks:
  traefik: { external: true }
```

(et retirer `ports:` du service `web` ou garder pour accès local.)

### Nginx Proxy Manager

Proxy host → `http://<ip-docker>:8080`, onglet SSL → Let's Encrypt +
*Force SSL*.

## 4. Comptes utilisateurs

Les comptes sont stockés dans `/data/users.json` (volume
`suivid-data`, déjà monté dans `docker-compose.yml`) — mots de passe
hachés (scrypt), jamais en clair.

- `ALLOW_SIGNUP=true` : bouton « Créer un compte » sur la page de
  connexion — vos amis s'inscrivent puis lient leur classeur.
- `ALLOW_SIGNUP=false` (défaut) : pas d'inscription ouverte ; créez
  les comptes via l'API admin ou laissez le compte démo
  (`demo@suivid.app` / `dev` — **à changer**, voir
  `DEMO_PASSWORD` dans `.env.example`).

Chaque utilisateur lie son propre Google Sheets : première connexion
→ page de configuration → partage du classeur avec l'e-mail du compte
de service → collage du lien → provisionnement automatique des
onglets (sans toucher aux données existantes du coach).

## 5. Fichier de clé de compte de service (option volume)

Si vous préférez `GOOGLE_SERVICE_ACCOUNT_FILE` au JSON inline :

```yaml
# docker-compose.override.yml
services:
  api:
    volumes:
      - /chemin/serveur/sa-key.json:/secrets/sa-key.json:ro
    environment:
      GOOGLE_SERVICE_ACCOUNT_FILE: /secrets/sa-key.json
```

## 6. Portainer

1. **Stacks → Add stack** → collez `docker-compose.yml` (ou repo Git).
2. Renseignez les *Environment variables*.
3. *Deploy the stack* — les healthchecks donnent l'état dans l'UI.
4. Un `docker-compose.override.yml` peut être fusionné pour Traefik.

## 7. Premier démarrage

1. Déployez en `DATA_MODE=sheets` avec le compte de service.
2. Connectez-vous (compte démo ou compte créé) et liez une **copie
   de test** du classeur depuis la page de configuration — le
   provisionnement des onglets est automatique à la liaison.
3. Vérifiez le comportement sur la copie, puis liez le classeur
   réel (Paramètres → Mon classeur).

Outil admin (provisionne un classeur arbitraire par ID, hors app) :

```bash
DATA_MODE=sheets npm run api:setup-sheets <id-du-classeur>
```

## 8. Mises à jour

```bash
git pull && docker compose up -d --build
```

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `api` unhealthy au démarrage | `DATA_MODE=sheets` sans identifiants → voir logs |
| `403 Accès refusé par Google` | classeur non partagé avec l'e-mail du compte de service |
| `Onglets manquants` | provisionnement non exécuté |
| Page blanche / 502 | `web` démarre avant `api` → `depends_on: service_healthy` gère ça |
