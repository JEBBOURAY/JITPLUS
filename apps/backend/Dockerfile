# ── Stage 1: Builder ──
FROM node:20-alpine AS builder

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

# ── Stage 2: Production Dependencies ──
FROM node:20-alpine AS deps

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo root dependency files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy backend package.json and prisma schema
COPY apps/backend/package.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma/

# Install ONLY production dependencies
RUN pnpm install --prod --frozen-lockfile --filter backend...

# Generate Prisma Client (needed for runtime)
RUN cd apps/backend && pnpm exec prisma generate --schema ./prisma/schema.prisma

# ── Stage 3: Runner (Final Image) ──
FROM node:20-alpine AS runner

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

# Copy production dependencies from deps stage
COPY --from=deps /app/apps/backend/node_modules ./node_modules
# Copy generated Prisma Client
COPY --from=deps /app/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/apps/backend/node_modules/@prisma ./node_modules/@prisma

# Copy prisma schema (needed when running migrations from this image)
COPY --from=builder /app/apps/backend/prisma ./prisma

# Copy startup entrypoint script (used for the migration Cloud Run Job)
COPY apps/backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init

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
