# Déploiement

## 1. Préparer `.env`

```bash
cp .env.example .env
```

Valeurs obligatoires en production :

```env
DATA_MODE=sqlite          # ou sheets si vous utilisez Google Sheets
AUTH_SECRET=<64 caractères aléatoires — ex: openssl rand -hex 32>
COACH_EMAIL=coach@exemple.fr
COACH_PASSWORD=<mot de passe fort>
WEB_PORT=8080
CORS_ORIGIN=https://suivid.mondomaine.fr
ALLOW_SIGNUP=true         # ouvrir l'inscription aux clients
# En mode sheets :
# GOOGLE_SERVICE_ACCOUNT_FILE=/data/secrets/sa-key.json
```

Le fichier `.env` n'est **jamais commité** (`.gitignore`). Sur
Portainer, collez ces variables dans *Environment variables*.

## 2. Lancer

```bash
docker compose up -d          # utilise l'image ghcr.io/siagutrop/suivid:latest
docker compose up -d --build  # ou build local depuis les sources
docker compose ps             # le service « app » doit être « healthy »
docker compose logs -f        # suivi des logs
docker compose down           # arrêt
```

Un **seul conteneur** (`app`) : l'API Fastify sert le frontend statique
et les routes `/api/*`. Le port hôte `${WEB_PORT:-8080}` est mappé sur
le port interne `${PORT:-3001}` — l'app répond sur
`http://<serveur>:8080`.

Les données persistent dans le volume `suivid-data` monté sur `/data`
(base SQLite `suivid.db`, `users.json`, photos, sauvegardes auto).

## 3. HTTPS via reverse proxy

Le conteneur écoute en HTTP — terminez TLS devant.

### Caddy (le plus simple)

```
suivid.mondomaine.fr {
    reverse_proxy localhost:8080
}
```

### Traefik (docker-compose.override.yml)

```yaml
services:
  app:
    labels:
      - traefik.enable=true
      - traefik.http.routers.suivid.rule=Host(`suivid.mondomaine.fr`)
      - traefik.http.routers.suivid.entrypoints=websecure
      - traefik.http.routers.suivid.tls.certresolver=le
      - traefik.http.services.suivid.loadbalancer.server.port=3001
    networks: [traefik, suivid]
networks:
  traefik: { external: true }
  suivid: {}
```

### Nginx Proxy Manager

Proxy host → `http://<ip-docker>:8080`, onglet SSL → Let's Encrypt +
*Force SSL*.

## 4. Comptes utilisateurs

Les comptes sont stockés dans `/data/users.json` (volume
`suivid-data`) — mots de passe hachés (scrypt), jamais en clair.

- `ALLOW_SIGNUP=true` : bouton « Créer un compte » sur la page de
  connexion — vos clients s'inscrivent directement.
- `ALLOW_SIGNUP=false` : pas d'inscription ouverte ; créez les
  comptes via l'espace **Coach** (`COACH_EMAIL` / `COACH_PASSWORD`
  dans `.env`) ou l'API admin.
- Le compte `COACH_EMAIL` a le rôle `coach` : espace d'administration
  (clients, programmes, bibliothèque d'exercices, sauvegardes).

En mode `sqlite`, chaque client a son espace isolé dans la même base.
En mode `sheets`, chaque utilisateur lie son propre classeur Google
Sheets à la première connexion (partage avec le compte de service →
collage du lien → provisionnement automatique des onglets).

## 5. Fichier de clé de compte de service (option volume)

Si vous préférez `GOOGLE_SERVICE_ACCOUNT_FILE` au JSON inline :

```yaml
# docker-compose.override.yml
services:
  app:
    volumes:
      - /chemin/serveur/sa-key.json:/data/secrets/sa-key.json:ro
    environment:
      GOOGLE_SERVICE_ACCOUNT_FILE: /data/secrets/sa-key.json
```

(Le fichier doit être lisible par le user `node` — `/data` est
`chown node:node` dans l'image.)

## 6. Portainer

1. **Stacks → Add stack** → collez `docker-compose.yml` (ou repo Git).
2. Renseignez les *Environment variables*.
3. *Deploy the stack* — le healthcheck donne l'état dans l'UI.
4. Un `docker-compose.override.yml` peut être fusionné pour Traefik.

## 7. Migration Google Sheets → SQLite

Une fois, pour chaque client encore sur Sheets — depuis la machine
de dev, avec les variables `GOOGLE_*` et `DB_FILE` configurées :

```bash
npm run migrate -w apps/api -- <email-du-client>
```

La commande copie tous les onglets du classeur lié dans SQLite sans
toucher à la source. À exécuter avant de passer `DATA_MODE=sqlite`.

## 8. Mises à jour

```bash
git pull && docker compose up -d --build
```

Ou via GHCR : l'image `ghcr.io/siagutrop/suivid:latest` est publiée
par GitHub Actions à chaque push sur `main` — `docker compose pull &&
docker compose up -d` suffit.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `app` unhealthy au démarrage | `DATA_MODE=sheets` sans identifiants → voir logs |
| `403 Accès refusé par Google` | classeur non partagé avec l'e-mail du compte de service |
| `Onglets manquants` | provisionnement non exécuté |
| `EACCES` / `SQLITE_CANTOPEN` sur `/data` | volume créé avant le fix permissions — recréer le volume ou `chown -R 1000:1000` dessus |
| Page blanche / 502 | reverse proxy pointe sur le mauvais port — l'app écoute sur `PORT` (3001), exposé sur `WEB_PORT` (8080) |
