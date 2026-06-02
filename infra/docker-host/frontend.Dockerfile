# Production frontend image for Docker-host deployments.
# Build context: repository root.

FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL
ARG VITE_TG_BOT_NAME
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
ARG VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE=0.01
ARG VITE_SENTRY_REPLAY_ERROR_SAMPLE_RATE=1.0

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_TG_BOT_NAME=$VITE_TG_BOT_NAME
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_TRACES_SAMPLE_RATE=$VITE_SENTRY_TRACES_SAMPLE_RATE
ENV VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE=$VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE
ENV VITE_SENTRY_REPLAY_ERROR_SAMPLE_RATE=$VITE_SENTRY_REPLAY_ERROR_SAMPLE_RATE

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci \
    --fetch-retries=5 \
    --fetch-retry-factor=2 \
    --fetch-retry-mintimeout=10000 \
    --fetch-retry-maxtimeout=120000 \
    --no-audit \
    --no-fund

COPY frontend/ ./
COPY shared/ ./shared/

RUN npm run build

FROM node:20-alpine AS prod

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/dist ./dist
COPY infra/docker-host/frontend-static-server.mjs ./server.mjs

EXPOSE 8080

CMD ["node", "server.mjs"]
