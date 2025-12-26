# Multi-stage Dockerfile for CatioHaven (Nuxt + Vendure)
# Runs both services in a single container for simplified deployment

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat wget python3 make g++
RUN corepack enable && corepack prepare pnpm@latest --activate

# ===========================================
# Stage 1: Build Vendure
# ===========================================
FROM base AS vendure-builder
WORKDIR /app/vendure

COPY vendure/package.json vendure/package-lock.json ./
RUN npm ci --include=optional

COPY vendure/ ./
RUN npm run build
RUN npm run build:dashboard

# ===========================================
# Stage 2: Build Nuxt Storefront
# ===========================================
FROM base AS storefront-builder
WORKDIR /app/storefront

COPY storefront/package.json storefront/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY storefront/ ./
RUN pnpm build

# ===========================================
# Stage 3: Production Runtime
# ===========================================
FROM base AS production
WORKDIR /app

# Copy Vendure build
COPY --from=vendure-builder /app/vendure/dist ./vendure/dist
COPY --from=vendure-builder /app/vendure/package.json ./vendure/
COPY --from=vendure-builder /app/vendure/package-lock.json ./vendure/
COPY --from=vendure-builder /app/vendure/static ./vendure/static

# Install production dependencies fresh to ensure native modules are built correctly
RUN cd /app/vendure && npm ci --only=production

# Copy Nuxt build
COPY --from=storefront-builder /app/storefront/.output ./storefront/.output
COPY --from=storefront-builder /app/storefront/package.json ./storefront/

# Create startup script that runs both services
# Vendure runs in background on port 3000 (internal only)
# Nuxt runs in foreground on PORT (default 6000) and proxies to Vendure
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo 'echo "Starting Vendure on internal port 3000..."' >> /app/start.sh && \
    echo 'cd /app/vendure && PORT=3000 node dist/index.js &' >> /app/start.sh && \
    echo 'VENDURE_PID=$!' >> /app/start.sh && \
    echo 'sleep 5' >> /app/start.sh && \
    echo 'echo "Starting Nuxt on port ${PORT:-6000}..."' >> /app/start.sh && \
    echo 'cd /app/storefront && NITRO_PORT=${PORT:-6000} NUXT_HOST=0.0.0.0 node .output/server/index.mjs' >> /app/start.sh && \
    chmod +x /app/start.sh

# Environment variables
ENV NODE_ENV=production
ENV PORT=6000

# Health check via Nuxt API endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-6000}/api/health || exit 1

EXPOSE 6000

CMD ["/app/start.sh"]
