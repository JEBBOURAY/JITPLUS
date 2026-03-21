# ── Stage 1: Builder ──
FROM node:22-alpine AS builder

RUN apk update && apk upgrade --no-cache && apk add --no-cache openssl

# Upgrade npm to patch bundled tar (CVE-2026-26960) and minimatch (CVE-2026-26996)
RUN npm install -g npm@10.9.7

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo root dependency files first
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy backend package.json and prisma schema
COPY apps/backend/package.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma/

# Install ALL dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile --filter backend...

# Copy backend source code
COPY apps/backend/ ./apps/backend/

# Generate Prisma Client
RUN cd apps/backend && pnpm exec prisma generate --schema ./prisma/schema.prisma

# Build the application
RUN cd apps/backend && pnpm run build

# ── Stage 2: Production Dependencies (workspace-aware, uses frozen lockfile) ──
FROM node:22-alpine AS deps

RUN apk update && apk upgrade --no-cache && apk add --no-cache openssl

# Upgrade npm to patch bundled tar (CVE-2026-26960) and minimatch (CVE-2026-26996)
RUN npm install -g npm@10.9.7

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace root (lockfile + root overrides apply here)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy only backend package.json (no other workspace packages needed)
COPY apps/backend/package.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma/

# Install ONLY production dependencies via the frozen workspace lockfile
# --filter backend limits to backend's prod deps; root overrides are applied
RUN pnpm install --frozen-lockfile --filter backend --prod

# Generate Prisma Client (needed for runtime engine binaries)
RUN cd apps/backend && pnpm exec prisma generate --schema ./prisma/schema.prisma

# ── Stage 3: Runner (Final Image) ──
FROM node:22-alpine AS runner

# Patch OS-level CVEs (zlib, etc.)
RUN apk update && apk upgrade --no-cache

# Upgrade npm to patch bundled tar (CVE-2026-26960) and minimatch (CVE-2026-26996)
RUN npm install -g npm@10.9.7

WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Cloud Run sets PORT=8080 automatically; default to 3000 for local use
ENV PORT=3000

# Create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built application from builder
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/package.json ./

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy prisma schema (needed when running migrations from this image)
COPY --from=builder /app/apps/backend/prisma ./prisma

# Copy startup entrypoint script (used for the migration Cloud Run Job)
COPY apps/backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init openssl

# Transfer ownership to non-root user (needed for Prisma engine extraction)
RUN chown -R appuser:appgroup /app

# Use non-root user
USER appuser

# Expose the application port
EXPOSE 3000

# Entrypoint: dumb-init ensures graceful shutdown signals are forwarded
ENTRYPOINT ["dumb-init", "--"]

# ── Default CMD: start the application only (NO automatic migrations) ──
# On Cloud Run, migrations are run once before deployment via a Cloud Run Job
# (see cloudbuild.yaml step "migrate").
# For local docker-compose with auto-migrate, override CMD with:
#   command: ["/app/docker-entrypoint.sh", "node", "dist/main"]
CMD ["node", "dist/main"]
