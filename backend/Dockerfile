# Multi-stage Dockerfile для Backend
# Цели:
#   dev   — для docker-compose (с hot reload)
#   build — компиляция TS
#   prod  — минимальный финальный образ

# ============ DEV ============
FROM node:20-alpine AS dev
WORKDIR /app

# Зависимости системы
RUN apk add --no-cache python3 make g++ tini && rm -rf /var/cache/apk/*

# Сначала зависимости (для лучшего кэша слоёв)
COPY package.json package-lock.json* ./
RUN npm ci

# Дальше код будет монтироваться через volume в compose
# (чтобы не пересобирать образ на каждое изменение)
COPY . .

ENV NODE_ENV=development
EXPOSE 3000

# tini как PID 1 — корректная обработка сигналов
ENTRYPOINT ["/sbin/tini", "-s", "--"]
CMD ["npm", "run", "dev"]


# ============ BUILD ============
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build \
    && if [ -d dist/src ]; then cp -R dist/src/. dist/; fi \
    && if [ -d dist/backend/src ]; then cp -R dist/backend/src/. dist/; fi \
    && npm prune --production


# ============ PROD ============
FROM node:20-alpine AS prod
WORKDIR /app

RUN apk add --no-cache tini && rm -rf /var/cache/apk/*

RUN addgroup -S nu && adduser -S nu -G nu

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

RUN if [ -d dist/shared ]; then \
      mkdir -p node_modules/@shared; \
      cp -R dist/shared/* node_modules/@shared/; \
      for pkg in node_modules/@shared/*; do \
        if [ -d "$pkg" ]; then printf '{"type":"module"}\n' > "$pkg/package.json"; fi; \
      done; \
    fi \
    && chown -R nu:nu /app

ENV NODE_ENV=production
EXPOSE 3000

# Не root
USER nu

ENTRYPOINT ["/sbin/tini", "-s", "--"]
CMD ["node", "dist/index.js"]
