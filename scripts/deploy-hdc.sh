#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-hdc.sh [options]

Deploy the current checkout to the New Universe Windows Docker host.

This is the active deploy path while the game runs on the purchased-domain
Windows host. It builds Docker-host images on the remote Docker context, updates
the Windows env IMAGE_TAG, runs migrations once, starts API/frontend, then starts
the worker.

Options:
  --environment prod|test  Target Windows env file and compose project. Default: prod.
  --tag TAG                Image tag. Default: hdc-<current-git-short-sha>.
  --remote HOST            SSH host alias for the Windows machine. Default: hdc.
  --docker-context NAME    Docker context for the Windows Docker engine. Default: hdc.
  --root PATH              Windows root directory. Default: D:\new-universe.
  --docker-config PATH     Windows Docker config path. Default: D:\HomeDataCenter\.docker-empty.
  --skip-build             Reuse already-built images for TAG.
  --skip-migrate           Do not run Drizzle migrations/seeders.
  --skip-worker            Leave worker stopped after API/frontend deploy.
  --skip-api-frontend      Do not restart API/frontend.
  --skip-smoke             Do not run public /health smoke checks.
  --check                  Validate local/remote deploy prerequisites and exit.
  --help                   Show this help.
EOF
}

log() {
  printf '[deploy-hdc] %s\n' "$*"
}

die() {
  printf '[deploy-hdc] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

ENVIRONMENT="prod"
REMOTE_HOST="${HDC_REMOTE_HOST:-hdc}"
DOCKER_CONTEXT="${HDC_DOCKER_CONTEXT:-hdc}"
WINDOWS_ROOT="${HDC_WINDOWS_ROOT:-D:\\new-universe}"
WINDOWS_DOCKER_CONFIG="${HDC_WINDOWS_DOCKER_CONFIG:-D:\\HomeDataCenter\\.docker-empty}"
IMAGE_TAG=""
SKIP_BUILD=0
SKIP_MIGRATE=0
SKIP_WORKER=0
SKIP_API_FRONTEND=0
SKIP_SMOKE=0
CHECK_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment)
      [[ $# -ge 2 ]] || die "--environment requires prod or test."
      ENVIRONMENT="$2"
      shift 2
      ;;
    --tag)
      [[ $# -ge 2 ]] || die "--tag requires a value."
      IMAGE_TAG="$2"
      shift 2
      ;;
    --remote)
      [[ $# -ge 2 ]] || die "--remote requires a host."
      REMOTE_HOST="$2"
      shift 2
      ;;
    --docker-context)
      [[ $# -ge 2 ]] || die "--docker-context requires a context name."
      DOCKER_CONTEXT="$2"
      shift 2
      ;;
    --root)
      [[ $# -ge 2 ]] || die "--root requires a Windows path."
      WINDOWS_ROOT="$2"
      shift 2
      ;;
    --docker-config)
      [[ $# -ge 2 ]] || die "--docker-config requires a Windows path."
      WINDOWS_DOCKER_CONFIG="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-migrate)
      SKIP_MIGRATE=1
      shift
      ;;
    --skip-worker)
      SKIP_WORKER=1
      shift
      ;;
    --skip-api-frontend)
      SKIP_API_FRONTEND=1
      shift
      ;;
    --skip-smoke)
      SKIP_SMOKE=1
      shift
      ;;
    --check)
      CHECK_ONLY=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

case "$ENVIRONMENT" in
  prod|test) ;;
  *) die "--environment must be prod or test." ;;
esac

if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  die "This deploy must run from the operator machine, not GitHub Actions."
fi

require_cmd docker
require_cmd git
require_cmd scp
require_cmd ssh
require_cmd curl

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker-host/compose.yml"
remote_repo="$WINDOWS_ROOT\\deploy\\$ENVIRONMENT\\repo"
remote_env="$WINDOWS_ROOT\\env\\$ENVIRONMENT.env"
remote_deploy_ps1="$remote_repo\\infra\\docker-host\\windows\\deploy.ps1"
remote_infra_dir="$remote_repo\\infra\\docker-host"
remote_infra_windows_dir="$remote_infra_dir\\windows"

[[ -f "$compose_file" ]] || die "Compose file not found: $compose_file"

if [[ -z "$IMAGE_TAG" ]]; then
  IMAGE_TAG="hdc-$(git -C "$repo_root" rev-parse --short HEAD)"
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/new-universe-hdc-deploy.XXXXXX")"
build_env="$tmp_dir/build.env"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

fetch_public_remote_env() {
  ssh "$REMOTE_HOST" "powershell -NoProfile -Command \"Get-Content -LiteralPath '$remote_env' | Where-Object { \$_ -match '^(APP_DOMAIN|API_DOMAIN|PUBLIC_FRONTEND_URL|TELEGRAM_APP_URL|VITE_API_URL|VITE_TG_BOT_NAME|VITE_SENTRY_DSN|VITE_SENTRY_TRACES_SAMPLE_RATE|VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE|VITE_SENTRY_REPLAY_ERROR_SAMPLE_RATE|HDC_TUNNEL_NETWORK|TUNNEL_FRONTEND_ALIAS|TUNNEL_API_ALIAS)=' }\""
}

write_build_env() {
  local default_app_domain default_api_domain default_frontend_alias default_api_alias
  if [[ "$ENVIRONMENT" == "prod" ]]; then
    default_app_domain="new-universe.tg-games.com"
    default_api_domain="new-universe-api.tg-games.com"
    default_frontend_alias="nu-prod-frontend"
    default_api_alias="nu-prod-api"
  else
    default_app_domain="test.new-universe.tg-games.com"
    default_api_domain="test-new-universe-api.tg-games.com"
    default_frontend_alias="nu-test-frontend"
    default_api_alias="nu-test-api"
  fi

  cat > "$build_env" <<EOF
NEW_UNIVERSE_ENV=$ENVIRONMENT
COMPOSE_PROJECT_NAME=new-universe-$ENVIRONMENT
IMAGE_TAG=$IMAGE_TAG
BACKEND_IMAGE=new-universe-api:$IMAGE_TAG
FRONTEND_IMAGE=new-universe-frontend:$IMAGE_TAG
MIGRATE_IMAGE=new-universe-migrate:$IMAGE_TAG
APP_DOMAIN=$default_app_domain
API_DOMAIN=$default_api_domain
PUBLIC_FRONTEND_URL=https://$default_app_domain
TELEGRAM_APP_URL=https://$default_app_domain
VITE_API_URL=https://$default_api_domain
VITE_TG_BOT_NAME=new_universe_game_bot
HDC_TUNNEL_NETWORK=hdc-tunnel
TUNNEL_FRONTEND_ALIAS=$default_frontend_alias
TUNNEL_API_ALIAS=$default_api_alias
POSTGRES_USER=nu
POSTGRES_PASSWORD=build-placeholder-password
POSTGRES_DB=new_universe
POSTGRES_DATA_TYPE=volume
POSTGRES_DATA_SOURCE=postgres_data
DATABASE_URL=postgres://nu:build-placeholder-password@postgres:5432/new_universe
REDIS_URL=redis://redis:6379
REDIS_DATA_TYPE=volume
REDIS_DATA_SOURCE=redis_data
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
TELEGRAM_BOT_TOKEN=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd
TELEGRAM_BOT_SECRET=build-placeholder-telegram-secret-32-chars
JWT_SECRET=build-placeholder-jwt-secret-32-chars
SERVER_SECRET=build-placeholder-server-secret-32-chars
RATE_LIMIT_STORE=memory
ENABLE_BULLMQ=true
DIAMOND_STARTING_GRANT=0
DIAMOND_RUSH_PER_MINUTE=1
DIAMOND_RUSH_MAX_PER_ACTION=0
VITE_SENTRY_DSN=
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE=0.01
VITE_SENTRY_REPLAY_ERROR_SAMPLE_RATE=1.0
EOF

  fetch_public_remote_env | tr -d '\r' >> "$build_env"
}

sync_remote_infra() {
  log "Syncing Docker-host infra files to $REMOTE_HOST:$remote_infra_dir"
  ssh "$REMOTE_HOST" "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '$remote_infra_dir' | Out-Null; New-Item -ItemType Directory -Force -Path '$remote_infra_windows_dir' | Out-Null\""

  scp "$repo_root/infra/docker-host/compose.yml" "$REMOTE_HOST:${remote_infra_dir//\\//}/compose.yml"
  scp "$repo_root/infra/docker-host/backend.Dockerfile" "$REMOTE_HOST:${remote_infra_dir//\\//}/backend.Dockerfile"
  scp "$repo_root/infra/docker-host/frontend.Dockerfile" "$REMOTE_HOST:${remote_infra_dir//\\//}/frontend.Dockerfile"
  scp "$repo_root/infra/docker-host/frontend-static-server.mjs" "$REMOTE_HOST:${remote_infra_dir//\\//}/frontend-static-server.mjs"
  scp "$repo_root/infra/docker-host/windows/deploy.ps1" "$REMOTE_HOST:${remote_infra_windows_dir//\\//}/deploy.ps1"
}

run_remote_deploy() {
  local remote_cmd
  remote_cmd="powershell -NoProfile -ExecutionPolicy Bypass -File \"$remote_deploy_ps1\" -Environment \"$ENVIRONMENT\" -Root \"$WINDOWS_ROOT\" -DockerConfig \"$WINDOWS_DOCKER_CONFIG\" -ImageTag \"$IMAGE_TAG\""

  if [[ "$SKIP_MIGRATE" == "1" ]]; then
    remote_cmd+=" -SkipMigrate"
  fi
  if [[ "$SKIP_WORKER" == "1" ]]; then
    remote_cmd+=" -SkipWorker"
  fi
  if [[ "$SKIP_API_FRONTEND" == "1" ]]; then
    remote_cmd+=" -SkipApiFrontend"
  fi
  if [[ "$CHECK_ONLY" == "1" ]]; then
    remote_cmd+=" -CheckOnly"
  fi

  ssh "$REMOTE_HOST" "$remote_cmd"
}

smoke_test() {
  [[ "$SKIP_SMOKE" == "0" ]] || return

  set -a
  # shellcheck disable=SC1090
  source "$build_env"
  set +a

  log "Smoke testing $PUBLIC_FRONTEND_URL/health"
  curl -fsS "$PUBLIC_FRONTEND_URL/health" >/dev/null
  log "Smoke testing $VITE_API_URL/health"
  curl -fsS "$VITE_API_URL/health" >/dev/null
}

log "Deploy target: environment=$ENVIRONMENT host=$REMOTE_HOST docker_context=$DOCKER_CONTEXT tag=$IMAGE_TAG"
write_build_env
sync_remote_infra

if [[ "$CHECK_ONLY" == "1" ]]; then
  log "Validating compose interpolation with generated build env."
  docker --context "$DOCKER_CONTEXT" compose --env-file "$build_env" -f "$compose_file" config >/dev/null
  run_remote_deploy
  log "Check complete."
  exit 0
fi

if [[ "$SKIP_BUILD" == "0" ]]; then
  log "Building Docker images on remote context $DOCKER_CONTEXT"
  docker --context "$DOCKER_CONTEXT" compose --env-file "$build_env" -f "$compose_file" build api frontend migrate
else
  log "Skipping image build; expecting tag $IMAGE_TAG to already exist on $DOCKER_CONTEXT."
fi

run_remote_deploy
smoke_test

log "Deploy complete: $IMAGE_TAG"
