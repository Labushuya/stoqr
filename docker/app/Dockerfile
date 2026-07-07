# Stage 1: Install all dependencies
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --frozen-lockfile

# Stage 2: Build SvelteKit app
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=deps /app/node_modules          ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY . .
RUN pnpm run build

# Stage 3: pnpm deploy — symlink-free production bundle for @stoqr/web
FROM node:22-alpine AS deployer
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
# Full workspace needed for pnpm deploy to resolve deps
COPY --from=deps /app/node_modules          ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY . .
# pnpm deploy needs the built output present to copy it
COPY --from=builder /app/apps/web/build     ./apps/web/build
# Deploy: copies all prod runtime deps of @stoqr/web flat into /deploy/node_modules
# --no-optional skips optional deps to keep image small
RUN pnpm deploy --filter @stoqr/web --prod /deploy

# Stage 4: minimal migration runner deps
FROM node:22-alpine AS migrate-deps
WORKDIR /migrate-bundle
RUN npm init -y && npm install drizzle-orm postgres --save

# Stage 5: Runner
FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup -S stoqr && adduser -S stoqr -G stoqr

# SvelteKit build + all web runtime deps (symlink-free, flat node_modules)
COPY --from=deployer /deploy/build          ./build
COPY --from=deployer /deploy/node_modules   ./node_modules
COPY --from=deployer /deploy/package.json   ./package.json

# drizzle-orm + postgres for migrate.js
# pnpm deploy resolves @stoqr/web deps; drizzle-orm is in web deps too,
# but we overwrite to ensure the version from migrate-deps is present.
COPY --from=migrate-deps /migrate-bundle/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=migrate-deps /migrate-bundle/node_modules/postgres     ./node_modules/postgres

# Drizzle migration files
COPY --from=builder /app/packages/db/drizzle ./drizzle

# Migration runner + entrypoint
COPY docker/app/migrate.js    ./migrate.js
COPY docker/app/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

USER stoqr
EXPOSE 3000
ENV NODE_ENV=production
CMD ["./entrypoint.sh"]
