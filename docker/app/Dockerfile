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
# We extract only the runtime dependencies from apps/web/package.json,
# strip the workspace dep (@stoqr/db — bundled by SvelteKit anyway),
# and run a plain npm install to get a flat, symlink-free node_modules.
FROM node:22-alpine AS web-deps
WORKDIR /web-deps
COPY apps/web/package.json ./package.json
# Remove @stoqr/db workspace reference (bundled into build/index.js by SvelteKit)
# and install only the external runtime deps
RUN node -e "
  const pkg = JSON.parse(require('fs').readFileSync('package.json','utf8'));
  delete pkg.dependencies['@stoqr/db'];
  pkg.devDependencies = {};
  pkg.scripts = {};
  require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"
RUN npm install --omit=dev --prefer-offline 2>/dev/null || npm install --omit=dev

# ─── Stage 4: Migration runner deps ──────────────────────────────────────────
FROM node:22-alpine AS migrate-deps
WORKDIR /migrate-deps
RUN npm init -y && npm install drizzle-orm postgres --save

# ─── Stage 5: Runner ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup -S stoqr && adduser -S stoqr -G stoqr

# SvelteKit build output (self-contained bundle from adapter-node)
COPY --from=builder /app/apps/web/build        ./build
COPY --from=builder /app/apps/web/package.json ./package.json

# Flat, symlink-free node_modules with all web runtime deps
COPY --from=web-deps  /web-deps/node_modules   ./node_modules

# drizzle-orm + postgres for migrate.js (may already be in web-deps, but ensure correct version)
COPY --from=migrate-deps /migrate-deps/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=migrate-deps /migrate-deps/node_modules/postgres     ./node_modules/postgres

# Drizzle migration files
COPY --from=builder /app/packages/db/drizzle   ./drizzle

# Migration runner + entrypoint
COPY docker/app/migrate.js    ./migrate.js
COPY docker/app/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

USER stoqr
EXPOSE 3000
ENV NODE_ENV=production
CMD ["./entrypoint.sh"]
