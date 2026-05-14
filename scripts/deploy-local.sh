#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-local.sh [options]

Local fallback for the GitHub Actions deploy workflow. It deploys Fly API/worker
from the current checkout and can optionally upload the frontend to Cloudflare
Pages. Secrets are read from the environment or an explicit env file.

Options:
  --env-file PATH       Load deployment variables from PATH before running.
  --full               Deploy API, worker, and Cloudflare Pages frontend.
  --check-env          Validate local deploy environment and exit.
  --skip-db            Do not run Drizzle migrate/seed.
  --skip-migrate       Do not run Drizzle migrations.
  --skip-seed          Do not run seeders.
  --skip-secrets       Do not stage Fly runtime secrets.
  --frontend           Build and deploy Cloudflare Pages.
  --skip-frontend      Do not deploy Cloudflare Pages.
  --help               Show this help.

Common environment:
  DATABASE_URL or DATABASE_URL_FILE     Target Postgres URL or file containing it.
  SENTRY_DSN                           Optional backend Sentry DSN.
  FLY_API_APP                          Default: new-universe-api-staging.
  FLY_WORKER_APP                       Default: new-universe-worker-staging.
  FLY_PRIMARY_REGION                   Default: ams.
  SYNC_SECRET_NAMES                    Default: "DATABASE_URL SENTRY_DSN".
  DEPLOY_FRONTEND                      1 to deploy Pages, 0 to skip.

Frontend environment when DEPLOY_FRONTEND=1:
  CLOUDFLARE_API_TOKEN                 Optional when locally logged in to Wrangler.
  CLOUDFLARE_ACCOUNT_ID                Optional when locally logged in to Wrangler.
  CLOUDFLARE_PAGES_PROJECT             Default: new-universe-staging.
  FRONTEND_PAGES_BRANCH                Default: main.
  VITE_API_URL                         Default: https://$FLY_API_APP.fly.dev.
  VITE_TG_BOT_NAME                     Default: new_universe_game_bot.
  VITE_SENTRY_DSN                      Optional frontend Sentry DSN.
EOF
}

log() {
  printf '[deploy-local] %s\n' "$*"
}

die() {
  printf '[deploy-local] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

load_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || die "Env file not found: $env_file"
  ENV_FILE_HAS_DATABASE_URL=0
  ENV_FILE_HAS_DATABASE_URL_FILE=0

  local line name value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue

    if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      name="${BASH_REMATCH[2]}"
      value="${BASH_REMATCH[3]}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ "${#value}" -ge 2 ]]; then
        if [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
          value="${value:1:${#value}-2}"
        elif [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
          value="${value:1:${#value}-2}"
        fi
      fi

      printf -v "$name" '%s' "$value"
      export "$name"

      if [[ "$name" == "DATABASE_URL" ]]; then
        ENV_FILE_HAS_DATABASE_URL=1
      elif [[ "$name" == "DATABASE_URL_FILE" ]]; then
        ENV_FILE_HAS_DATABASE_URL_FILE=1
      fi
    else
      die "Unsupported env-file line: $env_file"
    fi
  done < "$env_file"
}

render_fly_configs() {
  local context_dir="$1"

  cat > "$context_dir/fly-api.generated.toml" <<EOF
app = "$FLY_API_APP"
primary_region = "$FLY_PRIMARY_REGION"
kill_signal = "SIGTERM"
kill_timeout = 30

[build]
  dockerfile = "Dockerfile"
  build-target = "prod"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[deploy]
  strategy = "rolling"
  wait_timeout = "10m"

[processes]
  app = "node dist/index.js"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
  cpus = 1
  cpu_kind = "shared"
EOF

  cat > "$context_dir/fly-worker.generated.toml" <<EOF
app = "$FLY_WORKER_APP"
primary_region = "$FLY_PRIMARY_REGION"
kill_signal = "SIGTERM"
kill_timeout = 60

[build]
  dockerfile = "Dockerfile"
  build-target = "prod"

[env]
  NODE_ENV = "production"

[deploy]
  strategy = "rolling"
  wait_timeout = "10m"

[processes]
  app = "npm run worker"

[[restart]]
  policy = "always"
  retries = 10
  processes = ["app"]

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
  cpus = 1
  cpu_kind = "shared"
EOF
}

copy_backend_context() {
  local context_dir="$1"

  mkdir -p "$context_dir"
  rsync -a --delete \
    --exclude node_modules \
    --exclude dist \
    --exclude coverage \
    --exclude '*.generated.toml' \
    backend/ "$context_dir/"

  rm -rf "$context_dir/shared"
  rsync -a --delete shared/ "$context_dir/shared/"
  render_fly_configs "$context_dir"
}

copy_frontend_context() {
  local context_dir="$1"

  mkdir -p "$context_dir"
  rsync -a --delete \
    --exclude node_modules \
    --exclude dist \
    --exclude coverage \
    --exclude test-results \
    frontend/ "$context_dir/"

  rm -rf "$context_dir/shared"
  rsync -a --delete shared/ "$context_dir/shared/"
}

stage_fly_secrets() {
  [[ "$SYNC_FLY_SECRETS" == "1" ]] || {
    log "Skipping Fly secret sync."
    return
  }

  local -a secret_args=()
  local name value
  for name in $SYNC_SECRET_NAMES; do
    if [[ -n "${!name:-}" ]]; then
      value="${!name}"
      secret_args+=("$name=$value")
    fi
  done

  ((${#secret_args[@]} > 0)) || die "No Fly secrets selected for sync. Set SYNC_SECRET_NAMES or --skip-secrets."

  log "Staging Fly secrets for $FLY_API_APP and $FLY_WORKER_APP: $SYNC_SECRET_NAMES"
  flyctl secrets set --stage --app "$FLY_API_APP" "${secret_args[@]}"
  flyctl secrets set --stage --app "$FLY_WORKER_APP" "${secret_args[@]}"
}

scale_worker_down() {
  log "Scaling worker $FLY_WORKER_APP to 0 before database work."
  set +e
  local output
  output="$(flyctl scale count 0 --app "$FLY_WORKER_APP" --yes 2>&1)"
  local status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    printf '%s\n' "$output"
    return
  fi

  if grep -qiE 'No machines configured|could not create a fly.toml from any machines' <<<"$output"; then
    printf '%s\n' "$output"
    log "Worker app has no Machines yet; continuing."
    return
  fi

  printf '%s\n' "$output" >&2
  return "$status"
}

run_database_steps() {
  [[ "$RUN_DB_STEPS" == "1" ]] || {
    log "Skipping database migrate/seed."
    return
  }

  require_cmd docker

  local command='npm ci'
  if [[ "$RUN_MIGRATIONS" == "1" ]]; then
    command+=' && npm run db:migrate'
  fi
  if [[ "$RUN_SEED" == "1" ]]; then
    command+=' && npm run db:seed'
  fi

  log "Running database steps in Node 20 container. migrate=$RUN_MIGRATIONS seed=$RUN_SEED"
  docker run --rm \
    -e DATABASE_URL \
    -v "$BACKEND_CONTEXT:/app" \
    -w /app \
    node:20-alpine \
    sh -lc "$command"
}

deploy_fly_apps() {
  log "Deploying API app $FLY_API_APP with release label $RELEASE_TAG."
  (
    cd "$BACKEND_CONTEXT"
    flyctl deploy . \
      --config fly-api.generated.toml \
      --remote-only \
      --image-label "$RELEASE_TAG" \
      --strategy rolling \
      --yes
  )

  log "Deploying worker app $FLY_WORKER_APP with release label $RELEASE_TAG."
  (
    cd "$BACKEND_CONTEXT"
    flyctl deploy . \
      --config fly-worker.generated.toml \
      --remote-only \
      --image-label "$RELEASE_TAG" \
      --strategy rolling \
      --yes
  )

  log "Scaling worker $FLY_WORKER_APP back to 1."
  flyctl scale count 1 --app "$FLY_WORKER_APP" --yes
  ensure_worker_running
}

ensure_worker_running() {
  local machines_json started_id fallback_id
  machines_json="$(flyctl machine list --app "$FLY_WORKER_APP" --json)"
  started_id="$(printf '%s' "$machines_json" | node -e 'const fs = require("fs"); const machines = JSON.parse(fs.readFileSync(0, "utf8")); const machine = machines.find((item) => item.state === "started"); if (machine) process.stdout.write(machine.id);')"

  if [[ -n "$started_id" ]]; then
    log "Worker machine is running: $started_id"
    return
  fi

  fallback_id="$(printf '%s' "$machines_json" | node -e 'const fs = require("fs"); const machines = JSON.parse(fs.readFileSync(0, "utf8")); const machine = machines[0]; if (machine) process.stdout.write(machine.id);')"
  [[ -n "$fallback_id" ]] || die "Worker deploy produced no machines for $FLY_WORKER_APP."

  log "No started worker machine found; starting $fallback_id."
  flyctl machine start "$fallback_id" --app "$FLY_WORKER_APP"
}

deploy_frontend() {
  [[ "$DEPLOY_FRONTEND" == "1" ]] || {
    log "Skipping Cloudflare Pages deploy."
    return
  }

  require_cmd docker
  require_cmd npx

  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    log "CLOUDFLARE_API_TOKEN is not set; using local Wrangler auth session."
    npx wrangler@latest whoami >/dev/null
  fi

  log "Building frontend in Node 22 container for $VITE_API_URL."
  docker run --rm \
    -e VITE_API_URL \
    -e VITE_TG_BOT_NAME \
    -e VITE_SENTRY_DSN \
    -v "$FRONTEND_CONTEXT:/app" \
    -w /app \
    node:22-alpine \
    sh -lc 'npm ci && npm run build'

  log "Deploying Cloudflare Pages project $CLOUDFLARE_PAGES_PROJECT branch $FRONTEND_PAGES_BRANCH."
  npx wrangler@latest pages deploy "$FRONTEND_CONTEXT/dist" \
    --project-name "$CLOUDFLARE_PAGES_PROJECT" \
    --branch "$FRONTEND_PAGES_BRANCH" \
    --commit-hash "$GIT_SHA" \
    --commit-message "$RELEASE_TAG" \
    --commit-dirty=true
}

smoke_test() {
  [[ "$RUN_SMOKE_TEST" == "1" ]] || return

  require_cmd curl
  log "Smoke testing $API_URL/health."
  curl -fsS "$API_URL/health" >/dev/null
  log "Health check passed."
}

ENV_FILE=""
ENV_FILE_HAS_DATABASE_URL=0
ENV_FILE_HAS_DATABASE_URL_FILE=0
CHECK_ENV=0
RUN_DB_STEPS=1
RUN_MIGRATIONS=1
RUN_SEED=1
SYNC_FLY_SECRETS=1
DEPLOY_FRONTEND="${DEPLOY_FRONTEND:-0}"
RUN_SMOKE_TEST="${RUN_SMOKE_TEST:-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      [[ $# -ge 2 ]] || die "--env-file requires a path."
      ENV_FILE="$2"
      shift 2
      ;;
    --full)
      DEPLOY_FRONTEND=1
      shift
      ;;
    --check-env)
      CHECK_ENV=1
      shift
      ;;
    --skip-db)
      RUN_DB_STEPS=0
      shift
      ;;
    --skip-migrate)
      RUN_MIGRATIONS=0
      shift
      ;;
    --skip-seed)
      RUN_SEED=0
      shift
      ;;
    --skip-secrets)
      SYNC_FLY_SECRETS=0
      shift
      ;;
    --frontend)
      DEPLOY_FRONTEND=1
      shift
      ;;
    --skip-frontend)
      DEPLOY_FRONTEND=0
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

[[ -z "$ENV_FILE" ]] || load_env_file "$ENV_FILE"

require_cmd git
require_cmd rsync
require_cmd flyctl

FLY_API_APP="${FLY_API_APP:-new-universe-api-staging}"
FLY_WORKER_APP="${FLY_WORKER_APP:-new-universe-worker-staging}"
FLY_PRIMARY_REGION="${FLY_PRIMARY_REGION:-ams}"
CLOUDFLARE_PAGES_PROJECT="${CLOUDFLARE_PAGES_PROJECT:-new-universe-staging}"
FRONTEND_PAGES_BRANCH="${FRONTEND_PAGES_BRANCH:-main}"
API_URL="${API_URL:-https://${FLY_API_APP}.fly.dev}"
VITE_API_URL="${VITE_API_URL:-$API_URL}"
VITE_TG_BOT_NAME="${VITE_TG_BOT_NAME:-new_universe_game_bot}"
VITE_SENTRY_DSN="${VITE_SENTRY_DSN:-}"
SYNC_SECRET_NAMES="${SYNC_SECRET_NAMES:-DATABASE_URL SENTRY_DSN}"

if [[ -n "$ENV_FILE" && "$ENV_FILE_HAS_DATABASE_URL" == "0" && "$ENV_FILE_HAS_DATABASE_URL_FILE" == "1" && -n "${DATABASE_URL:-}" && "$DATABASE_URL" =~ (localhost|127\.0\.0\.1|::1) ]]; then
  unset DATABASE_URL
fi

if [[ -z "${DATABASE_URL:-}" && -n "${DATABASE_URL_FILE:-}" ]]; then
  [[ -f "$DATABASE_URL_FILE" ]] || die "DATABASE_URL_FILE not found: $DATABASE_URL_FILE"
  DATABASE_URL="$(<"$DATABASE_URL_FILE")"
  export DATABASE_URL
fi

[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL or DATABASE_URL_FILE is required."
DATABASE_HOST="$(node -e 'try { console.log(new URL(process.env.DATABASE_URL).hostname) } catch { process.exit(1) }')" || die "DATABASE_URL is not a valid URL. Quote it in the env file if it contains '&'."
log "Using DATABASE_URL host: $DATABASE_HOST"
if [[ "$DATABASE_URL" =~ (localhost|127\.0\.0\.1|::1) && "${ALLOW_LOCAL_DATABASE_URL:-0}" != "1" ]]; then
  if [[ -n "$ENV_FILE" && "$ENV_FILE_HAS_DATABASE_URL" == "0" ]]; then
    die "DATABASE_URL looks local and was inherited from your shell, not set by $ENV_FILE. Set DATABASE_URL or DATABASE_URL_FILE in the env file, or run with 'env -u DATABASE_URL ...'."
  fi
  die "DATABASE_URL looks local. Refusing to deploy unless ALLOW_LOCAL_DATABASE_URL=1."
fi
if [[ "$DEPLOY_FRONTEND" == "1" && "$VITE_API_URL" =~ (localhost|127\.0\.0\.1|::1|trycloudflare\.com) && "${ALLOW_PREVIEW_VITE_API_URL:-0}" != "1" ]]; then
  die "VITE_API_URL looks like a local/preview URL. Refusing frontend deploy unless ALLOW_PREVIEW_VITE_API_URL=1."
fi

if [[ "$CHECK_ENV" == "1" ]]; then
  log "Config check passed."
  log "Fly API app: $FLY_API_APP"
  log "Fly worker app: $FLY_WORKER_APP"
  log "Frontend deploy: $DEPLOY_FRONTEND"
  log "VITE_API_URL: $VITE_API_URL"
  log "Cloudflare Pages project: $CLOUDFLARE_PAGES_PROJECT"
  exit 0
fi

GIT_SHA="$(git rev-parse HEAD)"
GIT_SHORT_SHA="$(git rev-parse --short HEAD)"
RELEASE_TAG="${RELEASE_TAG:-local-staging-$(date -u +%Y%m%d%H%M%S)-$GIT_SHORT_SHA}"
DEPLOY_ROOT="${DEPLOY_ROOT:-$(mktemp -d "${TMPDIR:-/tmp}/new-universe-local-deploy.XXXXXX")}"
BACKEND_CONTEXT="$DEPLOY_ROOT/backend"
FRONTEND_CONTEXT="$DEPLOY_ROOT/frontend"

cleanup() {
  if [[ "${KEEP_DEPLOY_CONTEXT:-0}" != "1" ]]; then
    rm -rf "$DEPLOY_ROOT"
  else
    log "Keeping deploy context: $DEPLOY_ROOT"
  fi
}
trap cleanup EXIT

log "Preparing temporary deploy context at $DEPLOY_ROOT."
copy_backend_context "$BACKEND_CONTEXT"
if [[ "$DEPLOY_FRONTEND" == "1" ]]; then
  copy_frontend_context "$FRONTEND_CONTEXT"
fi

stage_fly_secrets
scale_worker_down
run_database_steps
deploy_fly_apps
deploy_frontend
smoke_test

log "Deploy complete: $RELEASE_TAG"
