<#
.SYNOPSIS
  Runs the Playwright end-to-end suite against a real, isolated stack:
  fresh *_E2E databases -> demo users with random passwords -> both ASP.NET Core APIs (Development, ports 5201/5202)
  -> production builds of both Next.js apps (ports 3201/3202) -> Playwright (installed Chrome) -> everything stopped again.
  Your dev databases (SanpuErp / SanpuAiOps) are never touched.
.EXAMPLE
  ./scripts/e2e.ps1 -Server ".\SQLEXPRESS"
  ./scripts/e2e.ps1 -SkipBuild -Grep "booking"
#>
param(
  [string]$Server = $(if ($env:SANPU_SQL_SERVER) { $env:SANPU_SQL_SERVER } else { 'localhost' }),
  [switch]$SkipBuild,
  [string]$Grep = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$auth = Join-Path $root 'tests/e2e/.auth'
New-Item -ItemType Directory -Force $auth | Out-Null
$procs = @()

$apps = @(
  @{ Name = 'erp'; Db = 'SanpuErp_E2E'; Api = "$root/tour-operations/backend/src/Api"; Dll = 'Divakar.Sanpu.Erp.Api.dll'; ApiPort = 5201; Web = "$root/tour-operations/frontend"; WebPort = 3201 },
  @{ Name = 'ai'; Db = 'SanpuAiOps_E2E'; Api = "$root/ai-travel/backend/src/Api"; Dll = 'Divakar.Sanpu.AiOps.Api.dll'; ApiPort = 5202; Web = "$root/ai-travel/frontend"; WebPort = 3202 }
)

function Wait-Url([string]$url, [int]$seconds = 120) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try { $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5; if ($r.StatusCode -lt 500) { return } } catch { Start-Sleep -Milliseconds 800 }
  }
  throw "Timed out waiting for $url"
}

try {
  dotnet build "$root/Sanpu.slnx" -v q -nologo | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'dotnet build failed' }
  foreach ($a in $apps) {
    & "$PSScriptRoot/db-setup.ps1" -App $a.Name -Database $a.Db -Server $Server -Reset | Out-Null
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:ConnectionStrings__Sanpu = "Server=$Server;Database=$($a.Db);Integrated Security=True;TrustServerCertificate=True;Encrypt=True;Application Name=SanpuE2E"
    $env:Sanpu__PublicBaseUrl = "http://localhost:$($a.WebPort)"
    $env:Sanpu__CorsOrigins__0 = "http://localhost:$($a.WebPort)"
    $env:Sanpu__AuthRequestsPerMinute = '2000'
    $env:Payments__Provider = 'Simulated'   # automated tests never call an external gateway
    $env:Sanpu__DocumentRoot = Join-Path $root "storage/e2e-$($a.Name)"
    $bin = Join-Path $a.Api 'bin/Debug/net10.0'
    Push-Location $a.Api
    dotnet (Join-Path $bin $a.Dll) provision-demo-users --out (Join-Path $auth "$($a.Name).logins.txt") | Out-Null
    Pop-Location
    $env:ASPNETCORE_URLS = "http://localhost:$($a.ApiPort)"
    $procs += Start-Process dotnet -ArgumentList "`"$(Join-Path $bin $a.Dll)`"" -WorkingDirectory $a.Api -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $auth "$($a.Name)-api.log") -RedirectStandardError (Join-Path $auth "$($a.Name)-api.err")
  }
  foreach ($a in $apps) { Wait-Url "http://localhost:$($a.ApiPort)/health" }

  foreach ($a in $apps) {
    $env:API_URL = "http://localhost:$($a.ApiPort)"
    if (-not $SkipBuild) {
      Push-Location $a.Web; npx next build | Out-Host; $ok = $LASTEXITCODE; Pop-Location
      if ($ok -ne 0) { throw "next build failed for $($a.Name)" }
    }
    $procs += Start-Process cmd -ArgumentList "/c npx next start -p $($a.WebPort)" -WorkingDirectory $a.Web -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $auth "$($a.Name)-web.log") -RedirectStandardError (Join-Path $auth "$($a.Name)-web.err")
  }
  foreach ($a in $apps) { Wait-Url "http://localhost:$($a.WebPort)/login" }

  $env:SANPU_E2E_SERVER = $Server
  Remove-Item Env:FORCE_COLOR -ErrorAction SilentlyContinue
  Push-Location $root
  $grepArg = if ($Grep) { " -g `"$Grep`"" } else { "" }
  # run through cmd so Node warnings on stderr are not treated as PowerShell errors; the exit code is Playwright's
  cmd /c "npx playwright test -c tests/e2e/playwright.config.ts$grepArg 2>&1"
  $code = $LASTEXITCODE
  Write-Host "Playwright exit code: $code (HTML report: tests/e2e/report/index.html)"

  # OpenAPI export from the running APIs -> Postman collections -> Newman smoke suites
  New-Item -ItemType Directory -Force (Join-Path $root 'artifacts/openapi') | Out-Null
  Invoke-WebRequest -UseBasicParsing http://localhost:5201/openapi/v1.json -OutFile (Join-Path $root 'artifacts/openapi/project-a.json')
  Invoke-WebRequest -UseBasicParsing http://localhost:5202/openapi/v1.json -OutFile (Join-Path $root 'artifacts/openapi/project-b.json')
  cmd /c "node tools/build-postman.mjs 2>&1"
  cmd /c "node tools/run-newman.mjs 2>&1"
  $newman = $LASTEXITCODE
  Write-Host "Newman exit code: $newman"
  Pop-Location
  exit ([Math]::Max($code, $newman))
}
finally {
  foreach ($p in $procs) { try { taskkill /PID $p.Id /T /F 2>$null | Out-Null } catch { } }
  Remove-Item Env:ConnectionStrings__Sanpu, Env:ASPNETCORE_URLS, Env:API_URL -ErrorAction SilentlyContinue
}
