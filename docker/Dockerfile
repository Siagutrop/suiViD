# ---------- Build web ----------
# Vite produit le bundle statique servi ensuite par l'API.
FROM node:20-alpine AS build-web
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --no-audit --no-fund

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build -w apps/web

# ---------- Build api ----------
# node:XX-slim (glibc) requis : better-sqlite3 télécharge un binaire
# natif précompilé — pas de prebuild musl pour Alpine.
FROM node:20-slim AS build-api
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build -w apps/api

# ---------- Runtime ----------
# Un seul conteneur : l'API Fastify sert l'UI statique (WEB_DIST)
# en plus des routes /api/*.
FROM node:20-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace=apps/api --include-workspace-root=false --no-audit --no-fund \
  && npm cache clean --force

COPY --from=build-api /app/apps/api/dist ./apps/api/dist
COPY --from=build-web /app/apps/web/dist ./public

ENV WEB_DIST=/app/public
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
