# ─── Stage 1: Install deps (pnpm workspace) ──────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build SvelteKit app ────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=deps /app/node_modules          ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY . .
RUN pnpm run build

# ─── Stage 3: Install web runtime deps via npm (no workspace, no symlinks) ───
# Plain npm install produces real files — no pnpm store symlinks
FROM node:22-alpine AS web-deps
WORKDIR /web-deps
COPY apps/web/package.json ./package.json
COPY docker/app/strip-workspace-deps.mjs ./strip-workspace-deps.mjs
# Strip workspace: references so npm can install the remaining deps
RUN node strip-workspace-deps.mjs
RUN npm install --omit=dev

# ─── Stage 4: Migration runner deps ──────────────────────────────────────────
FROM node:22-alpine AS migrate-deps
WORKDIR /migrate-deps
RUN npm init -y && npm install drizzle-orm postgres @opentelemetry/api --save

# ─── Stage 5: Runner ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
# Container-User mit FESTER uid/gid 1001 (nicht 'node'=1000 des Basis-Images).
# Feste uid ist noetig, damit der Host das gemountete media-Volume korrekt
# chownen kann (chown 1001:1001) und der non-root Prozess dort schreiben darf.
RUN addgroup -S -g 1001 stoqr && adduser -S -u 1001 -G stoqr stoqr
# Media-Verzeichnis (G7): Mountpoint fuer das media-Volume, stoqr-owned,
# damit der non-root User dort Katalog-Bilder ablegen kann.
RUN mkdir -p /data/media && chown -R stoqr:stoqr /data

# SvelteKit build output
COPY --from=builder /app/apps/web/build        ./build
COPY --from=builder /app/apps/web/package.json ./package.json

# Flat, symlink-free node_modules with all web runtime deps
COPY --from=web-deps  /web-deps/node_modules   ./node_modules

# drizzle-orm + postgres for migrate.js, @opentelemetry/api for better-auth
# These are installed via a separate npm stage to guarantee real files (no pnpm symlinks)
COPY --from=migrate-deps /migrate-deps/node_modules/drizzle-orm          ./node_modules/drizzle-orm
COPY --from=migrate-deps /migrate-deps/node_modules/postgres              ./node_modules/postgres
COPY --from=migrate-deps /migrate-deps/node_modules/@opentelemetry        ./node_modules/@opentelemetry

# Drizzle migration files
COPY --from=builder /app/packages/db/drizzle   ./drizzle

# Migration runner + entrypoint
COPY docker/app/migrate.js    ./migrate.js
COPY docker/app/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

USER stoqr
EXPOSE 3000
ENV NODE_ENV=production

# Build-Herkunft (fuer Versionsanzeige / Update-Check). Vom CI als build-args
# gesetzt; Default 'unknown' bei lokalem Build ohne Angabe.
ARG GIT_SHA=unknown
ARG GIT_REF=unknown
ARG BUILD_TIME=unknown
ENV STOQR_GIT_SHA=$GIT_SHA
ENV STOQR_GIT_REF=$GIT_REF
ENV STOQR_BUILD_TIME=$BUILD_TIME

CMD ["./entrypoint.sh"]
