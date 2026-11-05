# ── Stage 1: Builder ──
FROM node:22-alpine AS builder

RUN apk update && apk upgrade --no-cache && apk add --no-cache openssl

WORKDIR /app

# Enable pnpm — pin version to match packageManager in root package.json
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# Copy monorepo root dependency files first
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# pnpm hashes every patchedDependencies file at install time, even for packages
# the backend filter never installs (expo), so the patches must be present.
COPY patches ./patches/

# Copy backend package.json and prisma schema
COPY apps/backend/package.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma/

# Install ALL dependencies (including devDependencies for build)
# Ignore scripts to prevent external failures on dependencies like missing python/node-gyp
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter backend... --ignore-scripts

# Copy backend source code
COPY apps/backend/ ./apps/backend/

# Generate Prisma Client
RUN cd apps/backend && pnpm exec prisma generate --schema ./prisma/schema.prisma

# Build the application
RUN cd apps/backend && pnpm run build

# ── Stage 2: Production Dependencies ──
# `pnpm deploy` installs the backend's production dependencies from the
# workspace lockfile, so the image ships exactly the versions that were
# resolved, audited and tested — root pnpm.overrides (security patches)
# included. A standalone `pnpm install` from apps/backend/package.json would
# re-resolve everything without the lockfile and without those overrides.
FROM builder AS deps

# Only build scripts allowed by onlyBuiltDependencies run (prisma, sharp…).
# The backend's own postinstall regenerates the Prisma client in /prod.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm --filter backend deploy --prod --frozen-lockfile \
      --config.inject-workspace-packages=true /prod

# Generate Prisma Client for the deployed tree (engines for linux-musl)
RUN cd /prod && pnpm exec prisma generate --schema ./prisma/schema.prisma

# ── Stage 3: Runner (Final Image) ──
FROM node:22-alpine AS runner

# Patch OS-level CVEs (zlib, etc.) + install dumb-init + openssl in a single layer
RUN apk update && apk upgrade --no-cache && apk add --no-cache dumb-init openssl

# Remove npm entirely — not needed at runtime (only node runs dist/main).
# This eliminates all CVEs from npm's bundled deps (tar, minimatch, glob, diff).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Cloud Run sets PORT=8080 automatically; default to 3000 for local use
ENV PORT=3000

# Create a non-root user with an explicit home directory
RUN addgroup -S appgroup && adduser -S appuser -G appgroup -h /home/appuser -D && \
    mkdir -p /home/appuser/.cache /tmp/prisma && \
    chown -R appuser:appgroup /home/appuser /tmp/prisma

ENV HOME=/home/appuser

# Copy built application from builder
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/package.json ./

# Copy production node_modules from deps stage
COPY --from=deps /prod/node_modules ./node_modules

# Copy prisma schema (needed when running migrations from this image)
COPY --from=builder /app/apps/backend/prisma ./prisma

# Copy startup entrypoint script (used for the migration Cloud Run Job)
COPY apps/backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Transfer ownership to non-root user (needed for Prisma engine extraction)
RUN chown -R appuser:appgroup /app

# Use non-root user
USER appuser

# Expose the application port
EXPOSE 3000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Entrypoint: dumb-init ensures graceful shutdown signals are forwarded
ENTRYPOINT ["dumb-init", "--"]

# ── Default CMD: start the application only (NO automatic migrations) ──
# On Cloud Run, migrations are run once before deployment via a Cloud Run Job
# (see cloudbuild.yaml step "migrate").
# For local docker-compose with auto-migrate, override CMD with:
#   command: ["/app/docker-entrypoint.sh", "node", "dist/main"]
CMD ["node", "dist/main"]
