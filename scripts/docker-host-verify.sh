#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[docker-host-verify] %s\n' "$*"
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker-host/compose.yml"
tmp_dir="${TMPDIR:-/tmp}/new-universe-docker-host-verify"
env_file="$tmp_dir/verify.env"
docker_context="${DOCKER_CONTEXT:-}"
docker_args=()
if [[ -n "$docker_context" ]]; then
  docker_args+=(--context "$docker_context")
fi

mkdir -p "$tmp_dir"

cat > "$env_file" <<'EOF'
NEW_UNIVERSE_ENV=verify
COMPOSE_PROJECT_NAME=new-universe-infra-verify
IMAGE_TAG=verify
APP_DOMAIN=app.verify.localhost
API_DOMAIN=api.verify.localhost
PUBLIC_FRONTEND_URL=https://app.verify.localhost
TELEGRAM_APP_URL=https://app.verify.localhost
VITE_API_URL=https://api.verify.localhost
VITE_TG_BOT_NAME=NewUniverseVerifyBot
HDC_TUNNEL_NETWORK=new-universe-infra-verify-tunnel
TUNNEL_FRONTEND_ALIAS=nu-verify-frontend
TUNNEL_API_ALIAS=nu-verify-api
POSTGRES_USER=nu
POSTGRES_PASSWORD=verify-password-change-me
POSTGRES_DB=new_universe
DATABASE_URL=postgres://nu:verify-password-change-me@postgres:5432/new_universe
REDIS_URL=redis://redis:6379
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
TELEGRAM_BOT_TOKEN=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd
TELEGRAM_BOT_SECRET=verify-telegram-secret-32-chars-minimum
JWT_SECRET=verify-jwt-secret-32-chars-minimum
SERVER_SECRET=verify-server-secret-32-chars-minimum
RATE_LIMIT_STORE=memory
ENABLE_BULLMQ=true
DIAMOND_STARTING_GRANT=0
DIAMOND_RUSH_PER_MINUTE=1
DIAMOND_RUSH_MAX_PER_ACTION=0
EOF

compose() {
  docker "${docker_args[@]}" compose --env-file "$env_file" -f "$compose_file" "$@"
}

cleanup() {
  if [[ "${RUN_DOCKER_HOST_STACK:-0}" == "1" && "${KEEP_DOCKER_HOST_VERIFY_STACK:-0}" != "1" ]]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
    docker "${docker_args[@]}" network rm new-universe-infra-verify-tunnel >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

log "Validating Compose config"
compose config >/dev/null

if [[ "${RUN_DOCKER_HOST_BUILD:-0}" == "1" ]]; then
  log "Building Docker-host images"
  compose build api frontend migrate
fi

if [[ "${RUN_DOCKER_HOST_STACK:-0}" == "1" ]]; then
  log "Creating isolated tunnel network"
  docker "${docker_args[@]}" network create new-universe-infra-verify-tunnel >/dev/null 2>&1 || true

  log "Starting Postgres and Redis for isolated health checks"
  compose up -d --wait postgres redis
  log "Postgres and Redis are healthy"

  if [[ "${RUN_DOCKER_HOST_BUILD:-0}" == "1" ]]; then
    log "Running migration image against isolated database"
    compose --profile tools run --rm migrate

    log "Starting API and frontend health checks"
    compose up -d --wait api frontend
    compose exec -T api node -e "fetch('http://127.0.0.1:3000/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
    compose exec -T frontend node -e "fetch('http://127.0.0.1:8080/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
    log "API and frontend health checks passed"
  else
    log "Skipping API/frontend start because RUN_DOCKER_HOST_BUILD=1 was not set"
  fi

  if [[ "${KEEP_DOCKER_HOST_VERIFY_STACK:-0}" != "1" ]]; then
    log "Stopping isolated verification stack"
    compose down -v --remove-orphans
    docker "${docker_args[@]}" network rm new-universe-infra-verify-tunnel >/dev/null 2>&1 || true
  else
    log "Keeping verification stack for inspection"
  fi
fi

log "Verification complete"
