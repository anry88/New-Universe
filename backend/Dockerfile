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
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "dev"]


# ============ BUILD ============
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --production


# ============ PROD ============
FROM node:20-alpine AS prod
WORKDIR /app

RUN apk add --no-cache tini && rm -rf /var/cache/apk/*

# Не root
RUN addgroup -S nu && adduser -S nu -G nu
USER nu

COPY --from=build --chown=nu:nu /app/node_modules ./node_modules
COPY --from=build --chown=nu:nu /app/dist ./dist
COPY --from=build --chown=nu:nu /app/package.json ./package.json

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
