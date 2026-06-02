param(
  [ValidateSet("prod", "test")]
  [string]$Environment = "prod",

  [string]$Root = "D:\new-universe",

  [string]$DockerConfig = "D:\HomeDataCenter\.docker-empty",

  [Parameter(Mandatory = $true)]
  [string]$ImageTag,

  [switch]$SkipMigrate,
  [switch]$SkipWorker,
  [switch]$SkipApiFrontend,
  [switch]$NoWait,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

$envFile = Join-Path $Root "env\$Environment.env"
$repoRoot = Join-Path $Root "deploy\$Environment\repo"
$composeDir = Join-Path $repoRoot "infra\docker-host"
$composeFile = Join-Path $composeDir "compose.yml"

function Assert-PathExists {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Required path not found: $Path"
  }
}

function Invoke-Compose {
  param([string[]]$ComposeArgs)

  & docker --config $DockerConfig compose --env-file $envFile -f $composeFile @ComposeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed: $($ComposeArgs -join ' ')"
  }
}

function Set-EnvValue {
  param(
    [string]$Path,
    [string]$Name,
    [string]$Value
  )

  $lines = if (Test-Path -LiteralPath $Path) {
    @(Get-Content -LiteralPath $Path)
  } else {
    @()
  }

  $updated = $false
  $nextLines = foreach ($line in $lines) {
    if ($line -match "^$([regex]::Escape($Name))=") {
      "$Name=$Value"
      $updated = $true
    } else {
      $line
    }
  }

  if (-not $updated) {
    $nextLines += "$Name=$Value"
  }

  Set-Content -LiteralPath $Path -Encoding ASCII -Value $nextLines
}

Assert-PathExists $envFile
Assert-PathExists $composeFile

if ($CheckOnly) {
  Write-Host "Docker-host deploy check passed."
  Write-Host "Environment: $Environment"
  Write-Host "Env file: $envFile"
  Write-Host "Compose file: $composeFile"
  Write-Host "Image tag: $ImageTag"
  exit 0
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$envBackup = "$envFile.before-deploy-$timestamp"
Copy-Item -Force -LiteralPath $envFile -Destination $envBackup
Set-EnvValue -Path $envFile -Name "IMAGE_TAG" -Value $ImageTag

Write-Host "Updated IMAGE_TAG=$ImageTag"
Write-Host "Env backup: $envBackup"

Push-Location $composeDir
try {
  Write-Host "Stopping worker before deploy."
  & docker --config $DockerConfig compose --env-file $envFile -f $composeFile stop worker
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Worker stop returned a non-zero exit code; continuing so first deploys can proceed."
  }

  if (-not $SkipMigrate) {
    Write-Host "Running migrations and seeders."
    Invoke-Compose @("--profile", "tools", "run", "--rm", "migrate")
  } else {
    Write-Host "Skipping migrations and seeders."
  }

  $upArgs = @("up", "-d", "--no-build")
  if (-not $NoWait) {
    $upArgs += "--wait"
  }

  if (-not $SkipApiFrontend) {
    Write-Host "Starting API and frontend."
    Invoke-Compose ($upArgs + @("api", "frontend"))
  } else {
    Write-Host "Skipping API/frontend restart."
  }

  if (-not $SkipWorker) {
    Write-Host "Starting worker."
    Invoke-Compose ($upArgs + @("worker"))
  } else {
    Write-Host "Worker remains stopped by request."
  }
} finally {
  Pop-Location
}

Write-Host "Docker-host deploy complete."
