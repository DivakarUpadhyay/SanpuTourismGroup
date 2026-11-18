<#  Before a presentation: starts both APIs for public use and switches both Vercel sites to LIVE mode
    (real bookings, payments, sign-up, approvals and AI). Takes about 3 minutes.
    Usage:  ./scripts/go-live.ps1          then present on https://sanpu-travel.vercel.app and https://sanpu-trip-copilot.vercel.app
            ./scripts/go-live.ps1 -Off     afterwards: back to the offline preview (computer can be switched off) #>
param([switch]$Off)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if ($Off) { node tools/live.mjs off; exit $LASTEXITCODE }

# public settings for the APIs behind Vercel + Cloudflare
$env:Sanpu__TrustForwardedHeaders = 'true'
$env:Sanpu__SecureCookies = 'true'
$env:Sanpu__DevOutboxApi = 'false'   # the local test inbox must never be reachable from the internet
./scripts/dev-api.ps1 -NoStart
$env:ASPNETCORE_ENVIRONMENT = 'Development'
foreach ($a in @(@{ P = 'tour-operations'; U = 'https://sanpu-travel.vercel.app'; L = 'erp' }, @{ P = 'ai-travel'; U = 'https://sanpu-trip-copilot.vercel.app'; L = 'ai' })) {
  $env:Sanpu__PublicBaseUrl = $a.U; $env:Payments__PublicBaseUrl = $a.U
  Start-Process dotnet -ArgumentList 'run','--no-build','--project',"$($a.P)/backend/src/Api",'--launch-profile','http' -WindowStyle Hidden `
    -RedirectStandardOutput "$env:TEMP\$($a.L)-api.log" -RedirectStandardError "$env:TEMP\$($a.L)-api.err"
}
foreach ($p in 5101, 5102) {
  $ok = $false
  for ($i = 0; $i -lt 60 -and -not $ok; $i++) { Start-Sleep 2; try { $ok = (Invoke-WebRequest "http://localhost:$p/api/v1/public/settings" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch {} }
  if (-not $ok) { throw "API on $p did not start (see $env:TEMP\*-api.err)" }
  Write-Host "API on $p is up"
}
# keep the computer awake while live (restored by go-live -Off or a restart)
powercfg /change standby-timeout-ac 0 | Out-Null
node tools/live.mjs on
