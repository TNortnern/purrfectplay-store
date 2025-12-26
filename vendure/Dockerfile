FROM node:20-slim AS builder

WORKDIR /app

# Install all deps including devDeps for build
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production image
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/static ./static

EXPOSE 3000

CMD ["node", "dist/index.js"]
