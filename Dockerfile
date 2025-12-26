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

# Accept build args for public config (needed for prerendering)
ARG NUXT_PUBLIC_POSTHOG_KEY
ENV NUXT_PUBLIC_POSTHOG_KEY=${NUXT_PUBLIC_POSTHOG_KEY}

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

# Create startup script with MODE support
# MODE=vendure  → only run Vendure API on PORT
# MODE=storefront → only run Nuxt on PORT
# MODE=unified or unset → run both (Vendure on 3000, Nuxt on PORT)
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo 'if [ "$MODE" = "vendure" ]; then' >> /app/start.sh && \
    echo '  echo "MODE=vendure: Starting Vendure API on port ${PORT:-3000}..."' >> /app/start.sh && \
    echo '  cd /app/vendure && node dist/index.js' >> /app/start.sh && \
    echo 'elif [ "$MODE" = "storefront" ]; then' >> /app/start.sh && \
    echo '  echo "MODE=storefront: Starting Nuxt on port ${PORT:-3000}..."' >> /app/start.sh && \
    echo '  cd /app/storefront && NITRO_PORT=${PORT:-3000} NUXT_HOST=0.0.0.0 node .output/server/index.mjs' >> /app/start.sh && \
    echo 'else' >> /app/start.sh && \
    echo '  echo "MODE=unified: Starting both services..."' >> /app/start.sh && \
    echo '  echo "Starting Vendure on internal port 3000..."' >> /app/start.sh && \
    echo '  cd /app/vendure && PORT=3000 node dist/index.js &' >> /app/start.sh && \
    echo '  sleep 5' >> /app/start.sh && \
    echo '  echo "Starting Nuxt on port ${PORT:-6000}..."' >> /app/start.sh && \
    echo '  cd /app/storefront && NITRO_PORT=${PORT:-6000} NUXT_HOST=0.0.0.0 node .output/server/index.mjs' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    chmod +x /app/start.sh

# Environment variables
ENV NODE_ENV=production

# Expose common ports
EXPOSE 3000 6000

CMD ["/app/start.sh"]
