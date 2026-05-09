#!/usr/bin/env bash
# Mirrors `.github/workflows/ci.yml` for local agents and automation.
# Requires: Docker Compose v2 with `up --wait`, Node 20 on PATH for Playwright.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cleanup() {
  docker compose down -v || true
}
trap cleanup EXIT

docker compose up -d --wait postgres redis
docker compose build backend
docker compose run --rm backend npm run lint
docker compose run --rm backend npm run build
docker compose run --rm backend npm run db:migrate
docker compose run --rm backend npm run db:seed
docker compose run --rm backend npm test
docker compose --profile frontend build frontend
docker compose --profile frontend run --rm frontend npm run lint
docker compose --profile frontend run --rm frontend npm run build
docker compose --profile frontend run --rm frontend npm test

pushd frontend >/dev/null
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
popd >/dev/null
