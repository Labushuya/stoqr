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
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY . .
RUN pnpm run build

# Stage 3: Build a minimal migration bundle with only drizzle-orm + postgres
# This gives us a clean /migrate-bundle/node_modules that we merge into /app/node_modules
FROM node:22-alpine AS migrate-deps
WORKDIR /migrate-bundle
RUN npm init -y && npm install drizzle-orm postgres --save

# Stage 4: Runner
FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup -S stoqr && adduser -S stoqr -G stoqr

# SvelteKit app build output
COPY --from=builder /app/apps/web/build        ./build
COPY --from=builder /app/apps/web/package.json ./package.json

# SvelteKit runtime node_modules
COPY --from=builder /app/node_modules          ./node_modules

# Merge drizzle-orm + postgres into /app/node_modules
# so they are resolvable from any /app context (including -e eval and migrate.js)
COPY --from=migrate-deps /migrate-bundle/node_modules/drizzle-orm    ./node_modules/drizzle-orm
COPY --from=migrate-deps /migrate-bundle/node_modules/postgres        ./node_modules/postgres

# Drizzle migrations
COPY --from=builder /app/packages/db/drizzle   ./drizzle

# Migration runner (lives in /app, resolves from /app/node_modules)
COPY docker/app/migrate.js ./migrate.js

# Entrypoint
COPY docker/app/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

USER stoqr
EXPOSE 3000
ENV NODE_ENV=production
CMD ["./entrypoint.sh"]
