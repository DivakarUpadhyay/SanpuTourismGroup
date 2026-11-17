<#  Stops the local dev APIs (ports 5101/5102), rebuilds the solution and starts both APIs again in the background.
    Usage: ./scripts/dev-api.ps1            (logs: $env:TEMP\erp-api.log, $env:TEMP\ai-api.log) #>
param([switch]$NoStart)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
foreach ($p in 5101, 5102) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
Start-Sleep -Seconds 2
dotnet build Sanpu.slnx -v q -nologo
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
if ($NoStart) { return }
$env:ASPNETCORE_ENVIRONMENT = 'Development'
Start-Process dotnet -ArgumentList 'run','--no-build','--project','tour-operations/backend/src/Api','--launch-profile','http' -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\erp-api.log" -RedirectStandardError "$env:TEMP\erp-api.err"
Start-Process dotnet -ArgumentList 'run','--no-build','--project','ai-travel/backend/src/Api','--launch-profile','http' -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\ai-api.log" -RedirectStandardError "$env:TEMP\ai-api.err"
foreach ($p in 5101, 5102) {
  $ok = $false
  for ($i = 0; $i -lt 40 -and -not $ok; $i++) { try { Invoke-WebRequest "http://localhost:$p/swagger/index.html" -UseBasicParsing -TimeoutSec 3 | Out-Null; $ok = $true } catch { Start-Sleep -Milliseconds 500 } }
  if ($ok) { "API on $p is up" } else { "API on $p did not start (see logs)" }
}
