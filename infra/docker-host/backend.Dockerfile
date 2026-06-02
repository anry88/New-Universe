# Production backend/worker image for Docker-host deployments.
# Build context: repository root.

FROM node:20-alpine AS deps
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci \
    --fetch-retries=5 \
    --fetch-retry-factor=2 \
    --fetch-retry-mintimeout=10000 \
    --fetch-retry-maxtimeout=120000 \
    --no-audit \
    --no-fund

FROM deps AS build

COPY backend/ ./
COPY shared/ ./shared/

RUN npm run build \
    && if [ -d dist/src ]; then cp -R dist/src/. dist/; fi \
    && if [ -d dist/backend/src ]; then cp -R dist/backend/src/. dist/; fi

FROM deps AS prod-deps
RUN npm prune --production

FROM deps AS migrate

COPY backend/ ./
COPY shared/ ./shared/

ENV NODE_ENV=production
CMD ["sh", "-lc", "npm run db:migrate && npm run db:seed"]

FROM node:20-alpine AS prod
WORKDIR /app

RUN apk add --no-cache tini \
    && addgroup -S nu \
    && adduser -S nu -G nu

COPY --from=prod-deps /app/node_modules ./node_modules
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

USER nu

ENTRYPOINT ["/sbin/tini", "-s", "--"]
CMD ["node", "dist/index.js"]
