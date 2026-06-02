[CmdletBinding()]
param(
  [ValidateSet('prod', 'test')]
  [string]$Environment = 'prod',

  [string]$Root = 'C:\new-universe',

  [string]$Domain = 'tg-games.com',

  [switch]$SkipDockerCheck
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host "[new-universe-host] $Message"
}

$projectName = if ($Environment -eq 'prod') { 'new-universe-prod' } else { 'new-universe-test' }
$appHost = if ($Environment -eq 'prod') { "new-universe.$Domain" } else { "test.new-universe.$Domain" }
$apiHost = if ($Environment -eq 'prod') { "new-universe-api.$Domain" } else { "test-new-universe-api.$Domain" }

$paths = @(
  (Join-Path $Root "backups\postgres\$Environment"),
  (Join-Path $Root "backups\redis\$Environment"),
  (Join-Path $Root "deploy\$Environment"),
  (Join-Path $Root 'env'),
  (Join-Path $Root "logs\$Environment"),
  (Join-Path $Root "state\$Environment"),
  (Join-Path $Root 'tmp')
)

foreach ($path in $paths) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path | Out-Null
    Write-Step "Created $path"
  } else {
    Write-Step "Exists $path"
  }
}

$envPath = Join-Path $Root "env\$Environment.env"
if (-not (Test-Path $envPath)) {
  $envContent = @"
# New Universe $Environment env for the Windows Docker host.
# Fill secrets before deploying. Keep this file outside git.
NEW_UNIVERSE_ENV=$Environment
COMPOSE_PROJECT_NAME=$projectName

APP_DOMAIN=$appHost
API_DOMAIN=$apiHost
PUBLIC_FRONTEND_URL=https://$appHost
TELEGRAM_APP_URL=https://$appHost
VITE_API_URL=https://$apiHost
VITE_TG_BOT_NAME=replace-with-bot-username
HDC_TUNNEL_NETWORK=hdc-tunnel
TUNNEL_FRONTEND_ALIAS=nu-$Environment-frontend
TUNNEL_API_ALIAS=nu-$Environment-api

POSTGRES_USER=nu
POSTGRES_PASSWORD=replace-with-long-random-password
POSTGRES_DB=new_universe
DATABASE_URL=postgres://nu:replace-with-long-random-password@postgres:5432/new_universe
POSTGRES_DATA_TYPE=bind
POSTGRES_DATA_SOURCE=D:/new-universe/state/$Environment/postgres
REDIS_URL=redis://redis:6379
REDIS_DATA_TYPE=bind
REDIS_DATA_SOURCE=D:/new-universe/state/$Environment/redis

NODE_ENV=production
PORT=3000
LOG_LEVEL=info
TELEGRAM_BOT_TOKEN=replace-with-telegram-bot-token
TELEGRAM_BOT_SECRET=replace-with-32-plus-character-webhook-secret
JWT_SECRET=replace-with-32-plus-character-jwt-secret
SERVER_SECRET=replace-with-current-staging-server-secret-if-migrating-existing-worlds
ADMIN_TELEGRAM_IDS=
ADMIN_TELEGRAM_CHAT_IDS=

RATE_LIMIT_STORE=memory
ENABLE_BULLMQ=true
DIAMOND_STARTING_GRANT=0
DIAMOND_RUSH_PER_MINUTE=1
DIAMOND_RUSH_MAX_PER_ACTION=0
SENTRY_DSN=
VITE_SENTRY_DSN=
"@
  Set-Content -Path $envPath -Value $envContent -Encoding UTF8
  Write-Step "Created starter env file $envPath"
} else {
  Write-Step "Env file already exists; not modifying $envPath"
}

if (-not $SkipDockerCheck) {
  Write-Step 'Checking Docker availability'
  try {
    docker version | Out-Host
    docker compose version | Out-Host
  } catch {
    Write-Warning 'Docker or Docker Compose is not available from this shell yet. Install/enable Docker Linux containers before deployment.'
  }

  Write-Step 'Checking WSL status when available'
  try {
    wsl.exe --status | Out-Host
  } catch {
    Write-Warning 'WSL status is unavailable. This is acceptable only if Docker is provided by another Linux container runtime.'
  }
}

Write-Step "Prepared $Environment host skeleton under $Root"
Write-Step "Expected app URL: https://$appHost"
Write-Step "Expected API URL: https://$apiHost"
