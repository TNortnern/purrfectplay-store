FROM node:20-slim AS builder

WORKDIR /app

# Install Python for native module builds
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install all deps including devDeps for build
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm run build:dashboard

# Production image
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/static ./static

EXPOSE 3000

CMD ["node", "dist/index.js"]
